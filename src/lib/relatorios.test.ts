import { describe, expect, it } from 'vitest'
import { range, rangeAnterior, relatorio, gm } from './relatorios'
import type { Atendimento } from './domain'

const AGORA = Date.parse('2026-10-20T13:00:00Z') // 09:00 em Tangará da Serra
const at = (o: Partial<Atendimento>): Atendimento => ({
  id: Math.random().toString(36), numero: 'AT', placa: 'RTA2B41', modelo: '', locadora_id: 'l1', condutor: '', entrada: '2026-10-05T12:00:00Z', saida: null,
  os: '', protocolo: '', responsavel: '', local: '', servico: '', obs: '', motivo_espera: '', sit_fisica: 'patio', sit_comercial: 'Aprovado',
  sit_operacional: 'Em execução', oper_desde: '', sit_fiscal: 'Não faturado', sit_financeira: 'A receber', arquivado: false, enviado_em: null,
  aprovado_em: null, recusado_em: null, valor_aprovado: null, inicio_em: null, concluido_em: null, criado_em: '', atualizado_em: '',
  orcamento_revisoes: [], descontos: [], notas_fiscais: [], esperas: [], ...o,
})

describe('períodos no fuso da oficina', () => {
  it('mês atual vai do dia 1 00:00 ao último dia 23:59 (UTC−4)', () => {
    const [a, b] = range('mes', undefined, undefined, AGORA)
    expect(new Date(a).toISOString()).toBe('2026-10-01T04:00:00.000Z')
    expect(new Date(b).toISOString()).toBe('2026-11-01T03:59:59.999Z')
  })
  it('mês anterior do mês atual é setembro', () => {
    const [a] = rangeAnterior('mes', range('mes', undefined, undefined, AGORA))
    expect(new Date(a).toISOString()).toBe('2026-09-01T04:00:00.000Z')
  })
  it('semana começa na segunda', () => {
    const [a] = range('sem', undefined, undefined, AGORA) // 20/10/2026 é terça
    expect(new Date(a).toISOString()).toBe('2026-10-19T04:00:00.000Z')
  })
})

describe('indicadores', () => {
  const A = [
    at({ entrada: '2026-10-02T12:00:00Z', enviado_em: '2026-10-03T12:00:00Z', aprovado_em: '2026-10-05T12:00:00Z', valor_aprovado: 1700,
      orcamento_revisoes: [{ id: 'r', seq: 1, valor: 2000, em: '2026-10-03T12:00:00Z', obs: '' }],
      descontos: [{ id: 'd', base: 2000, solicitado: 300, concedido: 300, pedido_em: '2026-10-04T12:00:00Z', resposta_em: '2026-10-04T13:00:00Z', motivo: '' }],
      notas_fiscais: [{ id: 'n', tipo: 'NFS-e', numero: '1', serie: '1', valor: 1700, emissao: '2026-10-10T12:00:00Z', cancelada: false }] }),
    at({ entrada: '2026-10-06T12:00:00Z', enviado_em: '2026-10-06T13:00:00Z', aprovado_em: '2026-10-07T13:00:00Z', valor_aprovado: 1000,
      orcamento_revisoes: [{ id: 'r2', seq: 1, valor: 1000, em: '2026-10-06T12:30:00Z', obs: '' }],
      notas_fiscais: [{ id: 'n2', tipo: 'NFS-e', numero: '2', serie: '1', valor: 500, emissao: '2026-10-08T12:00:00Z', cancelada: true }] }),
    at({ entrada: '2026-09-20T12:00:00Z' }),
  ]
  const R = range('mes', undefined, undefined, AGORA)
  it('ticket médio, % desconto e tempo de aprovação', () => {
    const g = gm(A, ...R)
    expect(g.ent.length).toBe(2)
    expect(g.tkA).toBe(1350)
    expect(g.fat).toBe(1700) // nota cancelada fora
    expect(g.dPct).toBeCloseTo(0.15)
    expect(g.tMean).toBe((2 * 864e5 + 864e5) / 2)
  })
  it('exemplo da especificação: 2.000 → 1.700 = 15% de redução', () => {
    expect(gm([A[0]], ...R).red).toBeCloseTo(0.15)
  })
  it('fechamento separa os que vieram de antes', () => {
    const r = relatorio('fech', A, R, [])
    expect(r.cards[0][1]).toBe(2)
    expect(r.cards[2][1]).toBe(1)
  })
  it('comparativo mensal tem uma linha por mês', () => {
    expect(relatorio('mes', A, R, [], { meses: 6 }).main.rows.length).toBe(6)
  })
})
