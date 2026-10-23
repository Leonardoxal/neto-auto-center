import { useEffect, useMemo, useState } from 'react'
import { FORMAS, dividir, hoje, numDoc, prazoTxt, recebidoParcela, resumoNota, saldoParcela, situacaoParcela, tomSit, type Nota, type Parcela, type Recebimento } from '../lib/receber'
import { brl, fData, fDataHora, numero } from '../lib/format'
import { useStore } from '../lib/store'
import { supabase, msgErro } from '../lib/supabase'
import type { NotaXML } from '../lib/xmlnotas'
import type { Relatorio } from '../lib/relatorios'
import { Field, Fg, Ic, Nav, Note, Plate, Section, Seg, Select, Tile, useSheet } from '../ui/ui'
import { useNav } from './comum'

const FMT = { day: '2-digit', month: '2-digit' } as const
const dm = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('pt-BR', { ...FMT, timeZone: 'UTC' })

async function carregar(): Promise<Nota[]> {
  const pegar = async (t: string, ordem: string) => {
    const out: Record<string, unknown>[] = []
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabase.from(t).select('*').order(ordem).range(de, de + 999)
      if (error) throw error
      out.push(...(data ?? [])); if (!data || data.length < 1000) return out
    }
  }
  const [ns, ps, rs] = await Promise.all([pegar('notas', 'emissao'), pegar('nota_parcelas', 'numero'), pegar('nota_recebimentos', 'criado_em')])
  const P = new Map<string, Parcela[]>(), R = new Map<string, Recebimento[]>()
  for (const p of ps as unknown as Parcela[]) (P.get(p.nota_id) ?? P.set(p.nota_id, []).get(p.nota_id)!).push(p)
  for (const r of rs as unknown as Recebimento[]) (R.get(r.nota_id) ?? R.set(r.nota_id, []).get(r.nota_id)!).push(r)
  return (ns as unknown as Nota[]).map(n => ({ ...n, parcelas: P.get(n.id) ?? [], recebimentos: R.get(n.id) ?? [] }))
}

// ---------- folhas ----------
function ReceberCorpo({ saldo, forma }: { saldo: number; forma: string }) {
  return <><Fg>
    <Field label="Data do recebimento"><input name="data" type="date" defaultValue={hoje()} /></Field>
    <Field label="Valor recebido"><input name="valor" inputMode="decimal" defaultValue={saldo.toFixed(2).replace('.', ',')} /></Field>
    <Field label="Forma"><Select name="forma" options={FORMAS} value={FORMAS.includes(forma) ? forma : 'PIX'} /></Field>
    <Field label="Observação" col><textarea name="obs" placeholder="Ex.: comprovante 1234, depósito Sicredi" /></Field></Fg>
    <Note>Pode receber parte do valor; o restante continua em aberto na mesma parcela.</Note></>
}

