import { useEffect, useMemo, useState } from 'react'
import { brl, fData } from '../lib/format'
import { FAIXAS_ATRASO, faixaAtraso } from '../lib/gestao'
import { supabase, msgErro } from '../lib/supabase'
import { Ic, Nav, Section, Tile, useSheet } from '../ui/ui'

// Cobranças: clientes particulares, pelo cadastro do cliente no TGA. Vale o PV (a duplicata), mesmo que haja nota fiscal.
// A posição vem do último "A Receber, Em Aberto" importado. Locadoras ficam fora: elas são controladas por nota fiscal (Notas).
interface Aberto { documento: string; doc_numero: string; emissao: string; vencimento: string; valor_total: number; dias_atraso: number; cliente_codigo: string; tipo_doc: string }
interface Cliente { codigo: string; nome: string }
interface Pv { chave: string; doc: string; emissao: string; venc: string; total: number; dias: number }
interface Devedor { codigo: string; nome: string; total: number; vencido: number; dias: number; pvs: Pv[] }
const dia = (iso: string) => fData(iso + 'T12:00:00')

async function pegar<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as T[])); if (!data || data.length < 1000) return out
  }
}

export function Cobrancas() {
  const sheet = useSheet()
  const [dados, setDados] = useState<{ em: string; devedores: Devedor[] } | 'vazio' | null>(null)
  const [erro, setErro] = useState(''); const [q, setQ] = useState('')
  useEffect(() => {
    (async () => {
      const { data: imp, error } = await supabase.from('tga_importacoes').select('id,em').eq('relatorio', 'em_aberto').order('em', { ascending: false }).limit(1)
      if (error) throw new Error(error.message)
      if (!imp?.length) return setDados('vazio')
      const [clientes, linhas] = await Promise.all([
        pegar<Cliente>((a, b) => supabase.from('tga_clientes').select('codigo,nome').eq('tipo', 'particular').order('codigo').range(a, b)),
        pegar<Aberto>((a, b) => supabase.from('tga_em_aberto').select('documento,doc_numero,emissao,vencimento,valor_total,dias_atraso,cliente_codigo,tipo_doc').eq('importacao_id', imp[0].id).order('id').range(a, b))
      ])
      const nomes = new Map(clientes.map(c => [c.codigo, c.nome]))
      const por = new Map<string, Devedor>(), pvs = new Map<string, Pv>()
      for (const l of linhas) {
        if (!nomes.has(l.cliente_codigo) || l.tipo_doc === 'DV') continue
        const k = `${l.cliente_codigo}|${l.doc_numero}|${l.emissao}`
        let pv = pvs.get(k)
        if (!pv) {
          pv = { chave: k, doc: l.doc_numero, emissao: l.emissao, venc: l.vencimento, total: 0, dias: 0 }; pvs.set(k, pv)
          const d = por.get(l.cliente_codigo) ?? { codigo: l.cliente_codigo, nome: nomes.get(l.cliente_codigo) || l.cliente_codigo, total: 0, vencido: 0, dias: 0, pvs: [] }
          por.set(l.cliente_codigo, d); d.pvs.push(pv)
        }
        pv.total += +l.valor_total; pv.dias = Math.max(pv.dias, l.dias_atraso); if (l.vencimento < pv.venc) pv.venc = l.vencimento
      }
      for (const d of por.values()) {
        d.pvs.sort((a, b) => b.dias - a.dias); d.total = d.pvs.reduce((s, p) => s + p.total, 0)
        d.vencido = d.pvs.filter(p => p.dias > 0).reduce((s, p) => s + p.total, 0); d.dias = Math.max(...d.pvs.map(p => p.dias))
      }
      setDados({ em: imp[0].em, devedores: [...por.values()].sort((a, b) => b.vencido - a.vencido || b.total - a.total) })
    })().catch(e => setErro(msgErro(e)))
  }, [])

  const lista = useMemo(() => {
    if (!dados || dados === 'vazio') return []
    const t = q.trim().toUpperCase()
    return t ? dados.devedores.filter(d => `${d.nome} ${d.codigo}`.toUpperCase().includes(t)) : dados.devedores
  }, [dados, q])

  const topo = <Nav title="Cobranças" sub="Clientes particulares, pelo cadastro do cliente no TGA. Locadoras ficam em Notas." />
  if (erro) return <>{topo}<div className="banner">{/tga_|nome/.test(erro) ? 'Falta aplicar as atualizações 0015 e 0016 do banco no Supabase.' : erro}</div></>
  if (dados === null) return <>{topo}<div className="loading">Carregando…</div></>
  if (dados === 'vazio') return <>{topo}<div className="group"><div className="empty">Nenhum "A Receber, Em Aberto" importado ainda. Importe com scripts/importar-tga.mjs.</div></div></>

  const pvs = dados.devedores.flatMap(d => d.pvs), soma = (l: Pv[]) => l.reduce((s, p) => s + p.total, 0), vencidos = pvs.filter(p => p.dias > 0)
  const abrir = (d: Devedor) => sheet.open({
    title: d.nome, body: <>
      <div className="hint">{d.codigo} · {d.pvs.length} PV(s) · em aberto {brl(d.total)} · vencido {brl(d.vencido)}</div>
      <div className="group">{d.pvs.map(p => <div key={p.chave} className="row" style={{ alignItems: 'flex-start' }}>
        <div className="rm"><div className="r1"><b>PV {p.doc.replace(/^0+/, '')}</b></div><span className="r2">Emissão {dia(p.emissao)} · vencimento {dia(p.venc)}</span></div>
        <div className="rr"><span className="big">{brl(p.total)}</span><span className={`pill ${p.dias > 30 ? 'r' : p.dias > 0 ? 'o' : ''}`}>{p.dias > 0 ? `${p.dias} dias de atraso` : 'a vencer'}</span></div>
      </div>)}</div></>
  })
  return <>
    {topo}
    <div className="tiles t4">
      <Tile label="Em aberto" value={brl(soma(pvs))} money foot={`${dados.devedores.length} clientes · ${pvs.length} PVs`} />
      <Tile label="Vencido" value={brl(soma(vencidos))} money cls={vencidos.length ? 'crit' : ''} foot={`${vencidos.length} PVs`} />
      <Tile label="A vencer" value={brl(soma(pvs) - soma(vencidos))} money foot={`${pvs.length - vencidos.length} PVs`} />
      <Tile label="Posição de" value={dia(dados.em.slice(0, 10))} foot="último Em Aberto importado" />
    </div>
    <Section title="Atraso por faixa">
      <div className="tblwrap"><table><thead><tr><th>Faixa</th><th className="num">PVs</th><th className="num">Valor</th></tr></thead>
        <tbody>{FAIXAS_ATRASO.map(f => { const l = pvs.filter(p => faixaAtraso(p.dias) === f); return <tr key={f}><td>{f}</td><td className="num">{l.length}</td><td className="num">{brl(soma(l))}</td></tr> })}</tbody></table></div>
    </Section>
    <div className="stack" style={{ marginTop: 16 }}>
      <label className="search"><Ic n="search" sm /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Nome ou código do cliente" autoComplete="off" /></label>
    </div>
    <Section title={`${lista.length} clientes com PV em aberto`}>
      {!lista.length ? <div className="group"><div className="empty">Nenhum cliente encontrado.</div></div>
        : <div className="group">{lista.slice(0, 300).map(d => <div key={d.codigo} className="row" role="button" tabIndex={0} style={{ alignItems: 'flex-start', cursor: 'pointer' }} onClick={() => abrir(d)}>
          <div className="rm"><div className="r1"><b>{d.nome}</b><span className="tag">{d.codigo}</span></div><span className="r2">{d.pvs.length} PV(s) · vencido {brl(d.vencido)}</span></div>
          <div className="rr"><span className="big">{brl(d.total)}</span><span className={`pill ${d.dias > 30 ? 'r' : d.dias > 0 ? 'o' : ''}`}>{d.dias > 0 ? `${d.dias} dias de atraso` : 'a vencer'}</span></div>
        </div>)}</div>}
    </Section>
  </>
}
