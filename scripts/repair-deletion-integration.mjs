import { readFile, writeFile, copyFile } from 'node:fs/promises'
import { join } from 'node:path'
const target = 'C:/Users/cezar/Desktop/bitreca-deletion-integration'
let worker = (await readFile(join(target, 'worker/index.js'), 'utf8')).replaceAll('\r\n', '\n')
worker = worker.replace(', readDeletionEligibility', '').replace(', supportsLegacyIdentity', '')
const start = worker.indexOf('    try {\n      const eligibility = await readDeletionEligibility')
if (start < 0) throw new Error('Expected one integration-only premark block')
const end = worker.indexOf('    // Protect legacy customers', start)
worker = worker.slice(0, start) + worker.slice(end)
await writeFile(join(target, 'worker/index.js'), worker)
await copyFile('scripts/prepare-deletion-integration.mjs', join(target, 'scripts/prepare-deletion-integration.mjs'))
console.log('Preserved existing request/freeze semantics; eligibility remains read-only and cleanup/finalization safeguards remain authoritative.')
