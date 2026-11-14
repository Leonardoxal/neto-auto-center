import { describe, expect, it } from 'vitest'
import { centavos, classificarCliente, dataIso, ehConsumidor, lerEmAbertoXls, lerRelatorioTga, semConsumidores } from './tga'

// Fixtures sintéticas no formato de `pdftotext -raw` do TGA. Nomes, códigos e valores são inventados.
const BAIXADOS = `NETO AUTO CENTER - NETO AUTO CENTER
LANÇAMENTOS - A Receber - Baixados Emissão: 01/02/2027 08:00
Página 1
Histórico Emissao Dta.Venc Dt Baixa Documento PO TD Valor Orig Juros Desc. Multa Vlr Pago Atr
Cli/For: C00001 - CLIENTE TESTE UM - Tel: 00 00000000/ - CIDADE
REF PV 0000100 DE CLIENTE TESTE UM
05/01/26 05/02/26 10/02/26 0000100-1 DP 15,00 0,00 515,00 5
500,00 0,00
BAIXA PARCIAL DOC 0000100 DE CLIENTE TESTE UM
05/01/26 05/03/26 05/03/26 0000100-2 04 DP 0,00 10,00 190,00 0
200,00 0,00
-----------------------------------------------------------------------------------------
Total de C00001 - CLIENTE TESTE UM 700,00 15,00 705,00
10,00 0,00
Total sem devolução -> 705,00
Total de Devoluções -> 0,00
Cli/For: C00002 - CLIENTE TESTE DOIS - Tel: 00 00000000/ - CIDADE
DEVOLUCAO 01/03/26 01/03/26 02/03/26 03012026-1 DV 0,00 0,00 50,00 1
50,00 0,00
-----------------------------------------------------------------------------------------
Total de C00002 - CLIENTE TESTE DOIS 50,00 0,00 -50,00
0,00 0,00
Total sem devolução -> 0,00
Total de Devoluções -> 50,00
750,00 15,00 655,00
T O T A L G E R A L => 10,00 0,00
Total sem devolução -> 705,00
Total de Devoluções -> 50,00
Impresso por: USUARIO
`

