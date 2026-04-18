import { describe, expect, it } from 'vitest'
import { classifyRole, parseArgs } from '../../scripts/check-clickability'

describe('classifyRole', () => {
  it('identifies prev links', () => {
    expect(classifyRole('https://webring.ca/prev/jane-doe', 'jane-doe')).toBe('prev')
    expect(classifyRole('https://webring.ca/prev/jane-doe/', 'jane-doe')).toBe('prev')
  })

  it('identifies next links', () => {
    expect(classifyRole('https://webring.ca/next/jane-doe', 'jane-doe')).toBe('next')
  })

  it('identifies home link variants', () => {
    expect(classifyRole('https://webring.ca', 'jane-doe')).toBe('home')
    expect(classifyRole('https://webring.ca/', 'jane-doe')).toBe('home')
    expect(classifyRole('https://webring.ca/?foo=bar', 'jane-doe')).toBe('home')
    expect(classifyRole('https://webring.ca#hash', 'jane-doe')).toBe('home')
  })

  it('does not classify links for a different slug as prev/next', () => {
    expect(classifyRole('https://webring.ca/prev/other-slug', 'jane-doe')).toBe('unknown')
    expect(classifyRole('https://webring.ca/next/other-slug', 'jane-doe')).toBe('unknown')
  })

  it('returns unknown for unrelated links', () => {
    expect(classifyRole('https://example.com/', 'jane-doe')).toBe('unknown')
  })

  it('treats regex-metacharacter slugs as literals (no false positives)', () => {
    expect(classifyRole('https://webring.ca/prev/anything', '.*')).toBe('unknown')
    expect(classifyRole('https://webring.ca/prev/(a+)+b', '(a+)+b')).toBe('prev')
  })
})

describe('parseArgs', () => {
  it('parses --slug', () => {
    expect(parseArgs(['--slug', 'jane-doe'])).toEqual({
      slug: 'jane-doe',
      all: false,
      url: undefined,
      markdown: false,
    })
  })

  it('parses --all and --markdown', () => {
    expect(parseArgs(['--all', '--markdown'])).toEqual({
      slug: undefined,
      all: true,
      url: undefined,
      markdown: true,
    })
  })

  it('parses --url alongside --slug', () => {
    expect(parseArgs(['--slug', 'jane-doe', '--url', 'https://example.com'])).toEqual({
      slug: 'jane-doe',
      all: false,
      url: 'https://example.com',
      markdown: false,
    })
  })

  it('returns empty defaults when no args given', () => {
    expect(parseArgs([])).toEqual({ slug: undefined, all: false, url: undefined, markdown: false })
  })
})

describe('formatReportAsMarkdown', () => {
  const base = { slug: 's', url: 'https://x', links: [] }

  it('renders OK rows', async () => {
    const { formatReportAsMarkdown } = await import('../../scripts/check-clickability')
    const md = formatReportAsMarkdown([{ ...base, status: 'ok' }])
    expect(md).toContain('PASS: **s** all links clickable')
  })

  it('renders widget_missing rows', async () => {
    const { formatReportAsMarkdown } = await import('../../scripts/check-clickability')
    const md = formatReportAsMarkdown([{ ...base, status: 'widget_missing' }])
    expect(md).toContain('widget not detected')
  })

  it('renders covered rows with obstructor and roles', async () => {
    const { formatReportAsMarkdown } = await import('../../scripts/check-clickability')
    const md = formatReportAsMarkdown([
      {
        ...base,
        status: 'covered',
        links: [
          {
            href: 'https://webring.ca/prev/s',
            role: 'prev',
            viewport: 'mobile',
            clickable: false,
            obstructor: { tag: 'div', id: 'banner', class: 'overlay big' },
          },
        ],
      },
    ])
    expect(md).toContain('prev/mobile')
    expect(md).toContain('`div#banner.overlay.big`')
  })
})
