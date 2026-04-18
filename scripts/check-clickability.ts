import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { resolve, join, basename } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'

interface MemberInput {
  slug: string
  name: string
  url: string
  active?: boolean
}

export type LinkRole = 'prev' | 'next' | 'home' | 'unknown'
export type ViewportName = 'mobile' | 'desktop'
export type MemberStatus = 'ok' | 'widget_missing' | 'covered' | 'site_error'

export interface LinkResult {
  href: string
  role: LinkRole
  viewport: ViewportName
  clickable: boolean
  obstructor?: { tag: string; id?: string; class?: string }
  screenshotPath?: string
  reason?: string
}

export interface MemberReport {
  slug: string
  url: string
  status: MemberStatus
  links: LinkResult[]
  errorMessage?: string
}

const VIEWPORTS: Record<ViewportName, { width: number; height: number }> = {
  mobile: { width: 375, height: 667 },
  desktop: { width: 1280, height: 800 },
}

const NAV_TIMEOUT_MS = Number(process.env.PLAYWRIGHT_TIMEOUT_MS ?? 30000)
const SETTLE_MS = Number(process.env.PLAYWRIGHT_SETTLE_MS ?? 2500)
const REPORT_PATH = resolve(process.cwd(), 'a11y-report.json')
const SCREENSHOT_DIR = resolve(process.cwd(), 'a11y-screenshots')

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function classifyRole(href: string, slug: string): LinkRole {
  const safe = escapeRegex(slug)
  if (new RegExp(`webring\\.ca/prev/${safe}\\b`).test(href)) return 'prev'
  if (new RegExp(`webring\\.ca/next/${safe}\\b`).test(href)) return 'next'
  if (/webring\.ca\/?(?:[?#]|$)/.test(href)) return 'home'
  return 'unknown'
}

export function parseArgs(argv: string[]): { slug?: string; all: boolean; url?: string; markdown: boolean } {
  const args = {
    slug: undefined as string | undefined,
    all: false,
    url: undefined as string | undefined,
    markdown: false,
  }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--slug') args.slug = argv[++i]
    else if (argv[i] === '--url') args.url = argv[++i]
    else if (argv[i] === '--all') args.all = true
    else if (argv[i] === '--markdown') args.markdown = true
  }
  return args
}

function obstructorString(o: { tag: string; id?: string; class?: string } | undefined): string {
  if (!o) return '?'
  const id = o.id ? `#${o.id}` : ''
  const cls = o.class ? `.${o.class.split(/\s+/).filter(Boolean).join('.')}` : ''
  return `${o.tag}${id}${cls}`
}

export function formatReportAsMarkdown(reports: MemberReport[]): string {
  const lines = ['## Widget Clickability']
  for (const r of reports) {
    if (r.status === 'ok') {
      lines.push(`- PASS: **${r.slug}** all links clickable on mobile + desktop`)
    } else if (r.status === 'widget_missing') {
      lines.push(`- WARNING: **${r.slug}** widget not detected in rendered DOM (may be JS-gated or behind consent)`)
    } else if (r.status === 'site_error') {
      lines.push(`- WARNING: **${r.slug}** site error during clickability check: ${r.errorMessage ?? 'unknown'}`)
    } else {
      const covered = r.links.filter((l) => !l.clickable)
      const roles = [...new Set(covered.map((l) => `${l.role}/${l.viewport}`))].join(', ')
      const ob = obstructorString(covered[0]?.obstructor)
      lines.push(
        `- WARNING: **${r.slug}** links covered (${roles}) by \`${ob}\`. Ask the member to raise the widget's z-index or move the obstructing element.`,
      )
    }
  }
  return lines.join('\n')
}

interface PierceResult {
  hit: boolean
  obstructor?: { tag: string; id?: string; class?: string }
}

async function pierceAndCheck(page: Page, linkHandle: Awaited<ReturnType<Page['$']>>, cx: number, cy: number): Promise<PierceResult> {
  return page.evaluate(
    ({ link, x, y }) => {
      const pierce = (root: Document | ShadowRoot): Element | null => {
        const el = root.elementFromPoint(x, y)
        if (!el) return null
        const host = el as HTMLElement
        if (host.shadowRoot) return pierce(host.shadowRoot) ?? el
        return el
      }
      const leaf = pierce(document)
      if (!leaf || !link) return { hit: false }
      const linkEl = link as Element
      if (leaf === linkEl || linkEl.contains(leaf) || leaf.contains(linkEl)) return { hit: true }
      const el = leaf as HTMLElement
      return {
        hit: false,
        obstructor: {
          tag: el.tagName.toLowerCase(),
          id: el.id || undefined,
          class: el.className && typeof el.className === 'string' ? el.className : undefined,
        },
      }
    },
    { link: linkHandle, x: cx, y: cy },
  )
}

async function findWidgetLinks(page: Page, slug: string) {
  const selector = [
    `div[data-webring="ca"][data-member="${slug}"] a`,
    `a[href*="webring.ca/prev/${slug}"]`,
    `a[href*="webring.ca/next/${slug}"]`,
  ].join(', ')
  return page.locator(selector).all()
}

async function checkViewport(
  page: Page,
  slug: string,
  url: string,
  viewport: ViewportName,
): Promise<{ links: LinkResult[]; widgetFound: boolean }> {
  await page.setViewportSize(VIEWPORTS[viewport])
  // Use domcontentloaded instead of 'load' because many member sites have
  // long-tail network activity (analytics, embedded social widgets) that
  // never settles. The explicit settle below gives embed.js / SPAs time to
  // render. Tunable via PLAYWRIGHT_SETTLE_MS and PLAYWRIGHT_TIMEOUT_MS.
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS })
  await page.waitForTimeout(SETTLE_MS)

  const locators = await findWidgetLinks(page, slug)
  if (locators.length === 0) {
    return { links: [], widgetFound: false }
  }

  const results: LinkResult[] = []
  for (const locator of locators) {
    const href = (await locator.getAttribute('href')) ?? ''
    const role = classifyRole(href, slug)

    try {
      await locator.scrollIntoViewIfNeeded({ timeout: 3000 })
    } catch {
      // Keep going -- boundingBox below will tell us if it's truly off-screen
    }

    const box = await locator.boundingBox()
    if (!box || box.width === 0 || box.height === 0) {
      results.push({
        href,
        role,
        viewport,
        clickable: false,
        reason: 'Element not rendered (no bounding box)',
      })
      continue
    }

    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    const linkHandle = await locator.elementHandle()
    let pierceResult: PierceResult
    try {
      pierceResult = await pierceAndCheck(page, linkHandle, cx, cy)
    } finally {
      await linkHandle?.dispose()
    }

    if (pierceResult.hit) {
      results.push({ href, role, viewport, clickable: true })
      continue
    }

    const screenshotName = `${slug}-${viewport}-${role}-${Date.now()}.png`
    const screenshotPath = join(SCREENSHOT_DIR, screenshotName)
    mkdirSync(SCREENSHOT_DIR, { recursive: true })
    await page.screenshot({ path: screenshotPath, fullPage: false })

    results.push({
      href,
      role,
      viewport,
      clickable: false,
      obstructor: pierceResult.obstructor,
      screenshotPath,
      reason: 'Link is covered by another element',
    })
  }

  return { links: results, widgetFound: true }
}

