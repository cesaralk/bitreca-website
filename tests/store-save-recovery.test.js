import test from 'node:test'
import assert from 'node:assert/strict'
import { storeSaveMatches } from '../src/utils/storeSaveRecovery.js'
import { emptyProduct, validateStoreRecord } from '../shared/store-catalogue.js'

const id = '11111111-1111-4111-8111-111111111111'
const input = { ...emptyProduct(), title: '  Isolated product  ', slug: 'isolated-product', sku: 'fixture', category_id: id, image_key: 'store-catalogue/22222222-2222-4222-8222-222222222222.png', description: 'Owner-entered fixture', status: 'published' }
const { data } = validateStoreRecord('products', input)

test('a lost create response is confirmed only by the same saved ID and complete canonical product/image data', () => {
  assert.equal(storeSaveMatches({ ...data, id, version: 1 }, id, data, null), true)
  assert.equal(storeSaveMatches({ ...data, id: 'other', version: 1 }, id, data, null), false)
  assert.equal(storeSaveMatches(null, id, data, null), false)
  for (const change of [{ image_key: null }, { status: 'draft' }, { sku: 'OTHER' }, { price_minor: 1 }, { title: input.title }]) assert.equal(storeSaveMatches({ ...data, id, version: 1, ...change }, id, data, null), false)
  const missingImage = { ...data, id, version: 1 }; delete missingImage.image_key
  assert.equal(storeSaveMatches(missingImage, id, data, null), false)
})

test('a timed-out update cannot be claimed successful from an old version, a different published state or another image', () => {
  assert.equal(storeSaveMatches({ ...data, id, version: 3 }, id, data, 3), false)
  assert.equal(storeSaveMatches({ ...data, id, version: 4 }, id, data, 3), true)
  assert.equal(storeSaveMatches({ ...data, id, version: 4, status: 'draft' }, id, data, 3), false)
  assert.equal(storeSaveMatches({ ...data, id, version: 4, image_key: 'store-catalogue/33333333-3333-4333-8333-333333333333.png' }, id, data, 3), false)
})

test('null optional image/price fields and normalized canonical input are matched exactly without inventing saved values', () => {
  const draft = validateStoreRecord('products', { ...input, status: 'draft', image_key: null }).data
  assert.equal(draft.sku, 'FIXTURE'); assert.equal(draft.title, 'Isolated product')
  assert.equal(storeSaveMatches({ ...draft, id, version: 1 }, id, draft, null), true)
  assert.equal(storeSaveMatches({ ...draft, id, version: 1, price_minor: undefined }, id, draft, null), false)
})
