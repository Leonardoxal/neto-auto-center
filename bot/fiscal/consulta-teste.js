// Uma única consulta de teste em HOMOLOGAÇÃO (ultNSU 0). Mostra só o código de retorno e os NSU: nunca XML, chave ou senha.
// Se voltar cStat 137 (sem documentos), espere 1 hora antes de repetir: consultar antes dá cStat 656 e bloqueio de 1 hora.
import '../env.js'
import { readFileSync } from 'node:fs'
import { lerCertificado } from './certificado.js'
import { consultar } from './sefaz.js'

const pfx = readFileSync(process.env.CERT_PFX_CAMINHO)
const senha = process.env.CERT_PFX_SENHA
const { cnpj } = lerCertificado(pfx, senha)
try {
  const r = await consultar({ ambiente: 'homologacao', pfx, senha, cnpj, ultNSU: 0 })
  console.log(`cStat ${r.cStat} | ${r.xMotivo} | ultNSU ${r.ultNSU} | maxNSU ${r.maxNSU} | documentos ${r.docs}`)
} catch (e) {
  console.error(e.message)
  process.exit(1)
}
