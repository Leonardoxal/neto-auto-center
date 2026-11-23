import { useCallback, useEffect, useState } from 'react'
import { supabase, msgErro } from '../lib/supabase'
import { fData } from '../lib/format'
import { avisoCertificado, botaoBusca, proximaBusca, situacaoConector, type Situacao, type StatusConector } from '../lib/conectorCompras'
import { Nav, Note } from '../ui/ui'

interface NotaCompra {
  chave: string; numero: string; serie: string; emissao: string; fornecedor: string; valor: string
}

// O valor chega como decimal em texto; a apresentação não calcula valores fiscais.
export function valorCompra(valor: string) {
  const [inteiro, centavos = '00'] = valor.split('.')
  return `R$ ${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${centavos.padEnd(2, '0')}`
}

function textoVazio(sit: Situacao, proxima: string | null, painel: boolean) {
  if (!painel) return 'Nenhuma nota disponível. O painel do conector fiscal ainda não foi ativado no banco.'
  if (sit.tipo === 'nunca') return 'Nenhuma nota disponível. O conector fiscal ainda não foi instalado.'
  if (sit.tipo === 'desligado') return 'Nenhuma nota disponível. O computador da oficina está desligado: as notas aparecem quando ele voltar.'
  if (sit.tipo === 'erro') return 'Nenhuma nota disponível. A busca está com problema (veja o aviso acima).'
  return proxima ? `Nenhuma nota disponível. Próxima busca permitida às ${proxima}.` : 'Nenhuma nota disponível. A busca está em andamento.'
}

interface PainelProps { status: StatusConector | null; agora: number; aoVivo: boolean; mensagem: string; onBuscar: () => void }

function PainelConector({ status, agora, aoVivo, mensagem, onBuscar }: PainelProps) {
  const sit = situacaoConector(status, agora)
  const certificado = avisoCertificado(status, agora)
  const botao = botaoBusca(status, agora)
  const proxima = proximaBusca(status, agora)
  return <div className="group" role="region" aria-label="Conector fiscal">
    <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
      <div className="rm">
        <b role="status">{sit.texto}</b>
        <span className="r2">{proxima ? `Próxima busca permitida às ${proxima}. ` : ''}A SEFAZ limita a frequência das consultas.</span>
      </div>
      {status?.ambiente === 'homologacao' && <span className="pill o">teste</span>}
      <span className={`pill ${aoVivo ? 'g' : 'y'}`}>{aoVivo ? 'ao vivo' : 'reconectando…'}</span>
      <button type="button" className="btn sm" disabled={!botao.habilitado} onClick={onBuscar}>{botao.rotulo}</button>
    </div>
    {certificado && <div className="row" role="alert">{certificado}</div>}
    {sit.tipo === 'nunca' && <div className="row"><div className="rm">
      <b>Como ligar a busca de notas</b>
      <ol className="r2" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
        <li>No computador da oficina, guarde o arquivo do certificado digital (.pfx) numa pasta fora do OneDrive.</li>
        <li>Em <code>bot/.env</code>, preencha <code>CERT_PFX_CAMINHO</code> e <code>CERT_PFX_SENHA</code>.</li>
        <li>Confira com <code>npm run certificado</code> (mostra só titular, CNPJ e validade).</li>
        <li>Reinicie o robô: o conector liga junto e esta tela passa a mostrar "Conectado".</li>
      </ol>
    </div></div>}
    {mensagem && <div className="row" role="status">{mensagem}</div>}
  </div>
}

