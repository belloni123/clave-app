'use client'

import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  Mail,
  Save,
  Send,
  ShieldCheck,
} from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'

interface SmtpSettings {
  domain: string
  supportWhatsapp: string
  tutorialUrl: string
  smtpHost: string
  smtpPort: 465 | 587
  smtpSecurity: 'ssl' | 'starttls'
  smtpUser: string
  smtpSenderName: string
  smtpSenderEmail: string
  hasPassword: boolean
  authConfiguredAt: string | null
  lastTestedAt: string | null
  lastTestStatus: boolean | null
  lastTestError: string | null
  canEdit: boolean
  managementApiConfigured: boolean
}

const DEFAULT_SETTINGS: SmtpSettings = {
  domain: 'https://useclave.com.br',
  supportWhatsapp: '',
  tutorialUrl: '',
  smtpHost: 'smtp.gmail.com',
  smtpPort: 465,
  smtpSecurity: 'ssl',
  smtpUser: 'felipe@agenciab16.com.br',
  smtpSenderName: 'Clave',
  smtpSenderEmail: 'contato@agenciab16.com.br',
  hasPassword: false,
  authConfiguredAt: null,
  lastTestedAt: null,
  lastTestStatus: null,
  lastTestError: null,
  canEdit: false,
  managementApiConfigured: false,
}

const inputClass =
  'w-full border border-border2 bg-surface text-text-custom rounded-md px-3 py-2.5 text-sm outline-none transition-colors focus:border-blue-custom disabled:opacity-60'
const labelClass = 'block text-xs font-semibold text-text2 mb-1.5'

