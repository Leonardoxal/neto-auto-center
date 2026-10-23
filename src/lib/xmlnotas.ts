// Leitura dos XMLs de NF-e (modelo 55) e NFS-e (padrão ABRASF usado em Tangará da Serra).
// Funciona no navegador e nos testes (só texto, sem DOM).

export interface NotaXML {
  chave: string; tipo: 'NF-e' | 'NFS-e'; numero: string; numero_rps: string; serie: string
  emissao: string; vencimento: string | null; cliente: string; cliente_doc: string; valor: number; iss: number
  descricao: string; placa: string; os: string; pedido: string; modelo: string; km: string; cond_pagamento: string; cancelada: boolean
  parcelas: { numero: number; vencimento: string; valor: number }[]
}

const tag = (t: string, nome: string) => { const m = t.match(new RegExp(`<(?:\\w+:)?${nome}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${nome}>`)); return m ? m[1].trim() : '' }
const bloco = (t: string, nome: string) => tag(t, nome)
const ent = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const n = (s: string) => { const x = parseFloat(s); return isNaN(x) ? 0 : Math.round(x * 100) / 100 }

/** Campos que o sistema de emissão escreve nas observações: PLACA, OS, PC, MODELO, KM, condição de pagamento */
export function camposObs(obs: string) {
  const p = (re: RegExp) => (obs.match(re)?.[1] ?? '').trim()
  const placa = p(/PLACA\s*:?\s*([A-Z]{3}-?\d[A-Z0-9]\d{2})/i).toUpperCase().replace('-', '')
  return {
    placa, os: p(/\bO\.?S\.?\s*:\s*([\w\-/.]+)/i), pedido: p(/\bPC\s*:\s*([\w\-/.]+)/i),
    modelo: p(/MODELO\s*:\s*([^;]*?)(?=\s+KM\s*:|;|$)/i), km: p(/\bKM\s*:\s*([\d.]+)/i),
    cond: p(/(?:C\.?\s*PAGTO|Cnd\.?\s*Pag)\s*:?\s*([^;\-]*?)(?=;|-|$)/i),
  }
}

/** parcelas a partir da condição: "30 DIAS" = 1; "28/56 DIAS" ou "30/60/90" = várias; "A VISTA" = no dia */
export function parcelasPorCondicao(emissaoISO: string, cond: string, total: number) {
  if (!emissaoISO) return []
  const dia = (k: number) => { const b = new Date(emissaoISO.slice(0, 10) + 'T12:00:00Z'); b.setUTCDate(b.getUTCDate() + k); return b.toISOString().slice(0, 10) }
  if (/VISTA/i.test(cond)) return [{ numero: 1, vencimento: dia(0), valor: total }]
  const prazos = (cond.match(/\d{1,3}(?:\s*\/\s*\d{1,3})*/)?.[0] ?? '').split('/').map(x => +x.trim()).filter(x => x > 0)
  if (!prazos.length) return []
  const cada = Math.floor((total / prazos.length) * 100) / 100
  return prazos.map((k, i) => ({ numero: i + 1, vencimento: dia(k), valor: i === prazos.length - 1 ? Math.round((total - cada * (prazos.length - 1)) * 100) / 100 : cada }))
}

/** vencimento a partir da condição "30 DIAS", "28/56 DIAS", "A VISTA" (usa o primeiro prazo) */
export function vencPorCondicao(emissaoISO: string, cond: string): string | null {
  if (!emissaoISO) return null
  if (/VISTA/i.test(cond)) return emissaoISO.slice(0, 10)
  const d = cond.match(/(\d{1,3})/)
  if (!d) return null
  const base = new Date(emissaoISO.slice(0, 10) + 'T12:00:00Z'); base.setUTCDate(base.getUTCDate() + +d[1])
  return base.toISOString().slice(0, 10)
}

export function lerXML(texto: string): NotaXML | null {
  const x = lerXMLbruto(texto)
  if (x && !x.parcelas.length) x.parcelas = parcelasPorCondicao(x.emissao, x.cond_pagamento, x.valor)
  if (x && !x.vencimento && x.parcelas.length) x.vencimento = x.parcelas[0].vencimento
  return x
}

