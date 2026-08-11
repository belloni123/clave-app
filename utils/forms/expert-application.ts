import type {
  DigitalProduct,
  ExpertApplicationAnswers,
  ExpertApplicationPayload,
  ExpertApplicationStatus,
  LaunchTimeline,
  OtherPlatform,
  PartnershipExperience,
  RevenueRange,
  TrafficInvestmentRange,
} from '@/types/expert-application'

export const OTHER_PLATFORM_OPTIONS: Array<{ value: OtherPlatform; label: string }> = [
  { value: 'youtube', label: 'YouTube' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'tiktok', label: 'TikTok' },
]

export const DIGITAL_PRODUCT_OPTIONS: Array<{ value: DigitalProduct; label: string }> = [
  { value: 'none', label: 'Não tenho produto ainda' },
  { value: 'ebook', label: 'Ebook' },
  { value: 'masterclass', label: 'Masterclass/Aulão' },
  { value: 'course', label: 'Curso' },
  { value: 'community', label: 'Comunidade/Assinatura' },
  { value: 'consulting', label: 'Consultoria' },
  { value: 'mentoring', label: 'Mentoria/Mastermind' },
  { value: 'in_person_event', label: 'Evento presencial' },
]

export const PARTNERSHIP_OPTIONS: Array<{ value: PartnershipExperience; label: string }> = [
  { value: 'freelancers', label: 'Parceria com profissionais autônomos' },
  { value: 'agency', label: 'Parceria com agência' },
  { value: 'partnership', label: 'Sociedade' },
  { value: 'starting_now', label: 'Estou iniciando agora' },
  { value: 'worked_alone', label: 'Sempre trabalhei sozinho' },
]

export const REVENUE_OPTIONS: Array<{ value: RevenueRange; label: string }> = [
  { value: 'none', label: 'Ainda não vendi' },
  { value: 'up_to_100k', label: 'Até R$ 100.000' },
  { value: '101k_300k', label: 'De R$ 101.000 a R$ 300.000' },
  { value: '301k_600k', label: 'De R$ 301.000 a R$ 600.000' },
  { value: '601k_1m', label: 'De R$ 601.000 a R$ 1.000.000' },
  { value: '1m_3m', label: 'De R$ 1.000.001 a R$ 3.000.000' },
  { value: '3m_10m', label: 'De R$ 3.000.001 a R$ 10.000.000' },
  { value: 'above_10m', label: 'Acima de R$ 10.000.000' },
]

export const TRAFFIC_OPTIONS: Array<{ value: TrafficInvestmentRange; label: string }> = [
  { value: 'none', label: 'Ainda não invisto em tráfego' },
  { value: 'up_to_10k', label: 'Até R$ 10.000' },
  { value: '10k_50k', label: 'De R$ 10.001 a R$ 50.000' },
  { value: '50k_100k', label: 'De R$ 50.001 a R$ 100.000' },
  { value: '100k_500k', label: 'De R$ 100.001 a R$ 500.000' },
  { value: 'above_500k', label: 'Acima de R$ 500.000' },
]

export const TIMELINE_OPTIONS: Array<{ value: LaunchTimeline; label: string }> = [
  { value: 'asap', label: 'O mais rápido possível' },
  { value: 'three_months', label: 'Em 3 meses' },
  { value: 'three_to_six_months', label: 'Entre 3 e 6 meses' },
  { value: 'unknown', label: 'Não sei ainda' },
]

export const APPLICATION_STATUS_LABELS: Record<ExpertApplicationStatus, string> = {
  new: 'Nova',
  reviewing: 'Em análise',
  qualified: 'Qualificada',
  disqualified: 'Não qualificada',
  converted: 'Projeto criado',
}

export const APPLICATION_FIELD_LABELS: Record<keyof ExpertApplicationAnswers, string> = {
  fullName: 'Nome completo',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  instagram: 'Instagram',
  otherPlatforms: 'Outras plataformas',
  niche: 'Nicho',
  workAndPains: 'Trabalho e dores',
  competitorReference: 'Concorrente ou referência',
  digitalProducts: 'Produtos digitais',
  launchesCount: 'Quantidade de lançamentos',
  partnershipExperience: 'Experiência com parcerias',
  revenueLast12Months: 'Faturamento nos últimos 12 meses',
  paidTrafficLast12Months: 'Tráfego pago nos últimos 12 meses',
  monthlyMarketingBudget: 'Investimento mensal em marketing',
  discoveryAndImpressions: 'Como conheceu a B16',
  launchTimeline: 'Prazo para lançar',
  motivation: 'Motivação',
  lgpdConsent: 'Consentimento LGPD',
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const INSTAGRAM_HANDLE_PATTERN = /^@[a-zA-Z0-9._]{1,30}$/
const INSTAGRAM_URL_PATTERN = /^https?:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9._]{1,30}\/?(?:\?.*)?$/i

