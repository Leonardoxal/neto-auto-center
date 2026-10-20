import { useEffect, useState } from 'react'
import {
  COMERCIAL, FINANCEIRA, FISCAL, FISICA, OPERACIONAL, ESPERAS, descontoConcedido, descontoSolicitado, faturado, noPatio,
  tempoNoPatio, tempos, ultimaAtualizacao, valorAtual, valorInicial, type Acao, type Atendimento,
} from '../lib/domain'
import { brl, deInputLocal, dur, fData, fDataHora, fHora, numero, paraInputLocal, pct } from '../lib/format'
import { SEL_FICHA, useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { Field, Fg, Group, Ic, KV, Nav, Note, Pill, Plate, Section, Select, useSheet } from '../ui/ui'
import { AtRow, Etapas, usePresenca, useNav } from './comum'
import { AprovarItensCorpo, ItensOrcamento, acoesItens, lerAprovacao } from './Itens'
import type { Item } from '../lib/domain'

const agora = () => paraInputLocal(new Date())

export function Ficha({ id }: { id: string }) {
  const store = useStore(); const nav = useNav(); const sheet = useSheet(); const presenca = usePresenca()
  const [a, setA] = useState<Atendimento | null | undefined>(undefined)
  const [outros, setOutros] = useState<Atendimento[]>([])
  const [itens, setItens] = useState<Item[]>([])

  useEffect(() => {
    let vivo = true
    supabase.from('atendimentos').select(SEL_FICHA).eq('id', id).maybeSingle().then(({ data: d }) => {
      if (!vivo) return
      const data = d as unknown as Atendimento | null
      setA(data ?? null)
      if (data) supabase.from('orcamento_itens').select('*').eq('atendimento_id', id).order('seq').then(r => vivo && setItens(r.error ? [] : (r.data ?? []) as Item[]))
      if (data) supabase.from('atendimentos').select('*').eq('placa', data.placa).neq('id', id).order('entrada', { ascending: false })
        .then(r => vivo && setOutros((r.data ?? []) as Atendimento[]))
    })
    return () => { vivo = false }
  }, [id, store.versao])

  if (a === undefined) return <><Nav title="" onBack={nav.back} /><div className="loading">Carregando…</div></>
  if (a === null) return <><Nav title="" onBack={nav.back} /><div className="empty">Atendimento não encontrado.</div></>

  const guard = (k: Acao) => { if (store.pode(k)) return true; sheet.toast(`O perfil ${store.me?.perfil} não pode fazer isso.`); return false }
  const run = (fn: string, args: Record<string, unknown>) => store.rpc(fn, { p_at: a.id, ...args })
  const areas = store.areas.filter(x => x.ativa).map(x => x.nome)
  const vi = valorInicial(a), va = valorAtual(a)
  const temItens = itens.length > 0
  const acItens = acoesItens(a, store, sheet)

  // ---------- ações ----------
  const acoes: [string, string, string, Acao | null, () => void][] = [
    ['orc', temItens ? '+ Item' : 'Orçamento', 'edit', 'orcamento', () => temItens ? acItens.novo() : sheet.open({
      title: va == null ? 'Registrar orçamento' : 'Revisar orçamento', done: 'Orçamento registrado',
      body: <><Fg>{va != null && <Field label="Valor atual"><span className="muted">{brl(va)}</span></Field>}
        <Field label={va == null ? 'Valor' : 'Novo valor'}><input name="v" inputMode="decimal" placeholder="0,00" /></Field>
        <Field label="Data e hora"><input name="t" type="datetime-local" defaultValue={agora()} /></Field>
        <Field label="Observação" col><textarea name="obs" /></Field></Fg>
        <Note>Cada revisão fica guardada. Nenhum valor anterior é apagado. Para detalhar peças e serviços, use <b>+ Item</b> na seção Itens do orçamento.</Note></>,
      onSave: f => { const v = numero(f.v); if (!v || v <= 0) return 'Informe um valor maior que zero.'; return run('registrar_orcamento', { p_valor: v, p_em: deInputLocal(f.t), p_obs: f.obs }) },
    })],
    ['enviar', 'Enviar', 'out', 'enviar', () => {
      if (va == null) { sheet.toast('Registre o valor do orçamento antes de enviar.'); return }
      sheet.open({ title: 'Enviar orçamento', done: 'Envio registrado. O tempo de aprovação começou a contar.',
        body: <><Fg><Field label="Valor"><b>{brl(va)}</b></Field><Field label="Enviado em"><input name="t" type="datetime-local" defaultValue={agora()} /></Field>
          <Field label="Protocolo externo"><input name="prot" defaultValue={a.protocolo} /></Field></Fg>
          <Note>{a.enviado_em ? `Já houve envio em ${fDataHora(a.enviado_em)}. Este registro conta como reenvio e não muda a data do primeiro envio.` : 'O tempo de aprovação passa a contar a partir deste envio.'}</Note></>,
        onSave: f => run('enviar_orcamento', { p_em: deInputLocal(f.t), p_protocolo: f.prot }) })
    }],
    ['desc', 'Desconto', 'undo', 'desconto', () => {
      if (va == null) { sheet.toast('Não há orçamento para negociar.'); return }
      sheet.open({ title: 'Negociação de desconto', done: 'Negociação registrada',
        body: <><Fg><Field label="Valor de referência"><b>{brl(va)}</b></Field>
          <Field label="Redução pedida pela locadora"><input name="sol" inputMode="decimal" placeholder="R$" /></Field>
          <Field label="Redução concedida"><input name="conc" inputMode="decimal" placeholder="R$" /></Field></Fg>
          <Fg><Field label="Pedido recebido em"><input name="t" type="datetime-local" defaultValue={paraInputLocal(Date.now() - 36e5)} /></Field>
            <Field label="Resposta da oficina"><input name="r" type="datetime-local" defaultValue={agora()} /></Field>
            <Field label="Motivo" col><textarea name="motivo" /></Field></Fg>
          <Note>Pedido e concessão ficam registrados separadamente. O novo valor é a referência menos o concedido.</Note></>,
        onSave: f => {
          const sol = numero(f.sol), conc = numero(f.conc) ?? 0
          if (sol == null || sol < 0) return 'Informe a redução pedida pela locadora.'
          if (conc < 0 || conc > va) return 'A redução concedida precisa estar entre zero e o valor de referência.'
          if (deInputLocal(f.r) < deInputLocal(f.t)) return 'A resposta não pode ser anterior ao pedido.'
          return run('registrar_desconto', { p_solicitado: sol, p_concedido: conc, p_pedido_em: deInputLocal(f.t), p_resposta_em: deInputLocal(f.r), p_motivo: f.motivo })
        } })
    }],
    ['aprov', 'Aprovar', 'check', 'aprovar', () => {
      if (a.aprovado_em) { sheet.toast(`Já aprovado em ${fDataHora(a.aprovado_em)}.`); return }
      if (itens.some(i => i.status === 'Proposto')) { sheet.open({ title: 'Aprovar orçamento', done: 'Aprovado. O veículo continua no pátio.',
        body: <AprovarItensCorpo a={a} itens={itens} />,
        onSave: f => { const r = lerAprovacao(f, itens); if (!r.aprovados.length) return 'Marque pelo menos um item aprovado.'
          return run('aprovar_com_itens', { p_aprovados: r.aprovados, p_em: r.em, p_protocolo: r.protocolo, p_motivo: r.motivo }) } }); return }
      sheet.open({ title: 'Aprovar orçamento', done: 'Aprovado. O veículo continua no pátio.',
        body: <><Fg><Field label="Valor aprovado"><input name="v" inputMode="decimal" defaultValue={va != null ? va.toFixed(2).replace('.', ',') : ''} /></Field>
          <Field label="Aprovado em"><input name="t" type="datetime-local" defaultValue={agora()} /></Field><Field label="Protocolo"><input name="prot" defaultValue={a.protocolo} /></Field></Fg>
          <Note>{a.enviado_em ? `Tempo desde o envio: ${dur(Date.now() - +new Date(a.enviado_em))}.` : 'Sem envio registrado: o tempo de aprovação ficará como "Dados insuficientes".'} A aprovação não tira o veículo do pátio.</Note></>,
        onSave: f => { const v = numero(f.v); if (!v || v <= 0) return 'Informe o valor aprovado.'; return run('aprovar_orcamento', { p_valor: v, p_em: deInputLocal(f.t), p_protocolo: f.prot }) } })
    }],
    ['recusa', 'Recusar', 'x', 'recusar', () => sheet.open({ title: 'Registrar recusa', done: 'Recusa registrada',
      body: <Fg><Field label="Recusado em"><input name="t" type="datetime-local" defaultValue={agora()} /></Field><Field label="Motivo" col><textarea name="m" /></Field></Fg>,
      onSave: f => run('recusar_orcamento', { p_em: deInputLocal(f.t), p_motivo: f.m }) })],
    ['nota', 'Nota fiscal', 'receipt', 'nota', () => {
      const base = a.valor_aprovado ?? va, saldo = base != null ? Math.max(0, base - faturado(a)) : null
      sheet.open({ title: 'Emitir nota fiscal', done: 'Nota registrada. O veículo continua onde está.',
        body: <><Fg><Field label="Tipo"><Select name="tipo" options={[['NFS-e', 'NFS-e · serviço'], ['NF-e', 'NF-e · peças']]} /></Field>
          <Field label="Número"><input name="num" inputMode="numeric" /></Field><Field label="Série"><input name="serie" defaultValue="1" /></Field>
          <Field label="Valor"><input name="v" inputMode="decimal" defaultValue={saldo ? saldo.toFixed(2).replace('.', ',') : ''} /></Field>
          <Field label="Emissão"><input name="t" type="datetime-local" defaultValue={agora()} /></Field><Field label="Observação" col><textarea name="obs" /></Field></Fg>
          <Note>{saldo != null ? `Saldo pendente de faturamento: ${brl(saldo)}. ` : ''}Emitir a nota não conclui o serviço nem tira o veículo do pátio.</Note></>,
        onSave: f => { const v = numero(f.v); if (!f.num) return 'Informe o número da nota.'; if (!v || v <= 0) return 'Informe o valor da nota.'
          return store.rpc('emitir_nota', { p_at: a.id, p_tipo: f.tipo, p_numero: f.num, p_serie: f.serie, p_valor: v, p_emissao: deInputLocal(f.t), p_obs: f.obs }) } })
    }],
    ['mover', 'Mover', 'move', 'mover', () => sheet.open({ title: 'Movimentar veículo', done: 'Movimentação registrada',
      body: <Fg><Field label="Origem"><span className="muted">{a.local}</span></Field><Field label="Destino"><Select name="para" options={areas.filter(x => x !== a.local)} /></Field>
        <Field label="Quando"><input name="t" type="datetime-local" defaultValue={agora()} /></Field><Field label="Observação" col><textarea name="obs" /></Field></Fg>,
      onSave: f => run('movimentar', { p_destino: f.para, p_em: deInputLocal(f.t), p_obs: f.obs }) })],
    ...(noPatio(a) ? [['presenca', a.na_oficina === false ? 'Voltou à oficina' : 'Condutor levou', 'car', 'presenca', () => presenca(a)] as [string, string, string, Acao | null, () => void]] : []),
    ['saida', 'Saída', 'exit', 'saida', () => {
      if (!noPatio(a)) { sheet.toast('Este veículo já não está no pátio.'); return }
      const avisos = [a.sit_operacional !== 'Serviço concluído' && 'O serviço não está marcado como concluído.', faturado(a) === 0 && a.sit_comercial === 'Aprovado' && 'Ainda não há nota fiscal emitida.'].filter(Boolean)
      sheet.open({ title: 'Registrar saída', saveLabel: 'Confirmar', done: 'Saída registrada. O atendimento segue no histórico.',
        body: <>{avisos.length > 0 && <div className="hint warn">{avisos.map(x => <span key={String(x)}>{x}</span>)}</div>}
          <Fg><Field label="Tipo de saída"><Select name="tipo" options={[['entregue', 'Entregue ao condutor'], ['retirado', 'Retirado / removido']]} /></Field>
            <Field label="Data e hora"><input name="t" type="datetime-local" defaultValue={agora()} /></Field><Field label="Observação" col><textarea name="obs" /></Field></Fg>
          <Note>O veículo sai do pátio ativo. Nada é apagado.</Note></>,
        onSave: f => run('registrar_saida', { p_tipo: f.tipo, p_em: deInputLocal(f.t), p_obs: f.obs }) })
    }],
    ['editar', 'Editar', 'edit', 'editar', () => sheet.open({ title: 'Editar atendimento', done: 'Atendimento atualizado',
      body: <><Fg>
        <Field label="Marca e modelo"><input name="modelo" defaultValue={a.modelo} /></Field>
        <Field label="Locadora"><Select name="locadora_id" options={store.locadoras.map(l => [l.id, l.nome] as [string, string])} value={a.locadora_id} /></Field>
        <Field label="Condutor"><input name="condutor" defaultValue={a.condutor} /></Field>
        <Field label="Ordem de serviço"><input name="os" defaultValue={a.os} /></Field>
        <Field label="Protocolo"><input name="protocolo" defaultValue={a.protocolo} /></Field>
        <Field label="Responsável"><Select name="responsavel" options={[...new Set([a.responsavel, ...store.usuarios.map(u => u.nome)])].filter(Boolean)} value={a.responsavel} /></Field>
        <Field label="Motivo da espera"><input name="motivo_espera" defaultValue={a.motivo_espera} /></Field>
        <Field label="Serviço solicitado" col><textarea name="servico" defaultValue={a.servico} /></Field>
        <Field label="Observações" col><textarea name="obs" defaultValue={a.obs} /></Field></Fg>
        <Fg><Field label="Data de entrada"><input name="entrada" type="datetime-local" defaultValue={paraInputLocal(a.entrada)} disabled={!store.pode('corrigirData')} /></Field></Fg>
        <Note>{store.pode('corrigirData') ? 'A correção da data de entrada fica registrada no histórico.' : 'Só a gerência corrige a data de entrada.'}</Note></>,
      onSave: f => {
        const p: Record<string, string> = {}
        for (const k of ['modelo', 'locadora_id', 'condutor', 'os', 'protocolo', 'responsavel', 'motivo_espera', 'servico', 'obs']) if (f[k] !== undefined) p[k] = f[k]
        if (f.entrada && store.pode('corrigirData') && f.entrada !== paraInputLocal(a.entrada)) p.entrada = deInputLocal(f.entrada)
        return run('editar_atendimento', { p })
      } })],
    noPatio(a) || a.arquivado
      ? ['arquivar', a.arquivado ? 'Desarquivar' : 'Arquivar', 'archive', 'arquivar', () => sheet.open({ title: a.arquivado ? 'Desarquivar' : 'Arquivar atendimento', saveLabel: 'Confirmar', done: a.arquivado ? 'Atendimento desarquivado' : 'Atendimento arquivado',
        body: <div className="hint">{a.arquivado ? 'O atendimento volta às listas conforme sua situação.' : 'O atendimento sai das listas operacionais. Todos os registros continuam no histórico e nos relatórios.'}</div>,
        onSave: () => run('arquivar', { p_arquivar: !a.arquivado }) })]
      : ['reabrir', 'Voltar ao pátio', 'undo', 'reabrir', () => sheet.open({ title: 'Voltar ao pátio', saveLabel: 'Confirmar', done: 'Veículo de volta ao pátio',
        body: <div className="hint">A saída registrada é desfeita e o veículo volta ao pátio ativo. A operação fica no histórico.</div>,
        onSave: () => run('reabrir', {}) })],
  ]

  const situacao = (campo: 'fisica' | 'comercial' | 'operacional' | 'fiscal' | 'financeira') => {
    const cfg = {
      fisica: { t: 'Situação física', acao: 'saida' as Acao },
      comercial: { t: 'Situação comercial', acao: 'comercial' as Acao, opts: COMERCIAL, v: a.sit_comercial },
      operacional: { t: 'Situação operacional', acao: 'operacional' as Acao, opts: OPERACIONAL, v: a.sit_operacional },
      fiscal: { t: 'Situação fiscal', acao: 'fiscal' as Acao, opts: FISCAL, v: a.sit_fiscal },
      financeira: { t: 'Situação financeira', acao: 'financeira' as Acao, opts: FINANCEIRA, v: a.sit_financeira },
    }[campo]
    if (campo === 'fisica') { (noPatio(a) ? acoes.find(x => x[0] === 'saida') : acoes.find(x => x[0] === 'reabrir'))?.[4](); return }
    if (!guard(cfg.acao)) return
    sheet.open({ title: cfg.t, done: 'Situação atualizada',
      body: <><Fg><Field label={cfg.t}><Select name="v" options={[...(cfg.opts ?? [])]} value={cfg.v} /></Field>
        <Field label="Quando"><input name="t" type="datetime-local" defaultValue={agora()} /></Field>
        {campo === 'operacional' && <Field label="Motivo da espera"><input name="motivo" defaultValue={a.motivo_espera} placeholder="Opcional" /></Field>}</Fg>
        <Note>{campo === 'operacional' ? 'Entrar em "Aguardando peças", "autorização" ou "terceirizado" abre um intervalo de espera; sair dele fecha o intervalo.' : campo === 'comercial' ? 'Para registrar valores, prefira as ações Aprovar, Recusar e Desconto.' : 'A alteração fica registrada no histórico.'}</Note></>,
      onSave: f => campo === 'operacional'
        ? run('mudar_operacional', { p_valor: f.v, p_em: deInputLocal(f.t), p_motivo: f.motivo ?? null })
        : run('mudar_situacao', { p_campo: campo, p_valor: f.v, p_em: deInputLocal(f.t) }) })
  }

  const revs = [...(a.orcamento_revisoes ?? [])].sort((x, y) => x.seq - y.seq)
  const evs = [...(a.eventos ?? [])].sort((x, y) => +new Date(y.em) - +new Date(x.em) || y.id - x.id)
  const movs = [...(a.movimentacoes ?? [])].sort((x, y) => +new Date(y.em) - +new Date(x.em))

  return <>
    <Nav title="" onBack={nav.back} />
    <div className="fhead"><Plate p={a.placa} lg />
      <div className="sub">{a.modelo || 'Modelo não informado'} · <button className="tbtn" style={{ display: 'inline', padding: 0, minHeight: 0, fontSize: 'inherit' }} onClick={() => nav.push({ r: 'loc', id: a.locadora_id })}>{store.locNome(a.locadora_id)}</button> · {a.numero}</div>
      {outros.length > 0 && <div className="muted sm">{outros.length} outro(s) atendimento(s) desta placa no histórico.</div>}
    </div>
    <section className="sec"><div className="group" style={{ padding: '12px 10px 8px' }}><Etapas a={a} /></div>
      {noPatio(a) && <div className="chips" style={{ marginTop: 8 }}>
        {faturado(a) > 0 ? <span className="tag g">Nota emitida · {brl(faturado(a))}</span> : <span className="tag">Sem nota</span>}
        {a.na_oficina === false ? <span className="tag r">Fora da oficina · com o condutor{a.fora_desde ? ' desde ' + fDataHora(a.fora_desde) : ''}</span> : <span className="tag">Na oficina · {a.local}</span>}
      </div>}</section>
    <section className="sec"><div className="acts">{acoes.map(([k, l, i, p, fn]) => {
      const ok = !p || store.pode(p)
      return <button key={k} className={`act ${ok ? '' : 'lock'}`} onClick={() => ok ? fn() : guard(p!)}><span className="ib"><Ic n={ok ? i : 'lock'} /></span>{l}</button>
    })}</div></section>
    <ItensOrcamento a={a} itens={itens} />
    <div className="cols2"><div>
      <Section title="Situação" foot="As cinco situações são independentes. Um veículo pode estar no pátio, aprovado, em execução e faturado ao mesmo tempo.">
        <div className="group">{([['fisica', 'Física', noPatio(a) && a.na_oficina === false ? 'Com o condutor' : FISICA[a.sit_fisica] + (a.arquivado ? ' · arquivado' : '')], ['comercial', 'Comercial', a.sit_comercial], ['operacional', 'Operacional', a.sit_operacional], ['fiscal', 'Fiscal', a.sit_fiscal], ['financeira', 'Financeira', a.sit_financeira]] as const).map(([k, l, v]) =>
          <button key={k} className="row" onClick={() => situacao(k)}><span className="rm">{l}</span><Pill s={v} /><Ic n="chev" className="chev" /></button>)}</div>
      </Section>
      <Section title="Atendimento"><div className="group">
        <KV k="Entrada" v={fDataHora(a.entrada)} /><KV k={a.saida ? 'Permanência total' : 'Tempo no pátio'} v={dur(tempoNoPatio(a))} strong />
        {a.saida && <KV k="Saída" v={fDataHora(a.saida)} />}
        <KV k="Local" v={a.local} /><KV k="Responsável" v={a.responsavel || '—'} /><KV k="Condutor" v={a.condutor || '—'} />
        <KV k="Ordem de serviço" v={a.os || '—'} /><KV k="Protocolo da locadora" v={a.protocolo || '—'} />
        <KV k="Serviço solicitado" v={a.servico || '—'} /><KV k="Motivo da espera" v={a.motivo_espera || '—'} />
        {a.obs && <KV k="Observações" v={a.obs} />}<KV k="Última atualização" v={fDataHora(ultimaAtualizacao(a))} />
      </div></Section>
      <Section title="Orçamento e negociação">
        <div className="group">
          <KV k="Valor inicial" v={vi == null ? <span className="pill o">Pendente</span> : brl(vi)} /><KV k="Valor atual" v={brl(va)} />
          <KV k="Valor aprovado" v={a.valor_aprovado == null ? '—' : brl(+a.valor_aprovado)} strong />
          <KV k="Desconto solicitado" v={a.descontos?.length ? brl(descontoSolicitado(a)) : 'Nenhum registrado'} />
          <KV k="Desconto concedido" v={a.descontos?.length ? `${brl(descontoConcedido(a))} · ${pct(descontoConcedido(a) / (+a.descontos[0].base || 1))}` : '—'} />
          <KV k="Enviado em" v={fDataHora(a.enviado_em)} />{a.aprovado_em && <KV k="Aprovado em" v={fDataHora(a.aprovado_em)} />}{a.recusado_em && <KV k="Recusado em" v={fDataHora(a.recusado_em)} />}
        </div>
        {revs.length > 0 && <><h3 className="sh" style={{ marginTop: 14 }}>Revisões ({revs.length})</h3><div className="group">{revs.map((r, i) =>
          <KV key={r.id} k={<>{i === 0 ? 'Inicial' : `Revisão ${i}`}<br /><span className="muted sm">{fDataHora(r.em)}{r.obs ? ' · ' + r.obs : ''}</span></>} v={brl(+r.valor)} strong />)}</div></>}
        {(a.descontos ?? []).length > 0 && <><h3 className="sh" style={{ marginTop: 14 }}>Negociações</h3><div className="group">{a.descontos!.map(d =>
          <KV key={d.id} k={<>Base {brl(+d.base)}<br /><span className="muted sm">{fDataHora(d.pedido_em)} · resposta {fDataHora(d.resposta_em)}{d.motivo ? ' · ' + d.motivo : ''}</span></>}
            v={<>pediu {brl(+d.solicitado)}<br /><b style={{ color: 'var(--label)' }}>deu {brl(+d.concedido)}</b> · {pct(+d.concedido / +d.base)}</>} />)}</div></>}
      </Section>
    </div><div>
      <Section title="Tempos"><div className="group">{tempos(a).map(([l, v, p]) =>
        <KV key={l} k={l} v={typeof v === 'string' ? v : v == null ? <span className="muted">Dados insuficientes</span> : <>{dur(v)}{p && <> <span className="pill o">em andamento</span></>}</>} />)}</div>
        {(a.esperas ?? []).length > 0 && <><h3 className="sh" style={{ marginTop: 14 }}>Intervalos de espera</h3><div className="group">{a.esperas!.map(e =>
          <KV key={e.id} k={e.motivo} v={`${fDataHora(e.inicio)} → ${e.fim ? fDataHora(e.fim) : 'agora'} · ${dur((e.fim ? +new Date(e.fim) : Date.now()) - +new Date(e.inicio))}`} />)}</div></>}
      </Section>
      <Section title="Notas fiscais" right={(a.notas_fiscais ?? []).length ? <span className="muted" style={{ textTransform: 'none' }}>{brl(faturado(a))} faturado</span> : undefined}>
        <Group empty="Nenhuma nota emitida.">{(a.notas_fiscais ?? []).map(n => <div key={n.id} className="row kv">
          <span className="k">{n.tipo} nº {n.numero} · série {n.serie}<br /><span className="muted sm">{fData(n.emissao)}{n.cancelada ? ' · cancelada' : ''}</span></span>
          <span className={`v ${n.cancelada ? '' : 'strong'}`} style={n.cancelada ? { textDecoration: 'line-through' } : undefined}>{brl(+n.valor)}</span>
          {!n.cancelada && store.pode('nota') && <button className="btn ghost sm" onClick={() => sheet.open({ title: 'Cancelar nota', saveLabel: 'Cancelar nota', done: 'Nota cancelada',
            body: <><div className="hint bad">{n.tipo} nº {n.numero} · {brl(+n.valor)}. A nota continua no histórico, marcada como cancelada.</div><Fg><Field label="Motivo" col><textarea name="m" /></Field></Fg></>,
            onSave: f => store.rpc('cancelar_nota', { p_nota: n.id, p_motivo: f.m }) })}>Cancelar</button>}
        </div>)}</Group>
      </Section>
      <Section title="Movimentações"><Group empty="Sem movimentações.">{movs.map(m => <KV key={m.id} k={<>{m.origem} → <b>{m.destino}</b></>} v={fDataHora(m.em)} />)}</Group></Section>
    </div></div>
    <Section title="Histórico do atendimento"><div className="group timeline">{evs.map(e =>
      <div key={e.id} className="row"><span className="when">{fData(e.em)}<br />{fHora(e.em)}</span>
        <div className="rm"><b>{e.tipo}</b><span className="r2" style={{ whiteSpace: 'normal' }}>{e.descricao}</span></div><span className="muted sm">{e.usuario_nome}</span></div>)}</div></Section>
    {outros.length > 0 && <Section title="Outros atendimentos desta placa"><div className="group">{outros.map(x => <AtRow key={x.id} a={x} />)}</div></Section>}
    <p className="foot" style={{ marginTop: 18 }}>{ESPERAS.includes(a.sit_operacional) ? `Em espera desde ${fDataHora(a.oper_desde)}.` : ''}</p>
  </>
}
