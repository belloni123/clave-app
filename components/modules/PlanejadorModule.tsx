'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/utils/supabase/client'
import { useAppStore } from '@/store/useAppStore'
import { ChevronLeft, ChevronRight, Plus, Calendar, X, Trash2 } from 'lucide-react'

type EventType = 'Lançamento' | 'Conteúdo' | 'Anúncio' | 'Reunião' | 'Outro'

interface CalendarEvent {
  id: string
  project_id: string
  title: string
  date: string
  type: EventType
}

const EVENT_COLORS: Record<EventType, { text: string; bg: string; dot: string }> = {
  'Lançamento': { text: 'text-green-t', bg: 'bg-green-bg', dot: 'bg-green-custom' },
  'Conteúdo': { text: 'text-blue-t', bg: 'bg-blue-bg', dot: 'bg-blue-custom' },
  'Anúncio': { text: 'text-amber-t', bg: 'bg-amber-bg', dot: 'bg-amber-custom' },
  'Reunião': { text: 'text-purple-t', bg: 'bg-purple-bg', dot: 'bg-purple-custom' },
  'Outro': { text: 'text-gray-t', bg: 'bg-gray-bg', dot: 'bg-[#888780]' },
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

export default function PlanejadorModule() {
  const queryClient = useQueryClient()
  const supabase = createClient()
  const { activeProjectId, showToast } = useAppStore()

  // Calendar dates
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const currentMonth = currentDate.getMonth()
  const currentYear = currentDate.getFullYear()

  // Modal states
  const [modalOpen, setModalOpen] = useState(false)
  const [editEventId, setEditEventId] = useState<string | null>(null)
  const [eventTitle, setEventTitle] = useState('')
  const [eventType, setEventType] = useState<EventType>('Lançamento')
  const [eventDateStr, setEventDateStr] = useState('')

  // 1. QUERY CALENDAR EVENTS
  const { data: dbEvents } = useQuery({
    queryKey: ['calendar_events', activeProjectId, currentMonth, currentYear],
    queryFn: async () => {
      if (!activeProjectId) return []
      // Carregar os eventos do mês ativo (filtros por data no DB ou client side)
      // Para o MVP, carregaremos todos os eventos ativos do projeto e filtramos
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('project_id', activeProjectId)
        .is('deleted_at', null)

      if (error) {
        showToast('Erro ao carregar planejador', 'err')
        return []
      }
      return data as CalendarEvent[]
    },
    enabled: !!activeProjectId,
  })

  // 2. MUTATIONS
  const saveEventMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (!activeProjectId) return
      if (payload.id) {
        const { error } = await supabase
          .from('calendar_events')
          .update({ title: payload.title, type: payload.type, date: payload.date })
          .eq('id', payload.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('calendar_events')
          .insert({
            project_id: activeProjectId,
            title: payload.title,
            type: payload.type,
            date: payload.date
          })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar_events', activeProjectId] })
      showToast(editEventId ? 'Evento atualizado' : 'Evento criado')
      closeModal()
    },
    onError: () => {
      showToast('Erro ao salvar evento', 'err')
    },
  })

  const deleteEventMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('calendar_events')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar_events', activeProjectId] })
      showToast('Evento excluído')
      closeModal()
    },
    onError: () => {
      showToast('Erro ao excluir evento', 'err')
    },
  })

  // Month navigation helpers
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1))
  }

  const openCreateModal = (dateStr: string) => {
    setEditEventId(null)
    setEventTitle('')
    setEventType('Lançamento')
    setEventDateStr(dateStr)
    setModalOpen(true)
  }

  const openEditModal = (ev: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditEventId(ev.id)
    setEventTitle(ev.title)
    setEventType(ev.type)
    setEventDateStr(ev.date)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditEventId(null)
    setEventTitle('')
  }

  const handleSave = () => {
    if (!eventTitle.trim() || !eventDateStr) return
    saveEventMutation.mutate({
      id: editEventId || undefined,
      title: eventTitle.trim(),
      type: eventType,
      date: eventDateStr
    })
  }

  const handleDelete = () => {
    if (!editEventId) return
    if (confirm('Deseja excluir este evento do calendário?')) {
      deleteEventMutation.mutate(editEventId)
    }
  }

  // GENERATE CALENDAR DAYS (Grid 7x6 ou 7x5)
  const getCalendarDays = () => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1)
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0)
    const daysInMonth = lastDayOfMonth.getDate()
    
    // Dia da semana do primeiro dia do mês (0 = Domingo, 6 = Sábado)
    const startOffset = firstDayOfMonth.getDay()
    
    const days: { date: Date; isCurrentMonth: boolean; dateStr: string }[] = []

    // 1. Dias do mês anterior para preenchimento
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate()
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - 1, prevMonthLastDay - i)
      days.push({
        date: d,
        isCurrentMonth: false,
        dateStr: d.toISOString().split('T')[0]
      })
    }

    // 2. Dias do mês atual
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(currentYear, currentMonth, i)
      // Ajustar data local para remover fuso horário
      const offset = d.getTimezoneOffset()
      const localD = new Date(d.getTime() - offset * 60 * 1000)
      days.push({
        date: d,
        isCurrentMonth: true,
        dateStr: localD.toISOString().split('T')[0]
      })
    }

    // 3. Dias do próximo mês para completar grid de 42 pílulas
    const remainingDays = 42 - days.length
    for (let i = 1; i <= remainingDays; i++) {
      const d = new Date(currentYear, currentMonth + 1, i)
      days.push({
        date: d,
        isCurrentMonth: false,
        dateStr: d.toISOString().split('T')[0]
      })
    }

    return days
  }

  const calendarDays = getCalendarDays()

  // Mapear eventos por data local
  const getEventsForDay = (dateStr: string) => {
    return (dbEvents || []).filter((e) => e.date === dateStr)
  }

  const isToday = (d: Date) => {
    const today = new Date()
    return d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
  }

  return (
    <div className="bg-surface border border-border-custom rounded-xl p-5 shadow-sm space-y-5 animate-[fadeUp_0.15s_ease_both]">
      {/* Calendar Header Navigation */}
      <div className="flex justify-between items-center border-b border-border-custom pb-3.5 flex-wrap gap-3">
        <h4 className="text-xs font-bold text-text-custom flex items-center gap-1.5">
          <Calendar className="w-4 h-4 text-text3" />
          <span>Planejador Editorial Anual</span>
        </h4>

        <div className="flex items-center gap-4 text-xs font-semibold">
          <button
            onClick={handlePrevMonth}
            className="p-1 border border-border2 hover:bg-surface2 rounded cursor-pointer transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-text-custom" />
          </button>
          <span className="text-text-custom font-bold min-w-[120px] text-center select-none">
            {MONTH_NAMES[currentMonth]} {currentYear}
          </span>
          <button
            onClick={handleNextMonth}
            className="p-1 border border-border2 hover:bg-surface2 rounded cursor-pointer transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-text-custom" />
          </button>
        </div>
      </div>

      {/* Weekdays indicator headers */}
      <div className="grid grid-cols-7 gap-1 border-b border-border-custom pb-1 text-center font-semibold text-[10px] text-text3 uppercase">
        <div>Dom</div>
        <div>Seg</div>
        <div>Ter</div>
        <div>Qua</div>
        <div>Qui</div>
        <div>Sex</div>
        <div>Sáb</div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1.5">
        {calendarDays.map((day, idx) => {
          const dayEvents = getEventsForDay(day.dateStr)
          const today = isToday(day.date)
          return (
            <div
              key={idx}
              onClick={() => openCreateModal(day.dateStr)}
              className={`min-h-[72px] border rounded-lg p-1.5 cursor-pointer bg-surface select-none hover:border-text-custom flex flex-col justify-between transition-colors ${
                day.isCurrentMonth ? 'border-border-custom' : 'border-border-custom/30 opacity-30'
              } ${today ? 'border-green-custom border-2' : ''}`}
            >
              <span className={`text-[10px] font-bold ${today ? 'text-green-t bg-green-bg rounded-full w-5 h-5 flex items-center justify-center -ml-0.5' : 'text-text3'}`}>
                {day.date.getDate()}
              </span>

              {/* Event markers */}
              <div className="space-y-0.5 mt-1 overflow-hidden max-h-12 scrollbar-none">
                {dayEvents.map((ev) => {
                  const colors = EVENT_COLORS[ev.type] || EVENT_COLORS.Outro
                  return (
                    <div
                      key={ev.id}
                      onClick={(e) => openEditModal(ev, e)}
                      className={`text-[8px] px-1.5 py-0.5 rounded font-semibold truncate leading-tight flex items-center gap-1 ${colors.bg} ${colors.text} hover:opacity-85 border border-transparent hover:border-text-custom/10`}
                      title={ev.title}
                    >
                      <div className={`w-1 h-1 rounded-full ${colors.dot}`} />
                      <span>{ev.title}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal Criar/Editar Evento */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] animate-[fadeUp_0.15s_ease_both]">
          <div className="bg-surface rounded-xl p-5 w-full max-w-[340px] shadow-2xl border border-border2">
            <div className="flex justify-between items-center mb-4 border-b border-border-custom pb-2">
              <p className="text-sm font-semibold text-text-custom">
                {editEventId ? 'Editar Evento' : 'Novo Evento'}
              </p>
              <button
                onClick={closeModal}
                className="text-text3 hover:text-text-custom cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="text-[10px] font-bold text-text2 mb-1 block">Título do Evento</label>
                <input
                  className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  placeholder="Ex: Webinar de Abertura"
                  maxLength={50}
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-text2 mb-1 block">Tipo</label>
                  <select
                    className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value as EventType)}
                  >
                    <option value="Lançamento">Lançamento</option>
                    <option value="Conteúdo">Conteúdo</option>
                    <option value="Anúncio">Anúncio</option>
                    <option value="Reunião">Reunião</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-text2 mb-1 block">Data</label>
                  <input
                    type="date"
                    className="w-full px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none"
                    value={eventDateStr}
                    onChange={(e) => setEventDateStr(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center gap-2 mt-6 pt-3 border-t border-border-custom">
              {editEventId && (
                <button
                  onClick={handleDelete}
                  className="px-3 py-2 border border-red-t/30 text-red-t rounded text-xs hover:bg-red-bg transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir</span>
                </button>
              )}
              <div className="flex gap-2 ml-auto">
                <button
                  onClick={closeModal}
                  className="px-3 py-2 border border-border2 rounded text-xs hover:bg-surface2 text-text2 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={!eventTitle.trim() || !eventDateStr}
                  className="px-4 py-2 bg-text-custom text-white rounded text-xs font-semibold hover:opacity-90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
