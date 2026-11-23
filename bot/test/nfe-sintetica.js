// Gerador de NF-e (nfeProc) sintética e assinada, só para testes: CNPJs, nomes, chaves e certificado são inventados.
import forge from 'node-forge'
import { SignedXml } from 'xml-crypto'

const NS = 'http://www.portalfiscal.inf.br/nfe'
export const EMPRESA = '12345678000199'
export const CHAVE = '1'.repeat(44)

const keys = forge.pki.rsa.generateKeyPair(1024)
const cert = forge.pki.createCertificate()
cert.publicKey = keys.publicKey; cert.serialNumber = '01'
cert.validity.notBefore = new Date(Date.now() - 86_400_000); cert.validity.notAfter = new Date(Date.now() + 86_400_000)
cert.setSubject([{ name: 'commonName', value: 'EMITENTE TESTE' }]); cert.setIssuer(cert.subject.attributes)
cert.sign(keys.privateKey)
const privateKey = forge.pki.privateKeyToPem(keys.privateKey)
const publicCert = forge.pki.certificateToPem(cert)

export function nfeProc({ chave = CHAVE, dest = EMPRESA, cStat = '100', valor = '150.50' } = {}) {
  const nfe = `<NFe xmlns="${NS}"><infNFe Id="NFe${chave}" versao="4.00"><ide><serie>1</serie><nNF>123</nNF><dhEmi>2026-11-10T10:00:00-04:00</dhEmi></ide>`
    + `<emit><CNPJ>99999999000191</CNPJ><xNome>FORNECEDOR TESTE LTDA</xNome></emit><dest><CNPJ>${dest}</CNPJ></dest>`
    + `<total><ICMSTot><vNF>${valor}</vNF></ICMSTot></total></infNFe></NFe>`
  const sig = new SignedXml({ privateKey, publicCert, signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1', canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315' })
  sig.addReference({
    xpath: "//*[local-name(.)='infNFe']",
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'],
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
  })
  sig.computeSignature(nfe, { location: { reference: "//*[local-name(.)='infNFe']", action: 'after' } })
  const assinada = sig.getSignedXml()
  const digVal = assinada.match(/<DigestValue>([^<]*)<\/DigestValue>/)[1]
  const prot = `<protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><chNFe>${chave}</chNFe><cStat>${cStat}</cStat><digVal>${digVal}</digVal></infProt></protNFe>`
  return `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="${NS}" versao="4.00">${assinada}${prot}</nfeProc>`
}
