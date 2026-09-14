'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowUp, BookOpen, ChevronRight, Loader2, MessageCircle, RotateCcw, Sparkles, X } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import type { AppModuleKey } from '@/utils/module-access'

type Reply = {
  answer: string; notice?: string; mode: 'ai' | 'guide'
  sources: Array<{ id: string; title: string; module: AppModuleKey; canOpen: boolean }>
  links: Array<{ label: string; path: string }>
}
type Message = { role: 'user' | 'assistant'; content: string; reply?: Reply }
const suggestions = ['Onde calculo a precificação de serviço?', 'Como cadastro uma história?', 'Onde está o link do formulário do cliente?']

export default function HelpAssistant() {
  const projectId = useAppStore((s) => s.activeProjectId)
  const userId = useAppStore((s) => s.profile?.id)
  // Remount prevents history or pending responses crossing a project/user boundary.
  return projectId && userId ? <ProjectHelp key={`${userId}:${projectId}`} projectId={projectId} /> : null
}

function ProjectHelp({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const projectName = useAppStore((s) => s.projects.find((p) => p.id === projectId)?.name)
  const allowed = useAppStore((s) => s.allowedModules)
  const activeModule = useAppStore((s) => s.activeModule)
  const navigate = useAppStore((s) => s.setActiveModule)
  useEffect(() => () => { controller.current?.abort(); controller.current = null }, [])
  useEffect(() => { if (open) input.current?.focus() }, [open])
  useEffect(() => { if (open) end.current?.scrollIntoView({ block: 'nearest' }) }, [messages, busy, open])
  function close() { setOpen(false); trigger.current?.focus() }
  function reset() {
    controller.current?.abort(); controller.current = null
    setMessages([]); setError(''); setBusy(false); setQuestion(''); input.current?.focus()
  }
  async function send(value: string) {
    const text = value.trim()
    if (!text || controller.current || text.length > 2_000) return
    const pending = new AbortController()
    controller.current = pending
    const previous = messages
    setMessages([...previous, { role: 'user', content: text }])
    setQuestion(''); setBusy(true); setError('')
    const timeout = window.setTimeout(() => pending.abort(), 110_000)
    try {
      const response = await fetch('/api/help', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: pending.signal,
        body: JSON.stringify({ projectId, question: text, currentModule: activeModule, history: previous.slice(-6).map(({ role, content }) => ({ role, content: content.slice(0, 3_000) })) }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não consegui responder agora.')
      if (controller.current !== pending) return
      setMessages([...previous, { role: 'user', content: text }, { role: 'assistant', content: data.answer, reply: data as Reply }])
    } catch (failure) {
      if (controller.current !== pending) return
      setMessages(previous); setQuestion(text)
      setError(failure instanceof Error && failure.name !== 'AbortError' ? failure.message : 'A resposta demorou demais. Sua pergunta está aqui para tentar novamente.')
    } finally {
      window.clearTimeout(timeout)
      if (controller.current === pending) { controller.current = null; setBusy(false) }
    }
  }
  return <div className="fixed bottom-4 right-4 z-[60] print:hidden sm:bottom-6 sm:right-6">
    {open && <section id="clave-help" role="dialog" aria-label="Assistente de ajuda do Clave" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }} className="absolute bottom-16 right-0 flex h-[min(650px,calc(100dvh-110px))] w-[min(410px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-border-custom bg-surface text-text-custom shadow-2xl">
      <header className="flex items-center gap-3 border-b border-border-custom bg-purple-custom/10 p-4">
        <div className="rounded-xl bg-purple-custom p-2.5 text-white"><Sparkles size={20} /></div>
        <div className="min-w-0 flex-1"><h2 className="text-sm font-bold">Ajuda do Clave</h2><p className="truncate text-xs text-text2">Assistente de IA · {projectName || 'Projeto ativo'}</p></div>
        <button type="button" onClick={reset} aria-label="Nova conversa" title="Nova conversa" className="rounded-lg p-2 hover:bg-surface2"><RotateCcw size={16} /></button>
        <button type="button" onClick={close} aria-label="Fechar ajuda" className="rounded-lg p-2 hover:bg-surface2"><X size={19} /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        <div className="mb-4 text-sm leading-relaxed"><p className="font-semibold">Oi! Vamos descomplicar? 👋</p><p className="mt-1 text-text2">Sou a IA de ajuda do Clave. Pergunte onde encontrar uma função ou como usar uma ferramenta.</p></div>
        {!messages.length && <div className="mb-4 space-y-2">{suggestions.map((s) => <button type="button" key={s} onClick={() => void send(s)} disabled={busy} className="flex w-full items-center justify-between gap-2 rounded-xl border border-border-custom p-3 text-left text-xs hover:bg-surface2 disabled:opacity-50">{s}<ChevronRight size={15} className="shrink-0 text-purple-t" /></button>)}</div>}
        <div role="log" aria-label="Conversa com a ajuda" aria-live="polite" aria-relevant="additions" className="space-y-4">
          {messages.map((message, index) => <div key={index} className={message.role === 'user' ? 'ml-6 rounded-2xl rounded-br-sm bg-purple-custom px-4 py-3 text-white' : 'mr-1 rounded-2xl rounded-bl-sm border border-border-custom bg-surface2 p-4'}>
            <p className="mb-1 text-[10px] font-bold uppercase opacity-70">{message.role === 'user' ? 'Você' : message.reply?.mode === 'guide' ? 'Guia do Clave · sem IA' : 'IA do Clave'}</p>
            {message.reply?.notice && <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs leading-relaxed">{message.reply.notice}</p>}
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p>
            {!!message.reply?.sources.length && <div className="mt-3 space-y-2 border-t border-border-custom pt-3"><p className="flex items-center gap-1 text-[10px] font-semibold text-text2"><BookOpen size={12} /> Guias consultados</p>{message.reply.sources.map((source) => <button key={source.id} type="button" disabled={!source.canOpen || !allowed.includes(source.module)} onClick={() => { if (allowed.includes(source.module)) { navigate(source.module); close() } }} className="block w-full rounded-lg border border-border-custom px-2 py-2 text-left text-xs hover:bg-surface disabled:opacity-60">{source.title} {source.canOpen && allowed.includes(source.module) ? '→' : '· solicite acesso'}</button>)}</div>}
            {message.reply?.links.map((link) => /^\/formularios\/[0-9a-f-]{36}$/i.test(link.path) ? <a key={link.path} href={link.path} target="_blank" rel="noreferrer" className="mt-3 block rounded-lg border border-purple-custom/40 p-2 text-xs text-purple-t underline">Abrir formulário verificado: {link.label} ↗</a> : null)}
          </div>)}
        </div>
        {busy && <p role="status" className="mt-4 flex items-center gap-2 text-xs text-text2"><Loader2 size={14} className="animate-spin" /> Conferindo a ajuda do Clave…</p>}
        {error && <p role="alert" className="mt-3 text-sm text-red-500">{error}</p>}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void send(question) }} className="border-t border-border-custom p-3">
        <div className="flex items-end gap-2 rounded-xl border border-border-custom bg-surface2 p-2">
          <textarea ref={input} aria-label="Sua dúvida sobre o Clave" placeholder="Como posso te ajudar?" value={question} maxLength={2_000} rows={2} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(question) } }} className="min-w-0 flex-1 resize-none bg-transparent p-1 text-sm outline-none" />
          <button type="submit" aria-label="Enviar pergunta" disabled={busy || !question.trim()} className="rounded-xl bg-purple-custom p-2 text-white disabled:opacity-40"><ArrowUp size={20} /></button>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-text3">A IA pode errar. Usa a ajuda e dados permitidos do projeto. Não envie senhas. A conversa não é salva no Clave.</p>
      </form>
    </section>}
    <button ref={trigger} type="button" aria-expanded={open} aria-controls="clave-help" onClick={() => open ? close() : setOpen(true)} className="flex h-12 items-center gap-2 rounded-full bg-purple-custom px-4 text-sm font-semibold text-white shadow-lg hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-purple-custom"><MessageCircle size={21} /><span>{open ? 'Fechar ajuda' : 'Posso te ajudar?'}</span></button>
  </div>
}
