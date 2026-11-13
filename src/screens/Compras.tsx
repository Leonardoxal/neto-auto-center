import { useCallback, useEffect, useState } from 'react'
import { supabase, msgErro } from '../lib/supabase'
import { fData } from '../lib/format'
import { Nav, Note } from '../ui/ui'

interface NotaCompra {
  chave: string; numero: string; serie: string; emissao: string; fornecedor: string; valor: string
}

// O valor chega como decimal em texto; a apresentação não calcula valores fiscais.
export function valorCompra(valor: string) {
  const [inteiro, centavos = '00'] = valor.split('.')
  return `R$ ${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${centavos.padEnd(2, '0')}`
}

export function Compras() {
  const [notas, setNotas] = useState<NotaCompra[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
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

  useEffect(() => {
    let controller = new AbortController()
    const atualizar = () => {
      controller.abort(); controller = new AbortController()
      void carregar(controller.signal)
    }
    atualizar()
    const timer = window.setInterval(atualizar, 30000)
    const visivel = () => { if (document.visibilityState === 'visible') atualizar() }
    document.addEventListener('visibilitychange', visivel)
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', visivel) }
  }, [carregar])

  return <>
    <Nav title="Notas de compra" />
    <section className="sec" aria-live="polite" aria-busy={carregando}>
      <Note>As notas saem desta lista e são apagadas do site quando a entrada no TGA é identificada ou quando completam um ano da emissão.</Note>
      {erro ? <div className="banner" role="alert">Não foi possível consultar as notas de compra. Tente novamente em instantes.</div>
        : carregando ? <p>Consultando notas…</p>
        : notas.length === 0 ? <div className="group"><div className="row">Nenhuma nota disponível. A busca automática depende da conexão com o serviço fiscal.</div></div>
        : <div className="group">{notas.map(n => <article key={n.chave} className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div className="rm"><b>{n.fornecedor}</b><span className="r2">NF-e {n.numero} · série {n.serie} · {fData(n.emissao)}</span></div>
          <strong>{valorCompra(n.valor)}</strong>
        </article>)}</div>}
    </section>
  </>
}
