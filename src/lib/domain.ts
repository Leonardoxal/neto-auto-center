// Tipos e regras de negócio puras (sem acesso ao banco). Testadas em domain.test.ts.

export type Perfil = 'Administrador' | 'Gerência' | 'Recepção' | 'Operacional'
export const PERFIS: Perfil[] = ['Administrador', 'Gerência', 'Recepção', 'Operacional']

export const COMERCIAL = ['Aguardando orçamento', 'Orçamento enviado', 'Aguardando aprovação', 'Em negociação', 'Aprovado', 'Recusado', 'Cancelado'] as const
export const OPERACIONAL = ['Aguardando avaliação', 'Aguardando início', 'Em execução', 'Aguardando peças', 'Aguardando autorização complementar', 'Aguardando serviço terceirizado', 'Aguardando conferência', 'Serviço concluído'] as const
export const FISCAL = ['Não faturado', 'Aguardando emissão', 'Em processo de emissão', 'Parcialmente faturado', 'Faturado', 'Nota cancelada'] as const
export const FINANCEIRA = ['A receber', 'Parcialmente recebido', 'Recebido', 'Vencido'] as const
export const FISICA: Record<string, string> = { patio: 'No pátio', entregue: 'Entregue', retirado: 'Retirado / removido' }
export const ESPERAS = ['Aguardando peças', 'Aguardando autorização complementar', 'Aguardando serviço terceirizado']
export const TIPOS_CLIENTE = ['Locadora', 'Frota', 'Empresa', 'Órgão público', 'Particular']

export interface Usuario { id: string; nome: string; email: string | null; perfil: Perfil; ativo: boolean }
export interface Locadora { id: string; nome: string; tipo: string; contato: string; telefone: string; email: string; obs: string; ativo: boolean }
export interface Area { id: number; nome: string; ordem: number; ativa: boolean }
export interface Revisao { id: string; seq: number; valor: number; em: string; obs: string }
export interface Desconto { id: string; base: number; solicitado: number; concedido: number; pedido_em: string; resposta_em: string; motivo: string }
export interface Movimentacao { id: string; origem: string; destino: string; em: string; obs: string; usuario: string | null }
export interface Espera { id: string; motivo: string; inicio: string; fim: string | null }
export interface Nota { id: string; tipo: string; numero: string; serie: string; valor: number; emissao: string; cancelada: boolean }
export interface Item {
  id: string; seq: number; atendimento_id: string; tipo: 'Peça' | 'Serviço' | 'Outro'; descricao: string; quantidade: number; valor_unitario: number
  status: 'Proposto' | 'Aprovado' | 'Retirado'; motivo_retirada: string; obs: string; criado_em: string; criado_por_nome: string; alterado_em: string | null; alterado_por_nome: string
}
export const totalItem = (i: Item) => Math.round(+i.quantidade * +i.valor_unitario * 100) / 100
export function resumoItens(itens: Item[] = []) {
  const ativos = itens.filter(i => i.status !== 'Retirado')
  return {
    n: itens.length, ativos: ativos.length, total: ativos.reduce((s, i) => s + totalItem(i), 0),
    aprovado: itens.filter(i => i.status === 'Aprovado').reduce((s, i) => s + totalItem(i), 0),
    retirados: itens.filter(i => i.status === 'Retirado'), propostos: itens.filter(i => i.status === 'Proposto'),
  }
}
export interface Evento { id: number; tipo: string; descricao: string; em: string; usuario_nome: string }

export interface Atendimento {
  id: string; numero: string; placa: string; modelo: string; locadora_id: string; condutor: string
  entrada: string; saida: string | null; os: string; protocolo: string; responsavel: string; local: string
  servico: string; obs: string; motivo_espera: string
  sit_fisica: 'patio' | 'entregue' | 'retirado'; sit_comercial: string; sit_operacional: string; oper_desde: string
  sit_fiscal: string; sit_financeira: string; arquivado: boolean
  enviado_em: string | null; aprovado_em: string | null; recusado_em: string | null; valor_aprovado: number | null
  inicio_em: string | null; concluido_em: string | null; criado_em: string; atualizado_em: string
  na_oficina?: boolean; fora_desde?: string | null; n_anexos?: number
  orcamento_revisoes?: Revisao[]; descontos?: Desconto[]; notas_fiscais?: Nota[]; esperas?: Espera[]; orcamento_itens?: Item[]
  movimentacoes?: Movimentacao[]; eventos?: Evento[]
}

export const DAY = 864e5, HOUR = 36e5
export const T = (x: string | null | undefined): number | null => (x ? +new Date(x) : null)

