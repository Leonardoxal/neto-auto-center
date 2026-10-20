import { useState } from 'react'
import type { Atendimento } from '../lib/domain'
import { abrir, enviarAnexos, kb, remover, type Anexo } from '../lib/anexos'
import { fDataHora } from '../lib/format'
import { useStore } from '../lib/store'
import { Field, Fg, Ic, Section, useSheet } from '../ui/ui'

export function AnexosSecao({ a, anexos }: { a: Atendimento; anexos: Anexo[] }) {
  const store = useStore(); const sheet = useSheet()
  const [enviando, setEnviando] = useState(false)
  const ativos = anexos.filter(x => !x.removido_em), removidos = anexos.filter(x => x.removido_em)
  const podeEnviar = store.pode('orcamento'), podeApagar = store.pode('arquivar')
  async function enviar(files: File[]) {
    if (!files.length) return
    setEnviando(true)
    const erros = await enviarAnexos(a.id, files)
    await store.recarregar(); setEnviando(false)
    sheet.toast(erros.length ? erros.join(' ') : `${files.length} anexo(s) enviado(s)`)
  }
  return <Section title={`Anexos${ativos.length ? ` (${ativos.length})` : ''}`}
    right={podeEnviar ? <label className="tbtn" style={{ cursor: 'pointer' }}>{enviando ? 'Enviando…' : '+ Anexar'}
      <input type="file" multiple accept="application/pdf,image/*" style={{ display: 'none' }} disabled={enviando}
        onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ''; enviar(f) }} /></label> : undefined}
    foot={removidos.length ? `${removidos.length} arquivo(s) já removido(s) pela limpeza ou manualmente; o registro continua no histórico.` : undefined}>
    {!ativos.length ? <div className="group"><div className="empty">Nenhum anexo. Anexe o PDF do orçamento ou um print.</div></div>
      : <div className="group">{ativos.map(x => <div key={x.id} className="row">
        <span className="act" style={{ padding: 0, background: 'none' }}><span className="ib"><Ic n={x.tipo === 'application/pdf' ? 'receipt' : 'grid'} /></span></span>
        <button className="rm" style={{ textAlign: 'left' }} onClick={() => abrir(x).catch(e => sheet.toast('Não foi possível abrir: ' + e.message))}>
          <b style={{ color: 'var(--red)' }}>{x.nome}</b>
          <span className="r2">{kb(x.tamanho)} · {x.criado_por_nome} · {fDataHora(x.criado_em)}</span></button>
        {podeApagar && <button className="btn ghost sm" onClick={() => sheet.open({ title: 'Apagar anexo', saveLabel: 'Apagar', done: 'Anexo apagado',
          body: <><div className="hint bad">{x.nome} será apagado. O registro de que existiu fica no histórico.</div><Fg><Field label="Motivo"><input name="m" placeholder="Opcional" /></Field></Fg></>,
          onSave: async f => { const e = await remover(x, f.m ?? ''); if (e) return e; await store.recarregar() } })}>Apagar</button>}
      </div>)}</div>}
  </Section>
}
