import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const hash = (value) => createHash('sha256').update(value).digest('hex')
const knowledge = readFileSync(join(root, 'utils/help/knowledge.json'))
const catalog = JSON.parse(knowledge)
if (!catalog.version || !catalog.articles?.length) throw new Error('Base de ajuda vazia.')
const files = {}
function walk(path) {
  for (const entry of readdirSync(join(root, path), { withFileTypes: true })) {
    const next = join(path, entry.name)
    if (entry.isDirectory()) walk(next)
    else if (/\.(tsx?|json)$/.test(next) && !/\.(test|spec)\./.test(next) && !next.startsWith('app/api/help/')) {
      files[next] = hash(readFileSync(join(root, next)))
    }
  }
}
for (const path of ['components', 'app', 'utils', 'store', 'types']) walk(path)
// The knowledge itself is covered separately, not its maintenance snapshot/tests.
for (const path of Object.keys(files)) if (path.startsWith('utils/help/')) delete files[path]
const snapshotPath = join(root, 'utils/help/reviewed-sources.json')
const previous = existsSync(snapshotPath) ? JSON.parse(readFileSync(snapshotPath, 'utf8')) : null
const changed = [...new Set([...Object.keys(files), ...Object.keys(previous?.files ?? {})])].filter((path) => previous?.files[path] !== files[path])
const knowledgeHash = hash(knowledge)
if (process.argv.includes('--review')) {
  if (previous && changed.length && previous.knowledgeHash === knowledgeHash) throw new Error('Revise e atualize knowledge.json (incluindo version) antes de confirmar alterações de funcionalidade. Não renove apenas o snapshot.')
  if (previous && previous.knowledgeHash !== knowledgeHash && previous.version === catalog.version) throw new Error('Atualize a versão da base de ajuda.')
  writeFileSync(snapshotPath, JSON.stringify({ version: catalog.version, knowledgeHash, files }, null, 2) + '\n')
  console.log(`Revisão registrada em ${relative(root, snapshotPath)} (${Object.keys(files).length} arquivos).`)
} else {
  if (!previous || changed.length || previous.knowledgeHash !== knowledgeHash) {
    console.error('A ajuda do Clave precisa ser revisada antes de publicar. Atualize utils/help/knowledge.json e execute npm run help:review. Arquivos alterados:', changed.join(', '))
    process.exitCode = 1
  } else console.log(`Ajuda ${catalog.version} verificada: ${catalog.articles.length} guias, ${Object.keys(files).length} fontes.`)
}
