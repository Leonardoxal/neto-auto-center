import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, msgErro } from './supabase'
import type { Area, Atendimento, Locadora, Usuario, Acao } from './domain'
import { pode } from './domain'

export const SEL_LISTA = '*, orcamento_revisoes(id,seq,valor,em,obs), descontos(*), notas_fiscais(id,tipo,numero,serie,valor,emissao,cancelada), esperas(*)'
export const SEL_FICHA = SEL_LISTA + ', movimentacoes(*), eventos(id,tipo,descricao,em,usuario_nome)'

interface Store {
  session: Session | null
  me: Usuario | null
  carregando: boolean
  usuarios: Usuario[]
  locadoras: Locadora[]
  areas: Area[]
  ativos: Atendimento[]
  recarregar: () => Promise<void>
  locNome: (id: string) => string
  pode: (a: Acao) => boolean
  rpc: (fn: string, args: Record<string, unknown>) => Promise<string | void>
  sair: () => Promise<void>
  versao: number
}
const Ctx = createContext<Store>(null as unknown as Store)
export const useStore = () => useContext(Ctx)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [me, setMe] = useState<Usuario | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [locadoras, setLocadoras] = useState<Locadora[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [ativos, setAtivos] = useState<Atendimento[]>([])
  const [versao, setVersao] = useState(0)
  const timer = useRef<number>()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (!data.session) setCarregando(false) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const recarregar = useCallback(async () => {
    if (!session) return
    const uid = session.user.id
    const [u, l, ar, at] = await Promise.all([
      supabase.from('usuarios').select('*').order('nome'),
      supabase.from('locadoras').select('*').order('nome'),
      supabase.from('areas').select('*').order('ordem'),
      supabase.from('atendimentos').select(SEL_LISTA).eq('sit_fisica', 'patio').eq('arquivado', false).order('entrada'),
    ])
    const lista = (u.data ?? []) as Usuario[]
    setMe(lista.find(x => x.id === uid) ?? null)
    setUsuarios(lista); setLocadoras((l.data ?? []) as Locadora[]); setAreas((ar.data ?? []) as Area[])
    const lista2 = (at.data ?? []) as Atendimento[]
    if (lista2.length) {
      const it = await supabase.from('orcamento_itens').select('*').in('atendimento_id', lista2.map(a => a.id)).order('seq')
      if (!it.error) for (const a of lista2) a.orcamento_itens = (it.data ?? []).filter(i => i.atendimento_id === a.id)
      const ax = await supabase.from('anexos').select('atendimento_id').is('removido_em', null).in('atendimento_id', lista2.map(a => a.id))
      if (!ax.error) for (const a of lista2) a.n_anexos = (ax.data ?? []).filter(x => x.atendimento_id === a.id).length
    }
    setAtivos(lista2)
    setVersao(v => v + 1)
    setCarregando(false)
  }, [session])

  useEffect(() => { if (session) { setCarregando(true); recarregar() } else { setMe(null) } }, [session, recarregar])

  // limpeza automática dos anexos de atendimentos finalizados (gerência/administrador, 1x por dia)
  useEffect(() => {
    if (!me || !pode(me.perfil, 'arquivar')) return
    import('./anexos').then(m => m.limpezaAutomatica()).catch(() => {})
  }, [me])

  // atualização ao vivo: qualquer mudança em atendimentos/eventos recarrega (agrupado)
  useEffect(() => {
    if (!session) return
    const agendar = () => { clearTimeout(timer.current); timer.current = window.setTimeout(recarregar, 600) }
    const ch = supabase.channel('mudancas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'atendimentos' }, agendar)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'eventos' }, agendar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orcamento_itens' }, agendar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'anexos' }, agendar)
      .subscribe()
    const vis = () => { if (document.visibilityState === 'visible') agendar() }
    document.addEventListener('visibilitychange', vis)
    return () => { supabase.removeChannel(ch); document.removeEventListener('visibilitychange', vis) }
  }, [session, recarregar])

  const locNome = useCallback((id: string) => locadoras.find(l => l.id === id)?.nome ?? '—', [locadoras])
  const rpc = useCallback(async (fn: string, args: Record<string, unknown>) => {
    const { error } = await supabase.rpc(fn, args)
    if (error) return msgErro(error)
    await recarregar()
  }, [recarregar])

  return <Ctx.Provider value={{
    session, me, carregando, usuarios, locadoras, areas, ativos, recarregar, locNome, versao,
    pode: (a: Acao) => pode(me?.perfil, a), rpc,
    sair: async () => { await supabase.auth.signOut() },
  }}>{children}</Ctx.Provider>
}
