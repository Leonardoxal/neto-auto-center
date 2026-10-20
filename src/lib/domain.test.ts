import { describe, expect, it } from 'vitest'
import { alerta, faturado, LISTAS, resumoItens, normPlaca, placaValida, pode, tempoAprovacao, tempos, valorAtual, valorInicial, type Atendimento } from './domain'
import { deInputLocal, dur, numero, paraInputLocal } from './format'

const H = 36e5, D = 864e5, AGORA = Date.parse('2026-10-20T15:00:00Z')
const iso = (msAtras: number) => new Date(AGORA - msAtras).toISOString()
const base = (o: Partial<Atendimento> = {}): Atendimento => ({
  id: 'a', numero: 'AT-0001', placa: 'RTA2B41', modelo: 'Onix', locadora_id: 'l', condutor: '', entrada: iso(10 * D), saida: null,
  os: '', protocolo: '', responsavel: '', local: 'Recepção', servico: '', obs: '', motivo_espera: '',
  sit_fisica: 'patio', sit_comercial: 'Aguardando orçamento', sit_operacional: 'Aguardando avaliação', oper_desde: iso(10 * D),
  sit_fiscal: 'Não faturado', sit_financeira: 'A receber', arquivado: false, enviado_em: null, aprovado_em: null, recusado_em: null,
  valor_aprovado: null, inicio_em: null, concluido_em: null, criado_em: iso(10 * D), atualizado_em: iso(10 * D),
  orcamento_revisoes: [], descontos: [], notas_fiscais: [], esperas: [], movimentacoes: [], eventos: [], ...o,
})

describe('placa', () => {
  it('normaliza e valida Mercosul e antiga', () => {
    expect(normPlaca('rta-2b41')).toBe('RTA2B41')
    expect(placaValida('RTA2B41')).toBe(true)
    expect(placaValida('ABC1234')).toBe(true)
    expect(placaValida('AB12345')).toBe(false)
  })
})

describe('orçamento', () => {
  it('sem revisão o orçamento fica pendente (null), nunca zero', () => {
    expect(valorInicial(base())).toBeNull()
    expect(valorAtual(base())).toBeNull()
  })
  it('mantém todas as revisões e usa a ordem de registro; inicial = valor enviado', () => {
    const a = base({ enviado_em: iso(2 * D), orcamento_revisoes: [
      { id: '2', seq: 2, valor: 2400, em: iso(1 * D), obs: 'Após negociação' },
      { id: '1', seq: 1, valor: 2650, em: iso(3 * D), obs: 'Orçamento inicial' }] })
    expect(valorInicial(a)).toBe(2650)
    expect(valorAtual(a)).toBe(2400)
  })
})

describe('itens do orçamento', () => {
  it('soma só o que não foi retirado e separa o aprovado', () => {
    const it = (status: 'Proposto' | 'Aprovado' | 'Retirado', q: number, v: number) => ({ id: Math.random() + '', seq: 1, atendimento_id: 'a', tipo: 'Peça' as const, descricao: 'x', quantidade: q, valor_unitario: v, status, motivo_retirada: '', obs: '', criado_em: '', criado_por_nome: '', alterado_em: null, alterado_por_nome: '' })
    const r = resumoItens([it('Aprovado', 1, 320), it('Aprovado', 2, 150), it('Retirado', 2, 250), it('Proposto', 1, 60)])
    expect(r.total).toBe(680); expect(r.aprovado).toBe(620); expect(r.retirados.length).toBe(1)
  })
  it('antes do envio o valor inicial acompanha a montagem', () => {
    const a = base({ orcamento_revisoes: [{ id: '1', seq: 1, valor: 300, em: iso(2 * D), obs: '' }, { id: '2', seq: 2, valor: 1100, em: iso(1 * D), obs: '' }] })
    expect(valorInicial(a)).toBe(1100)
  })
})

