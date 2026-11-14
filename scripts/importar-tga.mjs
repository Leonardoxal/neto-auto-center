// Importa um relatório do TGA ("Lançamentos: A Receber, Baixados" ou "A Receber, Em Aberto") exportado em PDF.
//
//   node scripts/importar-tga.mjs baixados  "C:\caminho\Baixados.pdf"            (só confere e mostra o resumo)
//   node scripts/importar-tga.mjs em_aberto "C:\caminho\EmAberto.pdf" --enviar   (confere e grava no Supabase)
//
// Precisa do `pdftotext` (vem com o Git para Windows) e, para --enviar, do arquivo scripts/.env (ver .env.example).
// Nada é gravado se a soma das linhas não bater com o total do rodapé do PDF. Nome, código e telefone do cliente nunca são lidos nem exibidos.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { classificarCliente, lerEmAbertoXls, lerRelatorioTga, semConsumidores } from '../src/lib/tga.ts'

try { process.loadEnvFile(fileURLToPath(new URL('.env', import.meta.url))) } catch (e) { if (e.code !== 'ENOENT') throw e }

const [relatorioPedido, arquivo, ...flags] = process.argv.slice(2)
const enviar = flags.includes('--enviar')
const sai = (msg, codigo = 1) => { console.error(msg); process.exit(codigo) }
if (!['baixados', 'em_aberto'].includes(relatorioPedido) || !arquivo) sai('Uso: node scripts/importar-tga.mjs <baixados|em_aberto> <arquivo.pdf> [--enviar]')

let r
if (/\.xlsx?$/i.test(arquivo)) {
  if (relatorioPedido !== 'em_aberto') sai('Planilha só vale para em_aberto. O Baixados é lido do PDF.')
  const ps = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('xls-para-json.ps1', import.meta.url)), arquivo],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  if (ps.error || ps.status !== 0) sai(`Não consegui ler a planilha (precisa do Excel instalado): ${(ps.stderr || ps.error?.message || '').trim()}`)
  const j = JSON.parse(ps.stdout)
  r = lerEmAbertoXls(j.linhas ?? [], j.total ?? null)
} else {
  const pdf = spawnSync('pdftotext', ['-raw', arquivo, '-'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  if (pdf.error) sai('Não consegui rodar o pdftotext. Ele vem com o Git para Windows (pasta mingw64\\bin).')
  if (pdf.status !== 0) sai(`pdftotext falhou: ${pdf.stderr.trim()}`)
  r = lerRelatorioTga(pdf.stdout)
}
if (r.relatorio !== relatorioPedido) sai(`O arquivo parece ser "${r.relatorio}", não "${relatorioPedido}". Nada foi feito.`)
const reais = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

console.log(`Relatório: ${r.relatorio} · ${r.linhas.length} linhas · pago/total ${reais(r.soma.pago)} · rodapé ${r.rodape.pago == null ? 'não encontrado' : reais(r.rodape.pago)}`)
if (r.relatorio === 'baixados') console.log(`Devoluções: ${r.linhas.filter(l => l.devolucao).length} · linhas que não fecham a conta: ${r.linhas.filter(l => !l.confere).length}`)
if (r.relatorio === 'em_aberto' && !/\.xlsx?$/i.test(arquivo)) console.log('ATENÇÃO: o Em Aberto em PDF ainda não foi verificado com um PDF real. Prefira a planilha .xls.')
console.log('Obs.: devolução (DV) entra subtraída no total das linhas; o rodapé do TGA a soma.')
for (const a of r.avisos) console.log(`Aviso: ${a}`)
if (r.divergencias.length) {
  console.error('\nDIVERGÊNCIA: o arquivo não confere e NÃO foi importado.')
  for (const d of r.divergencias) console.error(`  - ${d}`)
  process.exit(2)
}
console.log('Conferência: soma das linhas bate com o rodapé e com cada cliente.')
// cliente consumidor (cadastro genérico, pago na hora) não entra no "a receber"; sai só depois da conferência, pois o rodapé o inclui
r = semConsumidores(r)
console.log(`Descartadas ${r.descartadas.linhas} linha(s) de cliente consumidor; seguem ${r.linhas.length} linhas, total ${reais(r.soma.pago)}.`)
if (!enviar) sai('Nada foi gravado (falta --enviar).', 0)

const { NETO_SUPABASE_URL: url, NETO_SUPABASE_ANON_KEY: chave, NETO_EMAIL: email, NETO_SENHA: senha } = process.env
if (!url || !chave || !email || !senha) sai('Faltam NETO_SUPABASE_URL, NETO_SUPABASE_ANON_KEY, NETO_EMAIL e NETO_SENHA em scripts/.env.')
const supabase = createClient(url, chave, { auth: { persistSession: false } })
const { error: erroLogin } = await supabase.auth.signInWithPassword({ email, password: senha })
if (erroLogin) sai(`Não consegui entrar: ${erroLogin.message}`)

// o hash identifica o conteúdo do arquivo: o mesmo arquivo não entra duas vezes (cada linha também tem chave própria)
const hash = createHash('sha256').update(JSON.stringify(r.linhas.map(l => l.chave))).digest('hex')
// Locadora x particular: o nome do cliente no TGA só é comparado aqui, no computador; o banco recebe apenas o código e o tipo.
const { data: locadoras, error: erroLoc } = await supabase.from('locadoras').select('id,nome').eq('ativo', true)
if (erroLoc) sai(`Não consegui ler as locadoras: ${erroLoc.message}`)
const clientes = Object.fromEntries(Object.entries(r.clientes).map(([codigo, nome]) => [codigo, { ...classificarCliente(nome, locadoras), nome }]))
// o nome só vai para o cadastro de clientes do banco (leitura restrita a Administrador e Gerência), para a aba Cobranças
const { error: erroClientes } = await supabase.rpc('atualizar_clientes_tga', { p_clientes: clientes })
if (erroClientes) sai(`Não consegui atualizar o cadastro de clientes (falta aplicar a migração 0016?): ${erroClientes.message}`)
const nLoc = Object.values(clientes).filter(c => c.tipo === 'locadora').length
console.log(`Clientes: ${Object.keys(clientes).length} (${nLoc} locadora, ${Object.keys(clientes).length - nLoc} particular)`)
const { data, error } = await supabase.rpc('importar_tga', {
  p_relatorio: r.relatorio, p_hash: hash, p_rodape: { pago: r.soma.pago }, p_clientes: clientes,
  p_linhas: r.linhas.map(l => ({ ...l, doc_numero: l.docNumero, tipo_doc: l.tipoDoc, dias_atraso: l.diasAtraso, cliente_codigo: l.clienteCodigo }))
})
if (error) sai(`O Supabase recusou a importação: ${error.message}`)
if (data.ja_importado) sai('Este arquivo já tinha sido importado. Nada foi alterado.', 0)
console.log(`Importado: ${data.novas} linhas novas de ${data.linhas}.`)
if (data.conciliacao && Object.keys(data.conciliacao).length) {
  const c = data.conciliacao
  console.log(`Conciliação com as notas: ${c.conciliadas} aplicadas · ${c.sem_nota} sem nota correspondente · ${c.ambiguas} ambíguas · ${c.excede_saldo} acima do saldo · ${c.revisar} para revisar`)
}
