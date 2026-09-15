'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useAppStore } from '@/store/useAppStore'
import { Copy, Save } from 'lucide-react'

export type PlanningMode = 'info' | 'commerce'
export interface PlanningData {
  mode: PlanningMode
  info: Record<string, number>
  commerce: Record<string, number>
  actuals: Array<{ period: string; spend: number; leads: number; sales: number; revenue: number }>
}

export const defaultPlanningData = (): PlanningData => ({
  mode: 'info',
  info: { ticket: 20000, revenueGoal: 100000, budget: 5000, cpl: 100, margin: 40, taxes: 0, commissions: 0, variablePerSale: 0, extraAcquisition: 0, maxCac: 3000, minRoas: 4, conversion: 5, qualified: 0, scheduled: 0, attended: 0, closed: 0 },
  commerce: { grossTicket: 600, discount: 10, productCost: 60, freight: 10, packaging: 0, gatewayPct: 4, gatewayFixed: 0, marketplacePct: 0, sellerPct: 10, taxesPct: 8, cashbackPct: 0, otherVariable: 0, targetMargin: 50, currentCpa: 50, plannedCpa: 30, mediaTaxPct: 12, budget: 10000, revenueGoal: 60000, salesGoal: 100, profitGoal: 10000, ltv: 0, ltvAcquisitionPct: 0 },
  actuals: Array.from({ length: 4 }, (_, index) => ({ period: `Semana ${index + 1}`, spend: 0, leads: 0, sales: 0, revenue: 0 })),
})

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const number = (value: number, digits = 1) => Number.isFinite(value) ? value.toLocaleString('pt-BR', { maximumFractionDigits: digits }) : '—'
const pct = (value: number) => `${number(value, 1)}%`
const safe = (value: number) => Number.isFinite(value) ? value : 0

function Field({ label, value, onChange, suffix }: { label: string; value: number; onChange: (value: number) => void; suffix?: string }) {
  return <label className="space-y-1"><span className="text-[10px] font-bold text-text2 block">{label}</span><div className="relative"><input type="number" value={value} onChange={(event) => onChange(+event.target.value)} className="w-full px-3 py-2 pr-10 border border-border2 rounded-lg bg-surface text-text-custom text-xs outline-none focus:border-text3" />{suffix && <span className="absolute right-3 top-2 text-[10px] text-text3">{suffix}</span>}</div></label>
}

function Metric({ label, value, tone = 'normal', note }: { label: string; value: string; tone?: 'normal' | 'good' | 'warn' | 'bad'; note?: string }) {
  const colors = tone === 'good' ? 'border-green-custom/30 bg-green-bg' : tone === 'warn' ? 'border-amber-t/30 bg-amber-bg' : tone === 'bad' ? 'border-red-t/30 bg-red-bg' : 'border-border-custom bg-surface'
  return <div className={`rounded-xl border p-4 ${colors}`}><p className="text-[10px] font-bold uppercase tracking-wide text-text3">{label}</p><p className="text-xl font-bold text-text-custom mt-1">{value}</p>{note && <p className="text-[10px] text-text2 mt-1">{note}</p>}</div>
}

