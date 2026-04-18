import { readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, join, basename } from 'node:path'
import { detectWidget, extractScriptUrls, detectWidgetInBundle } from '../src/utils/widget'
import { hasResolvableMemberCoordinates } from '../src/utils/member-coords'

interface MemberInput {
  slug: string
  name: string
  url: string
  city?: string
  active?: boolean
}

const ALLOWED_KEYS = new Set(['name', 'url', 'city', 'active', 'lat', 'lng'])

function sanitize(text: string): string {
  return text.replace(/[[\](){}*_~`#>!|\\]/g, '\\$&')
}

function write(text: string): void {
  process.stdout.write(text + '\n')
}

const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function isBotChallenge(res: Response): boolean {
  if (res.status !== 429 && res.status !== 403 && res.status !== 503) return false
  return res.headers.has('x-vercel-mitigated') || res.headers.has('cf-mitigated')
}

async function checkWidget(body: string, url: string, slug: string): Promise<'html' | 'bundle' | false> {
  if (detectWidget(body, slug)) return 'html'

  const scriptUrls = extractScriptUrls(body, url)
  for (const scriptUrl of scriptUrls) {
    try {
      const jsRes = await fetch(scriptUrl, {
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': BROWSER_UA, 'Accept': '*/*' },
      })
      if (!jsRes.ok) continue
      const js = await jsRes.text()
      if (detectWidgetInBundle(js, slug)) return 'bundle'
    } catch {
      // Individual script fetch failed, skip
    }
  }

  return false
}

// ── Load current members from members/ directory ──
const membersDir = resolve(import.meta.dirname!, '..', 'members')

function loadMembersFromDir(dir: string): MemberInput[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const slug = basename(f, '.json')
        const data = JSON.parse(readFileSync(join(dir, f), 'utf-8'))
        return { slug, ...data }
      })
  } catch {
    return []
  }
}

const members = loadMembersFromDir(membersDir)

// ── Load base members ──
let baseMembers: MemberInput[] = []
try {
  const ref = process.env.PR_BASE_SHA
    || (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'main')
  const listing = execFileSync('git', ['ls-tree', '--name-only', `${ref}:members/`], {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  baseMembers = listing.trim().split('\n')
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const slug = basename(f, '.json')
      const raw = execFileSync('git', ['show', `${ref}:members/${f}`], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      return { slug, ...JSON.parse(raw) }
    })
} catch {
  // No base -- first time, all members are new
}

// ── Diff: new, removed, edited ──
const baseSlugs = new Set(baseMembers.map((m) => m.slug))
const currentSlugs = new Set(members.map((m) => m.slug))
const baseBySlug = new Map(baseMembers.map((m) => [m.slug, m]))

const newMembers = members.filter((m) => !baseSlugs.has(m.slug))
const removedMembers = baseMembers.filter((m) => !currentSlugs.has(m.slug))

const editedMembers: Array<{ current: MemberInput; base: MemberInput; changedFields: string[] }> = []
for (const member of members) {
  const prev = baseBySlug.get(member.slug)
  if (!prev) continue
  const changed: string[] = []
  for (const key of ['name', 'url', 'city', 'active'] as const) {
    if (member[key] !== prev[key]) changed.push(key)
  }
  if (changed.length > 0) {
    editedMembers.push({ current: member, base: prev, changedFields: changed })
  }
}

// ── Nothing changed ──
if (newMembers.length === 0 && removedMembers.length === 0 && editedMembers.length === 0) {
  write('## Webring Validation\n')
  write('No member changes found in this PR.')
  process.exit(0)
}

// ── Validate ──
let hasFailure = false
const allSlugs = new Set<string>()
const allUrls = new Set<string>()
for (const m of baseMembers) {
  allSlugs.add(m.slug)
  allUrls.add(m.url)
}

write('## Webring Validation\n')

// ── Removed members (warn only) ──
if (removedMembers.length > 0) {
  write('### Removed Members\n')
  for (const m of removedMembers) {
    write(`- WARNING: **${sanitize(m.name)}** (${sanitize(m.url)}) was removed`)
  }
  write('')
}

// ── Edited members ──
for (const { current, base, changedFields } of editedMembers) {
  const safeName = sanitize(current.name)
  const safeUrl = sanitize(current.url)
  let memberFailed = false
  let memberBotChallenged = false

  write(`### ${safeName} (edited)\n`)

  for (const field of changedFields) {
    const oldVal = sanitize(String(base[field as keyof MemberInput] ?? ''))
    const newVal = sanitize(String(current[field as keyof MemberInput] ?? ''))
    write(`- INFO: \`${field}\` changed: "${oldVal}" -> "${newVal}"`)
  }

  // Re-validate changed fields
  if (changedFields.includes('name') && !current.name) {
    write('- FAIL: name cannot be empty')
    memberFailed = true
  }

  // Re-validate URL if it changed
  if (changedFields.includes('url')) {
    write('\n**Site check** (URL changed)')

    if (!current.url.startsWith('https://')) {
      write(`- FAIL: URL must use HTTPS. Got "${safeUrl}"`)
      memberFailed = true
    } else {
      try {
        const res = await fetch(current.url, {
          signal: AbortSignal.timeout(10000),
          headers: { 'User-Agent': BROWSER_UA, 'Accept': 'text/html,*/*' },
        })
        if (res.ok) {
          write(`- PASS: ${safeUrl} responded with HTTP ${res.status}`)

          const body = await res.text()
          const widgetResult = await checkWidget(body, current.url, current.slug)
          if (widgetResult === 'html') {
            write('- PASS: Webring widget detected')
          } else if (widgetResult === 'bundle') {
            write('- PASS: Webring widget detected in JS bundle')
          } else {
            write(`- FAIL: Widget not detected on new URL. Make sure data-member="${sanitize(current.slug)}" matches your filename. See https://github.com/stanleypangg/webring.ca#add-the-widget`)
            memberFailed = true
          }
        } else if (isBotChallenge(res)) {
          write(`- WARNING: ${safeUrl} returned HTTP ${res.status} from a bot-protection challenge (Vercel/Cloudflare). Widget check skipped -- verify manually in a browser before merging.`)
          memberBotChallenged = true
        } else {
          write(`- FAIL: ${safeUrl} returned HTTP ${res.status}. The site must return a 2xx status code.`)
          memberFailed = true
        }
      } catch {
        write(`- FAIL: ${safeUrl} is unreachable (timed out after 10s or connection refused).`)
        memberFailed = true
      }
    }
  }

  if (memberFailed) {
    write('\n**Result: Not ready to merge.** Fix the issues marked FAIL above and push again.')
    hasFailure = true
  } else if (memberBotChallenged) {
    write('\n**Result: :warning: Ready to merge pending manual widget verification.** Open the site in a browser and confirm the webring widget renders before merging.')
  } else {
    write('')
  }
}

// ── New members ──
for (const member of newMembers) {
  let memberFailed = false
  let memberBotChallenged = false

  const safeName = sanitize(member.name ?? '')
  const safeUrl = sanitize(member.url ?? '')

  write(`### ${safeName} (${safeUrl})\n`)

  write('**Schema**')

  if (!member.name || !member.url || member.active === undefined) {
    write('- FAIL: Missing required fields. Every entry needs name, url, and active.')
    memberFailed = true
  } else {
    write('- PASS: All required fields present (name, url, active)')
  }

  const unknownKeys = Object.keys(member).filter((k) => k !== 'slug' && !ALLOWED_KEYS.has(k))
  if (unknownKeys.length > 0) {
    write(`- FAIL: Unknown fields: ${unknownKeys.map((k) => `"${sanitize(k)}"`).join(', ')}. Allowed fields: ${[...ALLOWED_KEYS].join(', ')}`)
    memberFailed = true
  }

  if (!/^[a-z0-9-]+$/.test(member.slug)) {
    write(`- FAIL: filename "${sanitize(member.slug)}.json" must be lowercase alphanumeric and hyphens only (e.g. "jane-doe.json")`)
    memberFailed = true
  } else {
    write(`- PASS: filename "${sanitize(member.slug)}.json" is valid`)
  }

  if (member.url && !member.url.startsWith('https://')) {
    write(`- FAIL: URL must use HTTPS. Got "${safeUrl}"`)
    memberFailed = true
  } else if (member.url) {
    write('- PASS: URL uses HTTPS')
  }

  if (allSlugs.has(member.slug)) {
    write(`- FAIL: slug "${sanitize(member.slug)}" is already taken by another member`)
    memberFailed = true
  }

  if (member.url && allUrls.has(member.url)) {
    write(`- FAIL: URL "${safeUrl}" is already registered to another member`)
    memberFailed = true
  }

  if (!hasResolvableMemberCoordinates(member)) {
    write('- FAIL: Coordinates are not resolvable from committed repo data. Add lat/lng or use a supported city before merge.')
    memberFailed = true
  } else {
    write('- PASS: Coordinates are resolvable from committed repo data')
  }

  write('\n**Site check**')

  try {
    const res = await fetch(member.url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': BROWSER_UA, 'Accept': 'text/html,*/*' },
    })
    if (res.ok) {
      write(`- PASS: ${safeUrl} responded with HTTP ${res.status}`)

      const body = await res.text()
      const widgetResult = await checkWidget(body, member.url, member.slug)
      if (widgetResult === 'html') {
        write('- PASS: Webring widget detected')
      } else if (widgetResult === 'bundle') {
        write('- PASS: Webring widget detected in JS bundle')
      } else {
        write(`- FAIL: Widget not detected. Make sure data-member="${sanitize(member.slug)}" matches your filename. See https://github.com/stanleypangg/webring.ca#add-the-widget`)
        memberFailed = true
      }
    } else if (isBotChallenge(res)) {
      write(`- WARNING: ${safeUrl} returned HTTP ${res.status} from a bot-protection challenge (Vercel/Cloudflare). Widget check skipped -- verify manually in a browser before merging.`)
      memberBotChallenged = true
    } else {
      write(`- FAIL: ${safeUrl} returned HTTP ${res.status}. The site must return a 2xx status code.`)
      memberFailed = true
    }
  } catch {
    write(`- FAIL: ${safeUrl} is unreachable (timed out after 10s or connection refused). Make sure your site is live and publicly accessible.`)
    memberFailed = true
  }

  if (memberFailed) {
    write('\n**Result: Not ready to merge.** Fix the issues marked FAIL above and push again.')
    hasFailure = true
  } else if (memberBotChallenged) {
    write('\n**Result: :warning: Ready to merge pending manual widget verification.** Open the site in a browser and confirm the webring widget renders before merging.')
  } else {
    write('\n**Result: Ready to merge.**')
  }

  allSlugs.add(member.slug)
  allUrls.add(member.url)
}

process.exit(hasFailure ? 1 : 0)
