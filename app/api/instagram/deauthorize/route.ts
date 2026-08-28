import { NextRequest, NextResponse } from 'next/server'
import {
  deleteInstagramDataByUserId,
  readMetaSignedRequest,
} from '@/utils/instagram/meta-callback'

export async function POST(request: NextRequest) {
  try {
    const { instagramUserId } = await readMetaSignedRequest(request)
    await deleteInstagramDataByUserId(instagramUserId)
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Solicitação inválida.'
    const isConfigurationError = message.includes('não foi configurada')
    return NextResponse.json(
      { error: isConfigurationError ? 'Integração indisponível.' : 'Solicitação inválida.' },
      { status: isConfigurationError ? 503 : 400 },
    )
  }
}
