'use client'

import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/utils/supabase/client'
import { useAppStore } from '@/store/useAppStore'
import { ChevronLeft, ChevronRight, Calendar, X, Trash2 } from 'lucide-react'

type EventType = 'Lançamento' | 'Conteúdo' | 'Anúncio' | 'Reunião' | 'Outro'

interface CalendarEvent {
  id: string
  project_id: string
  title: string
  date: string
  type: EventType
  gcal_event_id?: string | null
  attendees?: string[]
}

interface SaveEventPayload {
  id?: string
  title: string
  type: EventType
  date: string
  attendees?: string[]
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

  // Google Calendar Sync State & Query
  const { data: syncData, refetch: refetchSyncStatus } = useQuery({
    queryKey: ['gcal_sync_status'],
    queryFn: async () => {
      const res = await fetch('/api/calendar/sync-status')
      if (!res.ok) {
        return { isSynced: false }
      }
      return res.json() as Promise<{ isSynced: boolean }>
    }
  })

  const isSynced = !!syncData?.isSynced
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const syncStatus = params.get('gcal_sync')
      const errorMsg = params.get('error_msg')
      if (syncStatus === 'success') {
        showToast('Agenda sincronizada com sucesso!')
        refetchSyncStatus()
        const newUrl = window.location.pathname
        window.history.replaceState({}, '', newUrl)
      } else if (syncStatus === 'error') {
        showToast(errorMsg ? decodeURIComponent(errorMsg) : 'Falha ao conectar com Google Agenda', 'err')
        const newUrl = window.location.pathname
        window.history.replaceState({}, '', newUrl)
      }
    }
  }, [showToast, refetchSyncStatus])

  const handleToggleSync = async () => {
    if (isSynced) {
      setSyncing(true)
      try {
        const res = await fetch('/api/calendar/sync-status', {
          method: 'DELETE'
        })
        if (res.ok) {
          refetchSyncStatus()
          showToast('Desconectado do Google Agenda')
        } else {
          showToast('Erro ao desconectar do Google Agenda', 'err')
        }
      } catch (err) {
        showToast('Erro ao desconectar do Google Agenda', 'err')
      } finally {
        setSyncing(false)
      }
    } else {
      setSyncing(true)
      try {
        const res = await fetch('/api/auth/google/url')
        if (res.ok) {
          const { url } = await res.json()
          if (url) {
            window.location.href = url
          } else {
            showToast('Erro ao obter link de autorização', 'err')
            setSyncing(false)
          }
        } else {
          showToast('Erro ao obter link de autorização', 'err')
          setSyncing(false)
        }
      } catch (err) {
        showToast('Erro ao iniciar integração', 'err')
        setSyncing(false)
      }
    }
  }

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
  
  // Attendees state
  const [attendees, setAttendees] = useState<string[]>([])
  const [emailInput, setEmailInput] = useState('')

  // 1. QUERY CALENDAR EVENTS
  const { data: dbEvents } = useQuery({
    queryKey: ['calendar_events', activeProjectId, currentMonth, currentYear],
    queryFn: async () => {
      if (!activeProjectId) return []
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

  const editingEvent = dbEvents?.find((e) => e.id === editEventId)

  // 2. MUTATIONS
  const saveEventMutation = useMutation({
    mutationFn: async (payload: SaveEventPayload) => {
      if (!activeProjectId) return

      const isEdit = !!payload.id
      const method = isEdit ? 'PUT' : 'POST'

      const response = await fetch('/api/calendar/events', {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: payload.id,
          project_id: activeProjectId,
          title: payload.title,
          type: payload.type,
          date: payload.date,
          attendees: payload.attendees || []
        })
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Erro ao salvar evento')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar_events', activeProjectId] })
      showToast(editEventId ? 'Evento atualizado' : 'Evento criado')
      closeModal()
    },
    onError: (err: any) => {
      showToast(err.message || 'Erro ao salvar evento', 'err')
    },
  })

  const deleteEventMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch('/api/calendar/events', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id })
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Erro ao excluir evento')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar_events', activeProjectId] })
      showToast('Evento excluído')
      closeModal()
    },
    onError: (err: any) => {
      showToast(err.message || 'Erro ao excluir evento', 'err')
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
    setAttendees([])
    setEmailInput('')
    setModalOpen(true)
  }

  const openEditModal = (ev: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditEventId(ev.id)
    setEventTitle(ev.title)
    setEventType(ev.type)
    setEventDateStr(ev.date)
    setAttendees(ev.attendees || [])
    setEmailInput('')
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditEventId(null)
    setEventTitle('')
    setAttendees([])
    setEmailInput('')
  }

  const handleSave = () => {
    if (!eventTitle.trim() || !eventDateStr) return
    saveEventMutation.mutate({
      id: editEventId || undefined,
      title: eventTitle.trim(),
      type: eventType,
      date: eventDateStr,
      attendees
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
    return [...(dbEvents || []).filter((e) => e.date === dateStr)]
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
        <div className="flex items-center gap-4 flex-wrap">
          <h4 className="text-xs font-bold text-text-custom flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-text3" />
            <span>Planejador Editorial Anual</span>
          </h4>

          {/* Google Agenda Connection simulation */}
          <div>
            {syncing ? (
              <div className="flex items-center gap-1 text-[10px] text-text3 animate-pulse bg-surface2 px-2 py-0.5 rounded border border-border2">
                <svg className="animate-spin h-3 w-3 text-text-custom" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Conectando...</span>
              </div>
            ) : isSynced ? (
              <div className="flex items-center gap-1.5 bg-green-bg/20 border border-green-t/20 px-2 py-0.5 rounded">
                <span className="flex h-1.5 w-1.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-custom opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-custom"></span>
                </span>
                <span className="text-[9px] font-bold text-green-t uppercase tracking-wider">Sincronizado</span>
                <button
                  onClick={handleToggleSync}
                  className="text-[9px] text-red-t hover:underline font-medium cursor-pointer ml-1"
                >
                  Desconectar
                </button>
              </div>
            ) : (
              <button
                onClick={handleToggleSync}
                className="flex items-center gap-1 bg-surface2 border border-border2 hover:border-text-custom hover:bg-surface px-2 py-0.5 rounded text-[10px] text-text2 hover:text-text-custom font-semibold transition-all cursor-pointer"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21.35 11.1h-9.17v2.73h6.51c-.3 1.56-1.56 2.95-3.24 3.5v2.9h5.15c3.01-2.78 4.75-6.87 4.75-11.63 0-.5-.04-1-.15-1.5z" fill="#4285F4"/>
                  <path d="M12.18 21.4c2.75 0 5.06-.91 6.75-2.46l-5.15-2.9c-.83.56-1.92.89-3.23.89-2.5 0-4.6-1.69-5.35-3.97H.01v2.98C1.72 17.51 6.55 21.4 12.18 21.4z" fill="#34A853"/>
                  <path d="M6.83 13.06a5.9 5.9 0 0 1 0-3.75V6.33H1.2a11.94 11.94 0 0 0 0 10.48l5.63-3.75z" fill="#FBBC05"/>
                  <path d="M12.18 5.07c1.5 0 2.85.51 3.91 1.52l2.93-2.93C17.29 1.96 14.99.93 12.18.93 6.55.93 1.72 4.82.01 9.31l5.63-3.75c.75-2.28 2.85-3.97 5.35-3.97z" fill="#EA4335"/>
                </svg>
                <span>Google Agenda</span>
              </button>
            )}
          </div>
        </div>

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
                      <div className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                      <span className="truncate flex-1">{ev.title}</span>
                      {ev.gcal_event_id && (
                        <Calendar className="w-2.5 h-2.5 text-current opacity-70 shrink-0 ml-auto" />
                      )}
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
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-semibold text-text-custom">
                  {editEventId ? 'Editar Evento' : 'Novo Evento'}
                </p>
                {editingEvent?.gcal_event_id && (
                  <span className="text-[9px] text-green-t font-semibold flex items-center gap-0.5 animate-pulse">
                    ● Sincronizado com Google Agenda
                  </span>
                )}
              </div>
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

              {/* Convidados (Google Calendar) */}
              <div>
                <label className="text-[10px] font-bold text-text2 mb-1 block">Convidados (E-mail)</label>
                <div className="flex gap-1.5 mb-2">
                  <input
                    type="email"
                    className="flex-1 px-3 py-1.5 border border-border2 rounded bg-surface text-text-custom outline-none focus:border-text-custom text-[11px]"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const email = emailInput.trim()
                        if (!email) return
                        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                          showToast('E-mail inválido', 'err')
                          return
                        }
                        if (attendees.includes(email)) {
                          showToast('E-mail já adicionado')
                          return
                        }
                        setAttendees([...attendees, email])
                        setEmailInput('')
                      }
                    }}
                    placeholder="Adicionar e-mail do convidado"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const email = emailInput.trim()
                      if (!email) return
                      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                        showToast('E-mail inválido', 'err')
                        return
                      }
                      if (attendees.includes(email)) {
                        showToast('E-mail já adicionado')
                        return
                      }
                      setAttendees([...attendees, email])
                      setEmailInput('')
                    }}
                    className="px-2.5 py-1.5 bg-surface2 border border-border2 hover:border-text-custom hover:bg-surface text-text-custom rounded font-semibold cursor-pointer transition-colors"
                  >
                    +
                  </button>
                </div>

                {attendees.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-surface2 rounded border border-border-custom scrollbar-thin">
                    {attendees.map((email) => (
                      <div
                        key={email}
                        className="flex items-center gap-1 bg-surface border border-border-custom px-2 py-0.5 rounded text-[10px] text-text-custom"
                      >
                        <span className="truncate max-w-[150px]">{email}</span>
                        <button
                          type="button"
                          onClick={() => setAttendees(attendees.filter((a) => a !== email))}
                          className="text-text3 hover:text-red-t cursor-pointer transition-colors ml-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center gap-2 mt-6 pt-3 border-t border-t-border-custom">
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
