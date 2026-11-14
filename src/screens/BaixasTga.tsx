import { useEffect, useMemo, useState } from 'react'
import { brl, fData } from '../lib/format'
import { supabase, msgErro } from '../lib/supabase'
import { Fg, Note, Section, Tile, useSheet } from '../ui/ui'

// Baixas importadas do TGA que ainda não entraram em nenhuma nota. Um PV do TGA é a soma da nota de serviço e da nota de peça:
// aqui a pessoa confere a sugestão e liga o PV às notas; as próximas baixas desse PV entram sozinhas.
interface Baixa { id: string; documento: string; doc_numero: string; parcela_numero: number; emissao: string; baixa: string; valor_original: number; situacao: string }
interface Sugestao { emissao_tga: string; valor_tga: number; nota_ids: string[] }
interface NotaRes { id: string; tipo: string; numero: string; numero_rps: string; cliente: string; emissao: string; valor: number }
const ROTULO: Record<string, string> = { sem_nota: 'Sem nota ligada', ambigua: 'Mais de uma nota', excede_saldo: 'Acima do saldo', revisar: 'Conferir no TGA' }
const dia = (iso: string) => fData(iso + 'T12:00:00')

export function BaixasTga({ podeEditar }: { podeEditar: boolean }) {
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
