import type {
  BriefingAnswers,
  BriefingServiceType,
  BriefingSubmissionStatus,
} from '@/types/project-form'

export type BriefingQuestionType =
  | 'short'
  | 'long'
  | 'single'
  | 'multi'
  | 'date'
  | 'currency'
  | 'url'
  | 'urls'
  | 'file'

export interface BriefingQuestion {
  id: string
  label: string
  type: BriefingQuestionType
  required?: boolean
  help?: string
  placeholder?: string
  options?: string[]
  maxSelections?: number
  showWhen?: {
    questionId: string
    equals: string
  }
}

export interface BriefingStep {
  id: string
  title: string
  description: string
  service?: BriefingServiceType
  questions: BriefingQuestion[]
}

export const SERVICE_OPTIONS: Array<{
  value: BriefingServiceType
  label: string
  description: string
}> = [
  {
    value: 'launch',
    label: 'Lançamento Digital',
    description: 'Produto, público, posicionamento, histórico e metas do lançamento.',
  },
  {
    value: 'marketing',
    label: 'Marketing Digital',
    description: 'Negócio, marca, conteúdo, canais, concorrência e objetivos.',
  },
  {
    value: 'visual_identity',
    label: 'Identidade Visual',
    description: 'Essência, personalidade, direção visual e aplicações da marca.',
  },
]

const COMMON_STEPS: BriefingStep[] = [
  {
    id: 'identification',
    title: 'Identificação do projeto',
    description: 'Conte o contexto essencial para direcionarmos as próximas perguntas.',
    questions: [
      {
        id: 'project_name',
        label: 'Nome da empresa, marca ou projeto',
        type: 'short',
        required: true,
      },
      {
        id: 'service_type',
        label: 'Qual serviço será realizado?',
        type: 'single',
        required: true,
        options: SERVICE_OPTIONS.map((option) => option.value),
      },
      {
        id: 'project_description',
        label: 'Descreva resumidamente o projeto',
        type: 'long',
        required: true,
        help: 'Explique o que será desenvolvido e o contexto atual.',
      },
      {
        id: 'primary_objective',
        label: 'Qual é o principal objetivo deste projeto?',
        type: 'long',
        required: true,
      },
      {
        id: 'important_date',
        label: 'Existe uma data importante ou prazo desejado?',
        type: 'date',
      },
      {
        id: 'important_date_notes',
        label: 'Observações sobre o prazo',
        type: 'long',
        placeholder: 'Explique o motivo da data ou alguma flexibilidade existente.',
      },
    ],
  },
]

