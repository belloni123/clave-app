'use client'

import { useAppStore } from '@/store/useAppStore'

export default function Toast() {
  const { toast, clearToast } = useAppStore()

  if (!toast.message) return null

  const isError = toast.type === 'err'

  return (
    <div
      onClick={clearToast}
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-lg text-xs font-medium shadow-lg cursor-pointer transition-all duration-200 z-50 animate-[fadeUp_0.25s_ease_both] ${
        isError
          ? 'bg-red-bg text-red-t border border-red-t/20'
          : 'bg-green-bg text-green-t border border-green-t/20'
      }`}
    >
      {toast.message}
    </div>
  )
}