export async function checkMember(browser: Browser, slug: string, url: string): Promise<MemberReport> {
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return {
      slug,
      url,
      status: 'site_error',
      links: [],
      errorMessage: `invalid slug format: ${slug}`,
    }
  }
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  })
  // tsx/esbuild transforms named functions with a __name() helper that does not
  // exist in the browser. Polyfill it as a no-op so page.evaluate() works.
  // Must be passed as a string so Playwright does not re-transform it.
  await context.addInitScript('window.__name = (fn) => fn')
  const page = await context.newPage()

  try {
    const mobile = await checkViewport(page, slug, url, 'mobile')
    const desktop = await checkViewport(page, slug, url, 'desktop')
    const links = [...mobile.links, ...desktop.links]
    const widgetFound = mobile.widgetFound || desktop.widgetFound

    if (!widgetFound) {
      return { slug, url, status: 'widget_missing', links }
    }
    const anyCovered = links.some((l) => !l.clickable)
    return { slug, url, status: anyCovered ? 'covered' : 'ok', links }
  } catch (error) {
    return {
      slug,
      url,
      status: 'site_error',
      links: [],
      errorMessage: error instanceof Error ? error.message : String(error),
    }
  } finally {
    await context.close()
  }
}

function loadMembers(): MemberInput[] {
  const dir = resolve(import.meta.dirname!, '..', 'members')
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const slug = basename(f, '.json')
      const data = JSON.parse(readFileSync(join(dir, f), 'utf-8'))
      return { slug, ...data }
    })
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (!args.slug && !args.all) {
    console.error('Usage: check-clickability --slug <slug> [--url <url>] | --all')
    process.exit(2)
  }

  const all = loadMembers()
  const targets = args.all
    ? all.filter((m) => m.active !== false)
    : all.filter((m) => m.slug === args.slug)

  if (targets.length === 0) {
    console.error(`No members matched. slug=${args.slug} all=${args.all}`)
    process.exit(2)
  }

  // Only clear the screenshot dir when running across all members (scheduled
  // workflow). When invoked per-slug in a loop (PR workflow), we preserve
  // prior screenshots so each slug's evidence survives.
  if (args.all && existsSync(SCREENSHOT_DIR)) rmSync(SCREENSHOT_DIR, { recursive: true, force: true })

  const progress = args.markdown ? process.stderr : process.stdout
  const browser = await chromium.launch({ headless: true })
  const reports: MemberReport[] = []
  try {
    for (const m of targets) {
      const url = args.url ?? m.url
      progress.write(`Checking ${m.slug} (${url}) ... `)
      const report = await checkMember(browser, m.slug, url)
      reports.push(report)
      progress.write(`${report.status}\n`)
    }
  } finally {
    await browser.close()
  }

  writeFileSync(REPORT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2))

  const failures = reports.filter((r) => r.status !== 'ok')
  if (args.markdown) {
    process.stdout.write(formatReportAsMarkdown(reports) + '\n')
  } else {
    console.log(`\nReport: ${REPORT_PATH}`)
    console.log(`Total: ${reports.length}  OK: ${reports.length - failures.length}  Failing: ${failures.length}`)
  }

  process.exit(failures.length > 0 ? 1 : 0)
}

const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('check-clickability.ts')
if (isMain) {
  main().catch((err) => {
    console.error(err)
    process.exit(2)
  })
}
