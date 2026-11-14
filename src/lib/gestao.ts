// Regras puras da gestão financeira. Dinheiro sempre em centavos inteiros (nunca ponto flutuante);
// taxas e potências só no resultado final. Dado que falta é `null` e aparece como "Dados insuficientes", nunca como zero.
import { diasEntre } from './receber'

export const DADOS_INSUFICIENTES = 'Dados insuficientes'
/** Prazo, em dias de atraso, a partir do qual uma parcela do crediário é considerada perdida (decisão do responsável, 13/11/2026). */
export const PRAZO_PERDA_DIAS = 30

export const emCentavos = (reais: number) => Math.round(reais * 100)
export const emReais = (centavos: number) => centavos / 100
export const brl = (centavos: number | null | undefined) =>
  centavos == null ? DADOS_INSUFICIENTES : emReais(centavos).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Soma que não esconde lacuna: se algum valor falta, o total também falta. */
export const somaOuNulo = (valores: (number | null | undefined)[]) =>
  valores.length === 0 || valores.some(v => v == null) ? null : (valores as number[]).reduce((s, v) => s + v, 0)

export interface Baixa { principal: number; juros: number; multa: number; desconto: number }
/** Valor efetivamente pago numa baixa: principal + juros + multa - desconto. */
export const totalBaixa = (b: Baixa) => b.principal + b.juros + b.multa - b.desconto

/** Dias de atraso em `referencia` (AAAA-MM-DD). Zero se ainda não venceu. */
export const diasAtraso = (vencimento: string, referencia: string) => Math.max(0, diasEntre(vencimento, referencia))
/** Dias entre o vencimento e o pagamento: positivo = pagou atrasado, negativo = pagou adiantado. */
export const atrasoNoPagamento = (vencimento: string, pagamento: string) => diasEntre(vencimento, pagamento)
export const pagoEmDia = (vencimento: string, pagamento: string) => atrasoNoPagamento(vencimento, pagamento) <= 0
/** Prazo concedido ao cliente: dias entre a emissão e o vencimento. Use o vencimento original, não o ajustado. */
export const prazoDias = (emissao: string, vencimento: string) => diasEntre(emissao, vencimento)

export const FAIXAS_ATRASO = ['A vencer', '1 a 15 dias', '16 a 30 dias', '31 a 60 dias', '61 a 90 dias', 'Mais de 90 dias'] as const
export type FaixaAtraso = (typeof FAIXAS_ATRASO)[number]
export function faixaAtraso(dias: number): FaixaAtraso {
  if (dias <= 0) return 'A vencer'
  if (dias <= 15) return '1 a 15 dias'
  if (dias <= 30) return '16 a 30 dias'
  if (dias <= 60) return '31 a 60 dias'
  if (dias <= 90) return '61 a 90 dias'
  return 'Mais de 90 dias'
}
/** Perdida: passou mais de `limite` dias do vencimento sem pagamento. */
export const perdida = (dias: number, limite = PRAZO_PERDA_DIAS) => dias > limite
