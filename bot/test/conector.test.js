import test from 'node:test'
import assert from 'node:assert/strict'
import zlib from 'node:zlib'
import { INTERVALO_MS, rodarBusca } from '../fiscal/conector.js'
import { EMPRESA, nfeProc } from './nfe-sintetica.js'

const AGORA = new Date('2026-11-13T12:00:00Z')
const nsu = n => String(n).padStart(15, '0')
const docZip = (n, xml) => ({ nsu: nsu(n), schema: 'x', base64: zlib.gzipSync(xml).toString('base64') })
const chaveN = n => String(n).repeat(44)

// Banco de mentira: guarda o estado e as chamadas; `recebe` decide a resposta de receber_nota_compra.
function bancoFalso({ ultNSU = nsu(0), proxima = null, recebe = () => 'recebida' } = {}) {
  const gravacoes = [], recebidas = [], canceladas = []
  return {
    gravacoes, recebidas, canceladas,
    rpc: async (nome, args) => {
      if (nome === 'cancelar_nota_compra') { canceladas.push(args.p_chave); return { data: null, error: null } }
      if (nome === 'conector_compras_estado') return { data: [{ ult_nsu: ultNSU, proxima_consulta: proxima, busca_pedida_em: null }], error: null }
      if (nome === 'conector_compras_gravar') { gravacoes.push(args); return { data: null, error: null } }
      if (nome === 'receber_nota_compra') { recebidas.push(args); return { data: recebe(args), error: null } }
      throw new Error(`rpc inesperada: ${nome}`)
    },
  }
}
const rodar = (db, respostas) => {
  const pedidos = []
  const consultar = async ({ ultNSU }) => { pedidos.push(ultNSU); return respostas.shift() }
  return rodarBusca({ db, ambiente: 'homologacao', cnpj: EMPRESA, consultar, agora: () => AGORA }).then(r => ({ r, pedidos }))
}
const em = ms => new Date(AGORA.getTime() + ms).toISOString()

test('continua o laço pelo NSU até alcançar o maxNSU e entrega cada nota', async () => {
  const db = bancoFalso()
  const { r, pedidos } = await rodar(db, [
    { cStat: '138', ultNSU: nsu(1), maxNSU: nsu(2), docZips: [docZip(1, nfeProc({ chave: chaveN(1) }))] },
    { cStat: '138', ultNSU: nsu(2), maxNSU: nsu(2), docZips: [docZip(2, nfeProc({ chave: chaveN(2) }))] },
  ])
  assert.deepEqual(pedidos, [nsu(0), nsu(1)])
  assert.equal(r.recebidas, 2)
  assert.deepEqual(db.recebidas.map(x => x.p_chave), [chaveN(1), chaveN(2)])
  assert.equal(db.recebidas[0].p_valor, '150.50') // texto, nunca número
  assert.equal(db.gravacoes.at(-1).p_proxima, em(INTERVALO_MS))
  assert.equal(db.gravacoes.at(-1).p_ult_nsu, null) // o último NSU foi gravado no lote anterior
  assert.ok(db.gravacoes.some(g => g.p_ult_nsu === nsu(2)))
})

test('sem documentos (137) agenda a próxima consulta depois do intervalo', async () => {
  const db = bancoFalso()
  const { r } = await rodar(db, [{ cStat: '137', xMotivo: 'Nenhum documento localizado', ultNSU: nsu(0), maxNSU: nsu(0), docZips: [] }])
  assert.equal(r.recebidas, 0)
  assert.equal(db.gravacoes.at(-1).p_proxima, em(INTERVALO_MS))
})

test('não consulta antes do horário permitido guardado no banco', async () => {
  const db = bancoFalso({ proxima: em(10 * 60_000) })
  const { r, pedidos } = await rodar(db, [])
  assert.equal(r.consultou, false)
  assert.deepEqual(pedidos, [])
})

