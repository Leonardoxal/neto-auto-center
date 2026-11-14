// Leitor dos relatórios do TGA "Lançamentos: A Receber, Em Aberto" e "A Receber, Baixados" (PDF -> `pdftotext -raw`).
// Só entram documento (com sufixo de parcela), datas, tipo, portador, valores e o código do cliente no TGA (ex.: C02170).
// O nome do cliente vem em `ResultadoTga.clientes` (classificar locadora x particular e mostrar a aba Cobranças) e vai só para o cadastro
// `tga_clientes` do banco, com leitura restrita a Administrador e Gerência; nunca nas linhas, em log ou teste. O telefone é ignorado.
// Valores em centavos inteiros. O leitor confere cada linha (principal + juros + multa - desconto = pago) e a soma das linhas
// contra os totais do rodapé, por cliente e geral, e acusa divergência em vez de aceitar em silêncio.
//
// Verificado com um PDF real de Baixados. O formato de Em Aberto ainda NÃO foi verificado com PDF real
// (a amostra foi sobrescrita): ele assume as mesmas linhas, sem a data da baixa. Ver docs/GESTAO_PROGRESSO.md.

export type TipoRelatorio = 'baixados' | 'em_aberto'

export interface LinhaTga {
  /** identifica a linha de forma estável entre exportações; a mesma linha importada de novo não duplica */
  chave: string
  documento: string // com sufixo de parcela, ex.: 0001231-2
  docNumero: string // sem o sufixo
  parcela: number
  emissao: string // AAAA-MM-DD
  vencimento: string
  baixa: string | null // só em Baixados
  tipoDoc: string // DP duplicata, DV devolução...
  portador: string
  /** código do cliente no TGA (ex.: C02170); vazio se o relatório não trouxe */
  clienteCodigo: string
  original: number
  juros: number
  desconto: number
  multa: number
  /** Baixados: valor pago. Em Aberto: valor total (original + juros + multa) */
  pago: number
  diasAtraso: number
  devolucao: boolean
  /** false quando original + juros + multa - desconto não dá o valor pago: não é aplicada sozinha, exige conferência humana */
  confere: boolean
}

export interface Totais { original: number; juros: number; desconto: number; multa: number; pago: number }
export interface ResultadoTga {
  relatorio: TipoRelatorio
  linhas: LinhaTga[]
  soma: Totais
  rodape: Partial<Totais> & { semDevolucao?: number; devolucoes?: number }
  /** código do cliente -> nome. Dado pessoal: só para o cadastro `tga_clientes`, nunca nas linhas nem em log. */
  clientes: Record<string, string>
  /** preenchido por semConsumidores: linhas de cliente consumidor que ficaram de fora */
  descartadas?: { linhas: number; pago: number }
  /** vazio = conferido. Nunca contém nome nem código de cliente. */
  divergencias: string[]
  /** não bloqueiam: arredondamento de centavos nos juros e linhas que não fecham a conta */
  avisos: string[]
}

const DINHEIRO = String.raw`-?\d{1,3}(?:\.\d{3})*,\d{2}`
const reDin = new RegExp(DINHEIRO, 'g')
const DATA = String.raw`\d{2}/\d{2}/\d{2}`

export const centavos = (s: string) => {
  const n = Math.round(parseFloat(s.replace(/\./g, '').replace(',', '.')) * 100)
  return Object.is(n, -0) ? 0 : n
}
export const dataIso = (s: string) => {
  const [d, m, a] = s.split('/')
  return `${+a < 70 ? '20' : '19'}${a}-${m}-${d}`
}
const moedas = (s: string) => (s.match(reDin) ?? []).map(centavos)
const soDinheiro = (l: string) => new RegExp(`^(?:${DINHEIRO})(?:\\s+${DINHEIRO})*$`).test(l.trim())

// emissão, vencimento, [baixa], documento-parcela, [portador], tipo, valores..., dias de atraso
const reLinha = new RegExp(
  String.raw`(${DATA})\s+(${DATA})(?:\s+(${DATA}))?\s+(\S+)-(\d+)(?:\s+(\S+))?\s+([A-Z]{2})((?:\s+${DINHEIRO})+)\s+(-?\d+)\s*$`
)