export default function FinancialPlanningWorkspace({ projectId, projectName, initialData, publicPassword, onPublicSave }: { projectId: string; projectName: string; initialData?: PlanningData; publicPassword?: string; onPublicSave?: (data: PlanningData, password: string) => Promise<void> }) {
  const supabase = createClient()
  const { showToast } = useAppStore()
  const [data, setData] = useState<PlanningData>(initialData || defaultPlanningData())
  const [view, setView] = useState<'dashboard' | 'inputs' | 'scenarios' | 'sensitivity' | 'actuals'>('dashboard')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (initialData || !projectId) return
    supabase.from('text_fields').select('value').eq('project_id', projectId).eq('key', 'native-financial-planning').maybeSingle().then(({ data: row }) => {
      if (row?.value) try { setData({ ...defaultPlanningData(), ...JSON.parse(row.value) }) } catch { /* keep defaults */ }
    })
  }, [projectId, initialData, supabase])

  const info = useMemo(() => {
    const p = data.info, detailed = [p.qualified, p.scheduled, p.attended, p.closed].every((v) => v > 0)
    const conversion = detailed ? (p.qualified * p.scheduled * p.attended * p.closed) / 100000000 : p.conversion / 100
    const salesNeeded = Math.ceil(safe(p.revenueGoal / p.ticket)), leadsNeeded = Math.ceil(safe(salesNeeded / conversion))
    const maxCac = Math.min(p.maxCac || Infinity, p.minRoas ? p.ticket / p.minRoas : Infinity)
    const maxCpl = safe(maxCac * conversion), projectedLeads = safe(p.budget / p.cpl), projectedSales = projectedLeads * conversion
    const projectedRevenue = projectedSales * p.ticket, projectedCac = safe(p.budget / projectedSales), roas = safe(projectedRevenue / p.budget)
    const profit = projectedRevenue * (p.margin / 100) - projectedRevenue * ((p.taxes + p.commissions) / 100) - projectedSales * (p.variablePerSale + p.extraAcquisition) - p.budget
    return { conversion, salesNeeded, leadsNeeded, investmentNeeded: leadsNeeded * p.cpl, maxCac, maxCpl, projectedLeads, projectedSales, projectedRevenue, projectedCac, roas, profit }
  }, [data.info])

  const commerce = useMemo(() => {
    const p = data.commerce, netTicket = p.grossTicket * (1 - p.discount / 100)
    const variable = p.productCost + p.freight + p.packaging + p.gatewayFixed + p.otherVariable + netTicket * ((p.gatewayPct + p.marketplacePct + p.sellerPct + p.taxesPct + p.cashbackPct) / 100)
    const contribution = netTicket - variable, breakEvenCpa = safe(contribution / (1 + p.mediaTaxPct / 100))
    const recommendedCpa = safe(Math.max(0, contribution - netTicket * p.targetMargin / 100) / (1 + p.mediaTaxPct / 100))
    const effectiveCpa = p.currentCpa * (1 + p.mediaTaxPct / 100), profitPerSale = contribution - effectiveCpa
    const plannedProfit = contribution - p.plannedCpa * (1 + p.mediaTaxPct / 100)
    const salesNeeded = Math.ceil(safe(p.revenueGoal / netTicket)), investmentNeeded = salesNeeded * p.plannedCpa
    return { netTicket, variable, contribution, breakEvenCpa, recommendedCpa, profitPerSale, plannedProfit, margin: safe(profitPerSale / netTicket * 100), roas: safe(netTicket / p.currentCpa), salesNeeded, investmentNeeded, ltvCpa: p.ltv * p.ltvAcquisitionPct / 100 }
  }, [data.commerce])

  const update = (section: 'info' | 'commerce', key: string, value: number) => setData((current) => ({ ...current, [section]: { ...current[section], [key]: value } }))
  const save = async () => {
    setSaving(true)
    try {
      if (onPublicSave) await onPublicSave(data, publicPassword || '')
      else {
        const { error } = await supabase.from('text_fields').upsert({ project_id: projectId, key: 'native-financial-planning', value: JSON.stringify(data) }, { onConflict: 'project_id,key' })
        if (error) throw error
      }
      showToast('Planejamento salvo!')
    } catch (error) { showToast(error instanceof Error ? error.message : 'Erro ao salvar', 'err') } finally { setSaving(false) }
  }

  const publicUrl = typeof window !== 'undefined' ? `${window.location.origin}/planejamento/${projectId}` : ''
  const p = data.mode === 'info' ? data.info : data.commerce
  return <div className="space-y-5">
    <div className="bg-surface border border-border-custom rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
      <div><h3 className="text-base font-bold text-text-custom">Planejamento de mídia — {projectName}</h3><p className="text-xs text-text2 mt-1">Calculadoras, metas e acompanhamento integrados ao projeto.</p></div>
      <div className="flex gap-2"><button onClick={() => navigator.clipboard.writeText(publicUrl)} className="px-3 py-2 border border-border2 rounded-lg text-xs font-semibold flex items-center gap-2"><Copy className="w-3.5 h-3.5" /> Link público</button><button onClick={save} disabled={saving} className="px-3 py-2 bg-text-custom text-surface rounded-lg text-xs font-bold flex items-center gap-2"><Save className="w-3.5 h-3.5" /> {saving ? 'Salvando...' : 'Salvar'}</button></div>
    </div>
    <div className="flex flex-wrap gap-2"><button onClick={() => setData((d) => ({ ...d, mode: 'info' }))} className={`px-4 py-2 rounded-lg text-xs font-bold ${data.mode === 'info' ? 'bg-green-custom text-white' : 'bg-surface border border-border2 text-text2'}`}>Infoproduto</button><button onClick={() => setData((d) => ({ ...d, mode: 'commerce' }))} className={`px-4 py-2 rounded-lg text-xs font-bold ${data.mode === 'commerce' ? 'bg-green-custom text-white' : 'bg-surface border border-border2 text-text2'}`}>Negócios locais & E-commerce</button></div>
    <div className="flex gap-1 border-b border-border-custom overflow-x-auto">{([['dashboard','Visão geral'],['inputs','Premissas'],['scenarios','Cenários'],['sensitivity','Sensibilidade'],['actuals','Planejado × realizado']] as const).map(([id,label]) => <button key={id} onClick={() => setView(id)} className={`px-3 py-2 text-xs font-semibold whitespace-nowrap border-b-2 ${view === id ? 'border-text-custom text-text-custom' : 'border-transparent text-text2'}`}>{label}</button>)}</div>

    {view === 'dashboard' && <div className="space-y-4"><div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{data.mode === 'info' ? <><Metric label="Vendas para a meta" value={number(info.salesNeeded,0)} /><Metric label="Leads necessários" value={number(info.leadsNeeded,0)} /><Metric label="Investimento necessário" value={money(info.investmentNeeded)} /><Metric label="CPL máximo" value={money(info.maxCpl)} tone={p.cpl <= info.maxCpl ? 'good' : 'bad'} /><Metric label="Faturamento projetado" value={money(info.projectedRevenue)} /><Metric label="CAC projetado" value={money(info.projectedCac)} tone={info.projectedCac <= info.maxCac ? 'good' : 'bad'} /><Metric label="ROAS projetado" value={`${number(info.roas,2)}x`} tone={info.roas >= data.info.minRoas ? 'good' : 'warn'} /><Metric label="Resultado projetado" value={money(info.profit)} tone={info.profit >= 0 ? 'good' : 'bad'} /></> : <><Metric label="Ticket líquido" value={money(commerce.netTicket)} /><Metric label="Custo variável/venda" value={money(commerce.variable)} /><Metric label="CPA recomendado" value={money(commerce.recommendedCpa)} tone={p.currentCpa <= commerce.recommendedCpa ? 'good' : 'warn'} /><Metric label="CPA break-even" value={money(commerce.breakEvenCpa)} /><Metric label="Lucro/venda" value={money(commerce.profitPerSale)} tone={commerce.profitPerSale >= 0 ? 'good' : 'bad'} /><Metric label="Margem atual" value={pct(commerce.margin)} /><Metric label="Vendas para a meta" value={number(commerce.salesNeeded,0)} /><Metric label="Investimento para a meta" value={money(commerce.investmentNeeded)} /></>}</div><div className="bg-surface border border-border-custom rounded-xl p-5"><h4 className="text-xs font-bold text-text-custom">Leitura inteligente</h4><p className="text-xs text-text2 mt-2">{data.mode === 'info' ? (data.info.cpl > info.maxCpl ? `O CPL planejado está ${money(data.info.cpl - info.maxCpl)} acima do limite econômico. Priorize conversão ou ticket antes de escalar mídia.` : `O CPL está dentro do limite. Com o orçamento atual, a projeção é de ${number(info.projectedSales,1)} vendas e ${money(info.projectedRevenue)} em receita.`) : (data.commerce.currentCpa > commerce.breakEvenCpa ? 'O CPA atual ultrapassa o ponto de equilíbrio. Cada venda destrói margem antes dos custos fixos.' : data.commerce.currentCpa > commerce.recommendedCpa ? 'A operação ainda é positiva, mas o CPA atual comprime a margem desejada.' : 'O CPA atual preserva a margem desejada. Há espaço controlado para escala.')}</p></div></div>}

    {view === 'inputs' && <div className="bg-surface border border-border-custom rounded-xl p-5 grid grid-cols-2 lg:grid-cols-4 gap-4">{data.mode === 'info' ? <>{[['ticket','Ticket médio','R$'],['revenueGoal','Meta de faturamento','R$'],['budget','Orçamento de mídia','R$'],['cpl','CPL planejado','R$'],['margin','Margem base','%'],['taxes','Impostos','%'],['commissions','Comissões','%'],['variablePerSale','Custo variável/venda','R$'],['extraAcquisition','Aquisição extra/venda','R$'],['maxCac','CAC máximo','R$'],['minRoas','ROAS mínimo','x'],['conversion','Lead → venda','%'],['qualified','Lead → qualificado','%'],['scheduled','Qualificado → agenda','%'],['attended','Agenda → comparecimento','%'],['closed','Comparecimento → venda','%']].map(([k,l,s]) => <Field key={k} label={l} suffix={s} value={data.info[k]} onChange={(v) => update('info',k,v)} />)}</> : <>{[['grossTicket','Ticket bruto','R$'],['discount','Desconto médio','%'],['productCost','CMV / custo produto','R$'],['freight','Frete subsidiado','R$'],['packaging','Embalagem','R$'],['gatewayPct','Gateway','%'],['gatewayFixed','Gateway fixo','R$'],['marketplacePct','Marketplace','%'],['sellerPct','Comissão vendedor','%'],['taxesPct','Impostos','%'],['cashbackPct','Cashback','%'],['otherVariable','Outros variáveis','R$'],['targetMargin','Margem desejada','%'],['currentCpa','CPA atual','R$'],['plannedCpa','CPA planejado','R$'],['mediaTaxPct','Encargos sobre mídia','%'],['budget','Orçamento mensal','R$'],['revenueGoal','Meta faturamento','R$'],['salesGoal','Meta vendas',''],['profitGoal','Meta lucro','R$'],['ltv','LTV médio','R$'],['ltvAcquisitionPct','LTV para aquisição','%']].map(([k,l,s]) => <Field key={k} label={l} suffix={s} value={data.commerce[k]} onChange={(v) => update('commerce',k,v)} />)}</>}</div>}

    {view === 'scenarios' && <div className="grid md:grid-cols-3 gap-4">{[0.8,1,1.2].map((factor,index) => { const label=['Conservador','Realista','Otimista'][index]; const revenue=data.mode==='info'?info.projectedRevenue*factor:commerce.netTicket*(data.commerce.budget/(data.commerce.plannedCpa/factor)); const result=data.mode==='info'?info.profit*factor:(commerce.plannedProfit*(data.commerce.budget/(data.commerce.plannedCpa/factor))); return <div key={factor} className="bg-surface border border-border-custom rounded-xl p-5"><h4 className="text-sm font-bold text-text-custom">{label}</h4><p className="text-2xl font-bold mt-4">{money(revenue)}</p><p className="text-[10px] text-text3">receita projetada</p><p className={`text-sm font-bold mt-4 ${result>=0?'text-green-t':'text-red-t'}`}>{money(result)} resultado</p></div>})}</div>}

    {view === 'sensitivity' && <div className="bg-surface border border-border-custom rounded-xl p-5 overflow-x-auto"><h4 className="text-sm font-bold text-text-custom mb-4">Sensibilidade operacional</h4><table className="w-full text-xs"><thead><tr><th className="text-left p-2">{data.mode==='info'?'CPL / Conversão':'CPA / Vendas'}</th>{[2,3,5,7,10].map(v=><th key={v} className="p-2">{data.mode==='info'?`${v}%`:`${v*20}`}</th>)}</tr></thead><tbody>{[50,75,100,150,200].map(cost=><tr key={cost} className="border-t border-border-custom"><td className="p-2 font-bold">{money(cost)}</td>{[2,3,5,7,10].map(v=><td key={v} className="p-2 text-center">{data.mode==='info'?money(cost/(v/100)):money((commerce.netTicket-commerce.variable-cost*(1+data.commerce.mediaTaxPct/100))*(v*20))}</td>)}</tr>)}</tbody></table></div>}

    {view === 'actuals' && <div className="bg-surface border border-border-custom rounded-xl p-5 overflow-x-auto"><table className="w-full text-xs min-w-[720px]"><thead><tr className="text-left"><th className="p-2">Período</th><th>Investimento</th><th>Leads</th><th>Vendas</th><th>Receita</th><th>CPL</th><th>CAC</th><th>ROAS</th></tr></thead><tbody>{data.actuals.map((row,index)=><tr key={index} className="border-t border-border-custom"><td className="p-2"><input value={row.period} onChange={e=>setData(d=>({...d,actuals:d.actuals.map((r,i)=>i===index?{...r,period:e.target.value}:r)}))} className="bg-transparent" /></td>{(['spend','leads','sales','revenue'] as const).map(k=><td key={k}><input type="number" value={row[k]} onChange={e=>setData(d=>({...d,actuals:d.actuals.map((r,i)=>i===index?{...r,[k]:+e.target.value}:r)}))} className="w-24 bg-bg border border-border2 rounded px-2 py-1" /></td>)}<td>{money(safe(row.spend/row.leads))}</td><td>{money(safe(row.spend/row.sales))}</td><td>{number(safe(row.revenue/row.spend),2)}x</td></tr>)}</tbody></table></div>}
  </div>
}
