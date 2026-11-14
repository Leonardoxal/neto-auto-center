import { useState } from 'react'
import { Seg } from '../ui/ui'
import { Cobrancas } from './Cobrancas'
import { Compras } from './Compras'
import { Notas } from './Notas'

// Financeiro: notas fiscais de venda (locadoras, por nota), notas de compra e cobranças (particulares, por PV) na mesma aba.
export function Financeiro() {
  const [aba, setAba] = useState<'notas' | 'cobrancas' | 'compras'>('notas')
  return <>
    <div className="stack" style={{ padding: '12px 16px 0' }}>
      <Seg value={aba} onChange={setAba} options={[['notas', 'Notas fiscais'], ['cobrancas', 'Cobranças'], ['compras', 'Compras']]} />
    </div>
    {aba === 'notas' ? <Notas /> : aba === 'cobrancas' ? <Cobrancas /> : <Compras />}
  </>
}
