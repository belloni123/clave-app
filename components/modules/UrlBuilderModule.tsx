'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/utils/supabase/client'
import { useAppStore } from '@/store/useAppStore'
import { Copy, Check, History, Link, QrCode, MessageSquare, ExternalLink, Download } from 'lucide-react'

interface HistoryUrl {
  url: string
  date: string
}

export default function UrlBuilderModule() {
  const queryClient = useQueryClient()
  const supabase = createClient()
  const { activeProjectId, showToast } = useAppStore()

  // Tabs: utm | whatsapp | qrcode
  const [activeTab, setActiveTab] = useState<'utm' | 'whatsapp' | 'qrcode'>('utm')

  // Shared copied states
  const [copied, setCopied] = useState(false)
  const [showQrOutput, setShowQrOutput] = useState(false)

  // 1. UTM Builder states
  const [baseUrl, setBaseUrl] = useState('')
  const [source, setSource] = useState('')
  const [medium, setMedium] = useState('')
  const [campaign, setCampaign] = useState('')
  const [content, setContent] = useState('')

  // 2. WhatsApp Link states
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')

  // 3. Generic QR Code states
  const [qrLink, setQrLink] = useState('')

  // ───────────────────────────────────────────
  // QUERY & MUTATION FOR HISTORY
  // ───────────────────────────────────────────
  const { data: urlHistory } = useQuery({
    queryKey: ['url_history', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return []
      const { data, error } = await supabase
        .from('text_fields')
        .select('*')
        .eq('project_id', activeProjectId)
        .eq('key', 'url_history')
        .maybeSingle()

      if (error) {
        showToast('Erro ao carregar histórico de URLs', 'err')
        return []
      }
      return data ? (JSON.parse(data.value) as HistoryUrl[]) : []
    },
    enabled: !!activeProjectId,
  })

  const saveHistoryMutation = useMutation({
    mutationFn: async (list: HistoryUrl[]) => {
      if (!activeProjectId) return
      const serialized = JSON.stringify(list)

      const { data: existing } = await supabase
        .from('text_fields')
        .select('id')
        .eq('project_id', activeProjectId)
        .eq('key', 'url_history')
        .maybeSingle()

      if (existing) {
        const { error } = await supabase
          .from('text_fields')
          .update({ value: serialized })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('text_fields')
          .insert({ project_id: activeProjectId, key: 'url_history', value: serialized })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['url_history', activeProjectId] })
    },
  })

  // ───────────────────────────────────────────
  // FORMULAS / LINK GENERATION
  // ───────────────────────────────────────────
  const buildUtmUrl = () => {
    if (!baseUrl) return ''
    try {
      let formattedUrl = baseUrl.trim()
      if (!/^https?:\/\//i.test(formattedUrl)) {
        formattedUrl = 'https://' + formattedUrl
      }

      const urlObj = new URL(formattedUrl)
      if (source) urlObj.searchParams.set('utm_source', source.trim())
      if (medium) urlObj.searchParams.set('utm_medium', medium.trim())
      if (campaign) urlObj.searchParams.set('utm_campaign', campaign.trim())
      if (content) urlObj.searchParams.set('utm_content', content.trim())

      return urlObj.toString()
    } catch {
      return ''
    }
  }

  const buildWaUrl = () => {
    if (!phone) return ''
    // Limpar caracteres não numéricos
    const cleanPhone = phone.replace(/\D/g, '')
    if (!cleanPhone) return ''
    
    // Base wa.me url
    const waBase = `https://wa.me/${cleanPhone}`
    if (message) {
      return `${waBase}?text=${encodeURIComponent(message.trim())}`
    }
    return waBase
  }

  const generatedUrl = activeTab === 'utm' ? buildUtmUrl() : buildWaUrl()

  // ───────────────────────────────────────────
  // HANDLERS
  // ───────────────────────────────────────────
  const handleCopy = (urlToCopy: string) => {
    if (!urlToCopy) return
    navigator.clipboard.writeText(urlToCopy)
    setCopied(true)
    showToast('Link copiado com sucesso!')

    // Salvar no histórico de links gerados do projeto
    if (urlHistory) {
      if (urlHistory[0]?.url === urlToCopy) return

      const newEntry = { url: urlToCopy, date: new Date().toLocaleDateString('pt-BR') }
      const updated = [newEntry, ...urlHistory.filter((x) => x.url !== urlToCopy)].slice(0, 8)
      saveHistoryMutation.mutate(updated)
    }

    setTimeout(() => setCopied(false), 2000)
  }

  const downloadQrCode = async (urlToEncode: string, filename = 'qrcode-clave.png') => {
    try {
      showToast('Gerando download do QR Code...')
      const res = await fetch(`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(urlToEncode)}`)
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      showToast('QR Code baixado!')
    } catch {
      showToast('Erro ao baixar o QR Code', 'err')
    }
  }

  return (
    <div className="space-y-6">
      {/* Abas Superiores de Navegação */}
      <div className="flex gap-1 border-b border-border-custom flex-wrap mb-4">
        {[
          { id: 'utm', name: 'Gerador de UTMs', icon: Link },
          { id: 'whatsapp', name: 'Link do WhatsApp', icon: MessageSquare },
          { id: 'qrcode', name: 'Criador de QR Code', icon: QrCode },
        ].map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any)
                setShowQrOutput(false)
              }}
              className={`px-4 py-2.5 text-xs font-semibold cursor-pointer border-b-2 bg-transparent transition-all duration-150 flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'border-text-custom text-text-custom'
                  : 'border-transparent text-text2 hover:text-text-custom'
              }`}
            >
              <Icon className="w-3.5 h-3.5 text-text3" />
              <span>{tab.name}</span>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* COLUNA PRINCIPAL: FORMULÁRIOS */}
        <div className="md:col-span-2 bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-5 animate-[fadeUp_0.15s_ease_both]">
          
          {/* ABA 1: UTM BUILDER */}
          {activeTab === 'utm' && (
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2">
                Parâmetros de Rastreamento (UTM)
              </h4>
              <div className="space-y-3.5 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-text2 mb-1.5 block">URL do Destino (Site/Checkout)</label>
                  <input
                    className="w-full px-3 py-2 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom font-mono"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="Ex: www.seusite.com.br/checkout"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1.5 block">UTM Source (Origem - Canal)</label>
                    <input
                      className="w-full px-3 py-2 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom"
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      placeholder="Ex: facebook, google, instagram"
                      list="sources-list"
                    />
                    <datalist id="sources-list">
                      <option value="facebook" />
                      <option value="instagram" />
                      <option value="google" />
                      <option value="youtube" />
                      <option value="email" />
                      <option value="whatsapp" />
                    </datalist>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1.5 block">UTM Medium (Meio - Formato)</label>
                    <input
                      className="w-full px-3 py-2 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom"
                      value={medium}
                      onChange={(e) => setMedium(e.target.value)}
                      placeholder="Ex: cpc, stories, organico, bio"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1.5 block">UTM Campaign (Campanha)</label>
                    <input
                      className="w-full px-3 py-2 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom"
                      value={campaign}
                      onChange={(e) => setCampaign(e.target.value)}
                      placeholder="Ex: lancamento-março, bf-2026"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-text2 mb-1.5 block">UTM Content (Conteúdo/Anúncio)</label>
                    <input
                      className="w-full px-3 py-2 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder="Ex: criativo-video-01, foto-carrossel"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ABA 2: WHATSAPP LINK */}
          {activeTab === 'whatsapp' && (
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2">
                Gerador de Link de WhatsApp
              </h4>
              <div className="space-y-3.5 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-text2 mb-1.5 block">Número de Telefone (com DDI e DDD)</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom font-mono"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ex: 5511999999999 (55 = Brasil, 11 = DDD)"
                  />
                  <span className="text-[9px] text-text3 mt-1.5 block leading-normal">
                    Importante: Insira apenas números, iniciando com 55 (código do Brasil) seguido pelo DDD e o número.
                  </span>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-text2 mb-1.5 block">Mensagem Padrão (Opcional)</label>
                  <textarea
                    className="w-full p-3 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom h-28 leading-relaxed scrollbar-thin"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Ex: Olá! Gostaria de saber mais sobre a mentoria Clave."
                  />
                </div>
              </div>
            </div>
          )}

          {/* ABA 3: GENERIC QR CODE */}
          {activeTab === 'qrcode' && (
            <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
              <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2">
                Criador de QR Code
              </h4>
              <div className="space-y-4 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-text2 mb-1.5 block">URL ou Texto do QR Code</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom"
                    value={qrLink}
                    onChange={(e) => setQrLink(e.target.value)}
                    placeholder="Ex: https://clave-app.vercel.app/mentoria"
                  />
                </div>

                {qrLink.trim() && (
                  <div className="p-5 bg-surface2 border border-border2 rounded-xl flex flex-col items-center gap-4 animate-[fadeUp_0.1s_ease_both]">
                    <div className="bg-white p-3 rounded-lg shadow-sm border border-border-custom/50">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrLink.trim())}`}
                        alt="QR Code"
                        className="w-44 h-44 object-contain"
                      />
                    </div>
                    <button
                      onClick={() => downloadQrCode(qrLink.trim(), 'qrcode-generic-clave.png')}
                      className="px-4 py-2 bg-text-custom text-white hover:opacity-90 rounded text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      <span>Baixar QR Code PNG</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* OUTPUT DE LINKS (PARA UTM E WHATSAPP) */}
          {activeTab !== 'qrcode' && generatedUrl && (
            <div className="mt-4 p-4.5 bg-surface2 rounded-xl border border-border2 space-y-3.5 animate-[fadeUp_0.1s_ease_both]">
              <div>
                <span className="text-[9px] font-bold text-text3 tracking-wider block uppercase mb-1">
                  Link Gerado com Sucesso
                </span>
                <div className="text-xs font-mono text-text-custom break-all bg-surface p-3 rounded border border-border-custom leading-relaxed select-all">
                  {generatedUrl}
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => handleCopy(generatedUrl)}
                  className="px-4 py-2 bg-text-custom text-white hover:opacity-90 rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? 'Copiado!' : 'Copiar Link'}</span>
                </button>
                <a
                  href={generatedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 border border-border2 text-text-custom hover:bg-surface rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Testar Link</span>
                </a>
                <button
                  onClick={() => setShowQrOutput(!showQrOutput)}
                  className={`px-4 py-2 border text-xs font-semibold rounded flex items-center gap-1.5 cursor-pointer transition-all ${
                    showQrOutput
                      ? 'bg-purple-bg border-purple-custom/30 text-purple-t'
                      : 'border-border2 text-text-custom hover:bg-surface'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  <span>{showQrOutput ? 'Ocultar QR Code' : 'Gerar QR Code'}</span>
                </button>
              </div>

              {/* RENDERIZADOR DE QR CODE ACOPLADO */}
              {showQrOutput && (
                <div className="border-t border-border-custom/50 pt-4 flex flex-col sm:flex-row items-center justify-center gap-5 animate-[fadeUp_0.12s_ease_both]">
                  <div className="bg-white p-3 rounded-lg border border-border-custom shadow-sm">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(generatedUrl)}`}
                      alt="QR Code do Link"
                      className="w-36 h-36 object-contain"
                    />
                  </div>
                  <div className="text-center sm:text-left space-y-2">
                    <p className="text-xs font-bold text-text-custom">QR Code do seu Link</p>
                    <p className="text-[10px] text-text2 max-w-[200px] leading-relaxed">
                      Escaneie ou baixe o QR Code em alta definição para usar em panfletos, apresentações ou criativos.
                    </p>
                    <button
                      onClick={() => downloadQrCode(generatedUrl, `qrcode-${activeTab}-clave.png`)}
                      className="px-3.5 py-1.5 bg-text-custom text-white hover:opacity-90 rounded text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors mx-auto sm:mx-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Baixar Imagem</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* COLUNA SECUNDÁRIA: HISTÓRICO (ÚLTIMOS LINKS) */}
        <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
          <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2 flex items-center gap-1.5">
            <History className="w-4 h-4 text-text3" />
            <span>Últimos Links Gerados</span>
          </h4>

          <div className="space-y-3.5 max-h-[500px] overflow-y-auto pr-1 scrollbar-thin">
            {!urlHistory || urlHistory.length === 0 ? (
              <p className="text-xs text-text3 text-center py-6">Nenhum link gerado anteriormente.</p>
            ) : (
              urlHistory.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-surface2 rounded-xl border border-border-custom text-xs relative space-y-1.5 group hover:border-border2 transition-colors"
                >
                  <div className="flex justify-between items-center text-[9px] text-text3">
                    <span>{item.date}</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(item.url)
                          showToast('Link copiado do histórico')
                        }}
                        className="text-text2 hover:text-text-custom underline cursor-pointer font-semibold"
                      >
                        Copiar
                      </button>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-text2 hover:text-text-custom underline cursor-pointer font-semibold"
                      >
                        Acessar
                      </a>
                    </div>
                  </div>
                  <div className="font-mono text-text-custom break-all leading-normal select-all">
                    {item.url}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
