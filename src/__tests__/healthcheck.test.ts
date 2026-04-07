import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { runHealthCheck } from '../cron/healthcheck'
import { detectWidget, extractScriptUrls, detectWidgetInBundle } from '../utils/widget'
import { createMockKV } from './kv-mock'
import type { Member, HealthStatus } from '../types'

const VALID_WIDGET = '<div data-webring="ca" data-member="alice"></div><a href="https://webring.ca/prev/alice">prev</a><a href="https://webring.ca/next/alice">next</a><script src="https://webring.ca/embed.js"></script>'

const alice: Member = { slug: 'alice', name: 'Alice', url: 'https://alice.example.com', active: true }
const bob: Member = { slug: 'bob', name: 'Bob', url: 'https://bob.example.com', active: true }

let originalFetch: typeof globalThis.fetch

beforeEach(() => {
  originalFetch = globalThis.fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function mockFetch(responses: Record<string, { ok: boolean; status: number; body: string } | 'error'>) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    const response = responses[url]
    if (response === 'error') {
      throw new Error('Network error')
    }
    if (response) {
      return new Response(response.body, { status: response.status })
    }
    throw new Error(`Unexpected fetch: ${url}`)
  }) as typeof fetch
}

describe('detectWidget', () => {
  it('detects valid widget with marker and links', () => {
    expect(detectWidget(VALID_WIDGET)).toBe(true)
  })

  it('detects widget with embed script and links', () => {
    const html = '<script src="https://webring.ca/embed.js"></script><a href="https://webring.ca/prev/alice">prev</a><a href="https://webring.ca/next/alice">next</a>'
    expect(detectWidget(html)).toBe(true)
  })

  it('rejects marker hidden in HTML comment', () => {
    const html = '<!-- <div data-webring="ca"></div> --><a href="https://webring.ca/prev/alice">prev</a><a href="https://webring.ca/next/alice">next</a>'
    expect(detectWidget(html)).toBe(false)
  })

  it('rejects marker alone without embed script or prev/next links', () => {
    const html = '<div data-webring="ca"></div>'
    expect(detectWidget(html)).toBe(false)
  })

  // embed.js detection path
  it('accepts embed.js script with matching data-member slug', () => {
    const html = '<div data-webring="ca" data-member="alice"></div><script src="https://webring.ca/embed.js" defer></script>'
    expect(detectWidget(html, 'alice')).toBe(true)
  })

  it('accepts embed.js script without slug parameter', () => {
    const html = '<div data-webring="ca" data-member="alice"></div><script src="https://webring.ca/embed.js"></script>'
    expect(detectWidget(html)).toBe(true)
  })

  it('rejects embed.js script with wrong data-member slug', () => {
    const html = '<div data-webring="ca" data-member="bob"></div><script src="https://webring.ca/embed.js"></script>'
    expect(detectWidget(html, 'alice')).toBe(false)
  })

  it('rejects embed.js script without data-member attribute when slug checked', () => {
    const html = '<div data-webring="ca"></div><script src="https://webring.ca/embed.js"></script>'
    expect(detectWidget(html, 'alice')).toBe(false)
  })

  it('rejects embed.js script hidden in HTML comment', () => {
    const html = '<!-- <script src="https://webring.ca/embed.js"></script> --><div data-webring="ca" data-member="alice"></div>'
    expect(detectWidget(html, 'alice')).toBe(false)
  })

  it('embed.js does not require prev/next links in HTML', () => {
    const html = '<div data-webring="ca" data-member="alice"></div><script src="https://webring.ca/embed.js"></script>'
    expect(detectWidget(html, 'alice')).toBe(true)
  })

  it('rejects prev/next links without marker', () => {
    const html = '<a href="https://webring.ca/prev/alice">prev</a><a href="https://webring.ca/next/alice">next</a>'
    expect(detectWidget(html)).toBe(false)
  })

  it('rejects when only prev link is present', () => {
    const html = '<div data-webring="ca"></div><a href="https://webring.ca/prev/alice">prev</a>'
    expect(detectWidget(html)).toBe(false)
  })

  it('rejects when only next link is present', () => {
    const html = '<div data-webring="ca"></div><a href="https://webring.ca/next/alice">next</a>'
    expect(detectWidget(html)).toBe(false)
  })

  it('rejects empty page', () => {
    expect(detectWidget('<html></html>')).toBe(false)
  })

  it('rejects widget links for a different slug when slug is provided', () => {
    const html = '<div data-webring="ca" data-member="bob"></div><a href="https://webring.ca/prev/bob">prev</a><a href="https://webring.ca/next/bob">next</a>'
    expect(detectWidget(html, 'alice')).toBe(false)
  })

  it('rejects when slug is a prefix of the actual link slug', () => {
    const html = '<div data-webring="ca"></div><a href="https://webring.ca/prev/alicexyz">prev</a><a href="https://webring.ca/next/alicexyz">next</a>'
    expect(detectWidget(html, 'alice')).toBe(false)
  })

  it('accepts links with query params after the slug', () => {
    const html = '<div data-webring="ca"></div><a href="https://webring.ca/prev/alice?ref=widget">prev</a><a href="https://webring.ca/next/alice?ref=widget">next</a>'
    expect(detectWidget(html, 'alice')).toBe(true)
  })

  it('accepts links with hash after the slug', () => {
    const html = '<div data-webring="ca"></div><a href="https://webring.ca/prev/alice#top">prev</a><a href="https://webring.ca/next/alice#top">next</a>'
    expect(detectWidget(html, 'alice')).toBe(true)
  })

  it('accepts links with trailing slash after the slug', () => {
    const html = '<div data-webring="ca"></div><a href="https://webring.ca/prev/alice/">prev</a><a href="https://webring.ca/next/alice/">next</a>'
    expect(detectWidget(html, 'alice')).toBe(true)
  })
})

