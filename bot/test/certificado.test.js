import test from 'node:test'
import assert from 'node:assert/strict'
import forge from 'node-forge'
import { lerCertificado } from '../fiscal/certificado.js'

// Certificado fictício gerado na hora: CNPJ e nome inventados.
function pfxSintetico(senha, notAfter) {
  const keys = forge.pki.rsa.generateKeyPair(1024)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date(Date.now() - 86_400_000)
  cert.validity.notAfter = notAfter
  const attrs = [{ name: 'commonName', value: 'EMPRESA TESTE LTDA:12345678000199' }]
  cert.setSubject(attrs); cert.setIssuer(attrs)
  cert.sign(keys.privateKey)
  const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], senha, { algorithm: '3des' })
  return Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary')
}

test('lê titular, CNPJ e validade sem expor a chave', () => {
  const fim = new Date(Date.now() + 10 * 86_400_000)
  const r = lerCertificado(pfxSintetico('senha-teste', fim), 'senha-teste')
  assert.equal(r.titular, 'EMPRESA TESTE LTDA:12345678000199')
  assert.equal(r.cnpj, '12345678000199')
  assert.ok(r.diasRestantes >= 9 && r.diasRestantes <= 10)
  assert.deepEqual(Object.keys(r).sort(), ['cnpj', 'diasRestantes', 'titular', 'validoAte'])
})

test('senha errada dá erro sem vazar a senha', () => {
  const pfx = pfxSintetico('certa', new Date(Date.now() + 86_400_000))
  assert.throws(() => lerCertificado(pfx, 'errada-secreta'), e => /senha incorreta/.test(e.message) && !e.message.includes('errada-secreta'))
})
