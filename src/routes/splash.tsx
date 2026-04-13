import { Hono } from 'hono'
import { raw } from 'hono/html'
import type { Bindings } from '../types'
import { getActiveMembers, getEffectiveRingOrder, getHealthStatus } from '../data'
import { SplashContent } from '../components/splash-content'
import { AboutContent } from '../components/about-content'
import { DirectoryContent } from '../components/directory-content'
import { SitePreviewContent } from '../components/preview-content'
import { JoinContent } from '../components/join-content'

const PANEL_NAMES = ['Splash', 'About', 'Directory', 'Explore', 'Join']
const DIRECTORY_INDEX = PANEL_NAMES.indexOf('Directory')

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', async (c) => {
  c.header('Cache-Control', 'public, max-age=300')
  const [active, ringOrder] = await Promise.all([
    getActiveMembers(c.env.WEBRING),
    getEffectiveRingOrder(c.env.WEBRING),
  ])
  const memberBySlug = new Map(active.map(m => [m.slug, m]))
  const ordered = [
    ...ringOrder.filter(s => memberBySlug.has(s)).map(s => memberBySlug.get(s)!),
    ...active.filter(m => !ringOrder.includes(m.slug)),
  ]

  const ringEntrySlug = ringOrder[0] ?? ordered[0]?.slug ?? ''

  const healthStatuses = await Promise.all(
    ordered.map((m) => getHealthStatus(c.env.WEBRING, m.slug))
  )

  const dots = PANEL_NAMES.map((name, i) =>
    `<button class="ring-dot${i === 0 ? ' is-active' : ''}" data-dot="${i}" aria-label="Go to ${name}"></button>`
  ).join('')

  const previewMembers = JSON.stringify(ordered.map((m, i) => ({
    name: m.name, url: m.url, city: m.city || '', slug: m.slug,
    frameable: healthStatuses[i]?.frameable ?? true,
  })))

  return c.html(
    <>
      {raw('<!DOCTYPE html>')}
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>webring.ca</title>
          <meta name="description" content="A webring for Canadian builders: developers, designers, and founders." />
          <link rel="canonical" href="https://webring.ca/" />
          <meta name="theme-color" content="#AF272F" />
          <meta property="og:type" content="website" />
          <meta property="og:title" content="webring.ca" />
          <meta property="og:description" content="A webring for Canadian builders: developers, designers, and founders." />
          <meta property="og:url" content="https://webring.ca/" />
          <meta property="og:image" content="https://webring.ca/og-image.png" />
          <meta property="og:image:width" content="1200" />
          <meta property="og:image:height" content="630" />
          <meta property="og:locale" content="en_CA" />
          <meta property="og:site_name" content="webring.ca" />
          <meta property="og:image:type" content="image/png" />
          <meta name="twitter:card" content="summary_large_image" />
          <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
          <link rel="stylesheet" href="/fonts.css" />
          <link rel="stylesheet" href="/splash.css" />
        </head>
        <body>
          <a href="#ring" class="skip-link">Skip to directory</a>
          <div id="ring" class="ring" data-panel-count={PANEL_NAMES.length} data-directory-index={DIRECTORY_INDEX}>
            <div class="ring-track">
              {/* Clone of last panel (Join) for backward cycling */}
              <section class="panel panel--clone" aria-hidden="true">
                <JoinContent memberCount={ordered.length} />
              </section>

              {/* Panel 1: Splash */}
              <section class="panel" data-index="0" aria-label="Splash section">
                <SplashContent ringEntrySlug={ringEntrySlug} />
              </section>

              {/* Panel 2: About */}
              <section class="panel" data-index="1" aria-label="About section">
                <AboutContent />
              </section>

              {/* Panel 3: Directory */}
              <section class="panel" data-index="2" aria-label="Directory section">
                <DirectoryContent active={ordered} />
              </section>

              {/* Panel 4: Explore */}
              <section class="panel panel--alt" data-index="3" aria-label="Explore section">
                <SitePreviewContent />
              </section>

              {/* Panel 5: Join CTA */}
              <section class="panel" data-index="4" aria-label="Join section">
                <JoinContent memberCount={ordered.length} />
              </section>

              {/* Clone of first panel (Splash) for forward cycling */}
              <section class="panel panel--clone" aria-hidden="true">
                <SplashContent ringEntrySlug={ringEntrySlug} />
              </section>
            </div>
          </div>
          {/* Transparent click overlay for the Join button, outside #ring's perspective
              context so Chrome uses 2D hit-testing (immune to preserve-3d routing bugs).
              Positioned over the real button on panelsettle, hidden on panelunsettle. */}
          <a
            id="join-link-overlay"
            href="https://github.com/stanleypangg/webring.ca#join-the-ring"
            target="_blank"
            rel="noopener noreferrer"
            aria-hidden="true"
            tabindex={-1}
            style="position:fixed;display:none;z-index:150;cursor:pointer;"
          ></a>
          {/* Dots live outside #ring to escape its perspective stacking context,
              ensuring they're always above the 3D-transformed panels and
              isolating them from the carousel's touch/wheel event handlers. */}
          <nav class="ring-dots" aria-label="Panel navigation">
            {raw(dots)}
          </nav>

          <script src="/splash.js"></script>
          {raw(`<script>window.__PREVIEW_MEMBERS = ${previewMembers}</script>`)}
          <script src="/preview.js"></script>
          {raw(`<script>(function(){var ring=document.getElementById('ring');var dirIdx=parseInt(ring.getAttribute('data-directory-index'),10);var loaded=false;function loadDirectoryRing(){if(loaded)return;loaded=true;var s=document.createElement('script');s.src='/d3-ring.js';document.body.appendChild(s)}var activeDot=document.querySelector('.ring-dot.is-active');if(activeDot&&parseInt(activeDot.getAttribute('data-dot'),10)===dirIdx){loadDirectoryRing()}ring.addEventListener('panelchange',function(e){if(e.detail.index===dirIdx){loadDirectoryRing()}});var skip=document.querySelector('.skip-link');if(skip){skip.addEventListener('click',function(e){e.preventDefault();loadDirectoryRing();ring.dispatchEvent(new CustomEvent('snapto',{detail:{index:dirIdx}}));ring.focus()})}})();</script>`)}
        </body>
      </html>
    </>
  )
})

export default app
