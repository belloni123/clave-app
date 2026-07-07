'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Star, Award, Zap, BookOpen, Compass, ChevronRight, User, ShieldAlert, Sparkles, Send } from 'lucide-react'
import { getStoredTheme, applyTheme } from '@/utils/theme'

type QuizType = 'expert' | 'bastidores'

export default function DiagnosticoPage() {
  const router = useRouter()

  const [theme, setTheme] = useState<'light' | 'dark'>('dark')

  useEffect(() => {
    const finalTheme = getStoredTheme()
    applyTheme(finalTheme)
    const timer = setTimeout(() => setTheme(finalTheme), 0)

    if (typeof window !== 'undefined') {
      // CRM UTM / Referrer tracking logic
      const params = new URLSearchParams(window.location.search)
      const utms = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
      
      utms.forEach(function(key) {
        const val = params.get(key)
        if (val) {
          localStorage.setItem('nfs_' + key, val)
        }
      })

      if (document.referrer && !localStorage.getItem('nfs_referrer')) {
        localStorage.setItem('nfs_referrer', document.referrer)
      }
      if (!localStorage.getItem('nfs_url')) {
        localStorage.setItem('nfs_url', window.location.href)
      }
    }

    return () => clearTimeout(timer)
  }, [])

  // General Quiz State
  const [selectedQuiz, setSelectedQuiz] = useState<QuizType | null>(null)
  const [currentStep, setCurrentStep] = useState(0) // 0 = Abertura daquele quiz

  // Polite exit state
  const [politeExit, setPoliteExit] = useState(false)

  // ==========================================
  // STATE FOR EXPERT QUIZ
  // ==========================================
  const [expertAnswers, setExpertAnswers] = useState({
    etapa1_qualif: '', // Sim / Ainda não
    etapa2_nicho: '',
    etapa3_canais: '', // YouTube / Facebook / LinkedIn / TikTok / Não produzo em outro canal
    etapa4_seguidores: '', // Até 5.000 / 5.000 a 20.000 / 20.000 a 100.000 / Acima de 100.000
    etapa5_trabalho: '',
    etapa6_referencia: '',
    etapa7_produto: '', // Não tenho produto ainda / Ebook / Masterclass / Curso / Comunidade / Consultoria / Mentoria / Evento presencial
    etapa8_historico_venda: '', // Sim, de forma recorrente / Sim, esporadicamente / Não, nunca vendi
    etapa9_lancamentos: '', // Nenhum / 1 a 2 / 3 a 5 / 6 ou mais
    etapa10_equipe: '', // Sozinho(a) / Com 1-2 pessoas de apoio (freelancer/agência) / Com equipe estruturada / Em sociedade com outra pessoa
    etapa11_faturamento: '', // Ainda não vendi / Até R$100.000 / R$101.000-R$300.000 / ...
    etapa12_trafego: '', // Ainda não invisto / ...
    etapa13_disposicao_inv: '', // Até R$2.000 / ...
    etapa14_prazo: '', // O mais rápido possível / ...
    etapa15_motivacao: '',
    etapa16_como_conheceu: '',
    // Captura
    leadNome: '',
    leadWhatsapp: '',
    leadEmail: '',
    leadInstagram: '',
    lgpdConsent: false
  })

  // ==========================================
  // STATE FOR BASTIDORES QUIZ
  // ==========================================
  const [bastidoresAnswers, setBastidoresAnswers] = useState({
    etapa1_qualif: '', // Sim / Ainda não tenho certeza / Não
    etapa2_motivacao: '', // Mudar de carreira / ...
    etapa3_situacao: '', // Está empregado(a) CLT / ...
    etapa4_ferramentas: [] as string[], // Canva / Planilhas / ...
    etapa5_historico: '', // Já trabalhei profissionalmente (4) / ...
    etapa6_formacao: '', // Sim, mais de uma (4) / ...
    etapa7_area: '', // Tráfego pago / ...
    etapa8_tempo: '', // Mais de 30h (4) / ...
    etapa9_urgencia: '', // Retorno imediato / ...
    etapa10_disciplina: '', // Sou bem disciplinado (4) / ...
    etapa11_investimento: '', // Sim, tenho orçamento (4) / ...
    // Captura
    leadNome: '',
    leadWhatsapp: '',
    leadEmail: '',
    leadInstagram: '',
    lgpdConsent: false
  })

  // ==========================================
  // NAVIGATION HANDLERS
  // ==========================================
  const handleSelectQuiz = (type: QuizType) => {
    setSelectedQuiz(type)
    setCurrentStep(0)
    setPoliteExit(false)
  }

  const submitToCrm = async (type: 'expert' | 'bastidores') => {
    const url = type === 'expert'
      ? 'https://crm.agenciab16.com.br/api/forms/submit/nfs_form_2d697ff02737cdcf0281dfe0e5d3dcc107146d3807b0666e'
      : 'https://crm.agenciab16.com.br/api/forms/submit/nfs_form_1be53bd9b42379da855a5425bf80f2a10af9a9c244e3f9e6'

    const state = type === 'expert' ? expertAnswers : bastidoresAnswers

    // Gather UTM values
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
    const getUtm = (key: string) => params.get(key) || localStorage.getItem('nfs_' + key) || ''

    const formData = new FormData()
    formData.append('name', state.leadNome)
    formData.append('email', state.leadEmail)
    formData.append('phone', state.leadWhatsapp)
    formData.append('021ebd1e-23cd-4110-bed8-e4be899477c2', state.leadInstagram)
    
    formData.append('utm_source', getUtm('utm_source'))
    formData.append('utm_medium', getUtm('utm_medium'))
    formData.append('utm_campaign', getUtm('utm_campaign'))
    formData.append('utm_content', getUtm('utm_content'))
    formData.append('utm_term', getUtm('utm_term'))
    formData.append('referrer', document.referrer || localStorage.getItem('nfs_referrer') || '')
    formData.append('url', typeof window !== 'undefined' ? window.location.href : '')

    // Add all quiz answers dynamically
    Object.entries(state).forEach(([key, value]) => {
      if (['leadNome', 'leadEmail', 'leadWhatsapp', 'leadInstagram', 'lgpdConsent'].includes(key)) return
      if (Array.isArray(value)) {
        formData.append(key, value.join(', '))
      } else {
        formData.append(key, String(value))
      }
    })

    try {
      await fetch(url, {
        method: 'POST',
        body: formData,
        mode: 'no-cors'
      })
    } catch (err) {
      console.error('CRM submit error', err)
    }
  }

  const handleExpertSubmit = async () => {
    await submitToCrm('expert')
    handleNextStep()
  }

  const handleBastidoresSubmit = async () => {
    await submitToCrm('bastidores')
    handleNextStep()
  }

  const handleBackToSelect = () => {
    setSelectedQuiz(null)
    setCurrentStep(0)
    setPoliteExit(false)
  }

  const handleNextStep = () => {
    setCurrentStep((prev) => prev + 1)
  }

  const handlePrevStep = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1)
    }
  }

  // ==========================================
  // CALCULATION LOGIC: EXPERT RESULT
  // ==========================================
  const getExpertResult = () => {
    const {
      etapa7_produto,
      etapa11_faturamento,
      etapa13_disposicao_inv,
    } = expertAnswers

    // Determine Level based on faturamento
    let levelName = 'Fundação'
    let levelKey = 'newbie'
    let levelDescription = 'Seu foco principal no momento deve ser a validação da sua oferta de entrada e a atração de seus primeiros clientes.'

    if (etapa11_faturamento === 'R$101.000-R$300.000' || etapa11_faturamento === 'R$301.000-R$600.000') {
      levelName = 'Estruturação'
      levelKey = 'soft'
      levelDescription = 'Você já deu os primeiros passos e agora precisa padronizar seus processos de venda e canais de tráfego.'
    } else if (etapa11_faturamento === 'R$601.000-R$1.000.000') {
      levelName = 'Tração'
      levelKey = 'hard'
      levelDescription = 'Seu negócio já roda e fatura. Agora, o foco é construir processos escaláveis e estruturar equipe.'
    } else if (etapa11_faturamento === 'R$1.000.001-R$3.000.000') {
      levelName = 'Expansão'
      levelKey = 'pro'
      levelDescription = 'Você está expandindo seus mix de produtos digitais e internacionalizando ou consolidando sua fatia de mercado.'
    } else if (etapa11_faturamento === 'R$3.000.000-R$10.000.000' || etapa11_faturamento === 'Acima de R$10.000.000') {
      levelName = 'Escala'
      levelKey = 'master'
      levelDescription = 'Sua operação é madura. O desafio é governança, novas aquisições de tráfego e consolidação de equity.'
    }

    // Determine profile
    // Pronto para lançamento: tem produto, faturamento >= R$101k (Estruturação ou superior) e está disposto a investir >= R$5k
    const hasProduct = etapa7_produto !== '' && etapa7_produto !== 'Não tenho produto ainda'
    
    const isMediumHighFaturamento = [
      'R$101.000-R$300.000',
      'R$301.000-R$600.000',
      'R$601.000-R$1.000.000',
      'R$1.000.001-R$3.000.000',
      'R$3.000.000-R$10.000.000',
      'Acima de R$10.000.000'
    ].includes(etapa11_faturamento)

    const isWillingToInvest = [
      'R$5.000-R$10.000',
      'Acima de R$10.000'
    ].includes(etapa13_disposicao_inv)

    let profileTitle = ''
    let profileDesc = ''
    let momentStatus = ''
    let bottlenecks = []

    if (hasProduct && isMediumHighFaturamento && isWillingToInvest) {
      profileTitle = 'Pronto para Lançamento'
      momentStatus = 'Momento Ideal para Lançamento'
      profileDesc = 'Você possui a validação mínima necessária, audiência ou produto pronto e verba de investimento compatível para colher grandes picos de vendas estruturados.'
      bottlenecks = [
        'Organização de processos internos e calendário editorial',
        'Controle fino de CPA de anúncios vs margem de lucro por lead',
        'Profissionalização do time de vendas e suporte de lançamentos'
      ]
    } else if (hasProduct || isMediumHighFaturamento) {
      profileTitle = 'Em Estruturação (Quase Lá)'
      momentStatus = 'Fase de Ajustes de Base'
      profileDesc = 'Você já possui alguns pilares validados (produto ou faturamento histórico), mas ainda carece de consistência comercial ou orçamento seguro para tráfego pago.'
      bottlenecks = [
        'Validação do VSL / pitch de vendas para público frio',
        'Criação de esteira de produtos de menor barreira (downsell/order bump)',
        'Definição da verba mínima de marketing para atração regular de leads'
      ]
    } else {
      profileTitle = 'Em Fundação (Foco Comercial)'
      momentStatus = 'Fase de Atração e Validação'
      profileDesc = 'Seu foco atual deve ser em criar ofertas simples, gerar audiência primária e testar vendas rápidas de menor preço antes de estruturar grandes lançamentos.'
      bottlenecks = [
        'Definição precisa do nicho e da promessa de produto digital',
        'Primeiras vendas manuais (direct/consultoria de entrada) para colher depoimentos',
        'Ajustes nos canais de produção de conteúdo orgânico regular'
      ]
    }

    return {
      levelName,
      levelKey,
      levelDescription,
      profileTitle,
      momentStatus,
      profileDesc,
      bottlenecks
    }
  }

  // ==========================================
  // CALCULATION LOGIC: BASTIDORES RESULT
  // ==========================================
  const getBastidoresResult = () => {
    const {
      etapa4_ferramentas,
      etapa5_historico,
      etapa6_formacao,
      etapa8_tempo,
      etapa10_disciplina,
      etapa11_investimento,
      etapa7_area,
      etapa9_urgencia
    } = bastidoresAnswers

    // Calculate score
    const toolsPoints = Math.min(etapa4_ferramentas.filter(f => f !== 'Nenhuma dessas ainda').length, 4)

    const mapVal = (val: string) => {
      if (val.includes('(4)')) return 4
      if (val.includes('(3)')) return 3
      if (val.includes('(2)')) return 2
      if (val.includes('(1)')) return 1
      return 2 // default
    }

    const histPoints = mapVal(etapa5_historico)
    const formPoints = mapVal(etapa6_formacao)
    const timePoints = mapVal(etapa8_tempo)
    const discPoints = mapVal(etapa10_disciplina)
    const invPoints = mapVal(etapa11_investimento)

    const totalScore = toolsPoints + histPoints + formPoints + timePoints + discPoints + invPoints

    // 5 Levels
    let levelName = 'Descobrindo'
    let learningCurve = 'Longa'
    let focusText = 'Entender as principais áreas dos bastidores e escolher uma trilha de estudos inicial antes de qualquer execução prática.'
    let ratingColor = 'bg-gray-bg text-gray-t border-border2'

    if (totalScore >= 11 && totalScore <= 14) {
      levelName = 'Aprendendo'
      learningCurve = 'Média-Longa'
      focusText = 'Investir em sua primeira formação estruturada para consolidar conceitos antes de buscar oportunidades remuneradas.'
      ratingColor = 'bg-blue-bg text-blue-t border-blue-custom/25'
    } else if (totalScore >= 15 && totalScore <= 18) {
      levelName = 'Praticando'
      learningCurve = 'Média'
      focusText = 'Aplicar o conhecimento adquirido em projetos reais, mesmo que pequenos ou como voluntário/freelancer barato, para construir portfólio.'
      ratingColor = 'bg-amber-bg text-amber-t border-amber-custom/25'
    } else if (totalScore >= 19 && totalScore <= 21) {
      levelName = 'Atuando'
      learningCurve = 'Curta'
      focusText = 'Buscar ativamente vagas remuneradas, parcerias estáveis ou contratos freelance recorrentes na sua área de preferência.'
      ratingColor = 'bg-purple-bg text-purple-t border-purple-custom/25'
    } else if (totalScore >= 22) {
      levelName = 'Especializando'
      learningCurve = 'Mínima'
      focusText = 'Você já possui sólida base prática; busque especializações de ponta, monte processos de agência e eleve o ticket dos seus serviços.'
      ratingColor = 'bg-green-bg text-green-t border-green-custom/25'
    }

    // Urgency recommendation
    let nextStepSuggestion = ''
    if (etapa9_urgencia.includes('1 mês')) {
      nextStepSuggestion = 'Devido à sua urgência financeira de curto prazo, o ideal é focar em serviços de rápida contratação (ex: Edição rápida de vídeo, Gestão de redes sociais para pequenos negócios locais) buscando fechar 2 a 3 pequenos clientes manuais imediatamente.'
    } else if (etapa9_urgencia.includes('2 a 3 meses')) {
      nextStepSuggestion = 'Com um horizonte de 2 a 3 meses, sugerimos criar uma rotina diária de 2h de estudos práticos na sua área de escolha, seguida da montagem de um portfólio mockup. No segundo mês, inicie prospecções direcionadas.'
    } else {
      nextStepSuggestion = 'Você está em um excelente cenário. Aproveite para investir tempo em uma formação sólida e de profundidade na área selecionada, acompanhando projetos e debriefings antes de começar a prestar serviços ao mercado.'
    }

    return {
      levelName,
      learningCurve,
      focusText,
      totalScore,
      ratingColor,
      recommendedArea: etapa7_area || 'Não especificada',
      nextStepSuggestion
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-bg relative px-4 py-8 overflow-x-hidden">
      {/* Background radial overlays */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_20%,rgba(83,74,183,0.06)_0%,transparent_50%),radial-gradient(circle_at_90%_80%,rgba(29,158,117,0.06)_0%,transparent_50%)] pointer-events-none" />

      <div className="w-full max-w-xl z-10 space-y-6">
        {/* Header Branding */}
        <div className="flex flex-col items-center">
          <img
            src={theme === 'dark' ? '/logo_white.svg' : '/logo_black.svg'}
            alt="B16 Clave"
            className="h-10 object-contain mb-2 transition-transform duration-300 hover:scale-105"
          />
        </div>

        {/* ==========================================
            VIEW: SELECT QUIZ
            ========================================== */}
        {!selectedQuiz && (
          <div className="bg-surface border border-border-custom rounded-2xl p-6 sm:p-8 shadow-md space-y-6 animate-[fadeUp_0.3s_ease_both]">
            <div className="text-center space-y-2">
              <h2 className="text-base font-bold text-text-custom">Diagnóstico de Posicionamento & Maturidade</h2>
              <p className="text-xs text-text2 max-w-sm mx-auto">
                Selecione o seu perfil de atuação digital atual para iniciarmos a análise personalizada de mercado.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 pt-2">
              {/* Expert Card */}
              <div
                onClick={() => handleSelectQuiz('expert')}
                className="p-5 border border-border-custom hover:border-purple-custom hover:bg-purple-bg/5 rounded-xl cursor-pointer transition-all flex items-start gap-4 group"
              >
                <div className="w-9 h-9 rounded-lg bg-purple-bg text-purple-custom flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                  <User className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold text-text-custom flex items-center gap-1.5">
                    Quero ser Lançado (Expert)
                    <ChevronRight className="w-3.5 h-3.5 text-purple-custom opacity-0 group-hover:opacity-100 transition-opacity" />
                  </span>
                  <p className="text-[10px] text-text2 leading-relaxed">
                    Sou o produtor de conteúdo, especialista ou palestrante e desejo vender cursos, mentorias ou e-books autorais no mercado.
                  </p>
                </div>
              </div>

              {/* Backstage Card */}
              <div
                onClick={() => handleSelectQuiz('bastidores')}
                className="p-5 border border-border-custom hover:border-green-custom hover:bg-green-bg/5 rounded-xl cursor-pointer transition-all flex items-start gap-4 group"
              >
                <div className="w-9 h-9 rounded-lg bg-green-bg text-green-custom flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                  <Zap className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold text-text-custom flex items-center gap-1.5">
                    Atuar nos Bastidores (Operações)
                    <ChevronRight className="w-3.5 h-3.5 text-green-custom opacity-0 group-hover:opacity-100 transition-opacity" />
                  </span>
                  <p className="text-[10px] text-text2 leading-relaxed">
                    Quero atuar como gestor de tráfego, copywriter, designer, editor de vídeo, social media ou gerente de projetos digitais.
                  </p>
                </div>
              </div>
            </div>

            <div className="text-center pt-2">
              <button
                onClick={() => router.push('/login')}
                className="text-[11px] text-text2 hover:text-text-custom underline font-medium transition-colors"
              >
                Voltar para o Login
              </button>
            </div>
          </div>
        )}

        {/* ==========================================
            VIEW: EXPERT QUIZ STEPS
            ========================================== */}
        {selectedQuiz === 'expert' && !politeExit && (
          <div className="bg-surface border border-border-custom rounded-2xl p-6 sm:p-7 shadow-md space-y-6 animate-[fadeUp_0.2s_ease_both]">
            {/* Header progress bar */}
            <div className="flex justify-between items-center text-[10px] text-text3 font-semibold pb-1.5 border-b border-border-custom/50">
              <button
                onClick={handlePrevStep}
                disabled={currentStep === 0}
                className="flex items-center gap-1 text-text2 hover:text-text-custom disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Voltar</span>
              </button>
              <span>Etapa {currentStep} de 17</span>
              <button onClick={handleBackToSelect} className="text-red-t hover:underline">
                Sair
              </button>
            </div>

            {/* Steps Rendering */}
            {currentStep === 0 && (
              <div className="space-y-5 text-center py-4 animate-[fadeUp_0.15s_ease_both]">
                <div className="w-12 h-12 rounded-full bg-purple-bg flex items-center justify-center mx-auto text-purple-custom">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-base font-bold text-text-custom">Diagnóstico de Expert</h3>
                  <p className="text-xs text-text2 max-w-sm mx-auto leading-relaxed">
                    Descubra em poucos minutos se este é o seu momento ideal de ser lançado no mercado digital ou estruturar vendas perpétuas.
                  </p>
                </div>
                <button
                  onClick={handleNextStep}
                  className="w-full py-2.5 bg-text-custom text-bg font-bold rounded-lg text-xs hover:opacity-95 transition-opacity"
                >
                  Iniciar diagnóstico
                </button>
              </div>
            )}

            {currentStep === 1 && (
              <div className="space-y-5 animate-[fadeUp_0.15s_ease_both]">
                <p className="text-xs font-bold text-text-custom text-center">
                  Você quer descobrir se este é o momento certo pra ser lançado(a) como expert?
                </p>
                <div className="grid grid-cols-1 gap-2.5">
                  <button
                    onClick={() => {
                      setExpertAnswers({ ...expertAnswers, etapa1_qualif: 'Sim' })
                      handleNextStep()
                    }}
                    className="w-full py-2.5 border border-border-custom hover:border-purple-custom hover:bg-purple-bg/5 font-semibold text-text-custom rounded-lg text-xs transition-all"
                  >
                    Sim, com certeza
                  </button>
                  <button
                    onClick={() => {
                      setExpertAnswers({ ...expertAnswers, etapa1_qualif: 'Ainda não' })
                      setPoliteExit(true)
                    }}
                    className="w-full py-2.5 border border-border-custom hover:border-red-t/30 hover:bg-red-bg/5 font-semibold text-text2 rounded-lg text-xs transition-all"
                  >
                    Ainda não tenho certeza / Não agora
                  </button>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
                <div>
                  <label className="text-[10px] font-bold text-text2 mb-1.5 block">Qual seu nicho de atuação?</label>
                  <input
                    className="w-full px-3 py-2 text-xs border border-border2 rounded-lg bg-surface text-text-custom outline-none focus:border-text-custom"
                    value={expertAnswers.etapa2_nicho}
                    onChange={(e) => setExpertAnswers({ ...expertAnswers, etapa2_nicho: e.target.value })}
                    placeholder="Ex: Medicina Integrativa, Finanças Pessoais, Concursos..."
                    autoFocus
                  />
                </div>
                <button
                  onClick={handleNextStep}
                  disabled={!expertAnswers.etapa2_nicho.trim()}
                  className="w-full py-2 bg-text-custom text-bg font-bold rounded-lg text-xs hover:opacity-95 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Continuar
                </button>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
                <p className="text-xs font-bold text-text-custom">
                  Além do Instagram, você também produz conteúdo em outro canal?
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {['YouTube', 'Facebook', 'LinkedIn', 'TikTok', 'Não produzo em outro canal'].map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setExpertAnswers({ ...expertAnswers, etapa3_canais: option })
                        handleNextStep()
                      }}
                      className={`w-full py-2.5 border rounded-lg text-left px-4 text-xs font-semibold transition-all ${
                        expertAnswers.etapa3_canais === option
                          ? 'border-purple-custom bg-purple-bg/10 text-purple-t'
                          : 'border-border-custom hover:border-text-custom text-text-custom'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
                <p className="text-xs font-bold text-text-custom">
                  Quantos seguidores você tem hoje no Instagram?
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {['Até 5.000', '5.000 a 20.000', '20.000 a 100.000', 'Acima de 100.000'].map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setExpertAnswers({ ...expertAnswers, etapa4_seguidores: option })
                        handleNextStep()
                      }}
                      className={`w-full py-2.5 border rounded-lg text-left px-4 text-xs font-semibold transition-all ${
                        expertAnswers.etapa4_seguidores === option
                          ? 'border-purple-custom bg-purple-bg/10 text-purple-t'
                          : 'border-border-custom hover:border-text-custom text-text-custom'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 5 && (
              <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
                <div>
                  <label className="text-[10px] font-bold text-text2 mb-1.5 block">
                    Descreva seu trabalho e as principais dores que seu conteúdo resolve:
                  </label>
                  <textarea
                    className="w-full px-3 py-2 text-xs border border-border2 rounded-lg bg-surface text-text-custom outline-none focus:border-text-custom h-24 resize-none"
                    value={expertAnswers.etapa5_trabalho}
                    onChange={(e) => setExpertAnswers({ ...expertAnswers, etapa5_trabalho: e.target.value })}
                    placeholder="Quais produtos você vende, do que fala nas redes e como ajuda seus alunos..."
                    autoFocus
                  />
                </div>
                <button
                  onClick={handleNextStep}
                  disabled={!expertAnswers.etapa5_trabalho.trim()}
                  className="w-full py-2 bg-text-custom text-bg font-bold rounded-lg text-xs hover:opacity-95 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Continuar
                </button>
              </div>
            )}

            {currentStep === 6 && (
              <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
                <div>
                  <label className="text-[10px] font-bold text-text2 mb-1.5 block">
                    Neste nicho, qual é o seu principal concorrente e/ou referência?
                  </label>
                  <input
                    className="w-full px-3 py-2 text-xs border border-border2 rounded-lg bg-surface text-text-custom outline-none focus:border-text-custom"
                    value={expertAnswers.etapa6_referencia}
                    onChange={(e) => setExpertAnswers({ ...expertAnswers, etapa6_referencia: e.target.value })}
                    placeholder="Ex: @referencia_mercado"
                    autoFocus
                  />
                </div>
                <button
                  onClick={handleNextStep}
                  disabled={!expertAnswers.etapa6_referencia.trim()}
                  className="w-full py-2 bg-text-custom text-bg font-bold rounded-lg text-xs hover:opacity-95 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Continuar
                </button>
              </div>
            )}

            {currentStep === 7 && (
              <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
                <p className="text-xs font-bold text-text-custom">
                  Você já possui produto digital?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    'Não tenho produto ainda',
                    'Ebook',
                    'Masterclass',
                    'Curso',
                    'Comunidade',
                    'Consultoria',
                    'Mentoria',
                    'Evento presencial'
                  ].map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setExpertAnswers({ ...expertAnswers, etapa7_produto: option })
                        handleNextStep()
                      }}
                      className={`w-full py-2 border rounded-lg text-center text-[10px] font-semibold transition-all ${
                        expertAnswers.etapa7_produto === option
                          ? 'border-purple-custom bg-purple-bg/10 text-purple-t'
                          : 'border-border-custom hover:border-text-custom text-text-custom'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 8 && (
              <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
                <p className="text-xs font-bold text-text-custom">
                  Você já vende algo hoje, mesmo que pequeno?
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {['Sim, de forma recorrente', 'Sim, esporadicamente', 'Não, nunca vendi'].map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setExpertAnswers({ ...expertAnswers, etapa8_historico_venda: option })
                        handleNextStep()
                      }}
                      className={`w-full py-2.5 border rounded-lg text-left px-4 text-xs font-semibold transition-all ${
                        expertAnswers.etapa8_historico_venda === option
                          ? 'border-purple-custom bg-purple-bg/10 text-purple-t'
                          : 'border-border-custom hover:border-text-custom text-text-custom'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 9 && (
              <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
                <p className="text-xs font-bold text-text-custom">
                  Quantos lançamentos você já fez no mercado digital?
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {['Nenhum', '1 a 2', '3 a 5', '6 ou mais'].map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setExpertAnswers({ ...expertAnswers, etapa9_lancamentos: option })
                        handleNextStep()
                      }}
                      className={`w-full py-2.5 border rounded-lg text-left px-4 text-xs font-semibold transition-all ${
                        expertAnswers.etapa9_lancamentos === option
                          ? 'border-purple-custom bg-purple-bg/10 text-purple-t'
                          : 'border-border-custom hover:border-text-custom text-text-custom'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 10 && (
              <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
                <p className="text-xs font-bold text-text-custom">
                  Hoje, no seu projeto digital, você está:
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    'Sozinho(a)',
                    'Com 1-2 pessoas de apoio (freelancer/agência)',
                    'Com equipe estruturada',
                    'Em sociedade com outra pessoa'
                  ].map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setExpertAnswers({ ...expertAnswers, etapa10_equipe: option })
                        handleNextStep()
                      }}
                      className={`w-full py-2.5 border rounded-lg text-left px-4 text-xs font-semibold transition-all ${
                        expertAnswers.etapa10_equipe === option
                          ? 'border-purple-custom bg-purple-bg/10 text-purple-t'
                          : 'border-border-custom hover:border-text-custom text-text-custom'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 11 && (
              <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
                <p className="text-xs font-bold text-text-custom">
                  Qual foi seu faturamento na internet nos últimos 12 meses?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    'Ainda não vendi',
                    'Até R$100.000',
                    'R$101.000-R$300.000',
                    'R$301.000-R$600.000',
                    'R$601.000-R$1.000.000',
                    'R$1.000.001-R$3.000.000',
                    'R$3.000.000-R$10.000.000',
                    'Acima de R$10.000.000'
                  ].map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setExpertAnswers({ ...expertAnswers, etapa11_faturamento: option })
                        handleNextStep()
                      }}
                      className={`w-full py-2 border rounded-lg text-center text-[10px] font-semibold transition-all ${
                        expertAnswers.etapa11_faturamento === option
                          ? 'border-purple-custom bg-purple-bg/10 text-purple-t'
                          : 'border-border-custom hover:border-text-custom text-text-custom'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 12 && (
              <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
                <p className="text-xs font-bold text-text-custom">
                  Quanto você investiu em tráfego pago nos últimos 12 meses?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    'Ainda não invisto',
                    'Até R$10.000',
                    'R$10.000-R$50.000',
                    'R$50.000-R$100.000',
                    'R$100.000-R$500.000',
                    'Acima de R$500.000'
                  ].map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setExpertAnswers({ ...expertAnswers, etapa12_trafego: option })
                        handleNextStep()
                      }}
                      className={`w-full py-2 border rounded-lg text-center text-[10px] font-semibold transition-all ${
                        expertAnswers.etapa12_trafego === option
                          ? 'border-purple-custom bg-purple-bg/10 text-purple-t'
                          : 'border-border-custom hover:border-text-custom text-text-custom'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 13 && (
              <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
                <p className="text-xs font-bold text-text-custom">
                  Quanto você está disposto(a) a investir em marketing mensalmente?
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {['Até R$2.000', 'R$2.000-R$5.000', 'R$5.000-R$10.000', 'Acima de R$10.000'].map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setExpertAnswers({ ...expertAnswers, etapa13_disposicao_inv: option })
                        handleNextStep()
                      }}
                      className={`w-full py-2.5 border rounded-lg text-left px-4 text-xs font-semibold transition-all ${
                        expertAnswers.etapa13_disposicao_inv === option
                          ? 'border-purple-custom bg-purple-bg/10 text-purple-t'
                          : 'border-border-custom hover:border-text-custom text-text-custom'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 14 && (
              <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
                <p className="text-xs font-bold text-text-custom">
                  Entrando na B16, quando pretende lançar?
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {['O mais rápido possível', 'Em 3 meses', 'Entre 3 e 6 meses', 'Não sei ainda'].map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setExpertAnswers({ ...expertAnswers, etapa14_prazo: option })
                        handleNextStep()
                      }}
                      className={`w-full py-2.5 border rounded-lg text-left px-4 text-xs font-semibold transition-all ${
                        expertAnswers.etapa14_prazo === option
                          ? 'border-purple-custom bg-purple-bg/10 text-purple-t'
                          : 'border-border-custom hover:border-text-custom text-text-custom'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 15 && (
              <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-[10px] font-bold text-text2 block">
                      Por que você gostaria que a Agência B16 te lançasse?
                    </label>
                    <span className="text-[9px] text-text3 font-medium">Opcional</span>
                  </div>
                  <textarea
                    className="w-full px-3 py-2 text-xs border border-border2 rounded-lg bg-surface text-text-custom outline-none focus:border-text-custom h-24 resize-none"
                    value={expertAnswers.etapa15_motivacao}
                    onChange={(e) => setExpertAnswers({ ...expertAnswers, etapa15_motivacao: e.target.value })}
                    placeholder="Quais suas expectativas com uma agência parceira..."
                    autoFocus
                  />
                </div>
                <button
                  onClick={handleNextStep}
                  className="w-full py-2 bg-text-custom text-bg font-bold rounded-lg text-xs hover:opacity-95 transition-opacity"
                >
                  Continuar
                </button>
              </div>
            )}

            {currentStep === 16 && (
              <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
                <div>
                  <label className="text-[10px] font-bold text-text2 mb-1.5 block">
                    Como conheceu a B16 e quais suas impressões sobre nós?
                  </label>
                  <textarea
                    className="w-full px-3 py-2 text-xs border border-border2 rounded-lg bg-surface text-text-custom outline-none focus:border-text-custom h-24 resize-none"
                    value={expertAnswers.etapa16_como_conheceu}
                    onChange={(e) => setExpertAnswers({ ...expertAnswers, etapa16_como_conheceu: e.target.value })}
                    placeholder="Indicação, Instagram, anúncio, evento..."
                    autoFocus
                  />
                </div>
                <button
                  onClick={handleNextStep}
                  disabled={!expertAnswers.etapa16_como_conheceu.trim()}
                  className="w-full py-2 bg-text-custom text-bg font-bold rounded-lg text-xs hover:opacity-95 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Continuar
                </button>
              </div>
            )}

            {currentStep === 17 && (
              <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
                <div className="text-center space-y-1">
                  <h4 className="text-xs font-bold text-purple-t bg-purple-bg px-2.5 py-1 rounded inline-block">Você está a um passo do seu diagnóstico!</h4>
                  <p className="text-[10px] text-text3">Preencha seus dados reais para gerarmos seu posicionamento de faturamento da régua Clave.</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[9px] font-bold text-text2 block mb-1">Nome Completo</label>
                    <input
                      className="w-full px-3 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={expertAnswers.leadNome}
                      onChange={(e) => setExpertAnswers({ ...expertAnswers, leadNome: e.target.value })}
                      placeholder="Seu nome"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-text2 block mb-1">WhatsApp</label>
                    <input
                      className="w-full px-3 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={expertAnswers.leadWhatsapp}
                      onChange={(e) => setExpertAnswers({ ...expertAnswers, leadWhatsapp: e.target.value })}
                      placeholder="(DD) 99999-9999"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-text2 block mb-1">E-mail corporativo</label>
                    <input
                      type="email"
                      className="w-full px-3 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={expertAnswers.leadEmail}
                      onChange={(e) => setExpertAnswers({ ...expertAnswers, leadEmail: e.target.value })}
                      placeholder="exemplo@empresa.com"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-text2 block mb-1">Instagram (@usuario)</label>
                    <input
                      className="w-full px-3 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={expertAnswers.leadInstagram}
                      onChange={(e) => setExpertAnswers({ ...expertAnswers, leadInstagram: e.target.value })}
                      placeholder="@seu_perfil"
                    />
                  </div>

                  <div
                    onClick={() => setExpertAnswers({ ...expertAnswers, lgpdConsent: !expertAnswers.lgpdConsent })}
                    className="flex items-start gap-2.5 pt-1 cursor-pointer select-none"
                  >
                    <div className={`w-3.5 h-3.5 border rounded flex items-center justify-center shrink-0 mt-0.5 ${expertAnswers.lgpdConsent ? 'bg-purple-custom border-purple-custom text-white' : 'border-border2'}`}>
                      {expertAnswers.lgpdConsent && <Check className="w-2.5 h-2.5" />}
                    </div>
                    <span className="text-[9px] text-text2 leading-normal">
                      Autorizo o processamento dos meus dados para envio de diagnóstico estratégico e contato da equipe da Agência B16.
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleExpertSubmit}
                  disabled={!expertAnswers.leadNome || !expertAnswers.leadWhatsapp || !expertAnswers.leadEmail || !expertAnswers.leadInstagram || !expertAnswers.lgpdConsent}
                  className="w-full py-2.5 bg-text-custom text-bg font-bold rounded-lg text-xs hover:opacity-95 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Ver meu Resultado Estratégico</span>
                </button>
              </div>
            )}

            {currentStep === 18 && (() => {
              const res = getExpertResult()
              return (
                <div className="space-y-5 animate-[fadeUp_0.25s_ease_both]">
                  <div className="text-center space-y-1.5 border-b border-border-custom pb-4">
                    <Award className="w-8 h-8 text-purple-custom mx-auto" />
                    <h3 className="text-sm font-bold text-text-custom">Seu Diagnóstico está Pronto!</h3>
                    <p className="text-[10px] text-text3">Cruzamento com a Metodologia e Régua Clave de Faturamento</p>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-surface2 border border-border-custom p-4 rounded-xl space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-text2 uppercase tracking-wide">Maturidade Régua Clave:</span>
                        <span className="text-[10px] font-bold text-purple-t bg-purple-bg border border-purple-custom/20 px-2 py-0.5 rounded uppercase">
                          {res.levelName}
                        </span>
                      </div>
                      <p className="text-[10px] text-text-custom leading-relaxed">
                        {res.levelDescription}
                      </p>
                    </div>

                    <div className="border border-border-custom p-4 rounded-xl space-y-2">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-green-custom" />
                        <span className="text-[10px] font-bold text-text-custom uppercase tracking-wide">Avaliação do Momento:</span>
                      </div>
                      <p className="text-xs font-bold text-green-t">
                        {res.momentStatus} ({res.profileTitle})
                      </p>
                      <p className="text-[10px] text-text2 leading-relaxed">
                        {res.profileDesc}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-text3 uppercase block">Gargalos / Próximos Ajustes Necessários:</span>
                      <ul className="space-y-1.5">
                        {res.bottlenecks.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-[10px] text-text2">
                            <span className="w-4 h-4 rounded bg-purple-bg text-purple-t text-[8px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                              {idx + 1}
                            </span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-border-custom space-y-2.5">
                    <button
                      onClick={() => router.push('/login?state=ativar')}
                      className="w-full py-2.5 bg-text-custom text-bg font-bold rounded-lg text-xs hover:bg-text-custom/90 transition-colors shadow-sm flex items-center justify-center gap-1.5"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Criar minha conta no Clave para salvar diagnóstico</span>
                    </button>
                    <button
                      onClick={handleBackToSelect}
                      className="w-full py-2 border border-border2 text-[10px] text-text2 hover:text-text-custom rounded-lg transition-colors"
                    >
                      Refazer outro perfil
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* ==========================================
            VIEW: BASTIDORES QUIZ STEPS
            ========================================== */}
        {selectedQuiz === 'bastidores' && !politeExit && (
          <div className="bg-surface border border-border-custom rounded-2xl p-6 sm:p-7 shadow-md space-y-6 animate-[fadeUp_0.2s_ease_both]">
            {/* Header progress bar */}
            <div className="flex justify-between items-center text-[10px] text-text3 font-semibold pb-1.5 border-b border-border-custom/50">
              <button
                onClick={handlePrevStep}
                disabled={currentStep === 0}
                className="flex items-center gap-1 text-text2 hover:text-text-custom disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Voltar</span>
              </button>
              <span>Etapa {currentStep} de 12</span>
              <button onClick={handleBackToSelect} className="text-red-t hover:underline">
                Sair
              </button>
            </div>

            {/* Steps Rendering */}
            {currentStep === 0 && (
              <div className="space-y-5 text-center py-4 animate-[fadeUp_0.15s_ease_both]">
                <div className="w-12 h-12 rounded-full bg-green-bg flex items-center justify-center mx-auto text-green-custom">
                  <Compass className="w-6 h-6" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-base font-bold text-text-custom">Maturidade Digital nos Bastidores</h3>
                  <p className="text-xs text-text2 max-w-sm mx-auto leading-relaxed">
                    Não precisa aparecer nem ser influenciador. Existe um caminho seguro para trabalhar nos bastidores e gerir operações digitais. Descubra sua maturidade.
                  </p>
                </div>
                <button
                  onClick={handleNextStep}
                  className="w-full py-2.5 bg-text-custom text-bg font-bold rounded-lg text-xs hover:opacity-95 transition-opacity"
                >
                  Iniciar diagnóstico
                </button>
              </div>
            )}

            {currentStep === 1 && (
              <div className="space-y-5 animate-[fadeUp_0.15s_ease_both]">
                <p className="text-xs font-bold text-text-custom text-center">
                  Você está buscando uma oportunidade pra trabalhar no digital atuando nos bastidores, sem precisar ser o rosto do negócio?
                </p>
                <div className="grid grid-cols-1 gap-2.5">
                  {['Sim', 'Ainda não tenho certeza', 'Não'].map((opt) => (
                    <button
                      key={opt}
                      onClick={() => {
                        setBastidoresAnswers({ ...bastidoresAnswers, etapa1_qualif: opt })
                        if (opt === 'Não') {
                          setPoliteExit(true)
                        } else {
                          handleNextStep()
                        }
                      }}
                      className="w-full py-2.5 border border-border-custom hover:border-green-custom hover:bg-green-bg/5 font-semibold text-text-custom rounded-lg text-xs transition-all"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
                <p className="text-xs font-bold text-text-custom">
                  O que mais te motiva a entrar pro digital agora?
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    'Mudar de carreira',
                    'Ganhar uma renda extra',
                    'Já trabalho com isso e quero evoluir',
                    'Quero ter mais liberdade de tempo e local'
                  ].map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setBastidoresAnswers({ ...bastidoresAnswers, etapa2_motivacao: option })
                        handleNextStep()
                      }}
                      className={`w-full py-2.5 border rounded-lg text-left px-4 text-xs font-semibold transition-all ${
                        bastidoresAnswers.etapa2_motivacao === option
                          ? 'border-green-custom bg-green-bg/10 text-green-t'
                          : 'border-border-custom hover:border-text-custom text-text-custom'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
                <p className="text-xs font-bold text-text-custom">
                  Hoje você:
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    'Está empregado(a) CLT',
                    'Tem um negócio próprio fora do digital',
                    'Está sem ocupação fixa',
                    'Já trabalha com algo digital'
                  ].map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setBastidoresAnswers({ ...bastidoresAnswers, etapa3_situacao: option })
                        handleNextStep()
                      }}
                      className={`w-full py-2.5 border rounded-lg text-left px-4 text-xs font-semibold transition-all ${
                        bastidoresAnswers.etapa3_situacao === option
                          ? 'border-green-custom bg-green-bg/10 text-green-t'
                          : 'border-border-custom hover:border-text-custom text-text-custom'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-text-custom">
                    Quais dessas ferramentas você já usou, mesmo que pouco?
                  </p>
                  <p className="text-[10px] text-text3">Selecione todas as opções aplicáveis (+1 ponto cada, máx. 4)</p>
                </div>
                
                <div className="grid grid-cols-1 gap-2">
                  {[
                    'Canva',
                    'Planilhas (Excel ou Sheets)',
                    'Gerenciador de anúncios (Meta ou Google Ads)',
                    'Editor de vídeo (CapCut, Premiere, etc.)',
                    'CRM ou sistema de gestão',
                    'Nenhuma dessas ainda'
                  ].map((option) => {
                    const isSelected = bastidoresAnswers.etapa4_ferramentas.includes(option)
                    return (
                      <div
                        key={option}
                        onClick={() => {
                          let list = [...bastidoresAnswers.etapa4_ferramentas]
                          if (option === 'Nenhuma dessas ainda') {
                            list = ['Nenhuma dessas ainda']
                          } else {
                            list = list.filter(x => x !== 'Nenhuma dessas ainda')
                            if (isSelected) {
                              list = list.filter((i) => i !== option)
                            } else {
                              list.push(option)
                            }
                          }
                          setBastidoresAnswers({ ...bastidoresAnswers, etapa4_ferramentas: list })
                        }}
                        className={`w-full py-2.5 border rounded-lg text-left px-4 text-xs font-semibold transition-all flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? 'border-green-custom bg-green-bg/10 text-green-t'
                            : 'border-border-custom hover:border-text-custom text-text-custom'
                        }`}
                      >
                        <span>{option}</span>
                        <div className={`w-3.5 h-3.5 border rounded flex items-center justify-center shrink-0 ${isSelected ? 'bg-green-custom border-green-custom text-white' : 'border-border2'}`}>
                          {isSelected && <Check className="w-2.5 h-2.5" />}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <button
                  onClick={handleNextStep}
                  disabled={bastidoresAnswers.etapa4_ferramentas.length === 0}
                  className="w-full py-2.5 bg-text-custom text-bg font-bold rounded-lg text-xs hover:opacity-95 transition-opacity disabled:opacity-45"
                >
                  Continuar
                </button>
              </div>
            )}

            {currentStep === 5 && (
              <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
                <p className="text-xs font-bold text-text-custom">
                  Você já atuou, mesmo informalmente, nas áreas operacionais?
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    'Já trabalhei nisso profissionalmente (4)',
                    'Já fiz como hobby ou freelance ocasional (3)',
                    'Já estudei mas nunca executei na prática (2)',
                    'Nunca tive contato (1)'
                  ].map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setBastidoresAnswers({ ...bastidoresAnswers, etapa5_historico: option })
                        handleNextStep()
                      }}
                      className={`w-full py-2.5 border rounded-lg text-left px-4 text-xs font-semibold transition-all ${
                        bastidoresAnswers.etapa5_historico === option
                          ? 'border-green-custom bg-green-bg/10 text-green-t'
                          : 'border-border-custom hover:border-text-custom text-text-custom'
                      }`}
                    >
                      {option.split(' (')[0]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 6 && (
              <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
                <p className="text-xs font-bold text-text-custom">
                  Você já investiu em algum curso, mentoria ou formação na área digital?
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    'Sim, mais de uma (4)',
                    'Sim, uma formação (3)',
                    'Não, mas pretendo (2)',
                    'Não, nunca investi (1)'
                  ].map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setBastidoresAnswers({ ...bastidoresAnswers, etapa6_formacao: option })
                        handleNextStep()
                      }}
                      className={`w-full py-2.5 border rounded-lg text-left px-4 text-xs font-semibold transition-all ${
                        bastidoresAnswers.etapa6_formacao === option
                          ? 'border-green-custom bg-green-bg/10 text-green-t'
                          : 'border-border-custom hover:border-text-custom text-text-custom'
                      }`}
                    >
                      {option.split(' (')[0]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 7 && (
              <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
                <p className="text-xs font-bold text-text-custom">
                  Qual área dos bastidores mais te atrai hoje?
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    'Tráfego pago',
                    'Social media e conteúdo',
                    'Copywriting',
                    'Edição de vídeo',
                    'Gestão de projetos e atendimento',
                    'Não sei ainda, quero descobrir'
                  ].map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setBastidoresAnswers({ ...bastidoresAnswers, etapa7_area: option })
                        handleNextStep()
                      }}
                      className={`w-full py-2.5 border rounded-lg text-left px-4 text-xs font-semibold transition-all ${
                        bastidoresAnswers.etapa7_area === option
                          ? 'border-green-custom bg-green-bg/10 text-green-t'
                          : 'border-border-custom hover:border-text-custom text-text-custom'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 8 && (
              <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
                <p className="text-xs font-bold text-text-custom">
                  Quantas horas por semana você consegue dedicar a aprender e atuar no digital hoje?
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    'Mais de 30h, tempo integral (4)',
                    '15h a 30h (3)',
                    '5h a 15h (2)',
                    'Menos de 5h (1)'
                  ].map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setBastidoresAnswers({ ...bastidoresAnswers, etapa8_tempo: option })
                        handleNextStep()
                      }}
                      className={`w-full py-2.5 border rounded-lg text-left px-4 text-xs font-semibold transition-all ${
                        bastidoresAnswers.etapa8_tempo === option
                          ? 'border-green-custom bg-green-bg/10 text-green-t'
                          : 'border-border-custom hover:border-text-custom text-text-custom'
                      }`}
                    >
                      {option.split(' (')[0]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 9 && (
              <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
                <p className="text-xs font-bold text-text-custom">
                  Você precisa gerar retorno financeiro com isso em quanto tempo?
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    'Preciso de retorno imediato, em até 1 mês',
                    'Posso esperar de 2 a 3 meses',
                    'Posso investir tempo sem pressa de retorno imediato'
                  ].map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setBastidoresAnswers({ ...bastidoresAnswers, etapa9_urgencia: option })
                        handleNextStep()
                      }}
                      className={`w-full py-2.5 border rounded-lg text-left px-4 text-xs font-semibold transition-all ${
                        bastidoresAnswers.etapa9_urgencia === option
                          ? 'border-green-custom bg-green-bg/10 text-green-t'
                          : 'border-border-custom hover:border-text-custom text-text-custom'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 10 && (
              <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
                <p className="text-xs font-bold text-text-custom">
                  Como você se organiza pra cumprir compromissos sem ter um chefe cobrando?
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    'Sou bem disciplinado(a), já trabalhei ou estudei remoto antes (4)',
                    'Me organizo bem, mas nunca testei sem supervisão (3)',
                    'Tenho dificuldade de manter rotina sozinho(a) (2)'
                  ].map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setBastidoresAnswers({ ...bastidoresAnswers, etapa10_disciplina: option })
                        handleNextStep()
                      }}
                      className={`w-full py-2.5 border rounded-lg text-left px-4 text-xs font-semibold transition-all ${
                        bastidoresAnswers.etapa10_disciplina === option
                          ? 'border-green-custom bg-green-bg/10 text-green-t'
                          : 'border-border-custom hover:border-text-custom text-text-custom'
                      }`}
                    >
                      {option.split(' (')[0]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 11 && (
              <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
                <p className="text-xs font-bold text-text-custom">
                  Você tem disponibilidade pra investir em uma formação ou mentoria pra acelerar essa entrada no digital?
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    'Sim, já tenho orçamento separado (4)',
                    'Sim, mas precisaria me planejar (3)',
                    'Não tenho condição agora (2)'
                  ].map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setBastidoresAnswers({ ...bastidoresAnswers, etapa11_investimento: option })
                        handleNextStep()
                      }}
                      className={`w-full py-2.5 border rounded-lg text-left px-4 text-xs font-semibold transition-all ${
                        bastidoresAnswers.etapa11_investimento === option
                          ? 'border-green-custom bg-green-bg/10 text-green-t'
                          : 'border-border-custom hover:border-text-custom text-text-custom'
                      }`}
                    >
                      {option.split(' (')[0]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 12 && (
              <div className="space-y-4 animate-[fadeUp_0.15s_ease_both]">
                <div className="text-center space-y-1">
                  <h4 className="text-xs font-bold text-green-t bg-green-bg px-2.5 py-1 rounded inline-block">Você está a um passo do seu diagnóstico!</h4>
                  <p className="text-[10px] text-text3">Preencha seus dados reais para gerarmos seu nível de maturidade nos bastidores.</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[9px] font-bold text-text2 block mb-1">Nome Completo</label>
                    <input
                      className="w-full px-3 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={bastidoresAnswers.leadNome}
                      onChange={(e) => setBastidoresAnswers({ ...bastidoresAnswers, leadNome: e.target.value })}
                      placeholder="Seu nome"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-text2 block mb-1">WhatsApp</label>
                    <input
                      className="w-full px-3 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={bastidoresAnswers.leadWhatsapp}
                      onChange={(e) => setBastidoresAnswers({ ...bastidoresAnswers, leadWhatsapp: e.target.value })}
                      placeholder="(DD) 99999-9999"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-text2 block mb-1">E-mail corporativo</label>
                    <input
                      type="email"
                      className="w-full px-3 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={bastidoresAnswers.leadEmail}
                      onChange={(e) => setBastidoresAnswers({ ...bastidoresAnswers, leadEmail: e.target.value })}
                      placeholder="exemplo@empresa.com"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-text2 block mb-1">Instagram (@usuario - Opcional)</label>
                    <input
                      className="w-full px-3 py-1.5 text-xs border border-border2 rounded bg-surface text-text-custom outline-none"
                      value={bastidoresAnswers.leadInstagram}
                      onChange={(e) => setBastidoresAnswers({ ...bastidoresAnswers, leadInstagram: e.target.value })}
                      placeholder="@seu_perfil"
                    />
                  </div>

                  <div
                    onClick={() => setBastidoresAnswers({ ...bastidoresAnswers, lgpdConsent: !bastidoresAnswers.lgpdConsent })}
                    className="flex items-start gap-2.5 pt-1 cursor-pointer select-none"
                  >
                    <div className={`w-3.5 h-3.5 border rounded flex items-center justify-center shrink-0 mt-0.5 ${bastidoresAnswers.lgpdConsent ? 'bg-green-custom border-green-custom text-white' : 'border-border2'}`}>
                      {bastidoresAnswers.lgpdConsent && <Check className="w-2.5 h-2.5" />}
                    </div>
                    <span className="text-[9px] text-text2 leading-normal">
                      Autorizo o processamento dos meus dados para envio de diagnóstico estratégico e contato da equipe da Agência B16.
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleBastidoresSubmit}
                  disabled={!bastidoresAnswers.leadNome || !bastidoresAnswers.leadWhatsapp || !bastidoresAnswers.leadEmail || !bastidoresAnswers.lgpdConsent}
                  className="w-full py-2.5 bg-text-custom text-bg font-bold rounded-lg text-xs hover:opacity-95 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Ver meu Nível de Maturidade</span>
                </button>
              </div>
            )}

            {currentStep === 13 && (() => {
              const res = getBastidoresResult()
              return (
                <div className="space-y-5 animate-[fadeUp_0.25s_ease_both]">
                  <div className="text-center space-y-1.5 border-b border-border-custom pb-4">
                    <Award className="w-8 h-8 text-green-custom mx-auto" />
                    <h3 className="text-sm font-bold text-text-custom">Resultado dos Bastidores</h3>
                    <p className="text-[10px] text-text3">Diagnóstico Baseado em Autodisciplina, Ferramentas e Disponibilidade</p>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-surface2 border border-border-custom p-4 rounded-xl space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-text2 uppercase tracking-wide">Nível de Maturidade:</span>
                        <span className={`text-[10px] font-bold border px-2 py-0.5 rounded uppercase ${res.ratingColor}`}>
                          {res.levelName} ({res.totalScore} pts)
                        </span>
                      </div>
                      <p className="text-[10px] text-text-custom leading-relaxed">
                        <strong>Foco estratégico recomendado:</strong> {res.focusText}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="border border-border-custom p-3.5 rounded-xl text-center space-y-1">
                        <span className="text-[8px] font-bold text-text3 uppercase block">Área Recomendada</span>
                        <span className="text-[11px] font-bold text-green-t bg-green-bg px-2 py-0.5 rounded-full inline-block truncate max-w-full">
                          {res.recommendedArea}
                        </span>
                      </div>
                      <div className="border border-border-custom p-3.5 rounded-xl text-center space-y-1">
                        <span className="text-[8px] font-bold text-text3 uppercase block">Curva de Aprendizagem</span>
                        <span className="text-[11px] font-bold text-blue-t bg-blue-bg px-2 py-0.5 rounded-full inline-block">
                          {res.learningCurve}
                        </span>
                      </div>
                    </div>

                    <div className="border border-border-custom p-4 rounded-xl space-y-2">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-green-custom" />
                        <span className="text-[10px] font-bold text-text-custom uppercase tracking-wide">Plano de Próximos Passos (Urgência):</span>
                      </div>
                      <p className="text-[10px] text-text2 leading-relaxed">
                        {res.nextStepSuggestion}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-border-custom space-y-2.5">
                    <button
                      onClick={() => router.push('/login?state=ativar')}
                      className="w-full py-2.5 bg-text-custom text-bg font-bold rounded-lg text-xs hover:bg-text-custom/90 transition-colors shadow-sm flex items-center justify-center gap-1.5"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Criar minha conta no Clave para salvar diagnóstico</span>
                    </button>
                    <button
                      onClick={handleBackToSelect}
                      className="w-full py-2 border border-border2 text-[10px] text-text2 hover:text-text-custom rounded-lg transition-colors"
                    >
                      Refazer outro perfil
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* ==========================================
            VIEW: POLITE EXIT SCREEN
            ========================================== */}
        {politeExit && (
          <div className="bg-surface border border-border-custom rounded-2xl p-6 sm:p-8 shadow-md text-center space-y-5 animate-[fadeUp_0.25s_ease_both]">
            <div className="w-12 h-12 rounded-full bg-red-bg text-red-t flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-bold text-text-custom">Diagnóstico Encerrado</h3>
              <p className="text-xs text-text2 max-w-sm mx-auto leading-relaxed">
                Entendido! O mercado digital é repleto de possibilidades e cada um tem seu próprio tempo.
              </p>
              <p className="text-[10px] text-text3 max-w-xs mx-auto">
                Recomendamos acompanhar nossos conteúdos educativos e estratégicos no Instagram da Agência B16 para continuar aprendendo até estar pronto(a) para ser lançado(a).
              </p>
            </div>
            <div className="pt-3 border-t border-border-custom space-y-2">
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 bg-text-custom text-bg font-bold rounded-lg text-xs hover:opacity-95 transition-opacity block"
              >
                Acompanhar no Instagram
              </a>
              <button
                onClick={handleBackToSelect}
                className="w-full py-2 border border-border2 text-[10px] text-text2 hover:text-text-custom rounded-lg transition-colors"
              >
                Voltar ao início do diagnóstico
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