// ---------- permissões (espelho das regras do banco, só para a tela) ----------
const G: Perfil[] = ['Administrador', 'Gerência']
const GR: Perfil[] = ['Administrador', 'Gerência', 'Recepção']
const TODOS: Perfil[] = PERFIS
export const PERM = {
  entrada: GR, orcamento: GR, enviar: GR, desconto: G, aprovar: G, recusar: G, nota: G,
  saida: GR, editar: GR, corrigirData: G, arquivar: G, reabrir: G, comercial: GR, fiscal: G, financeira: G,
  operacional: TODOS, mover: TODOS, presenca: TODOS, locadora: GR, usuarios: ['Administrador'] as Perfil[], areas: ['Administrador'] as Perfil[],
  relatorios: G,
} satisfies Record<string, Perfil[]>
export type Acao = keyof typeof PERM
export const pode = (perfil: Perfil | undefined, acao: Acao) => !!perfil && (PERM[acao] as Perfil[]).includes(perfil)

// ---------- cálculos ----------
const sum = (a: number[]) => a.reduce((s, x) => s + (+x || 0), 0)
const bySeq = (a: Atendimento) => [...(a.orcamento_revisoes ?? [])].sort((x, y) => x.seq - y.seq)
/** valor inicial = o que foi enviado à locadora (última revisão até o envio); antes do envio, o valor atual em montagem */
export const valorInicial = (a: Atendimento) => {
  const r = bySeq(a); if (!r.length) return null
  const env = T(a.enviado_em)
  if (!env) return +r[r.length - 1].valor
  const ate = r.filter(x => (T(x.em) ?? 0) <= env + 1000)
  return +(ate.length ? ate[ate.length - 1] : r[0]).valor
}
export const valorAtual = (a: Atendimento) => { const r = bySeq(a); return r.length ? +r[r.length - 1].valor : null }
export const faturado = (a: Atendimento) => sum((a.notas_fiscais ?? []).filter(n => !n.cancelada).map(n => +n.valor))
export const descontoSolicitado = (a: Atendimento) => sum((a.descontos ?? []).map(d => +d.solicitado))
export const descontoConcedido = (a: Atendimento) => sum((a.descontos ?? []).map(d => +d.concedido))

export const noPatio = (a: Atendimento) => a.sit_fisica === 'patio' && !a.arquivado
/** atendimento ativo com o veículo fisicamente na oficina (e não com o condutor) */
export const naOficina = (a: Atendimento) => noPatio(a) && a.na_oficina !== false
export const comCondutor = (a: Atendimento) => noPatio(a) && a.na_oficina === false

/** etapas do atendimento para a linha do tempo do pátio */
export type Etapa = { t: string; feito: boolean; alerta?: 'o' | 'r'; sub?: string }
export function etapas(a: Atendimento): Etapa[] {
  const revs = (a.orcamento_revisoes ?? []).length > 0
  const concl = !!a.concluido_em || a.sit_operacional === 'Serviço concluído'
  return [
    { t: 'Entrada', feito: true },
    { t: 'Orçamento', feito: revs },
    { t: 'Enviado', feito: !!a.enviado_em },
    { t: a.recusado_em ? 'Recusado' : 'Aprovado', feito: !!a.aprovado_em || !!a.recusado_em, alerta: a.recusado_em ? 'r' : undefined },
    { t: 'Execução', feito: !!a.inicio_em || concl, alerta: ESPERAS.includes(a.sit_operacional) ? 'o' : undefined, sub: ESPERAS.includes(a.sit_operacional) ? a.sit_operacional.replace('Aguardando ', 'Aguard. ') : undefined },
    { t: 'Concluído', feito: concl },
    { t: 'Faturado', feito: faturado(a) > 0, sub: faturado(a) > 0 && a.sit_fiscal === 'Parcialmente faturado' ? 'Parcial' : undefined },
    { t: 'Entregue', feito: !!a.saida },
  ]
}
export const ultimaAtualizacao = (a: Atendimento) => Math.max(T(a.atualizado_em) ?? 0, T(a.entrada) ?? 0, ...(a.eventos ?? []).map(e => T(e.em) ?? 0))
export const semAtualizacao = (a: Atendimento, agora = Date.now()) => agora - ultimaAtualizacao(a)
export const tempoNoPatio = (a: Atendimento, agora = Date.now()) => (T(a.saida) ?? agora) - (T(a.entrada) ?? agora)
export const alerta = (a: Atendimento, agora = Date.now()): '' | 'w' | 'c' => {
  if (!noPatio(a)) return ''
  const d = semAtualizacao(a, agora) / DAY
  return d > 7 ? 'c' : d > 3 ? 'w' : ''
}

