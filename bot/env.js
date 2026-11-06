// Carrega bot/.env antes de qualquer outro módulo (importado primeiro em index.js).
import { fileURLToPath } from 'node:url'

try { process.loadEnvFile(fileURLToPath(new URL('.env', import.meta.url))) }
catch (e) { if (e.code !== 'ENOENT') throw e }