export function Compras() {
  const [notas, setNotas] = useState<NotaCompra[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [status, setStatus] = useState<StatusConector | null>(null)
  const [painel, setPainel] = useState(true) // falso se a função do painel ainda não existe no banco
  const [desvio, setDesvio] = useState(0) // relógio do servidor menos o do aparelho, em ms
  const [aoVivo, setAoVivo] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [, passou] = useState(0)

  const carregar = useCallback(async (signal: AbortSignal) => {
    try {
      const lista: NotaCompra[] = []
      for (let inicio = 0; ; inicio += 1000) {
        const { data, error } = await supabase.rpc('listar_notas_compra').range(inicio, inicio + 999).abortSignal(signal)
        if (signal.aborted) return
        if (error) throw error
        lista.push(...((data ?? []) as NotaCompra[]))
        if (!data || data.length < 1000) break
      }
      if (signal.aborted) return
      setNotas(lista); setErro('')
    } catch (e) {
      if (signal.aborted) return
      setNotas([]); setErro(msgErro(e))
    } finally { if (!signal.aborted) setCarregando(false) }
  }, [])

  const carregarStatus = useCallback(async (signal: AbortSignal) => {
    const { data, error } = await supabase.rpc('status_conector_compras').abortSignal(signal)
    if (signal.aborted) return
    if (error) { setPainel(false); return }
    const linha = ((data ?? [])[0] ?? null) as StatusConector | null
    setPainel(true); setStatus(linha)
    if (linha) setDesvio(Date.parse(linha.agora) - Date.now())
  }, [])

  useEffect(() => {
    let controller = new AbortController()
    const atualizar = () => {
      controller.abort(); controller = new AbortController()
      void carregar(controller.signal); void carregarStatus(controller.signal)
    }
    atualizar()
    // Reserva para quando a conexão em tempo real cair: consulta a cada 30 s e ao voltar à aba.
    const timer = window.setInterval(atualizar, 30000)
    const relogio = window.setInterval(() => passou(n => n + 1), 15000) // reavalia "Libera às…" e "desligado"
    const visivel = () => { if (document.visibilityState === 'visible') atualizar() }
    document.addEventListener('visibilitychange', visivel)
    // Aviso "mudou" (sem dados da nota) vindo do banco; a tela busca de novo as duas listas.
    let espera: number | undefined
    const canal = supabase.channel('compras', { config: { private: true } })
      .on('broadcast', { event: 'mudou' }, () => { window.clearTimeout(espera); espera = window.setTimeout(atualizar, 300) })
      .subscribe(estado => setAoVivo(estado === 'SUBSCRIBED'))
    return () => {
      controller.abort(); window.clearInterval(timer); window.clearInterval(relogio); window.clearTimeout(espera)
      document.removeEventListener('visibilitychange', visivel)
      void supabase.removeChannel(canal)
    }
  }, [carregar, carregarStatus])

  const buscarAgora = async () => {
    setMensagem('')
    const { error } = await supabase.rpc('pedir_busca_compras')
    setMensagem(error ? msgErro(error) : 'Busca pedida. O conector atende em até 1 minuto, se a SEFAZ permitir.')
  }

  const agora = Date.now() + desvio
  const sit = situacaoConector(status, agora)

  return <>
    <Nav title="Notas de compra" />
    <section className="sec" aria-live="polite" aria-busy={carregando}>
      {painel && <PainelConector status={status} agora={agora} aoVivo={aoVivo} mensagem={mensagem} onBuscar={() => void buscarAgora()} />}
      <Note>As notas saem desta lista e são apagadas do site quando a entrada no TGA é identificada, quando a SEFAZ registra o cancelamento ou quando completam um ano da emissão.</Note>
      {erro ? <div className="banner" role="alert">Não foi possível consultar as notas de compra. Tente novamente em instantes.</div>
        : carregando ? <p>Consultando notas…</p>
        : notas.length === 0 ? <div className="group"><div className="row">{textoVazio(sit, proximaBusca(status, agora), painel)}</div></div>
        : <div className="group">{notas.map(n => <article key={n.chave} className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div className="rm"><b>{n.fornecedor}</b><span className="r2">NF-e {n.numero} · série {n.serie} · {fData(n.emissao)}</span></div>
          <strong>{valorCompra(n.valor)}</strong>
        </article>)}</div>}
    </section>
  </>
}
