// Laço de busca das NF-e de compra: consulta a SEFAZ por NSU, valida e entrega à fila (receber_nota_compra).
// O estado (último NSU, próxima consulta permitida) fica no banco. Log: só chave, NSU e código de retorno; nunca XML.
import { classificar, descompactar, lerEvento, validarNfe } from './documentos.js'

// Depois de cStat 137 (sem documentos) a SEFAZ exige ~1 hora antes de nova consulta; antes disso dá 656 e bloqueia o CNPJ.
// A margem de 1 minuto cobre diferença de relógio. A conferir na nota técnica vigente.
export const INTERVALO_MS = 61 * 60_000
const RETENTAR_REDE_MS = 5 * 60_000
const MAX_LOTES = 50 // trava de segurança: um laço nunca roda sem fim

const curto = e => String(e?.message ?? e).slice(0, 200)
const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data }

async function entregar(db, nota) {
  // valor segue como texto ("150.50"): nunca passa por número de ponto flutuante.
  return ok(await db.rpc('receber_nota_compra', {
    p_chave: nota.chave, p_numero: nota.numero, p_serie: nota.serie, p_emissao: nota.emissao,
    p_fornecedor: nota.fornecedor, p_valor: nota.valor, p_xml: nota.xml,
  }))
}

/** Uma rodada: respeita o intervalo guardado no banco e continua do último NSU até alcançar o maxNSU. */
export async function rodarBusca({ db, ambiente, cnpj, consultar, validade = null, agora = () => new Date(), log = () => {} }) {
  // p_erro nulo mantém o último erro; '' limpa (ver migração 0012).
  const gravar = async (campos = {}) => ok(await db.rpc('conector_compras_gravar', {
    p_ambiente: ambiente, p_ult_nsu: null, p_consulta: null, p_proxima: null, p_resultado: null, p_erro: null,
    p_validade: validade?.toISOString() ?? null, p_cartas: 0, ...campos,
  }))

  const [estado] = ok(await db.rpc('conector_compras_estado', { p_ambiente: ambiente }))
  if (estado.proxima_consulta && new Date(estado.proxima_consulta) > agora()) {
    await gravar() // só sinal de vida
    return { consultou: false }
  }

  let ultNSU = estado.ult_nsu
  const total = { recebidas: 0, existentes: 0, excluidas: 0, descartadas: 0, outros: 0, canceladas: 0, cartas: 0 }
  for (let lote = 0; lote < MAX_LOTES; lote++) {
    let r
    try { r = await consultar({ ultNSU }) }
    catch (e) {
      await gravar({ p_proxima: new Date(agora().getTime() + RETENTAR_REDE_MS).toISOString(), p_erro: `Falha de comunicação com a SEFAZ: ${curto(e)}` })
      return { consultou: false, erro: true }
    }

    if (r.cStat !== '137' && r.cStat !== '138') {
      const proxima = new Date(agora().getTime() + INTERVALO_MS).toISOString()
      const erro = r.cStat === '656' ? 'A SEFAZ bloqueou temporariamente as consultas (consumo indevido). Nova tentativa na próxima janela.' : `SEFAZ rejeitou a consulta: cStat ${r.cStat} ${r.xMotivo ?? ''}`
      log(`consulta rejeitada cStat ${r.cStat}`)
      await gravar({ p_consulta: agora().toISOString(), p_proxima: proxima, p_resultado: `cStat ${r.cStat}`, p_erro: erro })
      return { consultou: true, cStat: r.cStat }
    }

    for (const d of r.docZips) {
      let xml
      try { xml = descompactar(d.base64) } catch { total.descartadas++; log(`NSU ${d.nsu}: documento ilegível`); continue }
      const tipo = classificar(xml)
      if (tipo === 'evento') {
        const ev = lerEvento(xml)
        if (ev?.registrado && ev.tipo === 'cancelamento') {
          ok(await db.rpc('cancelar_nota_compra', { p_chave: ev.chave })) // tira da fila e impede reimportar
          total.canceladas++; log(`NSU ${d.nsu}: chave ${ev.chave} cancelada`)
        } else if (ev?.registrado && ev.tipo === 'carta_correcao') total.cartas++ // fora do escopo: só a contagem
        else total.outros++
        continue
      }
      if (tipo !== 'nfe') { total.outros++; continue } // resumos: exigem a Ciência da Operação, ainda não autorizada
      const v = validarNfe(xml, cnpj)
      if (!v.ok) { total.descartadas++; log(`NSU ${d.nsu}: descartada (${v.motivo})`); continue }
      const res = await entregar(db, v.nota)
      if (res === 'recebida') total.recebidas++
      else if (res === 'existente') total.existentes++
      else total.excluidas++
      log(`NSU ${d.nsu}: chave ${v.nota.chave} ${res}`)
    }

    // Só avança o NSU depois de entregar o lote inteiro; se algo falhar acima, o lote é refeito (entrega é idempotente).
    const proximoNSU = r.ultNSU ?? ultNSU
    const alcancou = r.cStat === '137' || BigInt(proximoNSU) >= BigInt(r.maxNSU ?? proximoNSU) || BigInt(proximoNSU) <= BigInt(ultNSU)
    await gravar({ p_ult_nsu: proximoNSU })
    ultNSU = proximoNSU
    if (alcancou) {
      const resumo = `${total.recebidas} recebidas, ${total.existentes} já na fila, ${total.excluidas} já excluídas, ${total.canceladas} canceladas, ${total.descartadas} descartadas, ${total.outros} de outros tipos`
      await gravar({ p_consulta: agora().toISOString(), p_proxima: new Date(agora().getTime() + INTERVALO_MS).toISOString(), p_resultado: resumo, p_erro: '', p_cartas: total.cartas })
      return { consultou: true, ...total }
    }
  }
  await gravar({ p_consulta: agora().toISOString(), p_proxima: new Date(agora().getTime() + INTERVALO_MS).toISOString(), p_resultado: 'limite de lotes por rodada', p_erro: '' })
  return { consultou: true, ...total }
}