function ParcelasCorpo({ n, holder }: { n: Nota; holder: { linhas: { vencimento: string; valor: string; forma: string }[] } }) {
  const [L, setL] = useState(holder.linhas)
  const set = (v: typeof L) => { holder.linhas = v; setL(v) }
  const [qtd, setQtd] = useState('2'); const [int, setInt] = useState('30')
  const soma = L.reduce((s, l) => s + (numero(l.valor) ?? 0), 0), dif = Math.round((soma - +n.valor) * 100) / 100
  return <>
    <div className="group" style={{ marginBottom: 10 }}>{L.map((l, i) => <div key={i} className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <b style={{ width: 22 }}>{i + 1}ª</b>
      <input type="date" aria-label="Vencimento" value={l.vencimento} onChange={e => set(L.map((x, j) => j === i ? { ...x, vencimento: e.target.value } : x))} style={{ border: 0, background: 'var(--fill)', borderRadius: 8, padding: '6px 8px', fontSize: 15 }} />
      <input inputMode="decimal" aria-label="Valor" value={l.valor} onChange={e => set(L.map((x, j) => j === i ? { ...x, valor: e.target.value } : x))} style={{ width: 110, border: 0, background: 'var(--fill)', borderRadius: 8, padding: '6px 8px', fontSize: 16, textAlign: 'right' }} />
      <select aria-label="Forma" value={l.forma} onChange={e => set(L.map((x, j) => j === i ? { ...x, forma: e.target.value } : x))} style={{ border: 0, background: 'var(--fill)', borderRadius: 8, padding: '6px 6px', fontSize: 14 }}>
        {['A definir', ...FORMAS].map(f => <option key={f}>{f}</option>)}</select>
      {L.length > 1 && <button type="button" className="tbtn" aria-label="Remover parcela" onClick={() => set(L.filter((_, j) => j !== i))}><Ic n="x" sm /></button>}
    </div>)}</div>
    <div className="btnrow" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
      <button type="button" className="btn ghost sm" onClick={() => set([...L, { vencimento: L[L.length - 1]?.vencimento ?? hoje(), valor: '0,00', forma: L[L.length - 1]?.forma ?? 'A definir' }])}><Ic n="plus" sm /> Parcela</button>
      <span className={dif ? 'redt' : ''}>Soma <b className="tnum">{brl(soma)}</b>{dif ? ` (${dif > 0 ? '+' : ''}${brl(dif)})` : ''}</span>
    </div>
    <h4 className="fgt">Dividir automaticamente</h4>
    <div className="group" style={{ marginBottom: 8 }}><div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <span>Em</span><input inputMode="numeric" value={qtd} onChange={e => setQtd(e.target.value)} style={{ width: 46, border: 0, background: 'var(--fill)', borderRadius: 8, padding: '6px', textAlign: 'center', fontSize: 16 }} />
      <span>parcelas a cada</span><input inputMode="numeric" value={int} onChange={e => setInt(e.target.value)} style={{ width: 52, border: 0, background: 'var(--fill)', borderRadius: 8, padding: '6px', textAlign: 'center', fontSize: 16 }} /><span>dias</span>
      <button type="button" className="btn sm" onClick={() => { const q = Math.max(1, Math.min(24, +qtd || 1)), d = Math.max(0, +int || 30)
        set(dividir(+n.valor, q, L[0]?.vencimento || hoje(), d, L[0]?.forma ?? 'A definir').map(x => ({ ...x, valor: x.valor.toFixed(2).replace('.', ',') }))) }}>Aplicar</button>
    </div></div>
    <Note>A soma das parcelas precisa fechar com o valor da nota ({brl(+n.valor)}). A primeira data vale como início da divisão.</Note>
  </>
}

function ImportarCorpo({ holder, existentes }: { holder: { notas: NotaXML[] }; existentes: Set<string> }) {
  const [st, setSt] = useState<{ lendo: boolean; notas: NotaXML[]; ignorados: string[]; erro?: string }>({ lendo: false, notas: [], ignorados: [] })
  const novas = st.notas.filter(x => !existentes.has(x.chave))
  return <>
    <div className="group" style={{ marginBottom: 12 }}>
      <label className="row" style={{ cursor: 'pointer' }}>
        <span className="act" style={{ padding: 0, background: 'none' }}><span className="ib"><Ic n="plus" /></span></span>
        <div className="rm"><b>{st.lendo ? 'Lendo…' : st.notas.length ? `${st.notas.length} notas lidas` : 'Escolher ZIP ou XML'}</b>
          <span className="r2" style={{ whiteSpace: 'normal' }}>Pode escolher os ZIPs de NF-e e NFS-e juntos. Os arquivos não ficam guardados: o site só lê os dados.</span></div>
        <input type="file" multiple accept=".zip,.xml,application/zip,text/xml,application/xml" style={{ display: 'none' }} onChange={async e => {
          const files = Array.from(e.target.files ?? []); if (!files.length) return
          setSt(s => ({ ...s, lendo: true }))
          try { const { lerArquivos } = await import('../lib/xmlnotas'); const r = await lerArquivos(files); holder.notas = r.notas; setSt({ lendo: false, ...r }) }
          catch (err) { setSt({ lendo: false, notas: [], ignorados: [], erro: (err as Error).message }) }
        }} />
      </label>
    </div>
    {st.erro && <div className="hint bad">Não foi possível ler: {st.erro}</div>}
    {st.notas.length > 0 && <div className="group" style={{ marginBottom: 12 }}>
      <div className="row kv"><span className="k">Novas</span><span className="v strong">{novas.length} · {brl(novas.reduce((s, x) => s + x.valor, 0))}</span></div>
      <div className="row kv"><span className="k">Já importadas antes</span><span className="v">{st.notas.length - novas.length}</span></div>
      <div className="row kv"><span className="k">NF-e / NFS-e</span><span className="v">{st.notas.filter(x => x.tipo === 'NF-e').length} / {st.notas.filter(x => x.tipo === 'NFS-e').length}</span></div>
      <div className="row kv"><span className="k">Com placa</span><span className="v">{st.notas.filter(x => x.placa).length}</span></div>
      {st.ignorados.length > 0 && <div className="row kv"><span className="k">Arquivos ignorados</span><span className="v">{st.ignorados.length}</span></div>}
    </div>}
    <Note>Cada nota entra com as parcelas e vencimentos do XML (ou pela condição, ex.: 30 dias), como <b>a receber</b>. Notas com placa de um veículo do sistema são ligadas ao atendimento. Importar de novo não duplica.</Note>
  </>
}

