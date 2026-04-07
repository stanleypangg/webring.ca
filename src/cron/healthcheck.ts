import type { HealthStatus } from '../types'
import { getMembers, setMembers, getHealthStatus, setHealthStatus } from '../data'
import { detectWidget } from '../utils/widget'
import { notifyDiscord, type HealthEvent } from './notify'

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
]

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

/** Check response headers for frame-blocking directives. */
function isFrameable(headers: Headers): boolean {
  const xfo = headers.get('x-frame-options')
  if (xfo) {
    const val = xfo.toUpperCase()
    if (val === 'DENY' || val === 'SAMEORIGIN') return false
  }
  const csp = headers.get('content-security-policy')
  if (csp) {
    const match = csp.match(/frame-ancestors\s+([^;]+)/i)
    if (match) {
      const ancestors = match[1].trim().toLowerCase()
      if (ancestors === "'none'" || ancestors === "'self'") return false
      if (!ancestors.includes('*') && !ancestors.includes('webring.ca')) return false
    }
  }
  return true
}

export async function runHealthCheck(
  kv: KVNamespace,
  discordWebhookUrl?: string,
  notify: typeof notifyDiscord = notifyDiscord,
): Promise<void> {
  const members = await getMembers(kv)

  const prevStatuses = await Promise.all(
    members.map((m) => getHealthStatus(kv, m.slug))
  )

  const checkResults = await Promise.allSettled(
    members.map(async (member, i) => {
      const prev = prevStatuses[i]
      try {
        const res = await fetch(member.url, {
          signal: AbortSignal.timeout(5000),
          headers: { 'User-Agent': randomUA() },
        })

        if (!res.ok) {
          return {
            status: 'http_error' as const,
            httpStatus: res.status,
            lastChecked: new Date().toISOString(),
            consecutiveFails: (prev?.consecutiveFails ?? 0) + 1,
          }
        }

        const body = await res.text()
        const hasWidget = detectWidget(body, member.slug)
        const frameable = isFrameable(res.headers)

        if (hasWidget) {
          return {
            status: 'ok' as const,
            httpStatus: res.status,
            lastChecked: new Date().toISOString(),
            consecutiveFails: 0,
            frameable,
          }
        }
        return {
          status: 'widget_missing' as const,
          httpStatus: res.status,
          lastChecked: new Date().toISOString(),
          consecutiveFails: (prev?.consecutiveFails ?? 0) + 1,
          frameable,
        }
      } catch {
        return {
          status: 'unreachable' as const,
          lastChecked: new Date().toISOString(),
          consecutiveFails: (prev?.consecutiveFails ?? 0) + 1,
        }
      }
    })
  )

  const statusMap = new Map<string, HealthStatus>()
  for (let i = 0; i < members.length; i++) {
    const result = checkResults[i]
    if (result.status === 'fulfilled') {
      statusMap.set(members[i].slug, result.value)
    }
  }

  await Promise.all(
    Array.from(statusMap.entries()).map(([slug, status]) =>
      setHealthStatus(kv, slug, status)
    )
  )

  const updatedMembers = members.map((member) => {
    const status = statusMap.get(member.slug)
    if (!status) return member
    if (member.active && status.consecutiveFails >= 7) {
      return { ...member, active: false }
    }
    if (!member.active && status.status === 'ok') {
      return { ...member, active: true }
    }
    return member
  })

  const events: HealthEvent[] = []
  for (let i = 0; i < updatedMembers.length; i++) {
    if (members[i].active && !updatedMembers[i].active) {
      const status = statusMap.get(members[i].slug)
      events.push({ member: members[i], event: 'deactivated', reason: status?.status })
    }
    if (!members[i].active && updatedMembers[i].active) {
      events.push({ member: members[i], event: 'reactivated' })
    }
  }
  await notify(discordWebhookUrl, events)

  const membersChanged = updatedMembers.some(
    (m, i) => m.active !== members[i].active
  )

  if (membersChanged) {
    await setMembers(kv, updatedMembers)
  }
}
