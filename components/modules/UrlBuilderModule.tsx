'use client'

import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/utils/supabase/client'
import { useAppStore } from '@/store/useAppStore'
import { Copy, Check, History, Link, QrCode, MessageSquare, ExternalLink, Download, Rocket, RefreshCw } from 'lucide-react'
import * as XLSX from 'xlsx'

interface HistoryUrl {
  url: string
  date: string
  name?: string
}

const DEFAULT_BULK_CHANNELS = [
  'manychat',
  'Bio Instagram',
  'Arrasta pra cima',
  'Suporte',
  'Direct',
  'Email',
  'Whatsapp',
  'Telegram',
  'Grupo Facebook',
  'Site',
  'Chat YT',
  'Chat IG',
  'QR Code',
  ...Array.from({ length: 16 }, (_, i) => `email${i + 1}`),
  ...Array.from({ length: 16 }, (_, i) => `wpp${i + 1}`),
  'Suporte01',
  'wpp1s1',
  'youtube',
  'Influencer 01',
  'Influencer 02'
]

const slugify = (text: string) => {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD') // remove accents
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\--+/g, '-')
}

export default function UrlBuilderModule() {
  const queryClient = useQueryClient()
  const supabase = createClient()
  const { activeProjectId, showToast } = useAppStore()

  // Tabs: utm | bulk_utm | whatsapp | qrcode
  const [activeTab, setActiveTab] = useState<'utm' | 'bulk_utm' | 'whatsapp' | 'qrcode'>('utm')

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

  // 4. Bulk UTM states
  const [bulkBaseUrl, setBulkBaseUrl] = useState('')
  const [selectedLaunchId, setSelectedLaunchId] = useState('')
  const [bulkCampaign, setBulkCampaign] = useState('')
  const [bulkChannels, setBulkChannels] = useState<string[]>(DEFAULT_BULK_CHANNELS)
  const [newCustomChannel, setNewCustomChannel] = useState('')
  const [copiedRowIdx, setCopiedRowIdx] = useState<number | null>(null)

  // 5. Link Naming & Search states
  const [linkName, setLinkName] = useState('')
  const [historySearch, setHistorySearch] = useState('')
  const [localHistory, setLocalHistory] = useState<HistoryUrl[] | null>(null)

  // Clear local states on project switch
  useEffect(() => {
    const timer = setTimeout(() => {
      setLocalHistory(null)
    }, 0)
    return () => clearTimeout(timer)
  }, [activeProjectId])


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

  // Sync query data into local state
  useEffect(() => {
    if (urlHistory && localHistory === null) {
      const timer = setTimeout(() => {
        setLocalHistory(urlHistory)
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [urlHistory, localHistory])

  // Load launches for select
  const { data: launches = [] } = useQuery<any[]>({
    queryKey: ['launches_dropdown', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return []
      const { data, error } = await supabase
        .from('lancamentos')
        .select('id, nome')
        .eq('project_id', activeProjectId)
      if (error) return []
      return data || []
    },
    enabled: !!activeProjectId
  })

  const handleLaunchSelect = (launchId: string) => {
    setSelectedLaunchId(launchId)
    if (launchId) {
      const selected = launches.find(l => l.id === launchId)
      if (selected) {
        setBulkCampaign(slugify(selected.nome))
      }
    } else {
      setBulkCampaign('')
    }
  }

  const generateBulkUrl = (channel: string) => {
    if (!bulkBaseUrl) return ''
    try {
      let formattedUrl = bulkBaseUrl.trim()
      if (!/^https?:\/\//i.test(formattedUrl)) {
        formattedUrl = 'https://' + formattedUrl
      }
      
      const urlObj = new URL(formattedUrl)
      
      const channelLower = channel.toLowerCase()
      let source = slugify(channel)
      let medium = 'link'
      let content = ''

      if (channelLower.includes('manychat')) {
        source = 'instagram'
        medium = 'manychat'
      } else if (channelLower.includes('bio instagram')) {
        source = 'instagram'
        medium = 'bio'
      } else if (channelLower.includes('arrasta pra cima')) {
        source = 'instagram'
        medium = 'stories'
      } else if (channelLower === 'suporte') {
        source = 'whatsapp'
        medium = 'suporte'
      } else if (channelLower === 'direct') {
        source = 'instagram'
        medium = 'direct'
      } else if (channelLower === 'email') {
        source = 'email'
        medium = 'newsletter'
      } else if (channelLower === 'whatsapp') {
        source = 'whatsapp'
        medium = 'organico'
      } else if (channelLower === 'telegram') {
        source = 'telegram'
        medium = 'organico'
      } else if (channelLower.includes('facebook')) {
        source = 'facebook'
        medium = 'group'
      } else if (channelLower === 'site') {
        source = 'site'
        medium = 'organico'
      } else if (channelLower.includes('chat yt')) {
        source = 'youtube'
        medium = 'chat'
      } else if (channelLower.includes('chat ig')) {
        source = 'instagram'
        medium = 'chat'
      } else if (channelLower.includes('qr code')) {
        source = 'qrcode'
        medium = 'offline'
      } else if (/^email\d+$/.test(channelLower)) {
        source = 'email'
        medium = 'newsletter'
        content = channelLower
      } else if (/^wpp\d+$/.test(channelLower)) {
        source = 'whatsapp'
        medium = 'chat'
        content = channelLower
      } else if (channelLower === 'suporte01') {
        source = 'whatsapp'
        medium = 'suporte01'
      } else if (channelLower === 'wpp1s1') {
        source = 'whatsapp'
        medium = 'wpp1s1'
      } else if (channelLower === 'youtube') {
        source = 'youtube'
        medium = 'organico'
      } else if (channelLower.startsWith('influencer')) {
        source = 'influencer'
        medium = slugify(channel)
      }

      urlObj.searchParams.set('utm_source', source)
      urlObj.searchParams.set('utm_medium', medium)
      if (bulkCampaign) {
        urlObj.searchParams.set('utm_campaign', bulkCampaign.trim())
      }
      if (content) {
        urlObj.searchParams.set('utm_content', content)
      }

      return urlObj.toString()
    } catch {
      return ''
    }
  }

  const exportToExcel = () => {
    if (!bulkBaseUrl) {
      showToast('Por favor, defina a URL Base primeiro.', 'err')
      return
    }
    try {
      const dataToExport = bulkChannels.map(channel => ({
        Canal: channel,
        'Link UTM Gerado': generateBulkUrl(channel)
      }))

      const worksheet = XLSX.utils.json_to_sheet(dataToExport)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Links UTM')
      
      const maxLenChannel = Math.max(...bulkChannels.map(c => c.length), 10)
      const maxLenUrl = Math.max(...dataToExport.map(d => d['Link UTM Gerado'].length), 20)
      worksheet['!cols'] = [
        { wch: maxLenChannel + 5 },
        { wch: maxLenUrl + 5 }
      ]

      const fileName = `links-utm-${bulkCampaign || 'lancamento'}.xlsx`
      XLSX.writeFile(workbook, fileName)
      showToast('Planilha Excel exportada com sucesso!')
    } catch (err) {
      console.error(err)
      showToast('Erro ao exportar planilha Excel', 'err')
    }
  }

  const handleRefazer = () => {
    setBulkBaseUrl('')
    setBulkCampaign('')
    setSelectedLaunchId('')
    setBulkChannels(DEFAULT_BULK_CHANNELS)
  }

  const handleCopyAll = () => {
    const allLinks = bulkChannels
      .map(channel => `${channel}: ${generateBulkUrl(channel)}`)
      .join('\n')
    navigator.clipboard.writeText(allLinks)
    showToast('Todos os links copiados!')
  }

  const handleAddCustomChannel = () => {
    if (!newCustomChannel.trim()) return
    if (bulkChannels.includes(newCustomChannel.trim())) {
      showToast('Este canal já existe na lista!', 'err')
      return
    }
    setBulkChannels([...bulkChannels, newCustomChannel.trim()])
    setNewCustomChannel('')
    showToast('Canal adicionado!')
  }

  const handleRemoveCustomChannel = (channel: string) => {
    setBulkChannels(bulkChannels.filter(c => c !== channel))
    showToast('Canal removido!')
  }

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
    const baseHistory = localHistory || urlHistory
    if (baseHistory) {
      if (baseHistory[0]?.url === urlToCopy) {
        if (linkName.trim() && !baseHistory[0].name) {
          const updated = [...baseHistory]
          updated[0] = { ...updated[0], name: linkName.trim() }
          setLocalHistory(updated)
          saveHistoryMutation.mutate(updated)
          setLinkName('')
        }
        setTimeout(() => setCopied(false), 2000)
        return
      }

      const newEntry: HistoryUrl = {
        url: urlToCopy,
        date: new Date().toLocaleDateString('pt-BR'),
        name: linkName.trim() || undefined,
      }
      const updated = [newEntry, ...baseHistory.filter((x) => x.url !== urlToCopy)].slice(0, 50)
      setLocalHistory(updated)
      saveHistoryMutation.mutate(updated)
      setLinkName('')
    }

    setTimeout(() => setCopied(false), 2000)
  }

  const updateHistoryName = (idx: number, newName: string) => {
    const baseHistory = localHistory || urlHistory || []
    const updated = [...baseHistory]
    updated[idx] = { ...updated[idx], name: newName }
    setLocalHistory(updated)
  }

  const handleHistoryBlur = () => {
    if (localHistory) {
      saveHistoryMutation.mutate(localHistory)
    }
  }

  const deleteHistoryItem = (idx: number) => {
    const baseHistory = localHistory || urlHistory || []
    const updated = baseHistory.filter((_, i) => i !== idx)
    setLocalHistory(updated)
    saveHistoryMutation.mutate(updated)
    showToast('Link removido do histórico')
  }

  const filteredHistory = (localHistory || urlHistory || []).filter((item) => {
    const query = historySearch.toLowerCase()
    return (
      !query ||
      (item.name || '').toLowerCase().includes(query) ||
      item.url.toLowerCase().includes(query)
    )
  })

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
        {([
          { id: 'utm', name: 'Gerador de UTMs', icon: Link },
          { id: 'bulk_utm', name: 'Gerador Automático (Lançamentos)', icon: Rocket },
          { id: 'whatsapp', name: 'Link do WhatsApp', icon: MessageSquare },
          { id: 'qrcode', name: 'Criador de QR Code', icon: QrCode },
        ] as const).map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id)
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
                <div>
                  <label className="text-[10px] font-bold text-text2 mb-1.5 block">Nome / Identificador do Link (Opcional)</label>
                  <input
                    className="w-full px-3 py-2 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom"
                    value={linkName}
                    onChange={(e) => setLinkName(e.target.value)}
                    placeholder="Ex: Abandono de Carrinho - Tráfego Pago"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: BULK UTM GENERATOR */}
          {activeTab === 'bulk_utm' && (
            <div className="space-y-5 animate-[fadeUp_0.15s_ease_both]">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center border-b border-border-custom pb-3 gap-3">
                <h4 className="text-xs font-bold text-text-custom">
                  Gerador Automático de Links UTM
                </h4>
                <div className="flex gap-2 self-end">
                  <button
                    onClick={handleCopyAll}
                    disabled={!bulkBaseUrl}
                    className="px-2.5 py-1 bg-surface border border-border-custom hover:bg-surface2 disabled:opacity-40 disabled:hover:bg-surface text-text-custom text-[10px] font-semibold rounded cursor-pointer transition-colors"
                  >
                    Copiar Todos
                  </button>
                  <button
                    onClick={exportToExcel}
                    disabled={!bulkBaseUrl}
                    className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 disabled:hover:bg-emerald-500/10 text-[10px] font-semibold rounded cursor-pointer transition-colors"
                  >
                    Exportar em XLSX
                  </button>
                  <button
                    onClick={handleRefazer}
                    className="px-2.5 py-1 bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-[10px] font-semibold rounded cursor-pointer transition-colors"
                  >
                    Refazer UTMs
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-text2 uppercase block">Vincular Lançamento</label>
                  <select
                    className="px-3 py-2 border border-border2 rounded bg-surface2 text-text-custom outline-none cursor-pointer"
                    value={selectedLaunchId}
                    onChange={(e) => handleLaunchSelect(e.target.value)}
                  >
                    <option value="">-- Selecione um Lançamento --</option>
                    {launches.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-text2 uppercase block">URL Base</label>
                  <input
                    type="text"
                    className="px-3 py-2 border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom"
                    placeholder="Ex: https://www.seusite.com.br"
                    value={bulkBaseUrl}
                    onChange={(e) => setBulkBaseUrl(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-text2 uppercase block">Nome Da Campanha (utm_campaign)</label>
                  <input
                    type="text"
                    className="px-3 py-2 border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom"
                    placeholder="Ex: blackfriday1124"
                    value={bulkCampaign}
                    onChange={(e) => setBulkCampaign(e.target.value)}
                  />
                </div>
              </div>

              {/* Custom Channel Adder */}
              <div className="flex gap-2 items-end pt-2 border-t border-border-custom text-xs">
                <div className="flex-1 flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-text2 uppercase block">Adicionar Canal Personalizado</label>
                  <input
                    type="text"
                    className="px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom"
                    placeholder="Ex: Parceria Influenciador X"
                    value={newCustomChannel}
                    onChange={(e) => setNewCustomChannel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddCustomChannel()
                    }}
                  />
                </div>
                <button
                  onClick={handleAddCustomChannel}
                  className="px-3.5 py-1.5 bg-text-custom text-white hover:opacity-90 rounded font-semibold text-xs transition-colors cursor-pointer"
                >
                  Adicionar
                </button>
              </div>

              {/* Table of UTMs */}
              <div className="border border-border-custom rounded-xl overflow-hidden shadow-sm">
                <div className="max-h-[450px] overflow-y-auto scrollbar-thin">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-surface2 text-text3 font-bold border-b border-border-custom">
                        <th className="px-4 py-2.5 w-1/4">Canal</th>
                        <th className="px-4 py-2.5 w-3/4">Link UTM Gerado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-custom">
                      {bulkChannels.map((channel, idx) => {
                        const generatedUrl = generateBulkUrl(channel)
                        return (
                          <tr key={idx} className="hover:bg-surface2/40 transition-colors group">
                            <td className="px-4 py-2.5 font-semibold text-text-custom flex items-center justify-between gap-2">
                              <span>{channel}</span>
                              {!DEFAULT_BULK_CHANNELS.includes(channel) && (
                                <button
                                  onClick={() => handleRemoveCustomChannel(channel)}
                                  className="text-red-400 hover:text-red-300 font-bold opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer pr-1"
                                >
                                  ×
                                </button>
                              )}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-[10px] break-all select-all text-text2 hover:text-text-custom transition-colors">
                              {generatedUrl ? (
                                <div className="flex items-center justify-between gap-3">
                                  <span className="flex-1">{generatedUrl}</span>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(generatedUrl)
                                      setCopiedRowIdx(idx)
                                      showToast(`Copiado link de: ${channel}`)
                                      setTimeout(() => setCopiedRowIdx(null), 2000)
                                    }}
                                    className="px-2 py-1 bg-surface border border-border-custom hover:bg-surface2 text-text-custom font-semibold rounded text-[9px] cursor-pointer transition-colors"
                                  >
                                    {copiedRowIdx === idx ? 'Copiado!' : 'Copiar'}
                                  </button>
                                </div>
                              ) : (
                                <span className="text-text3 italic">Insira a URL Base...</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
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
                <div>
                  <label className="text-[10px] font-bold text-text2 mb-1.5 block">Nome / Identificador do Link (Opcional)</label>
                  <input
                    className="w-full px-3 py-2 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom"
                    value={linkName}
                    onChange={(e) => setLinkName(e.target.value)}
                    placeholder="Ex: Link do Suporte no Site"
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
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrLink.trim())}`}
                        alt="QR Code"
                        className="w-44 h-44 object-contain"
                      />
                    </div>
                    <button
                      onClick={() => downloadQrCode(qrLink.trim(), 'qrcode-generic-clave.png')}
                      className="px-4 py-2 bg-text-custom text-surface hover:opacity-90 rounded text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors"
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
                  className="px-4 py-2 bg-text-custom text-surface hover:opacity-90 rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
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
                      className="px-3.5 py-1.5 bg-text-custom text-surface hover:opacity-90 rounded text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors mx-auto sm:mx-0"
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

          {/* Search Box */}
          <div className="relative">
            <input
              className="w-full px-3 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Buscar no histórico..."
            />
          </div>

          <div className="space-y-3.5 max-h-[500px] overflow-y-auto pr-1 scrollbar-thin">
            {filteredHistory.length === 0 ? (
              <p className="text-xs text-text3 text-center py-6">Nenhum link encontrado.</p>
            ) : (
              filteredHistory.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-surface2 rounded-xl border border-border-custom text-xs relative space-y-1.5 group hover:border-border2 transition-colors"
                >
                  {/* Delete button top right */}
                  <button
                    onClick={() => deleteHistoryItem(idx)}
                    className="absolute right-2 top-2 text-text3 hover:text-red-t cursor-pointer font-bold text-sm hidden group-hover:block transition-all animate-[fadeIn_0.1s_ease_both]"
                    title="Excluir link do histórico"
                  >
                    ×
                  </button>

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

                  {/* Name field as inline editable text input */}
                  <div className="pt-0.5">
                    <input
                      type="text"
                      className="w-full bg-transparent text-[11px] font-bold text-text-custom outline-none border-b border-transparent hover:border-border2 focus:border-text-custom pb-0.5"
                      value={item.name || ''}
                      onChange={(e) => updateHistoryName(idx, e.target.value)}
                      onBlur={handleHistoryBlur}
                      placeholder="Sem nome (clique para nomear...)"
                    />
                  </div>

                  <div className="font-mono text-text3 break-all leading-normal text-[10px] select-all">
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
