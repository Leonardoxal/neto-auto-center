import { useEffect, useMemo, useState } from 'react'
import { brl, fData } from '../lib/format'
import { supabase, msgErro } from '../lib/supabase'
import { FAIXAS_ATRASO, faixaAtraso } from '../lib/gestao'
import { Fg, Note, Section, Seg, Tile, useSheet } from '../ui/ui'

// Baixas importadas do TGA que ainda não entraram em nenhuma nota. Um PV do TGA é a soma da nota de serviço e da nota de peça:
// aqui a pessoa confere a sugestão e liga o PV às notas; as próximas baixas desse PV entram sozinhas.
interface Baixa { id: string; documento: string; doc_numero: string; parcela_numero: number; emissao: string; baixa: string; valor_original: number; situacao: string }
interface Sugestao { emissao_tga: string; valor_tga: number; nota_ids: string[] }
interface NotaRes { id: string; tipo: string; numero: string; numero_rps: string; cliente: string; emissao: string; valor: number }
const ROTULO: Record<string, string> = { sem_nota: 'Sem nota ligada', ambigua: 'Mais de uma nota', excede_saldo: 'Acima do saldo', revisar: 'Conferir no TGA' }
const dia = (iso: string) => fData(iso + 'T12:00:00')

async function pegar<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as T[])); if (!data || data.length < 1000) return out
  }
}

export function BaixasTga({ podeEditar }: { podeEditar: boolean }) {
  const [vista, setVista] = useState<'locadoras' | 'particulares'>('particulares')
  return <>
    <div className="stack" style={{ marginBottom: 12 }}>
      <Seg value={vista} onChange={setVista} options={[['particulares', 'Particulares (por PV)'], ['locadoras', 'Locadoras (ligar às notas)']]} />
    </div>
    {vista === 'locadoras' ? <LigarNotas podeEditar={podeEditar} /> : <Particulares />}
  </>
}

