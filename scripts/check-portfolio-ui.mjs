import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

// A real browser, a loopback-only HTTP fixture, in-memory API state and bundles.
// Does NOT start Vite/Miniflare/Wrangler or load .env/.dev.vars/Cloudflare bindings.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pause = ms => new Promise(done => setTimeout(done, ms))
const directory = await mkdtemp(join(tmpdir(), 'portfolioforest-ui-'))
const candidates = process.argv[2] ? [process.argv[2]] : [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
]
let browserPath
for (const candidate of candidates) { try { await access(candidate); browserPath = candidate; break } catch { /* Try another installed browser. */ } }
if (!browserPath) throw new Error('No installed Chromium browser found. Pass its executable path; no browser is downloaded.')
const bundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
  import {MemoryRouter, Routes, Route} from 'react-router-dom'; import AdminLayout from './src/components/AdminLayout.jsx';
  import AdminPortfolios from './src/pages/AdminPortfolios.jsx'; import './src/index.css';
  createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/admin/portfolios']}><Routes>
    <Route path='/admin/portfolios' element={<AdminLayout><AdminPortfolios/></AdminLayout>}/>
    <Route path='/admin/login' element={<p>Fixture login redirect</p>}/></Routes></MemoryRouter>);`,
  loader: 'jsx', resolveDir: root }, bundle: true, write: false, outdir: directory, jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent' })
const javascript = bundle.outputFiles.find(file => file.path.endsWith('.js')).contents
const css = bundle.outputFiles.find(file => file.path.endsWith('.css')).contents
const records = [
  { id: 1, name: 'Amelia Stone', slug: 'amelia-fixture', profession: 'Product designer', description: 'Thoughtful digital experiences, presented beautifully.', status: 'published' },
  { id: 2, name: 'Noah Reed', slug: 'noah-fixture', profession: 'Creative developer', description: 'A new space for selected work and ideas.', status: 'draft' },
  { id: 3, name: 'Mia Chen', slug: 'mia-fixture', profession: 'Architect', description: 'Spaces designed around people.', status: 'published' },
].map(record => ({ ...record, deletion_requested_at: null, deletion_eligibility: { canRequest: true, message: 'Request eligible; inventory checks remain required.' }, storage_prefix: `fixture/${record.id}/1/`, updated_at: '2026-01-01' }))
const state = { records, jobs: [], environment: 'production', stagingPreview: null, requestsEnabled: false, uploadMode: 'hold', uploads: 0, deletes: 0, retries: 0,
  releaseUpload: null, releaseInitial: null, initialHeld: false, pendingChecks: 0, lastUploadBody: '', failList: false }
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://fixture.invalid').pathname
    function json(data, status = 200) { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(data)) }
    if (path === '/app.js') { response.writeHead(200, { 'Content-Type': 'application/javascript' }); response.end(javascript); return }
    if (path === '/app.css') { response.writeHead(200, { 'Content-Type': 'text/css' }); response.end(css); return }
    if (!path.startsWith('/api/')) {
      response.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:" })
      response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>'); return
    }
    const chunks = []; for await (const chunk of request) chunks.push(chunk)
    const body = Buffer.concat(chunks).toString()
    if (state.unauthorized) { json({ success: false }, 401); return }
    if (path === '/api/admin/portfolios' && request.method === 'GET') {
      if (!state.initialHeld) { state.initialHeld = true; await new Promise(done => { state.releaseInitial = done }) }
      if (state.failList) { state.failList = false; json({ success: false }, 503); return }
      json({ success: true, portfolios: state.records }); return
    }
    if (path === '/api/admin/portfolio-deletion-capabilities') { json({ success: true, environment: state.environment, stagingPreview: state.stagingPreview, requestsEnabled: state.requestsEnabled, cleanupEnabled: false, message: 'Isolated fixture: destructive execution is disabled.' }); return }
    if (path === '/api/admin/portfolio-deletion-jobs') { json({ success: true, jobs: state.jobs, nextCursor: null }); return }
    const job = path.match(/portfolio-deletion-jobs\/([^/]+)(\/retry)?$/)
    if (job) {
      if (job[2]) { state.retries++; json({ success: true, job: state.jobs[0] }, 202) }
      else json({ success: true, job: state.jobs.find(item => item.id === job[1]) })
      return
    }
    const route = path.match(/\/portfolios\/(\d+)(?:\/(.*))?$/)
    if (route) {
      const portfolio = state.records.find(item => item.id === Number(route[1]))
      if (route[2] === 'file-check') {
        if (portfolio?.deletion_requested_at != null) { state.pendingChecks++; json({ success: false }, 409) }
        else if (portfolio?.id === 2) json({ success: false }, 503)
        else json({ success: true, fileExists: true })
        return
      }
      if (route[2]?.startsWith('upload')) {
        state.uploads++; state.lastUploadBody = body
        if (state.uploadMode === 'hold') await new Promise(done => { state.releaseUpload = done })
        if (state.uploadMode === 'conflict') { portfolio.storage_prefix += 'changed/'; json({ success: false, message: 'Conflict' }, 409) }
        else if (state.uploadMode === 'failure') json({ success: false, message: 'Fixture storage unavailable. Previous version remains selected.' }, 503)
        else json({ success: true })
        return
      }
      if (route[2] === 'status') { portfolio.status = JSON.parse(body).status; json({ success: true }); return }
      if (request.method === 'DELETE') {
        assert.equal(request.headers['x-portfolio-delete-confirm'], String(portfolio.id))
        state.deletes++; portfolio.status = 'draft'; portfolio.deletion_requested_at = 1
        const item = { id: '11111111-1111-4111-8111-111111111111', portfolio_id: portfolio.id, created_at: 1, phase: 'pending',
          progress: { allocations: 2, empty_prefixes: 0, confirmed_objects: 0 }, error: { code: 'INVENTORY_INCOMPLETE', message: 'Waiting for independently verified ownership.' } }
        portfolio.deletion_job_id = item.id; state.jobs.push(item); json({ success: true, job: item }, 202); return
      }
      if (request.method === 'PUT') { Object.assign(portfolio, JSON.parse(body)); json({ success: true }); return }
    }
    if (path === '/api/admin/portfolios' && request.method === 'POST') {
      state.records.push({ ...JSON.parse(body), id: 4, status: 'draft', deletion_requested_at: null, storage_prefix: 'fixture/4/1/', updated_at: '2026-01-01' })
      json({ success: true }, 201); return
    }
    json({ success: false }, 404)
  } catch { response.writeHead(500); response.end('Fixture request failed') }
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = spawn(browserPath, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--disable-component-update', '--disable-sync', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${join(directory, 'browser-profile')}`,
  '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket
try {
  let port
  for (let attempt = 0; attempt < 200; attempt++) {
    try { port = (await readFile(join(directory, 'browser-profile', 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break } catch { await pause(100) }
  }
  assert.ok(port, 'Headless browser did not start')
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl)
  await new Promise((done, fail) => { socket.addEventListener('open', done, { once: true }); socket.addEventListener('error', fail, { once: true }) })
  let sequence = 0
  const pending = new Map(), exceptions = []
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data))
    if (message.id) {
      const entry = pending.get(message.id); pending.delete(message.id)
      if (message.error) entry.reject(new Error(message.error.message)); else entry.resolve(message.result)
    }
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text)
  })
  const send = (method, params = {}) => new Promise((resolveResult, reject) => { const id = ++sequence; pending.set(id, { resolve: resolveResult, reject }); socket.send(JSON.stringify({ id, method, params })) })
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
    return result.result.value
  }
  async function waitFor(expression) {
    for (let attempt = 0; attempt < 200; attempt++) { if (await evaluate(`Boolean(${expression})`)) return; await pause(50) }
    throw new Error('UI assertion timed out: ' + expression)
  }
  const click = expression => evaluate(`(${expression}).click()`)
  const value = (selector, text) => evaluate(`{const element=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(element,${JSON.stringify(text)});element.dispatchEvent(new Event('input',{bubbles:true}));}`)
  const card = id => `document.querySelector('[data-portfolio-id="${id}"]')`
  const button = (container, text) => `[...(${container}).querySelectorAll('button')].find(button=>button.textContent.includes(${JSON.stringify(text)}))`
  async function refreshFixture() { await click(button('document', 'Refresh')); await pause(100) }
  async function screenshot(name, width, height, mobile = false) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })
    await pause(120)
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'Horizontal overflow at ' + width)
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await writeFile(join(directory, name), Buffer.from(shot.data, 'base64'))
  }
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable')
  await send('Network.setBlockedURLs', { urls: ['*bitreca.com*', 'https://*'] })
  await send('Page.navigate', { url: origin })
  await waitFor('document.body.textContent.includes("Loading your portfolios")')
  while (!state.releaseInitial) await pause(10)
  state.releaseInitial()
  await waitFor(`${card(1)} && ${card(2)}`)
  await waitFor(`${card(2)}.textContent.includes('File check unavailable')`)
  assert.equal(await evaluate(`${button(card(1), 'Delete Portfolio Permanently')}.disabled`), true)
  assert.equal(await evaluate("document.querySelector('[role=progressbar]')!==null"), false)
  await screenshot('portfolioforest-desktop.png', 1440, 1050)
  await screenshot('portfolioforest-mobile.png', 390, 844, true)
  await evaluate(`${card(1)}.scrollIntoView({behavior:'instant'})`)
  await screenshot('portfolioforest-mobile-card.png', 390, 844, true)
  await evaluate('window.scrollTo({top:0,behavior:"instant"})')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false })
  state.environment = 'staging'
  await refreshFixture()
  await waitFor("document.body.textContent.includes('Staging environment')")
  assert.equal(await evaluate("[...document.querySelectorAll('.pf-address a')].length"), 0)
  state.stagingPreview = { hostname: 'bitreca-portfolio-hosting-staging.fixture.workers.dev', slug: 'amelia-fixture' }
  await refreshFixture()
  await waitFor(`${card(1)}.querySelector('.pf-address a')?.href==='https://bitreca-portfolio-hosting-staging.fixture.workers.dev/'`)
  assert.equal(await evaluate(`${card(3)}.querySelector('.pf-address a')===null`), true)
  await screenshot('portfolioforest-staging-links.png', 1440, 1050)
  state.environment = 'production'; state.stagingPreview = null
  await refreshFixture()
  await waitFor(`${card(1)}.querySelector('.pf-address a')?.href==='https://amelia-fixture.bitreca.com/'`)
  await value('input[type=search]', 'Noah')
  await waitFor(`${card(2)} && !${card(1)}`)
  await value('input[type=search]', '')
  await waitFor(`${card(1)} && ${card(2)}`)
  await evaluate("{const select=document.querySelector('.pf-toolbar select');select.value='draft';select.dispatchEvent(new Event('change',{bubbles:true}));}")
  await waitFor(`${card(2)} && !${card(1)}`)
  await evaluate("{const select=document.querySelector('.pf-toolbar select');select.value='all';select.dispatchEvent(new Event('change',{bubbles:true}));}")
  await waitFor(`${card(1)} && ${card(2)}`)
  await click(button(card(2), 'Edit details'))
  await waitFor("document.querySelector('dialog[open]')")
  await value('#pf-profession', 'Fixture profession updated')
  await click("document.querySelector('dialog button[type=submit]')")
  await waitFor(`${card(2)}.textContent.includes('Fixture profession updated') && !document.querySelector('dialog')`)
  await evaluate('window.fixtureConfirmations=[];window.confirm=text=>{window.fixtureConfirmations.push(text);return true}')
  const upload = folder => evaluate(`{const input=(${card(1)}).querySelector(${JSON.stringify(folder ? 'input[webkitdirectory]' : 'input[accept]')});const data=new DataTransfer();const file=new File(['fake HTML'],'index.html',{type:'text/html'});${folder ? "Object.defineProperty(file,'webkitRelativePath',{value:'site/index.html'});" : ''}data.items.add(file);${folder ? "const css=new File(['fake CSS'],'style.css');Object.defineProperty(css,'webkitRelativePath',{value:'site/assets/style.css'});data.items.add(css);" : ''}input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));}`)
  await upload(false)
  await waitFor(`${card(1)}.getAttribute('aria-busy')==='true'`)
  assert.equal(await evaluate(`${button(card(1), 'Unpublish')}.disabled`), true)
  assert.equal(await evaluate(`${button(card(1), 'Edit details')}.disabled`), true)
  while (!state.releaseUpload) await pause(10)
  await upload(false); assert.equal(state.uploads, 1)
  state.uploadMode = 'conflict'; state.releaseUpload()
  await waitFor(`${card(1)}.textContent.includes('Another operation changed')`)
  assert.ok((await evaluate('window.fixtureConfirmations[0]')).includes('becomes live immediately'))
  state.uploadMode = 'success'
  await upload(true)
  await waitFor(`${card(1)}.textContent.includes('folder uploaded and activated successfully')`)
  assert.ok(state.lastUploadBody.includes('assets/style.css'))
  await upload(false)
  await waitFor(`${card(1)}.textContent.includes('Existing CSS, JavaScript, and images were preserved')`)
  state.uploadMode = 'failure'
  await upload(false)
  await waitFor(`${card(1)}.textContent.includes('Fixture storage unavailable')`)
  state.uploadMode = 'success'
  await click(button(card(2), 'Publish'))
  await waitFor(`${card(2)}.querySelector('.pf-badge').textContent==='Published'`)
  await click(button('document', 'Add Portfolio'))
  await waitFor("document.querySelector('dialog[open]')")
  await value('#pf-name', 'New fixture customer'); await value('#pf-slug', 'new-fixture')
  await click("document.querySelector('dialog button[type=submit]')")
  await waitFor("document.body.textContent.includes('New fixture customer') && !document.querySelector('dialog')")
  state.requestsEnabled = true
  await click(button('document', 'Refresh'))
  await waitFor(`!${button(card(1), 'Delete Portfolio Permanently')}.disabled`)
  await click(button(card(1), 'Delete Portfolio Permanently'))
  await waitFor("document.querySelector('dialog[open]')")
  assert.ok(await evaluate("document.querySelector('dialog').textContent.includes('amelia-fixture.bitreca.com')"))
  assert.equal(await evaluate("document.querySelector('dialog').textContent.includes('Fixture storage unavailable')"), false)
  await value('#pf-delete-confirm', 'wrong')
  assert.equal(await evaluate("document.querySelector('dialog button[type=submit]').disabled"), true)
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
  assert.equal(await evaluate("document.querySelector('dialog').contains(document.activeElement)"), true)
  await value('#pf-delete-confirm', '1')
  await screenshot('portfolioforest-delete-confirmation.png', 1440, 1050)
  await screenshot('portfolioforest-mobile-confirmation.png', 390, 844, true)
  assert.equal(await evaluate("document.querySelector('dialog').getBoundingClientRect().width < innerWidth"), true)
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false })
  await click("document.querySelector('dialog button[type=submit]')")
  await waitFor(`${card(1)}.textContent.includes('Pending deletion') && !document.querySelector('dialog')`)
  assert.equal(state.deletes, 1)
  assert.equal(await evaluate(`[...${card(1)}.querySelectorAll('button')].every(button=>button.disabled)`), true)
  assert.notEqual(await evaluate("document.querySelector('.pf-job .pf-badge').textContent"), 'Permanently deleted')
  state.jobs[0].phase = 'blocked'; state.jobs[0].error = { message: 'Legacy ownership needs independent review.' }
  await click(button('document', 'Refresh'))
  await waitFor("document.querySelector('.pf-job').textContent.includes('Legacy ownership')")
  await click(button("document.querySelector('.pf-job')", 'Recheck'))
  await waitFor("document.querySelector('.pf-job').textContent.includes('Retry requested')")
  assert.equal(state.retries, 1)
  state.jobs[0].phase = 'finalized'; state.jobs[0].error = null; state.jobs[0].progress.empty_prefixes = 2
  state.records = state.records.filter(portfolio => portfolio.id !== 1)
  await click(button('document', 'Refresh'))
  await waitFor(`!${card(1)} && document.querySelector('.pf-job .pf-badge').textContent==='Permanently deleted'`)
  assert.equal(state.pendingChecks, 0)
  state.failList = true
  await click(button('document', 'Refresh'))
  await waitFor("document.body.textContent.includes('Refresh failed')")
  assert.ok(await evaluate(`${card(2)}!==null`))
  state.unauthorized = true
  await click(button('document', 'Refresh'))
  await waitFor("document.body.textContent.includes('Fixture login redirect')")
  assert.deepEqual(exceptions, [])
  console.log('PASS: real-browser desktop/mobile cards and modal, search/filter/edit, loading, upload locks/failure, published warning, 409 refresh, folder paths, HTML preservation message, publishing, creation, typed deletion, focus containment, pending locks, blocked/retry/finalized evidence, refresh failure, and expired-session redirect. All API/storage data were mocked.')
  console.log('Screenshots: ' + directory)
} finally {
  state.releaseInitial?.(); state.releaseUpload?.()
  socket?.close(); browser.kill()
  await new Promise(done => server.close(done))
}
