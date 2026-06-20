import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getGoogleAccessToken } from '@/utils/google-calendar'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { project_id, title, date, type, attendees = [] } = await request.json()
    if (!project_id || !title || !date || !type) {
      return NextResponse.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 })
    }

    let gcalEventId = null

    // Verificar se o usuário possui integração ativa com Google Calendar
    const googleAccessToken = await getGoogleAccessToken(user.id)
    if (googleAccessToken) {
      try {
        const googleEventBody = {
          summary: `[Clave] ${title}`,
          description: `Evento estratégico criado no Clave App. Módulo: ${type}`,
          start: { date },
          end: { date },
          attendees: attendees.map((email: string) => ({ email: email.trim() })),
        }

        const gcalResponse = await fetch(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${googleAccessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(googleEventBody),
          }
        )

        const gcalData = await gcalResponse.json()
        if (gcalResponse.ok && gcalData.id) {
          gcalEventId = gcalData.id
          console.log(`Evento criado no Google Calendar com ID: ${gcalEventId}`)
        } else {
          console.error(
            'Falha ao criar no Google Calendar, procedendo apenas localmente:',
            gcalData
          )
        }
      } catch (gcalErr) {
        console.error(
          'Erro na requisição Google Calendar, procedendo apenas localmente:',
          gcalErr
        )
      }
    }

    // Salvar no Supabase
    const { data: event, error: dbError } = await supabase
      .from('calendar_events')
      .insert({
        project_id,
        title,
        date,
        type,
        gcal_event_id: gcalEventId,
        attendees,
      })
      .select()
      .single()

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    return NextResponse.json(event)
  } catch (err) {
    console.error('Erro no POST /api/calendar/events:', err)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id, title, date, type, attendees = [] } = await request.json()
    if (!id || !title || !date || !type) {
      return NextResponse.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 })
    }

    // Buscar o gcal_event_id atual do evento
    const { data: existingEvent, error: fetchError } = await supabase
      .from('calendar_events')
      .select('gcal_event_id')
      .eq('id', id)
      .single()

    if (fetchError || !existingEvent) {
      return NextResponse.json({ error: 'Evento não encontrado.' }, { status: 404 })
    }

    let gcalEventId = existingEvent.gcal_event_id

    // Atualizar no Google Calendar se integrado
    const googleAccessToken = await getGoogleAccessToken(user.id)
    if (googleAccessToken) {
      try {
        const googleEventBody = {
          summary: `[Clave] ${title}`,
          description: `Evento estratégico criado no Clave App. Módulo: ${type}`,
          start: { date },
          end: { date },
          attendees: attendees.map((email: string) => ({ email: email.trim() })),
        }

        if (gcalEventId) {
          // PUT para atualizar evento existente
          const gcalResponse = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${gcalEventId}?sendUpdates=all`,
            {
              method: 'PUT',
              headers: {
                Authorization: `Bearer ${googleAccessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(googleEventBody),
            }
          )

          if (!gcalResponse.ok) {
            const errData = await gcalResponse.json()
            console.error('Falha ao atualizar no Google Calendar:', errData)
          }
        } else {
          // Se o evento não estava no Google Calendar, mas agora o usuário sincronizou, criar lá!
          const gcalResponse = await fetch(
            'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${googleAccessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(googleEventBody),
            }
          )
          const gcalData = await gcalResponse.json()
          if (gcalResponse.ok && gcalData.id) {
            gcalEventId = gcalData.id
          }
        }
      } catch (gcalErr) {
        console.error('Erro ao conectar com Google Calendar para atualizar:', gcalErr)
      }
    }

    // Salvar no Supabase
    const { data: updatedEvent, error: dbError } = await supabase
      .from('calendar_events')
      .update({
        title,
        date,
        type,
        gcal_event_id: gcalEventId,
        attendees,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    return NextResponse.json(updatedEvent)
  } catch (err) {
    console.error('Erro no PUT /api/calendar/events:', err)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id } = await request.json()
    if (!id) {
      return NextResponse.json({ error: 'ID do evento ausente.' }, { status: 400 })
    }

    // Buscar o gcal_event_id atual do evento
    const { data: existingEvent, error: fetchError } = await supabase
      .from('calendar_events')
      .select('gcal_event_id')
      .eq('id', id)
      .single()

    if (fetchError || !existingEvent) {
      return NextResponse.json({ error: 'Evento não encontrado.' }, { status: 404 })
    }

    // Deletar no Google Calendar se integrado
    if (existingEvent.gcal_event_id) {
      const googleAccessToken = await getGoogleAccessToken(user.id)
      if (googleAccessToken) {
        try {
          const gcalResponse = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${existingEvent.gcal_event_id}?sendUpdates=all`,
            {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${googleAccessToken}`,
              },
            }
          )

          if (!gcalResponse.ok && gcalResponse.status !== 410 && gcalResponse.status !== 404) {
            const errData = await gcalResponse.json()
            console.error('Falha ao excluir no Google Calendar:', errData)
          }
        } catch (gcalErr) {
          console.error('Erro ao conectar com Google Calendar para excluir:', gcalErr)
        }
      }
    }

    // Soft delete no Supabase
    const { error: dbError } = await supabase
      .from('calendar_events')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Erro no DELETE /api/calendar/events:', err)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
