import { useEffect, useState } from 'react'
import { normPlaca, placaValida, TIPOS_CLIENTE, noPatio, type Atendimento } from '../lib/domain'
import { deInputLocal, fData, numero, paraInputLocal } from '../lib/format'
import { supabase, msgErro } from '../lib/supabase'
import { useStore } from '../lib/store'
import { Field, Fg, Note, Select, useSheet } from '../ui/ui'
import { useNav } from './comum'

function DicaPlaca({ placa }: { placa: string }) {
  const { locNome } = useStore()
  const [hist, setHist] = useState<Atendimento[] | null>(null)
  const p = normPlaca(placa)
  useEffect(() => {
    if (!placaValida(p)) { setHist(null); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('atendimentos').select('id,numero,placa,modelo,locadora_id,entrada,servico,sit_fisica,arquivado').eq('placa', p).order('entrada')
      setHist((data ?? []) as Atendimento[])
    }, 350)
    return () => clearTimeout(t)
  }, [p])
  if (!hist) return null
  if (!hist.length) return <div className="hint">Placa sem atendimentos anteriores.</div>
  const ativo = hist.find(noPatio), ult = hist[hist.length - 1]
  return <div className={`hint ${ativo ? 'warn' : ''}`}>
    {ativo
      ? <span><b>Possível duplicidade.</b> {p} já está no pátio no atendimento {ativo.numero}, desde {fData(ativo.entrada)}. Salvar cria um atendimento novo e separado.</span>
      : <span>{hist.length} atendimento(s) anterior(es). Último: {fData(ult.entrada)} · {locNome(ult.locadora_id)}{ult.servico ? ' · ' + ult.servico : ''}</span>}
    <span className="muted sm">Dados de atendimentos anteriores não são copiados automaticamente.</span>
    {ult.modelo && <div><button type="button" className="btn ghost sm" onClick={() => {
      const m = document.getElementById('f_modelo') as HTMLInputElement | null
      if (m) { m.value = ult.modelo; (m.closest('details') as HTMLDetailsElement).open = true }
    }}>Usar modelo: {ult.modelo}</button></div>}
  </div>
}

function CorpoEntrada() {
  const { locadoras, areas, usuarios, me } = useStore()
  const [placa, setPlaca] = useState('')
  const ativas = locadoras.filter(l => l.ativo)
  const [nova, setNova] = useState(ativas.length === 0)
  return <>
    <Fg>
      {!nova && <Field label="Locadora"><Select name="loc" options={[['', 'Selecionar'], ...ativas.map(l => [l.id, l.nome] as [string, string])]} /></Field>}
      <div className="f"><button type="button" className="tbtn" onClick={() => setNova(!nova)}>{nova ? (ativas.length ? 'Escolher locadora cadastrada' : '') : '+ Cadastrar nova locadora'}</button></div>
      {nova && <><Field label="Nova locadora"><input id="f_nl_nome" name="nl_nome" placeholder="Nome ou razão social" /></Field>
        <Field label="Tipo"><Select name="nl_tipo" options={TIPOS_CLIENTE} value="Locadora" /></Field></>}
      <Field label="Contato do condutor"><input id="f_condutor" name="condutor" placeholder="Nome e telefone" /></Field>
      <Field label="Entrada"><input id="f_entrada" name="entrada" type="datetime-local" defaultValue={paraInputLocal(new Date())} /></Field>
      <Field label="Placa"><input id="f_placa" name="placa" placeholder="ABC1D23" maxLength={8} autoCapitalize="characters" value={placa}
        onChange={e => setPlaca(e.target.value.toUpperCase())} style={{ fontFamily: 'var(--mono)', letterSpacing: '.06em' }} /></Field>
      <Field label="Valor do orçamento"><input id="f_valor" name="valor" inputMode="decimal" placeholder="Pendente" /></Field>
    </Fg>
    <DicaPlaca placa={placa} />
    <Note>Sem valor, o orçamento fica pendente, nunca R$ 0,00. A data e a hora vêm do relógio da oficina.</Note>
    <details className="more"><summary>Mais informações (opcional)</summary>
      <Fg>
        <Field label="Marca e modelo"><input id="f_modelo" name="modelo" /></Field>
        <Field label="Ordem de serviço"><input id="f_os" name="os" /></Field>
        <Field label="Protocolo da locadora"><input id="f_protocolo" name="protocolo" /></Field>
        <Field label="Recebido por"><Select name="responsavel" options={usuarios.filter(u => u.ativo).map(u => u.nome)} value={me?.nome} /></Field>
        <Field label="Local"><Select name="local" options={areas.filter(a => a.ativa).map(a => a.nome)} value="Recepção" /></Field>
        <Field label="Serviço solicitado" col><textarea id="f_servico" name="servico" /></Field>
        <Field label="Observações" col><textarea id="f_obs" name="obs" /></Field>
      </Fg>
    </details>
  </>
}

export function useEntrada() {
  const sheet = useSheet(); const store = useStore(); const nav = useNav()
  return () => {
    if (!store.pode('entrada')) { sheet.toast(`O perfil ${store.me?.perfil} não pode registrar entradas.`); return }
    const id = crypto.randomUUID() // o mesmo id em reenvios: o banco não duplica
    sheet.open({
      title: 'Entrada de veículo', saveLabel: 'Salvar', body: <CorpoEntrada />,
      async onSave(f) {
        const placa = normPlaca(f.placa)
        if (!placaValida(placa)) return 'Informe uma placa válida, como ABC1D23 ou ABC1234.'
        let loc = f.loc
        if (f.nl_nome?.trim()) {
          const nome = f.nl_nome.trim().toUpperCase()
          const ex = store.locadoras.find(l => l.nome.toUpperCase() === nome)
          if (ex) loc = ex.id
          else {
            const { data, error } = await supabase.from('locadoras').insert({ nome, tipo: f.nl_tipo || 'Locadora', criado_por: store.me?.id }).select('id').single()
            if (error) return msgErro(error)
            loc = data.id
          }
        }
        if (!loc) return 'Escolha a locadora ou cadastre uma nova.'
        const v = numero(f.valor)
        if (f.valor && (v == null || v <= 0)) return 'Valor do orçamento inválido.'
        const { error } = await supabase.rpc('registrar_entrada', {
          p_id: id, p_placa: placa, p_locadora_id: loc, p_condutor: f.condutor ?? '', p_entrada: deInputLocal(f.entrada), p_valor: v,
          p_modelo: f.modelo ?? '', p_os: f.os ?? '', p_protocolo: f.protocolo ?? '', p_responsavel: f.responsavel ?? '',
          p_local: f.local ?? 'Recepção', p_servico: f.servico ?? '', p_obs: f.obs ?? '',
        })
        if (error) return msgErro(error)
        await store.recarregar()
        sheet.toast('Entrada registrada')
        nav.push({ r: 'at', id })
      },
    })
  }
}
