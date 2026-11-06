// Interpretação das mensagens e busca de veículos. Funções puras, testadas em test/comandos.test.js.

/** Texto sem acento, em maiúsculas, só letras, números e espaços. */
export const normalizar = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()

export const normPlaca = s => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const PLACA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/

/** Só dígitos. */
export const digitos = s => String(s ?? '').replace(/\D/g, '')

/**
 * Compara telefones considerando o nono dígito dos celulares brasileiros:
 * o WhatsApp de números antigos costuma vir sem o 9 (55 65 9999-8888 em vez de 55 65 99999-8888).
 */
export function mesmoTelefone(a, b) {
  const x = digitos(a), y = digitos(b)
  if (!x || !y) return false
  if (x === y) return true
  const sem9 = t => (t.length === 13 && t.startsWith('55') && t[4] === '9' ? t.slice(0, 4) + t.slice(5) : t)
  return sem9(x) === sem9(y)
}

const FINALIZAR = new Set(['FINALIZADO', 'FINALIZOU', 'FINALIZAR', 'CONCLUIDO', 'CONCLUIU', 'PRONTO', 'TERMINADO', 'TERMINOU'])
const ENTREGAR = new Set(['ENTREGUE', 'ENTREGOU', 'ENTREGAR', 'ENTREGA'])

/**
 * Lê uma mensagem e devolve o comando.
 * tipos: ajuda, patio, pendentes, prontos, aprovados, status, finalizar, entregar, sim, nao, escolha, desconhecido
 */
export function interpretar(texto) {
  const t = normalizar(texto)
  if (!t) return { tipo: 'desconhecido' }
  const palavras = t.split(' ')
  if (['SIM', 'S', 'CONFIRMO', 'CONFIRMAR'].includes(t)) return { tipo: 'sim' }
  if (['NAO', 'N', 'CANCELAR', 'CANCELA'].includes(t)) return { tipo: 'nao' }
  if (/^[0-9]{1,2}$/.test(t)) return { tipo: 'escolha', n: +t }
  if (['AJUDA', 'MENU', 'COMANDOS', 'OI', 'OLA'].includes(t)) return { tipo: 'ajuda' }
  if (['PATIO', 'OFICINA'].includes(t)) return { tipo: 'patio' }
  if (['PENDENTES', 'PENDENTE', 'APROVACAO'].includes(t)) return { tipo: 'pendentes' }
  if (['PRONTOS', 'PRONTO'].includes(t)) return { tipo: 'prontos' }
  if (['APROVADOS', 'APROVADO'].includes(t)) return { tipo: 'aprovados' }
  if (palavras[0] === 'STATUS' && palavras.length > 1) return { tipo: 'status', termo: palavras.slice(1).join(' ') }
  const ult = palavras[palavras.length - 1]
  if (palavras.length > 1 && FINALIZAR.has(ult)) return { tipo: 'finalizar', termo: palavras.slice(0, -1).join(' ') }
  if (palavras.length > 1 && ENTREGAR.has(ult)) return { tipo: 'entregar', termo: palavras.slice(0, -1).join(' ') }
  return { tipo: 'desconhecido' }
}

/**
 * Procura veículos do pátio pelo termo digitado. A placa vem primeiro:
 * placa completa → só ela; pedaço de placa (3+ caracteres com número) → placas que contêm; senão, palavra do modelo.
 * Nunca escolhe sozinho entre dois veículos: devolve todos os candidatos.
 */
export function buscar(veiculos, termo) {
  const p = normPlaca(termo)
  if (PLACA.test(p)) return veiculos.filter(v => normPlaca(v.placa) === p)
  const porPlaca = p.length >= 3 && /[0-9]/.test(p) ? veiculos.filter(v => normPlaca(v.placa).includes(p)) : []
  if (porPlaca.length) return porPlaca
  const t = ' ' + normalizar(termo) + ' '
  if (t.trim().length < 2) return []
  return veiculos.filter(v => (' ' + normalizar(v.modelo) + ' ').includes(t))
}