const OPTION_SETS = {
  otherPlatforms: new Set(OTHER_PLATFORM_OPTIONS.map((option) => option.value)),
  digitalProducts: new Set(DIGITAL_PRODUCT_OPTIONS.map((option) => option.value)),
  partnershipExperience: new Set(PARTNERSHIP_OPTIONS.map((option) => option.value)),
  revenue: new Set(REVENUE_OPTIONS.map((option) => option.value)),
  traffic: new Set(TRAFFIC_OPTIONS.map((option) => option.value)),
  timeline: new Set(TIMELINE_OPTIONS.map((option) => option.value)),
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function stringArray<T extends string>(value: unknown, allowed: Set<T>): T[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is T => typeof item === 'string' && allowed.has(item as T)))]
}

export function whatsappDigits(value: string) {
  return value.replace(/\D/g, '').slice(0, 11)
}

export function formatWhatsapp(value: string) {
  const digits = whatsappDigits(value)
  if (digits.length <= 2) return digits.length ? `(${digits}` : ''
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

export function isValidWhatsapp(value: string) {
  const digits = whatsappDigits(value)
  return digits.length === 11 && digits[0] !== '0' && digits[1] !== '0' && digits[2] === '9'
}

export function formatCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  if (!digits) return ''
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(Number(digits) / 100)
}

export function currencyToNumber(value: string) {
  const digits = value.replace(/\D/g, '')
  return digits ? Number(digits) / 100 : Number.NaN
}

export function isValidInstagram(value: string) {
  return INSTAGRAM_HANDLE_PATTERN.test(value.trim()) || INSTAGRAM_URL_PATTERN.test(value.trim())
}

export function optionLabel<T extends string>(
  options: Array<{ value: T; label: string }>,
  value: T,
) {
  return options.find((option) => option.value === value)?.label ?? value
}

export type ExpertApplicationErrors = Partial<Record<keyof ExpertApplicationAnswers | 'authorization' | 'form', string>>

export function validateExpertApplication(answers: ExpertApplicationAnswers) {
  const errors: ExpertApplicationErrors = {}
  const nameParts = answers.fullName.trim().split(/\s+/).filter(Boolean)

  if (nameParts.length < 2 || answers.fullName.trim().length > 120) {
    errors.fullName = 'Informe seu nome e sobrenome.'
  }
  if (!isValidWhatsapp(answers.whatsapp)) {
    errors.whatsapp = 'Informe um celular válido com DDD.'
  }
  if (!EMAIL_PATTERN.test(answers.email.trim()) || answers.email.trim().length > 254) {
    errors.email = 'Informe um e-mail válido.'
  }
  if (!isValidInstagram(answers.instagram)) {
    errors.instagram = 'Informe @usuario ou a URL completa do perfil.'
  }
  if (answers.otherPlatforms.length === 0) {
    errors.otherPlatforms = 'Selecione pelo menos uma plataforma.'
  }
  if (answers.niche.trim().length < 2 || answers.niche.trim().length > 3000) {
    errors.niche = 'Descreva seu nicho.'
  }
  if (answers.workAndPains.trim().length < 10 || answers.workAndPains.trim().length > 6000) {
    errors.workAndPains = 'Conte um pouco mais sobre seu trabalho e as dores que deseja resolver.'
  }
  if (answers.competitorReference.trim().length < 2 || answers.competitorReference.trim().length > 3000) {
    errors.competitorReference = 'Informe seu principal concorrente ou referência.'
  }
  if (answers.digitalProducts.length === 0) {
    errors.digitalProducts = 'Selecione pelo menos uma opção.'
  } else if (answers.digitalProducts.includes('none') && answers.digitalProducts.length > 1) {
    errors.digitalProducts = '“Não tenho produto ainda” não pode ser combinado com outros produtos.'
  }
  const launches = Number(answers.launchesCount)
  if (answers.launchesCount === '' || !Number.isInteger(launches) || launches < 0 || launches > 10) {
    errors.launchesCount = 'Selecione a quantidade de lançamentos.'
  }
  const independent = answers.partnershipExperience.some((value) => value === 'starting_now' || value === 'worked_alone')
  const hasPartnership = answers.partnershipExperience.some((value) => value === 'freelancers' || value === 'agency' || value === 'partnership')
  if (answers.partnershipExperience.length === 0) {
    errors.partnershipExperience = 'Selecione pelo menos uma opção.'
  } else if (independent && hasPartnership) {
    errors.partnershipExperience = 'As opções de início ou trabalho solo não podem ser combinadas com parcerias.'
  }
  if (!OPTION_SETS.revenue.has(answers.revenueLast12Months as RevenueRange)) {
    errors.revenueLast12Months = 'Selecione uma faixa de faturamento.'
  }
  if (!OPTION_SETS.traffic.has(answers.paidTrafficLast12Months as TrafficInvestmentRange)) {
    errors.paidTrafficLast12Months = 'Selecione uma faixa de investimento.'
  }
  const budget = currencyToNumber(answers.monthlyMarketingBudget)
  if (!Number.isFinite(budget) || budget < 0) {
    errors.monthlyMarketingBudget = 'Informe o valor mensal disponível.'
  }
  if (answers.discoveryAndImpressions.trim().length < 2 || answers.discoveryAndImpressions.trim().length > 4000) {
    errors.discoveryAndImpressions = 'Conte como conheceu a B16 e sua impressão sobre nós.'
  }
  if (!OPTION_SETS.timeline.has(answers.launchTimeline as LaunchTimeline)) {
    errors.launchTimeline = 'Selecione quando pretende lançar.'
  }
  if (answers.motivation.trim().length < 10 || answers.motivation.trim().length > 6000) {
    errors.motivation = 'Conte por que deseja lançar seu projeto com a B16.'
  }
  if (!answers.lgpdConsent) {
    errors.lgpdConsent = 'Você precisa autorizar o tratamento dos dados para enviar.'
  }

  return errors
}

