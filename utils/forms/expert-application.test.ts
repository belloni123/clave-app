import { describe, expect, it } from 'vitest'
import { formatWhatsapp, isValidWhatsapp, whatsappDigits } from './expert-application'

describe('WhatsApp de candidatura', () => {
  it('mantém a máscara brasileira para números locais', () => {
    expect(formatWhatsapp('62993256969')).toBe('(62) 99325-6969')
    expect(isValidWhatsapp('(62) 99325-6969')).toBe(true)
  })

  it('aceita e normaliza números internacionais em E.164', () => {
    expect(formatWhatsapp('+353 87 123 4567')).toBe('+353871234567')
    expect(isValidWhatsapp('+353871234567')).toBe(true)
    expect(formatWhatsapp('55 62 99325-6969')).toBe('+5562993256969')
  })

  it('rejeita números internacionais sem + e valores fora do limite', () => {
    expect(isValidWhatsapp('353871234567')).toBe(false)
    expect(isValidWhatsapp('+0123456789')).toBe(false)
    expect(isValidWhatsapp('+1234567')).toBe(false)
    expect(whatsappDigits('+12345678901234567')).toHaveLength(15)
  })
})
