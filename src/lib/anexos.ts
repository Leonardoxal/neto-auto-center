// Anexos do orçamento (PDF e prints) no Storage do Supabase.
import { supabase, msgErro } from './supabase'

export interface Anexo {
  id: string; atendimento_id: string; nome: string; caminho: string; tipo: string; tamanho: number
  criado_em: string; criado_por_nome: string; removido_em: string | null; removido_motivo: string
}
export const LIMITE = 5 * 1024 * 1024
export const LIMITE_GRATIS = 1024 * 1024 * 1024
export const kb = (b: number) => (b >= 1048576 ? (b / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB')

/** Reduz prints e fotos para no máximo 1600 px (JPEG ~72%). PDFs passam como estão. */
export async function preparar(file: File): Promise<{ blob: Blob; nome: string; tipo: string }> {
  if (file.type === 'application/pdf') return { blob: file, nome: file.name, tipo: file.type }
  if (!file.type.startsWith('image/')) throw new Error(`"${file.name}" não é PDF nem imagem.`)
  try {
    const bmp = await createImageBitmap(file)
    const esc = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const w = Math.round(bmp.width * esc), h = Math.round(bmp.height * esc)
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(bmp, 0, 0, w, h)
    const blob: Blob = await new Promise((ok, err) => c.toBlob(b => (b ? ok(b) : err(new Error('falha ao reduzir'))), 'image/jpeg', 0.72))
    const nome = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return blob.size < file.size ? { blob, nome, tipo: 'image/jpeg' } : { blob: file, nome: file.name, tipo: file.type }
  } catch { return { blob: file, nome: file.name, tipo: file.type } }
}

const limpo = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80)

/** Envia os arquivos e registra cada um no atendimento. Devolve a lista de erros (vazia = tudo certo). */
export async function enviarAnexos(atId: string, files: File[]): Promise<string[]> {
  const erros: string[] = []
  for (const f of files) {
    try {
      const p = await preparar(f)
      if (p.blob.size > LIMITE) { erros.push(`"${f.name}" tem ${kb(p.blob.size)}; o limite é 5 MB.`); continue }
      const caminho = `${atId}/${crypto.randomUUID()}-${limpo(p.nome)}`
      const up = await supabase.storage.from('anexos').upload(caminho, p.blob, { contentType: p.tipo, upsert: false })
      if (up.error) { erros.push(`"${f.name}": ${msgErro(up.error)}`); continue }
      const { error } = await supabase.rpc('registrar_anexo', { p_at: atId, p_nome: p.nome, p_caminho: caminho, p_tipo: p.tipo, p_tamanho: p.blob.size })
      if (error) { await supabase.storage.from('anexos').remove([caminho]); erros.push(`"${f.name}": ${msgErro(error)}`) }
    } catch (e) { erros.push(`"${f.name}": ${(e as Error).message}`) }
  }
  return erros
}

/** Abre o anexo numa nova aba (link temporário de 5 minutos). */
export async function abrir(x: Anexo) {
  const w = window.open('', '_blank') // abre já no toque, para o navegador não bloquear
  const { data, error } = await supabase.storage.from('anexos').createSignedUrl(x.caminho, 300)
  if (error || !data) { w?.close(); throw new Error(msgErro(error)) }
  if (w) w.location.href = data.signedUrl; else location.href = data.signedUrl
}

export async function remover(x: Anexo, motivo: string) {
  const r = await supabase.storage.from('anexos').remove([x.caminho])
  if (r.error) return msgErro(r.error)
  const { error } = await supabase.rpc('marcar_anexo_removido', { p_anexo: x.id, p_motivo: motivo })
  if (error) return msgErro(error)
}

/** Limpeza automática: apaga os arquivos de atendimentos finalizados há mais do que o prazo. Roda no máx. 1x por dia por aparelho. */
export async function limpezaAutomatica(): Promise<number> {
  try { if (localStorage.getItem('limpeza-anexos') === new Date().toDateString()) return 0 } catch { /* ok */ }
  const { data, error } = await supabase.rpc('anexos_para_limpar')
  if (error || !data?.length) { try { localStorage.setItem('limpeza-anexos', new Date().toDateString()) } catch { /* ok */ } return 0 }
  let n = 0
  for (const x of data as Anexo[]) { if (!(await remover(x, 'Limpeza automática após a finalização'))) n++ }
  try { localStorage.setItem('limpeza-anexos', new Date().toDateString()) } catch { /* ok */ }
  return n
}
