import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { build as viteBuild } from 'vite'
import react from '@vitejs/plugin-react'
import { build as bundleWorker } from 'esbuild'
import { stagingResources, sandboxResources, validateStagingPair, validateSandboxPair } from './check-portfolio-config.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const digest = value => createHash('sha256').update(value).digest('hex')
export function packagePath(directory, name) {
  assert.equal(typeof name, 'string')
  assert.ok(name && !isAbsolute(name) && !name.includes('\\') && !name.split('/').some(part => !part || part === '.' || part === '..'))
  assert.ok(!/(?:^|\/)(?:\.env|\.dev\.vars|[^/]*private[^/]*|[^/]*signing-key[^/]*)(?:\.|\/|$)/i.test(name))
  const target = resolve(directory, name), child = relative(directory, target)
  assert.ok(child && !isAbsolute(child) && !child.startsWith('..'))
  return target
}
async function ordinaryFile(path) {
  assert.ok((await lstat(path)).isFile(), 'Package inputs must be regular files, never symlinks.')
  return readFile(path)
}
export async function verifyStagingPackage(directory) {
  directory = resolve(directory)
  const artifact = JSON.parse(await ordinaryFile(join(directory, 'deployment-artifact.json')))
  assert.equal(artifact.format, 1)
  assert.ok(['portfolioforest-staging', 'portfolioforest-delete-sandbox'].includes(artifact.target))
  const sandbox = artifact.target === 'portfolioforest-delete-sandbox'
  const resources = sandbox ? sandboxResources : stagingResources
  assert.ok(Array.isArray(artifact.files) && artifact.files.length > 15 && artifact.files.length < 20050)
  const recorded = new Set(['deployment-artifact.json'])
  for (const entry of artifact.files) {
    assert.ok(!recorded.has(entry.path)); recorded.add(entry.path)
    const file = packagePath(directory, entry.path)
    // Check every parent too: a symlinked client/migrations directory must not
    // redirect an approved manifest to a private or production file.
    let parent = dirname(file)
    while (parent !== directory) { assert.ok((await lstat(parent)).isDirectory()); parent = dirname(parent) }
    const content = await ordinaryFile(file)
    assert.equal(content.byteLength, entry.bytes); assert.equal(digest(content), entry.sha256)
  }
  async function inspect(folder, prefix = '') {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      assert.ok(!entry.isSymbolicLink())
      const name = prefix + entry.name
      if (entry.isDirectory()) await inspect(join(folder, entry.name), name + '/')
      else assert.ok(recorded.has(name), 'An unreviewed extra package file was found.')
    }
  }
  await inspect(directory)
  const main = JSON.parse(await ordinaryFile(join(directory, 'main.wrangler.jsonc')))
  const hosting = JSON.parse(await ordinaryFile(join(directory, 'hosting.wrangler.jsonc')))
  assert.equal(main.main, './main-worker.mjs'); assert.equal(hosting.main, './hosting-worker.mjs')
  assert.equal(main.assets.directory, './client')
  // Apply the same resource/control contract after normalizing only package paths.
  const sourceMain = { ...main, main: 'worker/index.js' }, sourceHosting = { ...hosting, main: 'portfolio-hosting/index.js' }
  if (sandbox) validateSandboxPair(sourceMain, sourceHosting)
  else validateStagingPair(sourceMain, sourceHosting, { allowPlaceholders: true })
  return { artifactSha256: digest(await ordinaryFile(join(directory, 'deployment-artifact.json'))), files: artifact.files.length,
    target: artifact.target, readiness: 'REQUIRES MANUAL APPROVAL', workers: [resources.mainName, resources.hostingName] }
}
export async function prepareStagingPackage({ sandbox = false } = {}) {
  const main = JSON.parse(await readFile(join(root, 'tests', 'fixtures', 'retired-environments', sandbox ? 'wrangler.delete-sandbox.jsonc' : 'wrangler.portfolio-staging.jsonc'), 'utf8'))
  const hosting = JSON.parse(await readFile(join(root, 'tests', 'fixtures', 'retired-environments', sandbox ? 'wrangler.delete-sandbox-hosting.jsonc' : 'wrangler.portfolio-hosting-staging.jsonc'), 'utf8'))
  if (sandbox) validateSandboxPair(main, hosting)
  else validateStagingPair(main, hosting, { allowPlaceholders: true })
  const temporary = await mkdtemp(join(tmpdir(), 'portfolioforest-staging-build-'))
  const directory = await mkdtemp(join(tmpdir(), 'portfolioforest-staging-release-'))
  const files = []
  async function emit(name, bytes) {
    const path = packagePath(directory, name)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, bytes, { flag: 'wx' })
    files.push({ path: name, bytes: Buffer.byteLength(bytes), sha256: digest(bytes) })
  }
  // No root Vite config, Cloudflare plugin, env-file inference or Wrangler.
  // Public files are explicitly allowlisted instead of recursively copying public/.
  const client = await viteBuild({ root, configFile: false, envDir: temporary, envPrefix: 'PORTFOLIO_UNUSED_PUBLIC_',
    cacheDir: join(temporary, 'cache'), plugins: [react()], publicDir: false, logLevel: 'warn',
    build: { write: false, outDir: join(temporary, 'client') } })
  for (const bundle of Array.isArray(client) ? client : [client]) for (const output of bundle.output) {
    const bytes = output.type === 'chunk' ? output.code : output.source
    assert.ok(Buffer.byteLength(bytes) <= 25 * 1024 * 1024)
    await emit('client/' + output.fileName, bytes)
  }
  for (const name of ['_headers', 'icons.svg', 'favicon.svg']) await emit('client/' + name, await ordinaryFile(join(root, 'public', name)))
  const sizes = {}
  for (const [entry, name] of [['worker/index.js', 'main-worker.mjs'], ['portfolio-hosting/index.js', 'hosting-worker.mjs']]) {
    const worker = await bundleWorker({ absWorkingDir: root, entryPoints: [entry], bundle: true, write: false,
      format: 'esm', platform: 'browser', target: 'es2022', minify: true, logLevel: 'silent' })
    assert.equal(worker.outputFiles.length, 1)
    const bytes = worker.outputFiles[0].contents
    sizes[name] = { bytes: bytes.byteLength, gzipBytes: gzipSync(bytes).byteLength }
    assert.ok(sizes[name].gzipBytes <= 3 * 1024 * 1024, 'Keep an intentionally conservative compressed Worker budget.')
    await emit(name, bytes)
  }
  const migrations = (await readdir(join(root, 'migrations'))).filter(name => /^\d{4}_.*\.sql$/.test(name)).sort()
  assert.equal(migrations.length, 14)
  for (const name of migrations) await emit('migrations/' + name, await ordinaryFile(join(root, 'migrations', name)))
  await emit('main.wrangler.jsonc', JSON.stringify({ ...main, ...(sandbox ? { find_additional_modules: false } : {}), main: './main-worker.mjs', assets: { ...main.assets, directory: './client' } }, null, 2) + '\n')
  await emit('hosting.wrangler.jsonc', JSON.stringify({ ...hosting, ...(sandbox ? { find_additional_modules: false } : {}), main: './hosting-worker.mjs' }, null, 2) + '\n')
  const artifact = { format: 1, target: sandbox ? 'portfolioforest-delete-sandbox' : 'portfolioforest-staging', files: files.sort((one, two) => one.path.localeCompare(two.path)) }
  await writeFile(join(directory, 'deployment-artifact.json'), JSON.stringify(artifact, null, 2) + '\n', { flag: 'wx' })
  const verification = await verifyStagingPackage(directory)
  return { directory, ...verification, sizes, warning: 'Review package/configuration, authenticate independently and authorize migrations/deployment separately. No command was executed against Cloudflare.' }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] && !['--verify', '--sandbox'].includes(process.argv[2])) throw new Error('Only offline preparation, --sandbox or --verify DIRECTORY is supported.')
    const result = process.argv[2] === '--verify' ? await verifyStagingPackage(process.argv[3]) : await prepareStagingPackage({ sandbox: process.argv[2] === '--sandbox' })
    console.log(JSON.stringify(result, null, 2))
  } catch { console.error('Offline staging package preparation/verification refused. Existing files were preserved; no Cloudflare command was run.'); process.exitCode = 1 }
}
