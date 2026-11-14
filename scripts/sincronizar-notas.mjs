// Envia ao site as notas de venda novas que o TGA grava em C:\TGA\NFe\XML\AAAAMM\NFe e C:\TGA\NFSe\XML\AAAAMM\Notas.
// Só LÊ as pastas do TGA; grava no Supabase pela função importar_notas (a mesma da importação de ZIP no site).
//
//   node scripts/sincronizar-notas.mjs                  só conta o que há de novo (não grava)
//   node scripts/sincronizar-notas.mjs --enviar         envia o que for novo, uma vez
//   node scripts/sincronizar-notas.mjs --enviar --vigiar   envia e repete a cada 2 minutos (deixe aberto no computador do TGA)
//   --meses=N  quantos meses para trás olhar (padrão 2)
//
// Precisa de scripts/.env (ver .env.example). O estado (o que já foi enviado) fica em scripts/.estado-notas.json.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { lerXML } from '../src/lib/xmlnotas.ts'

try { process.loadEnvFile(fileURLToPath(new URL('.env', import.meta.url))) } catch (e) { if (e.code !== 'ENOENT') throw e }
const args = process.argv.slice(2)
const enviar = args.includes('--enviar'), vigiar = args.includes('--vigiar')
const meses = +(args.find(a => a.startsWith('--meses='))?.slice(8) ?? 2)
const RAIZ = process.env.TGA_PASTA ?? 'C:\\TGA'
const ESTADO = fileURLToPath(new URL('.estado-notas.json', import.meta.url))
const hora = () => new Date().toLocaleTimeString('pt-BR')

const mesesRecentes = () => Array.from({ length: meses }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}` })
function arquivos() {
  const out = []
  for (const m of mesesRecentes()) {
    for (const [pasta, re] of [[join(RAIZ, 'NFe', 'XML', m, 'NFe'), /-nfe\.xml$/i], [join(RAIZ, 'NFSe', 'XML', m, 'Notas'), /-nfse\.xml$/i]]) {
      if (!existsSync(pasta)) continue
      for (const f of readdirSync(pasta)) if (re.test(f)) { const p = join(pasta, f); out.push({ p, m: statSync(p).mtimeMs }) }
    }
  }
  return out
}
// o TGA grava alguns XML em ISO-8859-1
const ler = p => { const b = readFileSync(p); return b.subarray(0, 120).toString('latin1').match(/encoding=["']iso-8859-1["']/i) ? b.toString('latin1') : b.toString('utf8') }

async function ciclo(supabase) {
  const vistos = existsSync(ESTADO) ? JSON.parse(readFileSync(ESTADO, 'utf8')) : {}
  const novos = arquivos().filter(a => vistos[a.p] !== a.m)
  const notas = new Map(); let ignorados = 0
  for (const a of novos) {
    try { const x = lerXML(ler(a.p)); if (x?.numero) notas.set(x.chave, x); else ignorados++ } catch { ignorados++ }
  }
  console.log(`[${hora()}] ${novos.length} arquivo(s) novo(s): ${notas.size} nota(s) lida(s), ${ignorados} ignorado(s).`)
  if (!enviar || !notas.size) { if (enviar) { for (const a of novos) vistos[a.p] = a.m; writeFileSync(ESTADO, JSON.stringify(vistos)) } return }
  const lista = [...notas.values()]; let novas = 0, atualizadas = 0
  for (let i = 0; i < lista.length; i += 100) {
    const { data, error } = await supabase.rpc('importar_notas', { p_notas: lista.slice(i, i + 100) })
    if (error) throw new Error(error.message)
    novas += data.novas; atualizadas += data.atualizadas
  }
  for (const a of novos) vistos[a.p] = a.m
  writeFileSync(ESTADO, JSON.stringify(vistos))
  console.log(`[${hora()}] Enviado: ${novas} nota(s) nova(s), ${atualizadas} já existiam.`)
}

let supabase = null
if (enviar) {
  const { NETO_SUPABASE_URL: url, NETO_SUPABASE_ANON_KEY: chave, NETO_EMAIL: email, NETO_SENHA: senha } = process.env
  if (!url || !chave || !email || !senha) { console.error('Faltam NETO_SUPABASE_URL, NETO_SUPABASE_ANON_KEY, NETO_EMAIL e NETO_SENHA em scripts/.env.'); process.exit(1) }
  supabase = createClient(url, chave, { auth: { persistSession: false } })
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
  if (error) { console.error(`Não consegui entrar: ${error.message}`); process.exit(1) }
}
const rodar = () => ciclo(supabase).catch(e => console.error(`[${hora()}] Erro: ${e.message}`))
await rodar()
if (vigiar) { console.log('Vigiando a cada 2 minutos. Feche esta janela para parar.'); setInterval(rodar, 2 * 60 * 1000) }
