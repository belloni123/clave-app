'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { useAppStore } from '@/store/useAppStore'
import { Star, ArrowLeft, Key, Lock, Mail, Eye, EyeOff } from 'lucide-react'

type LoginState = 'login' | 'esqueci' | 'ativar' | 'clave'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const { showToast } = useAppStore()

  const [state, setState] = useState<LoginState>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  // Recovery State
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [recoverySent, setRecoverySent] = useState(false)

  // Activation State
  const [actEmail, setActEmail] = useState('')
  const [actCode, setActCode] = useState('')
  const [actPass1, setActPass1] = useState('')
  const [actPass2, setActPass2] = useState('')
  const [actSuccess, setActSuccess] = useState(false)

  // Redireciona se o usuário já estiver logado
  useEffect(() => {
    async function checkUser() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session) {
        router.push('/')
      }
    }
    checkUser()
  }, [supabase, router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (!email || !password) {
        showToast('Preencha o e-mail e a senha.', 'err')
        return
      }

      setLoading(true)
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      setLoading(false)
      if (error) {
        showToast(error.message || 'Credenciais inválidas', 'err')
      } else {
        showToast('Bem-vindo ao Clave!')
        router.push('/')
      }
    } catch (err: any) {
      setLoading(false)
      showToast(err.message || 'Erro inesperado no login', 'err')
    }
  }

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!recoveryEmail) {
      showToast('Informe o seu e-mail cadastrado.', 'err')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(recoveryEmail, {
      redirectTo: `${window.location.origin}/auth/callback`,
    })

    setLoading(false)
    if (error) {
      showToast(error.message || 'Erro ao enviar e-mail de recuperação', 'err')
    } else {
      setRecoverySent(true)
      showToast('E-mail de recuperação enviado!')
    }
  }

  const handleActivation = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (!actEmail || !actCode || !actPass1 || !actPass2) {
        showToast('Todos os campos são obrigatórios.', 'err')
        return
      }

      if (actPass1 !== actPass2) {
        showToast('As senhas não coincidem.', 'err')
        return
      }

      if (actPass1.length < 8) {
        showToast('A senha precisa ter no mínimo 8 caracteres.', 'err')
        return
      }

      // Mock validation do código de ativação
      if (!actCode.startsWith('CLAVE-')) {
        showToast('Código de ativação inválido. Deve começar com CLAVE-', 'err')
        return
      }

      setLoading(true)
      const { error } = await supabase.auth.signUp({
        email: actEmail,
        password: actPass1,
      })

      setLoading(false)
      if (error) {
        showToast(error.message || 'Erro ao criar conta', 'err')
      } else {
        setActSuccess(true)
        showToast('Conta ativada com sucesso!')
        setTimeout(() => {
          setState('login')
          setEmail(actEmail)
          setPassword(actPass1)
        }, 1500)
      }
    } catch (err: any) {
      setLoading(false)
      showToast(err.message || 'Erro inesperado na ativação', 'err')
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-bg relative px-4 overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(29,158,117,0.06)_0%,transparent_50%),radial-gradient(circle_at_80%_80%,rgba(83,74,183,0.06)_0%,transparent_50%)] pointer-events-none" />

      <div className="w-full max-w-[400px] z-10 animate-[fadeUp_0.4s_ease_both]">
        {/* Logo Section */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-text-custom flex items-center justify-center mb-3 shadow-md">
            <span className="text-white text-xl font-bold select-none">C</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-text-custom">Clave</h1>
          <p className="text-xs text-text2 mt-1">Plataforma de gestão de marketing</p>
        </div>

        {/* Card Form */}
        <div className="bg-surface border border-border-custom rounded-xl p-6 shadow-md">
          {/* STATE: LOGIN */}
          {state === 'login' && (
            <form onSubmit={handleLogin}>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-text2 mb-1.5 block">E-mail</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text3" />
                    <input
                      type="email"
                      className="w-full pl-9 pr-3 py-2 text-xs border border-border2 rounded-md bg-surface text-text-custom outline-none focus:border-text-custom transition-colors"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-text2 mb-1.5 block">Senha</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text3" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="w-full pl-9 pr-9 py-2 text-xs border border-border2 rounded-md bg-surface text-text-custom outline-none focus:border-text-custom transition-colors"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Sua senha"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text3 hover:text-text-custom"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <label className="flex items-center gap-2 cursor-pointer text-text2">
                    <input
                      type="checkbox"
                      className="rounded border-border2 text-text-custom focus:ring-0"
                    />
                    <span>Permanecer logado</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setState('esqueci')}
                    className="text-text2 hover:text-text-custom underline"
                  >
                    Esqueceu a senha?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2 bg-text-custom text-white rounded-md text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-55"
                >
                  {loading ? 'Entrando...' : 'Entrar'}
                </button>
              </div>

              {/* Login Footer links */}
              <div className="flex justify-between border-t border-border-custom mt-6 pt-4 text-xs">
                <button
                  type="button"
                  onClick={() => setState('clave')}
                  className="text-text2 hover:text-text-custom underline text-left"
                >
                  O método Clave
                </button>
                <button
                  type="button"
                  onClick={() => setState('ativar')}
                  className="text-text2 hover:text-text-custom underline text-right font-medium"
                >
                  Ativar minha conta
                </button>
              </div>
            </form>
          )}

          {/* STATE: ESQUECI A SENHA */}
          {state === 'esqueci' && (
            <form onSubmit={handleRecovery} className="space-y-4 animate-[fadeUp_0.2s_ease_both]">
              <div>
                <p className="text-sm font-semibold text-text-custom">Recuperar senha</p>
                <p className="text-[11px] text-text2 mt-0.5">
                  Enviaremos um link de recuperação para seu e-mail
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-text2 mb-1.5 block">E-mail cadastrado</label>
                <input
                  type="email"
                  className="w-full px-3 py-2 text-xs border border-border2 rounded-md bg-surface text-text-custom outline-none focus:border-text-custom transition-colors"
                  value={recoveryEmail}
                  onChange={(e) => setRecoveryEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                />
              </div>

              {recoverySent && (
                <div className="p-3 bg-green-bg text-green-t rounded-md text-xs">
                  Link enviado! Verifique sua caixa de entrada.
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 bg-text-custom text-white rounded-md text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-55"
              >
                {loading ? 'Enviando...' : 'Enviar link'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setState('login')
                  setRecoverySent(false)
                }}
                className="w-full text-center text-xs text-text2 hover:text-text-custom underline mt-2 flex items-center justify-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Voltar para o login</span>
              </button>
            </form>
          )}

          {/* STATE: ATIVAR CONTA */}
          {state === 'ativar' && (
            <form onSubmit={handleActivation} className="space-y-4 animate-[fadeUp_0.2s_ease_both]">
              <div>
                <p className="text-sm font-semibold text-text-custom">Ativar conta</p>
                <p className="text-[11px] text-text2 mt-0.5">
                  Use o código enviado por e-mail ou WhatsApp
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-text2 mb-1 block">E-mail</label>
                  <input
                    type="email"
                    className="w-full px-3 py-1.5 text-xs border border-border2 rounded-md bg-surface text-text-custom outline-none focus:border-text-custom transition-colors"
                    value={actEmail}
                    onChange={(e) => setActEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-text2 mb-1 block">
                    Código de ativação
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-1.5 text-xs border border-border2 rounded-md bg-surface text-text-custom font-mono outline-none focus:border-text-custom transition-colors uppercase"
                    value={actCode}
                    onChange={(e) => setActCode(e.target.value)}
                    placeholder="CLAVE-XXXX-XXXX"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-text2 mb-1 block">Criar senha</label>
                  <input
                    type="password"
                    className="w-full px-3 py-1.5 text-xs border border-border2 rounded-md bg-surface text-text-custom outline-none focus:border-text-custom transition-colors"
                    value={actPass1}
                    onChange={(e) => setActPass1(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-text2 mb-1 block">
                    Confirmar senha
                  </label>
                  <input
                    type="password"
                    className="w-full px-3 py-1.5 text-xs border border-border2 rounded-md bg-surface text-text-custom outline-none focus:border-text-custom transition-colors"
                    value={actPass2}
                    onChange={(e) => setActPass2(e.target.value)}
                    placeholder="Repita a senha"
                    required
                  />
                </div>
              </div>

              {actSuccess && (
                <div className="p-3 bg-green-bg text-green-t rounded-md text-xs">
                  Conta ativada com sucesso! Redirecionando...
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 bg-text-custom text-white rounded-md text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-55"
              >
                {loading ? 'Ativando...' : 'Ativar conta'}
              </button>

              <button
                type="button"
                onClick={() => setState('login')}
                className="w-full text-center text-xs text-text2 hover:text-text-custom underline mt-2 flex items-center justify-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Já tenho conta</span>
              </button>
            </form>
          )}

          {/* STATE: MÉTODOS CLAVE */}
          {state === 'clave' && (
            <div className="space-y-4 animate-[fadeUp_0.2s_ease_both]">
              <div className="flex items-center gap-3 border-b border-border-custom pb-3">
                <div className="w-9 h-9 rounded-lg bg-purple-bg flex items-center justify-center shrink-0">
                  <Star className="w-5 h-5 text-purple-custom" />
                </div>
                <div>
                  <p className="text-xs font-bold text-text-custom">O Método Clave</p>
                  <p className="text-[10px] text-text2">A metodologia por trás do Clave</p>
                </div>
              </div>

              <div className="space-y-3.5 max-h-72 overflow-y-auto pr-1">
                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-purple-bg text-purple-custom font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </div>
                  <p className="text-xs text-text-custom leading-relaxed">
                    <strong>Concepção:</strong> Estruture seu produto com diferenciação real.
                    Furadeira, quadro na parede e Matriz do Perpétuo antes de qualquer outra coisa.
                  </p>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-purple-bg text-purple-custom font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </div>
                  <p className="text-xs text-text-custom leading-relaxed">
                    <strong>Comunicação:</strong> Construa sua identidade, mapeie urgências ocultas
                    e crie o VSL e a página de vendas com método.
                  </p>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-purple-bg text-purple-custom font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </div>
                  <p className="text-xs text-text-custom leading-relaxed">
                    <strong>Lançamentos:</strong> Execute validações, eventos pagos e picos de
                    vendas com checklist completo e debriefing pós-lançamento.
                  </p>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-purple-bg text-purple-custom font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                    4
                  </div>
                  <p className="text-xs text-text-custom leading-relaxed">
                    <strong>Dados:</strong> Acompanhe CPL, CPA, ROAS, lucros e tome decisões com
                    números reais — não com intuição.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setState('ativar')}
                className="w-full py-2 bg-text-custom text-white rounded-md text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                Quero ativar minha conta
              </button>

              <button
                type="button"
                onClick={() => setState('login')}
                className="w-full text-center text-xs text-text2 hover:text-text-custom underline mt-2 flex items-center justify-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Voltar para o login</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
