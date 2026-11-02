import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deletionConfirmed, folderUploadData, mapLimited, mergeJobEvidence, portfolioAddress, portfolioState } from '../src/utils/portfolioAdmin.js'

test('admin helpers preserve publication and deletion distinctions and exact confirmation', () => {
  const portfolio = { id: 7, slug: 'fake-customer', status: 'published', deletion_requested_at: null }
  assert.equal(portfolioState(portfolio), 'published')
  assert.equal(portfolioState({ ...portfolio, deletion_requested_at: 1 }), 'pending')
  assert.equal(portfolioState({ ...portfolio, deletion_requested_at: 1 }, { phase: 'blocked' }), 'blocked')
  assert.equal(portfolioState(portfolio, { phase: 'finalized' }), 'finalized')
  assert.equal(portfolioAddress(portfolio), 'https://fake-customer.bitreca.com')
  assert.equal(portfolioAddress({ slug: 'javascript:alert(1)' }), null)
  assert.equal(deletionConfirmed(portfolio, '7'), true)
  for (const value of ['07', '7 ', 'fake-customer', '', '8']) assert.equal(deletionConfirmed(portfolio, value), false)
})
test('folder preparation preserves relative paths and excludes sensitive or tooling folders', () => {
  function file(name, path) { const value = new File(['fixture'], name); Object.defineProperty(value, 'webkitRelativePath', { value: path }); return value }
  const data = folderUploadData([file('index.html', 'site/index.html'), file('style.css', 'site/assets/style.css'),
    file('config', 'site/.git/config'), file('x.js', 'site/node_modules/x.js'), file('secret', 'site/.hidden/secret'), file('README.md', 'site/README.md')])
  assert.deepEqual(data.getAll('paths'), ['index.html', 'assets/style.css'])
  assert.throws(() => folderUploadData([]), /No supported/)
  assert.throws(() => folderUploadData([file('index.html', 'index.html')]), /relative asset paths/)
})
test('file-status checks use a bounded concurrency queue and preserve order', async () => {
  let active = 0, maximum = 0
  const values = await mapLimited([1, 2, 3, 4, 5, 6, 7], 3, async value => {
    active++; maximum = Math.max(active, maximum)
    await new Promise(resolve => setTimeout(resolve, 1))
    active--; return value * 2
  })
  assert.equal(maximum, 3)
  assert.deepEqual(values, [2, 4, 6, 8, 10, 12, 14])
})
test('a late pending response cannot downgrade a confirmed finalization receipt in the UI', () => {
  const current = { fixture: { id: 'fixture', phase: 'finalized' } }
  assert.equal(mergeJobEvidence(current, [{ id: 'fixture', phase: 'pending' }]).fixture.phase, 'finalized')
})
