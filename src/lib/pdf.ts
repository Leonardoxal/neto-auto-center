// Gera o relatório em PDF no próprio aparelho (nada é enviado ao servidor) e oferece Encaminhar.
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { delta, fmtCard, type Relatorio } from './relatorios'
import { fDataHora } from './format'

// As fontes padrão do PDF cobrem Latin-1; troca o resto por equivalentes.
const txt = (v: unknown) => String(v ?? '').replace(/[—–]/g, '-').replace(/→/g, '->').replace(/−/g, '-').replace(/[^\x00-\xFF]/g, '')

export interface InfoPDF { titulo: string; periodo: string; filtros: string; usuario: string; perfil: string }

export function gerarPDF(r: Relatorio, prev: Relatorio, info: InfoPDF): Blob {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 12
  const RED: [number, number, number] = [211, 36, 42], INK: [number, number, number] = [18, 18, 20], GR: [number, number, number] = [107, 107, 114], LINE: [number, number, number] = [226, 226, 230]
  doc.setFillColor(...INK); doc.rect(0, 0, W, 24, 'F')
  doc.setFillColor(...RED); doc.roundedRect(M, 6.5, 11, 11, 2, 2, 'F')
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('N', M + 5.5, 14.2, { align: 'center' })
  doc.setFontSize(13); doc.text('NETO AUTO CENTER', M + 15, 11.5)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(200, 200, 205); doc.text(txt('Gestão Operacional'), M + 15, 16.5)
  doc.text(txt(`Gerado em ${fDataHora(new Date())} por ${info.usuario} (${info.perfil})`), W - M, 11.5, { align: 'right' })
  doc.text('Fuso: Tangara da Serra (UTC-4)', W - M, 16.5, { align: 'right' })
  doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.text(txt(info.titulo), M, 35)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...GR); doc.text(txt(`Período: ${info.periodo}   ·   ${info.filtros}`), M, 41)

  const perRow = Math.min(4, r.cards.length), gap = 4, cw = (W - 2 * M - gap * (perRow - 1)) / perRow, ch = 19
  let y = 47
  r.cards.forEach(([l, v, f], i) => {
    const x = M + (i % perRow) * (cw + gap), yy = y + Math.floor(i / perRow) * (ch + gap)
    doc.setDrawColor(...LINE); doc.setFillColor(247, 247, 250); doc.roundedRect(x, yy, cw, ch, 2.5, 2.5, 'FD')
    doc.setFontSize(8); doc.setTextColor(...GR); doc.text(txt(l), x + 4, yy + 5.5, { maxWidth: cw - 8 })
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...INK); doc.text(txt(fmtCard(v, f)), x + 4, yy + 12.2)
    const d = l.includes('(hoje)') ? { txt: 'situação atual' } : delta(v, prev.cards[i]?.[1] ?? null, f === 'd')
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GR); doc.text(txt(d?.txt ?? 'sem comparação'), x + 4, yy + 16.5)
  })
  y += Math.ceil(r.cards.length / perRow) * (ch + gap) + 3

  const tabelas = [...(r.pre ?? []), r.main]
  let finalY = y
  tabelas.forEach((tb, ti) => {
    if (ti) { y = finalY + 10; if (y > H - 40) { doc.addPage(); y = 22 } }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...INK); doc.text(txt(`${tb.title} · ${tb.rows.length} linhas`), M, y)
    if (!tb.rows.length) { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...GR); doc.text(txt('Sem registros no período.'), M, y + 8); finalY = y + 8; return }
    autoTable(doc, {
      startY: y + 3, head: [tb.cols.map(txt)], body: tb.rows.map(row => row.map(txt)), margin: { left: M, right: M, top: 16, bottom: 14 }, theme: 'grid',
      styles: { font: 'helvetica', fontSize: 7.6, cellPadding: 1.8, textColor: INK, lineColor: LINE, lineWidth: 0.15, overflow: 'linebreak' },
      headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: [248, 248, 250] },
      didParseCell(d) {
        if (d.section !== 'body') return
        if (d.column.index === (tb.placaCol ?? 0)) d.cell.styles.fontStyle = 'bold'
        const s = String(d.cell.raw)
        if (/Pendente|Recusad|Cancelad|Ainda/.test(s) || /^-\d/.test(s)) d.cell.styles.textColor = RED
        if (/^\+\d/.test(s)) d.cell.styles.textColor = [30, 138, 60]
      },
      didDrawPage(d) { if (d.pageNumber > 1) { doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...INK); doc.text(txt(`NETO AUTO CENTER · ${info.titulo} · ${info.periodo}`), M, 10) } },
    })
    finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  })
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setDrawColor(...LINE); doc.line(M, H - 10, W - M, H - 10)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GR)
    doc.text(txt('Cada indicador usa a data do próprio evento (entrada, saída, aprovação, negociação ou emissão da nota). Consulta o histórico completo, não só o pátio ativo.'), M, H - 5.5)
    doc.text(`Pagina ${i} de ${n}`, W - M, H - 5.5, { align: 'right' })
  }
  return doc.output('blob')
}

export function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a')
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/** Abre o menu de compartilhar do aparelho com o arquivo anexado. Devolve 'ok' | 'cancelado' | 'sem-suporte'. */
export async function encaminhar(blob: Blob, nome: string, titulo: string, texto: string): Promise<'ok' | 'cancelado' | 'sem-suporte'> {
  const file = new File([blob], nome, { type: blob.type || 'application/pdf' })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (!nav.share || !nav.canShare?.({ files: [file] })) return 'sem-suporte'
  try { await nav.share({ files: [file], title: titulo, text: texto }); return 'ok' }
  catch (e) { return (e as Error).name === 'AbortError' ? 'cancelado' : 'sem-suporte' }
}
