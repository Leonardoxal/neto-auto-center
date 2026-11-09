import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { faturado, alerta, estadoPrincipal, LISTAS, OPERACIONAL, naOficina, comCondutor, noPatio, semAtualizacao, tempoNoPatio, ultimaAtualizacao, type Atendimento } from '../lib/domain'
import { dur, fDataHora } from '../lib/format'
import { useStore } from '../lib/store'
import { FOTO_CAPA, identificarModelo, paginaImagem, urlImagem } from '../lib/veiculos'
import { CarroImg, Ic, Nav, Pill, Plate, Seg, Section } from '../ui/ui'
import { AtRow, Lista, VCard, useNav } from './comum'
import { useEntrada } from './Entrada'

const lembrar = (k: string, v?: string) => { try { if (v === undefined) return localStorage.getItem(k) ?? ''; localStorage.setItem(k, v) } catch { /* sem armazenamento */ } return '' }

export function Patio({ lista: inicial, onBack }: { lista?: string; onBack?: () => void }) {
  const { ativos, locadoras, locNome } = useStore(); const nav = useNav(); const entrada = useEntrada()
  const [seg, setSeg] = useState(inicial || 'todos')
  const [view, setView] = useState<'etapas' | 'tabela' | 'quadro'>(() => { const v = lembrar('patio-view'); return v === 'tabela' || v === 'quadro' ? v : 'etapas' })
  const [q, setQ] = useState(''); const [loc, setLoc] = useState(''); const [resp, setResp] = useState(''); const [ord, setOrd] = useState('tempo')
  const [desde, setDesde] = useState(''); const [minDias, setMinDias] = useState(0)
  const L = LISTAS[seg] ?? LISTAS.todos
  const rows = ativos.filter(L.f).filter(a => (!loc || a.locadora_id === loc) && (!resp || a.responsavel === resp)
    && (!desde || +new Date(a.entrada) >= +new Date(`${desde}T00:00:00-04:00`)) && tempoNoPatio(a) >= minDias * 864e5
    && (!q || `${a.placa} ${a.modelo} ${locNome(a.locadora_id)} ${a.protocolo} ${a.os} ${a.numero}`.toUpperCase().includes(q.toUpperCase().trim())))
    .sort((a, b) => ord === 'tempo' ? tempoNoPatio(b) - tempoNoPatio(a) : ord === 'parado' ? semAtualizacao(b) - semAtualizacao(a) : +new Date(b.entrada) - +new Date(a.entrada))
  const resps = [...new Set(ativos.map(a => a.responsavel).filter(Boolean))]
  const mudarView = (v: typeof view) => { setView(v); lembrar('patio-view', v) }

  return <>
    <Nav title="Pátio ativo" onBack={onBack} backLabel="Início" sub={`${ativos.filter(naOficina).length} na oficina${ativos.filter(comCondutor).length ? ` · ${ativos.filter(comCondutor).length} com o condutor` : ''}`}
      right={<button className="ibtn solid" onClick={entrada} aria-label="Nova entrada" title="Nova entrada"><Ic n="plus" /></button>} />
    <div className="stack">
      <label className="search"><Ic n="search" sm /><input id="pq" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar placa, modelo, protocolo ou OS" autoComplete="off" /></label>
      <div className="hscroll">{Object.entries(LISTAS).map(([k, l]) =>
        <button key={k} className="fchip" aria-pressed={seg === k} onClick={() => setSeg(k)}>{l.t} <b>{ativos.filter(l.f).length}</b></button>)}</div>
      <div className="toolbar" style={{ marginTop: 0 }}>
        <select id="ploc" value={loc} onChange={e => setLoc(e.target.value)} aria-label="Locadora"><option value="">Todas as locadoras</option>{locadoras.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select>
        <select id="presp" value={resp} onChange={e => setResp(e.target.value)} aria-label="Responsável"><option value="">Todos os responsáveis</option>{resps.map(r => <option key={r}>{r}</option>)}</select>
        <select id="pdias" value={minDias} onChange={e => setMinDias(+e.target.value)} aria-label="Tempo no pátio"><option value={0}>Qualquer tempo no pátio</option>{[1, 3, 7, 15, 30].map(d => <option key={d} value={d}>No pátio há {d}+ dia{d > 1 ? 's' : ''}</option>)}</select>
        <label className="search" style={{ flex: '0 0 auto', padding: '0 8px' }} title="Entrada a partir de">Entrada desde<input id="pdesde" type="date" value={desde} onChange={e => setDesde(e.target.value)} style={{ padding: '6px 0', fontSize: 13.5 }} /></label>
        <select id="psort" value={ord} onChange={e => setOrd(e.target.value)} aria-label="Ordenar"><option value="tempo">Mais tempo no pátio</option><option value="parado">Mais tempo sem atualização</option><option value="recente">Entrada mais recente</option></select>
        <Seg value={view} onChange={mudarView} options={[['etapas', 'Etapas'], ['tabela', 'Tabela'], ['quadro', 'Quadro']]} />
      </div>
      {view === 'quadro' ? <div className="kb">{OPERACIONAL.map(o => { const c = rows.filter(a => a.sit_operacional === o); return <div className="kcol" key={o}>
        <h4><span>{o}</span><span className="muted">{c.length}</span></h4>
        {c.length ? c.map(a => <button key={a.id} className="kcard" onClick={() => nav.push({ r: 'at', id: a.id })}>
          <div className="r1"><Plate p={a.placa} /><span className={`dot ${alerta(a)}`} /></div>
          <div className="r2">{a.modelo} · {locNome(a.locadora_id)}</div>
          <div className="chips"><Pill s={a.sit_comercial} /><span className="pill">{dur(tempoNoPatio(a))}</span>{comCondutor(a) && <span className="tag r">Com o condutor</span>}{faturado(a) > 0 && <span className="tag g">Nota</span>}</div>
        </button>) : <div className="muted sm" style={{ padding: 4 }}>Vazio</div>}
      </div> })}</div>
        : view === 'tabela' ? (rows.length ? <div className="tblwrap"><table><thead><tr>{['Placa', 'Modelo', 'Locadora', 'Onde está', 'Nota', 'Condutor', 'Entrada', 'No pátio', 'Comercial', 'Operacional', 'Fiscal', 'Local', 'Responsável', 'Motivo da espera', 'Últ. atualização'].map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{rows.map(a => <tr key={a.id} onClick={() => nav.push({ r: 'at', id: a.id })} style={{ cursor: 'pointer' }}>
            <td><Plate p={a.placa} /></td><td>{a.modelo}</td><td>{locNome(a.locadora_id)}</td><td>{comCondutor(a) ? <span className="tag r">Com o condutor</span> : a.local}</td><td>{faturado(a) > 0 ? <span className="tag g">Emitida</span> : <span className="tag">Sem nota</span>}</td><td>{a.condutor}</td><td>{fDataHora(a.entrada)}</td><td>{dur(tempoNoPatio(a))}</td>
            <td><Pill s={a.sit_comercial} /></td><td><Pill s={a.sit_operacional} /></td><td><Pill s={a.sit_fiscal} /></td><td>{a.local}</td><td>{a.responsavel}</td><td>{a.motivo_espera || '—'}</td><td>{fDataHora(ultimaAtualizacao(a))}</td>
          </tr>)}</tbody></table></div> : <Lista itens={[]} vazio="Nenhum veículo nesta lista." />)
          : rows.length ? <div className="vlist">{rows.map(a => <VCard key={a.id} a={a} />)}</div>
          : <Lista itens={[]} vazio={ativos.length ? 'Nenhum veículo nesta lista.' : 'Nenhum veículo no pátio. Toque em + para registrar a primeira entrada.'} />}
      <p className="foot"><span className="dot w" style={{ display: 'inline-block' }} /> sem atualização há mais de 3 dias &nbsp; <span className="dot c" style={{ display: 'inline-block' }} /> há mais de 7 dias</p>
    </div>
  </>
}

export function Inicio() {
  const { ativos, me, versao, locNome } = useStore(); const nav = useNav(); const entrada = useEntrada()
  const [entreguesHoje, setEntreguesHoje] = useState<number | null>(null)
  useEffect(() => { // entregues não estão em "ativos" (só o pátio): conta direto no banco, desde 00h de Cuiabá
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cuiaba' }).format(new Date())
    supabase.from('atendimentos').select('id', { count: 'exact', head: true }).eq('sit_fisica', 'entregue').gte('saida', new Date(`${hoje}T00:00:00-04:00`).toISOString())
      .then(r => setEntreguesHoje(r.error ? null : r.count ?? 0))
  }, [versao])
  const P = ativos.filter(noPatio)
  const n = (k: string) => ativos.filter(LISTAS[k].f).length
  const parados = (d: number) => P.filter(a => semAtualizacao(a) > d * 864e5).length
  const h = new Date().getHours(), saud = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
  const lista = (k: string) => () => nav.push({ r: 'patio', id: k })
  // ordem de interesse: o que está em serviço vem antes do que espera
  const ordem = (a: Atendimento) => 'xgvowybr'.indexOf(estadoPrincipal(a).tom || 'r')
  const garagem = [...P].sort((a, b) => ordem(a) - ordem(b) || +new Date(b.atualizado_em) - +new Date(a.atualizado_em))
  const destaque = garagem.find(a => identificarModelo(a.modelo))
  const foto = identificarModelo(destaque?.modelo ?? '') ?? { nome: '', arquivo: FOTO_CAPA }
  const est = destaque && estadoPrincipal(destaque)
  const placar: [string, string, number | null, string, (() => void) | undefined][] = [
    ['orc', 'Aguardando orçamento', n('orc'), 'y', lista('orc')],
    ['aprov', 'Aguardando aprovação', n('aprov'), 'o', lista('aprov')],
    ['aprovados', 'Aprovados', n('aprovados'), 'g', lista('aprovados')],
    ['exec', 'Em execução', n('exec'), 'x', lista('exec')],
    ['pecas', 'Aguardando peças', n('pecas'), 'v', lista('pecas')],
    ['prontos', 'Prontos para entrega', n('prontos'), 'w', lista('prontos')],
    ['fora', 'Com o condutor', n('fora'), '', lista('fora')],
    ['entregues', 'Entregues hoje', entreguesHoje, 'g', undefined],
  ]
  return <>
    <Nav title="" right={<button className="ibtn solid" onClick={entrada} aria-label="Nova entrada" title="Nova entrada"><Ic n="plus" /></button>} />
    <section className="capa">
      <img src={urlImagem(foto.arquivo, 1600)} alt={destaque ? `Foto ilustrativa de um ${foto.nome}` : ''} />
      <div className="capa-txt">
        <span className="capa-data">{saud}, {me?.nome ?? ''} · {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Cuiaba' })}</span>
        <h1><b>{P.filter(naOficina).length}</b> {P.filter(naOficina).length === 1 ? 'veículo' : 'veículos'} na oficina</h1>
        {destaque && est && <button className={`capa-dest st-${est.tom}`} onClick={() => nav.push({ r: 'at', id: destaque.id })}>
          <span className="est">{est.t}</span><b>{destaque.modelo} · {destaque.placa}</b><span>{locNome(destaque.locadora_id)}</span></button>}
      </div>
      <small className="capa-cred">Foto ilustrativa · <a href={paginaImagem(foto.arquivo)} target="_blank" rel="noopener noreferrer">Wikimedia Commons</a></small>
    </section>
    {P.length > 0 && <div className="placar">{placar.map(([k, t, v, st, abrir]) =>
      <button key={k} className={`${st ? 'st-' + st : ''} ${v ? '' : 'zero'}`} onClick={abrir} disabled={!abrir} style={abrir ? undefined : { cursor: 'default' }}>
        <b>{v ?? '—'}</b><span>{t}</span></button>)}</div>}
    {!P.length && <section className="sec"><div className="empty" style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
      <b style={{ color: 'var(--label)', fontSize: 16 }}>Nenhum veículo no pátio</b>
      <span>Registre a primeira entrada. A locadora pode ser cadastrada no mesmo formulário.</span>
      <button className="btn" onClick={entrada}><Ic n="plus" sm /> Nova entrada</button></div></section>}
    {P.length > 0 && <Section title="Veículos" right={<button className="tbtn" onClick={() => nav.go('patio')}>Ver o pátio ({P.length})</button>}>
      <div className="garagem">{garagem.slice(0, 8).map(a => <LinhaVeiculo key={a.id} a={a} />)}</div>
    </Section>}
    {P.length > 0 && <Section title="Parados sem atualização">
      <div className="stops">{[3, 7, 15, 30].map(d => <button key={d} className={parados(d) && d >= 7 ? 'hot' : ''} onClick={() => nav.push({ r: 'parados', id: String(d) })}><b>{parados(d)}</b><span>+ de {d} dias</span></button>)}</div>
    </Section>}
  </>
}

/** Linha da garagem no início: foto do modelo, nome, placa, cliente, estado e tempo no pátio. */
function LinhaVeiculo({ a }: { a: Atendimento }) {
  const { locNome } = useStore(); const nav = useNav(); const e = estadoPrincipal(a)
  return <button className={`lv st-${e.tom}`} onClick={() => nav.push({ r: 'at', id: a.id })}>
    <CarroImg modelo={a.modelo} />
    <span className="lv-txt">
      <span className="est">{e.t}</span>
      <b className="lv-mod">{a.modelo || 'Modelo não informado'}</b>
      <span className="lv-sub"><Plate p={a.placa} />{locNome(a.locadora_id)}{a.servico ? ` · ${a.servico}` : ''}</span>
    </span>
    <span className="lv-fim"><span className="lv-tempo">{dur(tempoNoPatio(a))}<small>no pátio</small></span></span>
  </button>
}

export function Parados({ dias }: { dias: number }) {
  const { ativos } = useStore(); const nav = useNav()
  const L: Atendimento[] = ativos.filter(a => noPatio(a) && semAtualizacao(a) > dias * 864e5).sort((a, b) => semAtualizacao(b) - semAtualizacao(a))
  return <><Nav title={`Parados há mais de ${dias} dias`} onBack={nav.back} />
    <div className="group">{L.length ? L.map(a => <AtRow key={a.id} a={a} right={<><span className="big">{dur(semAtualizacao(a))}</span><span className="muted sm">sem atualização</span></>} />) : <div className="empty">Nenhum veículo parado nessa faixa.</div>}</div></>
}
