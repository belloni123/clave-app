import Image from 'next/image'
import Link from 'next/link'

export const metadata = {
  title: 'Termos de Serviço — Clave',
  description: 'Condições de uso do Clave e da integração com o Instagram.',
}

const sections = [
  {
    title: 'Uso autorizado',
    body: 'O Clave é uma plataforma de gestão estratégica da Agência B16. O acesso é restrito a usuários convidados e aos projetos para os quais cada pessoa recebeu autorização.',
  },
  {
    title: 'Integração com o Instagram',
    body: 'Somente uma conta profissional pode ser conectada a cada projeto. Quem realiza a conexão declara possuir autorização para conceder ao Clave acesso aos dados de perfil, conteúdo e insights daquela conta.',
  },
  {
    title: 'Escopo da integração',
    body: 'A integração é destinada à leitura de métricas para análise estratégica. O Clave não solicita mensagens privadas, não publica conteúdo e não altera a conta do Instagram por meio desta funcionalidade.',
  },
  {
    title: 'Responsabilidades',
    body: 'O usuário deve manter suas credenciais seguras, respeitar as regras da Meta e utilizar os dados somente para finalidades legítimas do projeto. A disponibilidade de métricas pode variar conforme a conta, o conteúdo e as mudanças realizadas pela Meta.',
  },
  {
    title: 'Suspensão e encerramento',
    body: 'O acesso pode ser suspenso em caso de uso indevido, risco de segurança ou violação destes termos. A conta do Instagram pode ser desconectada a qualquer momento, removendo o token e os dados relacionados do Clave.',
  },
]

export default function TermsPage() {
  return (
    <main className="min-h-full bg-bg px-5 py-16 text-text-custom">
      <article className="mx-auto max-w-3xl rounded-2xl border border-border-custom bg-surface p-8 shadow-sm sm:p-12">
        <div className="mb-10 flex items-center justify-between gap-4">
          <div>
            <Image src="/logo_black.svg" alt="Clave" width={100} height={32} className="h-8 w-auto dark:hidden" />
            <Image src="/logo_white.svg" alt="Clave" width={100} height={32} className="hidden h-8 w-auto dark:block" />
          </div>
          <Link href="/" className="text-sm font-semibold text-text2 hover:text-text-custom">
            Voltar
          </Link>
        </div>

        <p className="text-xs font-bold uppercase tracking-[0.16em] text-green-custom">Agência B16</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Termos de Serviço</h1>
        <p className="mt-4 text-sm text-text3">Última atualização: 28 de agosto de 2026</p>

        <div className="mt-10 space-y-9">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <p className="mt-2 text-sm leading-7 text-text2">{section.body}</p>
            </section>
          ))}

          <section>
            <h2 className="text-lg font-semibold">Contato</h2>
            <p className="mt-2 text-sm leading-7 text-text2">
              Dúvidas sobre estes termos podem ser enviadas para{' '}
              <a href="mailto:ads@agenciab16.com.br" className="font-semibold text-green-custom hover:underline">
                ads@agenciab16.com.br
              </a>.
            </p>
          </section>
        </div>

        <div className="mt-10 border-t border-border-custom pt-6 text-sm">
          <Link href="/privacidade" className="font-semibold text-green-custom hover:underline">
            Política de privacidade
          </Link>
        </div>
      </article>
    </main>
  )
}
