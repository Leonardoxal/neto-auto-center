// Leitura e validação dos documentos que a SEFAZ distribui (docZip). Nada daqui chama o banco nem a rede.
// Regra: só dados da parte ASSINADA da nota vão para a fila; o que está fora da assinatura não é confiado.
import zlib from 'node:zlib'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { XMLParser } from 'fast-xml-parser'
import { SignedXml } from 'xml-crypto'

const MAX_XML = 5 * 1024 * 1024 // abaixo do limite de 10 MB do banco; também limita a descompressão (gzip bomb)
const NS_NFE = 'http://www.portalfiscal.inf.br/nfe'
const NS_DSIG = 'http://www.w3.org/2000/09/xmldsig#'
const CSTAT_AUTORIZADA = ['100', '150'] // a conferir com um documento real em homologação

// parseTagValue:false mantém tudo como texto (chave e valor nunca passam por número de ponto flutuante).
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: true, parseTagValue: false, parseAttributeValue: false, processEntities: false })

export function descompactar(base64) {
  return zlib.gunzipSync(Buffer.from(base64, 'base64'), { maxOutputLength: MAX_XML }).toString('utf8')
}

/** Tipo do documento pelo elemento raiz. Nomes a conferir com documentos reais em homologação. */
export function classificar(xml) {
  const raiz = xml.match(/^\s*(?:<\?xml[^>]*\?>\s*)?<(?:[A-Za-z0-9_]+:)?([A-Za-z0-9_]+)/)?.[1]
  return { nfeProc: 'nfe', resNFe: 'resumo_nfe', procEventoNFe: 'evento', resEvento: 'resumo_evento' }[raiz] ?? 'desconhecido'
}

const TIPO_EVENTO = { 110111: 'cancelamento', 110110: 'carta_correcao' } // a conferir com eventos reais em homologação
const EVENTO_REGISTRADO = ['135', '136', '155'] // cStat do retorno do evento; a conferir

/**
 * Evento completo (procEventoNFe): devolve { tipo, chave, registrado } ou null se ilegível.
 * shortcut: não verifica a assinatura do evento (vem direto da SEFAZ por TLS); subir para verificação se a origem mudar.
 */
export function lerEvento(xml) {
  if (xml.length > MAX_XML || /<!DOCTYPE|<!ENTITY/i.test(xml)) return null
  try {
    const p = parser.parse(xml).procEventoNFe
    const inf = p?.evento?.infEvento, ret = p?.retEvento?.infEvento
    const chave = inf?.chNFe
    if (!/^\d{44}$/.test(chave ?? '') || ret?.chNFe !== chave) return null
    return { tipo: TIPO_EVENTO[inf.tpEvento] ?? 'outro', chave, registrado: EVENTO_REGISTRADO.includes(ret.cStat) }
  } catch { return null }
}

const pem = b64 => `-----BEGIN CERTIFICATE-----\n${b64.replace(/\s+/g, '').match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----`
const recusa = motivo => ({ ok: false, motivo })

/**
 * Valida uma NF-e completa (nfeProc) e devolve os campos para receber_nota_compra.
 * shortcut: confere integridade da assinatura com o certificado embutido, sem validar a cadeia ICP-Brasil; o documento vem
 * direto da SEFAZ por TLS. Subir para validação de cadeia se a nota passar a vir de outra origem.
 */
export function validarNfe(xml, cnpjEmpresa) {
  if (xml.length > MAX_XML) return recusa('XML acima do tamanho máximo')
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return recusa('XML com declaração de tipo/entidade (recusado)')

  let nfe, prot
  try { const p = parser.parse(xml).nfeProc; nfe = p.NFe; prot = p.protNFe?.infProt } catch { return recusa('XML mal formado') }
  if (!nfe?.infNFe || !prot) return recusa('NF-e sem infNFe ou sem protocolo')
  if (!CSTAT_AUTORIZADA.includes(prot.cStat)) return recusa(`nota não autorizada (cStat ${prot.cStat})`)

  const chave = /^NFe(\d{44})$/.exec(nfe.infNFe['@_Id'] ?? '')?.[1]
  if (!chave) return recusa('Id da NF-e inválido')
  if (prot.chNFe !== chave) return recusa('chave do protocolo diferente da chave da nota')
  if (prot.digVal !== nfe.Signature?.SignedInfo?.Reference?.DigestValue) return recusa('protocolo não corresponde à nota assinada')

  // Assinatura: a verificação devolve o infNFe exato que foi assinado; só ele é lido daqui para baixo.
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const nfeEl = doc.getElementsByTagNameNS(NS_NFE, 'NFe')[0]
  const sigEl = nfeEl && Array.from(nfeEl.childNodes).find(n => n.localName === 'Signature' && n.namespaceURI === NS_DSIG)
  const cert = nfe.Signature?.KeyInfo?.X509Data?.X509Certificate
  if (!sigEl || !cert) return recusa('NF-e sem assinatura')
  let assinado
  try {
    const sig = new SignedXml({ publicCert: pem(cert), getCertFromKeyInfo: () => null })
    sig.loadSignature(sigEl)
    if (!sig.checkSignature(new XMLSerializer().serializeToString(doc))) return recusa('assinatura inválida')
    const refs = sig.getSignedReferences()
    if (refs.length !== 1) return recusa('assinatura com referências inesperadas')
    assinado = parser.parse(refs[0]).infNFe
  } catch { return recusa('assinatura inválida') }
  if (assinado?.['@_Id'] !== `NFe${chave}`) return recusa('o que foi assinado não é a nota informada')

  if (assinado.dest?.CNPJ !== cnpjEmpresa) return recusa('destinatário diferente da empresa')
  const valor = assinado.total?.ICMSTot?.vNF
  if (!/^\d{1,13}\.\d{2}$/.test(valor ?? '')) return recusa('valor da nota inválido')
  const { nNF, serie, dhEmi } = assinado.ide ?? {}
  const fornecedor = assinado.emit?.xNome
  if (!nNF || serie == null || !dhEmi || !fornecedor || Number.isNaN(Date.parse(dhEmi))) return recusa('campos da nota incompletos')

  return { ok: true, nota: { chave, numero: nNF, serie: String(serie), emissao: dhEmi, fornecedor, valor, xml } }
}
