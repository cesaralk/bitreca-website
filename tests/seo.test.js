import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { pageSeo, projectSeo, publicPages, safeJsonLd, seoTags, structuredData } from '../shared/seo.js'

test('truthful unique marketing metadata, safe serialization and no invented business attributes', () => {
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'))
  assert.equal(config.assets.binding, 'ASSETS'); assert(config.assets.run_worker_first.includes('/api/*')); assert(!config.assets.run_worker_first.includes('/*'))
  for (const path of Object.keys(publicPages)) assert(config.assets.run_worker_first.includes(path))
  assert.equal(new Set(Object.values(publicPages).map(page => page[0])).size, Object.keys(publicPages).length)
  assert.equal(new Set(Object.values(publicPages).map(page => page[1])).size, Object.keys(publicPages).length)
  for (const path of Object.keys(publicPages)) {
    const seo = pageSeo(path + (path === '/' ? '' : '/')), data = structuredData(seo)
    assert.equal(seo.path, path); assert.equal(seo.noindex, false)
    assert(!/"(?:review|aggregateRating|address|foundingDate|employee|award|offers)":/.test(JSON.stringify(data)))
  }
  const malicious = projectSeo({ slug: 'safe', title: '</title><script>alert(1)</script>', description: 'Text & "quotes"' })
  assert(!seoTags(malicious).includes('</title><script>alert'))
  assert(!safeJsonLd(structuredData(malicious)).includes('<script>'))
  assert.throws(() => projectSeo({ slug: '../admin', title: 'Private', description: 'Hidden' }))
  assert.equal(pageSeo('/admin/enquiries').noindex, true)
})