const LAUNCH_STEPS: BriefingStep[] = [
  {
    id: 'launch-product',
    service: 'launch',
    title: 'Produto',
    description: 'Vamos entender a oferta e a transformação que ela entrega.',
    questions: [
      { id: 'launch_product_name', label: 'Qual é o nome do produto?', type: 'short', required: true },
      { id: 'launch_product_description', label: 'Descreva o produto de maneira simples', type: 'long', required: true },
      {
        id: 'launch_product_type',
        label: 'Qual tipo de produto será lançado?',
        type: 'single',
        required: true,
        options: ['Curso online', 'Mentoria', 'Consultoria', 'Comunidade ou assinatura', 'E-book', 'Evento', 'Aplicativo ou ferramenta', 'Produto físico', 'Outro'],
      },
      { id: 'launch_transformation', label: 'Qual transformação ou resultado ele entrega?', type: 'long', required: true },
      { id: 'launch_product_structure', label: 'Como o produto está estruturado?', type: 'long', help: 'Descreva módulos, etapas, metodologia, duração e formato.' },
      { id: 'launch_main_differential', label: 'Qual é o principal diferencial do produto?', type: 'long', required: true },
      { id: 'launch_price', label: 'Qual é o preço atual ou pretendido?', type: 'currency' },
      { id: 'launch_guarantee_bonus', label: 'Existe garantia, bônus ou condição especial? Se sim, descreva.', type: 'long' },
    ],
  },
  {
    id: 'launch-audience',
    service: 'launch',
    title: 'Público',
    description: 'Quem deve comprar e o que influencia essa decisão.',
    questions: [
      { id: 'launch_audience', label: 'Para quem este produto foi criado?', type: 'long', required: true },
      { id: 'launch_pains', label: 'Quais são as principais dores desse público?', type: 'long', required: true },
      { id: 'launch_desires', label: 'Quais são seus maiores desejos?', type: 'long' },
      { id: 'launch_objections', label: 'Quais objeções podem impedir a compra?', type: 'long' },
      { id: 'launch_previous_attempts', label: 'O que esse público já tentou antes e por que não funcionou?', type: 'long' },
      { id: 'launch_has_persona', label: 'Existe uma persona definida?', type: 'single', options: ['Sim', 'Não'] },
      {
        id: 'launch_persona_description',
        label: 'Descreva a rotina, o contexto, o comportamento e o momento de compra dessa persona',
        type: 'long',
        showWhen: { questionId: 'launch_has_persona', equals: 'Sim' },
      },
    ],
  },
  {
    id: 'launch-positioning',
    service: 'launch',
    title: 'Posicionamento e comunicação',
    description: 'Defina os limites e os argumentos centrais da comunicação.',
    questions: [
      { id: 'launch_promise', label: 'Qual promessa pode ser comunicada de maneira verdadeira e responsável?', type: 'long', required: true },
      { id: 'launch_benefits', label: 'Quais benefícios devem receber mais destaque?', type: 'long' },
      { id: 'launch_avoid', label: 'Quais palavras, assuntos ou promessas devem ser evitados?', type: 'long' },
      { id: 'launch_competitors', label: 'Quem são os principais concorrentes ou produtos semelhantes?', type: 'long' },
      { id: 'launch_choice_reason', label: 'Por que o cliente deveria escolher este produto?', type: 'long', required: true },
      {
        id: 'launch_tone',
        label: 'Como a comunicação deve soar?',
        type: 'multi',
        options: ['Educativa', 'Inspiradora', 'Direta', 'Sofisticada', 'Próxima e informal', 'Técnica', 'Provocativa', 'Outra'],
      },
    ],
  },
  {
    id: 'launch-history',
    service: 'launch',
    title: 'Histórico e ativos',
    description: 'O que já existe e quais aprendizados podem orientar o trabalho.',
    questions: [
      { id: 'launch_sold_before', label: 'O produto já foi vendido ou lançado?', type: 'single', options: ['Sim', 'Não'], required: true },
      {
        id: 'launch_previous_results',
        label: 'Descreva os resultados e aprendizados anteriores',
        type: 'long',
        showWhen: { questionId: 'launch_sold_before', equals: 'Sim' },
      },
      { id: 'launch_proof', label: 'Existem depoimentos, estudos de caso ou resultados comprovados?', type: 'long' },
      {
        id: 'launch_assets',
        label: 'Quais materiais já estão disponíveis?',
        type: 'multi',
        options: ['Identidade visual', 'Fotos', 'Vídeos', 'Página de vendas', 'Site', 'Lista de contatos', 'Depoimentos', 'Conteúdo gravado', 'Materiais complementares', 'Nenhum', 'Outro'],
      },
      { id: 'launch_channels', label: 'Quais canais digitais já são utilizados?', type: 'long' },
      { id: 'launch_links', label: 'Informe links relevantes, como site, redes sociais ou página do produto', type: 'urls', help: 'Use uma linha para cada link, sempre começando com http:// ou https://.' },
    ],
  },
  {
    id: 'launch-goals',
    service: 'launch',
    title: 'Objetivos',
    description: 'O que precisa acontecer para o lançamento ser considerado bem-sucedido.',
    questions: [
      { id: 'launch_main_goal', label: 'Qual é o principal objetivo do lançamento?', type: 'long', required: true },
      { id: 'launch_target', label: 'Existe uma meta desejada?', type: 'long', help: 'Pode ser uma meta de vendas, inscrições, leads ou audiência.' },
      { id: 'launch_main_concern', label: 'Qual é sua maior preocupação em relação ao lançamento?', type: 'long' },
      { id: 'launch_success', label: 'O que faria você considerar o projeto um sucesso?', type: 'long', required: true },
    ],
  },
]