export type ParsedExpertApplication = {
  ok: true
  data: ExpertApplicationPayload & { monthlyMarketingBudgetValue: number }
} | {
  ok: false
  errors: ExpertApplicationErrors
}

export function parseExpertApplicationPayload(value: unknown): ParsedExpertApplication {
  if (!value || typeof value !== 'object') {
    return { ok: false, errors: { form: 'Os dados enviados são inválidos.' } }
  }

  const body = value as Record<string, unknown>
  const answers: ExpertApplicationAnswers = {
    fullName: stringValue(body.fullName),
    whatsapp: formatWhatsapp(stringValue(body.whatsapp)),
    email: stringValue(body.email).toLowerCase(),
    instagram: stringValue(body.instagram),
    otherPlatforms: stringArray(body.otherPlatforms, OPTION_SETS.otherPlatforms),
    niche: stringValue(body.niche),
    workAndPains: stringValue(body.workAndPains),
    competitorReference: stringValue(body.competitorReference),
    digitalProducts: stringArray(body.digitalProducts, OPTION_SETS.digitalProducts),
    launchesCount: stringValue(body.launchesCount),
    partnershipExperience: stringArray(body.partnershipExperience, OPTION_SETS.partnershipExperience),
    revenueLast12Months: OPTION_SETS.revenue.has(body.revenueLast12Months as RevenueRange)
      ? body.revenueLast12Months as RevenueRange
      : '',
    paidTrafficLast12Months: OPTION_SETS.traffic.has(body.paidTrafficLast12Months as TrafficInvestmentRange)
      ? body.paidTrafficLast12Months as TrafficInvestmentRange
      : '',
    monthlyMarketingBudget: formatCurrencyInput(stringValue(body.monthlyMarketingBudget)),
    discoveryAndImpressions: stringValue(body.discoveryAndImpressions),
    launchTimeline: OPTION_SETS.timeline.has(body.launchTimeline as LaunchTimeline)
      ? body.launchTimeline as LaunchTimeline
      : '',
    motivation: stringValue(body.motivation),
    lgpdConsent: body.lgpdConsent === true,
  }

  const errors = validateExpertApplication(answers)
  if (body.authorization !== 'yes') errors.authorization = 'A autorização é obrigatória.'
  if (!UUID_PATTERN.test(stringValue(body.idempotencyKey))) errors.form = 'Identificador do envio inválido.'
  const startedAt = new Date(stringValue(body.startedAt))
  if (Number.isNaN(startedAt.getTime())) errors.form = 'Sessão do formulário inválida.'

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    data: {
      ...answers,
      authorization: 'yes',
      idempotencyKey: stringValue(body.idempotencyKey),
      startedAt: startedAt.toISOString(),
      companyWebsite: stringValue(body.companyWebsite),
      monthlyMarketingBudgetValue: currencyToNumber(answers.monthlyMarketingBudget),
    },
  }
}
