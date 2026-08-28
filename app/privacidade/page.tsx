import Link from 'next/link'
import Image from 'next/image'

export const metadata = {
  title: 'Política de Privacidade — Clave',
  description: 'Como o Clave trata os dados usados na integração com o Instagram.',
}

const sections = [
  {
    title: 'Dados tratados',
    body: 'Quando uma conta profissional do Instagram é conectada, o Clave recebe o identificador e os dados públicos do perfil, além de métricas agregadas da conta e dos conteúdos, como seguidores, alcance, visualizações e interações. O Clave não solicita a senha do Instagram, não lê mensagens privadas e não publica conteúdo.',
  },
  {
    title: 'Finalidade',
    body: 'Os dados são usados exclusivamente para montar o painel estratégico do projeto autorizado, acompanhar evolução de audiência e analisar o desempenho dos conteúdos.',
  },
  {
    title: 'Acesso e segurança',
    body: 'O acesso é limitado aos usuários autorizados no projeto. Tokens de acesso são armazenados de forma protegida no cofre de segredos do servidor e nunca são enviados ao navegador. A conexão é realizada pelo fluxo oficial de autorização da Meta.',
  },
  {
    title: 'Retenção e exclusão',
    body: 'Os dados permanecem enquanto a conexão estiver ativa para formar o histórico estratégico do projeto. Ao desconectar a conta, revogar o acesso na Meta ou solicitar a exclusão, o Clave remove a conexão, o token e as métricas relacionadas.',
  },
  {
    title: 'Compartilhamento',
    body: 'O Clave não vende dados do Instagram. O tratamento utiliza apenas os provedores técnicos necessários à operação segura da plataforma e está sujeito às regras aplicáveis da Meta.',
  },
]

export default function PrivacyPage() {
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

        <p className="text-xs font-bold uppercase tracking-[0.16em] text-green-custom">
          Agência B16
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Política de Privacidade</h1>
        <p className="mt-4 text-sm text-text3">Última atualização: 28 de agosto de 2026</p>

        <p className="mt-8 text-base leading-7 text-text2">
          Esta política explica como o Clave trata informações quando uma conta profissional do Instagram é conectada a um projeto.
        </p>

        <div className="mt-10 space-y-9">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <p className="mt-2 text-sm leading-7 text-text2">{section.body}</p>
            </section>
          ))}

          <section>
            <h2 className="text-lg font-semibold">Contato e direitos</h2>
            <p className="mt-2 text-sm leading-7 text-text2">
              Para solicitar acesso, correção ou exclusão dos dados, envie uma mensagem para{' '}
              <a href="mailto:ads@agenciab16.com.br" className="font-semibold text-green-custom hover:underline">
                ads@agenciab16.com.br
              </a>.
            </p>
          </section>
        </div>
      </article>
    </main>
  )
}