describe('lerRelatorioTga: Baixados', () => {
  const r = lerRelatorioTga(BAIXADOS)

  it('identifica o relatório e lê só documento, datas, portador e valores', () => {
    expect(r.relatorio).toBe('baixados')
    expect(r.linhas).toHaveLength(3)
    expect(r.linhas[0]).toMatchObject({
      documento: '0000100-1', docNumero: '0000100', parcela: 1, emissao: '2026-01-05', vencimento: '2026-02-05', baixa: '2026-02-10',
      tipoDoc: 'DP', portador: '', original: 50000, juros: 1500, desconto: 0, multa: 0, pago: 51500, diasAtraso: 5, devolucao: false, confere: true
    })
    expect(r.linhas[0].clienteCodigo).toBe('C00001')
    expect(r.linhas[2].clienteCodigo).toBe('C00002')
    expect(r.clientes).toEqual({ C00001: 'CLIENTE TESTE UM', C00002: 'CLIENTE TESTE DOIS' })
    expect(JSON.stringify(r.linhas)).not.toMatch(/CLIENTE|Tel/) // nome e telefone ficam fora das linhas que vão ao banco
  })

  it('lê baixa parcial com desconto e portador', () => {
    expect(r.linhas[1]).toMatchObject({ documento: '0000100-2', portador: '04', original: 20000, desconto: 1000, pago: 19000, confere: true })
  })

  it('trata devolução: soma no original e subtrai do pago', () => {
    expect(r.linhas[2]).toMatchObject({ devolucao: true, original: 5000, pago: 5000 })
    expect(r.soma).toEqual({ original: 75000, juros: 1500, desconto: 1000, multa: 0, pago: 65500 })
  })

  it('confere linhas, clientes e rodapé sem divergência', () => {
    expect(r.rodape).toMatchObject({ original: 75000, pago: 65500, semDevolucao: 70500, devolucoes: 5000 })
    expect(r.divergencias).toEqual([])
    expect(r.avisos).toEqual([])
  })

  it('acusa divergência quando o total do rodapé não bate com as linhas', () => {
    const r2 = lerRelatorioTga(BAIXADOS.replace('750,00 15,00 655,00', '750,00 15,00 656,00'))
    expect(r2.divergencias.join()).toMatch(/Total geral: pago/)
  })

  it('acusa divergência quando falta uma linha em um cliente', () => {
    const r2 = lerRelatorioTga(BAIXADOS.replace(/BAIXA PARCIAL DOC[^\n]*\n[^\n]*\n[^\n]*\n/, ''))
    expect(r2.divergencias.join()).toMatch(/Cliente nº 1.*original/)
    expect(r2.divergencias.join()).toMatch(/Total geral/)
  })

  it('acusa rodapé ausente (arquivo incompleto)', () => {
    expect(lerRelatorioTga(BAIXADOS.split('750,00')[0]).divergencias.join()).toMatch(/Rodapé/)
  })

  it('aceita linha que não fecha a conta, mas marca confere=false e avisa', () => {
    const r2 = lerRelatorioTga(BAIXADOS.replace('0000100-1 DP 15,00 0,00 515,00 5', '0000100-1 DP 15,00 0,00 500,00 5'))
    expect(r2.linhas[0].confere).toBe(false)
    expect(r2.avisos.join()).toMatch(/não fecham a conta/)
  })

  it('juros com diferença de centavos no total do cliente é aviso, não bloqueio', () => {
    const r2 = lerRelatorioTga(BAIXADOS.replace('700,00 15,00 705,00', '700,00 15,01 705,00'))
    expect(r2.divergencias).toEqual([])
    expect(r2.avisos.join()).toMatch(/juros/)
  })

  it('linhas idênticas recebem chaves diferentes e a mesma exportação gera as mesmas chaves', () => {
    const repetida = BAIXADOS.replace(/(05\/01\/26 05\/02\/26 10\/02\/26 0000100-1 DP 15,00 0,00 515,00 5\n500,00 0,00\n)/, '$1$1')
    const a = lerRelatorioTga(repetida), b = lerRelatorioTga(repetida)
    const chaves = a.linhas.map(l => l.chave)
    expect(new Set(chaves).size).toBe(chaves.length)
    expect(chaves.filter(c => c.includes('0000100-1'))).toHaveLength(2)
    expect(b.linhas.map(l => l.chave)).toEqual(chaves)
  })

  it('a mesma linha em outra exportação mantém a chave (importar de novo não duplica)', () => {
    const outra = lerRelatorioTga(BAIXADOS.replace('Página 1', 'Página 2'))
    expect(outra.linhas.map(l => l.chave)).toEqual(r.linhas.map(l => l.chave))
  })
})

// O formato de Em Aberto ainda não foi verificado com PDF real: esta fixture segue a descrição do relatório (sem data de baixa).
describe('lerRelatorioTga: Em Aberto (formato presumido)', () => {
  const ABERTO = `NETO AUTO CENTER
LANÇAMENTOS - A Receber - Em Aberto Emissão: 01/02/2027
Cli/For: C00001 - CLIENTE TESTE UM - Tel: 00 00000000/ - CIDADE
REF PV 0000100 DE CLIENTE TESTE UM
05/01/26 05/02/26 0000100-3 DP 5,00 0,00 505,00 20
500,00
505,00 5,00 0,00
T O T A L G E R A L => 505,00
`
  it('lê datas, documento, valores e confere o total', () => {
    const r = lerRelatorioTga(ABERTO)
    expect(r.relatorio).toBe('em_aberto')
    expect(r.linhas).toHaveLength(1)
    expect(r.linhas[0]).toMatchObject({ documento: '0000100-3', baixa: null, vencimento: '2026-02-05', original: 50000, juros: 500, multa: 0, pago: 50500, diasAtraso: 20 })
    expect(r.divergencias).toEqual([])
  })
})

