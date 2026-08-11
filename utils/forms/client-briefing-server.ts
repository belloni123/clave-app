import 'server-only'

import { createHash, createHmac, randomBytes } from 'node:crypto'
import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BriefingAnswers, BriefingServiceType } from '@/types/project-form'
import {
  ALL_BRIEFING_STEPS,
  getBriefingSteps,
  getServiceType,
  isAnswerFormatValid,
  isAnswerFilled,
  isQuestionVisible,
} from '@/utils/forms/client-briefing'

const PUBLIC_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const ALLOWED_QUESTION_IDS = new Set(
  ALL_BRIEFING_STEPS.flatMap((step) => step.questions.map((question) => question.id)),
)

export interface PublicFormRecord {
  id: string
  project_id: string
  title: string
  public_token: string
  active: boolean
  version: number
}

export function isValidPublicFormToken(token: string) {
  return PUBLIC_TOKEN_PATTERN.test(token)
}

export function createResponseToken() {
  return randomBytes(32).toString('base64url')
}

export function hashResponseToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function clientAddress(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return request.headers.get('cf-connecting-ip')?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || forwarded
    || 'unknown'
}

export function createProjectFormRateLimitKey(request: NextRequest, formId: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('Supabase admin credentials are not configured.')
  return createHmac('sha256', secret)
    .update(`project-form:${formId}:${clientAddress(request)}`)
    .digest('hex')
}

export function normalizeBriefingAnswers(input: unknown): BriefingAnswers {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('As respostas enviadas são inválidas.')
  }

  const entries = Object.entries(input)
  if (entries.length > ALLOWED_QUESTION_IDS.size) {
    throw new Error('O formulário contém respostas além do limite permitido.')
  }

  const answers: BriefingAnswers = {}
  for (const [key, rawValue] of entries) {
    if (!ALLOWED_QUESTION_IDS.has(key)) continue

    if (typeof rawValue === 'string') {
      const value = rawValue.trim()
      if (value.length > 12_000) {
        throw new Error('Uma das respostas ultrapassa o limite de caracteres.')
      }
      answers[key] = value
      continue
    }

    if (Array.isArray(rawValue)) {
      if (rawValue.length > 30) {
        throw new Error('Uma seleção ultrapassa o limite de opções.')
      }
      answers[key] = rawValue
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim().slice(0, 240))
        .filter(Boolean)
    }
  }

  const serviceType = getServiceType(answers)
  if (serviceType) {
    const visibleQuestionIds = new Set(
      getBriefingSteps(serviceType)
        .flatMap((step) => step.questions)
        .filter((question) => isQuestionVisible(question, answers))
        .map((question) => question.id),
    )
    for (const key of Object.keys(answers)) {
      if (!visibleQuestionIds.has(key)) delete answers[key]
    }
  }

  return answers
}

export function validateBriefingForSubmission(answers: BriefingAnswers) {
  const serviceType = getServiceType(answers)
  if (!serviceType) return ['Qual serviço será realizado?']

  const visibleQuestions = getBriefingSteps(serviceType)
    .flatMap((step) => step.questions)
    .filter((question) => isQuestionVisible(question, answers))

  const missing = visibleQuestions
    .filter((question) => question.required)
    .filter((question) => !isAnswerFilled(answers[question.id]))
    .map((question) => question.label)

  const invalid = visibleQuestions
    .filter((question) => !isAnswerFormatValid(question, answers[question.id]))
    .map((question) => `${question.label} (formato inválido)`)

  return [...missing, ...invalid]
}

export async function getPublicForm(
  admin: SupabaseClient,
  publicToken: string,
): Promise<PublicFormRecord | null> {
  if (!isValidPublicFormToken(publicToken)) return null

  const { data, error } = await admin
    .from('project_forms')
    .select('id, project_id, title, public_token, active, version')
    .eq('public_token', publicToken)
    .maybeSingle()

  if (error) throw error
  return data as PublicFormRecord | null
}

export async function getSubmissionByToken(
  admin: SupabaseClient,
  formId: string,
  responseToken: string,
) {
  if (!responseToken || responseToken.length > 100) return null
  const { data, error } = await admin
    .from('project_form_submissions')
    .select('*')
    .eq('form_id', formId)
    .eq('response_token_hash', hashResponseToken(responseToken))
    .maybeSingle()

  if (error) throw error
  return data
}

function stringifyAnswer(value: BriefingAnswers[string] | undefined) {
  if (Array.isArray(value)) return value.join(', ')
  return value?.trim() ?? ''
}

async function fillTextField(
  admin: SupabaseClient,
  projectId: string,
  key: string,
  value: string,
  label: string,
  mapped: string[],
  skipped: string[],
) {
  if (!value) return
  const { data: existing, error: readError } = await admin
    .from('text_fields')
    .select('id, value')
    .eq('project_id', projectId)
    .eq('key', key)
    .maybeSingle()

  if (readError) throw readError
  if (existing?.value?.trim()) {
    skipped.push(`${label}: preservado porque já possuía conteúdo`)
    return
  }

  const { error } = await admin
    .from('text_fields')
    .upsert(
      { project_id: projectId, key, value },
      { onConflict: 'project_id,key' },
    )

  if (error) throw error
  mapped.push(label)
}

