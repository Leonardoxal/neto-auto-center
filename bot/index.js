// Robô de WhatsApp da NETO AUTO CENTER.
// Roda num computador da oficina (não na Vercel): mantém a conexão do WhatsApp Web aberta,
// responde aos comandos dos números autorizados, avisa aprovações/conclusões/entregas e manda os relatórios do dia.
import './env.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import makeWASocket, { Browsers, DisconnectReason, useMultiFileAuthState } from 'baileys'
import qrcode from 'qrcode-terminal'
import * as banco from './banco.js'
import { buscar, digitos, interpretar, mesmoTelefone } from './comandos.js'
import * as txt from './textos.js'

const PASTA = new URL('.', import.meta.url)
const ARQ_ESTADO = fileURLToPath(new URL('estado.json', PASTA))
const MANHA = process.env.RELATORIO_MANHA || '07:30'
const FIM = process.env.RELATORIO_FIM || '18:00'
const JANELA_RELATORIO_MIN = 120 // depois disso o relatório do dia não sai mais (ex.: computador ligado à tarde)
const INTERVALO_AVISOS = 20_000
const EXPIRA_CONVERSA = 5 * 60_000

const log = (...a) => console.log(new Date().toLocaleString('pt-BR', { timeZone: txt.FUSO }), '|', ...a)
const silencioso = { level: 'silent', child() { return this }, trace() {}, debug() {}, info() {}, warn() {}, error: e => log('baileys:', e?.msg ?? e), fatal: e => log('baileys:', e) }

// ---------- estado salvo em disco: último evento avisado e relatórios já enviados ----------
let estado = { ultimoEvento: 0, manha: '', fim: '' }
try { estado = { ...estado, ...JSON.parse(readFileSync(ARQ_ESTADO, 'utf8')) } } catch { /* primeira execução */ }
const salvar = () => writeFileSync(ARQ_ESTADO, JSON.stringify(estado, null, 2))

// ---------- autorizados (cache curto: mudanças no banco valem em até 1 minuto) ----------
let cacheAut = { em: 0, lista: [] }
async function listaAutorizados() {
  if (Date.now() - cacheAut.em > 60_000) cacheAut = { em: Date.now(), lista: await banco.autorizados() }
  return cacheAut.lista
}

let sock
const conversas = new Map() // telefone → { acao, candidatos?, veiculo?, expira }
const vistos = new Set() // ids de mensagens já tratadas nesta execução

async function telefoneDe(key) {
  const pn = [key.remoteJid, key.remoteJidAlt, key.senderPn].find(j => j?.endsWith('@s.whatsapp.net'))
  if (pn) return digitos(pn.split('@')[0].split(':')[0])
  if (key.remoteJid?.endsWith('@lid')) {
    const r = await sock.signalRepository?.lidMapping?.getPNForLID(key.remoteJid).catch(() => null)
    if (r) return digitos(r.split('@')[0].split(':')[0])
  }
  return null
}

const jids = new Map()
async function jidDe(telefone) {
  if (!jids.has(telefone)) {
    const [r] = await sock.onWhatsApp(telefone).catch(() => [])
    jids.set(telefone, r?.exists ? r.jid : `${telefone}@s.whatsapp.net`)
  }
  return jids.get(telefone)
}
async function enviar(telefones, texto) {
  for (const t of telefones) {
    try { await sock.sendMessage(await jidDe(t), { text: texto }) } catch (e) { log('falha ao enviar para', t, e.message) }
  }
}

