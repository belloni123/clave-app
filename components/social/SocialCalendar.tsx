'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { SocialPostPublic } from '@/types/social'

function dateKey(value: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value))
  const part = (type: string) => parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export default function SocialCalendar({
  posts,
  month,
  onMonthChange,
  onOpen,
}: {
  posts: SocialPostPublic[]
  month: Date
  onMonthChange: (date: Date) => void
  onOpen: (postId: string) => void
}) {
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const firstWeekday = new Date(year, monthIndex, 1).getDay()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstWeekday + 1
    return day >= 1 && day <= daysInMonth ? day : null
  })
  const postsByDay = new Map<number, SocialPostPublic[]>()
  posts.forEach((post) => {
    const value = post.scheduledAt || post.createdAt
    const key = dateKey(value)
    const [postYear, postMonth, postDay] = key.split('-').map(Number)
    if (postYear === year && postMonth === monthIndex + 1) {
      postsByDay.set(postDay, [...(postsByDay.get(postDay) || []), post])
    }
  })

  return (
    <div className="overflow-hidden rounded-xl border border-border-custom bg-surface">
      <div className="flex items-center justify-between border-b border-border-custom p-4">
        <button type="button" onClick={() => onMonthChange(new Date(year, monthIndex - 1, 1))} className="rounded-lg border border-border2 p-2 text-text2 hover:bg-surface2" aria-label="Mês anterior"><ChevronLeft className="h-4 w-4" /></button>
        <h3 className="text-sm font-bold capitalize text-text-custom">{month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h3>
        <button type="button" onClick={() => onMonthChange(new Date(year, monthIndex + 1, 1))} className="rounded-lg border border-border2 p-2 text-text2 hover:bg-surface2" aria-label="Próximo mês"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 border-b border-border-custom bg-surface2/50">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => <div key={day} className="p-2 text-center text-[9px] font-bold uppercase text-text3">{day}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, index) => (
          <div key={index} className="min-h-24 border-b border-r border-border-custom p-1.5 last:border-r-0 sm:min-h-32">
            {day && <>
              <span className="text-[10px] font-bold text-text3">{day}</span>
              <div className="mt-1 space-y-1">
                {(postsByDay.get(day) || []).slice(0, 3).map((post) => (
                  <button key={post.id} type="button" onClick={() => onOpen(post.id)} className="block w-full truncate rounded bg-purple-bg px-1.5 py-1 text-left text-[8px] font-semibold text-purple-t hover:brightness-95">
                    {post.internalTitle || post.baseCaption || 'Sem título'}
                  </button>
                ))}
                {(postsByDay.get(day)?.length || 0) > 3 && <span className="text-[8px] text-text3">+{(postsByDay.get(day)?.length || 0) - 3}</span>}
              </div>
            </>}
          </div>
        ))}
      </div>
    </div>
  )
}
