import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { createHash } from 'node:crypto'

export function stagingFixtureFiles() {
  const files = {}
  for (const [site, label] of [['portfolio-a', 'Fixture A'], ['portfolio-b', 'Fixture B']]) {
    files[site + '/index.html'] = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${label}</title><link rel="stylesheet" href="/assets/style.css"><script src="./assets/app.js" defer></script></head><body><h1>${label}</h1><img src="/assets/mark.svg" alt="Test mark" width="32" height="32"><p id="result">Static fixture</p></body></html>`
    files[site + '/assets/style.css'] = `body{font:16px system-ui;background:${site.endsWith('a') ? '#edf6ff' : '#effff5'};color:#12233b;margin:2rem}`
    files[site + '/assets/app.js'] = `document.getElementById('result').textContent=${JSON.stringify(label + ' script loaded')}`
    files[site + '/assets/mark.svg'] = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="12" fill="#2763bd"/></svg>'
  }
  files['html-replacement/index.html'] = files['portfolio-a/index.html'].replaceAll('Fixture A', 'Fixture A replacement')
  assert.ok(Object.values(files).reduce((sum, file) => sum + new TextEncoder().encode(file).length, 0) < 5000)
  return files
}
export async function prepareStagingFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'portfolioforest-tiny-fixture-')), files = []
  for (const [name, content] of Object.entries(stagingFixtureFiles())) {
    const path = join(directory, name)
    await mkdir(dirname(path), { recursive: true }); await writeFile(path, content, { flag: 'wx' })
    files.push({ path: name, bytes: new TextEncoder().encode(content).length, sha256: createHash('sha256').update(content).digest('hex') })
  }
  return { directory, files, totalBytes: files.reduce((sum, file) => sum + file.bytes, 0), note: 'Fake static fixtures only; identical filenames in A/B, relative/root-relative assets. No upload or Cloudflare request was made.' }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await prepareStagingFixture(), null, 2))
