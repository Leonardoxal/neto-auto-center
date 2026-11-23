// Processo do conector fiscal das notas de compra. Roda separado do robô de WhatsApp: se um cair, o outro continua.
// Uma volta por minuto; quem decide se pode consultar a SEFAZ é o horário "próxima consulta" guardado no banco.
import '../env.js'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { lerCertificado } from './certificado.js'
import { rodarBusca } from './conector.js'
import { consultar } from './sefaz.js'

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CERT_PFX_CAMINHO, CERT_PFX_SENHA, FISCAL_AMBIENTE = 'homologacao' } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em bot/.env.')
if (!CERT_PFX_CAMINHO || !CERT_PFX_SENHA) throw new Error('Faltam CERT_PFX_CAMINHO e CERT_PFX_SENHA em bot/.env.')
if (!['homologacao', 'producao'].includes(FISCAL_AMBIENTE)) throw new Error('FISCAL_AMBIENTE deve ser "homologacao" ou "producao".')

const ambiente = FISCAL_AMBIENTE
const pfx = readFileSync(CERT_PFX_CAMINHO)
const { cnpj, validoAte, diasRestantes } = lerCertificado(pfx, CERT_PFX_SENHA)
if (!cnpj) throw new Error('Não foi possível ler o CNPJ do certificado.')
if (diasRestantes < 0) throw new Error('Certificado vencido: instale o novo (veja docs/NOTAS_COMPRA.md).')

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const log = (...a) => console.log(new Date().toLocaleString('pt-BR', { timeZone: 'America/Cuiaba' }), '|', ...a)
log(`conector fiscal iniciado | ambiente ${ambiente} | certificado vence em ${diasRestantes} dias`)

const VOLTA_MS = 60_000
for (;;) {
  try {
    const r = await rodarBusca({ db, ambiente, cnpj, validade: validoAte, log, consultar: ({ ultNSU }) => consultar({ ambiente, pfx, senha: CERT_PFX_SENHA, cnpj, ultNSU }) })
    if (r.consultou) log('rodada concluída', JSON.stringify({ recebidas: r.recebidas, existentes: r.existentes, excluidas: r.excluidas, descartadas: r.descartadas, outros: r.outros, cStat: r.cStat }))
  } catch (e) {
    log('erro na rodada:', String(e.message).slice(0, 200))
  }
  await new Promise(resolve => setTimeout(resolve, VOLTA_MS))
}
