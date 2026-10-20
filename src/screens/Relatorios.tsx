import { useEffect, useMemo, useState } from 'react'
import type { Atendimento } from '../lib/domain'
import { normPlaca } from '../lib/domain'
import { fData } from '../lib/format'
import { csv, delta, fmtCard, PERIODOS, range, rangeAnterior, relatorio, TIPOS, type Tabela } from '../lib/relatorios'
import { SEL_LISTA, useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { Ic, Nav, Plate, Seg, Section, useSheet } from '../ui/ui'
import { useNav } from './comum'

const hojeStr = (off = 0) => { const d = new Date(Date.now() - 4 * 36e5 + off * 864e5); return d.toISOString().slice(0, 10) }

async function carregarTudo(): Promise<Atendimento[]> {
  const out: Atendimento[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from('atendimentos').select(SEL_LISTA).order('entrada').range(de, de + 999)
    if (error) throw error
    out.push(...((data ?? []) as unknown as Atendimento[]))
    if (!data || data.length < 1000) return out
  }
}

function TabelaRel({ t }: { t: Tabela }) {
  const nav = useNav()
  if (!t.rows.length) return <div className="group"><div className="empty">Sem registros no período.</div></div>
  return <div className="tblwrap"><table><thead><tr>{t.cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
    <tbody>{t.rows.map((r, i) => <tr key={i} style={t.ids || t.locIds ? { cursor: 'pointer' } : undefined}
      onClick={() => t.ids ? nav.push({ r: 'at', id: t.ids[i] }) : t.locIds ? nav.push({ r: 'loc', id: t.locIds[i] }) : undefined}>
      {r.map((c, j) => <td key={j} style={/^[+−]\d/.test(String(c)) ? { color: String(c)[0] === '+' ? 'var(--green)' : 'var(--red)' } : undefined}>
        {t.placaCol === j ? <Plate p={String(c)} /> : c}</td>)}</tr>)}</tbody></table></div>
}

export function Relatorios() {
  const store = useStore(); const sheet = useSheet()
  const [todos, setTodos] = useState<Atendimento[] | null>(null)
  const [erro, setErro] = useState('')
  const [tipo, setTipo] = useState('ger'); const [per, setPer] = useState('mes'); const [meses, setMeses] = useState<'6' | '12'>('6')
  const [ci, setCi] = useState(hojeStr(-7)); const [cf, setCf] = useState(hojeStr())
  const [loc, setLoc] = useState(''); const [resp, setResp] = useState(''); const [q, setQ] = useState(''); const [arq, setArq] = useState(true)

  useEffect(() => { carregarTudo().then(setTodos).catch(e => setErro(String(e.message ?? e))) }, [store.versao])

  const A = useMemo(() => (todos ?? []).filter(a => (!loc || a.locadora_id === loc) && (!resp || a.responsavel === resp) && (arq || !a.arquivado)
    && (!q.trim() || (normPlaca(q).length >= 3 && a.placa.includes(normPlaca(q))) || `${a.placa} ${a.modelo} ${store.locNome(a.locadora_id)} ${a.os} ${a.protocolo} ${a.condutor} ${a.numero}`.toUpperCase().includes(q.toUpperCase().trim()))),
  [todos, loc, resp, arq, q, store])
  const rg = range(per, ci, cf), rgAnt = rangeAnterior(per, rg)
  const cur = useMemo(() => relatorio(tipo, A, rg, store.locadoras, { meses: +meses }), [tipo, A, rg[0], rg[1], store.locadoras, meses])
  const prev = useMemo(() => relatorio(tipo, A, rgAnt, store.locadoras, { meses: +meses }), [tipo, A, rgAnt[0], rgAnt[1], store.locadoras, meses])
  const titulo = 'Relatório de ' + TIPOS.find(t => t[0] === tipo)![1].toLowerCase()
  const periodo = `${fData(rg[0])} a ${fData(rg[1])}`
  const filtros = [loc ? 'Locadora: ' + store.locNome(loc) : 'Todas as locadoras', resp ? 'Responsável: ' + resp : 'Todos os responsáveis', q ? 'Busca: ' + q : '', arq ? 'Inclui arquivados' : 'Sem arquivados'].filter(Boolean).join('   ·   ')
  const nomeArq = `NETO-AUTO-CENTER_${TIPOS.find(t => t[0] === tipo)![1].replace(/\s+/g, '-')}_${periodo.replace(/\//g, '-').replace(' a ', '_a_')}`
  const resps = [...new Set((todos ?? []).map(a => a.responsavel).filter(Boolean))]

  async function pdf(): Promise<Blob> {
    const m = await import('../lib/pdf')
    return m.gerarPDF(cur, prev, { titulo, periodo, filtros, usuario: store.me?.nome ?? '', perfil: store.me?.perfil ?? '' })
  }
  async function acao(tp: 'enc' | 'pdf' | 'csv') {
    try {
      const m = await import('../lib/pdf')
      if (tp === 'csv') { m.baixar(new Blob([csv(titulo, periodo, cur)], { type: 'text/csv;charset=utf-8' }), nomeArq + '.csv'); sheet.toast('CSV baixado'); return }
      const blob = await pdf()
      if (tp === 'pdf') { m.baixar(blob, nomeArq + '.pdf'); sheet.toast('PDF baixado'); return }
      const r = await m.encaminhar(blob, nomeArq + '.pdf', titulo, `${titulo} da NETO AUTO CENTER (${periodo}).`)
      if (r === 'sem-suporte') { m.baixar(blob, nomeArq + '.pdf'); sheet.toast('Este aparelho não abre o compartilhar. O PDF foi baixado para você anexar.') }
      else if (r === 'ok') sheet.close()
    } catch (e) { sheet.toast('Não foi possível gerar o arquivo: ' + (e as Error).message) }
  }
  const exportar = () => sheet.open({ title: 'Exportar e encaminhar', body: <>
    <div className="group" style={{ marginBottom: 18 }}>
      <button type="button" className="row" onClick={() => acao('enc')}><span className="act" style={{ padding: 0, background: 'none' }}><span className="ib"><Ic n="out" /></span></span>
        <div className="rm"><b>Encaminhar PDF</b><span className="r2">WhatsApp, e-mail ou outro app, com o PDF anexado</span></div><Ic n="chev" className="chev" /></button>
      <button type="button" className="row" onClick={() => acao('pdf')}><span className="act" style={{ padding: 0, background: 'none' }}><span className="ib"><Ic n="archive" /></span></span>
        <div className="rm"><b>Baixar PDF</b><span className="r2">Salvar ou imprimir</span></div><Ic n="chev" className="chev" /></button>
      <button type="button" className="row" onClick={() => acao('csv')}><span className="act" style={{ padding: 0, background: 'none' }}><span className="ib"><Ic n="grid" /></span></span>
        <div className="rm"><b>Baixar planilha (CSV)</b><span className="r2">Abre direto no Excel</span></div><Ic n="chev" className="chev" /></button>
    </div>
    <p className="fnote">O PDF sai com o período, os filtros, o resumo e as tabelas da tela. No celular, use o app instalado na tela inicial para o Encaminhar abrir o menu de compartilhar.</p></> })

  return <>
    <Nav title="Relatórios" right={<button className="tbtn strong" onClick={exportar} disabled={!todos}><Ic n="out" sm /> PDF</button>} />
    <div className="stack">
      <Seg value={tipo} onChange={setTipo} options={TIPOS} />
      <Seg value={per} onChange={setPer} options={PERIODOS} />
      {per === 'custom' && <div className="toolbar" style={{ marginTop: 0 }}>
        <label className="muted sm">De <input type="date" id="ci" value={ci} onChange={e => setCi(e.target.value)} /></label>
        <label className="muted sm">até <input type="date" id="cf" value={cf} onChange={e => setCf(e.target.value)} /></label></div>}
      <div className="muted sm">{periodo}</div>
      <div className="toolbar" style={{ marginTop: 0 }}>
        <select id="rloc" value={loc} onChange={e => setLoc(e.target.value)} aria-label="Locadora"><option value="">Todas as locadoras</option>{store.locadoras.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select>
        <select id="rresp" value={resp} onChange={e => setResp(e.target.value)} aria-label="Responsável"><option value="">Todos os responsáveis</option>{resps.map(r => <option key={r}>{r}</option>)}</select>
        {tipo === 'mes' && <Seg value={meses} onChange={setMeses} options={[['6', '6 meses'], ['12', '12 meses']]} />}
        <label className="search" style={{ flex: '1 1 200px' }}><Ic n="search" sm /><input id="rq" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar placa, modelo, OS…" autoComplete="off" /></label>
        <label className="muted sm" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={arq} onChange={e => setArq(e.target.checked)} style={{ accentColor: 'var(--red)' }} /> Incluir arquivados</label>
      </div>
    </div>
    {erro ? <div className="banner">Não foi possível carregar os dados: {erro}</div> : !todos ? <div className="loading">Carregando o histórico…</div> : <>
      <Section title="Resumo" foot="Comparação com o período anterior de mesma duração. Os relatórios consultam o histórico completo, não só o pátio ativo.">
        <div className="tiles t4">{cur.cards.map(([l, v, f], i) => { const d = l.includes('(hoje)') ? { txt: 'situação atual' } : delta(v, prev.cards[i]?.[1] ?? null, f === 'd')
          return <div className="tile" key={l} style={{ cursor: 'default' }}><span className="tl">{l}</span><span className={`tv ${f !== 'n' ? 'money' : ''}`}>{fmtCard(v, f)}</span>
            <span className="tf">{d ? <span className={`delta ${d.bom === undefined ? '' : d.bom ? 'up' : 'dn'}`}>{d.txt}</span> : 'sem comparação'}</span></div> })}</div>
      </Section>
      {(cur.pre ?? []).map(t => <Section key={t.title} title={t.title}><TabelaRel t={t} /></Section>)}
      <Section title={`${cur.main.title} · ${cur.main.rows.length} linhas`}><TabelaRel t={cur.main} /></Section>
    </>}
  </>
}