const MARKETING_STEPS: BriefingStep[] = [
  {
    id: 'marketing-business', service: 'marketing', title: 'Negócio', description: 'Contexto, oferta e fundamentos da marca.', questions: [
      { id: 'marketing_brand_history', label: 'Conte brevemente a história da marca', type: 'long', required: true },
      { id: 'marketing_products', label: 'Quais produtos ou serviços são oferecidos?', type: 'long', required: true },
      { id: 'marketing_priority_offer', label: 'Qual produto ou serviço deve receber prioridade?', type: 'long', required: true },
      { id: 'marketing_differential', label: 'Qual é o principal diferencial do negócio?', type: 'long', required: true },
      { id: 'marketing_mission_values', label: 'Quais são a missão, visão e os valores da marca?', type: 'long' },
    ],
  },
  {
    id: 'marketing-audience', service: 'marketing', title: 'Público', description: 'Comportamentos, necessidades e barreiras de compra.', questions: [
      { id: 'marketing_target_audience', label: 'Quem é o público-alvo?', type: 'long', required: true },
      { id: 'marketing_pains', label: 'Quais são suas principais dores e necessidades?', type: 'long', required: true },
      { id: 'marketing_interests', label: 'Quais são seus interesses e comportamentos?', type: 'long' },
      { id: 'marketing_purchase_trigger', label: 'O que normalmente leva esse público a comprar?', type: 'long' },
      { id: 'marketing_objections', label: 'Quais objeções dificultam a compra?', type: 'long' },
    ],
  },
  {
    id: 'marketing-brand', service: 'marketing', title: 'Marca e comunicação', description: 'Percepção, tom de voz e limites criativos.', questions: [
      { id: 'marketing_perception', label: 'Como a marca deseja ser percebida?', type: 'multi', required: true, options: ['Profissional', 'Próxima', 'Moderna', 'Sofisticada', 'Acessível', 'Divertida', 'Tradicional', 'Inovadora', 'Educativa', 'Outra'] },
      { id: 'marketing_recognition', label: 'Pelo que a marca deseja ser reconhecida?', type: 'long' },
      { id: 'marketing_tone', label: 'Como deve ser o tom de voz?', type: 'long' },
      { id: 'marketing_forbidden_topics', label: 'Existem temas que não devem ser abordados?', type: 'long' },
      { id: 'marketing_avoid', label: 'Existem palavras, estilos ou abordagens que devem ser evitados?', type: 'long' },
      { id: 'marketing_brand_colors', label: 'Quais são as cores institucionais?', type: 'short' },
      { id: 'marketing_avoid_visuals', label: 'Quais cores ou estilos visuais não devem ser utilizados?', type: 'long' },
    ],
  },
  {
    id: 'marketing-content', service: 'marketing', title: 'Conteúdo e canais', description: 'Prioridades editoriais e referências.', questions: [
      { id: 'marketing_current_channels', label: 'Quais canais são utilizados atualmente?', type: 'multi', options: ['Instagram', 'Facebook', 'TikTok', 'YouTube', 'LinkedIn', 'Site ou blog', 'E-mail', 'WhatsApp', 'Outro'] },
      { id: 'marketing_priority_channels', label: 'Quais canais devem receber prioridade?', type: 'long' },
      { id: 'marketing_content_types', label: 'Quais tipos de conteúdo deseja produzir?', type: 'multi', options: ['Educativo', 'Institucional', 'Promocional', 'Bastidores', 'Depoimentos', 'Entretenimento', 'Conteúdo técnico', 'Notícias', 'Outro'] },
      { id: 'marketing_best_content', label: 'Quais conteúdos tiveram melhores resultados anteriormente?', type: 'long' },
      { id: 'marketing_campaign_priority', label: 'Existe alguma campanha, data ou produto que precisa ser priorizado?', type: 'long' },
      { id: 'marketing_references', label: 'Informe links de referências visuais, perfis ou campanhas que admira', type: 'urls', help: 'Use uma linha para cada link, sempre começando com http:// ou https://.' },
      { id: 'marketing_reference_reasons', label: 'Explique o que gosta em cada referência', type: 'long' },
    ],
  },
  {
    id: 'marketing-competition', service: 'marketing', title: 'Concorrência e cenário atual', description: 'O espaço que a marca ocupa e deseja ocupar.', questions: [
      { id: 'marketing_competitors', label: 'Quem são os principais concorrentes?', type: 'long' },
      { id: 'marketing_competitor_strengths', label: 'O que eles fazem bem?', type: 'long' },
      { id: 'marketing_difference_goal', label: 'O que a marca deseja fazer de forma diferente?', type: 'long' },
      { id: 'marketing_challenges', label: 'Quais são atualmente os maiores desafios de marketing?', type: 'long', required: true },
    ],
  },
  {
    id: 'marketing-goals', service: 'marketing', title: 'Objetivos', description: 'Resultados prioritários e critérios de sucesso.', questions: [
      { id: 'marketing_goals', label: 'Quais são os objetivos prioritários?', type: 'multi', required: true, options: ['Reconhecimento da marca', 'Crescimento da audiência', 'Engajamento', 'Geração de leads', 'Vendas', 'Autoridade', 'Relacionamento com clientes', 'Divulgação de produtos ou serviços', 'Outro'] },
      { id: 'marketing_measurement', label: 'Como esses resultados são avaliados atualmente?', type: 'long' },
      { id: 'marketing_success', label: 'O que faria você considerar o projeto um sucesso?', type: 'long', required: true },
      { id: 'marketing_expectations', label: 'Existe alguma expectativa ou observação adicional?', type: 'long' },
    ],
  },
]

