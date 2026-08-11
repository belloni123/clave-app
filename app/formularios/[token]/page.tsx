import type { Metadata } from 'next'
import PublicBriefingForm from '@/components/forms/PublicBriefingForm'

export const metadata: Metadata = {
  title: 'Briefing do Cliente | Clave',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function ProjectBriefingPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <PublicBriefingForm publicToken={token} />
}
