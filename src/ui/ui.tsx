import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { tom } from '../lib/domain'

// ---------- ícones ----------
const P: Record<string, ReactNode> = {
  grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></>,
  car: <><path d="M5 15.5V11l2.2-5h9.6l2.2 5v4.5" /><path d="M3.5 15.5h17v3h-17z" /><path d="M5 11h14" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>,
  plus: <path d="M12 5v14M5 12h14" />, chev: <path d="M9 6l6 6-6 6" />, back: <path d="M15 5l-7 7 7 7" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>, check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  move: <path d="M4 12h16M14 6l6 6-6 6" />, exit: <><path d="M10 4H5v16h5" /><path d="M14 8l4 4-4 4M18 12H9" /></>,
  archive: <><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v11h14V9M10 13h4" /></>, edit: <path d="M4 20h4L19 9l-4-4L4 16z" />,
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  undo: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>, out: <><path d="M10 4H5v16h5" /><path d="M16 16l4-4-4-4M20 12H9" /></>,
  x: <path d="M6 6l12 12M18 6L6 18" />, receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  chart: <path d="M5 20V11M11 20V5M17 20v-7M3 20h18" />,
  more: <><circle cx="5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="19" cy="12" r="1.6" fill="currentColor" /></>,
}
export const Ic = ({ n, sm, className = '' }: { n: string; sm?: boolean; className?: string }) =>
  <svg className={`ic ${sm ? 'sm' : ''} ${className}`} viewBox="0 0 24 24" aria-hidden="true">{P[n]}</svg>

// ---------- peças ----------
export const Pill = ({ s }: { s: string }) => <span className={`pill ${tom(s)}`}>{s}</span>
export const Plate = ({ p, lg }: { p: string; lg?: boolean }) =>
  <span className={`plate ${lg ? 'lg' : ''}`} aria-label={`Placa ${p}`}><span>{p}</span></span>
export const Brand = () => <span className="brand"><i>N</i>NETO AUTO CENTER</span>

export function Nav({ title, sub, onBack, backLabel = 'Voltar', right }: { title: string; sub?: ReactNode; onBack?: () => void; backLabel?: string; right?: ReactNode }) {
  return <>
    <div className="navbar"><div className="nb-in">
      {onBack ? <button className="tbtn back" onClick={onBack}><Ic n="back" /><span>{backLabel}</span></button> : <Brand />}
      <span className="nb-title">{title}</span>
      <div className="nb-r">{right}</div>
    </div></div>
    {title && <header className="large"><h1>{title}</h1>{sub && <p className="sub">{sub}</p>}</header>}
  </>
}

export const Group = ({ children, empty }: { children?: ReactNode; empty?: string }) => {
  const has = Array.isArray(children) ? children.some(Boolean) && children.flat().length > 0 : !!children
  return <div className="group">{has ? children : <div className="empty">{empty ?? 'Nada por aqui.'}</div>}</div>
}
export const KV = ({ k, v, strong }: { k: ReactNode; v: ReactNode; strong?: boolean }) =>
  <div className="row kv"><span className="k">{k}</span><span className={`v ${strong ? 'strong' : ''}`}>{v}</span></div>
export const Section = ({ title, right, children, foot }: { title: ReactNode; right?: ReactNode; children: ReactNode; foot?: ReactNode }) =>
  <section className="sec"><h3 className="sh"><span>{title}</span>{right}</h3>{children}{foot && <p className="foot">{foot}</p>}</section>

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="seg" role="group">{options.map(([v, t]) =>
    <button key={v} aria-pressed={v === value} onClick={() => onChange(v)}>{t}</button>)}</div>
}
export const Tile = ({ label, value, foot, cls = '', money, onClick }: { label: string; value: ReactNode; foot?: ReactNode; cls?: string; money?: boolean; onClick?: () => void }) =>
  <button className={`tile ${cls}`} onClick={onClick} style={onClick ? undefined : { cursor: 'default' }}>
    <span className="tl">{label}</span>{onClick && <Ic n="chev" className="chev" />}
    <span className={`tv ${money ? 'money' : ''}`}>{value}</span>{foot && <span className="tf">{foot}</span>}
  </button>

// ---------- campos de formulário (não controlados, lidos via FormData) ----------
export const Field = ({ label, children, col }: { label: string; children: ReactNode; col?: boolean }) =>
  <label className={`f ${col ? 'col' : ''}`}><span>{label}</span>{children}</label>
export const Fg = ({ children }: { children: ReactNode }) => <div className="fg">{children}</div>
export const Note = ({ children }: { children: ReactNode }) => <p className="fnote">{children}</p>
export function Select({ name, value, options, disabled }: { name: string; value?: string; options: (string | [string, string])[]; disabled?: boolean }) {
  return <select id={`f_${name}`} name={name} defaultValue={value} disabled={disabled}>
    {options.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return <option key={v} value={v}>{t}</option> })}
  </select>
}

// ---------- folha (modal estilo iOS) ----------
export interface SheetSpec {
  title: string
  body: ReactNode
  saveLabel?: string
  /** devolve texto = erro mostrado; nada = sucesso */
  onSave?: (fd: Record<string, string>) => Promise<string | void> | string | void
  done?: string
}
const SheetCtx = createContext<{ open: (s: SheetSpec) => void; close: () => void; toast: (m: string) => void }>({ open: () => {}, close: () => {}, toast: () => {} })
export const useSheet = () => useContext(SheetCtx)

export function SheetProvider({ children }: { children: ReactNode }) {
  const [spec, setSpec] = useState<SheetSpec | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [toastOn, setToastOn] = useState(false)
  const form = useRef<HTMLFormElement>(null)
  const tt = useRef<number>()
  const toast = (m: string) => { if (!m) return; setMsg(m); setToastOn(true); clearTimeout(tt.current); tt.current = window.setTimeout(() => setToastOn(false), 2800) }
  const close = () => { setSpec(null); setBusy(false) }
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    addEventListener('keydown', k); return () => removeEventListener('keydown', k)
  }, [])
  async function save() {
    if (!spec?.onSave || busy || !form.current) return
    const fd: Record<string, string> = {}
    new FormData(form.current).forEach((v, k) => { fd[k] = String(v) })
    form.current.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach(c => { fd[c.name] = c.checked ? '1' : '' })
    setBusy(true)
    try {
      const r = await spec.onSave(fd)
      if (typeof r === 'string') { toast(r); return }
      const done = spec.done; close(); if (done) toast(done)
    } catch (e) { toast((e as Error).message) } finally { setBusy(false) }
  }
  return <SheetCtx.Provider value={{ open: s => setSpec(s), close, toast }}>
    {children}
    {spec && <div id="sheet">
      <div className="scrim" onClick={close} />
      <div className="panel" role="dialog" aria-modal="true" aria-label={spec.title}>
        <div className="grab" />
        <header className="sh-h">
          <button className="tbtn" onClick={close}>{spec.onSave ? 'Cancelar' : 'Fechar'}</button>
          <h2>{spec.title}</h2>
          {spec.onSave ? <button className="tbtn strong" disabled={busy} onClick={save}>{busy ? 'Salvando…' : spec.saveLabel ?? 'Salvar'}</button> : <span />}
        </header>
        <form ref={form} className="sh-b" autoComplete="off" noValidate onSubmit={e => { e.preventDefault(); save() }}>{spec.body}</form>
      </div>
    </div>}
    <div id="toast" role="status" aria-live="polite" className={toastOn ? 'on' : ''}>{msg}</div>
  </SheetCtx.Provider>
}
