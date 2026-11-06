// Carrega bot/.env antes de qualquer outro módulo (importado primeiro em index.js).
import { fileURLToPath } from 'node:url'

try { process.loadEnvFile(fileURLToPath(new URL('.env', import.meta.url))) }
catch (e) { if (e.code !== 'ENOENT') throw e }

// A biblioteca de criptografia do WhatsApp (libsignal) escreve sessões inteiras no console, com chaves privadas.
// Nada disso pode ir para o bot.log.
const RUIDO_SIGNAL = /^(Closing session|Closing open session|Removing old closed session|Opening session|Session error|Failed to decrypt|Decrypted message with closed session|Session already)/
for (const k of ['log', 'info', 'warn', 'error', 'debug']) {
  const original = console[k].bind(console)
  console[k] = (...a) => { if (typeof a[0] === 'string' && RUIDO_SIGNAL.test(a[0])) return; original(...a) }
}