// ---------- mensagens recebidas ----------
async function tratar(m) {
  if (m.key.fromMe || !m.message || vistos.has(m.key.id)) return
  const jid = m.key.remoteJid ?? ''
  if (jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.endsWith('@newsletter')) return
  const texto = m.message.conversation ?? m.message.extendedTextMessage?.text
  if (!texto) return
  vistos.add(m.key.id); if (vistos.size > 2000) vistos.clear()

  const responder = t => sock.sendMessage(jid, { text: t })
  const tel = await telefoneDe(m.key)
  let aut
  try { aut = (await listaAutorizados()).find(a => mesmoTelefone(a.telefone, tel)) }
  catch (e) { log('banco indisponível ao checar autorização:', e.message); return }
  if (!aut) { log('mensagem ignorada de número não autorizado:', tel ?? jid); return }

  const cmd = interpretar(texto)
  let conv = conversas.get(aut.telefone)
  if (conv && conv.expira < Date.now()) { conversas.delete(aut.telefone); conv = undefined }

  try {
    switch (cmd.tipo) {
      case 'ajuda': return responder(txt.ajuda())
      case 'patio': return responder(txt.patio(await banco.noPatio()))
      case 'pendentes': return responder(txt.pendentes(await banco.noPatio()))
      case 'prontos': return responder(txt.prontos(await banco.noPatio()))
      case 'status': {
        const achados = buscar(await banco.noPatio(), cmd.termo)
        if (!achados.length) return responder(`Não encontrei "${cmd.termo}" no pátio. Envie a placa completa, por exemplo: STATUS ABC1D23`)
        return responder(achados.map(v => txt.status(v)).join('\n\n'))
      }
      case 'finalizar': case 'entregar': {
        const achados = buscar(await banco.noPatio(), cmd.termo)
        if (!achados.length) return responder(`Não encontrei "${cmd.termo}" no pátio. Envie a placa, por exemplo: ABC1D23 ${cmd.tipo === 'finalizar' ? 'FINALIZADO' : 'ENTREGUE'}`)
        if (achados.length > 9) return responder('Muitos veículos com esse nome. Envie a placa.')
        if (achados.length > 1) {
          conversas.set(aut.telefone, { acao: cmd.tipo, candidatos: achados, expira: Date.now() + EXPIRA_CONVERSA })
          return responder(txt.escolher(achados))
        }
        conversas.set(aut.telefone, { acao: cmd.tipo, veiculo: achados[0], expira: Date.now() + EXPIRA_CONVERSA })
        return responder(txt.confirmar(cmd.tipo, achados[0]))
      }
      case 'escolha': {
        const v = conv?.candidatos?.[cmd.n - 1]
        if (!v) return responder(conv?.candidatos ? 'Número fora da lista. Responda com um dos números mostrados.' : txt.ajuda())
        conversas.set(aut.telefone, { acao: conv.acao, veiculo: v, expira: Date.now() + EXPIRA_CONVERSA })
        return responder(txt.confirmar(conv.acao, v))
      }
      case 'nao':
        if (!conv) return responder('Nada para cancelar.')
        conversas.delete(aut.telefone); return responder('Cancelado. Nada foi alterado.')
      case 'sim': {
        if (!conv?.veiculo) return responder('Nada para confirmar. Envie, por exemplo: ABC1D23 FINALIZADO')
        conversas.delete(aut.telefone) // antes de gravar: um segundo SIM não repete a operação
        try {
          await banco.registrar(conv.acao, m.key.id, aut.telefone, conv.veiculo.id)
        } catch (e) {
          if (e.code === '23505') return responder('Esta confirmação já tinha sido registrada.')
          if (e.code) return responder(`Não foi possível registrar: ${e.message}`)
          log('falha de conexão ao gravar:', e.message)
          return responder(`Não consegui confirmar a gravação no sistema. Antes de repetir, confira com: STATUS ${conv.veiculo.placa}`)
        }
        log(`${aut.nome} registrou ${conv.acao} de ${conv.veiculo.placa}`)
        return responder(txt.feito(conv.acao, conv.veiculo))
      }
      default:
        return responder(`Não entendi. ${txt.ajuda()}`)
    }
  } catch (e) {
    log('erro ao tratar mensagem:', e.message)
    return responder('Não consegui acessar o sistema agora. Nada foi alterado. Tente de novo em alguns minutos.')
  }
}

