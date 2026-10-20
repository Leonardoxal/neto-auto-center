// Relatórios: cálculos puros sobre a lista de atendimentos (histórico completo).
// Cada indicador usa a data do próprio evento: entrada, saída, aprovação, negociação ou emissão da nota.
import {
  FISICA, LISTAS, descontoConcedido, faturado, noPatio, tempoAprovacao, valorInicial, type Atendimento, type Locadora,
} from './domain'
import { brl, dur, durOu, fData, fDataHora, pct } from './format'

export type Formato = 'n' | 'r' | 'd' | 'p'
export type Card = [string, number | string | null, Formato]
export interface Tabela { title: string; cols: string[]; rows: (string | number)[][]; ids?: string[]; locIds?: string[]; placaCol?: number }
export interface Relatorio { cards: Card[]; pre?: Tabela[]; main: Tabela }

export const TIPOS: [string, string][] = [
  ['ger', 'Resumo gerencial'], ['mes', 'Comparativo mensal'], ['patio', 'Pátio'], ['aprov', 'Aprovações'],
  ['fat', 'Faturamento'], ['loc', 'Por locadora'], ['fech', 'Fechamento'],
]
export const PERIODOS: [string, string][] = [['hoje', 'Hoje'], ['sem', 'Semana'], ['semant', 'Sem. anterior'], ['mes', 'Mês'], ['mesant', 'Mês anterior'], ['custom', 'Personalizado']]
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// ---------- datas no fuso da oficina (UTC−4, sem horário de verão) ----------
const OFF = 4 * 36e5
const local = (ms: number) => new Date(ms - OFF) // campos UTC deste Date = relógio da oficina
const doLocal = (y: number, m: number, d: number, fim = false) => Date.UTC(y, m, d, fim ? 23 : 0, fim ? 59 : 0, fim ? 59 : 0, fim ? 999 : 0) + OFF
export type Range = [number, number]
export function range(p: string, ci?: string, cf?: string, agora = Date.now()): Range {
  const n = local(agora), y = n.getUTCFullYear(), m = n.getUTCMonth(), d = n.getUTCDate()
  if (p === 'hoje') return [doLocal(y, m, d), doLocal(y, m, d, true)]
  if (p === 'sem' || p === 'semant') {
    const dow = (n.getUTCDay() + 6) % 7, ini = d - dow - (p === 'semant' ? 7 : 0)
    return [doLocal(y, m, ini), doLocal(y, m, ini + 6, true)]
  }
  if (p === 'mes') return [doLocal(y, m, 1), doLocal(y, m + 1, 0, true)]
  if (p === 'mesant') return [doLocal(y, m - 1, 1), doLocal(y, m, 0, true)]
  const pd = (s: string | undefined, fb: number) => { if (!s) return local(fb); const [a, b, c] = s.split('-').map(Number); return new Date(Date.UTC(a, b - 1, c)) }
  let A = pd(ci, agora - 7 * 864e5), B = pd(cf, agora); if (A > B) [A, B] = [B, A]
  return [doLocal(A.getUTCFullYear(), A.getUTCMonth(), A.getUTCDate()), doLocal(B.getUTCFullYear(), B.getUTCMonth(), B.getUTCDate(), true)]
}
export function rangeAnterior(p: string, [ini, fim]: Range): Range {
  if (p === 'mes' || p === 'mesant') { const l = local(ini); return [doLocal(l.getUTCFullYear(), l.getUTCMonth() - 1, 1), doLocal(l.getUTCFullYear(), l.getUTCMonth(), 0, true)] }
  const len = fim - ini + 1; return [ini - len, ini - 1]
}
const mesesAte = (fim: number, n: number): { a: number; b: number; rot: string }[] => {
  const l = local(fim), y = l.getUTCFullYear(), m = l.getUTCMonth(), out = []
  for (let i = n - 1; i >= 0; i--) { const a = doLocal(y, m - i, 1), b = doLocal(y, m - i + 1, 0, true), la = local(a); out.push({ a, b, rot: `${MESES[la.getUTCMonth()]}/${la.getUTCFullYear()}` }) }
  return out
}

