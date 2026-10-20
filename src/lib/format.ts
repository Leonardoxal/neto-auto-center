// Formatação em português do Brasil, sempre no fuso da oficina.
export const FUSO = 'America/Cuiaba'
const pad = (n: number) => String(n).padStart(2, '0')

const partes = (x: string | number | Date) => {
  const f = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  const o: Record<string, string> = {}
  for (const p of f.formatToParts(new Date(x))) o[p.type] = p.value
  return o
}
export const fData = (x?: string | number | Date | null) => { if (!x) return '—'; const p = partes(x); return `${p.day}/${p.month}/${p.year}` }
export const fHora = (x: string | number | Date) => { const p = partes(x); return `${p.hour === '24' ? '00' : p.hour}:${p.minute}` }
export const fDataHora = (x?: string | number | Date | null) => (x ? `${fData(x)} ${fHora(x)}` : '—')

/** valor para <input type="datetime-local"> no fuso da oficina */
export const paraInputLocal = (x: string | number | Date) => { const p = partes(x); return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}` }
/** converte o valor do <input datetime-local> (fuso da oficina, UTC−4) em ISO */
export const deInputLocal = (s: string) => (s ? new Date(s + ':00-04:00').toISOString() : new Date().toISOString())

export const brl = (v?: number | null) => (v == null || isNaN(v) ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
export const pct = (v?: number | null) => (v == null || isNaN(v) ? '—' : (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%')
export function dur(ms?: number | null) {
  if (ms == null || isNaN(ms)) return null
  ms = Math.max(0, ms)
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4)
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}min` : `${m}min`
}
export const durOu = (ms?: number | null) => dur(ms) ?? 'Dados insuficientes'
export function numero(s: string | null | undefined): number | null {
  if (s == null) return null
  let t = String(s).trim().replace(/[R$\s]/g, '')
  if (!t) return null
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(t)
  return isNaN(n) ? null : n
}
export { pad }
