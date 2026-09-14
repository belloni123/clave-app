import { describe, expect, it } from 'vitest'
import { PROJECT_MODULES } from '@/utils/module-access'
import { HELP_ARTICLES, findHelpArticles } from './knowledge'
import { acquireHelpSlot } from './rate-limit'

describe('Ajuda do Clave', () => {
  it('cobre todos os módulos e não duplica IDs', () => {
    for (const entry of PROJECT_MODULES) expect(HELP_ARTICLES.some((article) => article.module === entry.key)).toBe(true)
    expect(new Set(HELP_ARTICLES.map((article) => article.id)).size).toBe(HELP_ARTICLES.length)
  })
  it.each([
    ['Onde calculo a precificação de serviço?', 'servicos'],
    ['Como cadastro uma história?', 'historias'],
    ['Onde está o link do formulário do cliente?', 'formularios'],
    ['Script de comentários do webnário', 'webnario'],
    ['Projeção do evento presencial', 'presencial'],
  ])('localiza %s', (question, id) => {
    expect(findHelpArticles(question).map((article) => article.id)).toContain(id)
  })
  it('limita concorrência, minuto e dia por usuário e libera o slot', () => {
    const start = 1_800_000_000_000
    const release = acquireHelpSlot('limits', start)
    expect(release).not.toBeNull()
    expect(acquireHelpSlot('limits', start)).toBeNull()
    release?.()
    for (let index = 1; index < 12; index++) acquireHelpSlot('limits', start)?.()
    expect(acquireHelpSlot('limits', start)).toBeNull()
    for (let index = 12; index < 100; index++) {
      const slot = acquireHelpSlot('limits', start + index * 60_000)
      expect(slot).not.toBeNull(); slot?.()
    }
    expect(acquireHelpSlot('limits', start + 101 * 60_000)).toBeNull()
    expect(acquireHelpSlot('limits', start + 86_400_001)).not.toBeNull()
  })
})