describe('extractScriptUrls', () => {
  it('extracts absolute same-origin script URLs', () => {
    const html = '<script src="https://example.com/app.js"></script>'
    expect(extractScriptUrls(html, 'https://example.com')).toEqual(['https://example.com/app.js'])
  })

  it('resolves relative URLs against base', () => {
    const html = '<script src="/static/bundle.js"></script>'
    expect(extractScriptUrls(html, 'https://example.com')).toEqual(['https://example.com/static/bundle.js'])
  })

  it('filters out cross-origin scripts', () => {
    const html = '<script src="https://cdn.other.com/lib.js"></script><script src="/app.js"></script>'
    expect(extractScriptUrls(html, 'https://example.com')).toEqual(['https://example.com/app.js'])
  })

  it('skips inline scripts without src', () => {
    const html = '<script>console.log("hi")</script><script src="/app.js"></script>'
    expect(extractScriptUrls(html, 'https://example.com')).toEqual(['https://example.com/app.js'])
  })

  it('returns empty array when no scripts present', () => {
    expect(extractScriptUrls('<html></html>', 'https://example.com')).toEqual([])
  })

  it('caps at 10 scripts', () => {
    const tags = Array.from({ length: 15 }, (_, i) => `<script src="/chunk${i}.js"></script>`).join('')
    expect(extractScriptUrls(tags, 'https://example.com')).toHaveLength(10)
  })

  it('handles single-quoted src attributes', () => {
    const html = "<script src='/app.js'></script>"
    expect(extractScriptUrls(html, 'https://example.com')).toEqual(['https://example.com/app.js'])
  })

  it('handles src with query string', () => {
    const html = '<script src="/app.js?v=abc123"></script>'
    expect(extractScriptUrls(html, 'https://example.com')).toEqual(['https://example.com/app.js?v=abc123'])
  })
})

