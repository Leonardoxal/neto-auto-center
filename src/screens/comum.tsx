import { createContext, useContext, type ReactNode } from 'react'
import { alerta, comCondutor, etapas, FISICA, faturado as faturadoAt, noPatio, semAtualizacao, tempoNoPatio, type Atendimento } from '../lib/domain'
import { brl, deInputLocal, dur, fData, fDataHora, paraInputLocal } from '../lib/format'
import { useStore } from '../lib/store'
import { Field, Fg, Ic, Note, Pill, Plate, useSheet } from '../ui/ui'

export type Rota = { r: 'at'; id: string } | { r: 'loc'; id: string } | { r: string; id?: string }
export const NavCtx = createContext<{ push: (r: Rota) => void; back: () => void; go: (t: string) => void }>({ push: () => {}, back: () => {}, go: () => {} })
export const useNav = () => useContext(NavCtx)

export function AtRow({ a, right }: { a: Atendimento; right?: ReactNode }) {
  const { locNome } = useStore(); const nav = useNav()
  const al = alerta(a)
  return <button className="row" onClick={() => nav.push({ r: 'at', id: a.id })}>
    <span className={`dot ${al}`} title={al ? 'Sem atualização há ' + dur(semAtualizacao(a)) : ''} />
    <div className="rm">
      <div className="r1"><Plate p={a.placa} /><span className="muted sm">{a.modelo || 'Modelo não informado'}</span></div>
      <div className="r2">{locNome(a.locadora_id)} · {a.local}{a.motivo_espera && noPatio(a) ? ' · ' + a.motivo_espera : ''}</div>
      <div className="chips">
        <Pill s={a.sit_comercial} /><Pill s={a.sit_operacional} />
        {a.sit_fiscal !== 'Não faturado' && <Pill s={a.sit_fiscal} />}
        {!noPatio(a) && <Pill s={a.arquivado ? 'Arquivado' : FISICA[a.sit_fisica]} />}
      </div>
    </div>
    <div className="rr">{right ?? <><span className="big">{dur(tempoNoPatio(a))}</span><span className="muted sm">{a.saida ? 'permanência' : 'no pátio'}</span></>}</div>
    <Ic n="chev" className="chev" />
  </button>
}

export const Lista = ({ itens, vazio }: { itens: Atendimento[]; vazio: string }) =>
  <div className="group">{itens.length ? itens.map(a => <AtRow key={a.id} a={a} />) : <div className="empty">{vazio}</div>}</div>

// ---------- presença: veículo na oficina ou com o condutor ----------

export function usePresenca() {
  const store = useStore(); const sheet = useSheet()
  return (a: Atendimento) => {
    if (!store.pode('presenca')) { sheet.toast(`O perfil ${store.me?.perfil} não pode fazer isso.`); return }
    const fora = comCondutor(a)
    sheet.open({
      title: fora ? 'Veículo voltou à oficina' : 'Condutor levou o veículo', saveLabel: 'Confirmar',
      done: fora ? 'Veículo de volta à oficina' : 'Registrado: veículo com o condutor',
      body: <>
        {!fora && <div className="hint warn">O atendimento continua ativo (orçamento, aprovação, nota). Só a localização do veículo muda para "com o condutor". Use <b>Saída</b> quando o atendimento terminar.</div>}
        <Fg><Field label="Quando"><input name="t" type="datetime-local" defaultValue={paraInputLocal(new Date())} /></Field>
          <Field label="Observação" col><textarea name="obs" placeholder={fora ? 'Opcional' : 'Ex.: levou aguardando aprovação da locadora'} /></Field></Fg>
        <Note>Fica registrado no histórico e nas movimentações do veículo.</Note>
      </>,
      onSave: f => store.rpc('marcar_presenca', { p_at: a.id, p_na_oficina: fora, p_em: deInputLocal(f.t), p_obs: f.obs ?? '' }),
    })
  }
}

