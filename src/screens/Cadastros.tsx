import { useEffect, useState } from 'react'
import { PERFIS, TIPOS_CLIENTE, noPatio, faturado, type Atendimento, type Locadora, type Usuario } from '../lib/domain'
import { brl, dur, fData } from '../lib/format'
import { SEL_LISTA, useStore } from '../lib/store'
import { supabase, msgErro } from '../lib/supabase'
import { Field, Fg, Group, Ic, KV, Nav, Note, Seg, Section, Select, Tile, useSheet } from '../ui/ui'
import { AtRow, Lista, useNav } from './comum'

export function Historico() {
  const { locNome } = useStore()
  const [q, setQ] = useState(''); const [seg, setSeg] = useState<'todos' | 'patio' | 'saida' | 'arq'>('todos')
  const [ini, setIni] = useState(''); const [fim, setFim] = useState('')
  const [rows, setRows] = useState<Atendimento[] | null>(null)
  useEffect(() => {
    const t = setTimeout(async () => {
      let qb = supabase.from('atendimentos').select(SEL_LISTA).order('entrada', { ascending: false }).limit(200)
      if (seg === 'patio') qb = qb.eq('sit_fisica', 'patio').eq('arquivado', false)
      if (seg === 'saida') qb = qb.neq('sit_fisica', 'patio').eq('arquivado', false)
      if (seg === 'arq') qb = qb.eq('arquivado', true)
      if (ini) qb = qb.gte('entrada', new Date(ini + 'T00:00:00-04:00').toISOString())
      if (fim) qb = qb.lte('entrada', new Date(fim + 'T23:59:59-04:00').toISOString())
      const t2 = q.trim().replace(/[%,()]/g, '')
      if (t2) qb = qb.or(`placa.ilike.%${t2.toUpperCase().replace(/[^A-Z0-9]/g, '')}%,protocolo.ilike.%${t2}%,os.ilike.%${t2}%,numero.ilike.%${t2}%,modelo.ilike.%${t2}%`)
      const { data } = await qb
      setRows((data ?? []) as Atendimento[])
    }, 300)
    return () => clearTimeout(t)
  }, [q, seg, ini, fim])
  const filtrados = rows ?? []
  return <>
    <Nav title="Histórico de veículos" sub="Todos os atendimentos, incluindo entregues e arquivados" />
    <div className="stack">
      <label className="search"><Ic n="search" sm /><input id="hq" value={q} onChange={e => setQ(e.target.value)} placeholder="Placa, protocolo, OS, número ou modelo" autoComplete="off" /></label>
      <Seg value={seg} onChange={setSeg} options={[['todos', 'Todos'], ['patio', 'No pátio'], ['saida', 'Saíram'], ['arq', 'Arquivados']]} />
      <div className="toolbar" style={{ marginTop: 0 }}>
        <label className="muted sm">Entrada de <input type="date" id="hi" value={ini} onChange={e => setIni(e.target.value)} /></label>
        <label className="muted sm">até <input type="date" id="hf" value={fim} onChange={e => setFim(e.target.value)} /></label>
        {(ini || fim) && <button className="tbtn" onClick={() => { setIni(''); setFim('') }}>Limpar datas</button>}
      </div>
      {rows === null ? <div className="loading">Carregando…</div> : <div className="group">{filtrados.length ? filtrados.map(a =>
        <AtRow key={a.id} a={a} right={<><span className="big">{fData(a.entrada)}</span><span className="muted sm">{a.saida ? 'saída ' + fData(a.saida) : locNome(a.locadora_id)}</span></>} />)
        : <div className="empty">Nenhum atendimento encontrado.</div>}</div>}
      {rows && rows.length === 200 && <p className="foot">Mostrando os 200 mais recentes. Use a busca ou as datas para encontrar atendimentos mais antigos.</p>}
    </div>
  </>
}

