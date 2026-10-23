import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { lerXML, camposObs, vencPorCondicao, parcelasPorCondicao } from './xmlnotas'

const pasta = process.env.XML_DIR || '/tmp/claude-0/-home-claude/8a8092ed-4310-516e-8a4a-a9733b846405/scratchpad'
const arquivos = fs.existsSync(pasta) ? (fs.readdirSync(pasta, { recursive: true }) as string[]).filter(f => f.endsWith('.xml')).map(f => path.join(pasta, f)) : []

describe('campos das observações', () => {
  it('lê placa, OS, PC, modelo, km e condição', () => {
    const c = camposObs('MAO DE OBRA(R$450,00);OS:37632 PLACA:QBF7898 MODELO:ATEGO1729TRIELB KM:7344613 C.PAGTO: 30 DIAS')
    expect(c).toMatchObject({ placa: 'QBF7898', os: '37632', modelo: 'ATEGO1729TRIELB', km: '7344613', cond: '30 DIAS' })
    expect(camposObs('Oper:LEONARDO-Vend:031-NETTO-Cnd.Pag:30 DIAS;PC:4309872062 PLACA:TXW1H05 MODELO:STRADA KM:29875;PROCON').pedido).toBe('4309872062')
  })
  it('vencimento por condição', () => {
    expect(vencPorCondicao('2026-10-06T20:33:01-04:00', '30 DIAS')).toBe('2026-11-05')
    expect(vencPorCondicao('2026-10-06T10:00:00-04:00', 'A VISTA')).toBe('2026-10-06')
  })
  it('parcelas 28/56 dividem o valor e somam o total', () => {
    const p = parcelasPorCondicao('2026-10-01T10:00:00-04:00', '28/56 DIAS', 1000.01)
    expect(p.map(x => x.vencimento)).toEqual(['2026-10-29', '2026-11-26'])
    expect(p[0].valor + p[1].valor).toBeCloseTo(1000.01)
  })
})

describe.skipIf(!arquivos.length)('XMLs reais', () => {
  const notas = arquivos.map(f => lerXML(fs.readFileSync(f, 'utf8'))!)
  it('lê todos os arquivos', () => { expect(notas.every(Boolean)).toBe(true) })
  it('totais batem', () => {
    const tot = (t: string) => Math.round(notas.filter(x => x.tipo === t).reduce((s, x) => s + x.valor, 0) * 100) / 100
    expect(tot('NFS-e')).toBe(41986.85); expect(tot('NF-e')).toBe(87989.4)
  })
  it('chaves únicas e campos principais preenchidos', () => {
    expect(new Set(notas.map(x => x.chave)).size).toBe(notas.length)
    expect(notas.every(x => x.cliente && x.emissao && x.numero)).toBe(true)
    expect(notas.filter(x => x.placa).length).toBe(80)
  })
  it('toda nota a prazo tem parcelas que somam o valor', () => {
    const com = notas.filter(x => x.parcelas.length)
    expect(com.length).toBeGreaterThan(90)
    for (const x of com) expect(Math.abs(x.parcelas.reduce((s, p) => s + p.valor, 0) - x.valor)).toBeLessThan(0.02)
  })
})
