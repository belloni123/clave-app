import type { Metadata } from 'next'
import ExpertApplicationForm from '@/components/forms/ExpertApplicationForm'

export const metadata: Metadata = {
  title: 'Expert — Agência B16',
  description: 'Candidatura para parceria como expert da Agência B16.',
  robots: { index: false, follow: false },
  referrer: 'strict-origin-when-cross-origin',
}

export default function ExpertApplicationPage() {
  return <ExpertApplicationForm />
}