export function Etapas({ a }: { a: Atendimento }) {
  const E = etapas(a)
  const atual = a.saida ? -1 : E.findIndex(e => !e.feito)
  let ult = -1; E.forEach((e, i) => { if (e.feito) ult = i })
  const pctFill = ult <= 0 ? 0 : (ult / (E.length - 1)) * 100
  const cap = a.saida ? 'Atendimento encerrado' : atual >= 0 ? `Próxima etapa: ${E[atual].t}` : 'Todas as etapas feitas'
  const alertas = E.filter(e => e.alerta && e.sub).map(e => e.sub)
  return <><div className="steps" style={{ gridTemplateColumns: `repeat(${E.length},minmax(0,1fr))` }} aria-label="Etapas do atendimento">
    <div className="trk" style={{ left: `${50 / E.length}%`, right: `${50 / E.length}%` }} />
    <div className="fill" style={{ left: `${50 / E.length}%`, width: `calc(${pctFill}% * ${(E.length - 1) / E.length})` }} />
    {E.map((e, i) => {
      const cls = e.alerta && (e.feito || i === atual) ? e.alerta : e.feito ? 'done' : i === atual ? 'cur' : ''
      return <div key={e.t + i} className={`step ${cls} ${i === atual ? 'cur' : ''}`}>
        <span className="c">{e.feito && !e.alerta ? <Ic n="check" /> : e.alerta === 'r' ? '!' : i + 1}</span>
        <span className="lb">{e.t}</span>{e.sub && <span className="sb">{e.sub}</span>}
      </div>
    })}
  </div><div className="stepcap"><b>{cap}</b>{alertas.length ? ' · ' + alertas.join(' · ') : ''} · {E.filter(e => e.feito).length} de {E.length} etapas</div></>
}

export function VCard({ a }: { a: Atendimento }) {
  const { locNome, pode: podeFn } = useStore(); const nav = useNav(); const presenca = usePresenca()
  const fat = faturadoAt(a), fora = comCondutor(a), al = alerta(a)
  const abrir = () => nav.push({ r: 'at', id: a.id })
  return <div className="vcard" role="button" tabIndex={0} onClick={abrir} onKeyDown={e => { if (e.key === 'Enter') abrir() }}>
    <div className="vtop">
      <div className="vtit">
        <div className="l1"><b>{a.modelo || 'Modelo não informado'}</b><Plate p={a.placa} />
          {a.os ? <span className="ndoc os">{a.os}</span> : <span className="ndoc at">{a.numero}</span>}</div>
        <div className="chips">
          {fat > 0 ? <span className="tag g">Nota emitida · {brl(fat)}</span> : <span className="tag">Sem nota</span>}
          {fora ? <span className="tag r">Fora da oficina · com o condutor{a.fora_desde ? ' desde ' + fData(a.fora_desde) : ''}</span> : <span className="tag">Na oficina · {a.local}</span>}
          {al && <span className={`tag ${al === 'c' ? 'r' : 'o'}`}>Parado há {dur(semAtualizacao(a))}</span>}
          {a.motivo_espera && <span className="tag o">{a.motivo_espera}</span>}
        </div>
      </div>
      <div className="vmeta">
        <span><b>{locNome(a.locadora_id)}</b></span>
        {a.condutor && <span>{a.condutor}</span>}
        <span>Entrada {fDataHora(a.entrada)} · <b>{dur(tempoNoPatio(a))}</b></span>
        {a.responsavel && <span>Resp.: {a.responsavel}</span>}
      </div>
    </div>
    <Etapas a={a} />
    {podeFn('presenca') && noPatio(a) && <div className="vact">
      <button className="btn ghost sm" onClick={e => { e.stopPropagation(); presenca(a) }}>{fora ? 'Voltou à oficina' : 'Condutor levou o veículo'}</button>
    </div>}
  </div>
}