function lerXMLbruto(texto: string): NotaXML | null {
  const t = texto.replace(/<Signature[\s\S]*?<\/Signature>/g, '')
  if (/<(?:\w+:)?(CompNfse|InfNfse)\b/.test(t)) {
    const numero = tag(t, 'Numero'), codv = tag(t, 'CodigoVerificacao'), em = tag(t, 'DataEmissao')
    const obs = ent(tag(t, 'Discriminacao') || tag(t, 'Observacao'))
    const tom = bloco(t, 'Tomador'), c = camposObs(obs)
    const emissao = em.length >= 19 ? em.slice(0, 19) + '-04:00' : em
    const status = tag(t, 'Status')
    return {
      chave: `NFSE-41750128000150-${numero}${codv ? '-' + codv : ''}`, tipo: 'NFS-e', numero, numero_rps: tag(t, 'IdentificacaoRps'), serie: 'NFS',
      emissao, vencimento: vencPorCondicao(emissao, c.cond), cliente: ent(tag(tom, 'RazaoSocial')),
      cliente_doc: (tag(tom, 'Cnpj') || tag(tom, 'Cpf')).replace(/\D/g, ''),
      valor: n(tag(t, 'ValorLiquido') || tag(t, 'ValorServicos')), iss: n(tag(t, 'ValorIss')),
      descricao: obs.split(';')[0].slice(0, 500), placa: c.placa, os: c.os, pedido: c.pedido, modelo: c.modelo, km: c.km, cond_pagamento: c.cond,
      cancelada: !!status && status !== '0' && status !== '1' ? true : !!tag(t, 'DescricaoCancelamento') || !!t.match(/<NfseCancelamento\b/),
      parcelas: [],
    }
  }
  if (/<(?:\w+:)?(nfeProc|NFe|infNFe)\b/.test(t)) {
    const ide = bloco(t, 'ide'), dest = bloco(t, 'dest'), inf = ent(tag(t, 'infCpl')), c = camposObs(inf)
    const chave = tag(t, 'chNFe') || (t.match(/Id="NFe(\d{44})"/)?.[1] ?? '')
    const cStat = tag(bloco(t, 'protNFe'), 'cStat')
    const prods = [...t.matchAll(/<det\b[\s\S]*?<\/det>/g)].map(m => {
      const d = m[0]; const q = parseFloat(tag(d, 'qCom')); return `${tag(d, 'xProd')}${q && q !== 1 ? ` (${q.toLocaleString('pt-BR')})` : ''}`
    })
    const emissao = tag(ide, 'dhEmi') || tag(ide, 'dEmi')
    return {
      chave: chave || `NFE-${tag(ide, 'serie')}-${tag(ide, 'nNF')}`, tipo: 'NF-e', numero: tag(ide, 'nNF'), numero_rps: '', serie: tag(ide, 'serie'),
      emissao, vencimento: tag(bloco(t, 'cobr'), 'dVenc') || vencPorCondicao(emissao, c.cond), cliente: ent(tag(dest, 'xNome')),
      cliente_doc: (tag(dest, 'CNPJ') || tag(dest, 'CPF')).replace(/\D/g, ''), valor: n(tag(bloco(t, 'ICMSTot'), 'vNF') || tag(t, 'vNF')), iss: 0,
      descricao: ent(prods.join(', ')).slice(0, 500), placa: c.placa, os: c.os, pedido: c.pedido, modelo: c.modelo, km: c.km, cond_pagamento: c.cond,
      cancelada: !!cStat && !['100', '150'].includes(cStat),
      parcelas: [...bloco(t, 'cobr').matchAll(/<dup\b[\s\S]*?<\/dup>/g)].map((m, i) => ({ numero: i + 1, vencimento: tag(m[0], 'dVenc'), valor: n(tag(m[0], 'vDup')) })).filter(p => p.vencimento && p.valor > 0),
    }
  }
  return null
}

/** Lê uma lista de arquivos (XML soltos ou ZIPs com XMLs). Devolve notas e nomes ignorados. */
export async function lerArquivos(files: File[]): Promise<{ notas: NotaXML[]; ignorados: string[] }> {
  const notas: NotaXML[] = [], ignorados: string[] = []
  const tratar = (nome: string, txt: string) => { const x = lerXML(txt); if (x && x.numero) notas.push(x); else ignorados.push(nome) }
  for (const f of files) {
    if (/\.zip$/i.test(f.name) || f.type.includes('zip')) {
      const { default: JSZip } = await import('jszip')
      const z = await JSZip.loadAsync(await f.arrayBuffer())
      for (const e of Object.values(z.files)) {
        if (e.dir) continue
        if (/\.xml$/i.test(e.name)) tratar(e.name, await e.async('string')); else ignorados.push(e.name)
      }
    } else if (/\.xml$/i.test(f.name)) tratar(f.name, await f.text())
    else ignorados.push(f.name)
  }
  const unicas = new Map(notas.map(x => [x.chave, x]))
  return { notas: [...unicas.values()], ignorados }
}