test('real workerd HTML metadata and indexing endpoints remain separate from protected APIs', async t => {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('../worker/index.js', import.meta.url))], bundle: true, write: false, platform: 'browser', format: 'esm' })
  let assetReads = 0
  const shell = '<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Old title</title><meta name="description" content="Old"><meta name="robots" content="old"><link rel="canonical" href="https://invalid.test"><meta property="og:title" content="old"><script data-bitreca-seo type="application/ld+json">{"old":true}</script></head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>'
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-09-23', d1Databases: ['bitreca_db'], bindings: { ADMIN_USERNAME: 'synthetic-owner', ADMIN_PASSWORD: 'synthetic-password', SESSION_SECRET: 'synthetic-only', ADMIN_AUTH_VERSION: '1' }, serviceBindings: { ASSETS: async request => { assetReads++; assert.equal(new URL(request.url).pathname, '/'); return new Response(shell, { headers: { 'Content-Type': 'text/html', ETag: 'old-shell', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' } }) } } }))
  t.after(() => mf.dispose())
  const db = await mf.getD1Database('bitreca_db')
  await db.prepare('CREATE TABLE projects(slug TEXT PRIMARY KEY,title TEXT,description TEXT,status TEXT,internal_notes TEXT)').run()
  for (const status of ['published', 'draft', 'archived']) await db.prepare('INSERT INTO projects VALUES(?,?,?,?,?)').bind(status + '-fixture', status === 'published' ? 'Real & safe </script> fixture' : 'PRIVATE TITLE', 'Isolated description "safe"', status, 'PRIVATE INTERNAL DATA').run()
  const get = (path, method = 'GET', host = 'bitreca.com') => mf.dispatchFetch('https://' + host + path, { method })
  await t.test('all public landing pages have initial HTML titles, canonical/social/structured data, without losing assets or security headers', async () => {
    for (const path of Object.keys(publicPages)) {
      const response = await get(path + '?utm_source=fixture'), text = await response.text()
      assert.equal(response.status, 200); assert.equal(response.headers.get('X-Frame-Options'), 'DENY'); assert.equal(response.headers.get('ETag'), null)
      assert(text.includes('src="/assets/app.js"')); assert.equal((text.match(/<title>/g) || []).length, 1)
      assert.equal((text.match(/name="description"/g) || []).length, 1); assert.equal((text.match(/rel="canonical"/g) || []).length, 1)
      assert(text.includes('href="https://bitreca.com' + path + '"')); assert(!text.includes('utm_source'))
      assert(text.includes('name="twitter:card" content="summary_large_image"')); assert(text.includes('property="og:image:width" content="1200"'))
      const schema = JSON.parse(text.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)[1]); assert.equal(schema['@graph'][0].name, 'BITRECA')
      assert(response.headers.get('X-Robots-Tag').startsWith('index'))
    }
  })
  await t.test('published project metadata uses a public allowlist and escapes stored markup; drafts/missing/invalid paths return noindex 404', async () => {
    const response = await get('/projects/published-fixture'), text = await response.text()
    assert.equal(response.status, 200); assert(text.includes('Real &amp; safe &lt;/script&gt; fixture')); assert(!text.includes('PRIVATE INTERNAL DATA'))
    for (const slug of ['draft-fixture', 'archived-fixture', 'missing', 'bad%22slug']) {
      const response = await get('/projects/' + slug), text = await response.text(); assert.equal(response.status, 404); assert(response.headers.get('X-Robots-Tag').includes('noindex')); assert(!text.includes('PRIVATE TITLE'))
    }
  })
  await t.test('sitemap contains only canonical public landing paths and published project URLs; no private data or invented lastmod', async () => {
    const response = await get('/sitemap.xml'), text = await response.text()
    assert.equal(response.status, 200); assert(response.headers.get('Content-Type').startsWith('application/xml'))
    assert(text.includes('https://bitreca.com/projects/published-fixture')); assert(!/draft-fixture|archived-fixture|admin|enquiries|order-request|PRIVATE|lastmod|portfolio\/demo/.test(text))
    assert.equal((text.match(/<loc>/g) || []).length, Object.keys(publicPages).length + 1)
  })
  await t.test('private/demo HTML is noindex and uncached; www canonicalizes to apex; preview hosts stay noindex', async () => {
    for (const path of ['/admin', '/admin/login', '/admin/enquiries', '/admin/store/requests', '/store/request/review', '/portfolio/demo']) {
      const response = await get(path), text = await response.text(); assert.equal(response.status, 200); assert(response.headers.get('X-Robots-Tag').includes('noindex')); assert.equal(response.headers.get('Cache-Control'), 'no-store'); assert(!text.includes('application/ld+json'))
    }
    assert((await (await get('/services/', 'GET', 'www.bitreca.com')).text()).includes('href="https://bitreca.com/services"'))
    assert((await get('/services', 'GET', 'preview.workers.dev')).headers.get('X-Robots-Tag').includes('noindex'))
    assert((await (await get('/robots.txt')).text()).includes('Sitemap: https://bitreca.com/sitemap.xml'))
    assert(!(await (await get('/robots.txt')).text()).includes('Disallow: /api/\n'), 'public data must remain fetchable during rendering')
    assert.equal(await (await get('/robots.txt', 'GET', 'preview.workers.dev')).text(), 'User-agent: *\nDisallow: /\n')
  })
  await t.test('HEAD carries metadata headers without body; APIs/mutations/unknown assets bypass SEO; schema errors never invent indexable data', async () => {
    assert.equal(await (await get('/services', 'HEAD')).text(), '')
    const before = assetReads
    assert.equal((await get('/api/admin/store/requests')).status, 401)
    assert.equal((await get('/api/health')).status, 200)
    assert.equal((await get('/api/store/order-requests', 'POST')).status, 503)
    assert.equal(assetReads, before)
    await db.prepare('DROP TABLE projects').run()
    const response = await get('/sitemap.xml'); assert.equal(response.status, 503); assert.equal(response.headers.get('Cache-Control'), 'no-store')
    const project = await get('/projects/published-fixture'); assert.equal(project.status, 503); assert(project.headers.get('X-Robots-Tag').includes('noindex'))
  })
})