// ---------- utilidades ----------
const T = (x: string | null | undefined) => (x ? +new Date(x) : null)
const sum = (a: number[]) => a.reduce((s, x) => s + (+x || 0), 0)
const mean = (a: number[]) => (a.length ? sum(a) / a.length : null)
const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2 }
const uniq = <X,>(a: X[]) => [...new Set(a)]
export const fmtCard = (v: Card[1], f: Formato) => (v == null ? '—' : typeof v === 'string' ? v : f === 'r' ? brl(v) : f === 'd' ? dur(v) ?? '—' : f === 'p' ? pct(v) : String(v))
export function delta(cur: Card[1], prev: Card[1], inverso = false): { txt: string; bom?: boolean } | null {
  if (typeof cur !== 'number' || typeof prev !== 'number') return null
  if (!prev && !cur) return null
  if (!prev) return { txt: 'novo no período' }
  const d = (cur - prev) / Math.abs(prev)
  if (Math.abs(d) < 0.005) return { txt: 'igual ao anterior' }
  return { txt: `${d > 0 ? '+' : '−'}${pct(Math.abs(d))} vs anterior`, bom: inverso ? d < 0 : d > 0 }
}

/** indicadores gerenciais de um conjunto num intervalo */
export function gm(A: Atendimento[], ini: number, fim: number) {
  const at = (t: string | null | undefined) => { const x = T(t); return x != null && x >= ini && x <= fim }
  const ent = A.filter(a => at(a.entrada)), sai = A.filter(a => at(a.saida)), ap = A.filter(a => at(a.aprovado_em))
  const apE = ap.filter(a => a.enviado_em), ts = apE.map(a => T(a.aprovado_em)! - T(a.enviado_em)!)
  const nf = A.flatMap(a => (a.notas_fiscais ?? []).filter(n => !n.cancelada && at(n.emissao)).map(n => ({ a, n })))
  const nfAt = uniq(nf.map(x => x.a)), fat = sum(nf.map(x => +x.n.valor))
  const ds = A.flatMap(a => (a.descontos ?? []).filter(d => at(d.resposta_em)))
  const vA = sum(ap.map(a => +(a.valor_aprovado ?? 0))), apI = ap.filter(a => valorInicial(a))
  return {
    ent, sai, ap, apE, tMean: mean(ts), tMed: median(ts), nf, nfAt, fat, vA,
    tkA: ap.length ? vA / ap.length : null, tkF: nfAt.length ? fat / nfAt.length : null,
    dSol: sum(ds.map(d => +d.solicitado)), dConc: sum(ds.map(d => +d.concedido)),
    dPct: ds.length ? sum(ds.map(d => +d.concedido)) / sum(ds.map(d => +d.base)) : null,
    red: apI.length ? (sum(apI.map(a => valorInicial(a)!)) - sum(apI.map(a => +(a.valor_aprovado ?? 0)))) / sum(apI.map(a => valorInicial(a)!)) : null,
    comD: ap.filter(a => (a.descontos ?? []).length), vol: uniq([...ent, ...ap, ...nfAt, ...sai]),
  }
}

