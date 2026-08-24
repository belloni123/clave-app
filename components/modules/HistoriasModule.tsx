'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/utils/supabase/client'
import { useAppStore } from '@/store/useAppStore'
import {
  BookOpenCheck,
  Check,
  FileAudio,
  Mic,
  Sparkles,
  Square,
  Trash,
  Upload,
  X,
} from 'lucide-react'
import ProjectAiSettings from '@/components/modules/ProjectAiSettings'

interface Story {
  id: string
  project_id: string
  title: string
  category: string
  emotion: string
  context: string
  result: string
  body: string
  used: boolean
  audio_storage_path: string | null
  audio_original_name: string | null
  audio_mime_type: string | null
  audio_size_bytes: number | null
  transcribed_at: string | null
  audio_url?: string | null
  ai_analysis: {
    resumo: string
    angulos: string[]
    formatos: string[]
    gatilhos: string[]
  } | null
}

type StoryInputMode = 'text' | 'record' | 'upload'

interface CreateStoryPayload {
  title: string
  category: string
  emotion: string
  context: string
  result: string
  body: string
  used: boolean
  audioFile: File | null
  audioTranscribed: boolean
}

async function decodeAudioForWhisper(file: File) {
  const AudioContextClass = window.AudioContext
  const context = new AudioContextClass()
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer())
    if (decoded.sampleRate === 16_000 && decoded.numberOfChannels === 1) {
      return new Float32Array(decoded.getChannelData(0))
    }

    const outputLength = Math.max(1, Math.ceil(decoded.duration * 16_000))
    const offline = new OfflineAudioContext(1, outputLength, 16_000)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    const rendered = await offline.startRendering()
    return new Float32Array(rendered.getChannelData(0))
  } finally {
    await context.close()
  }
}

const CATEGORIES = ['Vida pessoal', 'Negócio', 'Superação', 'Aprendizado', 'Relacionamento', 'Outro']
const EMOTIONS = ['Medo', 'Esperança', 'Raiva', 'Gratidão', 'Determinação', 'Alegria']

const CATEGORY_COLORS: Record<string, string> = {
  'Vida pessoal': 'bg-gray-bg text-gray-t',
  'Negócio': 'bg-blue-bg text-blue-t',
  'Superação': 'bg-green-bg text-green-t',
  'Aprendizado': 'bg-purple-bg text-purple-t',
  'Relacionamento': 'bg-coral-bg text-coral-t',
  'Outro': 'bg-amber-bg text-amber-t',
}

