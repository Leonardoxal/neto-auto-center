import { describe, expect, it } from 'vitest'
import { avisoCertificado, botaoBusca, proximaBusca, situacaoConector, type StatusConector } from './conectorCompras'

const AGORA = Date.parse('2026-11-13T18:00:00Z') // 14h00 em Cuiabá
const min = (n: number) => new Date(AGORA + n * 60_000).toISOString()
const status = (o: Partial<StatusConector> = {}): StatusConector => ({
  ambiente: 'homologacao', ultima_consulta: min(-28), proxima_consulta: min(33), ultimo_resultado: '0 recebidas', ultimo_erro: null,
  certificado_validade: min(100 * 24 * 60), ultimo_sinal: min(-1), busca_pedida_em: null, agora: min(0), ...o,
})

describe('situacaoConector', () => {
  it('sem linha no banco: conector ainda não instalado', () => {
    expect(situacaoConector(null, AGORA).tipo).toBe('nunca')
  })
  it('com sinal recente e sem erro: conectado, com a hora da última busca', () => {
    expect(situacaoConector(status(), AGORA)).toEqual({ tipo: 'ok', texto: 'Conectado · última busca às 13h32' })
  })
  it('sem sinal há mais de 5 minutos: computador desligado, prevalece sobre o erro', () => {
    const r = situacaoConector(status({ ultimo_sinal: min(-6), ultimo_erro: 'falha' }), AGORA)
    expect(r.tipo).toBe('desligado')
    expect(r.texto).toContain('13/11/2026 13h54')
  })
  it('erro do conector aparece em texto simples', () => {
    expect(situacaoConector(status({ ultimo_erro: 'A SEFAZ bloqueou temporariamente as consultas.' }), AGORA))
      .toEqual({ tipo: 'erro', texto: 'A SEFAZ bloqueou temporariamente as consultas.' })
  })
})

describe('avisoCertificado', () => {
  it('não avisa com mais de 30 dias', () => expect(avisoCertificado(status(), AGORA)).toBeNull())
  it('avisa a partir de 30 dias antes', () => expect(avisoCertificado(status({ certificado_validade: min(10 * 24 * 60) }), AGORA)).toMatch(/vence em 10 dias/))
  it('avisa quando vencido', () => expect(avisoCertificado(status({ certificado_validade: min(-60) }), AGORA)).toMatch(/vencido/))
})

describe('botaoBusca', () => {
  it('desativado e mostra a hora em que libera enquanto a SEFAZ não permite', () => {
    expect(botaoBusca(status(), AGORA)).toEqual({ habilitado: false, rotulo: 'Libera às 14h33' })
    expect(proximaBusca(status(), AGORA)).toBe('14h33')
  })
  it('ativo quando o horário já passou', () => {
    expect(botaoBusca(status({ proxima_consulta: min(-1) }), AGORA)).toEqual({ habilitado: true, rotulo: 'Buscar agora' })
    expect(proximaBusca(status({ proxima_consulta: min(-1) }), AGORA)).toBeNull()
  })
  it('desativado enquanto há pedido ainda não atendido', () => {
    expect(botaoBusca(status({ proxima_consulta: min(-1), busca_pedida_em: min(-0.5) }), AGORA).habilitado).toBe(false)
  })
  it('desativado sem conector', () => expect(botaoBusca(null, AGORA).habilitado).toBe(false))
})
