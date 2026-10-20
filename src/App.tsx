import { useEffect, useState } from 'react'
import { configurado, supabase, msgErro } from './lib/supabase'
import { useStore } from './lib/store'
import { LISTAS } from './lib/domain'
import { Brand, Fg, Field, Ic } from './ui/ui'
import { NavCtx, type Rota } from './screens/comum'
import { Inicio, Parados, Patio } from './screens/Patio'
import { Ficha } from './screens/Ficha'
import { Cadastros, Historico, LocadoraFicha } from './screens/Cadastros'
import { Relatorios } from './screens/Relatorios'

const MENU_TODOS: [string, string, string][] = [
  ['inicio', 'Início', 'grid'], ['patio', 'Pátio ativo', 'car'], ['rel', 'Relatórios', 'chart'], ['hist', 'Histórico de veículos', 'clock'], ['cad', 'Cadastros e configurações', 'gear'],
]
const TABS_TODOS: [string, string, string][] = [['inicio', 'Início', 'grid'], ['patio', 'Pátio', 'car'], ['rel', 'Relatórios', 'chart'], ['hist', 'Histórico', 'clock'], ['cad', 'Cadastros', 'gear']]

function Login() {
  const [email, setEmail] = useState(''); const [senha, setSenha] = useState('')
  const [erro, setErro] = useState(''); const [info, setInfo] = useState(''); const [busy, setBusy] = useState(false)
  async function entrar(e: React.FormEvent) {
    e.preventDefault(); setErro(''); setInfo(''); setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    setBusy(false); if (error) setErro(msgErro(error))
  }
  async function esqueci() {
    if (!email.trim()) { setErro('Digite seu e-mail e toque em "Esqueci a senha" de novo.'); return }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin })
    if (error) setErro(msgErro(error)); else setInfo('Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha.')
  }
  return <div className="login"><form className="card" onSubmit={entrar}>
    <Brand /><h1>Gestão Operacional</h1>
    <Fg><Field label="E-mail"><input id="f_email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></Field>
      <Field label="Senha"><input id="f_senha" type="password" autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} /></Field></Fg>
    {erro && <p className="err">{erro}</p>}{info && <p className="muted sm" style={{ margin: '0 4px' }}>{info}</p>}
    <button className="btn block" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
    <button type="button" className="tbtn" style={{ justifyContent: 'center' }} onClick={esqueci}>Esqueci a senha</button>
  </form></div>
}

function NovaSenha({ fim }: { fim: () => void }) {
  const [s, setS] = useState(''); const [erro, setErro] = useState('')
  return <div className="login"><form className="card" onSubmit={async e => { e.preventDefault()
    if (s.length < 8) { setErro('Use pelo menos 8 caracteres.'); return }
    const { error } = await supabase.auth.updateUser({ password: s }); if (error) setErro(msgErro(error)); else fim() }}>
    <Brand /><h1>Nova senha</h1>
    <Fg><Field label="Nova senha"><input type="password" autoComplete="new-password" value={s} onChange={e => setS(e.target.value)} /></Field></Fg>
    {erro && <p className="err">{erro}</p>}<button className="btn block">Salvar senha</button>
  </form></div>
}

export default function App() {
  const store = useStore()
  const [tab, setTab] = useState('inicio')
  const [stack, setStack] = useState<(Rota & { y: number })[]>([])
  const [recuperando, setRecuperando] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [largo, setLargo] = useState(() => innerWidth >= 900)

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY') setRecuperando(true) })
    const sc = () => setScrolled(scrollY > 38); const rs = () => setLargo(innerWidth >= 900)
    addEventListener('scroll', sc, { passive: true }); addEventListener('resize', rs)
    return () => { data.subscription.unsubscribe(); removeEventListener('scroll', sc); removeEventListener('resize', rs) }
  }, [])
  useEffect(() => { document.body.classList.toggle('scrolled', scrolled) }, [scrolled])

  if (!configurado) return <div className="login"><div className="card"><Brand /><h1>Falta configurar</h1>
    <p className="muted" style={{ textAlign: 'center' }}>Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nas variáveis de ambiente (veja o README).</p></div></div>
  if (recuperando) return <NovaSenha fim={() => setRecuperando(false)} />
  if (!store.session) return store.carregando ? <div className="loading">Carregando…</div> : <Login />
  if (store.carregando) return <div className="loading">Carregando…</div>
  if (!store.me || !store.me.ativo) return <div className="login"><div className="card"><Brand /><h1>Acesso pendente</h1>
    <p className="muted" style={{ textAlign: 'center' }}>Seu usuário está inativo ou ainda não foi liberado. Fale com o administrador do sistema.</p>
    <button className="btn ghost block" onClick={store.sair}>Sair</button></div></div>

  const nav = {
    push: (r: Rota) => { setStack(s => [...s, { ...r, y: scrollY }]); scrollTo(0, 0) },
    back: () => setStack(s => { const t = s[s.length - 1]; setTimeout(() => scrollTo(0, t?.y ?? 0), 0); return s.slice(0, -1) }),
    go: (t: string) => { setTab(t); setStack([]); scrollTo(0, 0) },
  }
  const top = stack[stack.length - 1]
  let tela
  if (top?.r === 'at') tela = <Ficha key={top.id} id={top.id!} />
  else if (top?.r === 'loc') tela = <LocadoraFicha key={top.id} id={top.id!} />
  else if (top?.r === 'parados') tela = <Parados dias={+top.id!} />
  else if (top?.r === 'patio') tela = <Patio key={top.id} lista={top.id && LISTAS[top.id] ? top.id : 'todos'} onBack={nav.back} />
  else tela = tab === 'patio' ? <Patio /> : tab === 'hist' ? <Historico /> : tab === 'cad' ? <Cadastros /> : tab === 'rel' && store.pode('relatorios') ? <Relatorios /> : <Inicio />
  const MENU = MENU_TODOS.filter(m => m[0] !== 'rel' || store.pode('relatorios'))
  const TABS = TABS_TODOS.filter(m => m[0] !== 'rel' || store.pode('relatorios'))
  const cur = top ? (top.r === 'patio' ? 'patio' : tab) : tab
  const nPatio = store.ativos.length

  return <NavCtx.Provider value={nav}>
    <nav id="side" aria-label="Menu principal">
      <div className="sbrand"><Brand /><small>Gestão Operacional</small></div>
      <div className="snav">{MENU.map(([t, l, i]) => <button key={t} aria-current={cur === t ? 'page' : undefined} onClick={() => nav.go(t)}>
        <Ic n={i} /><span>{l}</span><span className="cnt">{t === 'patio' ? nPatio : ''}</span></button>)}</div>
      <button className="sfoot" onClick={() => nav.go('cad')}><span className="avatar">{store.me.nome[0]?.toUpperCase()}</span><span><b>{store.me.nome}</b><br /><span className="muted">{store.me.perfil}</span></span></button>
    </nav>
    <main id="main">{tela}</main>
    {!largo && <nav id="tabs" aria-label="Abas" style={{ gridTemplateColumns: `repeat(${TABS.length},1fr)` }}>{TABS.map(([t, l, i]) =>
      <button key={t} aria-current={cur === t ? 'page' : undefined} onClick={() => nav.go(t)}><Ic n={i} /><span>{l}</span></button>)}</nav>}
  </NavCtx.Provider>
}
