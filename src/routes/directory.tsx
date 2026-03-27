import { Hono } from 'hono'
import type { Bindings } from '../types'
import { getActiveMembers } from '../data'
import Layout from '../templates/Layout'

const app = new Hono<{ Bindings: Bindings }>()

app.get('/directory', async (c) => {
  const members = await getActiveMembers(c.env.WEBRING)
  c.header('Cache-Control', 'public, max-age=300')
  return c.html(
    <Layout title="Directory">
      <h1>Directory</h1>
      <p>{members.length} members</p>
      {members.length === 0 ? (
        <p>No members yet.</p>
      ) : (
        <ul>
          {members.map((m) => (
            <li>
              <a href={m.url} target="_blank" rel="noopener noreferrer">
                {m.name}
              </a>
              {m.city ? ` — ${m.city}` : ''}
              {` · ${m.type}`}
            </li>
          ))}
        </ul>
      )}
    </Layout>
  )
})

export default app