const VISUAL_IDENTITY_STEPS: BriefingStep[] = [
  {
    id: 'identity-essence', service: 'visual_identity', title: 'Essência', description: 'Origem, propósito e oferta da marca.', questions: [
      { id: 'identity_brand_name', label: 'Qual nome deverá aparecer na marca?', type: 'short', required: true },
      { id: 'identity_name_story', label: 'O nome possui algum significado ou história?', type: 'long' },
      { id: 'identity_has_slogan', label: 'A marca possui slogan?', type: 'single', options: ['Sim', 'Não'] },
      { id: 'identity_slogan', label: 'Qual é o slogan?', type: 'short', showWhen: { questionId: 'identity_has_slogan', equals: 'Sim' } },
      { id: 'identity_brand_history', label: 'Conte a história da marca', type: 'long', required: true },
      { id: 'identity_mission_values', label: 'Quais são sua missão, visão e valores?', type: 'long' },
      { id: 'identity_products', label: 'Quais produtos ou serviços são oferecidos?', type: 'long', required: true },
      { id: 'identity_differential', label: 'Qual é o principal diferencial da marca?', type: 'long', required: true },
    ],
  },
  {
    id: 'identity-audience', service: 'visual_identity', title: 'Público e mercado', description: 'Percepção desejada e diferenciação competitiva.', questions: [
      { id: 'identity_target_audience', label: 'Quem é o público-alvo?', type: 'long', required: true },
      { id: 'identity_desired_perception', label: 'Como a marca deseja ser percebida por esse público?', type: 'long', required: true },
      { id: 'identity_competitors', label: 'Quem são os principais concorrentes?', type: 'long' },
      { id: 'identity_visual_differentiation', label: 'O que deve diferenciar visualmente a marca dos concorrentes?', type: 'long' },
    ],
  },
  {
    id: 'identity-personality', service: 'visual_identity', title: 'Personalidade', description: 'O jeito de ser, falar e fazer a marca ser lembrada.', questions: [
      { id: 'identity_as_person', label: 'Se a marca fosse uma pessoa, como ela seria?', type: 'long', required: true },
      { id: 'identity_traits', label: 'Selecione até cinco características', type: 'multi', required: true, maxSelections: 5, options: ['Moderna', 'Sofisticada', 'Minimalista', 'Acessível', 'Divertida', 'Séria', 'Tradicional', 'Tecnológica', 'Artesanal', 'Elegante', 'Ousada', 'Acolhedora', 'Outra'] },
      { id: 'identity_feelings', label: 'Quais sentimentos a identidade deve transmitir?', type: 'long' },
      { id: 'identity_mismatch', label: 'Quais características não combinam com a marca?', type: 'long' },
      { id: 'identity_tone', label: 'Como deve ser o tom de voz da marca?', type: 'long' },
    ],
  },
  {
    id: 'identity-direction', service: 'visual_identity', title: 'Direção visual', description: 'Preferências, limites e referências visuais.', questions: [
      { id: 'identity_desired_colors', label: 'Existem cores desejadas? Explique.', type: 'long' },
      { id: 'identity_avoid_colors', label: 'Existem cores que devem ser evitadas? Explique.', type: 'long' },
      { id: 'identity_style', label: 'Existe preferência por algum estilo visual?', type: 'long' },
      { id: 'identity_symbols_include', label: 'Existem símbolos ou elementos que gostaria de incluir?', type: 'long' },
      { id: 'identity_symbols_avoid', label: 'Existem símbolos ou elementos que não devem ser utilizados?', type: 'long' },
      { id: 'identity_reference_links', label: 'Informe links de referências visuais', type: 'urls', help: 'Use uma linha para cada link, sempre começando com http:// ou https://.' },
      { id: 'identity_reference_files', label: 'Envie imagens de referência, se desejar', type: 'file', help: 'Até 5 imagens JPG, PNG ou WebP, com no máximo 8 MB cada.' },
      { id: 'identity_reference_reasons', label: 'Para cada referência, explique o que chamou sua atenção', type: 'long' },
      { id: 'identity_has_existing', label: 'A marca já possui alguma identidade visual?', type: 'single', options: ['Sim', 'Não'] },
      { id: 'identity_preserve_change', label: 'O que deve ser preservado e o que deve mudar?', type: 'long', showWhen: { questionId: 'identity_has_existing', equals: 'Sim' } },
    ],
  },
  {
    id: 'identity-applications', service: 'visual_identity', title: 'Aplicações', description: 'Onde a identidade precisa funcionar primeiro.', questions: [
      { id: 'identity_applications', label: 'Onde a identidade será utilizada?', type: 'multi', required: true, options: ['Redes sociais', 'Site', 'Aplicativo', 'Fachada', 'Uniformes', 'Embalagens', 'Papelaria', 'Apresentações', 'Materiais impressos', 'Outro'] },
      { id: 'identity_priority_application', label: 'Qual aplicação deve receber prioridade?', type: 'long', required: true },
      { id: 'identity_technical_limits', label: 'Existe alguma limitação técnica ou necessidade especial?', type: 'long' },
      { id: 'identity_success', label: 'O que faria você considerar a nova identidade um sucesso?', type: 'long', required: true },
    ],
  },
]

