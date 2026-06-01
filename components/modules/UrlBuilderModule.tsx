'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/utils/supabase/client'
import { useAppStore } from '@/store/useAppStore'
import { Copy, Check, History, Link, Plus } from 'lucide-react'

interface HistoryUrl {
  url: string
  date: string
}

export default function UrlBuilderModule() {
  const queryClient = useQueryClient()
  const supabase = createClient()
  const { activeProjectId, showToast } = useAppStore()

  // Form states
  const [baseUrl, setBaseUrl] = useState('')
  const [source, setSource] = useState('')
  const [medium, setMedium] = useState('')
  const [campaign, setCampaign] = useState('')
  const [content, setContent] = useState('')
  const [copied, setCopied] = useState(false)

  // 1. QUERY HISTORY
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

  // 2. MUTATION SAVE HISTORY
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

  // URL Building Formula
  const buildUrl = () => {
    if (!baseUrl) return ''
    try {
      // Garantir que a URL possui protocolo
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

  const generatedUrl = buildUrl()

  const handleCopy = () => {
    if (!generatedUrl) return
    navigator.clipboard.writeText(generatedUrl)
    setCopied(true)
    showToast('Link copiado para a área de transferência')

    // Salvar no histórico (máximo de 8 itens)
    if (urlHistory) {
      // Evitar duplicados consecutivos no topo do histórico
      if (urlHistory[0]?.url === generatedUrl) return

      const newEntry = { url: generatedUrl, date: new Date().toLocaleDateString('pt-BR') }
      const updated = [newEntry, ...urlHistory.filter((x) => x.url !== generatedUrl)].slice(0, 8)
      saveHistoryMutation.mutate(updated)
    }

    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-[fadeUp_0.15s_ease_both]">
      {/* URL Builder Form */}
      <div className="md:col-span-2 bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
        <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2 flex items-center gap-1.5">
          <Link className="w-4 h-4 text-text3" />
          <span>Gerador de Links UTM</span>
        </h4>

        <div className="space-y-3.5 text-xs">
          <div>
            <label className="text-[10px] font-bold text-text2 mb-1.5 block">URL Base</label>
            <input
              className="w-full px-3 py-2 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom font-mono"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="Ex: marketing.clave.app/oferta"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-text2 mb-1.5 block">UTM Source (Origem)</label>
              <input
                className="w-full px-3 py-2 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Ex: facebook, google, email"
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
              <label className="text-[10px] font-bold text-text2 mb-1.5 block">UTM Medium (Meio)</label>
              <input
                className="w-full px-3 py-2 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom"
                value={medium}
                onChange={(e) => setMedium(e.target.value)}
                placeholder="Ex: cpc, stories, organic, linktree"
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
                placeholder="Ex: BF-2025, lancamento-03"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-text2 mb-1.5 block">UTM Content (Conteúdo)</label>
              <input
                className="w-full px-3 py-2 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Ex: criativo-01, video-vsl"
              />
            </div>
          </div>
        </div>

        {/* Output Link */}
        {generatedUrl && (
          <div className="mt-6 p-4 bg-surface2 rounded-lg border border-border2 space-y-2.5 animate-[fadeUp_0.15s_ease_both]">
            <span className="text-[9px] font-bold text-text3 tracking-wider block uppercase">Link Gerado</span>
            <div className="text-xs font-mono text-text-custom break-all bg-surface p-2.5 rounded border border-border-custom leading-relaxed select-all">
              {generatedUrl}
            </div>
            <button
              onClick={handleCopy}
              className="px-3.5 py-1.5 bg-text-custom text-white hover:opacity-90 rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copiado!' : 'Copiar Link'}</span>
            </button>
          </div>
        )}
      </div>

      {/* URL History Panel */}
      <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4">
        <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2 flex items-center gap-1.5">
          <History className="w-4 h-4 text-text3" />
          <span>Últimos Links Gerados</span>
        </h4>

        <div className="space-y-3.5 max-h-96 overflow-y-auto pr-1 scrollbar-thin">
          {!urlHistory || urlHistory.length === 0 ? (
            <p className="text-xs text-text3 text-center py-6">Nenhum link gerado anteriormente.</p>
          ) : (
            urlHistory.map((item, idx) => (
              <div
                key={idx}
                className="p-3 bg-surface2 rounded-lg border border-border-custom text-xs relative space-y-1.5 group hover:border-border2"
              >
                <div className="flex justify-between items-center text-[9px] text-text3">
                  <span>{item.date}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(item.url)
                      showToast('Link copiado do histórico')
                    }}
                    className="text-text2 hover:text-text-custom underline cursor-pointer"
                  >
                    Copiar
                  </button>
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
  )
}