async function getOrCreateCommunicationProduct(
  admin: SupabaseClient,
  projectId: string,
  productName: string,
) {
  const { data: products, error: productsError } = await admin
    .from('communication_products')
    .select('id, name')
    .eq('project_id', projectId)
    .eq('archived', false)
    .order('created_at', { ascending: true })

  if (productsError) throw productsError
  const normalizedName = productName.trim().toLocaleLowerCase('pt-BR')
  const exactProduct = products?.find(
    (product) => product.name.trim().toLocaleLowerCase('pt-BR') === normalizedName,
  )
  if (exactProduct) return exactProduct.id as string
  if (!productName.trim()) return products?.[0]?.id as string | undefined

  const { data: created, error: createError } = await admin
    .from('communication_products')
    .insert({ project_id: projectId, name: productName.trim() })
    .select('id')
    .single()

  if (createError) throw createError
  return created.id as string
}

async function fillCommunicationField(
  admin: SupabaseClient,
  productId: string,
  key: string,
  value: string,
  label: string,
  mapped: string[],
  skipped: string[],
) {
  if (!value) return
  const { data: existing, error: readError } = await admin
    .from('communication_product_fields')
    .select('id, value')
    .eq('product_id', productId)
    .eq('key', key)
    .maybeSingle()

  if (readError) throw readError
  if (existing?.value?.trim()) {
    skipped.push(`${label}: preservado porque já possuía conteúdo`)
    return
  }

  const { error } = await admin
    .from('communication_product_fields')
    .upsert(
      { product_id: productId, key, value },
      { onConflict: 'product_id,key' },
    )

  if (error) throw error
  mapped.push(label)
}

export async function syncBriefingToProject(
  admin: SupabaseClient,
  projectId: string,
  answers: BriefingAnswers,
) {
  const mapped: string[] = []
  const skipped: string[] = []
  const serviceType = getServiceType(answers) as BriefingServiceType

  const baseFields: Array<[string, string, string]> = [
    ['client_briefing_project_name', stringifyAnswer(answers.project_name), 'Nome do cliente ou projeto no briefing'],
    ['client_briefing_service_type', serviceType, 'Tipo de serviço contratado'],
    ['client_briefing_project_description', stringifyAnswer(answers.project_description), 'Descrição geral do cliente'],
    ['client_briefing_primary_objective', stringifyAnswer(answers.primary_objective), 'Objetivo principal do cliente'],
    ['client_briefing_important_date', stringifyAnswer(answers.important_date), 'Data importante'],
    ['client_briefing_important_date_notes', stringifyAnswer(answers.important_date_notes), 'Observações do prazo'],
  ]

  for (const [key, value, label] of baseFields) {
    await fillTextField(admin, projectId, key, value, label, mapped, skipped)
  }

  const productName = serviceType === 'launch'
    ? stringifyAnswer(answers.launch_product_name)
    : serviceType === 'visual_identity'
      ? stringifyAnswer(answers.identity_brand_name)
      : stringifyAnswer(answers.project_name)
  const productId = await getOrCreateCommunicationProduct(admin, projectId, productName)

  if (productId && serviceType === 'launch') {
    const communicationFields: Array<[string, string, string]> = [
      ['id-met', stringifyAnswer(answers.launch_main_differential), 'Comunicação · Mecanismo Único'],
      ['id-qd', stringifyAnswer(answers.launch_transformation), 'Comunicação · Resultado-Alvo'],
      ['id-fi', stringifyAnswer(answers.launch_promise), 'Comunicação · Promessa principal'],
      ['id-pqe', stringifyAnswer(answers.launch_audience), 'Comunicação · Para quem é'],
      ['id-arg', stringifyAnswer(answers.launch_benefits), 'Comunicação · Benefício Estendido'],
      ['id-pi', stringifyAnswer(answers.launch_choice_reason), 'Comunicação · Ponto de Indiferença'],
    ]
    for (const [key, value, label] of communicationFields) {
      await fillCommunicationField(admin, productId, key, value, label, mapped, skipped)
    }
  }

  if (productId && serviceType === 'marketing') {
    const communicationFields: Array<[string, string, string]> = [
      ['id-pqe', stringifyAnswer(answers.marketing_target_audience), 'Comunicação · Para quem é'],
      ['id-pi', stringifyAnswer(answers.marketing_differential), 'Comunicação · Ponto de Indiferença'],
    ]
    for (const [key, value, label] of communicationFields) {
      await fillCommunicationField(admin, productId, key, value, label, mapped, skipped)
    }
  }

  if (productId && serviceType === 'visual_identity') {
    const communicationFields: Array<[string, string, string]> = [
      ['id-pqe', stringifyAnswer(answers.identity_target_audience), 'Comunicação · Para quem é'],
      ['id-pi', stringifyAnswer(answers.identity_visual_differentiation), 'Comunicação · Ponto de Indiferença'],
    ]
    for (const [key, value, label] of communicationFields) {
      await fillCommunicationField(admin, productId, key, value, label, mapped, skipped)
    }
  }

  return { mapped, skipped }
}