function useLocadoraForm() {
  const store = useStore(); const sheet = useSheet()
  return (l: Locadora | null) => {
    if (!store.pode('locadora')) { sheet.toast(`O perfil ${store.me?.perfil} não pode cadastrar locadoras.`); return }
    sheet.open({ title: l ? 'Editar cadastro' : 'Nova locadora ou cliente', done: 'Cadastro salvo',
      body: <Fg><Field label="Nome ou razão social"><input name="nome" defaultValue={l?.nome} /></Field><Field label="Tipo"><Select name="tipo" options={TIPOS_CLIENTE} value={l?.tipo ?? 'Locadora'} /></Field>
        <Field label="Contato"><input name="contato" defaultValue={l?.contato} /></Field><Field label="Telefone"><input name="telefone" type="tel" defaultValue={l?.telefone} /></Field>
        <Field label="E-mail"><input name="email" type="email" defaultValue={l?.email} /></Field>
        <label className="f tog"><span>Ativa</span><input type="checkbox" name="ativo" defaultChecked={l ? l.ativo : true} /></label>
        <Field label="Observações" col><textarea name="obs" defaultValue={l?.obs} /></Field></Fg>,
      async onSave(f) {
        if (!f.nome?.trim()) return 'Informe o nome.'
        const d = { nome: f.nome.trim(), tipo: f.tipo, contato: f.contato ?? '', telefone: f.telefone ?? '', email: f.email ?? '', obs: f.obs ?? '', ativo: !!f.ativo }
        const { error } = l ? await supabase.from('locadoras').update(d).eq('id', l.id) : await supabase.from('locadoras').insert({ ...d, criado_por: store.me?.id })
        if (error) return msgErro(error)
        await store.recarregar()
      } })
  }
}

export function LocadoraFicha({ id }: { id: string }) {
  const { locadoras } = useStore(); const nav = useNav(); const editar = useLocadoraForm()
  const l = locadoras.find(x => x.id === id)
  const [L, setL] = useState<Atendimento[] | null>(null)
  useEffect(() => { supabase.from('atendimentos').select(SEL_LISTA).eq('locadora_id', id).order('entrada', { ascending: false }).limit(300).then(r => setL((r.data ?? []) as Atendimento[])) }, [id])
  if (!l) return <><Nav title="" onBack={nav.back} /><div className="empty">Cadastro não encontrado.</div></>
  const at = L ?? [], ap = at.filter(a => a.aprovado_em && a.enviado_em), ts = ap.map(a => +new Date(a.aprovado_em!) - +new Date(a.enviado_em!))
  const sai = at.filter(a => a.saida)
  const media = (x: number[]) => x.length ? x.reduce((s, v) => s + v, 0) / x.length : null
  return <>
    <Nav title={l.nome} onBack={nav.back} right={<button className="tbtn" onClick={() => editar(l)}>Editar</button>}
      sub={`${l.tipo}${l.ativo ? '' : ' · inativa'}${l.contato ? ' · ' + l.contato : ''}${l.telefone ? ' · ' + l.telefone : ''}`} />
    <div className="tiles t4">
      <Tile label="Atendimentos" value={L ? at.length : '…'} foot={`${at.filter(noPatio).length} no pátio agora`} />
      <Tile label="Tempo médio de aprovação" value={ts.length ? dur(media(ts)) : '—'} money foot={ts.length ? `n = ${ts.length}` : 'Dados insuficientes'} />
      <Tile label="Aprovado" value={brl(at.reduce((s, a) => s + (+(a.valor_aprovado ?? 0)), 0))} money />
      <Tile label="Faturado" value={brl(at.reduce((s, a) => s + faturado(a), 0))} money foot={`permanência média ${dur(media(sai.map(a => +new Date(a.saida!) - +new Date(a.entrada)))) ?? '—'}`} />
    </div>
    {l.obs && <Section title="Observações"><div className="group"><div className="row">{l.obs}</div></div></Section>}
    <Section title="Atendimentos">{L === null ? <div className="loading">Carregando…</div> : <Lista itens={at} vazio="Nenhum atendimento." />}</Section>
  </>
}