export const LISTAS: Record<string, { t: string; f: (a: Atendimento) => boolean }> = {
  todos: { t: 'Todos', f: noPatio },
  fora: { t: 'Com o condutor', f: a => comCondutor(a) },
  orc: { t: 'Aguardando orçamento', f: a => noPatio(a) && a.sit_comercial === 'Aguardando orçamento' },
  aprov: { t: 'Aguardando aprovação', f: a => noPatio(a) && ['Orçamento enviado', 'Aguardando aprovação', 'Em negociação'].includes(a.sit_comercial) },
  exec: { t: 'Em execução', f: a => noPatio(a) && a.sit_operacional === 'Em execução' },
  pecas: { t: 'Aguardando peças', f: a => noPatio(a) && a.sit_operacional === 'Aguardando peças' },
  afat: { t: 'Aguardando faturamento', f: a => noPatio(a) && a.sit_operacional === 'Serviço concluído' && a.sit_fiscal !== 'Faturado' },
  fatserv: { t: 'Faturados ainda em serviço', f: a => noPatio(a) && faturado(a) > 0 },
  prontos: { t: 'Prontos para entrega', f: a => noPatio(a) && a.sit_operacional === 'Serviço concluído' },
}

export function tempoAprovacao(a: Atendimento, agora = Date.now()): { ms: number | null; pendente: boolean; recusado: boolean } {
  if (!a.enviado_em) return { ms: null, pendente: false, recusado: false }
  if (a.aprovado_em) return { ms: T(a.aprovado_em)! - T(a.enviado_em)!, pendente: false, recusado: false }
  if (a.recusado_em) return { ms: null, pendente: false, recusado: true }
  return { ms: agora - T(a.enviado_em)!, pendente: true, recusado: false }
}

/** Linhas da seção "Tempos" da ficha: [rótulo, ms | texto | null, em andamento?] */
export function tempos(a: Atendimento, agora = Date.now()): [string, number | string | null, boolean?][] {
  const env = T(a.enviado_em), apr = T(a.aprovado_em), rec = T(a.recusado_em), ini = T(a.inicio_em)
  const con = T(a.concluido_em), sai = T(a.saida), ent = T(a.entrada)!
  const desc = a.descontos ?? [], esp = a.esperas ?? []
  const first = [...desc.map(d => T(d.pedido_em)!), apr, rec].filter((x): x is number => !!x && !!env && x >= env).sort((x, y) => x - y)[0]
  const nf = (a.notas_fiscais ?? []).filter(n => !n.cancelada).map(n => T(n.emissao)!).sort((x, y) => x - y)[0]
  const w = (m: string) => esp.filter(e => e.motivo === m)
  const wsum = (L: Espera[]) => (L.length ? sum(L.map(e => (T(e.fim) ?? agora) - T(e.inicio)!)) : null)
  const wExec = ini ? sum(esp.filter(e => T(e.inicio)! >= ini).map(e => Math.min(T(e.fim) ?? agora, con ?? agora) - T(e.inicio)!)) : 0
  const revs = bySeq(a), lastRev = revs.length ? T(revs[revs.length - 1].em) : null
  const meanResp = desc.length ? sum(desc.map(d => T(d.resposta_em)! - T(d.pedido_em)!)) / desc.length : null
  return [
    ['Total no pátio', (sai ?? agora) - ent, !sai],
    ['Entrada → envio do orçamento', env ? env - ent : null],
    ['Envio → primeira resposta', env ? (first ? first - env : rec ? null : agora - env) : null, !!env && !first],
    ['Envio → aprovação final', env && apr ? apr - env : env && !apr && !rec ? agora - env : rec ? 'Recusado' : null, !!env && !apr && !rec],
    ['Pedido de desconto → resposta', meanResp],
    ['Última revisão → aprovação', apr && lastRev && apr >= lastRev ? apr - lastRev : null],
    ['Aprovação → início', apr && ini ? ini - apr : apr && !ini && !con ? agora - apr : null, !!apr && !ini],
    ['Execução efetiva', ini ? Math.max(0, (con ?? agora) - ini - wExec) : null, !!ini && !con],
    ['Aguardando peças', wsum(w('Aguardando peças')), w('Aguardando peças').some(e => !e.fim)],
    ['Aguardando autorização', wsum(w('Aguardando autorização complementar')), w('Aguardando autorização complementar').some(e => !e.fim)],
    ['Conclusão → faturamento', con && nf ? (nf >= con ? nf - con : 'Faturado antes da conclusão') : con ? agora - con : null, !!con && !nf],
    ['Conclusão → entrega', con && sai ? sai - con : con && !sai ? agora - con : null, !!con && !sai],
  ]
}

export const normPlaca = (v: string) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
export const placaValida = (p: string) => /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(p)

export function tom(s: string): '' | 'g' | 'o' | 'r' {
  if (['Aprovado', 'Serviço concluído', 'Faturado', 'Recebido', 'Entregue', 'Concluída'].includes(s)) return 'g'
  if (['Recusado', 'Cancelado', 'Nota cancelada', 'Vencido', 'Arquivado'].includes(s)) return 'r'
  if (['Aguardando aprovação', 'Em negociação', 'Aguardando peças', 'Parcialmente faturado', 'Aguardando autorização complementar', 'Aguardando serviço terceirizado', 'Orçamento enviado', 'Aguardando emissão', 'Parcialmente recebido'].includes(s)) return 'o'
  return ''
}
