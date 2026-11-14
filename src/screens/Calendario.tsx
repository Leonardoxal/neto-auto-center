import { useEffect, useMemo, useState } from 'react'
import { brl, fData } from '../lib/format'
import { emCentavos, gradeDoMes, somaPorDia } from '../lib/gestao'
import { pegar } from '../lib/paginar'
import { hoje, numDoc, saldoParcela } from '../lib/receber'
import { carregar } from './Notas'
import { supabase, msgErro } from '../lib/supabase'
import { Nav, Section, Seg, Tile, useSheet } from '../ui/ui'

// Calendário de entrada: quando cada valor em aberto vence, por dia. Notas fiscais (locadoras) vêm do saldo das parcelas no site
// (acompanha as baixas); particulares vêm do último "A Receber, Em Aberto" do TGA. Atrasado = venceu e não entrou; não tem data certa de entrada.
interface Linha { documento: string; doc_numero: string; vencimento: string; valor_total: number; cliente_codigo: string; tipo_doc: string }
interface ClienteTga { codigo: string; nome: string; tipo: 'locadora' | 'particular' }
interface Item { data: string; centavos: number; cliente: string; tipo: 'locadora' | 'particular'; pv: string }
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const dia = (iso: string) => fData(iso + 'T12:00:00')
const compacto = (c: number) => { const v = c / 100; return v >= 1000 ? `${(v / 1000).toFixed(1).replace('.', ',')} mil` : String(Math.round(v)) }
const somar = (l: Item[]) => l.reduce((s, i) => s + i.centavos, 0)
const reais = (c: number) => brl(c / 100)