export function Cadastros() {
  const store = useStore(); const sheet = useSheet(); const nav = useNav(); const novaLoc = useLocadoraForm()
  const admin = store.pode('usuarios')
  const editarUsuario = (u: Usuario) => {
    if (!admin) return
    sheet.open({ title: u.nome, done: 'Usuário atualizado',
      body: <><Fg><Field label="Nome"><input name="nome" defaultValue={u.nome} /></Field><Field label="E-mail"><span className="muted">{u.email}</span></Field>
        <Field label="Perfil"><Select name="perfil" options={PERFIS} value={u.perfil} /></Field>
        <label className="f tog"><span>Ativo</span><input type="checkbox" name="ativo" defaultChecked={u.ativo} /></label></Fg>
        <Note>Administrador: acesso total. Gerência: indicadores, relatórios, aprovações e notas. Recepção: entradas e atualizações. Operacional: consultas e movimentações. Um usuário inativo não consegue entrar.</Note></>,
      async onSave(f) {
        if (u.id === store.me?.id && (f.perfil !== 'Administrador' || !f.ativo)) return 'Você não pode tirar o próprio acesso de administrador.'
        const { error } = await supabase.from('usuarios').update({ nome: f.nome.trim() || u.nome, perfil: f.perfil, ativo: !!f.ativo }).eq('id', u.id)
        if (error) return msgErro(error)
        await store.recarregar()
      } })
  }
  const novaArea = () => sheet.open({ title: 'Nova área', done: 'Área criada', body: <Fg><Field label="Nome"><input name="nome" /></Field></Fg>,
    async onSave(f) { if (!f.nome?.trim()) return 'Informe o nome.'
      const { error } = await supabase.from('areas').insert({ nome: f.nome.trim(), ordem: store.areas.length + 1 }); if (error) return msgErro(error); await store.recarregar() } })
  const conviteInfo = () => sheet.open({ title: 'Adicionar funcionário', body: <>
    <div className="hint">Para cada funcionário novo:</div>
    <ol style={{ margin: '0 4px 18px', paddingLeft: 18, lineHeight: 1.6, fontSize: 14.5 }}>
      <li>No Supabase, abra <b>Authentication › Users</b> e clique em <b>Add user › Create new user</b>.</li>
      <li>Digite o e-mail e uma senha provisória e marque <b>Auto Confirm User</b>.</li>
      <li>Ele aparece aqui como Operacional. Toque no nome e escolha o perfil certo.</li>
      <li>Passe o e-mail e a senha ao funcionário. Ele troca a senha em Cadastros › Minha senha.</li>
    </ol></> })
  const trocarSenha = () => sheet.open({ title: 'Minha senha', done: 'Senha alterada',
    body: <><Fg><Field label="Nova senha"><input name="s1" type="password" autoComplete="new-password" /></Field><Field label="Repita"><input name="s2" type="password" autoComplete="new-password" /></Field></Fg><Note>Use pelo menos 8 caracteres.</Note></>,
    async onSave(f) { if ((f.s1 ?? '').length < 8) return 'Use pelo menos 8 caracteres.'; if (f.s1 !== f.s2) return 'As senhas não conferem.'
      const { error } = await supabase.auth.updateUser({ password: f.s1 }); if (error) return msgErro(error) } })

  return <>
    <Nav title="Cadastros e configurações" />
    <Section title="Minha conta"><div className="group">
      <KV k={<b>{store.me?.nome}</b>} v={store.me?.perfil} /><KV k="E-mail" v={store.me?.email} />
      <button className="row" onClick={trocarSenha}><span className="rm">Minha senha</span><Ic n="chev" className="chev" /></button>
      <button className="row" onClick={store.sair}><span className="rm redt">Sair</span></button>
    </div></Section>
    <Section title="Usuários" right={admin ? <button className="tbtn" onClick={conviteInfo}>+ Adicionar</button> : undefined}
      foot={admin ? 'Toque em um usuário para mudar o perfil ou desativar o acesso.' : 'Só o administrador altera usuários.'}>
      <div className="group">{store.usuarios.map(u => <button key={u.id} className="row" onClick={() => editarUsuario(u)} disabled={!admin}>
        <span className="avatar">{u.nome[0]?.toUpperCase()}</span><div className="rm"><b>{u.nome}</b><span className="r2">{u.perfil}{u.ativo ? '' : ' · inativo'}</span></div>{admin && <Ic n="chev" className="chev" />}</button>)}</div>
    </Section>
    <Section title="Locadoras e clientes" right={store.pode('locadora') ? <button className="tbtn" onClick={() => novaLoc(null)}>+ Nova</button> : undefined}>
      <Group empty="Nenhuma locadora cadastrada. Também dá para cadastrar na entrada do veículo.">{store.locadoras.map(l =>
        <button key={l.id} className="row" onClick={() => nav.push({ r: 'loc', id: l.id })}><div className="rm"><b>{l.nome}</b><span className="r2">{l.tipo}{l.ativo ? '' : ' · inativa'}</span></div>
          <span className="muted sm">{store.ativos.filter(a => a.locadora_id === l.id).length} no pátio</span><Ic n="chev" className="chev" /></button>)}</Group>
    </Section>
    <Section title="Áreas da oficina" right={store.pode('areas') ? <button className="tbtn" onClick={novaArea}>+ Nova</button> : undefined}>
      <div className="group" style={{ padding: '12px 14px' }}><div className="chips">{store.areas.map(a => <span key={a.id} className="pill">{a.nome}</span>)}</div></div>
    </Section>
    <EspacoAnexos />
    <Section title="Oficina"><div className="group"><KV k="Nome" v="NETO AUTO CENTER — Gestão Operacional" /><KV k="Fuso horário" v="Tangará da Serra (UTC−4)" /><KV k="Datas e valores" v="DD/MM/AAAA · Real (R$)" /></div></Section>
  </>
}