describe('detectWidgetInBundle', () => {
  it('detects webring.ca/embed.js in compiled JS', () => {
    const js = 'var x={src:"https://webring.ca/embed.js"}'
    expect(detectWidgetInBundle(js)).toBe(true)
  })

  it('detects embed.js with matching slug', () => {
    const js = '{"data-member":"jace"},src:"https://webring.ca/embed.js"'
    expect(detectWidgetInBundle(js, 'jace')).toBe(true)
  })

  it('rejects embed.js with wrong slug', () => {
    const js = '{"data-member":"bob"},src:"https://webring.ca/embed.js"'
    expect(detectWidgetInBundle(js, 'jace')).toBe(false)
  })

  it('rejects embed.js without data-member when slug checked', () => {
    const js = 'src:"https://webring.ca/embed.js"'
    expect(detectWidgetInBundle(js, 'jace')).toBe(false)
  })

  it('detects manual widget via secondary markers', () => {
    const js = '{"data-webring":"ca"},href:"https://webring.ca/prev/alice",href:"https://webring.ca/next/alice"'
    expect(detectWidgetInBundle(js)).toBe(true)
  })

  it('rejects data-webring without webring.ca links', () => {
    const js = '{"data-webring":"ca"}'
    expect(detectWidgetInBundle(js)).toBe(false)
  })

  it('rejects empty JS', () => {
    expect(detectWidgetInBundle('')).toBe(false)
  })

  it('rejects unrelated JS', () => {
    expect(detectWidgetInBundle('function app(){return"hello"}')).toBe(false)
  })

  it('handles real Next.js RSC compiled JSX', () => {
    const js = '(0,ei.jsx)("div",{"data-webring":"ca","data-member":"jace",className:"flex"}),(0,ei.jsx)(gb.default,{src:"https://webring.ca/embed.js",strategy:"afterInteractive"})'
    expect(detectWidgetInBundle(js, 'jace')).toBe(true)
  })

  it('rejects slug that is a prefix of actual data-member value', () => {
    const js = '{"data-member":"jane-doe"},src:"https://webring.ca/embed.js"'
    expect(detectWidgetInBundle(js, 'jane')).toBe(false)
  })

  it('slug match is case-insensitive', () => {
    const js = '{"data-member":"Jace"},src:"https://webring.ca/embed.js"'
    expect(detectWidgetInBundle(js, 'jace')).toBe(true)
  })
})

