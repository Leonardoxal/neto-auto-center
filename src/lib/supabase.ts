import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configurado = !!url && !!key
export const supabase = createClient(url || 'http://localhost', key || 'sem-chave', {
  auth: { persistSession: true, autoRefreshToken: true },
})

/** Mensagem legível a partir de um erro do Supabase/Postgres */
export function msgErro(e: unknown): string {
  const m = (e as { message?: string })?.message || String(e)
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão. Verifique a internet e tente de novo.'
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.'
  if (/duplicate key.*locadoras_nome/i.test(m)) return 'Já existe um cadastro com esse nome.'
  if (/duplicate key.*notas_validas/i.test(m)) return 'Essa nota já está registrada neste atendimento.'
  if (/duplicate key.*areas_nome/i.test(m)) return 'Essa área já existe.'
  if (/row-level security|permission denied/i.test(m)) return 'Seu perfil não tem permissão para isso.'
  return m
}
