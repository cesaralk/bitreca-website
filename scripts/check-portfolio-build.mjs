import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build as buildClient } from 'vite'
import react from '@vitejs/plugin-react'
import { build as buildWorker } from 'esbuild'

// Intentionally bypass vite.config.js and the Cloudflare plugin. No Wrangler,
// bindings, .env/.dev.vars, network, or project build artifacts are involved.
const temporary = await mkdtemp(join(tmpdir(), 'portfolioforest-build-'))
const result = await buildClient({ configFile: false, envDir: temporary, cacheDir: join(temporary, 'cache'),
  plugins: [react()], publicDir: false, logLevel: 'warn', build: { write: false, outDir: join(temporary, 'output') } })
const bundles = Array.isArray(result) ? result : [result]
const count = bundles.reduce((sum, bundle) => sum + bundle.output.length, 0)
for (const entry of ['worker/index.js', 'portfolio-hosting/index.js']) {
  await buildWorker({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'browser', logLevel: 'silent' })
}
console.log(`PASS: Vite/React production client compiled in memory (${count} outputs); both Workers bundled in memory. Cloudflare integration was not invoked; static public assets were not copied.`)