const FINAL_STEP: BriefingStep = {
  id: 'final',
  title: 'Para finalizar',
  description: 'Um último espaço para algo que ainda não apareceu nas perguntas.',
  questions: [
    { id: 'additional_information', label: 'Existe alguma informação importante que não foi abordada?', type: 'long' },
  ],
}

export const ALL_BRIEFING_STEPS = [
  ...COMMON_STEPS,
  ...LAUNCH_STEPS,
  ...MARKETING_STEPS,
  ...VISUAL_IDENTITY_STEPS,
  FINAL_STEP,
]

export function getBriefingSteps(serviceType?: BriefingServiceType | null) {
  if (!serviceType) return COMMON_STEPS
  return [
    ...COMMON_STEPS,
    ...ALL_BRIEFING_STEPS.filter((step) => step.service === serviceType),
    FINAL_STEP,
  ]
}

export function isQuestionVisible(question: BriefingQuestion, answers: BriefingAnswers) {
  if (!question.showWhen) return true
  return answers[question.showWhen.questionId] === question.showWhen.equals
}

export function isAnswerFilled(value: BriefingAnswers[string] | undefined) {
  if (Array.isArray(value)) return value.length > 0
  return typeof value === 'string' && value.trim().length > 0
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime())
    && date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() + 1 === Number(match[2])
    && date.getUTCDate() === Number(match[3])
}

