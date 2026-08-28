import { NextRequest, NextResponse } from 'next/server'
import { getPublicAppOrigin } from '@/utils/http/public-app-origin'
import {
  deleteInstagramDataByUserId,
  instagramDeletionConfirmationCode,
  readMetaSignedRequest,
} from '@/utils/instagram/meta-callback'

export async function POST(request: NextRequest) {
  try {
    const { instagramUserId } = await readMetaSignedRequest(request)
    await deleteInstagramDataByUserId(instagramUserId)

    const confirmationCode = instagramDeletionConfirmationCode(instagramUserId)
    const statusUrl = new URL('/instagram/exclusao-de-dados', getPublicAppOrigin(request))
    statusUrl.searchParams.set('code', confirmationCode)

    return NextResponse.json({
      url: statusUrl.toString(),
      confirmation_code: confirmationCode,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Solicitação inválida.'
    const isConfigurationError = message.includes('não foi configurada')
    return NextResponse.json(
      { error: isConfigurationError ? 'Integração indisponível.' : 'Solicitação inválida.' },
      { status: isConfigurationError ? 503 : 400 },
    )
  }
}