describe('lerEmAbertoXls', () => {
  // 46113 = 01/04/2026; valores com mais de duas casas, como a planilha do TGA traz
  const base = { cliente: 'C00001- CLIENTE TESTE UM', emissao: 46113, vencimento: 46113, doc: '0000727-1', portador: '', td: 'DP', original: 670, juros: 99.95328, multa: 0, total: 769.95328, dias: 227 }
  it('lê datas, códigos e valores em centavos e confere o rodapé', () => {
    const r = lerEmAbertoXls([base, { ...base, doc: '0000728-1', original: 100, juros: 0, total: 100, dias: 1 }], 869.95328)
    expect(r.relatorio).toBe('em_aberto')
    expect(r.linhas[0]).toMatchObject({ documento: '0000727-1', docNumero: '0000727', parcela: 1, emissao: '2026-04-01', vencimento: '2026-04-01', original: 67000, juros: 9995, pago: 76995, diasAtraso: 227, clienteCodigo: 'C00001', confere: true })
    expect(r.clientes).toEqual({ C00001: 'CLIENTE TESTE UM' })
    expect(r.divergencias).toEqual([])
  })
  it('acusa divergência se o total do rodapé não bate', () => {
    expect(lerEmAbertoXls([base], 800).divergencias.join()).toMatch(/Total geral/)
    expect(lerEmAbertoXls([base], null).divergencias.join()).toMatch(/Total geral/)
  })
  it('linhas repetidas ganham chaves diferentes', () => {
    const r = lerEmAbertoXls([base, base], 1539.90656)
    expect(r.linhas[0].chave).not.toBe(r.linhas[1].chave)
  })
})

describe('cliente consumidor', () => {
  it('reconhece o cadastro genérico, com ou sem ponto, acento ou espaço', () => {
    for (const n of ['CLIENTE', 'CLIENTE.', 'Cliente ', 'CLIENTE CONSUMIDOR', 'CONSUMIDOR FINAL']) expect(ehConsumidor(n)).toBe(true)
    for (const n of ['CLIENTE TESTE UM', 'JOAO DA SILVA', 'LOCALIZA FROTA']) expect(ehConsumidor(n)).toBe(false)
  })
  it('descarta as linhas do consumidor depois da conferência e refaz a soma', () => {
    const texto = BAIXADOS.replace('CLIENTE TESTE DOIS', 'CLIENTE CONSUMIDOR')
    const r = lerRelatorioTga(texto)
    expect(r.divergencias).toEqual([]) // o arquivo inteiro confere
    const s = semConsumidores(r)
    expect(s.linhas.map(l => l.clienteCodigo)).toEqual(['C00001', 'C00001'])
    expect(s.clientes).toEqual({ C00001: 'CLIENTE TESTE UM' })
    expect(s.descartadas).toEqual({ linhas: 1, pago: -5000 })
    expect(s.soma.pago).toBe(70500)
  })
})

describe('classificarCliente', () => {
  const locadoras = [{ id: 'loc-localiza', nome: 'LOCALIZA' }, { id: 'loc-cs', nome: 'CSBRASIL' }, { id: 'loc-ticket', nome: 'TICKETLOG' }, { id: 'loc-x', nome: 'AB' }]
  it('qualquer nome com Localiza é Localiza, sem importar acento, espaço ou filial', () => {
    expect(classificarCliente('LOCALIZA FROTA S.A. - FILIAL CUIABA', locadoras)).toEqual({ tipo: 'locadora', locadora_id: 'loc-localiza' })
    expect(classificarCliente('Localiza Rent a Car', locadoras).locadora_id).toBe('loc-localiza')
  })
  it('ignora espaço no nome da locadora', () => {
    expect(classificarCliente('CS BRASIL TRANSPORTES', locadoras).locadora_id).toBe('loc-cs')
    expect(classificarCliente('TICKET LOG', locadoras).locadora_id).toBe('loc-ticket')
  })
  it('o restante é particular, e nome muito curto de locadora não classifica ninguém', () => {
    expect(classificarCliente('JOAO DA SILVA', locadoras)).toEqual({ tipo: 'particular', locadora_id: null })
    expect(classificarCliente('CLIENTE ABC LTDA', locadoras).tipo).toBe('particular')
  })
})

describe('conversões', () => {
  it('converte dinheiro brasileiro em centavos inteiros', () => {
    expect(centavos('2.917,00')).toBe(291700)
    expect(centavos('0,07')).toBe(7)
    expect(centavos('-1.951,81')).toBe(-195181)
    expect(Object.is(centavos('-0,00'), 0)).toBe(true)
  })
  it('converte data de dois dígitos de ano', () => { expect(dataIso('09/03/26')).toBe('2026-03-09') })
})