const zero = (): Totais => ({ original: 0, juros: 0, desconto: 0, multa: 0, pago: 0 })
const mais = (a: Totais, b: Totais, sinal = 1): Totais => ({
  original: a.original + sinal * b.original, juros: a.juros + sinal * b.juros, desconto: a.desconto + sinal * b.desconto,
  multa: a.multa + sinal * b.multa, pago: a.pago + sinal * b.pago
})
// no TGA a devolução (DV) soma no valor original e subtrai do valor pago (confirmado nos totais do PDF real)
const totaisDe = (l: LinhaTga): Totais => ({ original: l.original, juros: l.juros, desconto: l.desconto, multa: l.multa, pago: l.devolucao ? -l.pago : l.pago })
const fmt = (c: number) => (c / 100).toFixed(2).replace('.', ',')

/** Distribui os valores de uma linha (e da linha seguinte, só com dinheiro) nas colunas. null se não fecha a conta. */
function colunas(relatorio: TipoRelatorio, vals1: number[], vals2: number[]): Pick<LinhaTga, 'original' | 'juros' | 'desconto' | 'multa' | 'pago'> | null {
  if (relatorio === 'baixados') {
    // linha 1: juros, desconto, pago; linha 2: valor original, multa
    if (vals1.length !== 3 || vals2.length !== 2) return null
    const [juros, desconto, pago] = vals1
    const [original, multa] = vals2
    return { original, juros, desconto, multa, pago }
  }
  // Em Aberto: original, juros, multa e total, em ordem ainda não verificada; a conta decide
  const todos = [...vals1, ...vals2]
  if (todos.length !== 4) return null
  // total = o maior; original = o maior dos restantes; juros e multa = os dois que sobram, na ordem em que aparecem
  const sem = (a: number[], v: number) => { const i = a.indexOf(v); return [...a.slice(0, i), ...a.slice(i + 1)] }
  const pago = Math.max(...todos)
  const resto = sem(todos, pago)
  const original = Math.max(...resto)
  const [juros, multa] = sem(resto, original)
  return original + juros + multa === pago ? { original, juros, desconto: 0, multa, pago } : null
}