// Cliente particular vale o PV (a duplicata do TGA), mesmo que tenha nota fiscal: a posição vem do último "A Receber, Em Aberto" importado.
interface Aberto { documento: string; doc_numero: string; emissao: string; vencimento: string; valor_total: number; dias_atraso: number; cliente_codigo: string; tipo_doc: string }
function Particulares() {
  const [dados, setDados] = useState<{ em: string; pvs: { chave: string; doc: string; cliente: string; emissao: string; venc: string; total: number; dias: number }[] } | null | 'vazio'>(null)
  const [erro, setErro] = useState('')
  useEffect(() => {
    (async () => {
      const { data: imp, error } = await supabase.from('tga_importacoes').select('id,em').eq('relatorio', 'em_aberto').order('em', { ascending: false }).limit(1)
      if (error) throw new Error(error.message)
      if (!imp?.length) return setDados('vazio')
      const [clientes, linhas] = await Promise.all([
        pegar<{ codigo: string }>((a, b) => supabase.from('tga_clientes').select('codigo').eq('tipo', 'particular').order('codigo').range(a, b)),
        pegar<Aberto>((a, b) => supabase.from('tga_em_aberto').select('documento,doc_numero,emissao,vencimento,valor_total,dias_atraso,cliente_codigo,tipo_doc').eq('importacao_id', imp[0].id).order('id').range(a, b))
      ])
      const part = new Set(clientes.map(c => c.codigo))
      const m = new Map<string, { chave: string; doc: string; cliente: string; emissao: string; venc: string; total: number; dias: number }>()
      for (const l of linhas) {
        if (!part.has(l.cliente_codigo) || l.tipo_doc === 'DV') continue
        const k = `${l.doc_numero}|${l.emissao}`
        const g = m.get(k) ?? m.set(k, { chave: k, doc: l.doc_numero, cliente: l.cliente_codigo, emissao: l.emissao, venc: l.vencimento, total: 0, dias: 0 }).get(k)!
        g.total += +l.valor_total; g.dias = Math.max(g.dias, l.dias_atraso); if (l.vencimento < g.venc) g.venc = l.vencimento
      }
      setDados({ em: imp[0].em, pvs: [...m.values()].sort((a, b) => b.dias - a.dias) })
    })().catch(e => setErro(msgErro(e)))
  }, [])
  if (erro) return <div className="banner">{/tga_/.test(erro) ? 'Falta aplicar a atualização 0015 do banco no Supabase.' : erro}</div>
  if (dados === null) return <div className="loading">Carregando…</div>
  if (dados === 'vazio') return <div className="group"><div className="empty">Nenhum "A Receber, Em Aberto" importado ainda. Importe com scripts/importar-tga.mjs.</div></div>
  const { pvs } = dados, soma = (l: typeof pvs) => l.reduce((s, p) => s + p.total, 0)
  const vencidos = pvs.filter(p => p.dias > 0)
  return <>
    <div className="tiles t4">
      <Tile label="Em aberto" value={brl(soma(pvs))} money foot={`${pvs.length} PVs`} />
      <Tile label="Vencido" value={brl(soma(vencidos))} money cls={vencidos.length ? 'crit' : ''} foot={`${vencidos.length} PVs`} />
      <Tile label="A vencer" value={brl(soma(pvs) - soma(vencidos))} money foot={`${pvs.length - vencidos.length} PVs`} />
      <Tile label="Posição de" value={dia(dados.em.slice(0, 10))} foot="último Em Aberto importado" />
    </div>
    <Section title="Atraso por faixa">
      <div className="tblwrap"><table><thead><tr><th>Faixa</th><th className="num">PVs</th><th className="num">Valor</th></tr></thead>
        <tbody>{FAIXAS_ATRASO.map(f => { const l = pvs.filter(p => faixaAtraso(p.dias) === f); return <tr key={f}><td>{f}</td><td className="num">{l.length}</td><td className="num">{brl(soma(l))}</td></tr> })}</tbody></table></div>
    </Section>
    <Section title={`${pvs.length} PVs de clientes particulares em aberto`}>
      {!pvs.length ? <div className="group"><div className="empty">Nenhum cliente particular com PV em aberto.</div></div>
        : <div className="group">{pvs.slice(0, 300).map(p => <div key={p.chave} className="row" style={{ alignItems: 'flex-start' }}>
          <div className="rm"><div className="r1"><b>PV {p.doc.replace(/^0+/, '')}</b><span className="tag">{p.cliente}</span></div>
            <span className="r2">Emissão {dia(p.emissao)} · vencimento {dia(p.venc)}</span></div>
          <div className="rr"><span className="big">{brl(p.total)}</span><span className={`pill ${p.dias > 30 ? 'r' : p.dias > 0 ? 'o' : ''}`}>{p.dias > 0 ? `${p.dias} dias de atraso` : 'a vencer'}</span></div>
        </div>)}</div>}
    </Section>
  </>
}

