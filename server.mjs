// node server.mjs  ->  http://localhost:5180
// Drop a .pptx on the page: the server extracts text, notes, chart data and pictures, asks the model and answers.
// The OpenAI key is read from OPENAI_API_KEY or ../rabiscadraw/.env and never leaves this process.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { readPptx } from './read-pptx.mjs'

const PORT = 5180
const MAX = 60 * 1024 * 1024

async function loadKey() {
  if (process.env.OPENAI_API_KEY) return { key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || 'gpt-5.6-luna' }
  const env = Object.fromEntries((await readFile(new URL('../rabiscadraw/.env', import.meta.url), 'utf8')).split(/\r?\n/).map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]))
  return { key: env.OPENAI_API_KEY, model: env.OPENAI_MODEL || 'gpt-5.6-luna' }
}
const cfg = await loadKey().catch(() => ({}))

async function ask(input) {
  const t0 = Date.now()
  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({ model: cfg.model, input }),
    signal: AbortSignal.timeout(240_000),
  })
  const d = await r.json()
  if (!r.ok) throw new Error(String(d?.error?.message ?? r.status).replace(/sk-[\w*-]+/g, 'sk-…'))
  const text = (d.output ?? []).flatMap((o) => (o.type === 'message' ? o.content : [])).filter((c) => c.type === 'output_text').map((c) => c.text).join('\n')
  return { text, seconds: Math.round((Date.now() - t0) / 100) / 10, tokens: { entrada: d.usage?.input_tokens, saida: d.usage?.output_tokens } }
}

const body = (req) => new Promise((res, rej) => {
  const parts = []; let n = 0
  req.on('data', (c) => { n += c.length; if (n > MAX) { rej(new Error('Arquivo grande demais (máx. 60 MB).')); req.destroy() } else parts.push(c) })
  req.on('end', () => res(Buffer.concat(parts)))
  req.on('error', rej)
})
const json = (res, status, v) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(v)) }

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      return res.end(await readFile(new URL('./index.html', import.meta.url)))
    }
    if (req.method === 'GET' && url.pathname === '/status') return json(res, 200, { ok: !!cfg.key, model: cfg.model ?? null })
    if (req.method === 'POST' && url.pathname === '/analyze') {
      if (!cfg.key) return json(res, 503, { error: 'Sem OPENAI_API_KEY (variável de ambiente ou ../rabiscadraw/.env).' })
      const question = decodeURIComponent(String(req.headers['x-question'] ?? '')).slice(0, 2000) || 'Descreva cada slide e o que as imagens mostram.'
      const sendImages = req.headers['x-images'] !== '0'
      const bytes = await body(req)
      let slides
      try { slides = await readPptx(bytes) } catch { return json(res, 400, { error: 'Não consegui abrir o arquivo. É um .pptx válido (não .ppt antigo)?' }) }
      if (!slides.length) return json(res, 400, { error: 'O arquivo não tem slides.' })
      const build = (bad = new Set()) => {
        const content = []
        for (const s of slides) {
          content.push({ type: 'input_text', text: [`--- Slide ${s.n} ---`, s.text.length ? `Texto: ${s.text.join(' | ')}` : 'Sem texto.', s.notes.length ? `Notas do apresentador: ${s.notes.join(' ')}` : '', ...s.charts.map((c) => `Gráfico nativo (dados): ${JSON.stringify(c)}`), s.skipped.length ? `Imagens que não puderam ser enviadas: ${s.skipped.join(', ')}` : ''].filter(Boolean).join('\n') })
          if (sendImages) for (const im of s.images) if (!bad.has(im)) content.push({ type: 'input_image', image_url: `data:${im.mime};base64,${im.b64}` })
        }
        content.push({ type: 'input_text', text: question })
        return [{ role: 'user', content }]
      }
      let answer
      const dropped = []
      try {
        answer = await ask(build())
      } catch (e) {
        if (!sendImages || !/valid image|image data/i.test(String(e.message))) throw e
        // the API refused one of the pictures: find which, leave it out and say so
        const bad = new Set()
        for (const s of slides) for (const im of s.images) {
          try { await ask([{ role: 'user', content: [{ type: 'input_image', image_url: `data:${im.mime};base64,${im.b64}` }, { type: 'input_text', text: 'ok?' }] }]) }
          catch { bad.add(im); dropped.push(`slide ${s.n}: ${im.name}`) }
        }
        if (!bad.size) throw e
        answer = await ask(build(bad))
      }
      return json(res, 200, {
        model: cfg.model, ...answer, sentImages: sendImages, dropped,
        slides: slides.map((s) => ({ n: s.n, text: s.text, notes: s.notes, charts: s.charts, skipped: s.skipped, images: s.images.map((i) => ({ repaired: !!i.repaired, name: i.name, kb: Math.round(i.bytes / 1024), src: `data:${i.mime};base64,${i.b64}` })) })),
      })
    }
    json(res, 404, { error: 'Não encontrado.' })
  } catch (e) {
    json(res, 500, { error: e instanceof Error ? e.message : String(e) })
  }
}).listen(PORT, '127.0.0.1', () => console.log(`http://localhost:${PORT}  (modelo: ${cfg.model ?? '?'}, chave: ${cfg.key ? 'ok' : 'FALTANDO'})`))
