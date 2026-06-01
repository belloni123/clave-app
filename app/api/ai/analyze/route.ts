import { NextResponse } from 'next/server'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`

// MOCK FALLBACKS (If GEMINI_API_KEY is not set)
function mockIndividualStory(story: any) {
  const cats: any = {
    'Superação': [
      'Como superei meu maior desafio e o que aprendi',
      'A virada que mudou tudo no meu negócio',
      'O que ninguém te conta sobre recomeçar'
    ],
    'Negócio': [
      'Os bastidores de como construí meu negócio',
      'O erro que quase acabou com tudo',
      'O que eu faria diferente se começasse hoje'
    ],
    'Aprendizado': [
      'A lição mais cara que aprendi',
      'O momento que mudou minha perspectiva',
      'Por que eu estava completamente errado'
    ],
    'Vida pessoal': [
      'Como minha vida pessoal impacta o trabalho',
      'A história por trás da minha missão',
      'O que me motiva todos os dias'
    ],
    'Relacionamento': [
      'Como uma conversa mudou tudo',
      'O mentor que transformou minha trajetória',
      'O que aprendi sobre pessoas e negócios'
    ]
  }

  const angulos = cats[story.category] || [
    'A história por trás do método',
    'Por que faço o que faço',
    'Minha principal revelação estratégica'
  ]

  const formatos = [
    'Reels de impacto',
    'Vídeo longo no YouTube',
    'E-mail de relacionamento',
    'Destaque de copy no VSL'
  ]

  const gatilhos = ['Urgência', 'Transformação', 'Autoridade', 'Reciprocidade']

  return {
    resumo: `[MOCK IA] História da categoria "${story.category}" com foco em ${story.emotion || 'Identificação'}. Ponto de virada: ${story.result || 'não especificado'}.`,
    angulos,
    formatos,
    gatilhos
  }
}

function mockGlobalConsultation(intent: string, context: string, stories: any[]) {
  const list = stories.map((s, i) => `${i + 1}. "${s.title}" (Virada: ${s.result || 'Nenhuma'})`).join('\n')
  return `[MOCK SUGGESTION - IA CONFIG EM FALTA]\n\nSugestão de roteiro para: ${intent}\nInstrução do usuário: "${context || 'Nenhuma'}"\n\nEstrutura sugerida com base em suas histórias:\n${list}\n\nRecomendação: Posicione a história de maior impacto emocional na introdução para capturar a atenção imediata (0-60s) e feche o loop conectando com a oferta principal.`
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { task, story, intent, context, stories } = body

    // Se a chave da API não estiver configurada, usa o fallback de regras locais
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your-gemini-api-key') {
      if (task === 'individual_story') {
        const analysis = mockIndividualStory(story)
        return NextResponse.json({ analysis })
      } else {
        const suggestion = mockGlobalConsultation(intent, context, stories)
        return NextResponse.json({ suggestion })
      }
    }

    if (task === 'individual_story') {
      const prompt = `
Você é um especialista em marketing digital e storytelling. Analise a seguinte história de marketing e retorne um objeto JSON contendo:
- "resumo": Uma frase curta resumindo o valor estratégico e apelo emocional da história.
- "angulos": Três ganchos/ângulos de copy diferentes para contar essa história.
- "formatos": Três formatos de criativos recomendados (ex: reels, e-mail de carrinho, etc).
- "gatilhos": Três gatilhos emocionais/psicológicos mais evidentes na história.

Título: ${story.title}
Categoria: ${story.category}
Emoção Predominante: ${story.emotion}
Contexto: ${story.context}
Ponto de Virada: ${story.result}
História Completa: ${story.body}
`

      const payload = {
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              resumo: { type: 'STRING' },
              angulos: { type: 'ARRAY', items: { type: 'STRING' } },
              formatos: { type: 'ARRAY', items: { type: 'STRING' } },
              gatilhos: { type: 'ARRAY', items: { type: 'STRING' } }
            },
            required: ['resumo', 'angulos', 'formatos', 'gatilhos']
          }
        }
      }

      const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        throw new Error(`Gemini API error: ${res.statusText}`)
      }

      const resData = await res.json()
      const text = resData.candidates?.[0]?.content?.parts?.[0]?.text
      const analysis = JSON.parse(text)

      return NextResponse.json({ analysis })

    } else if (task === 'global_consultation') {
      const formattedStories = stories.map((s: any, idx: number) => `
História ${idx + 1}:
Título: ${s.title}
Categoria: ${s.category}
Emoção: ${s.emotion}
Contexto: ${s.context}
Virada: ${s.result}
`).join('\n')

      const prompt = `
Você é um copywriter estrategista de elite. O usuário deseja estruturar um conteúdo de marketing com o seguinte objetivo: "${intent}".
Contexto extra do usuário: "${context || 'Nenhum'}"

Abaixo estão listadas todas as histórias de storytelling disponíveis no banco de dados do projeto:
${formattedStories}

Instruções:
Cruze as histórias disponíveis para gerar uma sugestão de roteiro estruturada passo a passo para o objetivo de conteúdo selecionado (${intent}). Indique explicitamente qual história deve ser usada em cada seção do conteúdo (Ex: na abertura do VSL use a História X, no e-mail de vendas 2 use a História Y). Seja específico, direto e mantenha um tom de consultor de marketing profissional.
`

      const payload = {
        contents: [{
          parts: [{ text: prompt }]
        }]
      }

      const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        throw new Error(`Gemini API error: ${res.statusText}`)
      }

      const resData = await res.json()
      const suggestion = resData.candidates?.[0]?.content?.parts?.[0]?.text

      return NextResponse.json({ suggestion })
    }

    return NextResponse.json({ error: 'Task inválida' }, { status: 400 })

  } catch (err: any) {
    console.error(err)
    return NextResponse.json({ error: err.message || 'Erro interno no servidor de IA' }, { status: 500 })
  }
}
