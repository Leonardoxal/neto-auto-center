// Leitura do certificado A1 (.pfx) da empresa. Mostra só titular, CNPJ e validade: nunca a senha nem a chave privada.
// Uso: npm run certificado (em bot/). Caminho e senha vêm de bot/.env (CERT_PFX_CAMINHO, CERT_PFX_SENHA).
import '../env.js'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import forge from 'node-forge'

const AVISO_DIAS = 30
const DIA_MS = 86_400_000

/** Lê o .pfx e devolve { titular, cnpj, validoAte, diasRestantes }. Lança erro curto, sem dados sensíveis. */
export function lerCertificado(pfx, senha, agora = new Date()) {
  let p12
  try { p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(pfx.toString('binary')), senha) }
  catch { throw new Error('Não foi possível abrir o certificado: senha incorreta ou arquivo inválido.') }

  const certs = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []
  const chaves = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []
  if (!chaves.length) throw new Error('O arquivo não contém chave privada: precisa ser um certificado A1 completo (.pfx com chave).')

  // O certificado da empresa é o que tem localKeyId (par da chave); os demais são a cadeia da autoridade.
  const bag = certs.find(b => b.attributes?.localKeyId) ?? certs[0]
  if (!bag) throw new Error('O arquivo não contém certificado.')
  const cert = bag.cert

  const titular = cert.subject.getField('CN')?.value ?? ''
  // shortcut: CNPJ lido do CN ("NOME:14 dígitos", padrão ICP-Brasil); upgrade para o campo OID 2.16.76.1.3.3 se algum emissor fugir disso.
  const cnpj = titular.match(/\d{14}/)?.[0] ?? null
  const validoAte = cert.validity.notAfter
  return { titular, cnpj, validoAte, diasRestantes: Math.floor((validoAte - agora) / DIA_MS) }
}

function principal() {
  const { CERT_PFX_CAMINHO, CERT_PFX_SENHA } = process.env
  if (!CERT_PFX_CAMINHO || !CERT_PFX_SENHA) {
    console.error('Faltam CERT_PFX_CAMINHO e CERT_PFX_SENHA em bot/.env (veja bot/.env.example).')
    process.exit(1)
  }
  try {
    const r = lerCertificado(readFileSync(CERT_PFX_CAMINHO), CERT_PFX_SENHA)
    console.log(`Titular:  ${r.titular}`)
    console.log(`CNPJ:     ${r.cnpj ?? 'não identificado no nome do titular'}`)
    console.log(`Validade: ${r.validoAte.toLocaleDateString('pt-BR')} (${r.diasRestantes} dias)`)
    if (r.diasRestantes < 0) { console.error('CERTIFICADO VENCIDO.'); process.exit(2) }
    if (r.diasRestantes <= AVISO_DIAS) console.warn(`Atenção: vence em ${r.diasRestantes} dias. Renove e troque o arquivo.`)
  } catch (e) {
    // Mensagem fixa para ENOENT: a padrão do Node repetiria o caminho do arquivo.
    console.error(e.code === 'ENOENT' ? 'Arquivo do certificado não encontrado no caminho de CERT_PFX_CAMINHO.' : e.message)
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal()
