import type { SourceGrade } from '@/components/SourceCredit'

export interface SourceCreditData {
  grade: SourceGrade
  source: string
}

export const SOURCE_CREDITS = {
  mecanismoUnico: {
    grade: 'S',
    source: 'Eugene Schwartz, Breakthrough Advertising (1966); elemento central da publicidade de resposta direta.',
  },
  resultadoAlvo: {
    grade: 'S',
    source: 'Theodore Levitt, Marketing Myopia (Harvard Business Review, 1960), relacionado ao Jobs-to-be-Done de Clayton Christensen.',
  },
  beneficioEstendido: {
    grade: 'S',
    source: 'Jonathan Gutman, Means-End Chain Theory (1982), que conecta atributos, consequências e valores humanos.',
  },
  vsl: {
    grade: 'S',
    source: '12 blocos operacionais consolidados a partir de AIDA, Eugene Schwartz e Jon Benson; os 5 passos de Benson formam o núcleo da estrutura.',
  },
  cplConteudo: {
    grade: 'S',
    source: 'Jeff Walker, Product Launch Formula; Launch (2014). CPL aqui significa conteúdo de pré-lançamento (PLC).',
  },
  cplCusto: {
    grade: 'C',
    source: 'Convenção de mercado para Custo Por Lead: investimento em mídia paga dividido pelos leads captados.',
  },
  dre: {
    grade: 'S',
    source: 'Lei 6.404/1976, art. 187, e CPC 26: Demonstração do Resultado do Exercício.',
  },
  cpa: {
    grade: 'C',
    source: 'Convenção de mercado para Custo por Aquisição; o Clave calcula o CPA máximo sustentável com base na margem disponível.',
  },
  matriz: {
    grade: 'O',
    source: 'Matriz de organização própria do Clave, com raízes conceituais em Eugene Schwartz e Tversky & Kahneman.',
  },
  benchmarking: {
    grade: 'S',
    source: 'Robert Camp, Benchmarking (1989), a partir da prática de benchmarking da Xerox nos anos 1980.',
  },
  chipStatus: {
    grade: 'C',
    source: 'Quarentena, Restrição 24h e Aquecimento são convenções operacionais de gestão de contas e prevenção de bloqueios em WhatsApp.',
  },
  maturityLevels: {
    grade: 'S',
    source: 'Larry Greiner, Evolution and Revolution as Organizations Grow (Harvard Business Review, 1972), combinado com Traction de Gino Wickman (2011) e Weinberg & Mares (2015).',
  },
  mmq: {
    grade: 'P',
    source: 'Sigla MMQ ainda não foi definida no documento de padronização. Defina o significado antes de substituir este rótulo.',
  },
} satisfies Record<string, SourceCreditData>
