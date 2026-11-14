// Acesso ao mesmo banco do painel (Supabase). Usa a chave service_role, que só existe no .env deste computador.
import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo bot/.env (veja bot/.env.example).')
}
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const SEL = 'id,placa,modelo,servico,entrada,saida,sit_fisica,sit_comercial,sit_operacional,enviado_em,aprovado_em,concluido_em,valor_aprovado,atualizado_em,'
  + 'locadoras(nome),orcamento_revisoes(valor,seq)'

const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data }

function veiculo(a) {
  const revs = [...(a.orcamento_revisoes ?? [])].sort((x, y) => x.seq - y.seq)
  return {
    id: a.id, placa: a.placa, modelo: a.modelo, servico: a.servico, cliente: a.locadoras?.nome ?? '',
    valor: a.valor_aprovado ?? (revs.length ? +revs[revs.length - 1].valor : null),
    entrada: a.entrada, saida: a.saida, enviado_em: a.enviado_em, aprovado_em: a.aprovado_em, concluido_em: a.concluido_em,
    atualizado_em: a.atualizado_em, sit_fisica: a.sit_fisica, sit_comercial: a.sit_comercial, sit_operacional: a.sit_operacional,
  }
}

export const autorizados = async () =>
  ok(await db.from('whatsapp_autorizados').select('telefone,nome,papel,recebe_relatorios').eq('ativo', true))

export const noPatio = async () =>
  ok(await db.from('atendimentos').select(SEL).eq('sit_fisica', 'patio').eq('arquivado', false).order('entrada')).map(veiculo)

export async function doDia(inicio) {
  const d = inicio.toISOString()
  return ok(await db.from('atendimentos').select(SEL).eq('arquivado', false)
    .or(`entrada.gte.${d},aprovado_em.gte.${d},concluido_em.gte.${d},saida.gte.${d}`)).map(veiculo)
}

/** Parcelas de notas fiscais (não canceladas) com saldo em aberto, já descontadas as baixas. */
export async function parcelasAbertas() {
  const todas = async (tabela, cols, ordem) => {
    const out = []
    for (let de = 0; ; de += 1000) {
      const r = ok(await db.from(tabela).select(cols).order(ordem).range(de, de + 999))
      out.push(...r); if (r.length < 1000) return out
    }
  }
  const [notas, parcelas, receb] = await Promise.all([
    todas('notas', 'id,cliente,cancelada,numero,numero_rps', 'id'), todas('nota_parcelas', 'id,nota_id,vencimento,valor', 'id'),
    todas('nota_recebimentos', 'id,parcela_id,valor,estornado_em', 'id')])
  const nota = new Map(notas.filter(n => !n.cancelada).map(n => [n.id, n]))
  const pago = new Map()
  for (const r of receb) if (!r.estornado_em) pago.set(r.parcela_id, (pago.get(r.parcela_id) ?? 0) + +r.valor)
  return parcelas.filter(p => nota.has(p.nota_id))
    .map(p => ({ cliente: nota.get(p.nota_id).cliente, nota: nota.get(p.nota_id).numero_rps || nota.get(p.nota_id).numero, vencimento: p.vencimento, saldo: Math.round((+p.valor - (pago.get(p.id) ?? 0)) * 100) / 100 }))
    .filter(p => p.saldo > 0.009)
}

export const umVeiculo =async id => veiculo(ok(await db.from('atendimentos').select(SEL).eq('id', id).single()))

export async function ultimoEvento() {
  const r = ok(await db.from('eventos').select('id').order('id', { ascending: false }).limit(1))
  return r[0]?.id ?? 0
}

/** Eventos que geram aviso imediato, depois do último já avisado. */
export const eventosDepois = async id =>
  ok(await db.from('eventos').select('id,atendimento_id,tipo,descricao,em,usuario_nome,origem')
    .gt('id', id).in('tipo', ['Aprovação', 'Operacional', 'Saída']).order('id').limit(50))

/** Anexos ativos do atendimento (orçamentos em PDF, fotos), na ordem em que foram enviados. */
export const anexosDe = async atId =>
  ok(await db.from('anexos').select('nome,caminho,tipo').eq('atendimento_id', atId).is('removido_em', null).order('criado_em'))

export async function baixarAnexo(caminho) {
  const { data, error } = await db.storage.from('anexos').download(caminho)
  if (error) throw new Error(error.message)
  return Buffer.from(await data.arrayBuffer())
}

/** Grava pelo robô. Erro 23505 = mensagem já processada antes. */
export async function registrar(acao, msgId, telefone, atId) {
  const { error } = await db.rpc(acao === 'finalizar' ? 'bot_finalizar' : 'bot_entregar', { p_msg: msgId, p_tel: telefone, p_at: atId })
  if (error) { const e = new Error(error.message); e.code = error.code; throw e }
}