export function Calendario() {
  const sheet = useSheet()
  const d0 = hoje()
  const [dados, setDados] = useState<{ em: string; itens: Item[] } | 'vazio' | null>(null)
  const [erro, setErro] = useState('')
  const [ano, setAno] = useState(+d0.slice(0, 4)); const [mes0, setMes0] = useState(+d0.slice(5, 7) - 1)
  const [quem, setQuem] = useState<'todos' | 'locadora' | 'particular'>('todos')
  useEffect(() => {
    (async () => {
      // Locadoras (notas fiscais): saldo das parcelas no site, já com as baixas. Particulares: último Em Aberto do TGA.
      const notas = await carregar()
      const d = hoje()
      const doSite: Item[] = notas.flatMap(n => n.cancelada ? [] : n.parcelas.flatMap(p => {
        const s = saldoParcela(n, p)
        return s > 0.009 ? [{ data: p.vencimento, centavos: emCentavos(s), cliente: n.cliente, tipo: 'locadora' as const, pv: numDoc(n) }] : []
      }))
      const { data: imp, error } = await supabase.from('tga_importacoes').select('id,em').eq('relatorio', 'em_aberto').order('em', { ascending: false }).limit(1)
      if (error) throw new Error(error.message)
      let particulares: Item[] = [], em = d
      if (imp?.length) {
        em = imp[0].em
        const [clientes, linhas] = await Promise.all([
          pegar<ClienteTga>((a, b) => supabase.from('tga_clientes').select('codigo,nome,tipo').order('codigo').range(a, b)),
          pegar<Linha>((a, b) => supabase.from('tga_em_aberto').select('documento,doc_numero,vencimento,valor_total,cliente_codigo,tipo_doc').eq('importacao_id', imp[0].id).order('id').range(a, b))
        ])
        const C = new Map(clientes.map(c => [c.codigo, c]))
        particulares = linhas.filter(l => l.tipo_doc !== 'DV' && C.get(l.cliente_codigo)?.tipo === 'particular').map(l => {
          const c = C.get(l.cliente_codigo)!
          return { data: l.vencimento, centavos: emCentavos(+l.valor_total), cliente: c.nome || c.codigo, tipo: 'particular' as const, pv: l.doc_numero.replace(/^0+/, '') }
        })
      }
      const itens = [...doSite, ...particulares]
      if (!itens.length && !imp?.length) return setDados('vazio')
      setDados({ em, itens })
    })().catch(e => setErro(msgErro(e)))
  }, [])

  const itens = useMemo(() => dados && dados !== 'vazio' ? dados.itens.filter(i => quem === 'todos' || i.tipo === quem) : [], [dados, quem])
  const porDia = useMemo(() => somaPorDia(itens), [itens])
  const grade = useMemo(() => gradeDoMes(ano, mes0), [ano, mes0])
  const maximo = useMemo(() => Math.max(1, ...grade.flat().map(d => (d && d >= d0 ? porDia.get(d) ?? 0 : 0))), [grade, porDia, d0])

  const topo = <Nav title="Calendário" sub="Quando os valores em aberto vencem, por dia" />
  if (erro) return <>{topo}<div className="banner">{/tga_/.test(erro) ? 'Falta aplicar as atualizações 0015 e 0016 do banco no Supabase.' : erro}</div></>
  if (dados === null) return <>{topo}<div className="loading">Carregando…</div></>
  if (dados === 'vazio') return <>{topo}<div className="group"><div className="empty">Nenhum "A Receber, Em Aberto" importado ainda. Importe com scripts/importar-tga.mjs.</div></div></>

  const em7 = new Date(Date.parse(d0 + 'T12:00:00Z') + 7 * 864e5).toISOString().slice(0, 10)
  const vencidos = itens.filter(i => i.data < d0), proximos = itens.filter(i => i.data >= d0 && i.data <= em7)
  const doMes = itens.filter(i => i.data.slice(0, 7) === `${ano}-${String(mes0 + 1).padStart(2, '0')}` && i.data >= d0)
  const lista = (titulo: string, l: Item[]) => {
    const por = new Map<string, { cliente: string; centavos: number; n: number }>()
    for (const i of l) { const g = por.get(i.cliente) ?? por.set(i.cliente, { cliente: i.cliente, centavos: 0, n: 0 }).get(i.cliente)!; g.centavos += i.centavos; g.n++ }
    const rows = [...por.values()].sort((a, b) => b.centavos - a.centavos)
    sheet.open({ title: titulo, body: <>
      <div className="hint">{reais(somar(l))} em {l.length} título(s), {rows.length} cliente(s)</div>
      <div className="group">{rows.slice(0, 200).map(r => <div key={r.cliente} className="row" style={{ alignItems: 'flex-start' }}>
        <div className="rm"><div className="r1"><b>{r.cliente}</b></div><span className="r2">{r.n} título(s)</span></div>
        <div className="rr"><span className="big">{reais(r.centavos)}</span></div></div>)}</div></> })
  }
  const mover = (k: number) => { const d = new Date(Date.UTC(ano, mes0 + k, 1)); setAno(d.getUTCFullYear()); setMes0(d.getUTCMonth()) }

  return <>
    {topo}
    <div className="tiles t4">
      <Tile label="Vencido, ainda não entrou" value={reais(somar(vencidos))} money cls={vencidos.length ? 'crit' : ''} foot={`${vencidos.length} títulos`} onClick={() => lista('Vencidos, ainda não entraram', vencidos)} />
      <Tile label="Próximos 7 dias" value={reais(somar(proximos))} money foot={`${proximos.length} títulos`} onClick={() => lista('Vencem nos próximos 7 dias', proximos)} />
      <Tile label={`A vencer em ${MESES[mes0]}`} value={reais(somar(doMes))} money foot={`${doMes.length} títulos`} />
      <Tile label="Particulares: posição de" value={dia(dados.em.slice(0, 10))} foot="último Em Aberto do TGA; notas fiscais = site ao vivo" />
    </div>
    <div className="stack" style={{ marginTop: 16 }}>
      <Seg value={quem} onChange={setQuem} options={[['todos', 'Todos'], ['locadora', 'Notas fiscais'], ['particular', 'Particulares']]} />
      <div className="btnrow" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="btn ghost sm" onClick={() => mover(-1)} aria-label="Mês anterior">‹</button>
        <b style={{ textTransform: 'capitalize' }}>{MESES[mes0]} de {ano}</b>
        <button className="btn ghost sm" onClick={() => mover(1)} aria-label="Próximo mês">›</button>
      </div>
    </div>
    <Section title="Dias de entrada (pelo vencimento)" foot="Valor por dia = o que vence nesse dia. Dia sem número não tem vencimento em aberto. Toque num dia para ver os clientes.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4, textAlign: 'center' }}>
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((s, i) => <div key={i} className="muted sm">{s}</div>)}
        {grade.flat().map((d, i) => {
          if (!d) return <div key={i} />
          const c = porDia.get(d) ?? 0, futuro = d >= d0, hojeAqui = d === d0
          return <button key={d} disabled={!c} onClick={() => lista(`${dia(d)}${futuro ? '' : ' (vencido)'}`, itens.filter(x => x.data === d))}
            style={{ minHeight: 52, padding: '4px 2px', borderRadius: 8, border: hojeAqui ? '2px solid var(--red, #e11)' : '1px solid rgba(127,127,127,.25)',
              background: c ? `rgba(${futuro ? '40,160,90' : '225,60,60'}, ${0.12 + 0.5 * (c / maximo)})` : 'transparent', color: 'inherit', cursor: c ? 'pointer' : 'default', fontSize: 12, lineHeight: 1.2 }}>
            <div style={{ opacity: .7 }}>{+d.slice(8)}</div><div style={{ fontWeight: 600 }}>{c ? compacto(c) : ''}</div></button>
        })}
      </div>
    </Section>
  </>
}
