import test from 'node:test'
import assert from 'node:assert/strict'
import zlib from 'node:zlib'
import { classificar, descompactar, validarNfe } from '../fiscal/documentos.js'
import { CHAVE, EMPRESA, nfeProc } from './nfe-sintetica.js'

test('NF-e válida entrega os campos lidos da parte assinada', () => {
  const r = validarNfe(nfeProc(), EMPRESA)
  assert.equal(r.ok, true, r.motivo)
  assert.deepEqual({ ...r.nota, xml: undefined }, { chave: CHAVE, numero: '123', serie: '1', emissao: '2026-11-10T10:00:00-04:00', fornecedor: 'FORNECEDOR TESTE LTDA', valor: '150.50', xml: undefined })
})

test('destinatário diferente da empresa é descartado', () => {
  assert.match(validarNfe(nfeProc({ dest: '99999999000191' }), EMPRESA).motivo, /destinatário/)
})

test('nota cancelada ou denegada (cStat diferente de autorizada) é recusada', () => {
  assert.match(validarNfe(nfeProc({ cStat: '101' }), EMPRESA).motivo, /não autorizada/)
})

test('conteúdo alterado depois de assinado é recusado', () => {
  const adulterada = nfeProc().replace('150.50', '1.50')
  assert.match(validarNfe(adulterada, EMPRESA).motivo, /assinatura inválida/)
})

test('valor sem duas casas é recusado', () => {
  assert.match(validarNfe(nfeProc({ valor: '150.5' }), EMPRESA).motivo, /valor/)
})

test('XML com DOCTYPE/entidade externa é recusado antes de qualquer leitura', () => {
  const xxe = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><nfeProc><NFe/></nfeProc>'
  assert.match(validarNfe(xxe, EMPRESA).motivo, /declaração/)
})

test('descompacta docZip e classifica os quatro tipos', () => {
  const xml = '<resNFe xmlns="x"><chNFe>1</chNFe></resNFe>'
  const b64 = zlib.gzipSync(xml).toString('base64')
  assert.equal(descompactar(b64), xml)
  assert.equal(classificar(xml), 'resumo_nfe')
  assert.equal(classificar('<?xml version="1.0"?><nfeProc/>'), 'nfe')
  assert.equal(classificar('<procEventoNFe/>'), 'evento')
  assert.equal(classificar('<resEvento/>'), 'resumo_evento')
  assert.equal(classificar('<outra/>'), 'desconhecido')
})

test('gzip bomb acima do limite é recusado', () => {
  const bomba = zlib.gzipSync(Buffer.alloc(6 * 1024 * 1024)).toString('base64')
  assert.throws(() => descompactar(bomba))
})
