import type { Metadata } from 'next'
import OnboardingPage from '@/components/public/OnboardingPage'

export const metadata: Metadata = {
  title: 'Onboarding B16 | Seu projeto começa aqui',
  description: 'Conheça o processo de onboarding e a metodologia que orientam o início dos projetos da Agência B16.',
  robots: { index: false, follow: false },
  referrer: 'strict-origin-when-cross-origin',
}

export default function PublicOnboardingPage() {
  return <OnboardingPage />
}