function LigarNotas({ podeEditar }: { podeEditar: boolean }) {
  const sheet = useSheet()
  const [baixas, setBaixas] = useState<Baixa[] | null>(null); const [erro, setErro] = useState(''); const [v, setV] = useState(0)
  useEffect(() => {
    supabase.from('tga_baixas').select('id,documento,doc_numero,parcela_numero,emissao,baixa,valor_original,situacao')
      .in('situacao', Object.keys(ROTULO)).order('baixa', { ascending: false }).limit(2000)
      .then(({ data, error }) => error ? setErro(msgErro(error)) : setBaixas(data as unknown as Baixa[]))
  }, [v])

  const grupos = useMemo(() => {
    const m = new Map<string, { doc: string; emissao: string; docs: string[]; baixas: Baixa[] }>()
    for (const b of baixas ?? []) {
      const k = `${b.doc_numero}|${b.emissao}`
      const g = m.get(k) ?? m.set(k, { doc: b.doc_numero, emissao: b.emissao, docs: [], baixas: [] }).get(k)!
      g.baixas.push(b); if (!g.docs.includes(b.documento)) g.docs.push(b.documento)
    }
    return [...m.values()]
  }, [baixas])

  async function ligar(g: (typeof grupos)[number]) {
    const { data: sug, error } = await supabase.rpc('sugerir_pv_tga', { p_documento: g.docs[0] })
    if (error) return sheet.toast(msgErro(error))
    const opcoes = ((sug ?? []) as Sugestao[]).filter(s => s.emissao_tga === g.emissao)
    const ids = [...new Set(opcoes.flatMap(o => o.nota_ids))]
    const { data: ns, error: e2 } = ids.length ? await supabase.from('notas').select('id,tipo,numero,numero_rps,cliente,emissao,valor').in('id', ids) : { data: [], error: null }
    if (e2) return sheet.toast(msgErro(e2))
    const N = new Map((ns as unknown as NotaRes[]).map(n => [n.id, n]))
    const total = g.baixas.reduce((s, b) => s + +b.valor_original, 0)
    sheet.open({
      title: `PV ${g.doc.replace(/^0+/, '')} · ${dia(g.emissao)}`, saveLabel: 'Ligar', done: 'PV ligado às notas',
      body: <>
        <div className="hint">Duplicata do TGA de {brl(total)} (serviço mais peça). Escolha as notas que formam esse valor.</div>
        {!opcoes.length ? <Note>Nenhuma sugestão: não há nota do mesmo cliente, com emissão até 10 dias de diferença, cuja soma feche {brl(total)}. Confira se as notas já foram importadas.</Note>
          : <Fg>{opcoes.map((o, i) => <label key={i} className="f tog" style={{ alignItems: 'flex-start' }}>
            <span>{o.nota_ids.map(id => { const n = N.get(id); return n ? `${n.tipo} ${n.numero_rps || n.numero} · ${n.cliente} · ${brl(+n.valor)} · emissão ${dia(n.emissao.slice(0, 10))}` : id }).join('  +  ')}</span>
            <input type="radio" name="op" value={String(i)} /></label>)}</Fg>}
        <Note>As baixas serão repartidas entre as notas na proporção do saldo de cada uma. Se a locadora pagou serviço e peça em dias diferentes, estorne e refaça o recebimento à mão.</Note>
      </>,
      async onSave(f) {
        const o = opcoes[+f.op]; if (f.op === undefined || !o) return 'Escolha uma das sugestões.'
        const { error } = await supabase.rpc('vincular_pv_tga', { p_doc_numero: g.doc, p_emissao: g.emissao, p_notas: o.nota_ids })
        if (error) return msgErro(error); setV(x => x + 1)
      }
    })
  }

  if (erro) return <div className="banner">{/tga_baixas/.test(erro) ? 'Falta aplicar a atualização 0015 do banco no Supabase.' : erro}</div>
  if (baixas === null) return <div className="loading">Carregando baixas…</div>
  const por = (s: string) => baixas.filter(b => b.situacao === s)
  return <>
    <div className="tiles t4">
      {Object.entries(ROTULO).map(([s, t]) => <Tile key={s} label={t} value={por(s).length} foot={brl(por(s).reduce((x, b) => x + +b.valor_original, 0))} />)}
    </div>
    <Section title={`${grupos.length} PVs do TGA aguardando ligação`}>
      {!grupos.length ? <div className="group"><div className="empty">Nenhuma baixa pendente. Importe o relatório "A Receber, Baixados" com scripts/importar-tga.mjs.</div></div>
        : <div className="group">{grupos.map(g => {
          const total = g.baixas.reduce((s, b) => s + +b.valor_original, 0), sits = [...new Set(g.baixas.map(b => ROTULO[b.situacao]))].join(', ')
          return <div key={g.doc + g.emissao} className="row" role="button" tabIndex={0} style={{ alignItems: 'flex-start', cursor: podeEditar ? 'pointer' : 'default' }}
            onClick={() => podeEditar && ligar(g)}>
            <div className="rm">
              <div className="r1"><b>PV {g.doc.replace(/^0+/, '')}</b><span className="tag">{g.baixas.length} baixa(s)</span></div>
              <span className="r2">Emissão {dia(g.emissao)} · última baixa {dia(g.baixas[0].baixa)} · {sits}</span>
            </div>
            <div className="rr"><span className="big">{brl(total)}</span></div>
          </div>
        })}</div>}
    </Section>
  </>
}
