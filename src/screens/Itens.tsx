import { useState } from 'react'
import { resumoItens, totalItem, type Atendimento, type Item } from '../lib/domain'
import { brl, deInputLocal, fDataHora, numero, paraInputLocal } from '../lib/format'
import { useStore } from '../lib/store'
import { Field, Fg, Ic, Note, Section, Select, useSheet } from '../ui/ui'

const fmtQ = (q: number) => (+q % 1 ? (+q).toLocaleString('pt-BR') : String(+q))

function FormItem({ i }: { i?: Item }) {
  const [q, setQ] = useState(i ? String(i.quantidade).replace('.', ',') : '1')
  const [v, setV] = useState(i ? (+i.valor_unitario).toFixed(2).replace('.', ',') : '')
  const tot = (numero(q) ?? 0) * (numero(v) ?? 0)
  return <>
    <Fg>
      <Field label="Tipo"><Select name="tipo" options={['Peça', 'Serviço', 'Outro']} value={i?.tipo ?? 'Peça'} /></Field>
      <Field label="Descrição" col><textarea name="descricao" defaultValue={i?.descricao} placeholder="Ex.: Pastilha de freio dianteira, troca do jogo" style={{ minHeight: 60 }} /></Field>
      <Field label="Quantidade"><input name="qtd" inputMode="decimal" value={q} onChange={e => setQ(e.target.value)} /></Field>
      <Field label="Valor unitário"><input name="valor" inputMode="decimal" placeholder="R$" value={v} onChange={e => setV(e.target.value)} /></Field>
      <Field label="Total do item"><b>{brl(tot)}</b></Field>
      <Field label="Por quê / observação" col><textarea name="obs" defaultValue={i?.obs} placeholder="Ex.: desgaste abaixo do mínimo, barulho ao frear" style={{ minHeight: 60 }} /></Field>
    </Fg>
    <Note>Todos da equipe veem o item, quem lançou e quando. Cada mudança atualiza o valor do orçamento e fica no histórico.</Note>
  </>
}

type StoreT = ReturnType<typeof useStore>; type SheetT = ReturnType<typeof useSheet>
export function useItens(a: Atendimento) { return acoesItens(a, useStore(), useSheet()) }
/** versão sem hooks, para usar depois de retornos antecipados */
export function acoesItens(a: Atendimento, store: StoreT, sheet: SheetT) {
  const aprovado = !!a.aprovado_em
  const ler = (f: Record<string, string>) => {
    const q = numero(f.qtd), v = numero(f.valor)
    if (!f.descricao?.trim()) return 'Descreva o item.'
    if (!q || q <= 0) return 'A quantidade precisa ser maior que zero.'
    if (v == null || v < 0) return 'Informe o valor do item.'
    return { p_tipo: f.tipo, p_descricao: f.descricao.trim(), p_quantidade: q, p_valor_unitario: v, p_obs: f.obs ?? '' }
  }
  const pode = (k: 'orcamento' | 'aprovar') => { if (store.pode(k)) return true; sheet.toast(`O perfil ${store.me?.perfil} não pode fazer isso.`); return false }
  return {
    novo: () => pode('orcamento') && sheet.open({ title: 'Novo item do orçamento', done: 'Item incluído', body: <>
      {aprovado && <div className="hint warn">O orçamento já foi aprovado. O item entra como <b>aguardando autorização</b> e só soma no valor aprovado depois de autorizado.</div>}
      <FormItem /></>,
      onSave: f => { const r = ler(f); return typeof r === 'string' ? r : store.rpc('adicionar_item', { p_at: a.id, ...r }) } }),
    editar: (i: Item) => (i.status === 'Aprovado' ? pode('aprovar') : pode('orcamento')) && sheet.open({ title: 'Editar item', done: 'Item alterado', body: <FormItem i={i} />,
      onSave: f => { const r = ler(f); return typeof r === 'string' ? r : store.rpc('editar_item', { p_item: i.id, ...r }) } }),
    retirar: (i: Item) => (i.status === 'Aprovado' ? pode('aprovar') : pode('orcamento')) && sheet.open({ title: 'Retirar item', saveLabel: 'Retirar', done: 'Item retirado do orçamento', body: <>
      <div className="hint">{i.descricao} · {brl(totalItem(i))}. O item continua visível, riscado, com o motivo. Dá para devolver depois.</div>
      <Fg><Field label="Motivo" col><textarea name="m" placeholder="Ex.: locadora não aprovou, cliente vai trazer a peça" /></Field></Fg></>,
      onSave: f => store.rpc('retirar_item', { p_item: i.id, p_motivo: f.m ?? '' }) }),
    restaurar: async (i: Item) => { if (!pode('orcamento')) return; const e = await store.rpc('restaurar_item', { p_item: i.id }); sheet.toast(e || 'Item devolvido ao orçamento') },
    autorizar: async (i: Item) => { if (!pode('aprovar')) return; const e = await store.rpc('aprovar_item', { p_item: i.id }); sheet.toast(e || 'Item autorizado') },
  }
}

