import { describe, expect, it } from 'vitest'
import { identificarModelo } from './veiculos'

const nome = (t: string) => identificarModelo(t)?.nome ?? null

describe('identificarModelo', () => {
  it('reconhece o modelo como foi cadastrado no pátio', () => {
    expect(nome('STRADA')).toBe('Fiat Strada')
    expect(nome('SAVEIRO')).toBe('Volkswagen Saveiro')
    expect(nome('OROCH')).toBe('Renault Oroch')
  })

  it('ignora marca, versão, acento e caixa', () => {
    expect(nome('Fiat Strada Freedom 1.3')).toBe('Fiat Strada')
    expect(nome('fiat doblò')).toBe('Fiat Doblò')
    expect(nome('VW T-Cross 200 TSI')).toBe('Volkswagen T-Cross')
  })

  it('prefere o apelido mais longo', () => {
    expect(nome('Corolla Cross XRE')).toBe('Toyota Corolla Cross')
    expect(nome('Corolla XEi')).toBe('Toyota Corolla')
    expect(nome('Hilux SW4')).toBe('Toyota SW4')
  })

  it('exige palavra inteira: nomes parecidos não se confundem', () => {
    expect(nome('GOLF')).toBe('Volkswagen Golf')
    expect(nome('GOL')).toBe('Volkswagen Gol')
    expect(nome('KARMANN GHIA')).toBeNull()
    expect(nome('2008')).toBeNull()
  })

  it('devolve nulo sem modelo ou com modelo fora da lista', () => {
    expect(nome('')).toBeNull()
    expect(nome('Fiat')).toBeNull()
    expect(nome('Lamborghini Urus')).toBeNull()
  })
})
