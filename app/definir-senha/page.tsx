'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Lock } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { useAppStore } from '@/store/useAppStore'

export default function DefinirSenhaPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { profile, setProfile, showToast } = useAppStore()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [requiredChange, setRequiredChange] = useState(false)

  useEffect(() => {
    async function checkSession() {
      const requiresChange =
        typeof window !== 'undefined'
        && new URLSearchParams(window.location.search).get('obrigatoria') === '1'
      setRequiredChange(requiresChange)

      const code =
        typeof window === 'undefined'
          ? null
          : new URLSearchParams(window.location.search).get('code')

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          showToast('O convite expirou ou já foi utilizado.', 'err')
          router.replace('/login')
          return
        }
        window.history.replaceState({}, '', '/definir-senha')
      }

      const { data } = await supabase.auth.getUser()
      if (!data.user) {
        router.replace('/login')
        return
      }
      setCheckingSession(false)
    }

    void checkSession()
  }, [router, showToast, supabase])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (password.length < 8) {
      showToast('A senha precisa ter no mínimo 8 caracteres.', 'err')
      return
    }
    if (password !== confirmation) {
      showToast('As senhas não coincidem.', 'err')
      return
    }

    setLoading(true)
    const response = await fetch('/api/auth/complete-password-change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    const data = await response.json() as { error?: string }
    setLoading(false)

    if (!response.ok) {
      showToast(data.error || 'Não foi possível definir a senha.', 'err')
      return
    }

    if (profile) {
      setProfile({ ...profile, must_change_password: false })
    }

    showToast('Senha definida. Bem-vindo ao Clave!')
    router.refresh()
    router.replace('/')
  }

  if (checkingSession) {
    return <div className="min-h-screen bg-bg" />
  }

  return (
    <main className="min-h-screen bg-bg flex items-center justify-center px-4">
      <section className="w-full max-w-[400px]">
        <div className="flex justify-center mb-7">
          <Image
            src="/logo_white.svg"
            alt="Clave"
            width={140}
            height={26}
            className="w-[140px] h-auto dark:block hidden"
            priority
          />
          <Image
            src="/logo_black.svg"
            alt="Clave"
            width={140}
            height={26}
            className="w-[140px] h-auto dark:hidden block"
            priority
          />
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-surface border border-border-custom rounded-lg p-6 shadow-xl"
        >
          <h1 className="text-lg font-bold text-text-custom">
            {requiredChange ? 'Troque sua senha temporária' : 'Defina sua senha'}
          </h1>
          <p className="text-xs text-text2 mt-1 mb-5">
            {requiredChange
              ? 'Por segurança, escolha uma senha pessoal para continuar.'
              : 'Use esta senha para os próximos acessos ao Clave.'}
          </p>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-text2 mb-1.5 block">
                Nova senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text3" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full pl-9 pr-9 py-2 text-xs border border-border2 rounded-md bg-surface text-text-custom outline-none focus:border-text-custom"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text3 hover:text-text-custom"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword
                    ? <EyeOff className="w-4 h-4" />
                    : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-text2 mb-1.5 block">
                Confirmar senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text3" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-border2 rounded-md bg-surface text-text-custom outline-none focus:border-text-custom"
                  autoComplete="new-password"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full py-2 bg-text-custom text-surface rounded-md text-xs font-semibold disabled:opacity-50"
          >
            {loading ? 'Salvando...' : 'Definir senha e entrar'}
          </button>
        </form>
      </section>
    </main>
  )
}