export default function HistoriasModule() {
  const queryClient = useQueryClient()
  const supabase = createClient()
  const { activeProjectId, showToast } = useAppStore()

  const [activeSubTab, setActiveSubTab] = useState<'lista' | 'add' | 'consulta'>('lista')

  // Story form states
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [emotion, setEmotion] = useState(EMOTIONS[0])
  const [context, setContext] = useState('')
  const [result, setResult] = useState('')
  const [body, setBody] = useState('')
  const [used, setUsed] = useState(false)
  const [storyInputMode, setStoryInputMode] = useState<StoryInputMode>('text')
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null)
  const [audioTranscribed, setAudioTranscribed] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcriptionStage, setTranscriptionStage] = useState('')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const recordingChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const transcriptionWorkerRef = useRef<Worker | null>(null)

  // AI Consolidated query states
  const [iaInt, setIaInt] = useState<number>(0)
  const [iaCtx, setIaCtx] = useState('')
  const [iaGlobalResult, setIaGlobalResult] = useState<string | null>(null)
  const [iaGlobalLoading, setIaGlobalLoading] = useState(false)

  // Active AI individual loading track
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl)
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [audioPreviewUrl])

  useEffect(() => {
    return () => transcriptionWorkerRef.current?.terminate()
  }, [])

  // 1. QUERY STORIES FROM SUPABASE
  const { data: stories } = useQuery({
    queryKey: ['stories', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return []
      const { data, error } = await supabase
        .from('stories')
        .select('*')
        .eq('project_id', activeProjectId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (error) {
        showToast('Erro ao carregar histórias', 'err')
        return []
      }
      const rows = data as Story[]
      return Promise.all(rows.map(async (story) => {
        if (!story.audio_storage_path) return story
        const { data: signed } = await supabase.storage
          .from('story-audio')
          .createSignedUrl(story.audio_storage_path, 3_600)
        return { ...story, audio_url: signed?.signedUrl ?? null }
      }))
    },
    enabled: !!activeProjectId,
  })

  // 2. MUTATIONS
  const createStoryMutation = useMutation({
    mutationFn: async (payload: CreateStoryPayload) => {
      if (!activeProjectId) return
      let audioStoragePath: string | null = null

      try {
        if (payload.audioFile) {
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) throw new Error('Sessão expirada')
          const fileExtension = payload.audioFile.name.toLowerCase().split('.').pop() || 'webm'
          audioStoragePath = `${activeProjectId}/${user.id}/${crypto.randomUUID()}.${fileExtension}`
          const { error: uploadError } = await supabase.storage
            .from('story-audio')
            .upload(audioStoragePath, payload.audioFile, {
              contentType: payload.audioFile.type || 'audio/webm',
              upsert: false,
            })
          if (uploadError) throw uploadError
        }

        const {
          audioFile: selectedAudio,
          audioTranscribed: wasTranscribed,
          ...storyData
        } = payload
        const { error } = await supabase.from('stories').insert({
          ...storyData,
          project_id: activeProjectId,
          ai_analysis: null,
          audio_storage_path: audioStoragePath,
          audio_original_name: selectedAudio?.name ?? null,
          audio_mime_type: selectedAudio?.type ?? null,
          audio_size_bytes: selectedAudio?.size ?? null,
          transcribed_at: selectedAudio && wasTranscribed ? new Date().toISOString() : null,
        })
        if (error) throw error
      } catch (error) {
        if (audioStoragePath) {
          await supabase.storage.from('story-audio').remove([audioStoragePath])
        }
        throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stories', activeProjectId] })
      showToast('História adicionada com sucesso!')
      resetForm()
      setActiveSubTab('lista')
    },
    onError: () => {
      showToast('Erro ao salvar história', 'err')
    },
  })

  const updateStoryMutation = useMutation({
    mutationFn: async (payload: { id: string; used?: boolean; ai_analysis?: Story['ai_analysis'] }) => {
      const { error } = await supabase
        .from('stories')
        .update(payload)
        .eq('id', payload.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stories', activeProjectId] })
    },
  })

  const deleteStoryMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('stories')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stories', activeProjectId] })
      showToast('História excluída')
    },
  })

  const resetForm = () => {
    setTitle('')
    setCategory(CATEGORIES[0])
    setEmotion(EMOTIONS[0])
    setContext('')
    setResult('')
    setBody('')
    setUsed(false)
    setStoryInputMode('text')
    setAudioFile(null)
    setAudioTranscribed(false)
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl)
    setAudioPreviewUrl(null)
    setRecordingSeconds(0)
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !body.trim()) return
    createStoryMutation.mutate({
      title: title.trim(),
      category,
      emotion,
      context: context.trim(),
      result: result.trim(),
      body: body.trim(),
      used,
      audioFile,
      audioTranscribed,
    })
  }

  const setSelectedAudio = (file: File) => {
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl)
    setAudioFile(file)
    setAudioTranscribed(false)
    setAudioPreviewUrl(URL.createObjectURL(file))
  }

  const transcribeAudio = async (file: File) => {
    if (!activeProjectId) return
    if (file.size > 25 * 1024 * 1024) {
      showToast('O áudio deve ter no máximo 25 MB.', 'err')
      return
    }

    setSelectedAudio(file)
    setIsTranscribing(true)
    setTranscriptionStage('Preparando áudio...')
    try {
      const audio = await decodeAudioForWhisper(file)
      const worker = transcriptionWorkerRef.current ?? new Worker(
        '/workers/transcription.worker.js',
        { type: 'module' },
      )
      transcriptionWorkerRef.current = worker
      const id = crypto.randomUUID()
      const transcript = await new Promise<string>((resolve, reject) => {
        const listener = (event: MessageEvent<{
          type: string
          id?: string
          status?: string
          text?: string
          message?: string
        }>) => {
          if (event.data.id && event.data.id !== id) return
          if (event.data.type === 'status') {
            setTranscriptionStage(
              event.data.status === 'loading_model'
                ? 'Carregando transcrição local...'
                : 'Transcrevendo áudio...',
            )
            return
          }
          if (event.data.type === 'result') {
            worker.removeEventListener('message', listener)
            resolve(event.data.text?.trim() ?? '')
          } else if (event.data.type === 'error') {
            worker.removeEventListener('message', listener)
            reject(new Error(event.data.message || 'Falha na transcrição local.'))
          }
        }
        worker.addEventListener('message', listener)
        worker.postMessage({ id, audio }, [audio.buffer])
      })
      if (!transcript) throw new Error('Nenhuma fala foi identificada no áudio.')
      setBody(transcript)
      setAudioTranscribed(true)
      showToast('Áudio transcrito. Revise o texto antes de salvar.')
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'Não foi possível transcrever este formato de áudio.',
        'err',
      )
    } finally {
      setIsTranscribing(false)
      setTranscriptionStage('')
    }
  }

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      showToast('Este navegador não permite gravação de áudio.', 'err')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recordingStreamRef.current = stream
      const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm']
        .find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      recordingChunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const baseMime = (recorder.mimeType || 'audio/webm').split(';')[0]
        const extension = baseMime.includes('ogg') ? 'ogg' : 'webm'
        const blob = new Blob(recordingChunksRef.current, { type: baseMime })
        const file = new File([blob], `historia-${Date.now()}.${extension}`, { type: baseMime })
        stream.getTracks().forEach((track) => track.stop())
        recordingStreamRef.current = null
        void transcribeAudio(file)
      }
      recorder.start(1_000)
      setRecordingSeconds(0)
      setIsRecording(true)
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((seconds) => seconds + 1)
      }, 1_000)
    } catch {
      showToast('Não foi possível acessar o microfone.', 'err')
    }
  }

  const stopRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
    recordingTimerRef.current = null
    setIsRecording(false)
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
  }

  const clearSelectedAudio = () => {
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl)
    setAudioFile(null)
    setAudioTranscribed(false)
    setAudioPreviewUrl(null)
  }

  const handleToggleUsed = (story: Story) => {
    updateStoryMutation.mutate({ id: story.id, used: !story.used })
    showToast(story.used ? 'Marcada como disponível' : 'Marcada como usada no conteúdo')
  }

  // 3. INDIVIDUAL AI ANALYSIS CALL
  const handleAIAnalyze = async (story: Story) => {
    setAiLoadingId(story.id)
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProjectId,
          task: 'individual_story',
          story: {
            title: story.title,
            category: story.category,
            emotion: story.emotion,
            context: story.context,
            result: story.result,
            body: story.body,
          },
        }),
      })

      const data = await res.json().catch(() => ({})) as {
        analysis?: Story['ai_analysis']
        error?: string
      }
      if (!res.ok || !data.analysis) throw new Error(data.error || 'Falha na API de IA')
      
      updateStoryMutation.mutate({
        id: story.id,
        ai_analysis: data.analysis,
      })
      showToast('Análise de IA concluída!')
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Erro inesperado'
      showToast('Erro na análise da IA: ' + errMsg, 'err')
    } finally {
      setAiLoadingId(null)
    }
  }

  // 4. GLOBAL CONSOLIDATED AI CONSULTATION CALL
  const handleAIGlobalConsult = async () => {
    if (!stories || stories.length === 0) {
      showToast('Adicione histórias primeiro.', 'err')
      return
    }

    const INTENTS = ['Roteiro de VSL', 'YouTube', 'Reels', 'E-mail', 'Análise geral']
    const intent = INTENTS[iaInt]

    setIaGlobalLoading(true)
    setIaGlobalResult(null)

    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProjectId,
          task: 'global_consultation',
          intent,
          context: iaCtx.trim(),
          stories: stories.slice(0, 40).map((s) => ({
            title: s.title,
            category: s.category,
            emotion: s.emotion,
            context: s.context,
            result: s.result,
            body: s.body.slice(0, 6_000),
          })),
        }),
      })

      const data = await res.json().catch(() => ({})) as { suggestion?: string; error?: string }
      if (!res.ok || !data.suggestion) throw new Error(data.error || 'Falha na API de IA')
      setIaGlobalResult(data.suggestion)
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Erro inesperado'
      showToast('Erro ao consultar IA: ' + errMsg, 'err')
    } finally {
      setIaGlobalLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Subtabs header */}
      <div className="flex gap-1 border-b border-border-custom flex-wrap mb-4">
        {([
          { id: 'lista', name: 'Minhas Histórias' },
          { id: 'add', name: 'Cadastrar História' },
          { id: 'consulta', name: 'Criador de Conteúdo com IA' },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`px-4 py-2 text-xs font-semibold cursor-pointer border-b-2 bg-transparent transition-colors duration-150 ${
              activeSubTab === tab.id
                ? 'border-text-custom text-text-custom'
                : 'border-transparent text-text2 hover:text-text-custom'
            }`}
          >
            {tab.name}
          </button>
        ))}
      </div>

      {/* ==========================================
          TAB: LIST STORIES
          ========================================== */}
      {activeSubTab === 'lista' && stories && (
        <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
          {stories.length === 0 ? (
            <div className="py-12 bg-surface border border-border-custom rounded-xl text-center text-text3 text-xs">
              Nenhuma história cadastrada para este projeto. Vá em &quot;Cadastrar História&quot; para começar.
            </div>
          ) : (
            stories.map((story) => (
              <div
                key={story.id}
                className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4"
              >
                {/* Header row */}
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-xs font-bold text-text-custom leading-tight">
                        {story.title}
                      </h4>
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded font-semibold ${
                          CATEGORY_COLORS[story.category] || 'bg-gray-bg text-gray-t'
                        }`}
                      >
                        {story.category}
                      </span>
                      <span className="text-[9px] px-2 py-0.5 rounded bg-surface2 text-text2 border border-border-custom font-medium">
                        {story.emotion}
                      </span>
                      {story.used && (
                        <span className="text-[9px] px-2 py-0.5 rounded bg-green-bg text-green-t font-semibold flex items-center gap-0.5">
                          <Check className="w-2.5 h-2.5" />
                          <span>Já usada</span>
                        </span>
                      )}
                    </div>
                    {story.context && (
                      <p className="text-[11px] text-text3 mt-1.5 leading-normal">
                        <strong>Contexto:</strong> {story.context}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleToggleUsed(story)}
                      className={`p-1.5 border rounded cursor-pointer transition-colors ${
                        story.used
                          ? 'bg-green-bg text-green-t border-green-custom/30'
                          : 'border-border2 text-text2 hover:text-text-custom hover:bg-surface2'
                      }`}
                      title={story.used ? 'Desmarcar como usada' : 'Marcar como usada'}
                    >
                      <BookOpenCheck className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Deseja excluir esta história?')) {
                          deleteStoryMutation.mutate(story.id)
                        }
                      }}
                      className="p-1.5 border border-red-t/30 text-red-t hover:bg-red-bg rounded transition-colors cursor-pointer"
                      title="Excluir história"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Body Content */}
                <p className="text-xs text-text-custom bg-surface2 p-3.5 rounded border border-border-custom leading-relaxed whitespace-pre-wrap">
                  {story.body}
                </p>

                {story.audio_url && (
                  <div className="flex items-center gap-3 rounded border border-border-custom bg-surface2 px-3 py-2">
                    <FileAudio className="h-4 w-4 shrink-0 text-blue-t" />
                    <audio controls preload="metadata" src={story.audio_url} className="h-8 min-w-0 flex-1" />
                    <span className="hidden max-w-40 truncate text-[9px] text-text3 sm:block">
                      {story.audio_original_name || 'Áudio da história'}
                    </span>
                  </div>
                )}

                {/* AI Analysis section */}
                <div className="border-t border-border-custom pt-3.5 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-text-custom tracking-wide uppercase flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-purple-custom" />
                      <span>Análise de IA</span>
                    </span>
                    <button
                      onClick={() => handleAIAnalyze(story)}
                      disabled={aiLoadingId !== null}
                      className="px-3 py-1.5 bg-purple-bg text-purple-t border border-purple-custom/20 hover:bg-purple-custom hover:text-white rounded text-[10px] font-semibold cursor-pointer transition-all disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {aiLoadingId === story.id ? (
                        <span className="animate-spin inline-block w-2.5 h-2.5 border border-current border-t-transparent rounded-full" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      <span>{story.ai_analysis ? 'Refazer Análise' : 'Analisar com IA'}</span>
                    </button>
                  </div>

                  {story.ai_analysis ? (
                    <div className="p-4 bg-purple-bg/25 border border-purple-custom/10 rounded-lg space-y-3.5 animate-[fadeUp_0.15s_ease_both] text-xs">
                      <div>
                        <strong className="text-purple-t font-semibold block mb-0.5">Resumo Estratégico</strong>
                        <p className="text-text-custom leading-relaxed">{story.ai_analysis.resumo}</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <strong className="text-purple-t font-semibold block mb-1">Ângulos de Venda</strong>
                          <ul className="list-disc pl-4 space-y-0.5 text-text2 leading-tight">
                            {story.ai_analysis.angulos.map((a, i) => (
                              <li key={i}>{a}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <strong className="text-purple-t font-semibold block mb-1">Formatos Indicados</strong>
                          <ul className="list-disc pl-4 space-y-0.5 text-text2 leading-tight">
                            {story.ai_analysis.formatos.map((f, i) => (
                              <li key={i}>{f}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <strong className="text-purple-t font-semibold block mb-1">Gatilhos Ativados</strong>
                          <ul className="list-disc pl-4 space-y-0.5 text-text2 leading-tight">
                            {story.ai_analysis.gatilhos.map((g, i) => (
                              <li key={i}>{g}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10px] text-text3 italic">Nenhuma análise rodada ainda.</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ==========================================
          TAB: ADD STORY
          ========================================== */}
      {activeSubTab === 'add' && (
        <form
          onSubmit={handleCreate}
          className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4 text-xs animate-[fadeUp_0.15s_ease_both]"
        >
          <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2">
            Cadastrar Novo Ativo de Storytelling
          </h4>

          <div className="grid grid-cols-3 gap-1 rounded border border-border-custom bg-surface2 p-1">
            {([
              { id: 'text', label: 'Texto', icon: BookOpenCheck },
              { id: 'record', label: 'Gravar áudio', icon: Mic },
              { id: 'upload', label: 'Enviar áudio', icon: Upload },
            ] as const).map((mode) => {
              const Icon = mode.icon
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setStoryInputMode(mode.id)}
                  disabled={isRecording || isTranscribing}
                  className={`flex min-h-9 items-center justify-center gap-1.5 rounded px-2 text-[10px] font-semibold transition-colors disabled:opacity-50 ${
                    storyInputMode === mode.id
                      ? 'bg-surface text-text-custom shadow-sm'
                      : 'text-text2 hover:text-text-custom'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{mode.label}</span>
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="text-[10px] font-bold text-text2 mb-1 block">Título do Acontecimento</label>
              <input
                className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: O dia que faturei R$ 10k em 24 horas"
                required
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-text2 mb-1 block">Categoria da História</label>
              <select
                className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] font-bold text-text2 mb-1 block">Emoção Predominante</label>
              <select
                className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={emotion}
                onChange={(e) => setEmotion(e.target.value)}
              >
                {EMOTIONS.map((emo) => (
                  <option key={emo} value={emo}>
                    {emo}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-text2 mb-1 block">Contexto de Época</label>
              <input
                className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Ex: Desempregado em 2023"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-text2 mb-1 block">Ponto de Virada / Resultado</label>
              <input
                className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                value={result}
                onChange={(e) => setResult(e.target.value)}
                placeholder="Ex: R$ 10k faturados e saída do CLT"
              />
            </div>
          </div>

          {storyInputMode === 'record' && (
            <div className="flex min-h-24 flex-col items-center justify-center gap-3 rounded border border-dashed border-border2 bg-surface2 p-4">
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isTranscribing}
                title={isRecording ? 'Parar gravação' : 'Iniciar gravação'}
                className={`flex h-11 w-11 items-center justify-center rounded-full text-white transition-colors disabled:opacity-50 ${
                  isRecording ? 'bg-red-t' : 'bg-blue-t'
                }`}
              >
                {isRecording ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
              </button>
              <span className="text-[10px] font-semibold text-text2">
                {isRecording
                  ? `Gravando ${String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:${String(recordingSeconds % 60).padStart(2, '0')}`
                  : 'Clique para começar a gravar'}
              </span>
            </div>
          )}

          {storyInputMode === 'upload' && (
            <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded border border-dashed border-border2 bg-surface2 p-4 text-text2 hover:border-text3">
              <Upload className="h-5 w-5" />
              <span className="text-[10px] font-semibold">Selecionar arquivo de áudio</span>
              <span className="text-[9px] text-text3">MP3, M4A, WAV, OGG ou WEBM • até 25 MB</span>
              <input
                type="file"
                accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/m4a,audio/ogg,audio/wav,audio/x-wav,audio/webm"
                className="sr-only"
                disabled={isTranscribing}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void transcribeAudio(file)
                  event.target.value = ''
                }}
              />
            </label>
          )}

          {audioFile && audioPreviewUrl && (
            <div className="flex items-center gap-3 rounded border border-border-custom bg-surface2 px-3 py-2">
              <FileAudio className="h-4 w-4 shrink-0 text-blue-t" />
              <audio controls preload="metadata" src={audioPreviewUrl} className="h-8 min-w-0 flex-1" />
              <button
                type="button"
                onClick={clearSelectedAudio}
                disabled={isRecording || isTranscribing}
                title="Remover áudio"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border2 text-text2 hover:text-red-t disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {isTranscribing && (
            <div className="flex items-center gap-2 text-[10px] font-medium text-blue-t">
              <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
              <span>{transcriptionStage}</span>
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold text-text2 mb-1.5 block">
              {storyInputMode === 'text' ? 'História Completa' : 'Transcrição da História'}
            </label>
            <textarea
              className="w-full p-3 border border-border2 rounded bg-surface text-text-custom outline-none h-40 scrollbar-thin"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={storyInputMode === 'text'
                ? 'Escreva a história com o máximo de detalhes possível. Descreva as sensações, dores e a virada.'
                : 'A transcrição aparecerá aqui para você revisar antes de salvar.'}
              required
            />
          </div>

          <div className="flex items-center justify-between mt-6 pt-3 border-t border-border-custom">
            <label className="flex items-center gap-2 cursor-pointer text-text2 font-semibold select-none">
              <input
                type="checkbox"
                checked={used}
                onChange={(e) => setUsed(e.target.checked)}
                className="rounded border-border2 text-text-custom focus:ring-0"
              />
              <span>Marcar como &quot;Já Usada&quot; em criativos</span>
            </label>

            <button
              type="submit"
              disabled={createStoryMutation.isPending || isRecording || isTranscribing}
              className="px-5 py-2 bg-text-custom text-surface hover:opacity-90 rounded font-semibold cursor-pointer disabled:opacity-50 transition-opacity"
            >
              Salvar História
            </button>
          </div>
        </form>
      )}

      {/* ==========================================
          TAB: AI CROSS-QUERY SCRIPTS WRITER
          ========================================== */}
      {activeSubTab === 'consulta' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-[fadeUp_0.15s_ease_both]">
          {/* Controls Column */}
          <div className="md:col-span-1 bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-4 text-xs">
            <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2">
              Configurar Geração de Roteiro
            </h4>

            {activeProjectId && (
              <ProjectAiSettings projectId={activeProjectId} showToast={showToast} />
            )}

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-text2 mb-1 block">Objetivo / Intenção</label>
                <select
                  className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                  value={iaInt}
                  onChange={(e) => setIaInt(+e.target.value)}
                >
                  <option value={0}>Roteiro de VSL</option>
                  <option value={1}>Roteiro de YouTube</option>
                  <option value={2}>Roteiro de Reels</option>
                  <option value={3}>Sequência de E-mails</option>
                  <option value={4}>Análise de Gaps do Banco</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-text2 mb-1 block">
                  Contexto / Instrução Extra (Opcional)
                </label>
                <textarea
                  className="w-full px-2.5 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none h-24"
                  value={iaCtx}
                  onChange={(e) => setIaCtx(e.target.value)}
                  placeholder="Ex: Focar no avatar que é pai de família e tem pouco tempo livre..."
                />
              </div>

              <button
                onClick={handleAIGlobalConsult}
                disabled={iaGlobalLoading}
                className="w-full py-2 bg-text-custom text-surface hover:opacity-90 rounded font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-opacity disabled:opacity-50"
              >
                {iaGlobalLoading ? (
                  <span className="animate-spin inline-block w-3.5 h-3.5 border border-current border-t-transparent rounded-full" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>Estruturar com IA</span>
              </button>
            </div>
          </div>

          {/* Results Column */}
          <div className="md:col-span-2 space-y-4">
            <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm min-h-[300px] flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold text-text-custom border-b border-border-custom pb-2 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-purple-custom" />
                  <span>Roteiro / Sugestão Gerada</span>
                </h4>

                {iaGlobalResult ? (
                  <div className="mt-4 p-4 bg-purple-bg/25 border border-purple-custom/10 rounded-lg animate-[fadeUp_0.15s_ease_both]">
                    <pre className="text-xs text-text-custom whitespace-pre-wrap leading-relaxed font-sans">
                      {iaGlobalResult}
                    </pre>
                  </div>
                ) : iaGlobalLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <div className="animate-pulse w-2.5 h-2.5 bg-purple-custom rounded-full" />
                    <span className="text-[11px] text-text3 font-medium animate-pulse">
                      IA cruzando histórias e estruturando sua copy...
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-text3 text-center py-20">
                    Ajuste os parâmetros na coluna ao lado e clique em &quot;Estruturar com IA&quot; para gerar.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