test('rejeição por consumo indevido (656) registra o erro, espera a janela e não entrega nada', async () => {
  const db = bancoFalso()
  const { r } = await rodar(db, [{ cStat: '656', xMotivo: 'Consumo Indevido', docZips: [] }])
  assert.equal(r.cStat, '656')
  assert.equal(db.recebidas.length, 0)
  const g = db.gravacoes.at(-1)
  assert.match(g.p_erro, /bloqueou/)
  assert.equal(g.p_proxima, em(INTERVALO_MS))
})

test('nota para outro destinatário é descartada; repetida vira "já na fila"', async () => {
  const db = bancoFalso({ recebe: () => 'existente' })
  const { r } = await rodar(db, [{ cStat: '138', ultNSU: nsu(2), maxNSU: nsu(2), docZips: [
    docZip(1, nfeProc({ chave: chaveN(1), dest: '99999999000191' })), docZip(2, nfeProc({ chave: chaveN(2) })),
  ] }])
  assert.equal(r.descartadas, 1)
  assert.equal(r.existentes, 1)
  assert.equal(db.recebidas.length, 1)
})

test('falha de rede mantém o NSU e tenta de novo em poucos minutos', async () => {
  const db = bancoFalso()
  const consultar = async () => { throw new Error('ECONNRESET') }
  const r = await rodarBusca({ db, ambiente: 'homologacao', cnpj: EMPRESA, consultar, agora: () => AGORA })
  assert.equal(r.erro, true)
  assert.equal(db.gravacoes.at(-1).p_ult_nsu, null)
  assert.equal(db.gravacoes.at(-1).p_proxima, em(5 * 60_000))
})

test('se a entrega ao banco falha, o NSU do lote não avança', async () => {
  const db = bancoFalso()
  db.rpc = async nome => nome === 'receber_nota_compra' ? { data: null, error: { message: 'banco fora' } }
    : nome === 'conector_compras_estado' ? { data: [{ ult_nsu: nsu(0), proxima_consulta: null }], error: null } : { data: null, error: null }
  const gravou = []
  const original = db.rpc
  db.rpc = async (nome, args) => { if (nome === 'conector_compras_gravar') gravou.push(args); return original(nome, args) }
  const consultar = async () => ({ cStat: '138', ultNSU: nsu(1), maxNSU: nsu(1), docZips: [docZip(1, nfeProc())] })
  await assert.rejects(rodarBusca({ db, ambiente: 'homologacao', cnpj: EMPRESA, consultar, agora: () => AGORA }), /banco fora/)
  assert.ok(gravou.every(g => g.p_ult_nsu === null))
})

const evento = (chave, tp = '110111', cStat = '135') => `<procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><evento versao="1.00"><infEvento><chNFe>${chave}</chNFe><tpEvento>${tp}</tpEvento></infEvento></evento>`
  + `<retEvento versao="1.00"><infEvento><cStat>${cStat}</cStat><chNFe>${chave}</chNFe></infEvento></retEvento></procEventoNFe>`

test('cancelamento registrado tira a nota da fila', async () => {
  const db = bancoFalso()
  const { r } = await rodar(db, [{ cStat: '138', ultNSU: nsu(1), maxNSU: nsu(1), docZips: [docZip(1, evento(chaveN(5)))] }])
  assert.deepEqual(db.canceladas, [chaveN(5)])
  assert.equal(r.canceladas, 1)
})

test('cancelamento não registrado pela SEFAZ não mexe na fila', async () => {
  const db = bancoFalso()
  await rodar(db, [{ cStat: '138', ultNSU: nsu(1), maxNSU: nsu(1), docZips: [docZip(1, evento(chaveN(5), '110111', '999'))] }])
  assert.deepEqual(db.canceladas, [])
})

test('carta de correção só é contada', async () => {
  const db = bancoFalso()
  const { r } = await rodar(db, [{ cStat: '138', ultNSU: nsu(1), maxNSU: nsu(1), docZips: [docZip(1, evento(chaveN(5), '110110'))] }])
  assert.deepEqual(db.canceladas, [])
  assert.equal(r.cartas, 1)
  assert.equal(db.gravacoes.at(-1).p_cartas, 1)
})
