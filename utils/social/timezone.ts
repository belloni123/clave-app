const SAO_PAULO_TIMEZONE = 'America/Sao_Paulo'

interface DateParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

function partsInZone(date: Date, timezone: string): DateParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value)
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
  }
}

export function saoPauloLocalToUtc(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) throw new Error('Data e horário inválidos.')
  const desired: DateParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  }
  const utcGuess = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
  )
  let candidate = utcGuess
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const actual = partsInZone(new Date(candidate), SAO_PAULO_TIMEZONE)
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute)
    candidate += utcGuess - actualAsUtc
  }
  const roundTrip = partsInZone(new Date(candidate), SAO_PAULO_TIMEZONE)
  if (Object.keys(desired).some((key) => desired[key as keyof DateParts] !== roundTrip[key as keyof DateParts])) {
    throw new Error('Este horário não existe no fuso de São Paulo.')
  }
  return new Date(candidate).toISOString()
}

export function toSaoPauloInput(value: string | null) {
  if (!value) return ''
  const parts = partsInZone(new Date(value), SAO_PAULO_TIMEZONE)
  const pad = (number: number) => String(number).padStart(2, '0')
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`
}

export function formatSaoPauloDate(value: string | null) {
  if (!value) return 'Sem data definida'
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: SAO_PAULO_TIMEZONE,
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(value))
}
