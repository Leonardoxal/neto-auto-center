import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aprovados, avisoAprovado, inicioDoDia, patio, relatorioFim, relatorioManha, vencimentos } from '../textos.js'

test('vencimentos separa hoje, amanhã, 7 dias e atrasado', () => {
  const p = [{ cliente: 'A', vencimento: '2026-11-14', saldo: 100 }, { cliente: 'B', vencimento: '2026-11-15', saldo: 200 },
    { cliente: 'C', vencimento: '2026-11-16', saldo: 300 }, { cliente: 'D', vencimento: '2026-11-20', saldo: 400 }, { cliente: 'E', vencimento: '2026-12-30', saldo: 999 }]
  const t = vencimentos(p, '2026-11-15')
  assert.match(t, /HOJE \(15\/11\): R\$\s200,00 em 1 parcela\(s\)\n• B: R\$\s200,00/)
  assert.match(t, /AMANHÃ \(16\/11\): R\$\s300,00 em 1/)
  assert.match(t, /\(20\/11\): R\$\s400,00 em 1 parcela\(s\)\n• D:/)
  assert.match(t, /\(18\/11\): nada/)
  assert.doesNotMatch(t, /999,00/) // depois de 7 dias não entra
  assert.match(t, /ATRASADO: R\$\s100,00 em 1/)
  assert.match(vencimentos([], '2026-11-15'), /ATRASADO: nada/)
})

// 06/11/2026 18h00 em Cuiabá (UTC−4) = 22h00 UTC
const AGORA = Date.parse('2026-11-06T22:00:00Z')
const v = (id, o) => ({ id, placa: `AAA${id}A00`, modelo: 'Strada', cliente: 'LOCADORA', valor: 1000, entrada: '2026-11-01T12:00:00Z',
  atualizado_em: '2026-11-06T12:00:00Z', sit_fisica: 'patio', sit_comercial: 'Aguardando aprovação', sit_operacional: 'Aguardando avaliação', ...o })

test('início do dia usa o fuso de Cuiabá', () => {
  assert.equal(inicioDoDia(AGORA).toISOString(), '2026-11-06T04:00:00.000Z')
})

test('relatório da manhã conta só o que está no pátio, por grupo', () => {
  const t = relatorioManha([v(1), v(2, { sit_comercial: 'Aprovado', sit_operacional: 'Serviço concluído' })], AGORA)
  assert.match(t, /VEÍCULOS NO PÁTIO: 2/)
  assert.match(t, /FALTA APROVAR: 1/)
  assert.match(t, /APROVADOS: 0/)
  assert.match(t, /PRONTOS PARA ENTREGA: 1/)
  assert.match(t, /RELATÓRIO DO PÁTIO — 06\/11\/2026 18h00\nBoa noite!/)
  assert.match(relatorioManha([], Date.parse('2026-11-06T11:00:00Z')), /Bom dia!/) // 07h00 em Cuiabá
})

test('fechamento separa o que entrou hoje do que permanece, e finalizado de entregue', () => {
  const noPatio = [v(1), v(2, { entrada: '2026-11-06T13:00:00Z' })]
  const doDia = [
    v(2, { entrada: '2026-11-06T13:00:00Z' }),
    v(3, { sit_fisica: 'entregue', sit_operacional: 'Serviço concluído', concluido_em: '2026-11-06T15:00:00Z', saida: '2026-11-06T20:00:00Z' }),
    v(4, { sit_operacional: 'Serviço concluído', concluido_em: '2026-11-06T16:00:00Z' }),
  ]
  const t = relatorioFim(noPatio, doDia, AGORA)
  assert.match(t, /Entraram: 1/)
  assert.match(t, /Serviços finalizados: 2/)
  assert.match(t, /Entregues: 1/)
  assert.match(t, /PERMANECEM NO PÁTIO: 2/)
})

test('PATIO separa por situação e cada veículo aparece uma vez', () => {
  const t = patio([
    v(1),
    v(2, { sit_comercial: 'Aguardando orçamento' }),
    v(3, { sit_comercial: 'Aprovado', sit_operacional: 'Em execução' }),
    v(4, { sit_comercial: 'Aprovado', sit_operacional: 'Serviço concluído' }),
    v(5, { sit_comercial: 'Recusado' }),
  ], AGORA)
  assert.match(t, /NO PÁTIO: 5/)
  assert.match(t, /FALTA ORÇAMENTO: 1/)
  assert.match(t, /FALTA APROVAR: 1/)
  assert.match(t, /APROVADOS: 1\n• Strada — AAA3A00 — R\$\s?1\.000,00 · Em execução/)
  assert.match(t, /PRONTOS PARA ENTREGA: 1/)
  assert.match(t, /OUTROS: 1\n• Strada — AAA5A00 — Recusado/)
  assert.equal(aprovados([v(3, { sit_comercial: 'Aprovado' }), v(4, { sit_comercial: 'Aprovado', sit_operacional: 'Serviço concluído' })]).match(/APROVADOS: (\d)/)[1], '1')
})

test('aviso de aprovação diz se há orçamento anexado', () => {
  const ev = { usuario_nome: 'Leonardo', em: '2026-11-06T14:42:00Z' }
  assert.match(avisoAprovado(v(1), ev, 2), /Orçamento anexado: 2 arquivo\(s\) a seguir/)
  assert.match(avisoAprovado(v(1), ev, 0), /Nenhum orçamento anexado/)
  assert.match(avisoAprovado(v(1), ev, 0), /Horário: 10h42/)
})

test('pátio vazio não quebra os relatórios', () => {
  assert.match(relatorioManha([], AGORA), /VEÍCULOS NO PÁTIO: 0/)
  assert.match(relatorioFim([], [], AGORA), /PENDÊNCIAS PARA AMANHÃ:\n• nenhuma/)
})
