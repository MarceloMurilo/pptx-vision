// Builds sample/teste.pptx: text, two pictures, a native chart (data lives in XML, not in an image) and speaker notes.
import pptxgen from 'pptxgenjs'

const p = new pptxgen()
p.layout = 'LAYOUT_WIDE'

let s = p.addSlide()
s.addText('Revisao trimestral de produto', { x: 0.7, y: 1.2, w: 11, h: 1, fontSize: 36, bold: true })
s.addText('Time de Plataforma · Q3', { x: 0.7, y: 2.4, w: 11, h: 0.6, fontSize: 20 })

s = p.addSlide()
s.addText('Retencao', { x: 0.5, y: 0.3, w: 8, h: 0.7, fontSize: 28, bold: true })
s.addImage({ path: 'sample/grafico.png', x: 1.5, y: 1.2, w: 9, h: 5.2 })
s.addNotes('Nao comentar o numero do Oeste com o cliente.')

s = p.addSlide()
s.addText('Plano de migracao', { x: 0.5, y: 0.3, w: 8, h: 0.7, fontSize: 28, bold: true })
s.addImage({ path: 'sample/diagrama.png', x: 1.5, y: 1.3, w: 9, h: 4.2 })

s = p.addSlide()
s.addText('Receita (grafico nativo)', { x: 0.5, y: 0.3, w: 8, h: 0.7, fontSize: 28, bold: true })
s.addChart(p.charts.BAR, [{ name: 'Receita (R$ mi)', labels: ['Jul', 'Ago', 'Set'], values: [3.2, 4.8, 7.1] }], { x: 1.5, y: 1.3, w: 9, h: 5, showValue: true, showTitle: false })

await p.writeFile({ fileName: 'sample/teste.pptx' })
console.log('sample/teste.pptx ok')
