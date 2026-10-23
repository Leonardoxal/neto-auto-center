import { describe, expect, it } from 'vitest'
import { dividir, resumoNota, situacaoParcela, prazoTxt, type Nota } from './receber'

const nota = (o: Partial<Nota> = {}): Nota => ({ id: 'n', chave: 'c', tipo: 'NF-e', numero: '4617', numero_rps: '', serie: '1', emissao: '2026-10-19T00:00:00-04:00', cliente: 'MOVIDA', cliente_doc: '',
  valor: 760, iss: 0, descricao: '', placa: '', os: '', pedido: '', modelo: '', km: '', cond_pagamento: '30 DIAS', cancelada: false, obs: '', origem: 'xml', atendimento_id: null, importado_em: '', importado_por_nome: '',
  parcelas: [{ id: 'p1', nota_id: 'n', numero: 1, vencimento: '2026-11-18', valor: 760, forma: 'Boleto' }], recebimentos: [], ...o })
const rec = (valor: number, est = false) => ({ id: Math.random() + '', nota_id: 'n', parcela_id: 'p1', data: '2026-11-01', valor, forma: 'PIX', obs: '', criado_em: '', usuario_nome: '', estornado_em: est ? 'x' : null, estornado_por_nome: '', motivo_estorno: '' })

describe('contas a receber', () => {
  it('a vencer, parcial, recebida e vencida', () => {
    expect(resumoNota(nota(), '2026-10-22').situacao).toBe('A vencer')
    expect(resumoNota(nota({ recebimentos: [rec(500)] }), '2026-10-22')).toMatchObject({ situacao: 'Parcial', saldo: 260 })
    expect(resumoNota(nota({ recebimentos: [rec(500), rec(260)] }), '2026-12-01').situacao).toBe('Recebida')
    expect(resumoNota(nota({ recebimentos: [rec(500)] }), '2026-11-20')).toMatchObject({ situacao: 'Vencida', vencido: 260 })
  })
  it('estorno volta o saldo', () => {
    expect(resumoNota(nota({ recebimentos: [rec(760, true)] }), '2026-10-22').saldo).toBe(760)
  })
  it('cancelada não entra no saldo', () => {
    const n = nota({ cancelada: true })
    expect(resumoNota(n).saldo).toBe(0); expect(situacaoParcela(n, n.parcelas[0])).toBe('Cancelada')
  })
  it('dividir mantém o total', () => {
    const p = dividir(1000, 3, '2026-11-01', 30, 'Boleto')
    expect(p.map(x => x.vencimento)).toEqual(['2026-11-01', '2026-12-01', '2026-12-31'])
    expect(p.reduce((s, x) => s + x.valor, 0)).toBeCloseTo(1000)
  })
  it('texto do prazo', () => {
    expect(prazoTxt(0)).toBe('vence hoje'); expect(prazoTxt(5)).toBe('vence em 5 dias'); expect(prazoTxt(-3)).toBe('vencida há 3 dias')
  })
})
