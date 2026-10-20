import { createContext, useContext, type ReactNode } from 'react'
import { alerta, FISICA, noPatio, semAtualizacao, tempoNoPatio, type Atendimento } from '../lib/domain'
import { dur } from '../lib/format'
import { useStore } from '../lib/store'
import { Ic, Pill, Plate } from '../ui/ui'

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
