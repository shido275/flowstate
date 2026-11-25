/*
 * Flowstate's offline shell.
 *
 * At install it precaches the app shell and parses index.html for the hashed
 * build files, so the very first offline reload works. Bump CACHE when shipping
 * a change that must not be served from an older cache.
 */
const CACHE = 'flowstate-v3'
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png']

async function precache() {
  const cache = await caches.open(CACHE)
  await Promise.all(SHELL.map((url) => cache.add(url).catch(() => undefined)))

  // The build is hashed, so read the real filenames out of the shell.
  try {
    const response = await fetch('./index.html', { cache: 'reload' })
    const html = await response.text()
    const assets = new Set()
    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const url = match[1]
      if (url.startsWith('./assets/')) assets.add(url)
    }
    await Promise.all([...assets].map((url) => cache.add(url).catch(() => undefined)))
  } catch {
    // Online-next-visit still caches everything through the fetch handler.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE)
        const cached =
          (await cache.match(request)) ||
          (await cache.match('./index.html')) ||
          (await cache.match('./'))
        const network = fetch(request)
          .then(async (response) => {
            if (response.ok) await cache.put('./index.html', response.clone())
            return response
          })
          .catch(() => null)
        // Online: fresh HTML almost instantly. Offline: cached shell after a
        // beat, rather than waiting out the network stack's own timeout.
        const fresh = await Promise.race([network, new Promise((r) => setTimeout(() => r(null), 1200))])
        return fresh || cached || Response.error()
      })(),
    )
    return
  }

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request)
          .then((response) => {
            if (response.ok && response.type === 'basic') {
              const copy = response.clone()
              void caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined)
            }
            return response
          })
          .catch(() => hit || Response.error()),
    ),
  )
})
