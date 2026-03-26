import type { FC, PropsWithChildren } from 'hono/jsx'
import { raw } from 'hono/html'

const Layout: FC<PropsWithChildren<{ title?: string; fullHeight?: boolean; hideChrome?: boolean }>> = ({ title, fullHeight, hideChrome, children }) => {
  const pageTitle = title ? `${title} — webring.ca` : 'webring.ca'

  return (
    <>
      {raw('<!DOCTYPE html>')}
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>{pageTitle}</title>
          <meta name="description" content="A webring for Canadian builders — developers, designers, and founders." />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&amp;family=Space+Grotesk:wght@400;500;600;700&amp;family=Space+Mono:wght@400;700&amp;display=swap" rel="stylesheet" />
          <style>{raw(`
            *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif;
              line-height: 1.6;
              color: #1a1a1a;
              background: #fff;
            }
            nav {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 0.9rem 2.5rem;
              border-bottom: 1px solid #e0ddd8;
            }
            .site-name {
              font-family: 'Space Mono', monospace;
              font-weight: 700;
              font-size: 0.9rem;
              color: #1a1a1a;
              text-decoration: none;
              letter-spacing: -0.02em;
            }
            .nav-links { display: flex; gap: 1.75rem; }
            .nav-links a {
              font-family: 'Space Mono', monospace;
              color: #888;
              text-decoration: none;
              font-size: 0.78rem;
              transition: color 0.2s;
            }
            .nav-links a:hover { color: #1a1a1a; }
            main { min-height: 60vh; }
            footer {
              border-top: 1px solid #e0ddd8;
              padding: 0.5rem 2.5rem;
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-family: 'Space Mono', monospace;
              font-size: 0.65rem;
              color: #bbb;
            }
            footer a { color: #bbb; text-decoration: none; transition: color 0.15s; }
            footer a:hover { color: #888; }
            a { color: #c22; }
            a:visited { color: #922; }
            h1 { font-size: 1.5rem; margin-bottom: 1rem; font-weight: 700; letter-spacing: -0.03em; }
            h2 { font-size: 1.2rem; margin-bottom: 0.75rem; }
            p { margin-bottom: 1rem; }
            code { background: #f3f1ed; padding: 0.15em 0.35em; border-radius: 3px; font-size: 0.9em; font-family: 'Space Mono', monospace; }
            pre { background: #f3f1ed; padding: 1rem; border-radius: 4px; overflow-x: auto; margin-bottom: 1rem; }
            pre code { background: none; padding: 0; }
            ul, ol { margin-bottom: 1rem; padding-left: 1.5rem; }
            li { margin-bottom: 0.25rem; }
            .full-height { height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
            .full-height .container { flex: 1; display: flex; flex-direction: column; min-height: 0; }
            .full-height main { flex: 1; display: flex; flex-direction: column; min-height: 0; }
            @media (max-width: 767px) {
              .full-height { height: auto; overflow: auto; }
            }
            @media (prefers-color-scheme: dark) {
              body { color: #e0ddd8; background: #111110; }
              nav { border-bottom-color: #2a2927; }
              .site-name { color: #e0ddd8; }
              .nav-links a { color: #666; }
              .nav-links a:hover { color: #e0ddd8; }
              footer { border-top-color: #2a2927; color: #444; }
              footer a { color: #444; }
              footer a:hover { color: #888; }
              a { color: #f55; }
              a:visited { color: #d44; }
              code { background: #1a1918; }
              pre { background: #1a1918; }
            }
          `)}</style>
          <script src="https://cdn.jsdelivr.net/npm/htmx.org@2.0.8/dist/htmx.min.js"></script>
        </head>
        <body class={fullHeight ? 'full-height' : ''}>
          <div class="container">
            {!hideChrome && (
              <nav>
                <a href="/" class="site-name">webring.ca</a>
                <div class="nav-links">
                  <a href="/join">join</a>
                  <a href="/directory">directory</a>
                </div>
              </nav>
            )}
            <main>
              {children}
            </main>
            {!hideChrome && (
              <footer>
                <span>A webring for Canadian builders</span>
                <a href="https://github.com/pangstan/webring.ca">GitHub</a>
              </footer>
            )}
          </div>
        </body>
      </html>
    </>
  )
}

export default Layout
