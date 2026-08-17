'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { reportPublicError } from '@/utils/observability/public-error-reporter'

export default function ApplicationError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    reportPublicError({
      category: 'client_runtime',
      operation: 'render_application',
      message: error.message || 'Falha ao renderizar uma página do Clave.',
      stackTrace: error.stack || null,
      metadata: { digest: error.digest || null },
    })
  }, [error])

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-5 text-text-custom">
      <section className="w-full max-w-md rounded-lg border border-border-custom bg-surface p-7 text-center shadow-lg">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-red-bg text-red-t">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-xl font-bold">Não foi possível abrir esta página</h1>
        <p className="mt-2 text-sm leading-6 text-text2">
          O erro foi registrado para nossa equipe. Tente novamente em alguns instantes.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-text-custom px-4 text-sm font-semibold text-bg transition-opacity hover:opacity-85"
        >
          <RefreshCw className="h-4 w-4" />
          Tentar novamente
        </button>
      </section>
    </main>
  )
}