// ---------- tela ----------
export function Notas() {
  const store = useStore(); const sheet = useSheet(); const nav = useNav()
  const [notas, setNotas] = useState<Nota[] | null>(null); const [erro, setErro] = useState('')
  const [v, setV] = useState(0)
  const [seg, setSeg] = useState<'aberto' | 'vencidas' | 'recebidas' | 'todas'>('aberto')
  const [q, setQ] = useState(''); const [cli, setCli] = useState(''); const [tipo, setTipo] = useState(''); const [forma, setForma] = useState('')
  const [sel, setSel] = useState<Set<string> | null>(null)
  const recarregar = () => setV(x => x + 1)
  useEffect(() => { carregar().then(setNotas).catch(e => setErro(msgErro(e))) }, [v, store.versao])

  const d = hoje()
  const R = useMemo(() => new Map((notas ?? []).map(n => [n.id, resumoNota(n, d)])), [notas, d])
  const clientes = useMemo(() => [...new Set((notas ?? []).map(n => n.cliente))].sort(), [notas])
  const lista = useMemo(() => (notas ?? []).filter(n => {
    const r = R.get(n.id)!
    if (seg === 'aberto' && !(r.saldo > 0.009)) return false
    if (seg === 'vencidas' && r.situacao !== 'Vencida') return false
    if (seg === 'recebidas' && r.situacao !== 'Recebida') return false
    if (cli && n.cliente !== cli) return false
    if (tipo && n.tipo !== tipo) return false
    if (forma && !n.parcelas.some(p => p.forma === forma) && !n.recebimentos.some(x => x.forma === forma && !x.estornado_em)) return false
    const t = q.trim().toUpperCase()
    return !t || `${numDoc(n)} ${n.numero} ${n.cliente} ${n.placa} ${n.os} ${n.pedido} ${n.modelo}`.toUpperCase().includes(t)
  }).sort((a, b) => {
    const ra = R.get(a.id)!, rb = R.get(b.id)!
    if (seg === 'recebidas' || seg === 'todas') return +new Date(b.emissao) - +new Date(a.emissao)
    return (ra.proxima?.vencimento ?? '9') < (rb.proxima?.vencimento ?? '9') ? -1 : 1
  }), [notas, R, seg, cli, tipo, forma, q])

  if (erro) return <><Nav title="Notas fiscais" /><div className="banner">{/0006|notas/.test(erro) && /not find|does not exist|schema cache/i.test(erro) ? 'Falta rodar a atualização 0006 do banco no Supabase (SQL Editor).' : erro}</div></>
  const todas = notas ?? []
  const abertoT = todas.reduce((s, n) => s + R.get(n.id)!.saldo, 0), vencT = todas.reduce((s, n) => s + R.get(n.id)!.vencido, 0)
  const em7 = todas.reduce((s, n) => s + n.parcelas.filter(p => p.vencimento >= d && p.vencimento <= somaDias(d, 7)).reduce((x, p) => x + saldoParcela(n, p), 0), 0)
  const mes = d.slice(0, 7), recMes = todas.flatMap(n => n.recebimentos).filter(r => !r.estornado_em && r.data.slice(0, 7) === mes).reduce((s, r) => s + +r.valor, 0)
  const podeEditar = store.pode('financeira')

  // ---------- ações ----------
  const receber = (n: Nota, p: Parcela) => sheet.open({ title: `Receber ${p.numero}ª parcela`, done: 'Recebimento registrado', saveLabel: 'Registrar',
    body: <><div className="hint">{n.cliente} · {n.tipo} nº {numDoc(n)} · vencimento {fData(p.vencimento + 'T12:00:00')} · saldo {brl(saldoParcela(n, p))}</div><ReceberCorpo saldo={saldoParcela(n, p)} forma={p.forma} /></>,
    async onSave(f) { const val = numero(f.valor); if (!val || val <= 0) return 'Informe o valor recebido.'
      const { error } = await supabase.rpc('registrar_recebimento', { p_parcela: p.id, p_data: f.data, p_valor: val, p_forma: f.forma, p_obs: f.obs ?? '' })
      if (error) return msgErro(error); recarregar() } })
  const estornar = (_n: Nota, r: Recebimento) => sheet.open({ title: 'Estornar recebimento', saveLabel: 'Estornar', done: 'Recebimento estornado',
    body: <><div className="hint bad">{brl(+r.valor)} · {r.forma} · {fData(r.data + 'T12:00:00')}. O valor volta para o saldo em aberto; o registro fica no histórico.</div><Fg><Field label="Motivo"><input name="m" /></Field></Fg></>,
    async onSave(f) { const { error } = await supabase.rpc('estornar_recebimento', { p_receb: r.id, p_motivo: f.m ?? '' }); if (error) return msgErro(error); recarregar() } })
  const ajustar = (n: Nota) => {
    const holder = { linhas: [...n.parcelas].sort((a, b) => a.numero - b.numero).map(p => ({ vencimento: p.vencimento, valor: (+p.valor).toFixed(2).replace('.', ','), forma: p.forma })) }
    sheet.open({ title: 'Parcelas e forma de pagamento', done: 'Parcelas salvas', body: <ParcelasCorpo n={n} holder={holder} />,
      async onSave() {
        const ps = holder.linhas.map(l => ({ vencimento: l.vencimento, valor: numero(l.valor) ?? 0, forma: l.forma }))
        if (ps.some(p => !p.vencimento || p.valor < 0)) return 'Confira as datas e os valores.'
        const { error } = await supabase.rpc('salvar_parcelas', { p_nota: n.id, p_parcelas: ps }); if (error) return msgErro(error); recarregar()
      } })
  }
  const editar = (n: Nota) => sheet.open({ title: 'Observação e placa', done: 'Nota atualizada',
    body: <Fg><Field label="Placa"><input name="placa" defaultValue={n.placa} placeholder="ABC1D23" style={{ fontFamily: 'var(--mono)' }} /></Field>
      <Field label="Observação" col><textarea name="obs" defaultValue={n.obs} placeholder="Ex.: cobrar com a Maria do financeiro da locadora" /></Field>
      <label className="f tog"><span>Nota cancelada</span><input type="checkbox" name="canc" defaultChecked={n.cancelada} /></label></Fg>,
    async onSave(f) { const { error } = await supabase.rpc('editar_nota', { p_nota: n.id, p_obs: f.obs ?? '', p_placa: f.placa ?? '', p_cancelada: !!f.canc }); if (error) return msgErro(error); recarregar() } })

  function abrir(id: string) {
    const n = (notas ?? []).find(x => x.id === id); if (!n) return
    const r = resumoNota(n, d)
    sheet.open({ title: `${n.tipo} nº ${numDoc(n)}`, body: <>
      <div className="group" style={{ marginBottom: 14 }}>
        <div className="row kv"><span className="k"><b>{n.cliente}</b>{n.cliente_doc && <><br /><span className="muted sm">{n.cliente_doc}</span></>}</span><span className={`pill ${tomSit(r.situacao)}`}>{r.situacao}</span></div>
        <div className="row kv"><span className="k">Valor</span><span className="v strong">{brl(+n.valor)}</span></div>
        <div className="row kv"><span className="k">Recebido</span><span className="v">{brl(r.recebido)}</span></div>
        <div className="row kv"><span className="k">Em aberto</span><span className="v strong" style={{ color: r.vencido ? 'var(--red)' : undefined }}>{brl(r.saldo)}{r.vencido ? ` · ${brl(r.vencido)} vencido` : ''}</span></div>
        <div className="row kv"><span className="k">Emissão</span><span className="v">{fData(n.emissao)}{n.cond_pagamento ? ` · ${n.cond_pagamento}` : ''}</span></div>
        {(n.placa || n.os || n.pedido) && <div className="row kv"><span className="k">Veículo</span><span className="v">{n.placa && <Plate p={n.placa} />} {[n.modelo, n.os && 'OS ' + n.os, n.pedido && 'PC ' + n.pedido].filter(Boolean).join(' · ')}</span></div>}
        {n.descricao && <div className="row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}><span className="muted sm">Itens</span><span style={{ fontSize: 13.5 }}>{n.descricao}</span></div>}
        {n.obs && <div className="row kv"><span className="k">Observação</span><span className="v">{n.obs}</span></div>}
      </div>
      <h4 className="fgt">Parcelas</h4>
      <div className="group" style={{ marginBottom: 14 }}>{r.parcelas.map(p => { const s = situacaoParcela(n, p, d), sal = saldoParcela(n, p)
        return <div key={p.id} className="row" style={{ gap: 10 }}>
          <div className="rm"><b>{p.numero}ª · vence {fData(p.vencimento + 'T12:00:00')}</b>
            <span className="r2">{brl(+p.valor)} · {p.forma}{recebidoParcela(n, p) > 0 && sal > 0 ? ` · recebido ${brl(recebidoParcela(n, p))}` : ''}</span></div>
          <span className={`pill ${tomSit(s)}`}>{s === 'Vencida' ? prazoTxt(Math.round((Date.parse(p.vencimento) - Date.parse(d)) / 864e5)) : s}</span>
          {podeEditar && sal > 0.009 && !n.cancelada && <button type="button" className="btn sm" onClick={() => receber(n, p)}>Receber</button>}
        </div> })}</div>
      {n.recebimentos.length > 0 && <><h4 className="fgt">Recebimentos</h4>
        <div className="group" style={{ marginBottom: 14 }}>{n.recebimentos.map(x => <div key={x.id} className="row" style={{ gap: 10, opacity: x.estornado_em ? 0.6 : 1 }}>
          <div className="rm"><b style={{ textDecoration: x.estornado_em ? 'line-through' : 'none' }}>{brl(+x.valor)} · {x.forma}</b>
            <span className="r2" style={{ whiteSpace: 'normal' }}>{fData(x.data + 'T12:00:00')} · {x.usuario_nome}{x.obs ? ' · ' + x.obs : ''}{x.estornado_em ? ` · estornado por ${x.estornado_por_nome} em ${fDataHora(x.estornado_em)}${x.motivo_estorno ? ' (' + x.motivo_estorno + ')' : ''}` : ''}</span></div>
          {podeEditar && !x.estornado_em && <button type="button" className="btn ghost sm" onClick={() => estornar(n, x)}>Estornar</button>}
        </div>)}</div></>}
      {podeEditar && <div className="btnrow" style={{ marginBottom: 10 }}>
        <button type="button" className="btn ghost sm" onClick={() => ajustar(n)}>Parcelas e forma</button>
        <button type="button" className="btn ghost sm" onClick={() => editar(n)}>Observação e placa</button>
        {n.atendimento_id && <button type="button" className="btn ghost sm" onClick={() => { sheet.close(); nav.push({ r: 'at', id: n.atendimento_id! }) }}>Abrir veículo</button>}
      </div>}
      <p className="fnote">{n.origem === 'xml' ? `Importada do XML em ${fDataHora(n.importado_em)} por ${n.importado_por_nome}.` : `Lançada manualmente por ${n.importado_por_nome}.`}</p>
    </> })
  }

  const importar = () => { const holder = { notas: [] as NotaXML[] }
    sheet.open({ title: 'Importar notas (XML)', saveLabel: 'Importar', body: <ImportarCorpo holder={holder} existentes={new Set(todas.map(n => n.chave))} />,
      async onSave() { if (!holder.notas.length) return 'Escolha os arquivos ZIP ou XML primeiro.'
        const out = { novas: 0, atualizadas: 0, vinculadas: 0 }
        for (let i = 0; i < holder.notas.length; i += 100) {
          const { data, error } = await supabase.rpc('importar_notas', { p_notas: holder.notas.slice(i, i + 100) })
          if (error) return msgErro(error)
          const r = data as typeof out; out.novas += r.novas; out.atualizadas += r.atualizadas; out.vinculadas += r.vinculadas
        }
        recarregar(); await store.recarregar()
        sheet.toast(`${out.novas} notas novas${out.atualizadas ? `, ${out.atualizadas} já existiam` : ''}${out.vinculadas ? ` · ${out.vinculadas} ligadas a veículos` : ''}`)
      } }) }
  const manual = () => sheet.open({ title: 'Nova nota (manual)', done: 'Nota lançada',
    body: <><Fg><Field label="Tipo"><Select name="tipo" options={['NF-e', 'NFS-e', 'Outro']} /></Field><Field label="Número"><input name="num" inputMode="numeric" /></Field>
      <Field label="Emissão"><input name="em" type="date" defaultValue={d} /></Field><Field label="Cliente"><input name="cli" list="lista-clientes" /></Field>
      <Field label="Valor"><input name="valor" inputMode="decimal" /></Field><Field label="Vencimento"><input name="venc" type="date" defaultValue={somaDias(d, 30)} /></Field>
      <Field label="Forma"><Select name="forma" options={['A definir', ...FORMAS]} /></Field><Field label="Placa"><input name="placa" placeholder="Opcional" /></Field>
      <Field label="Observação" col><textarea name="obs" /></Field></Fg>
      <datalist id="lista-clientes">{clientes.map(c => <option key={c} value={c} />)}</datalist>
      <Note>Para notas que não vieram por XML. Depois dá para dividir em parcelas.</Note></>,
    async onSave(f) { const val = numero(f.valor); if (!f.num || !f.cli || !val) return 'Preencha número, cliente e valor.'
      const { error } = await supabase.rpc('nota_manual', { p_tipo: f.tipo, p_numero: f.num, p_emissao: new Date(f.em + 'T12:00:00-04:00').toISOString(), p_cliente: f.cli.trim().toUpperCase(), p_valor: val, p_vencimento: f.venc, p_forma: f.forma, p_placa: f.placa ?? '', p_obs: f.obs ?? '' })
      if (error) return msgErro(error); recarregar() } })
  const receberLote = () => {
    const ids = [...(sel ?? [])], alvo = todas.filter(n => ids.includes(n.id) && R.get(n.id)!.saldo > 0.009)
    if (!alvo.length) { sheet.toast('Selecione notas com saldo em aberto.'); return }
    const total = alvo.reduce((s, n) => s + R.get(n.id)!.saldo, 0)
    sheet.open({ title: `Receber ${alvo.length} notas`, saveLabel: 'Registrar', done: 'Recebimentos registrados',
      body: <><div className="hint">Baixa total do saldo em aberto de cada nota selecionada: <b>{brl(total)}</b>.</div>
        <Fg><Field label="Data"><input name="data" type="date" defaultValue={d} /></Field><Field label="Forma"><Select name="forma" options={FORMAS} value="Transferência" /></Field>
          <Field label="Observação" col><textarea name="obs" placeholder="Ex.: pagamento em lote da Localiza" /></Field></Fg></>,
      async onSave(f) {
        for (const n of alvo) for (const p of n.parcelas) { const s = saldoParcela(n, p); if (s > 0.009) {
          const { error } = await supabase.rpc('registrar_recebimento', { p_parcela: p.id, p_data: f.data, p_valor: s, p_forma: f.forma, p_obs: f.obs ?? '' })
          if (error) return `${n.tipo} ${numDoc(n)}: ${msgErro(error)}` } }
        setSel(null); recarregar()
      } })
  }
  const exportar = async (tp: 'pdf' | 'csv') => {
    const m = await import('../lib/pdf'), rel = await import('../lib/relatorios')
    const rep: Relatorio = {
      cards: [['Em aberto', lista.reduce((s, n) => s + R.get(n.id)!.saldo, 0), 'r'], ['Vencido', lista.reduce((s, n) => s + R.get(n.id)!.vencido, 0), 'r'], ['Notas', lista.length, 'n'], ['Valor das notas', lista.reduce((s, n) => s + +n.valor, 0), 'r']],
      main: { title: 'Notas', placaCol: 4, cols: ['Tipo', 'Nº', 'Cliente', 'Emissão', 'Placa', 'Vencimento', 'Forma', 'Valor', 'Recebido', 'Em aberto', 'Situação'],
        rows: lista.map(n => { const r = R.get(n.id)!; return [n.tipo, numDoc(n), n.cliente, fData(n.emissao), n.placa || '—', r.proxima ? fData(r.proxima.vencimento + 'T12:00:00') : '—', r.proxima?.forma ?? '—', brl(+n.valor), brl(r.recebido), brl(r.saldo), r.situacao] }) },
    }
    const nome = `NETO-AUTO-CENTER_contas-a-receber_${d}`, filtros = [seg === 'aberto' ? 'Em aberto' : seg === 'vencidas' ? 'Vencidas' : seg === 'recebidas' ? 'Recebidas' : 'Todas', cli || 'Todos os clientes', tipo || 'NF-e e NFS-e'].join(' · ')
    if (tp === 'csv') { m.baixar(new Blob([rel.csv('Contas a receber', `posição em ${fData(d + 'T12:00:00')}`, rep)], { type: 'text/csv;charset=utf-8' }), nome + '.csv'); return }
    const blob = m.gerarPDF(rep, { cards: rep.cards.map(c => [c[0], null, c[2]]) as Relatorio['cards'], main: rep.main }, { titulo: 'Contas a receber', periodo: `posição em ${fData(d + 'T12:00:00')}`, filtros, usuario: store.me?.nome ?? '', perfil: store.me?.perfil ?? '' })
    const r = await m.encaminhar(blob, nome + '.pdf', 'Contas a receber', 'Contas a receber da NETO AUTO CENTER')
    if (r === 'sem-suporte') m.baixar(blob, nome + '.pdf')
  }

  const porCliente = [...new Map(lista.map(n => [n.cliente, 0])).keys()].map(c => {
    const L = lista.filter(n => n.cliente === c)
    return { c, n: L.length, aberto: L.reduce((s, n) => s + R.get(n.id)!.saldo, 0), vencido: L.reduce((s, n) => s + R.get(n.id)!.vencido, 0) }
  }).sort((a, b) => b.aberto - a.aberto)

  return <>
    <Nav title="Notas fiscais" sub="Contas a receber: parcelas, vencimentos e recebimentos"
      right={podeEditar ? <button className="tbtn strong" onClick={importar}><Ic n="plus" sm /> Importar</button> : undefined} />
    {notas === null ? <div className="loading">Carregando notas…</div> : <>
      <div className="tiles t4">
        <Tile label="Em aberto" value={brl(abertoT)} money foot={`${todas.filter(n => R.get(n.id)!.saldo > 0.009).length} notas`} onClick={() => setSeg('aberto')} />
        <Tile label="Vencido" value={brl(vencT)} money cls={vencT ? 'crit' : ''} foot={`${todas.filter(n => R.get(n.id)!.situacao === 'Vencida').length} notas`} onClick={() => setSeg('vencidas')} />
        <Tile label="Vence em 7 dias" value={brl(em7)} money cls={em7 ? 'warn' : ''} onClick={() => setSeg('aberto')} />
        <Tile label="Recebido no mês" value={brl(recMes)} money onClick={() => setSeg('recebidas')} />
      </div>
      <div className="stack" style={{ marginTop: 16 }}>
        <Seg value={seg} onChange={setSeg} options={[['aberto', 'Em aberto'], ['vencidas', 'Vencidas'], ['recebidas', 'Recebidas'], ['todas', 'Todas']]} />
        <div className="toolbar" style={{ marginTop: 0 }}>
          <label className="search" style={{ flex: '1 1 220px' }}><Ic n="search" sm /><input id="nq" value={q} onChange={e => setQ(e.target.value)} placeholder="Nº, cliente, placa, OS ou PC" autoComplete="off" /></label>
          <select id="ncli" value={cli} onChange={e => setCli(e.target.value)} aria-label="Cliente"><option value="">Todos os clientes</option>{clientes.map(c => <option key={c}>{c}</option>)}</select>
          <select id="ntipo" value={tipo} onChange={e => setTipo(e.target.value)} aria-label="Tipo"><option value="">NF-e e NFS-e</option><option>NF-e</option><option>NFS-e</option></select>
          <select id="nforma" value={forma} onChange={e => setForma(e.target.value)} aria-label="Forma"><option value="">Todas as formas</option>{['A definir', ...FORMAS].map(f => <option key={f}>{f}</option>)}</select>
        </div>
        <div className="btnrow">
          {podeEditar && <button className="btn ghost sm" onClick={() => setSel(sel ? null : new Set())}>{sel ? 'Cancelar seleção' : 'Selecionar'}</button>}
          {sel && <button className="btn sm" onClick={receberLote} disabled={!sel.size}>Receber {sel.size || ''} selecionada(s)</button>}
          {podeEditar && !sel && <button className="btn ghost sm" onClick={manual}>+ Nota manual</button>}
          <button className="btn ghost sm" onClick={() => exportar('pdf')}>PDF</button>
          <button className="btn ghost sm" onClick={() => exportar('csv')}>CSV</button>
        </div>
      </div>
      <Section title={`${lista.length} notas · ${brl(lista.reduce((s, n) => s + R.get(n.id)!.saldo, 0))} em aberto`}>
        {!lista.length ? <div className="group"><div className="empty">{todas.length ? 'Nenhuma nota com esses filtros.' : 'Nenhuma nota ainda. Toque em Importar e escolha os ZIPs de XML das notas.'}</div></div>
          : <div className="group">{lista.map(n => { const r = R.get(n.id)!, marcado = sel?.has(n.id)
            return <div key={n.id} className="row" role="button" tabIndex={0} style={{ alignItems: 'flex-start', cursor: 'pointer' }}
              onClick={() => sel ? setSel(s => { const x = new Set(s); if (x.has(n.id)) x.delete(n.id); else x.add(n.id); return x }) : abrir(n.id)}>
              {sel && <input type="checkbox" readOnly checked={!!marcado} style={{ width: 20, height: 20, accentColor: 'var(--red)', marginTop: 2 }} />}
              <div className="rm">
                <div className="r1"><b>{n.cliente}</b></div>
                <div className="r1"><span className="tag">{n.tipo} {numDoc(n)}</span>{n.placa && <Plate p={n.placa} />}<span className="muted sm">{[n.pedido && 'PC ' + n.pedido, n.os && 'OS ' + n.os].filter(Boolean).join(' · ')}</span></div>
                <span className="r2">Emissão {dm(n.emissao.slice(0, 10))}{r.proxima ? ` · ${r.proxima.forma}` : ''}{n.parcelas.length > 1 ? ` · ${n.parcelas.length} parcelas` : ''}</span>
              </div>
              <div className="rr"><span className="big">{brl(r.saldo > 0.009 ? r.saldo : +n.valor)}</span>
                <span className={`pill ${tomSit(r.situacao)}`}>{r.situacao === 'A vencer' || r.situacao === 'Vencida' || r.situacao === 'Parcial' ? (r.proxima ? `${dm(r.proxima.vencimento)} · ${prazoTxt(r.dias)}` : r.situacao) : r.situacao}</span></div>
            </div> })}</div>}
      </Section>
      {porCliente.length > 1 && <Section title="Por cliente"><div className="tblwrap"><table><thead><tr><th>Cliente</th><th className="num">Notas</th><th className="num">Em aberto</th><th className="num">Vencido</th></tr></thead>
        <tbody>{porCliente.map(x => <tr key={x.c} style={{ cursor: 'pointer' }} onClick={() => setCli(x.c)}><td>{x.c}</td><td className="num">{x.n}</td><td className="num">{brl(x.aberto)}</td><td className="num" style={{ color: x.vencido ? 'var(--red)' : undefined }}>{brl(x.vencido)}</td></tr>)}</tbody></table></div></Section>}
    </>}
  </>
}
function somaDias(iso: string, k: number) { const x = new Date(iso + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10) }
