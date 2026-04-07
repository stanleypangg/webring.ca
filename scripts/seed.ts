import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fisherYatesShuffle } from '../src/utils/shuffle'
import { getMemberCoordinates } from '../src/utils/member-coords'

const remote = process.argv.includes('--remote')
const preview = process.argv.includes('--preview')

const membersPath = resolve(import.meta.dirname!, '..', 'members.json')
const raw = readFileSync(membersPath, 'utf-8')
const members = JSON.parse(raw)

for (const member of members) {
  const coords = getMemberCoordinates(member)
  if (coords) {
    member.lat = coords.lat
    member.lng = coords.lng
    continue
  }

  process.stderr.write(
    `Missing committed coordinates for ${member.slug}. Add lat/lng or a supported city before seeding.\n`
  )
  process.exit(1)
}

const enrichedMembersPath = join(tmpdir(), 'webring-members-enriched.json')
writeFileSync(enrichedMembersPath, JSON.stringify(members))

const activeSlugs = members
  .filter((m: { active: boolean }) => m.active)
  .map((m: { slug: string }) => m.slug)
const slugs = fisherYatesShuffle(activeSlugs)

const flags = [
  remote ? '--remote' : '--local',
  preview || !remote ? '--preview' : '--preview=false',
]

const cwd = resolve(import.meta.dirname!, '..')

const ringOrderPath = join(tmpdir(), 'webring-ring-order.json')
writeFileSync(ringOrderPath, JSON.stringify(slugs))

const target = remote ? (preview ? 'remote preview' : 'remote') : 'local'
process.stdout.write(`Seeding ${members.length} members to KV (${target})...\n`)

execFileSync('npx', [
  'wrangler', 'kv', 'key', 'put', 'members',
  '--binding', 'WEBRING',
  '--path', enrichedMembersPath,
  ...flags,
], { cwd, stdio: 'inherit' })

execFileSync('npx', [
  'wrangler', 'kv', 'key', 'put', 'ring-order',
  '--binding', 'WEBRING',
  '--path', ringOrderPath,
  ...flags,
], { cwd, stdio: 'inherit' })

process.stdout.write(`Done. Seeded ${members.length} members, ring order: [${slugs.join(', ')}]\n`)