describe('runHealthCheck', () => {
  it('marks members as ok when site is reachable with widget', async () => {
    const kv = createMockKV({ members: JSON.stringify([alice]) })
    mockFetch({
      'https://alice.example.com': { ok: true, status: 200, body: VALID_WIDGET },
    })

    await runHealthCheck(kv)

    const raw = await kv.get('health:alice')
    const status: HealthStatus = JSON.parse(raw!)
    expect(status.status).toBe('ok')
    expect(status.consecutiveFails).toBe(0)
    expect(status.httpStatus).toBe(200)
  })

  it('marks members as widget_missing when site ok but no widget', async () => {
    const kv = createMockKV({ members: JSON.stringify([alice]) })
    mockFetch({
      'https://alice.example.com': { ok: true, status: 200, body: '<html>no widget here</html>' },
    })

    await runHealthCheck(kv)

    const raw = await kv.get('health:alice')
    const status: HealthStatus = JSON.parse(raw!)
    expect(status.status).toBe('widget_missing')
    expect(status.consecutiveFails).toBe(1)
  })

  it('marks as widget_missing when marker is in a comment', async () => {
    const kv = createMockKV({ members: JSON.stringify([alice]) })
    mockFetch({
      'https://alice.example.com': { ok: true, status: 200, body: '<!-- <div data-webring="ca"></div> --><a href="https://webring.ca/prev/alice">prev</a><a href="https://webring.ca/next/alice">next</a>' },
    })

    await runHealthCheck(kv)

    const raw = await kv.get('health:alice')
    const status: HealthStatus = JSON.parse(raw!)
    expect(status.status).toBe('widget_missing')
  })

  it('marks as widget_missing when marker present but no links', async () => {
    const kv = createMockKV({ members: JSON.stringify([alice]) })
    mockFetch({
      'https://alice.example.com': { ok: true, status: 200, body: '<div data-webring="ca"></div>' },
    })

    await runHealthCheck(kv)

    const raw = await kv.get('health:alice')
    const status: HealthStatus = JSON.parse(raw!)
    expect(status.status).toBe('widget_missing')
  })

  it('marks as widget_missing when the widget links belong to another slug', async () => {
    const kv = createMockKV({ members: JSON.stringify([alice]) })
    mockFetch({
      'https://alice.example.com': { ok: true, status: 200, body: '<div data-webring="ca" data-member="bob"></div><a href="https://webring.ca/prev/bob">prev</a><a href="https://webring.ca/next/bob">next</a>' },
    })

    await runHealthCheck(kv)

    const raw = await kv.get('health:alice')
    const status: HealthStatus = JSON.parse(raw!)
    expect(status.status).toBe('widget_missing')
  })

  it('sends a browser User-Agent', async () => {
    const kv = createMockKV({ members: JSON.stringify([alice]) })
    mockFetch({
      'https://alice.example.com': { ok: true, status: 200, body: VALID_WIDGET },
    })

    await runHealthCheck(kv)

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const headers = call[1]?.headers as Record<string, string>
    expect(headers['User-Agent']).toMatch(/^Mozilla\/5\.0/)
  })

  it('marks members as http_error when site returns non-2xx', async () => {
    const kv = createMockKV({ members: JSON.stringify([alice]) })
    mockFetch({
      'https://alice.example.com': { ok: false, status: 500, body: '<html>Internal Server Error</html>' },
    })

    await runHealthCheck(kv)

    const raw = await kv.get('health:alice')
    const status: HealthStatus = JSON.parse(raw!)
    expect(status.status).toBe('http_error')
    expect(status.httpStatus).toBe(500)
    expect(status.consecutiveFails).toBe(1)
  })

  it('marks members as unreachable on network error', async () => {
    const kv = createMockKV({ members: JSON.stringify([alice]) })
    mockFetch({ 'https://alice.example.com': 'error' })

    await runHealthCheck(kv)

    const raw = await kv.get('health:alice')
    const status: HealthStatus = JSON.parse(raw!)
    expect(status.status).toBe('unreachable')
    expect(status.consecutiveFails).toBe(1)
  })

  it('increments consecutive fails from previous status', async () => {
    const prevStatus: HealthStatus = {
      status: 'unreachable',
      lastChecked: '2025-01-01T00:00:00.000Z',
      consecutiveFails: 3,
    }
    const kv = createMockKV({
      members: JSON.stringify([alice]),
      'health:alice': JSON.stringify(prevStatus),
    })
    mockFetch({ 'https://alice.example.com': 'error' })

    await runHealthCheck(kv)

    const raw = await kv.get('health:alice')
    const status: HealthStatus = JSON.parse(raw!)
    expect(status.consecutiveFails).toBe(4)
  })

  it('deactivates member after 7 consecutive fails', async () => {
    const prevStatus: HealthStatus = {
      status: 'unreachable',
      lastChecked: '2025-01-01T00:00:00.000Z',
      consecutiveFails: 6,
    }
    const kv = createMockKV({
      members: JSON.stringify([alice]),
      'health:alice': JSON.stringify(prevStatus),
    })
    mockFetch({ 'https://alice.example.com': 'error' })

    await runHealthCheck(kv)

    const membersRaw = await kv.get('members')
    const members: Member[] = JSON.parse(membersRaw!)
    expect(members[0].active).toBe(false)
  })

  it('reactivates inactive member when site becomes ok', async () => {
    const inactiveAlice = { ...alice, active: false }
    const kv = createMockKV({ members: JSON.stringify([inactiveAlice]) })
    mockFetch({
      'https://alice.example.com': { ok: true, status: 200, body: VALID_WIDGET },
    })

    await runHealthCheck(kv)

    const membersRaw = await kv.get('members')
    const members: Member[] = JSON.parse(membersRaw!)
    expect(members[0].active).toBe(true)
  })

  it('does not update members if no status changes', async () => {
    const kv = createMockKV({ members: JSON.stringify([alice]) })
    mockFetch({
      'https://alice.example.com': { ok: true, status: 200, body: VALID_WIDGET },
    })
    const putSpy = vi.spyOn(kv, 'put')

    await runHealthCheck(kv)

    const memberPuts = putSpy.mock.calls.filter(([key]) => key === 'members')
    expect(memberPuts).toHaveLength(0)
  })

  it('marks embed.js sites as ok without prev/next links in HTML', async () => {
    const kv = createMockKV({ members: JSON.stringify([alice]) })
    const embedHtml = '<div data-webring="ca" data-member="alice"></div><script src="https://webring.ca/embed.js" defer></script>'
    mockFetch({
      'https://alice.example.com': { ok: true, status: 200, body: embedHtml },
    })

    await runHealthCheck(kv)

    const raw = await kv.get('health:alice')
    const status: HealthStatus = JSON.parse(raw!)
    expect(status.status).toBe('ok')
    expect(status.consecutiveFails).toBe(0)
  })

  it('handles multiple members in parallel', async () => {
    const kv = createMockKV({ members: JSON.stringify([alice, bob]) })
    const bobWidget = '<div data-webring="ca"></div><a href="https://webring.ca/prev/bob">prev</a><a href="https://webring.ca/next/bob">next</a>'
    mockFetch({
      'https://alice.example.com': { ok: true, status: 200, body: VALID_WIDGET },
      'https://bob.example.com': { ok: true, status: 200, body: bobWidget },
    })

    await runHealthCheck(kv)

    const aliceRaw = await kv.get('health:alice')
    const bobRaw = await kv.get('health:bob')
    expect(JSON.parse(aliceRaw!).status).toBe('ok')
    expect(JSON.parse(bobRaw!).status).toBe('ok')
  })

  it('sends Discord notification on deactivation', async () => {
    const prevStatus: HealthStatus = {
      status: 'unreachable',
      lastChecked: '2025-01-01T00:00:00.000Z',
      consecutiveFails: 6,
    }
    const kv = createMockKV({
      members: JSON.stringify([alice]),
      'health:alice': JSON.stringify(prevStatus),
    })
    mockFetch({ 'https://alice.example.com': 'error' })
    const mockNotify = vi.fn()

    await runHealthCheck(kv, 'https://discord.com/api/webhooks/test', mockNotify)

    expect(mockNotify).toHaveBeenCalledWith(
      'https://discord.com/api/webhooks/test',
      [expect.objectContaining({ event: 'deactivated', reason: 'unreachable' })],
    )
  })

  it('sends Discord notification on reactivation', async () => {
    const inactiveAlice = { ...alice, active: false }
    const kv = createMockKV({ members: JSON.stringify([inactiveAlice]) })
    mockFetch({
      'https://alice.example.com': { ok: true, status: 200, body: VALID_WIDGET },
    })
    const mockNotify = vi.fn()

    await runHealthCheck(kv, 'https://discord.com/api/webhooks/test', mockNotify)

    expect(mockNotify).toHaveBeenCalledWith(
      'https://discord.com/api/webhooks/test',
      [expect.objectContaining({ event: 'reactivated' })],
    )
  })

  it('does not send Discord notification when no transitions', async () => {
    const kv = createMockKV({ members: JSON.stringify([alice]) })
    mockFetch({
      'https://alice.example.com': { ok: true, status: 200, body: VALID_WIDGET },
    })
    const mockNotify = vi.fn()

    await runHealthCheck(kv, 'https://discord.com/api/webhooks/test', mockNotify)

    expect(mockNotify).toHaveBeenCalledWith(
      'https://discord.com/api/webhooks/test',
      [],
    )
  })
})
