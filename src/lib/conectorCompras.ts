// Texto e regras do painel do conector fiscal (aba Notas de compra). Funções puras: recebem o "agora" em milissegundos.
import { fData, fHora } from './format'

export interface StatusConector {
  ambiente: string
  ultima_consulta: string | null
  proxima_consulta: string | null
  ultimo_resultado: string | null
  ultimo_erro: string | null
  certificado_validade: string | null
  ultimo_sinal: string | null
  busca_pedida_em: string | null
  agora: string // relógio do servidor, no momento da consulta
}

export const SEM_SINAL_MS = 5 * 60_000
export const AVISO_CERTIFICADO_DIAS = 30
const DIA_MS = 86_400_000

const horaCurta = (x: string) => fHora(x).replace(':', 'h')

export type Situacao = { tipo: 'nunca' | 'desligado' | 'erro' | 'ok'; texto: string }

export function situacaoConector(s: StatusConector | null, agora: number): Situacao {
  if (!s?.ultimo_sinal) return { tipo: 'nunca', texto: 'O conector fiscal ainda não foi instalado neste computador.' }
  if (agora - Date.parse(s.ultimo_sinal) > SEM_SINAL_MS) {
    return { tipo: 'desligado', texto: `Computador da oficina desligado desde ${fData(s.ultimo_sinal)} ${horaCurta(s.ultimo_sinal)}.` }
  }
  if (s.ultimo_erro) return { tipo: 'erro', texto: s.ultimo_erro }
  return { tipo: 'ok', texto: s.ultima_consulta ? `Conectado · última busca às ${horaCurta(s.ultima_consulta)}` : 'Conectado · aguardando a primeira busca' }
}

/** Aviso a partir de 30 dias antes de vencer. Nulo quando não há nada a avisar. */
export function avisoCertificado(s: StatusConector | null, agora: number): string | null {
  if (!s?.certificado_validade) return null
  const dias = Math.floor((Date.parse(s.certificado_validade) - agora) / DIA_MS)
  if (dias < 0) return 'O certificado digital está vencido. Instale o novo para voltar a buscar notas.'
  if (dias <= AVISO_CERTIFICADO_DIAS) return `O certificado digital vence em ${dias} ${dias === 1 ? 'dia' : 'dias'} (${fData(s.certificado_validade)}). Renove e troque o arquivo.`
  return null
}

export interface EstadoBotao { habilitado: boolean; rotulo: string }

/** "Buscar agora" só vale quando a SEFAZ permite nova consulta. */
export function botaoBusca(s: StatusConector | null, agora: number): EstadoBotao {
  if (!s?.ultimo_sinal) return { habilitado: false, rotulo: 'Buscar agora' }
  if (s.proxima_consulta && Date.parse(s.proxima_consulta) > agora) return { habilitado: false, rotulo: `Libera às ${horaCurta(s.proxima_consulta)}` }
  if (s.busca_pedida_em && Date.parse(s.busca_pedida_em) > Date.parse(s.ultima_consulta ?? '1970-01-01T00:00:00Z')) return { habilitado: false, rotulo: 'Busca pedida…' }
  return { habilitado: true, rotulo: 'Buscar agora' }
}

export function proximaBusca(s: StatusConector | null, agora: number): string | null {
  return s?.proxima_consulta && Date.parse(s.proxima_consulta) > agora ? horaCurta(s.proxima_consulta) : null
}
