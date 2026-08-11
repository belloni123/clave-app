export const PROJECT_MODULES = [
  { key: 'concepcao', name: 'Concepção' },
  { key: 'comunicacao', name: 'Comunicação' },
  { key: 'lancamentos', name: 'Lançamentos' },
  { key: 'validacao', name: 'Validação direta' },
  { key: 'historias', name: 'Banco de histórias' },
  { key: 'financeiro', name: 'Financeiro' },
  { key: 'planejador', name: 'Planejador' },
  { key: 'urlbuilder', name: 'Links & QR Code' },
  { key: 'chips', name: 'Controle de Chips' },
  { key: 'formularios', name: 'Formulários' },
  { key: 'acesso', name: 'Central de acesso' },
] as const

export type ProjectModuleKey = (typeof PROJECT_MODULES)[number]['key']
export type AppModuleKey = 'home' | 'candidaturas' | 'configuracoes' | ProjectModuleKey

export const DEFAULT_PROJECT_MODULES: ProjectModuleKey[] = PROJECT_MODULES.map(
  (module) => module.key,
)

export function isProjectModuleKey(value: string): value is ProjectModuleKey {
  return PROJECT_MODULES.some((module) => module.key === value)
}