export function lerRelatorioTga(texto: string): ResultadoTga {
  const linhasTexto = texto.split(/\r?\n/).map(l => l.trim())
  const relatorio: TipoRelatorio = /baixad/i.test(linhasTexto.slice(0, 12).join(' ')) ? 'baixados' : 'em_aberto'
  const divergencias: string[] = []
  const avisos: string[] = []
  const clientesComCentavos = new Set<number>()
  const linhas: LinhaTga[] = []
  const vistas = new Map<string, number>()
  const clientes: Record<string, string> = {}
  let codigo = ''

  // blocos de cliente: cada "Cli/For:" abre um bloco e o "Total de ..." fecha (nada do cabeçalho é guardado)
  let blocoSoma = zero(), blocoN = 0, blocoLinhas = 0
  const fechaBloco = (esperado: Totais | null) => {
    if (esperado && blocoLinhas > 0) {
      for (const k of ['original', 'juros', 'desconto', 'multa', 'pago'] as const) {
        if (blocoSoma[k] === esperado[k]) continue
        if (k === 'original' || k === 'pago') divergencias.push(`Cliente nº ${blocoN} da lista: ${k} das linhas ${fmt(blocoSoma[k])} difere do total do cliente ${fmt(esperado[k])}`)
        else clientesComCentavos.add(blocoN)
      }
    }
    blocoSoma = zero(); blocoLinhas = 0
  }

  for (let i = 0; i < linhasTexto.length; i++) {
    const l = linhasTexto[i]
    if (/^Cli\/For:/.test(l)) {
      blocoN++; blocoSoma = zero(); blocoLinhas = 0
      const c = /^Cli\/For:\s*(\S+)\s*-\s*(.*?)\s*-\s*Tel:/.exec(l)
      codigo = c?.[1] ?? ''; if (c) clientes[codigo] = c[2]
      continue
    }
    if (/^Total de (?!Devolu)/.test(l)) {
      const [orig, juros, pago] = moedas(l).slice(-3)
      const [desconto, multa] = soDinheiro(linhasTexto[i + 1] ?? '') ? moedas(linhasTexto[i + 1]) : [NaN, NaN]
      fechaBloco(relatorio === 'baixados' && orig != null && !Number.isNaN(desconto) ? { original: orig, juros, desconto, multa, pago } : null)
      continue
    }
    const m = reLinha.exec(l)
    if (!m) continue
    const [, emis, venc, baixaStr, docNum, parc, po, td, dinheiro, atr] = m
    if (relatorio === 'baixados' && !baixaStr) { divergencias.push(`Linha ${i + 1}: Baixados sem data de baixa`); continue }
    const cont = soDinheiro(linhasTexto[i + 1] ?? '') ? linhasTexto[i + 1] : ''
    const col = colunas(relatorio, moedas(dinheiro), moedas(cont))
    if (!col) { divergencias.push(`Linha ${i + 1} (doc ${docNum}-${parc}): colunas de valores não reconhecidas`); continue }
    // O TGA tem linhas que não fecham (ex.: juros mostrado mas não cobrado). Entram nos totais, mas só uma pessoa as concilia.
    const confere = col.original + col.juros + col.multa - col.desconto === col.pago && col.original > 0
    const doc = `${docNum}-${parc}`
    const base = [doc, emis, venc, baixaStr ?? '', col.original, col.juros, col.desconto, col.multa, col.pago].join('|')
    const n = (vistas.get(base) ?? 0) + 1
    vistas.set(base, n)
    const linha: LinhaTga = {
      chave: `${relatorio}|${base}|${n}`, documento: doc, docNumero: docNum, parcela: +parc,
      emissao: dataIso(emis), vencimento: dataIso(venc), baixa: baixaStr ? dataIso(baixaStr) : null,
      tipoDoc: td, portador: po ?? '', clienteCodigo: codigo, ...col, diasAtraso: +atr, devolucao: td === 'DV', confere
    }
    linhas.push(linha)
    blocoSoma = mais(blocoSoma, totaisDe(linha)); blocoLinhas++
  }

  const soma = linhas.reduce((s, l) => mais(s, totaisDe(l)), zero())

  // rodapé geral
  const rodape: ResultadoTga['rodape'] = {}
  const ig = linhasTexto.findIndex(l => /T\s*O\s*T\s*A\s*L\s+G\s*E\s*R\s*A\s*L/.test(l))
  if (ig < 0) divergencias.push('Rodapé com o total geral não encontrado: o arquivo pode estar incompleto')
  else {
    const antes = moedas(linhasTexto[ig - 1] ?? ''), na = moedas(linhasTexto[ig])
    if (relatorio === 'baixados') {
      if (antes.length === 3 && na.length === 2) Object.assign(rodape, { original: antes[0], juros: antes[1], pago: antes[2], desconto: na[0], multa: na[1] })
      else divergencias.push('Rodapé do total geral em formato inesperado')
    } else {
      const todos = [...antes, ...na]
      if (todos.includes(soma.pago)) rodape.pago = soma.pago
      else divergencias.push(`Total geral das linhas (${fmt(soma.pago)}) não aparece no rodapé`)
    }
    const sd = linhasTexto.slice(ig).find(l => /^Total .*devolu.*->/i.test(l) && !/^Total de Devolu/i.test(l))
    const dv = linhasTexto.slice(ig).find(l => /^Total de Devolu.*->/i.test(l))
    if (sd) rodape.semDevolucao = moedas(sd)[0]
    if (dv) rodape.devolucoes = moedas(dv)[0]
    for (const k of ['original', 'juros', 'desconto', 'multa', 'pago'] as const)
      if (rodape[k] != null && rodape[k] !== soma[k]) (k === 'original' || k === 'pago' ? divergencias : avisos).push(`Total geral: ${k} das linhas ${fmt(soma[k])} difere do rodapé ${fmt(rodape[k]!)}`)
  }
  if (linhas.length === 0) divergencias.push('Nenhuma linha de lançamento encontrada')
  if (clientesComCentavos.size) avisos.push(`${clientesComCentavos.size} total(is) de cliente com diferença de centavos em juros, multa ou desconto (arredondamento do TGA)`)
  const naoConferem = linhas.filter(l => !l.confere).length
  if (naoConferem) avisos.push(`${naoConferem} linha(s) não fecham a conta (original + juros + multa - desconto = pago): ficam sem aplicar até conferência`)
  return { relatorio, linhas, soma, rodape, clientes, divergencias, avisos }
}

// ---------- Em Aberto exportado em .xls (colunas limpas; lido pelo Excel em scripts/xls-para-json.ps1) ----------
export interface LinhaXls { cliente: string; emissao: number; vencimento: number; doc: string; portador: string; td: string; original: number; juros: number; multa: number; total: number; dias: number }
const dataXls = (serial: number) => new Date(Date.UTC(1899, 11, 30) + serial * 864e5).toISOString().slice(0, 10)
const cent = (v: number) => Math.round(v * 100)