/** Corpo da folha "Aprovar orçamento" quando há itens: marcar o que a locadora aprovou */
export function AprovarItensCorpo({ a, itens }: { a: Atendimento; itens: Item[] }) {
  const prop = itens.filter(i => i.status === 'Proposto')
  const [marc, setMarc] = useState<Record<string, boolean>>(() => Object.fromEntries(prop.map(i => [i.id, true])))
  const total = prop.filter(i => marc[i.id]).reduce((s, i) => s + totalItem(i), 0)
  return <>
    <div className="hint">Marque os itens que a locadora aprovou. Os desmarcados saem do orçamento com o motivo abaixo, e continuam visíveis na ficha.</div>
    <div className="group" style={{ marginBottom: 18 }}>{prop.map(i =>
      <label key={i.id} className="row" style={{ cursor: 'pointer' }}>
        <input type="checkbox" name={'it_' + i.id} checked={!!marc[i.id]} onChange={e => setMarc(m => ({ ...m, [i.id]: e.target.checked }))} style={{ width: 20, height: 20, accentColor: 'var(--red)' }} />
        <div className="rm"><b style={{ textDecoration: marc[i.id] ? 'none' : 'line-through', color: marc[i.id] ? undefined : 'var(--sec)' }}>{i.descricao}</b>
          <span className="r2">{i.tipo} · {fmtQ(i.quantidade)} × {brl(+i.valor_unitario)}</span></div>
        <span className="big tnum">{brl(totalItem(i))}</span>
      </label>)}</div>
    <Fg>
      <Field label="Valor aprovado"><b>{brl(total)}</b></Field>
      <Field label="Aprovado em"><input name="t" type="datetime-local" defaultValue={paraInputLocal(new Date())} /></Field>
      <Field label="Protocolo"><input name="prot" defaultValue={a.protocolo} /></Field>
      <Field label="Motivo dos retirados"><input name="motivo" defaultValue="Não aprovado pela locadora" /></Field>
    </Fg>
    <Note>A aprovação não tira o veículo do pátio.</Note>
  </>
}
export const lerAprovacao = (f: Record<string, string>, itens: Item[]) => ({
  aprovados: itens.filter(i => i.status === 'Proposto' && f['it_' + i.id] === '1').map(i => i.id),
  em: deInputLocal(f.t), protocolo: f.prot, motivo: f.motivo,
})

export function ItensOrcamento({ a, itens }: { a: Atendimento; itens: Item[] }) {
  const store = useStore(); const acao = useItens(a)
  const R = resumoItens(itens)
  const lista = [...itens].sort((x, y) => (x.status === 'Retirado' ? 1 : 0) - (y.status === 'Retirado' ? 1 : 0) || x.seq - y.seq)
  return <Section title={`Itens do orçamento${itens.length ? ` (${R.ativos})` : ''}`}
    right={store.pode('orcamento') ? <button className="tbtn" onClick={acao.novo}>+ Item</button> : undefined}
    foot={itens.length ? `Total ${brl(R.total)}${a.aprovado_em ? ` · aprovado ${brl(R.aprovado)}` : ''}${R.retirados.length ? ` · ${R.retirados.length} retirado(s), ${brl(R.retirados.reduce((s, i) => s + totalItem(i), 0))}` : ''}` : undefined}>
    {!itens.length ? <div className="group"><div className="empty" style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
      <span>Lance peças e serviços um por um. Assim todos veem o que compõe o valor, e na aprovação dá para retirar o que a locadora não aprovar.</span>
      {store.pode('orcamento') && <button className="btn sm" onClick={acao.novo}><Ic n="plus" sm /> Primeiro item</button>}</div></div>
      : <div className="group">{lista.map(i => {
        const ret = i.status === 'Retirado', comp = i.status === 'Proposto' && !!a.aprovado_em
        return <div key={i.id} className="row" style={{ alignItems: 'flex-start', opacity: ret ? 0.7 : 1 }}>
          <div className="rm">
            <div className="r1"><span className="tag">{i.tipo}</span>
              <b style={{ textDecoration: ret ? 'line-through' : 'none' }}>{i.descricao}</b>
              {i.status === 'Aprovado' && <span className="tag g">Aprovado</span>}
              {ret && <span className="tag r">Retirado{i.motivo_retirada ? ' · ' + i.motivo_retirada : ''}</span>}
              {comp && <span className="tag o">Aguardando autorização</span>}</div>
            <span className="r2" style={{ whiteSpace: 'normal' }}>{fmtQ(i.quantidade)} × {brl(+i.valor_unitario)}{i.obs ? ' · ' + i.obs : ''}</span>
            <span className="muted sm">Lançado por {i.criado_por_nome || '—'} em {fDataHora(i.criado_em)}{i.alterado_em ? ` · alterado por ${i.alterado_por_nome} em ${fDataHora(i.alterado_em)}` : ''}</span>
            {store.pode('orcamento') && <div className="btnrow" style={{ marginTop: 6 }}>
              {!ret && <button className="btn ghost sm" onClick={() => acao.editar(i)}>Editar</button>}
              {!ret && <button className="btn ghost sm" onClick={() => acao.retirar(i)}>Retirar</button>}
              {ret && <button className="btn ghost sm" onClick={() => acao.restaurar(i)}>Devolver ao orçamento</button>}
              {comp && store.pode('aprovar') && <button className="btn sm" onClick={() => acao.autorizar(i)}>Autorizar</button>}
            </div>}
          </div>
          <span className="big tnum" style={{ textDecoration: ret ? 'line-through' : 'none', color: ret ? 'var(--sec)' : undefined, whiteSpace: 'nowrap' }}>{brl(totalItem(i))}</span>
        </div>
      })}</div>}
  </Section>
}
