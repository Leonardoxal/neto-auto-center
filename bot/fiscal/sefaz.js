// Cliente do serviço nacional NFeDistribuicaoDFe (Ambiente Nacional), SOAP 1.2 sobre TLS com certificado de cliente.
// Endereços, namespace e SOAPAction conferidos em 2026-11-13 no Portal Nacional da NF-e e no WSDL do serviço.
import https from 'node:https'

export const URLS = {
  homologacao: 'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
  producao: 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
}
const NS_WSDL = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe'
const NS_NFE = 'http://www.portalfiscal.inf.br/nfe'
const VERSAO_LEIAUTE = '1.01' // a conferir na nota técnica 2014.002 vigente; versão errada volta como rejeição no cStat
const CUF_AUTOR_MT = '51' // código IBGE de Mato Grosso
const TP_AMB = { homologacao: '2', producao: '1' }

export const nsuComZeros = n => String(n).padStart(15, '0')

export function montarXml({ ambiente, cnpj, ultNSU }) {
  if (!/^\d{14}$/.test(cnpj)) throw new Error('CNPJ deve ter 14 dígitos.')
  return `<distDFeInt xmlns="${NS_NFE}" versao="${VERSAO_LEIAUTE}"><tpAmb>${TP_AMB[ambiente]}</tpAmb>`
    + `<cUFAutor>${CUF_AUTOR_MT}</cUFAutor><CNPJ>${cnpj}</CNPJ><distNSU><ultNSU>${nsuComZeros(ultNSU)}</ultNSU></distNSU></distDFeInt>`
}

export const envelopeSoap = xml =>
  '<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">'
  + `<soap12:Body><nfeDistDFeInteresse xmlns="${NS_WSDL}"><nfeDadosMsg>${xml}</nfeDadosMsg></nfeDistDFeInteresse></soap12:Body></soap12:Envelope>`

// shortcut: campos simples lidos por regex (cStat, xMotivo, ultNSU, maxNSU); os documentos (docZip) exigem parser XML seguro na etapa 3.
export function lerRetorno(soap) {
  const campo = nome => soap.match(new RegExp(`<${nome}>([^<]*)</${nome}>`))?.[1] ?? null
  return { cStat: campo('cStat'), xMotivo: campo('xMotivo'), ultNSU: campo('ultNSU'), maxNSU: campo('maxNSU'), docs: (soap.match(/<docZip /g) ?? []).length }
}

/** Documentos do lote: [{ nsu, schema, base64 }]. O conteúdo continua compactado; quem usa descompacta e valida. */
export const lerDocZips = soap =>
  [...soap.matchAll(/<docZip NSU="(\d+)" schema="([^"]*)">([^<]*)<\/docZip>/g)].map(m => ({ nsu: m[1], schema: m[2], base64: m[3] }))

function enviarHttps(url, corpo, agent) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST', agent, timeout: 30_000,
      headers: { 'Content-Type': 'application/soap+xml; charset=utf-8', 'Content-Length': Buffer.byteLength(corpo) },
    }, res => {
      let d = ''; res.on('data', c => d += c)
      res.on('end', () => resolve({ status: res.statusCode, corpo: d }))
    })
    req.on('timeout', () => req.destroy(new Error('Tempo esgotado ao falar com a SEFAZ.')))
    req.on('error', reject)
    req.end(corpo)
  })
}

/** Uma consulta por ultNSU. `enviar` é injetável para teste. Quem chama é responsável pelo intervalo de consumo. */
export async function consultar({ ambiente, pfx, senha, cnpj, ultNSU, enviar = enviarHttps }) {
  const agent = new https.Agent({ pfx, passphrase: senha })
  const { status, corpo } = await enviar(URLS[ambiente], envelopeSoap(montarXml({ ambiente, cnpj, ultNSU })), agent)
  if (status !== 200) throw new Error(`SEFAZ respondeu HTTP ${status}.`)
  return { ...lerRetorno(corpo), docZips: lerDocZips(corpo) }
}
