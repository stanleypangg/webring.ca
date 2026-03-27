export interface Member {
  slug: string
  name: string
  url: string
  city?: string
  type: 'developer' | 'designer' | 'founder' | 'other'
  active: boolean
  tags?: string[]
  rss?: string
  bannerUrl?: string
  lat?: number
  lng?: number
  joinedAt?: string
}

export interface HealthStatus {
  status: 'ok' | 'widget_missing' | 'unreachable'
  httpStatus?: number
  lastChecked: string
  consecutiveFails: number
}

export type Bindings = {
  WEBRING: KVNamespace
}