export function relatorio(tipo: string, A: Atendimento[], [ini, fim]: Range, locadoras: Locadora[], opts: { meses?: number } = {}): Relatorio {
  const locNome = (id: string) => locadoras.find(l => l.id === id)?.nome ?? '—'
  const at = (t: string | null | undefined) => { const x = T(t); return x != null && x >= ini && x <= fim }
  const presente = (a: Atendimento) => T(a.entrada)! <= fim && (!a.saida || T(a.saida)! > fim)
  const situacao = (a: Atendimento) => (noPatio(a) ? a.sit_operacional : a.arquivado ? 'Arquivado' : FISICA[a.sit_fisica])

  if (tipo === 'ger') {
    const g = gm(A, ini, fim), set = [...g.vol].sort((a, b) => T(a.entrada)! - T(b.entrada)!)
    const locs = locadoras.map(l => ({ l, x: gm(A.filter(a => a.locadora_id === l.id), ini, fim) })).filter(r => r.x.vol.length).sort((a, b) => b.x.vA + b.x.fat - (a.x.vA + a.x.fat))
    return {
      cards: [['Entradas', g.ent.length, 'n'], ['Saídas', g.sai.length, 'n'], ['Aprovados', g.ap.length, 'n'], ['Valor aprovado', g.vA, 'r'],
        ['Ticket médio aprovado', g.tkA, 'r'], ['Faturado', g.fat, 'r'], ['Ticket médio faturado', g.tkF, 'r'], ['Tempo médio para aprovar', g.tMean, 'd'],
        ['Tempo mediano para aprovar', g.tMed, 'd'], ['% desconto concedido', g.dPct, 'p'], ['Redução inicial → aprovado', g.red, 'p'],
        ['Aprovados com desconto', g.ap.length ? `${g.comD.length} de ${g.ap.length}` : null, 'n']],
      pre: [{ title: 'Por locadora', cols: ['Locadora', 'Entradas', 'Aprovados', 'Valor aprovado', 'Ticket médio', 'Tempo médio p/ aprovar', '% desconto', 'Faturado', 'No pátio agora'],
        rows: locs.map(({ l, x }) => [l.nome, x.ent.length, x.ap.length, brl(x.vA), brl(x.tkA), x.tMean != null ? `${dur(x.tMean)} (n=${x.apE.length})` : 'Dados insuficientes', x.dPct != null ? pct(x.dPct) : '—', brl(x.fat), A.filter(a => a.locadora_id === l.id && noPatio(a)).length]),
        locIds: locs.map(r => r.l.id) }],
      main: { title: 'Atendimentos com movimento no período', placaCol: 0,
        cols: ['Placa', 'Modelo', 'Locadora', 'Entrada', 'Valor inicial', 'Aprovado', 'Desconto', '% desc.', 'Tempo p/ aprovar', 'Faturado', 'Saída', 'Situação atual'],
        rows: set.map(a => { const t = tempoAprovacao(a); const d0 = a.descontos?.[0]
          return [a.placa, a.modelo || '—', locNome(a.locadora_id), fData(a.entrada), brl(valorInicial(a)), brl(a.valor_aprovado == null ? null : +a.valor_aprovado),
            d0 ? brl(descontoConcedido(a)) : '—', d0 ? pct(descontoConcedido(a) / +d0.base) : '—', t.pendente ? 'Pendente há ' + dur(t.ms) : t.recusado ? 'Recusado' : durOu(t.ms),
            faturado(a) ? brl(faturado(a)) : '—', a.saida ? fData(a.saida) : 'No pátio', situacao(a)] }),
        ids: set.map(a => a.id) },
    }
  }
  if (tipo === 'mes') {
    const n = opts.meses ?? 6, ms = mesesAte(fim, n).map(m => ({ ...m, g: gm(A, m.a, m.b) })), last = ms[ms.length - 1].g
    return {
      cards: [[`Faturado em ${ms[ms.length - 1].rot.slice(0, 3)}`, last.fat, 'r'], ['Ticket médio aprovado', last.tkA, 'r'], ['Tempo médio para aprovar', last.tMean, 'd'], ['% desconto concedido', last.dPct, 'p'],
        ['Entradas', last.ent.length, 'n'], ['Aprovados', last.ap.length, 'n'], [`Faturado nos ${n} meses`, sum(ms.map(m => m.g.fat)), 'r'], ['Média mensal faturada', sum(ms.map(m => m.g.fat)) / n, 'r']],
      main: { title: `Mês a mês · últimos ${n} meses`,
        cols: ['Mês', 'Entradas', 'Saídas', 'Aprovados', 'Valor aprovado', 'Ticket médio aprov.', 'Faturado', 'Ticket médio fat.', 'Var. faturado', 'Tempo médio p/ aprovar', '% desconto'],
        rows: ms.map((m, i) => { const pv = i ? ms[i - 1].g.fat : null, v = pv ? (m.g.fat - pv) / pv : null
          return [m.rot, m.g.ent.length, m.g.sai.length, m.g.ap.length, brl(m.g.vA), brl(m.g.tkA), brl(m.g.fat), brl(m.g.tkF), v == null ? '—' : (v >= 0 ? '+' : '−') + pct(Math.abs(v)), m.g.tMean != null ? dur(m.g.tMean)! : '—', m.g.dPct != null ? pct(m.g.dPct) : '—'] }) },
    }
  }
  if (tipo === 'patio') {
    const ent = A.filter(a => at(a.entrada)), sai = A.filter(a => at(a.saida)), p = A.filter(presente)
    const set = uniq([...ent, ...sai, ...p]).sort((a, b) => T(a.entrada)! - T(b.entrada)!)
    return {
      cards: [['Entradas', ent.length, 'n'], ['Saídas', sai.length, 'n'], ['No pátio no fechamento', p.length, 'n'], ['Permanência média das saídas', mean(sai.map(a => T(a.saida)! - T(a.entrada)!)), 'd']],
      main: { title: 'Detalhado', placaCol: 0, cols: ['Placa', 'Locadora', 'Entrada', 'Saída', 'Permanência', 'No fechamento', 'Situação atual', 'Motivo da espera'],
        rows: set.map(a => [a.placa, locNome(a.locadora_id), fDataHora(a.entrada), fDataHora(a.saida), durOu(Math.min(T(a.saida) ?? Date.now(), fim) - T(a.entrada)!),
          T(a.entrada)! > fim ? 'Ainda não entrou' : a.saida && T(a.saida)! <= fim ? 'Saiu' : 'No pátio', situacao(a), a.motivo_espera || '']), ids: set.map(a => a.id) },
    }
  }
  if (tipo === 'aprov') {
    const env = A.filter(a => at(a.enviado_em)), ap = A.filter(a => at(a.aprovado_em)), rc = A.filter(a => at(a.recusado_em))
    const pend = A.filter(a => a.enviado_em && T(a.enviado_em)! <= fim && !(a.aprovado_em && T(a.aprovado_em)! <= fim) && !(a.recusado_em && T(a.recusado_em)! <= fim))
    const ts = ap.filter(a => a.enviado_em).map(a => T(a.aprovado_em)! - T(a.enviado_em)!), ds = A.flatMap(a => (a.descontos ?? []).filter(d => at(d.resposta_em)))
    const set = uniq([...env, ...ap, ...rc, ...pend]).sort((a, b) => (T(a.enviado_em) ?? 0) - (T(b.enviado_em) ?? 0))
    const noFech = (a: Atendimento) => (a.aprovado_em && T(a.aprovado_em)! <= fim ? 'Aprovado' : a.recusado_em && T(a.recusado_em)! <= fim ? 'Recusado' : 'Pendente')
    return {
      cards: [['Enviados', env.length, 'n'], ['Aprovados', ap.length, 'n'], ['Recusados', rc.length, 'n'], ['Pendentes no fechamento', pend.length, 'n'],
        ['Tempo médio de aprovação', mean(ts), 'd'], ['Tempo mediano', median(ts), 'd'], ['Desconto solicitado', sum(ds.map(d => +d.solicitado)), 'r'], ['Desconto concedido', sum(ds.map(d => +d.concedido)), 'r']],
      main: { title: 'Detalhado', placaCol: 0, cols: ['Placa', 'Locadora', 'Enviado', 'Valor inicial', 'Valor aprovado', 'Desc. solicitado', 'Desc. concedido', '% redução', 'Tempo de aprovação', 'No fechamento', 'Situação atual'],
        rows: set.map(a => { const t = tempoAprovacao(a), vi = valorInicial(a), va = a.valor_aprovado == null ? null : +a.valor_aprovado
          return [a.placa, locNome(a.locadora_id), fDataHora(a.enviado_em), brl(vi), brl(va), brl(sum((a.descontos ?? []).map(d => +d.solicitado))), brl(descontoConcedido(a)),
            va && vi ? pct((vi - va) / vi) : '—', t.pendente ? 'Pendente há ' + dur(t.ms) : t.recusado ? 'Recusado' : durOu(t.ms), noFech(a), a.sit_comercial] }), ids: set.map(a => a.id) },
    }
  }
  if (tipo === 'fat') {
    const nf = A.flatMap(a => (a.notas_fiscais ?? []).filter(n => at(n.emissao)).map(n => ({ a, n }))), ok = nf.filter(x => !x.n.cancelada)
    return {
      cards: [['Faturado (data de emissão)', sum(ok.map(x => +x.n.valor)), 'r'], ['Notas emitidas', ok.length, 'n'], ['Notas canceladas', nf.length - ok.length, 'n'], ['Atendimentos faturados', uniq(ok.map(x => x.a)).length, 'n'],
        ['Concluídos sem nota (hoje)', A.filter(a => !a.arquivado && a.sit_operacional === 'Serviço concluído' && faturado(a) === 0 && a.sit_comercial !== 'Recusado').length, 'n'],
        ['Faturados ainda em serviço (hoje)', A.filter(LISTAS.fatserv.f).length, 'n'], ['Faturados parcialmente (hoje)', A.filter(a => a.sit_fiscal === 'Parcialmente faturado').length, 'n']],
      main: { title: 'Notas do período', placaCol: 2, cols: ['Nota', 'Tipo', 'Placa', 'Locadora', 'Emissão', 'Valor', 'Situação da nota', 'Operacional atual', 'Física atual'],
        rows: nf.map(({ a, n }) => [n.numero, n.tipo, a.placa, locNome(a.locadora_id), fData(n.emissao), brl(+n.valor), n.cancelada ? 'Cancelada' : 'Válida', a.sit_operacional, FISICA[a.sit_fisica]]), ids: nf.map(x => x.a.id) },
    }
  }
  if (tipo === 'loc') {
    const rows = locadoras.map(l => {
      const L = A.filter(a => a.locadora_id === l.id), x = gm(L, ini, fim)
      return { l, x, tp: mean(x.sai.map(a => T(a.saida)! - T(a.entrada)!)), pend: L.filter(noPatio).length, vi: sum(x.ent.map(a => valorInicial(a) ?? 0)) }
    }).filter(r => r.x.ent.length || r.x.vA || r.x.fat || r.pend)
    return {
      cards: [['Clientes atendidos', rows.filter(r => r.x.ent.length).length, 'n'], ['Atendimentos', sum(rows.map(r => r.x.ent.length)), 'n'], ['Valor aprovado', sum(rows.map(r => r.x.vA)), 'r'], ['Faturado', sum(rows.map(r => r.x.fat)), 'r']],
      main: { title: 'Comparativo', cols: ['Locadora', 'Atendimentos', 'Orç. inicial', 'Aprovado', 'Desc. concedido', 'Tempo médio aprov.', 'Permanência média', 'Faturado', 'No pátio agora'],
        rows: rows.map(r => [r.l.nome, r.x.ent.length, brl(r.vi), brl(r.x.vA), brl(r.x.dConc), r.x.tMean != null ? `${dur(r.x.tMean)} (n=${r.x.apE.length})` : 'Dados insuficientes', durOu(r.tp), brl(r.x.fat), r.pend]),
        locIds: rows.map(r => r.l.id) },
    }
  }
  // fechamento
  const rec = A.filter(a => at(a.entrada)), ent = A.filter(a => at(a.saida)), ant = A.filter(a => T(a.entrada)! < ini && presente(a)), pass = rec.filter(presente)
  const set: [Atendimento, string][] = [...rec.map(a => [a, 'Recebido no período'] as [Atendimento, string]), ...ent.map(a => [a, 'Entregue no período'] as [Atendimento, string]),
    ...ant.map(a => [a, 'De período anterior, segue no pátio'] as [Atendimento, string]), ...pass.map(a => [a, 'Passa para o próximo período'] as [Atendimento, string])]
  return {
    cards: [['Recebidos no período', rec.length, 'n'], ['Entregues no período', ent.length, 'n'], ['De períodos anteriores ainda no pátio', ant.length, 'n'], ['Recebidos que passam para o próximo período', pass.length, 'n']],
    main: { title: 'Detalhado', placaCol: 1, cols: ['Grupo', 'Placa', 'Locadora', 'Entrada', 'Saída', 'Situação atual'],
      rows: set.map(([a, g]) => [g, a.placa, locNome(a.locadora_id), fDataHora(a.entrada), fDataHora(a.saida), situacao(a)]), ids: set.map(x => x[0].id) },
  }
}

export function csv(titulo: string, periodo: string, r: Relatorio) {
  const q = (v: unknown) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
  const linhas = [`NETO AUTO CENTER — ${titulo}`, `Período;${periodo}`, '', ...r.cards.map(([l, v, f]) => q(l) + ';' + q(fmtCard(v, f)))]
  for (const t of [...(r.pre ?? []), r.main]) linhas.push('', q(t.title), t.cols.map(q).join(';'), ...t.rows.map(x => x.map(q).join(';')))
  return '﻿' + linhas.join('\n')
}
