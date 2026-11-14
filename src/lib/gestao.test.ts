import { describe, expect, it } from 'vitest'
import {
  DADOS_INSUFICIENTES, atrasoNoPagamento, brl, diasAtraso, emCentavos, faixaAtraso, gradeDoMes, pagoEmDia, perdida, prazoDias, somaOuNulo, somaPorDia, totalBaixa
} from './gestao'

describe('dinheiro em centavos', () => {
  it('converte sem erro de ponto flutuante', () => {
    expect(emCentavos(0.1 + 0.2)).toBe(30)
    expect(emCentavos(1234.56)).toBe(123456)
  })
  it('formata em reais e mostra "Dados insuficientes" quando falta o valor, nunca zero', () => {
    expect(brl(123456)).toMatch(/1\.234,56/)
    expect(brl(0)).toMatch(/0,00/)
    expect(brl(null)).toBe(DADOS_INSUFICIENTES)
    expect(brl(undefined)).toBe('Dados insuficientes')
  })
  it('soma que perde um valor vira nulo em vez de zero', () => {
    expect(somaOuNulo([100, 250])).toBe(350)
    expect(somaOuNulo([100, null])).toBeNull()
    expect(somaOuNulo([])).toBeNull()
  })
})

describe('totalBaixa', () => {
  it('principal + juros + multa - desconto', () => {
    expect(totalBaixa({ principal: 50000, juros: 1500, multa: 1000, desconto: 500 })).toBe(52000)
  })
  it('baixa parcial: só o principal da baixa', () => {
    expect(totalBaixa({ principal: 20000, juros: 0, multa: 0, desconto: 0 })).toBe(20000)
  })
})

describe('atraso e prazo', () => {
  it('dias de atraso: zero antes do vencimento, conta no dia seguinte', () => {
    expect(diasAtraso('2026-03-10', '2026-03-09')).toBe(0)
    expect(diasAtraso('2026-03-10', '2026-03-10')).toBe(0)
    expect(diasAtraso('2026-03-10', '2026-03-11')).toBe(1)
    expect(diasAtraso('2026-02-28', '2026-03-31')).toBe(31)
  })
  it('atraso no pagamento: positivo atrasou, negativo adiantou', () => {
    expect(atrasoNoPagamento('2026-03-10', '2026-03-15')).toBe(5)
    expect(atrasoNoPagamento('2026-03-10', '2026-03-08')).toBe(-2)
  })
  it('pago em dia inclui o próprio dia do vencimento', () => {
    expect(pagoEmDia('2026-03-10', '2026-03-10')).toBe(true)
    expect(pagoEmDia('2026-03-10', '2026-03-11')).toBe(false)
  })
  it('prazo concedido: emissão até o vencimento original', () => {
    expect(prazoDias('2026-01-05', '2026-02-04')).toBe(30)
  })
})

describe('faixas de atraso', () => {
  it.each([
    [-5, 'A vencer'], [0, 'A vencer'], [1, '1 a 15 dias'], [15, '1 a 15 dias'], [16, '16 a 30 dias'], [30, '16 a 30 dias'],
    [31, '31 a 60 dias'], [60, '31 a 60 dias'], [61, '61 a 90 dias'], [90, '61 a 90 dias'], [91, 'Mais de 90 dias']
  ])('%i dias cai em "%s"', (dias, faixa) => { expect(faixaAtraso(dias)).toBe(faixa) })
})

describe('calendário', () => {
  it('grade de novembro de 2026: começa no domingo, 30 dias, semanas completas', () => {
    const g = gradeDoMes(2026, 10) // 01/11/2026 é domingo
    expect(g[0][0]).toBe('2026-11-01')
    expect(g.every(s => s.length === 7)).toBe(true)
    expect(g.flat().filter(Boolean)).toHaveLength(30)
    expect(g.at(-1)!.filter(Boolean).at(-1)).toBe('2026-11-30')
  })
  it('grade com mês que não começa no domingo deixa dias vazios no início', () => {
    const g = gradeDoMes(2026, 11) // 01/12/2026 é terça
    expect(g[0].slice(0, 2)).toEqual([null, null])
    expect(g[0][2]).toBe('2026-12-01')
    expect(g.flat().filter(Boolean)).toHaveLength(31)
  })
  it('fevereiro bissexto tem 29 dias', () => { expect(gradeDoMes(2028, 1).flat().filter(Boolean)).toHaveLength(29) })
  it('soma por dia em centavos', () => {
    const m = somaPorDia([{ data: '2026-11-20', centavos: 10050 }, { data: '2026-11-20', centavos: 5 }, { data: '2026-11-21', centavos: 100 }])
    expect(m.get('2026-11-20')).toBe(10055)
    expect(m.get('2026-11-21')).toBe(100)
    expect(m.get('2026-11-22')).toBeUndefined()
  })
})

describe('perda do crediário', () => {
  it('perdida só depois de 30 dias de atraso', () => {
    expect(perdida(30)).toBe(false)
    expect(perdida(31)).toBe(true)
  })
  it('o limite é parâmetro', () => { expect(perdida(45, 60)).toBe(false) })
})
