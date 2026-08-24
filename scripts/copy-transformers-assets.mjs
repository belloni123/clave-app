import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'node_modules', '@huggingface', 'transformers', 'dist')
const destination = join(root, 'public', 'vendor', 'transformers')
const workerDestination = join(root, 'public', 'workers')
const files = [
  'ort-wasm-simd-threaded.jsep.mjs',
  'ort-wasm-simd-threaded.jsep.wasm',
]

await Promise.all([
  mkdir(destination, { recursive: true }),
  mkdir(workerDestination, { recursive: true }),
])
await Promise.all(files.map((file) => copyFile(join(source, file), join(destination, file))))

await build({
  entryPoints: [join(root, 'workers', 'transcription.worker.js')],
  outfile: join(workerDestination, 'transcription.worker.js'),
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  logLevel: 'warning',
})