// ---------- avisos imediatos (lê o histórico: pega o que o painel e o robô gravaram, mesmo com o robô desligado) ----------
function tipoAviso(ev) {
  if (ev.tipo === 'Aprovação') return 'aprovado'
  if (ev.tipo === 'Operacional' && ev.descricao.endsWith('Serviço concluído')) return 'finalizado'
  if (ev.tipo === 'Saída' && ev.descricao.startsWith('Veículo entregue')) return 'entregue'
  return null
}
let avisando = false
async function avisos() {
  if (avisando) return
  avisando = true
  try {
    if (!estado.ultimoEvento) { estado.ultimoEvento = await banco.ultimoEvento(); salvar(); return } // não reenvia o histórico antigo
    for (const ev of await banco.eventosDepois(estado.ultimoEvento)) {
      const tipo = tipoAviso(ev)
      if (tipo) {
        const v = await banco.umVeiculo(ev.atendimento_id)
        const aut = await listaAutorizados()
        const texto = tipo === 'aprovado' ? txt.avisoAprovado(v, ev) : tipo === 'finalizado' ? txt.avisoFinalizado(v, ev) : txt.avisoEntregue(v, ev)
        const destino = tipo === 'aprovado' ? aut : aut.filter(a => a.papel === 'admin')
        await enviar(destino.map(a => a.telefone), texto)
        log(`aviso ${tipo}: ${v.placa}`)
      }
      estado.ultimoEvento = ev.id; salvar()
    }
  } catch (e) { log('avisos: banco indisponível, tento de novo:', e.message) }
  finally { avisando = false }
}

// ---------- relatórios do início e do fim do dia ----------
const horaLocal = () => new Intl.DateTimeFormat('pt-BR', { timeZone: txt.FUSO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())
const minutos = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m }
async function relatorios() {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: txt.FUSO }).format(new Date())
  const agora = minutos(horaLocal())
  const devido = (hm, chave) => estado[chave] !== hoje && agora >= minutos(hm) && agora < minutos(hm) + JANELA_RELATORIO_MIN
  try {
    for (const [hm, chave] of [[MANHA, 'manha'], [FIM, 'fim']]) {
      if (!devido(hm, chave)) continue
      const destino = (await listaAutorizados()).filter(a => a.recebe_relatorios).map(a => a.telefone)
      const patio = await banco.noPatio()
      const texto = chave === 'manha' ? txt.relatorioManha(patio) : txt.relatorioFim(patio, await banco.doDia(txt.inicioDoDia()))
      await enviar(destino, texto)
      estado[chave] = hoje; salvar()
      log(`relatório ${chave} enviado para ${destino.length} número(s)`)
    }
  } catch (e) { log('relatório: banco indisponível, tento de novo:', e.message) }
}

// ---------- conexão ----------
let timers = []
async function conectar() {
  const { state, saveCreds } = await useMultiFileAuthState(fileURLToPath(new URL('sessao', PASTA)))
  sock = makeWASocket({ auth: state, logger: silencioso, browser: Browsers.windows('NETO AUTO CENTER'), markOnlineOnConnect: false })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) { log('Escaneie o QR code abaixo no WhatsApp do robô (Aparelhos conectados › Conectar um aparelho):'); qrcode.generate(qr, { small: true }) }
    if (connection === 'open') {
      log('Conectado ao WhatsApp.')
      timers.forEach(clearInterval)
      timers = [setInterval(avisos, INTERVALO_AVISOS), setInterval(relatorios, 30_000)]
      avisos(); relatorios()
    }
    if (connection === 'close') {
      timers.forEach(clearInterval); timers = []
      const codigo = lastDisconnect?.error?.output?.statusCode
      if (codigo === DisconnectReason.loggedOut) {
        log('O WhatsApp desconectou este computador. Apague a pasta bot/sessao e rode de novo para escanear o QR code.')
        process.exit(1)
      }
      log(`Conexão caiu (código ${codigo ?? '?'}). Reconectando em 5 s…`)
      setTimeout(() => conectar().catch(e => { log('falha ao reconectar:', e.message); process.exit(1) }), 5000)
    }
  })
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const m of messages) await tratar(m).catch(e => log('erro na mensagem:', e.message))
  })
}

log(`Iniciando. Relatórios às ${MANHA} e ${FIM} (${txt.FUSO}).`)
conectar().catch(e => { log('falha ao iniciar:', e.message); process.exit(1) })
