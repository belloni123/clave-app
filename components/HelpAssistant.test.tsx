// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useAppStore } from '@/store/useAppStore'
import HelpAssistant from './HelpAssistant'

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  useAppStore.setState({ profile: { id: 'user-a', role: 'admin', plan: 'test', max_projects: 2 }, activeProjectId: 'project-a', projects: [], activeModule: 'home', allowedModules: ['home', 'financeiro'] })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe('HelpAssistant', () => {
  it('abre com foco, fecha com Escape e restaura foco', () => {
    render(<HelpAssistant />)
    fireEvent.click(screen.getByRole('button', { name: 'Posso te ajudar?' }))
    expect(document.activeElement).toBe(screen.getByRole('textbox'))
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Posso te ajudar?' }))
  })
  it('exibe resposta e abre somente um módulo permitido', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ answer: 'Vá a Financeiro.', mode: 'ai', sources: [{ id: 'servicos', title: 'Precificação de Serviços', module: 'financeiro', canOpen: true }], links: [] }) })
    vi.stubGlobal('fetch', fetcher)
    render(<HelpAssistant />)
    fireEvent.click(screen.getByRole('button', { name: 'Posso te ajudar?' }))
    fireEvent.click(screen.getByRole('button', { name: 'Onde calculo a precificação de serviço?' }))
    await screen.findByText('Vá a Financeiro.')
    fireEvent.click(screen.getByRole('button', { name: /Precificação de Serviços/ }))
    expect(useAppStore.getState().activeModule).toBe('financeiro')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('cancela requisição e apaga a conversa ao trocar de projeto', async () => {
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_url, init) => { signal = init.signal; return new Promise(() => {}) }))
    render(<HelpAssistant />)
    fireEvent.click(screen.getByRole('button', { name: 'Posso te ajudar?' }))
    fireEvent.click(screen.getByRole('button', { name: 'Como cadastro uma história?' }))
    act(() => useAppStore.setState({ activeProjectId: 'project-b' }))
    expect(signal?.aborted).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Posso te ajudar?' }))
    expect(screen.queryByText('Você')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('preserva a pergunta quando o servidor falha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Tente novamente.' }) }))
    render(<HelpAssistant />)
    fireEvent.click(screen.getByRole('button', { name: 'Posso te ajudar?' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Minha dúvida' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pergunta' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Tente novamente.'))
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Minha dúvida')
  })
})
