import { useState } from 'react'
import { alerta, LISTAS, OPERACIONAL, noPatio, semAtualizacao, tempoNoPatio, ultimaAtualizacao, type Atendimento } from '../lib/domain'
import { dur, fDataHora } from '../lib/format'
import { useStore } from '../lib/store'
import { Ic, Nav, Pill, Plate, Seg, Section, Tile } from '../ui/ui'
import { AtRow, Lista, useNav } from './comum'
import { useEntrada } from './Entrada'

const lembrar = (k: string, v?: string) => { try { if (v === undefined) return localStorage.getItem(k) ?? ''; localStorage.setItem(k, v) } catch { /* sem armazenamento */ } return '' }

export function Patio({ lista: inicial, onBack }: { lista?: string; onBack?: () => void }) {
  const { ativos, locadoras, locNome } = useStore(); const nav = useNav(); const entrada = useEntrada()
  const [seg, setSeg] = useState(inicial || 'todos')
  const [view, setView] = useState<'lista' | 'tabela' | 'quadro'>((lembrar('patio-view') as 'lista') || 'lista')
  const [q, setQ] = useState(''); const [loc, setLoc] = useState(''); const [resp, setResp] = useState(''); const [ord, setOrd] = useState('tempo')
  const L = LISTAS[seg] ?? LISTAS.todos
  const rows = ativos.filter(L.f).filter(a => (!loc || a.locadora_id === loc) && (!resp || a.responsavel === resp)
    && (!q || `${a.placa} ${a.modelo} ${locNome(a.locadora_id)} ${a.protocolo} ${a.os} ${a.numero}`.toUpperCase().includes(q.toUpperCase().trim())))
    .sort((a, b) => ord === 'tempo' ? tempoNoPatio(b) - tempoNoPatio(a) : ord === 'parado' ? semAtualizacao(b) - semAtualizacao(a) : +new Date(b.entrada) - +new Date(a.entrada))
  const resps = [...new Set(ativos.map(a => a.responsavel).filter(Boolean))]
  const mudarView = (v: typeof view) => { setView(v); lembrar('patio-view', v) }

  return <>
    <Nav title="Pátio ativo" onBack={onBack} backLabel="Início" sub={`${ativos.filter(noPatio).length} veículos fisicamente na oficina`}
      right={<button className="ibtn solid" onClick={entrada} aria-label="Nova entrada" title="Nova entrada"><Ic n="plus" /></button>} />
    <div className="stack">
      <label className="search"><Ic n="search" sm /><input id="pq" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar placa, modelo, protocolo ou OS" autoComplete="off" /></label>
      <div className="hscroll">{Object.entries(LISTAS).map(([k, l]) =>
        <button key={k} className="fchip" aria-pressed={seg === k} onClick={() => setSeg(k)}>{l.t} <b>{ativos.filter(l.f).length}</b></button>)}</div>
      <div className="toolbar" style={{ marginTop: 0 }}>
        <select id="ploc" value={loc} onChange={e => setLoc(e.target.value)} aria-label="Locadora"><option value="">Todas as locadoras</option>{locadoras.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}</select>
        <select id="presp" value={resp} onChange={e => setResp(e.target.value)} aria-label="Responsável"><option value="">Todos os responsáveis</option>{resps.map(r => <option key={r}>{r}</option>)}</select>
        <select id="psort" value={ord} onChange={e => setOrd(e.target.value)} aria-label="Ordenar"><option value="tempo">Mais tempo no pátio</option><option value="parado">Mais tempo sem atualização</option><option value="recente">Entrada mais recente</option></select>
        <Seg value={view} onChange={mudarView} options={[['lista', 'Lista'], ['tabela', 'Tabela'], ['quadro', 'Quadro']]} />
      </div>
      {view === 'quadro' ? <div className="kb">{OPERACIONAL.map(o => { const c = rows.filter(a => a.sit_operacional === o); return <div className="kcol" key={o}>
        <h4><span>{o}</span><span className="muted">{c.length}</span></h4>
        {c.length ? c.map(a => <button key={a.id} className="kcard" onClick={() => nav.push({ r: 'at', id: a.id })}>
          <div className="r1"><Plate p={a.placa} /><span className={`dot ${alerta(a)}`} /></div>
          <div className="r2">{a.modelo} · {locNome(a.locadora_id)}</div>
          <div className="chips"><Pill s={a.sit_comercial} /><span className="pill">{dur(tempoNoPatio(a))}</span></div>
        </button>) : <div className="muted sm" style={{ padding: 4 }}>Vazio</div>}
      </div> })}</div>
        : view === 'tabela' ? (rows.length ? <div className="tblwrap"><table><thead><tr>{['Placa', 'Modelo', 'Locadora', 'Condutor', 'Entrada', 'No pátio', 'Comercial', 'Operacional', 'Fiscal', 'Local', 'Responsável', 'Motivo da espera', 'Últ. atualização'].map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{rows.map(a => <tr key={a.id} onClick={() => nav.push({ r: 'at', id: a.id })} style={{ cursor: 'pointer' }}>
            <td><Plate p={a.placa} /></td><td>{a.modelo}</td><td>{locNome(a.locadora_id)}</td><td>{a.condutor}</td><td>{fDataHora(a.entrada)}</td><td>{dur(tempoNoPatio(a))}</td>
            <td><Pill s={a.sit_comercial} /></td><td><Pill s={a.sit_operacional} /></td><td><Pill s={a.sit_fiscal} /></td><td>{a.local}</td><td>{a.responsavel}</td><td>{a.motivo_espera || '—'}</td><td>{fDataHora(ultimaAtualizacao(a))}</td>
          </tr>)}</tbody></table></div> : <Lista itens={[]} vazio="Nenhum veículo nesta lista." />)
          : <Lista itens={rows} vazio={ativos.length ? 'Nenhum veículo nesta lista.' : 'Nenhum veículo no pátio. Toque em + para registrar a primeira entrada.'} />}
      <p className="foot"><span className="dot w" style={{ display: 'inline-block' }} /> sem atualização há mais de 3 dias &nbsp; <span className="dot c" style={{ display: 'inline-block' }} /> há mais de 7 dias</p>
    </div>
  </>
}

export function Inicio() {
  const { ativos, me } = useStore(); const nav = useNav(); const entrada = useEntrada()
  const P = ativos.filter(noPatio)
  const n = (k: string) => ativos.filter(LISTAS[k].f).length
  const parados = (d: number) => P.filter(a => semAtualizacao(a) > d * 864e5).length
  const h = new Date().getHours(), saud = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
  const recentes = [...P].sort((a, b) => +new Date(b.entrada) - +new Date(a.entrada)).slice(0, 5)
  const lista = (k: string) => () => nav.push({ r: 'patio', id: k })
  return <>
    <Nav title="Início" sub={`${saud}, ${me?.nome ?? ''} · ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Cuiaba' })}`}
      right={<button className="ibtn solid" onClick={entrada} aria-label="Nova entrada" title="Nova entrada"><Ic n="plus" /></button>} />
    {!P.length && <section className="sec"><div className="group"><div className="empty" style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
      <b style={{ color: 'var(--label)', fontSize: 16 }}>Nenhum veículo no pátio</b>
      <span>Registre a primeira entrada. A locadora pode ser cadastrada no mesmo formulário.</span>
      <button className="btn" onClick={entrada}><Ic n="plus" sm /> Nova entrada</button></div></div></section>}
    <Section title="Pátio agora" right={<button className="tbtn" onClick={() => nav.go('patio')}>Abrir pátio</button>}>
      <div className="tiles t3">
        <Tile label="No pátio" value={P.length} foot="veículos fisicamente na oficina" onClick={lista('todos')} />
        <Tile label="Aguardando orçamento" value={n('orc')} onClick={lista('orc')} />
        <Tile label="Aguardando aprovação" value={n('aprov')} cls={n('aprov') ? 'warn' : ''} onClick={lista('aprov')} />
        <Tile label="Em execução" value={n('exec')} onClick={lista('exec')} />
        <Tile label="Aguardando peças" value={n('pecas')} cls={n('pecas') ? 'warn' : ''} onClick={lista('pecas')} />
        <Tile label="Prontos para entrega" value={n('prontos')} onClick={lista('prontos')} />
      </div>
      <h3 className="sh" style={{ marginTop: 16 }}>Parados sem atualização</h3>
      <div className="stops">{[3, 7, 15, 30].map(d => <button key={d} className={parados(d) && d >= 7 ? 'hot' : ''} onClick={() => nav.push({ r: 'parados', id: String(d) })}><b>{parados(d)}</b><span>+ de {d} dias</span></button>)}</div>
    </Section>
    {recentes.length > 0 && <Section title="Últimas entradas"><div className="group">{recentes.map(a => <AtRow key={a.id} a={a} />)}</div></Section>}
  </>
}

export function Parados({ dias }: { dias: number }) {
  const { ativos } = useStore(); const nav = useNav()
  const L: Atendimento[] = ativos.filter(a => noPatio(a) && semAtualizacao(a) > dias * 864e5).sort((a, b) => semAtualizacao(b) - semAtualizacao(a))
  return <><Nav title={`Parados há mais de ${dias} dias`} onBack={nav.back} />
    <div className="group">{L.length ? L.map(a => <AtRow key={a.id} a={a} right={<><span className="big">{dur(semAtualizacao(a))}</span><span className="muted sm">sem atualização</span></>} />) : <div className="empty">Nenhum veículo parado nessa faixa.</div>}</div></>
}
