// Contas a receber: notas, parcelas e recebimentos (regras puras).
export interface Recebimento { id: string; nota_id: string; parcela_id: string; data: string; valor: number; forma: string; obs: string; criado_em: string; usuario_nome: string; estornado_em: string | null; estornado_por_nome: string; motivo_estorno: string }
export interface Parcela { id: string; nota_id: string; numero: number; vencimento: string; valor: number; forma: string }
export interface Nota {
  id: string; chave: string; tipo: string; numero: string; numero_rps: string; serie: string; emissao: string; cliente: string; cliente_doc: string
  valor: number; iss: number; descricao: string; placa: string; os: string; pedido: string; modelo: string; km: string; cond_pagamento: string
  cancelada: boolean; obs: string; origem: string; atendimento_id: string | null; importado_em: string; importado_por_nome: string
  parcelas: Parcela[]; recebimentos: Recebimento[]
}
export const FORMAS = ['PIX', 'Boleto', 'Transferência', 'Depósito', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Cheque', 'Ticket Log / convênio', 'À vista', 'Outro']
export const numDoc = (n: Nota) => n.numero_rps || n.numero

/** data de hoje no fuso da oficina, AAAA-MM-DD */
export const hoje = (agora = Date.now()) => new Date(agora - 4 * 36e5).toISOString().slice(0, 10)
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5)
const r2 = (v: number) => Math.round(v * 100) / 100

export const recebidoParcela = (n: Nota, p: Parcela) => r2(n.recebimentos.filter(r => r.parcela_id === p.id && !r.estornado_em).reduce((s, r) => s + +r.valor, 0))
export const saldoParcela = (n: Nota, p: Parcela) => Math.max(0, r2(+p.valor - recebidoParcela(n, p)))

export type Situacao = 'Recebida' | 'Parcial' | 'Vencida' | 'A vencer' | 'Cancelada'
export function situacaoParcela(n: Nota, p: Parcela, d = hoje()): Situacao {
  if (n.cancelada) return 'Cancelada'
  const s = saldoParcela(n, p)
  if (s <= 0.009) return 'Recebida'
  if (p.vencimento < d) return 'Vencida'
  return recebidoParcela(n, p) > 0 ? 'Parcial' : 'A vencer'
}
export function resumoNota(n: Nota, d = hoje()) {
  const ps = [...n.parcelas].sort((a, b) => a.numero - b.numero)
  const recebido = r2(n.recebimentos.filter(r => !r.estornado_em).reduce((s, r) => s + +r.valor, 0))
  const saldo = n.cancelada ? 0 : Math.max(0, r2(+n.valor - recebido))
  const abertas = ps.filter(p => saldoParcela(n, p) > 0.009)
  const proxima = abertas[0] ?? null
  const vencido = n.cancelada ? 0 : r2(abertas.filter(p => p.vencimento < d).reduce((s, p) => s + saldoParcela(n, p), 0))
  let situacao: Situacao = n.cancelada ? 'Cancelada' : saldo <= 0.009 ? 'Recebida' : vencido > 0 ? 'Vencida' : recebido > 0 ? 'Parcial' : 'A vencer'
  if (!n.cancelada && saldo <= 0.009) situacao = 'Recebida'
  const dias = proxima ? diasEntre(d, proxima.vencimento) : null
  return { recebido, saldo, vencido, proxima, dias, situacao, parcelas: ps }
}
export const tomSit = (s: Situacao) => (s === 'Recebida' ? 'g' : s === 'Vencida' ? 'r' : s === 'Parcial' ? 'o' : s === 'Cancelada' ? 'r' : '')
export function prazoTxt(dias: number | null) {
  if (dias == null) return ''
  if (dias === 0) return 'vence hoje'
  if (dias === 1) return 'vence amanhã'
  if (dias > 0) return `vence em ${dias} dias`
  return dias === -1 ? 'venceu ontem' : `vencida há ${-dias} dias`
}

/** divide um valor em n parcelas a cada `intervalo` dias a partir de `primeira` */
export function dividir(total: number, n: number, primeira: string, intervalo: number, forma: string) {
  const cada = Math.floor((total / n) * 100) / 100
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(primeira + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + i * intervalo)
    return { vencimento: d.toISOString().slice(0, 10), valor: i === n - 1 ? r2(total - cada * (n - 1)) : cada, forma }
  })
}