function EspacoAnexos() {
  const store = useStore(); const sheet = useSheet()
  const [uso, setUso] = useState<{ bytes: number; arquivos: number } | null>(null)
  const [dias, setDias] = useState<number | null>(null)
  useEffect(() => {
    supabase.rpc('espaco_anexos').then(r => { if (!r.error && r.data?.[0]) setUso({ bytes: +r.data[0].bytes, arquivos: +r.data[0].arquivos }) })
    supabase.from('configuracoes').select('anexos_dias_apos_saida').eq('id', 1).maybeSingle().then(r => { if (!r.error && r.data) setDias(r.data.anexos_dias_apos_saida) })
  }, [store.versao])
  if (!uso) return null
  const GB = 1024 ** 3, frac = Math.min(1, uso.bytes / GB)
  const mb = (b: number) => (b / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' MB'
  const editar = () => sheet.open({ title: 'Limpeza dos anexos', done: 'Prazo salvo',
    body: <><Fg><Field label="Apagar arquivos após a saída"><Select name="d" value={String(dias ?? 7)} options={[['0', 'Na hora'], ['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias'], ['365', '1 ano']]} /></Field></Fg>
      <Note>Depois da saída do veículo, os PDFs e prints são apagados nesse prazo para liberar espaço. Itens, valores e histórico ficam guardados.</Note></>,
    async onSave(f) { const { error } = await supabase.from('configuracoes').update({ anexos_dias_apos_saida: +f.d }).eq('id', 1); if (error) return msgErro(error); setDias(+f.d) } })
  return <Section title="Anexos" foot="Plano gratuito do Supabase: 1 GB para arquivos. Prints são reduzidos automaticamente antes do envio.">
    <div className="group">
      <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Espaço usado</span><b className="tnum">{mb(uso.bytes)} de 1 GB</b></div>
        <div style={{ height: 8, borderRadius: 4, background: 'var(--fill)', overflow: 'hidden' }}><div style={{ width: `${Math.max(1, frac * 100)}%`, height: '100%', background: frac > 0.85 ? 'var(--red)' : frac > 0.6 ? 'var(--orange)' : 'var(--green)' }} /></div>
        <span className="muted sm">{uso.arquivos} arquivo(s) guardado(s)</span>
      </div>
      <button className="row" onClick={store.pode('areas') ? editar : undefined} disabled={!store.pode('areas')}>
        <span className="rm">Apagar anexos após a saída</span><span className="muted">{dias == null ? '—' : dias === 0 ? 'na hora' : dias === 365 ? '1 ano' : `${dias} dias`}</span>{store.pode('areas') && <Ic n="chev" className="chev" />}</button>
    </div>
  </Section>
}