export function isAnswerFormatValid(
  question: BriefingQuestion,
  value: BriefingAnswers[string] | undefined,
) {
  if (!isAnswerFilled(value)) return true
  if (question.type === 'multi') {
    if (!Array.isArray(value)) return false
    if (question.maxSelections && value.length > question.maxSelections) return false
    return value.every((option) => question.options?.includes(option))
  }
  if (typeof value !== 'string') return false
  if (question.type === 'single') return Boolean(question.options?.includes(value))
  if (question.type === 'date') return isIsoDate(value)
  if (question.type === 'currency') {
    const amount = Number(value)
    return Number.isFinite(amount) && amount >= 0
  }
  if (question.type === 'url') return isHttpUrl(value.trim())
  if (question.type === 'urls') {
    const links = value.split(/\r?\n/).map((link) => link.trim()).filter(Boolean)
    return links.length <= 20 && links.every(isHttpUrl)
  }
  return true
}

export function getServiceType(answers: BriefingAnswers): BriefingServiceType | null {
  const value = answers.service_type
  if (value === 'launch' || value === 'marketing' || value === 'visual_identity') {
    return value
  }
  return null
}

export function getQuestionLabel(questionId: string) {
  for (const step of ALL_BRIEFING_STEPS) {
    const question = step.questions.find((candidate) => candidate.id === questionId)
    if (question) return question.label
  }
  return questionId
}

export function getOptionLabel(questionId: string, value: string) {
  if (questionId === 'service_type') {
    return SERVICE_OPTIONS.find((option) => option.value === value)?.label ?? value
  }
  return value
}

export const SUBMISSION_STATUS_LABELS: Record<BriefingSubmissionStatus, string> = {
  draft: 'Rascunho',
  received: 'Recebido',
  reviewing: 'Em análise',
  waiting: 'Aguardando informação',
  completed: 'Concluído',
}

export function buildStrategicSummary(answers: BriefingAnswers) {
  const serviceType = getServiceType(answers)
  const serviceLabel = SERVICE_OPTIONS.find((option) => option.value === serviceType)?.label
  const parts = [
    answers.project_name && `Projeto: ${answers.project_name}.`,
    serviceLabel && `Serviço: ${serviceLabel}.`,
    answers.primary_objective && `Objetivo principal: ${answers.primary_objective}`,
  ]

  if (serviceType === 'launch') {
    parts.push(
      answers.launch_product_name && `Produto: ${answers.launch_product_name}.`,
      answers.launch_transformation && `Transformação: ${answers.launch_transformation}`,
      answers.launch_audience && `Público: ${answers.launch_audience}`,
      answers.launch_main_goal && `Objetivo do lançamento: ${answers.launch_main_goal}`,
      answers.launch_target && `Meta informada: ${answers.launch_target}`,
      answers.launch_main_concern && `Principal preocupação: ${answers.launch_main_concern}`,
    )
  }

  if (serviceType === 'marketing') {
    parts.push(
      answers.marketing_priority_offer && `Prioridade comercial: ${answers.marketing_priority_offer}`,
      answers.marketing_target_audience && `Público: ${answers.marketing_target_audience}`,
      answers.marketing_differential && `Diferencial: ${answers.marketing_differential}`,
      answers.marketing_challenges && `Desafios atuais: ${answers.marketing_challenges}`,
      answers.marketing_success && `Critério de sucesso: ${answers.marketing_success}`,
    )
  }

  if (serviceType === 'visual_identity') {
    parts.push(
      answers.identity_brand_name && `Nome da marca: ${answers.identity_brand_name}.`,
      answers.identity_target_audience && `Público: ${answers.identity_target_audience}`,
      answers.identity_desired_perception && `Percepção desejada: ${answers.identity_desired_perception}`,
      answers.identity_priority_application && `Aplicação prioritária: ${answers.identity_priority_application}`,
      answers.identity_success && `Critério de sucesso: ${answers.identity_success}`,
    )
  }

  return parts.filter(Boolean).join('\n\n')
}
