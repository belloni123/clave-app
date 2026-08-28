import Link from 'next/link'
import Image from 'next/image'

export const metadata = {
  title: 'Exclusão de dados do Instagram — Clave',
  description: 'Confirmação de exclusão dos dados do Instagram armazenados pelo Clave.',
}

export default function InstagramDataDeletionPage() {
  return (
    <main className="min-h-full bg-bg px-5 py-16 text-text-custom">
      <article className="mx-auto max-w-2xl rounded-2xl border border-border-custom bg-surface p-8 shadow-sm sm:p-12">
        <div className="mb-8 flex items-center gap-3">
          <Image src="/logo_black.svg" alt="Clave" width={100} height={32} className="h-8 w-auto dark:hidden" />
          <Image src="/logo_white.svg" alt="Clave" width={100} height={32} className="hidden h-8 w-auto dark:block" />
        </div>
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-green-custom">
          Solicitação concluída
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Dados do Instagram excluídos</h1>
        <p className="mt-5 text-base leading-7 text-text2">
          A conexão, o token de acesso e as métricas associadas à conta foram removidos do Clave.
          O processo é idempotente: se os dados já haviam sido excluídos, nenhuma cópia adicional foi mantida.
        </p>
        <p className="mt-4 text-sm leading-6 text-text2">
          Para conectar a conta novamente, um gestor do projeto deverá iniciar uma nova autorização no módulo Instagram.
        </p>
        <div className="mt-8 flex flex-wrap gap-4 text-sm font-semibold">
          <Link href="/privacidade" className="text-green-custom hover:underline">
            Política de privacidade
          </Link>
          <Link href="/" className="text-text2 hover:text-text-custom hover:underline">
            Voltar ao Clave
          </Link>
        </div>
      </article>
    </main>
  )
}
