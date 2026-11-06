// Textos enviados pelo robô. Funções puras: recebem os veículos já lidos do banco e o horário atual.
// Veículo: { id, placa, modelo, cliente, servico, valor, entrada, enviado_em, aprovado_em, concluido_em, saida,
//            sit_fisica, sit_comercial, sit_operacional, atualizado_em }

export const FUSO = 'America/Cuiaba'
const DIA = 864e5, HORA = 36e5
const MAX_LISTA = 15

const fmt = (d, o) => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, ...o }).format(new Date(d))
export const fData = d => fmt(d, { day: '2-digit', month: '2-digit', year: 'numeric' })
export const fHora = d => fmt(d, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).replace(':', 'h')
export const brl = v => (v == null ? 'pendente' : (+v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
export function dur(ms) {
  if (ms < HORA) return `${Math.max(1, Math.round(ms / 6e4))}min`
  if (ms < DIA) return `${Math.floor(ms / HORA)}h`
  return `${Math.floor(ms / DIA)}d ${Math.floor((ms % DIA) / HORA)}h`
}
/** Meia-noite de hoje no fuso da oficina (Cuiabá, UTC−4, sem horário de verão). */
export function inicioDoDia(agora = Date.now()) {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(new Date(agora))
  return new Date(`${d}T00:00:00-04:00`)
}
const T = x => (x ? +new Date(x) : null)

export const nomeVeiculo = v => `${v.modelo?.trim() || 'Modelo não informado'} — ${v.placa}`
const item = v => `• ${nomeVeiculo(v)}`
function lista(vs, extra = () => '') {
  if (!vs.length) return ['• nenhum']
  const linhas = vs.slice(0, MAX_LISTA).map(v => item(v) + extra(v))
  if (vs.length > MAX_LISTA) linhas.push(`• e mais ${vs.length - MAX_LISTA}`)
  return linhas
}
const CABECALHO = 'NETO AUTO CENTER'

// grupos do pátio (os mesmos critérios do painel)
const EM_APROVACAO = ['Orçamento enviado', 'Aguardando aprovação', 'Em negociação']
const pronto = v => v.sit_operacional === 'Serviço concluído'
export const grupos = vs => ({
  orcamento: vs.filter(v => v.sit_comercial === 'Aguardando orçamento'),
  aprovacao: vs.filter(v => EM_APROVACAO.includes(v.sit_comercial)),
  aprovados: vs.filter(v => v.sit_comercial === 'Aprovado' && !pronto(v)),
  execucao: vs.filter(v => v.sit_operacional === 'Em execução'),
  pecas: vs.filter(v => v.sit_operacional === 'Aguardando peças'),
  prontos: vs.filter(pronto),
})
const valorEsituacao = v => ` — ${brl(v.valor)} · ${v.sit_operacional}`
const porPermanencia = (vs, agora) => [...vs].sort((a, b) => (agora - T(b.entrada)) - (agora - T(a.entrada)))

function atencao(vs, agora) {
  const L = []
  const longos = porPermanencia(vs, agora).filter(v => agora - T(v.entrada) > 7 * DIA).slice(0, 5)
  longos.forEach(v => L.push(`• ${nomeVeiculo(v)}: ${dur(agora - T(v.entrada))} no pátio`))
  grupos(vs).aprovacao.filter(v => v.enviado_em && agora - T(v.enviado_em) > 2 * DIA)
    .forEach(v => L.push(`• ${nomeVeiculo(v)}: orçamento sem resposta há ${dur(agora - T(v.enviado_em))}`))
  vs.filter(v => agora - T(v.atualizado_em) > 3 * DIA && !longos.includes(v)).slice(0, 5)
    .forEach(v => L.push(`• ${nomeVeiculo(v)}: sem atualização há ${dur(agora - T(v.atualizado_em))}`))
  return L
}

export const ajuda = () => [
  CABECALHO, 'Comandos:', '',
  'PATIO — veículos na oficina, separados por situação',
  'PENDENTES — falta aprovar',
  'APROVADOS — aprovados, ainda em serviço',
  'PRONTOS — serviço finalizado, aguardando entrega',
  'STATUS ABC1D23 — situação de um veículo',
  'ABC1D23 FINALIZADO — registrar serviço finalizado',
  'ABC1D23 ENTREGUE — registrar entrega do veículo',
  '', 'No lugar da placa pode usar o modelo (ex.: HILUX FINALIZADO). Toda alteração pede confirmação.',
].join('\n')

/** Pátio separado por situação. Cada veículo aparece uma vez; o que não se encaixa vai em OUTROS. */
export function patio(vs, agora = Date.now()) {
  const g = grupos(vs)
  const tempo = v => ` (${dur(agora - T(v.entrada))})`
  const secoes = [
    ['FALTA ORÇAMENTO', g.orcamento.filter(v => !pronto(v)), tempo],
    ['FALTA APROVAR', g.aprovacao.filter(v => !pronto(v)), v => ` — ${brl(v.valor)}${tempo(v)}`],
    ['APROVADOS', g.aprovados, valorEsituacao],
    ['PRONTOS PARA ENTREGA', g.prontos, () => ''],
  ]
  const usados = new Set(secoes.flatMap(s => s[1]))
  const outros = vs.filter(v => !usados.has(v))
  if (outros.length) secoes.push(['OUTROS', outros, v => ` — ${v.sit_comercial}`])
  return [CABECALHO, `NO PÁTIO: ${vs.length}`,
    ...secoes.flatMap(([t, L, extra]) => ['', `${t}: ${L.length}`, ...lista(porPermanencia(L, agora), extra)])].join('\n')
}
export const pendentes = vs => [CABECALHO, `FALTA APROVAR: ${grupos(vs).aprovacao.length}`, '', ...lista(grupos(vs).aprovacao, v => ` — ${brl(v.valor)}`)].join('\n')
export const aprovados = vs => [CABECALHO, `APROVADOS: ${grupos(vs).aprovados.length}`, '', ...lista(grupos(vs).aprovados, valorEsituacao)].join('\n')
export const prontos = vs => [CABECALHO, `PRONTOS PARA ENTREGA: ${grupos(vs).prontos.length}`, '', ...lista(grupos(vs).prontos)].join('\n')

export function status(v, agora = Date.now()) {
  return [
    CABECALHO, nomeVeiculo(v), '',
    `Cliente: ${v.cliente || '—'}`,
    `Serviço: ${v.servico?.trim() || '—'}`,
    `Orçamento: ${brl(v.valor)} · ${v.sit_comercial}`,
    `Situação: ${v.sit_operacional}`,
    `Entrada: ${fData(v.entrada)} ${fHora(v.entrada)} · ${dur(agora - T(v.entrada))} no pátio`,
  ].join('\n')
}

export const confirmar = (acao, v) => [
  acao === 'finalizar' ? 'Registrar a conclusão do serviço?' : 'Registrar a entrega do veículo?',
  '', `Veículo: ${v.modelo?.trim() || 'Modelo não informado'}`, `Placa: ${v.placa}`, `Cliente: ${v.cliente || '—'}`,
  '', 'Responda SIM para confirmar ou NÃO para cancelar.',
].join('\n')

export const escolher = vs => ['Encontrei mais de um veículo. Responda com o número:', '',
  ...vs.slice(0, 9).map((v, i) => `${i + 1}. ${nomeVeiculo(v)} — ${v.cliente || '—'}`)].join('\n')

export const feito = (acao, v) => [
  acao === 'finalizar' ? 'SERVIÇO FINALIZADO REGISTRADO.' : 'ENTREGA REGISTRADA.',
  `Veículo: ${v.modelo?.trim() || 'Modelo não informado'}`, `Placa: ${v.placa}`,
  acao === 'finalizar' ? 'Situação: aguardando entrega.' : 'O veículo saiu do pátio.',
  'O painel já mostra a mudança.',
].join('\n')

const saudacao = agora => { const h = +fmt(agora, { hour: '2-digit', hourCycle: 'h23' }); return h < 12 ? 'Bom dia!' : h < 18 ? 'Boa tarde!' : 'Boa noite!' }

export function relatorioManha(vs, agora = Date.now()) {
  const g = grupos(vs), at = atencao(vs, agora)
  return [
    CABECALHO, `RELATÓRIO DO PÁTIO — ${fData(agora)} ${fHora(agora)}`, saudacao(agora), '',
    `VEÍCULOS NO PÁTIO: ${vs.length}`, '',
    `AGUARDANDO ORÇAMENTO: ${g.orcamento.length}`, ...lista(g.orcamento), '',
    `FALTA APROVAR: ${g.aprovacao.length}`, ...lista(g.aprovacao, v => ` — ${brl(v.valor)}`), '',
    `APROVADOS: ${g.aprovados.length}`, ...lista(g.aprovados, valorEsituacao), '',
    `EM EXECUÇÃO: ${g.execucao.length}`, ...lista(g.execucao), '',
    `AGUARDANDO PEÇAS: ${g.pecas.length}`, ...lista(g.pecas), '',
    `PRONTOS PARA ENTREGA: ${g.prontos.length}`, ...lista(g.prontos),
    ...(at.length ? ['', 'ATENÇÃO:', ...at] : []),
  ].join('\n')
}

/** doDia: atendimentos com entrada, aprovação, conclusão ou saída a partir de hoje 00h00 (inclui os que já saíram). */
export function relatorioFim(noPatio, doDia, agora = Date.now()) {
  const ini = +inicioDoDia(agora)
  const hoje = x => T(x) != null && T(x) >= ini
  const g = grupos(noPatio)
  const entraram = doDia.filter(v => hoje(v.entrada))
  const aprovados = doDia.filter(v => hoje(v.aprovado_em))
  const finalizados = doDia.filter(v => hoje(v.concluido_em))
  const entregues = doDia.filter(v => hoje(v.saida) && v.sit_fisica === 'entregue')
  const pend = [
    ...g.prontos.map(v => `• ${nomeVeiculo(v)}: pronto, falta entregar`),
    ...g.aprovacao.filter(v => v.enviado_em && agora - T(v.enviado_em) > 2 * DIA).map(v => `• ${nomeVeiculo(v)}: cobrar aprovação (${dur(agora - T(v.enviado_em))})`),
    ...g.pecas.map(v => `• ${nomeVeiculo(v)}: aguardando peças`),
  ]
  return [
    CABECALHO, `FECHAMENTO OPERACIONAL — ${fData(agora)}`, '', 'RESUMO DO DIA:',
    `Entraram: ${entraram.length}`, ...(entraram.length ? lista(entraram) : []),
    `Orçamentos aprovados: ${aprovados.length}`, ...(aprovados.length ? lista(aprovados, v => ` — ${brl(v.valor)}`) : []),
    `Serviços finalizados: ${finalizados.length}`, ...(finalizados.length ? lista(finalizados) : []),
    `Entregues: ${entregues.length}`, ...(entregues.length ? lista(entregues) : []),
    '', `PERMANECEM NO PÁTIO: ${noPatio.length}`,
    `Aguardando aprovação: ${g.aprovacao.length}`, `Aguardando peças: ${g.pecas.length}`,
    ...(noPatio.length ? ['', 'MAIOR PERMANÊNCIA:', ...porPermanencia(noPatio, agora).slice(0, 3).map(v => `• ${nomeVeiculo(v)}: ${dur(agora - T(v.entrada))}`)] : []),
    '', 'PENDÊNCIAS PARA AMANHÃ:', ...(pend.length ? pend : ['• nenhuma']),
  ].join('\n')
}

// avisos imediatos, a partir de um evento do histórico
export const avisoAprovado = (v, ev, nAnexos = 0) => [CABECALHO, 'ORÇAMENTO APROVADO', '',
  `Veículo: ${v.modelo?.trim() || 'Modelo não informado'}`, `Placa: ${v.placa}`, `Cliente: ${v.cliente || '—'}`,
  `Serviço: ${v.servico?.trim() || '—'}`, `Valor: ${brl(v.valor)}`, `Aprovado por: ${ev.usuario_nome || '—'}`, `Horário: ${fHora(ev.em)}`,
  '', nAnexos ? `Orçamento anexado: ${nAnexos} arquivo(s) a seguir.` : 'Nenhum orçamento anexado no painel.'].join('\n')
export const avisoFinalizado = (v, ev) => [CABECALHO, 'SERVIÇO FINALIZADO', '',
  `Veículo: ${v.modelo?.trim() || 'Modelo não informado'}`, `Placa: ${v.placa}`, `Serviço: ${v.servico?.trim() || '—'}`,
  `Responsável pela atualização: ${ev.usuario_nome || '—'}`, `Horário: ${fHora(ev.em)}`, 'Situação: aguardando entrega.'].join('\n')
export const avisoEntregue = (v, ev) => [CABECALHO, 'VEÍCULO ENTREGUE', '',
  `Veículo: ${v.modelo?.trim() || 'Modelo não informado'}`, `Placa: ${v.placa}`,
  `Serviço finalizado: ${v.concluido_em ? fHora(v.concluido_em) : 'não registrado'}`, `Entrega registrada: ${fHora(ev.em)}`,
  `Responsável pela entrega: ${ev.usuario_nome || '—'}`].join('\n')
