// node ask.mjs [arquivo.pptx] ["pergunta"]
// Test 1: send the .pptx as it is (input_file). Test 2: send what read-pptx.mjs extracted (text + pictures).
// The key comes from OPENAI_API_KEY or from ../rabiscadraw/.env; it is never printed.
import { readFile } from 'node:fs/promises'
import { readPptx } from './read-pptx.mjs'

async function loadKey() {
  if (process.env.OPENAI_API_KEY) return { key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || 'gpt-5.6-luna' }
  const env = Object.fromEntries((await readFile(new URL('../rabiscadraw/.env', import.meta.url), 'utf8')).split(/\r?\n/).map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]))
  return { key: env.OPENAI_API_KEY, model: env.OPENAI_MODEL || 'gpt-5.6-luna' }
}

const file = process.argv[2] ?? 'sample/teste.pptx'
const question = process.argv[3] ?? 'Descreva cada slide. Para os que tem imagem, diga o que a imagem mostra, com os numeros e textos que aparecem nela.'
const { key, model } = await loadKey()
if (!key) throw new Error('Sem OPENAI_API_KEY.')

async function call(input) {
  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, input }),
    signal: AbortSignal.timeout(180_000),
  })
  const d = await r.json()
  if (!r.ok) return { error: String(d?.error?.message ?? r.status).replace(/sk-[\w*-]+/g, 'sk-…') }
  const text = (d.output ?? []).flatMap((o) => (o.type === 'message' ? o.content : [])).filter((c) => c.type === 'output_text').map((c) => c.text).join('\n')
  return { text, usage: d.usage }
}

console.log(`modelo: ${model}\n`)

console.log('=== TESTE 1: mandar o .pptx cru (input_file) ===')
const raw = await readFile(file)
const t1 = await call([{ role: 'user', content: [
  { type: 'input_file', filename: file.split('/').pop(), file_data: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${raw.toString('base64')}` },
  { type: 'input_text', text: question },
] }])
console.log(t1.error ? `ERRO: ${t1.error}` : t1.text, '\n')

console.log('=== TESTE 2: extrair slides (texto + imagens) e mandar ===')
const slides = await readPptx(file)
const content = []
for (const s of slides) {
  content.push({ type: 'input_text', text: [`--- Slide ${s.n} ---`, s.text.length ? `Texto: ${s.text.join(' | ')}` : 'Sem texto.', s.notes.length ? `Notas do apresentador: ${s.notes.join(' ')}` : '', ...s.charts.map((c) => `Grafico nativo (dados): ${JSON.stringify(c)}`), s.skipped.length ? `Imagens em formato nao suportado: ${s.skipped.join(', ')}` : ''].filter(Boolean).join('\n') })
  for (const im of s.images) content.push({ type: 'input_image', image_url: `data:${im.mime};base64,${im.b64}` })
}
content.push({ type: 'input_text', text: question })
console.log(`${slides.length} slides, ${slides.reduce((n, s) => n + s.images.length, 0)} imagens enviadas`)
const t2 = await call([{ role: 'user', content }])
console.log(t2.error ? `ERRO: ${t2.error}` : t2.text)
if (t2.usage) console.log('\ntokens:', JSON.stringify({ entrada: t2.usage.input_tokens, saida: t2.usage.output_tokens }))
