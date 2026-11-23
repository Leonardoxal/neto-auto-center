import test from 'node:test'
import assert from 'node:assert/strict'
import { montarXml, envelopeSoap, lerRetorno, consultar, nsuComZeros } from '../fiscal/sefaz.js'

const CNPJ = '12345678000199' // fictício

test('monta o pedido com ambiente, UF de Mato Grosso, CNPJ e NSU com 15 dígitos', () => {
  const x = montarXml({ ambiente: 'homologacao', cnpj: CNPJ, ultNSU: 42 })
  assert.match(x, /<tpAmb>2<\/tpAmb>/)
  assert.match(x, /<cUFAutor>51<\/cUFAutor>/)
  assert.match(x, new RegExp(`<CNPJ>${CNPJ}</CNPJ>`))
  assert.match(x, /<ultNSU>000000000000042<\/ultNSU>/)
  assert.equal(nsuComZeros(0), '000000000000000')
})

test('recusa CNPJ inválido', () => {
  assert.throws(() => montarXml({ ambiente: 'producao', cnpj: '123', ultNSU: 0 }), /14 dígitos/)
})

test('envelope SOAP 1.2 carrega o pedido', () => {
  assert.match(envelopeSoap('<a/>'), /soap12:Envelope.*<nfeDadosMsg><a\/><\/nfeDadosMsg>/)
})

test('lê retorno sem documentos (137) e retorno de consumo indevido (656)', () => {
  assert.deepEqual(lerRetorno('<retDistDFeInt><cStat>137</cStat><xMotivo>Nenhum documento localizado</xMotivo><ultNSU>000000000000000</ultNSU><maxNSU>000000000000000</maxNSU></retDistDFeInt>'),
    { cStat: '137', xMotivo: 'Nenhum documento localizado', ultNSU: '000000000000000', maxNSU: '000000000000000', docs: 0 })
  assert.equal(lerRetorno('<cStat>656</cStat><xMotivo>Rejeicao: Consumo Indevido</xMotivo>').cStat, '656')
})

test('conta documentos do lote e usa a URL do ambiente pedido', async () => {
  let urlUsada
  const enviar = async url => { urlUsada = url; return { status: 200, corpo: '<cStat>138</cStat><ultNSU>2</ultNSU><maxNSU>2</maxNSU><docZip NSU="1" schema="x">a</docZip><docZip NSU="2" schema="y">b</docZip>' } }
  const r = await consultar({ ambiente: 'homologacao', pfx: undefined, senha: undefined, cnpj: CNPJ, ultNSU: 0, enviar })
  assert.equal(r.docs, 2)
  assert.match(urlUsada, /^https:\/\/hom1\./)
})

test('HTTP diferente de 200 vira erro', async () => {
  await assert.rejects(consultar({ ambiente: 'homologacao', cnpj: CNPJ, ultNSU: 0, enviar: async () => ({ status: 500, corpo: '' }) }), /HTTP 500/)
})