describe('tempo de aprovação', () => {
  it('conta do envio, não da entrada', () => {
    const a = base({ enviado_em: iso(5 * D), aprovado_em: iso(2 * D) })
    expect(tempoAprovacao(a, AGORA).ms).toBe(3 * D)
  })
  it('pendente mostra o tempo até agora marcado como pendente', () => {
    const t = tempoAprovacao(base({ enviado_em: iso(30 * H) }), AGORA)
    expect(t.pendente).toBe(true); expect(t.ms).toBe(30 * H)
  })
  it('sem envio = dados insuficientes', () => {
    expect(tempoAprovacao(base(), AGORA).ms).toBeNull()
    const linha = tempos(base(), AGORA).find(x => x[0] === 'Envio → aprovação final')!
    expect(linha[1]).toBeNull()
  })
})

describe('tempos de execução e espera', () => {
  it('desconta as esperas da execução efetiva', () => {
    const a = base({ inicio_em: iso(5 * D), concluido_em: iso(1 * D), esperas: [{ id: 'e', motivo: 'Aguardando peças', inicio: iso(4 * D), fim: iso(2 * D) }] })
    const t = Object.fromEntries(tempos(a, AGORA).map(x => [x[0], x[1]]))
    expect(t['Execução efetiva']).toBe(2 * D)
    expect(t['Aguardando peças']).toBe(2 * D)
  })
})

describe('pátio e faturamento', () => {
  it('aprovar não tira do pátio; nota não tira do pátio', () => {
    const a = base({ sit_comercial: 'Aprovado', sit_operacional: 'Em execução', notas_fiscais: [{ id: 'n', tipo: 'NFS-e', numero: '1', serie: '1', valor: 1000, emissao: iso(H), cancelada: false }] })
    expect(LISTAS.todos.f(a)).toBe(true)
    expect(LISTAS.aprov.f(a)).toBe(false)
    expect(LISTAS.fatserv.f(a)).toBe(true)
  })
  it('nota cancelada não soma no faturado', () => {
    const a = base({ notas_fiscais: [{ id: 'n', tipo: 'NFS-e', numero: '1', serie: '1', valor: 1000, emissao: iso(H), cancelada: true }] })
    expect(faturado(a)).toBe(0)
  })
  it('saída e arquivamento tiram do pátio', () => {
    expect(LISTAS.todos.f(base({ sit_fisica: 'entregue', saida: iso(H) }))).toBe(false)
    expect(LISTAS.todos.f(base({ arquivado: true }))).toBe(false)
  })
  it('alerta de parado: >3 dias laranja, >7 vermelho', () => {
    expect(alerta(base({ atualizado_em: iso(4 * D), entrada: iso(4 * D) }), AGORA)).toBe('w')
    expect(alerta(base({ atualizado_em: iso(8 * D), entrada: iso(8 * D) }), AGORA)).toBe('c')
    expect(alerta(base({ atualizado_em: iso(H), entrada: iso(8 * D) }), AGORA)).toBe('')
  })
})

describe('permissões', () => {
  it('recepção registra entrada mas não aprova; operacional só movimenta', () => {
    expect(pode('Recepção', 'entrada')).toBe(true)
    expect(pode('Recepção', 'aprovar')).toBe(false)
    expect(pode('Operacional', 'mover')).toBe(true)
    expect(pode('Operacional', 'saida')).toBe(false)
  })
})

describe('formatação', () => {
  it('valores e durações', () => {
    expect(numero('2.650,00')).toBe(2650)
    expect(numero('R$ 1.234,5')).toBe(1234.5)
    expect(numero('')).toBeNull()
    expect(dur(3 * D + 4 * H)).toBe('3d 4h')
  })
  it('data local da oficina (UTC−4) ida e volta', () => {
    const s = '2026-10-20T08:30'
    expect(paraInputLocal(deInputLocal(s))).toBe(s)
    expect(deInputLocal(s)).toBe('2026-10-20T12:30:00.000Z')
  })
})
