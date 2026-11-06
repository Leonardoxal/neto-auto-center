import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buscar, interpretar, mesmoTelefone } from '../comandos.js'

test('interpreta os comandos principais, sem depender de acento ou caixa', () => {
  assert.deepEqual(interpretar('Pátio'), { tipo: 'patio' })
  assert.deepEqual(interpretar('pendentes'), { tipo: 'pendentes' })
  assert.deepEqual(interpretar('PRONTOS'), { tipo: 'prontos' })
  assert.deepEqual(interpretar('ajuda'), { tipo: 'ajuda' })
  assert.deepEqual(interpretar('Status abc-1d23'), { tipo: 'status', termo: 'ABC 1D23' })
  assert.deepEqual(interpretar('Hilux finalizado'), { tipo: 'finalizar', termo: 'HILUX' })
  assert.deepEqual(interpretar('ABC1D23 concluído'), { tipo: 'finalizar', termo: 'ABC1D23' })
  assert.deepEqual(interpretar('abc1d23 entregue'), { tipo: 'entregar', termo: 'ABC1D23' })
  assert.deepEqual(interpretar('sim'), { tipo: 'sim' })
  assert.deepEqual(interpretar('Não'), { tipo: 'nao' })
  assert.deepEqual(interpretar('2'), { tipo: 'escolha', n: 2 })
})

test('palavra solta de ação não vira alteração', () => {
  assert.equal(interpretar('finalizado').tipo, 'desconhecido')
  assert.equal(interpretar('entregue').tipo, 'desconhecido')
  assert.equal(interpretar('bom dia').tipo, 'desconhecido')
  assert.equal(interpretar('').tipo, 'desconhecido')
})

const patio = [
  { id: '1', placa: 'ABC1D23', modelo: 'Toyota Hilux' },
  { id: '2', placa: 'DEF4G56', modelo: 'HILUX SW4' },
  { id: '3', placa: 'HIJ7K89', modelo: 'Ford Ranger' },
  { id: '4', placa: 'KLM1234', modelo: '' },
]

test('placa completa encontra só aquele veículo, com ou sem traço', () => {
  assert.deepEqual(buscar(patio, 'abc-1d23').map(v => v.id), ['1'])
  assert.deepEqual(buscar(patio, 'ZZZ9Z99'), [])
})

test('modelo parecido devolve todas as opções, nunca escolhe sozinho', () => {
  assert.deepEqual(buscar(patio, 'HILUX').map(v => v.id), ['1', '2'])
  assert.deepEqual(buscar(patio, 'ranger').map(v => v.id), ['3'])
  assert.deepEqual(buscar(patio, 'RAN'), [])
})

test('pedaço de placa com número procura nas placas', () => {
  assert.deepEqual(buscar(patio, '1D23').map(v => v.id), ['1'])
  assert.deepEqual(buscar(patio, '1234').map(v => v.id), ['4'])
})

test('telefone com e sem o nono dígito é o mesmo número', () => {
  assert.equal(mesmoTelefone('5565999998888', '556599998888'), true)
  assert.equal(mesmoTelefone('+55 (65) 99999-8888', '5565999998888'), true)
  assert.equal(mesmoTelefone('5565999998888', '5565999997777'), false)
  assert.equal(mesmoTelefone('', '5565999998888'), false)
  assert.equal(mesmoTelefone(null, null), false)
})
