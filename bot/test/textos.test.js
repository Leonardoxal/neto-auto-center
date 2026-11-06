import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inicioDoDia, relatorioFim, relatorioManha } from '../textos.js'

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
  assert.match(t, /AGUARDANDO APROVAÇÃO: 1/)
  assert.match(t, /PRONTOS PARA ENTREGA: 1/)
  assert.match(t, /RELATÓRIO DO PÁTIO — 06\/11\/2026/)
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

test('pátio vazio não quebra os relatórios', () => {
  assert.match(relatorioManha([], AGORA), /VEÍCULOS NO PÁTIO: 0/)
  assert.match(relatorioFim([], [], AGORA), /PENDÊNCIAS PARA AMANHÃ:\n• nenhuma/)
})