function formatDate(value: string | null) {
  if (!value) return 'Ainda não registrado'
  return new Date(value).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export default function AdminSmtpModule() {
  const { showToast } = useAppStore()
  const [settings, setSettings] = useState<SmtpSettings>(DEFAULT_SETTINGS)
  const [smtpPassword, setSmtpPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [pendingOperation, setPendingOperation] = useState<'save' | 'test' | null>(null)
  const [loadError, setLoadError] = useState('')

  const updateSetting = <K extends keyof SmtpSettings>(key: K, value: SmtpSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }))
  }

  const loadSettings = async () => {
    setLoading(true)
    setLoadError('')
    try {
      const response = await fetch('/api/admin/smtp', { cache: 'no-store' })
      const payload = await response.json() as { settings?: SmtpSettings; error?: string }
      if (!response.ok || !payload.settings) {
        throw new Error(payload.error || 'Não foi possível carregar a configuração SMTP.')
      }
      setSettings(payload.settings)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao carregar o SMTP.'
      setLoadError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSettings()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const handleOperation = async (operation: 'save' | 'test') => {
    if (!settings.canEdit || pendingOperation) return
    setPendingOperation(operation)

    try {
      const response = await fetch('/api/admin/smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation,
          domain: settings.domain,
          supportWhatsapp: settings.supportWhatsapp,
          tutorialUrl: settings.tutorialUrl,
          smtpHost: settings.smtpHost,
          smtpPort: settings.smtpPort,
          smtpSecurity: settings.smtpSecurity,
          smtpUser: settings.smtpUser,
          smtpPassword,
          smtpSenderName: settings.smtpSenderName,
          smtpSenderEmail: settings.smtpSenderEmail,
        }),
      })
      const payload = await response.json() as {
        settings?: SmtpSettings
        message?: string
        error?: string
      }

      if (!response.ok) {
        throw new Error(payload.error || 'Não foi possível concluir a operação SMTP.')
      }

      if (payload.settings) setSettings(payload.settings)
      setSmtpPassword('')
      showToast(
        payload.message || (operation === 'save' ? 'SMTP salvo.' : 'Teste enviado.'),
      )
      if (operation === 'test') await loadSettings()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Falha na operação SMTP.', 'err')
    } finally {
      setPendingOperation(null)
    }
  }

  const readOnly = !settings.canEdit

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-text3">
        <LoaderCircle className="w-5 h-5 animate-spin mr-2" />
        Carregando configuração SMTP...
      </div>
    )
  }

  if (loadError) {
    return (
      <section className="max-w-5xl space-y-4">
        <div className="flex items-center gap-3">
          <Mail className="w-5 h-5 text-amber-custom" />
          <div>
            <h1 className="text-lg font-semibold text-text-custom">SMTP Google Workspace</h1>
            <p className="text-xs text-text3">Configuração global de e-mail do Clave</p>
          </div>
        </div>
        <div className="border border-red-t/20 bg-red-bg text-red-t rounded-lg p-4 text-sm">
          {loadError}
        </div>
        <button
          type="button"
          onClick={() => void loadSettings()}
          className="px-3 py-2 rounded-md border border-border2 text-sm text-text-custom hover:bg-surface2"
        >
          Tentar novamente
        </button>
      </section>
    )
  }

  return (
    <section className="max-w-5xl space-y-5 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-bg text-amber-custom flex items-center justify-center">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-text-custom">SMTP Google Workspace</h1>
            <p className="text-xs text-text3">Recuperação de senha, convites e notificações do Clave</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-custom/25 bg-purple-bg px-2.5 py-1 text-xs font-semibold text-purple-t">
          <ShieldCheck className="w-3.5 h-3.5" />
          Só administradores
        </span>
      </div>

      {!settings.managementApiConfigured && (
        <div className="flex items-start gap-2.5 border border-amber-custom/25 bg-amber-bg text-amber-t rounded-lg p-3 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            O segredo <code>SUPABASE_MANAGEMENT_ACCESS_TOKEN</code> ainda não foi configurado no Coolify.
            Sem ele, salvar aqui não consegue atualizar o SMTP usado pelo Supabase Auth para recuperação e convites.
          </p>
        </div>
      )}

      {!settings.canEdit && (
        <div className="flex items-start gap-2.5 border border-blue-custom/20 bg-blue-bg text-blue-t rounded-lg p-3 text-sm">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
          <p>Acesso somente leitura. Apenas felipe@agenciab16.com.br e contato@agenciab16.com.br podem alterar esta configuração.</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="border border-border-custom bg-surface rounded-lg p-3">
          <div className="flex items-center gap-2 text-xs text-text2">
            {settings.hasPassword ? <CheckCircle2 className="w-4 h-4 text-green-custom" /> : <AlertTriangle className="w-4 h-4 text-amber-custom" />}
            Senha SMTP
          </div>
          <p className="mt-1 text-sm font-medium text-text-custom">
            {settings.hasPassword ? 'Protegida no Supabase Vault' : 'Ainda não cadastrada'}
          </p>
        </div>
        <div className="border border-border-custom bg-surface rounded-lg p-3">
          <div className="text-xs text-text2">Última sincronização com Auth</div>
          <p className="mt-1 text-sm font-medium text-text-custom">{formatDate(settings.authConfiguredAt)}</p>
        </div>
        <div className="border border-border-custom bg-surface rounded-lg p-3">
          <div className="text-xs text-text2">Último teste</div>
          <p className={`mt-1 text-sm font-medium ${settings.lastTestStatus === false ? 'text-red-t' : 'text-text-custom'}`}>
            {settings.lastTestStatus === true ? `Sucesso em ${formatDate(settings.lastTestedAt)}` : settings.lastTestStatus === false ? `Falhou em ${formatDate(settings.lastTestedAt)}` : 'Ainda não testado'}
          </p>
        </div>
      </div>

      {settings.lastTestStatus === false && settings.lastTestError && (
        <div className="border border-red-t/20 bg-red-bg text-red-t rounded-lg p-3 text-sm">
          {settings.lastTestError}
        </div>
      )}

      <div className="border border-border-custom bg-surface rounded-lg p-4 sm:p-5 space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label>
            <span className={labelClass}>Domínio</span>
            <input className={inputClass} value={settings.domain} onChange={(event) => updateSetting('domain', event.target.value)} disabled={readOnly} placeholder="https://useclave.com.br" />
          </label>
          <label>
            <span className={labelClass}>Contato de suporte (WhatsApp)</span>
            <input className={inputClass} value={settings.supportWhatsapp} onChange={(event) => updateSetting('supportWhatsapp', event.target.value)} disabled={readOnly} placeholder="5511999999999" />
          </label>
          <label className="md:col-span-2">
            <span className={labelClass}>Link do tutorial no YouTube</span>
            <input className={inputClass} type="url" value={settings.tutorialUrl} onChange={(event) => updateSetting('tutorialUrl', event.target.value)} disabled={readOnly} placeholder="https://www.youtube.com/watch?v=..." />
          </label>
        </div>

        <div className="border-t border-border-custom pt-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label>
              <span className={labelClass}>Servidor SMTP</span>
              <input className={inputClass} value={settings.smtpHost} onChange={(event) => updateSetting('smtpHost', event.target.value)} disabled={readOnly} placeholder="smtp.gmail.com" autoComplete="off" />
            </label>
            <label>
              <span className={labelClass}>Porta SMTP</span>
              <select className={inputClass} value={settings.smtpPort} onChange={(event) => updateSetting('smtpPort', Number(event.target.value) as 465 | 587)} disabled={readOnly}>
                <option value={465}>465</option>
                <option value={587}>587</option>
              </select>
            </label>
            <label>
              <span className={labelClass}>Segurança</span>
              <select className={inputClass} value={settings.smtpSecurity} onChange={(event) => updateSetting('smtpSecurity', event.target.value as 'ssl' | 'starttls')} disabled={readOnly}>
                <option value="ssl">SSL</option>
                <option value="starttls">STARTTLS</option>
              </select>
            </label>
            <label>
              <span className={labelClass}>Usuário SMTP</span>
              <input className={inputClass} type="email" value={settings.smtpUser} onChange={(event) => updateSetting('smtpUser', event.target.value)} disabled={readOnly} autoComplete="username" />
            </label>
            <label>
              <span className={labelClass}>Senha SMTP</span>
              <input className={inputClass} type="password" value={smtpPassword} onChange={(event) => setSmtpPassword(event.target.value)} disabled={readOnly} autoComplete="new-password" placeholder="Deixe em branco para manter a senha atual" />
            </label>
            <label>
              <span className={labelClass}>Nome do remetente</span>
              <input className={inputClass} value={settings.smtpSenderName} onChange={(event) => updateSetting('smtpSenderName', event.target.value)} disabled={readOnly} />
            </label>
            <label>
              <span className={labelClass}>E-mail do remetente</span>
              <input className={inputClass} type="email" value={settings.smtpSenderEmail} onChange={(event) => updateSetting('smtpSenderEmail', event.target.value)} disabled={readOnly} autoComplete="email" />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border-custom pt-4">
          <button
            type="button"
            onClick={() => void handleOperation('test')}
            disabled={readOnly || Boolean(pendingOperation)}
            className="inline-flex items-center gap-2 rounded-md border border-border2 bg-surface2 px-4 py-2.5 text-sm font-semibold text-text-custom transition-colors hover:bg-surface2/70 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendingOperation === 'test' ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Testar SMTP
          </button>
          <button
            type="button"
            onClick={() => void handleOperation('save')}
            disabled={readOnly || Boolean(pendingOperation)}
            className="inline-flex items-center gap-2 rounded-md bg-blue-custom px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendingOperation === 'save' ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar configurações
          </button>
        </div>
      </div>
    </section>
  )
}
