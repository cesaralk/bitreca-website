import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

test('actual workerd public allowlist and publication-checked D1/R2 image access', async t => {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('../worker/index.js', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'browser' })
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-09-23', d1Databases: ['bitreca_db'], r2Buckets: ['bitreca_media'] }))
  t.after(() => mf.dispose())
  const db = await mf.getD1Database('bitreca_db'), bucket = await mf.getR2Bucket('bitreca_media')
  const sql = readFileSync(new URL('../migrations/0019_add_store_catalogue.sql', import.meta.url), 'utf8')
  for (const statement of sql.match(/CREATE TRIGGER[\s\S]*?END;|CREATE (?:TABLE|INDEX)[\s\S]*?;/g)) await db.prepare(statement).run()
  const c = crypto.randomUUID(), p = crypto.randomUUID(), key = `store-catalogue/${crypto.randomUUID()}.png`
  await db.prepare("INSERT INTO store_categories(id,creation_hash,title,slug,status) VALUES(?,?,?,?,?)").bind(c, 'a'.repeat(64), 'Runtime fixture', 'runtime', 'published').run()
  await db.prepare("INSERT INTO store_products(id,creation_hash,category_id,title,sku,slug,status,image_key,internal_notes) VALUES(?,?,?,?,?,?,?,?,?)").bind(p, 'b'.repeat(64), c, 'Runtime product', 'RUNTIME', 'runtime', 'published', key, 'PRIVATE-SENTINEL').run()
  await bucket.put(key, Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const call = suffix => mf.dispatchFetch('https://bitreca.test/api/store/products' + suffix)
  const list = await call(''); assert.equal(list.status, 200); assert(!(await list.text()).includes('PRIVATE-SENTINEL'))
  const image = await call('/runtime/image'); assert.equal(image.status, 200); assert.equal(image.headers.get('Cache-Control'), 'no-store'); assert.equal(image.headers.get('Content-Type'), 'image/png')
  await db.prepare("UPDATE store_products SET status='draft' WHERE id=?").bind(p).run()
  assert.equal((await call('/runtime')).status, 404); assert.equal((await call('/runtime/image')).status, 404)
  assert.deepEqual((await (await call('')).json()).products, [])
})