/** `totalRodape`: total geral do rodapé, em reais, como veio na planilha. */
export function lerEmAbertoXls(linhasXls: LinhaXls[], totalRodape: number | null): ResultadoTga {
  const divergencias: string[] = [], avisos: string[] = [], clientes: Record<string, string> = {}
  const vistas = new Map<string, number>()
  const linhas: LinhaTga[] = []
  for (const x of linhasXls) {
    const m = /^(.*)-(\d+)$/.exec(x.doc)
    if (!m) { divergencias.push(`Documento sem parcela: ${x.doc}`); continue }
    const c = /^([A-Z]\d{3,})\s*-?\s*(.*)$/.exec(x.cliente.trim())
    const codigo = c?.[1] ?? ''; if (c) clientes[codigo] = c[2]
    const original = cent(x.original), juros = cent(x.juros), multa = cent(x.multa), pago = cent(x.total)
    const emissao = dataXls(x.emissao), vencimento = dataXls(x.vencimento)
    const base = [x.doc, emissao, vencimento, original, juros, multa, pago].join('|')
    const n = (vistas.get(base) ?? 0) + 1; vistas.set(base, n)
    linhas.push({
      chave: `em_aberto|${base}|${n}`, documento: x.doc, docNumero: m[1], parcela: +m[2], emissao, vencimento, baixa: null, tipoDoc: x.td, portador: x.portador ?? '',
      clienteCodigo: codigo, original, juros, desconto: 0, multa, pago, diasAtraso: Math.round(x.dias), devolucao: x.td === 'DV',
      confere: Math.abs(original + juros + multa - pago) <= 1
    })
  }
  const soma = linhas.reduce((s, l) => mais(s, totaisDe(l)), zero())
  const rodape: ResultadoTga['rodape'] = {}
  if (totalRodape == null) divergencias.push('Total geral do rodapé não encontrado: o arquivo pode estar incompleto')
  else {
    rodape.pago = cent(totalRodape)
    // a planilha soma os valores sem arredondar e soma a devolução (DV); as linhas aqui são arredondadas em centavos e a DV subtrai
    const exata = cent(linhasXls.reduce((s, x) => s + x.total, 0))
    if (Math.abs(exata - rodape.pago) > 1) divergencias.push(`Total geral: soma das linhas ${fmt(exata)} difere do rodapé ${fmt(rodape.pago)}`)
  }
  if (!linhas.length) divergencias.push('Nenhuma linha de lançamento encontrada')
  const naoConferem = linhas.filter(l => !l.confere).length
  if (naoConferem) avisos.push(`${naoConferem} linha(s) em que original + juros + multa não dá o total`)
  return { relatorio: 'em_aberto', linhas, soma, rodape, clientes, divergencias, avisos }
}

// ---------- cliente consumidor (genérico): fora do "a receber" ----------
/** Cadastro genérico usado em serviço pago na hora: "CLIENTE", "CLIENTE.", "CLIENTE CONSUMIDOR". Não entra nos relatórios de recebimento. */
export const ehConsumidor = (nomeTga: string) => { const n = nomeTga.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return n === 'CLIENTE' || n.includes('CONSUMIDOR') }
/** Tira as linhas de cliente consumidor e refaz a soma. Chamar DEPOIS de conferir os totais do arquivo, que incluem essas linhas. */
export function semConsumidores(r: ResultadoTga): ResultadoTga {
  const fora = new Set(Object.entries(r.clientes).filter(([, nome]) => ehConsumidor(nome)).map(([codigo]) => codigo))
  const linhas = r.linhas.filter(l => !fora.has(l.clienteCodigo))
  const descartadas = r.linhas.filter(l => fora.has(l.clienteCodigo))
  const clientes = Object.fromEntries(Object.entries(r.clientes).filter(([codigo]) => !fora.has(codigo)))
  return { ...r, linhas, clientes, soma: linhas.reduce((s, l) => mais(s, totaisDe(l)), zero()),
    descartadas: { linhas: descartadas.length, pago: descartadas.reduce((s, l) => s + totaisDe(l).pago, 0) } }
}

// ---------- locadora x particular ----------
export interface LocadoraRef { id: string; nome: string }
const semEspaco = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')
/** Locadora: o nome do cliente no TGA contém o nome de uma locadora cadastrada (sem acento nem espaço; "LOCALIZA FROTA SP" é Localiza).
 *  Qualquer outro cliente é particular e vale o PV, mesmo que tenha nota. */
export function classificarCliente(nomeTga: string, locadoras: LocadoraRef[]): { tipo: 'locadora' | 'particular'; locadora_id: string | null } {
  const n = semEspaco(nomeTga)
  const l = locadoras.find(x => { const p = semEspaco(x.nome); return p.length >= 4 && n.includes(p) })
  return l ? { tipo: 'locadora', locadora_id: l.id } : { tipo: 'particular', locadora_id: null }
}
