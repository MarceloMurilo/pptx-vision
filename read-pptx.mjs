// Reads a .pptx (a zip of XML and media) into slides: text, speaker notes, chart values and pictures, in slide order.
import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import sharp from 'sharp'
import { XMLParser } from 'fast-xml-parser'

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' })
const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v])
const texts = (s) => [...s.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')).filter(Boolean)
const dirOf = (p) => p.slice(0, p.lastIndexOf('/') + 1)
const resolve = (base, target) => {
  const parts = (target.startsWith('/') ? target.slice(1) : dirOf(base) + target).split('/')
  const out = []
  for (const x of parts) x === '..' ? out.pop() : x !== '.' && out.push(x)
  return out.join('/')
}
const IEND = Buffer.from('0000000049454e44ae426082', 'hex')
const sniff = (b) =>
  b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 ? 'image/png'
  : b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? 'image/jpeg'
  : b.subarray(0, 4).toString('latin1') === 'GIF8' ? 'image/gif'
  : b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' ? 'image/webp'
  : null
const guess = (b, target) => {
  const head = b.subarray(0, 200).toString('latin1')
  if (b.readUInt32LE(0) === 1) return 'EMF'
  if (b[0] === 0xd7 && b[1] === 0xcd) return 'WMF'
  if (/<svg|<\?xml/i.test(head)) return 'SVG'
  if (b.subarray(4, 12).toString('latin1').includes('ftyp')) return 'HEIC/AVIF'
  if (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) return 'TIFF'
  if (b[0] === 0x42 && b[1] === 0x4d) return 'BMP'
  return `desconhecido, extensão .${target.split('.').pop()}`
}

// `path` is a file path or the bytes of the file
export async function readPptx(path) {
  const zip = await JSZip.loadAsync(Buffer.isBuffer(path) ? path : await readFile(path))
  const text = async (name) => (zip.file(name) ? zip.file(name).async('string') : '')
  const rels = async (part) => {
    const j = xml.parse(await text(`${dirOf(part)}_rels/${part.split('/').pop()}.rels`))
    return arr(j.Relationships?.Relationship).map((r) => ({ id: r['@Id'], type: String(r['@Type']).split('/').pop(), target: resolve(part, r['@Target']) }))
  }

  const pres = xml.parse(await text('ppt/presentation.xml'))
  const presRels = await rels('ppt/presentation.xml')
  const order = arr(pres['p:presentation']['p:sldIdLst']?.['p:sldId']).map((s) => presRels.find((r) => r.id === s['@r:id'])?.target).filter(Boolean)

  const slides = []
  for (const [i, part] of order.entries()) {
    const body = await text(part)
    const rs = await rels(part)
    const slide = { n: i + 1, text: texts(body), notes: [], charts: [], images: [], skipped: [] }
    for (const r of rs) {
      if (r.type === 'notesSlide') slide.notes = texts(await text(r.target))
      else if (r.type === 'chart') {
        const c = await text(r.target)
        const series = [...c.matchAll(/<c:ser>([\s\S]*?)<\/c:ser>/g)].map((m) => {
          const grab = (tag) => { const mm = m[1].match(new RegExp(`<c:${tag}>([\\s\\S]*?)</c:${tag}>`)); return mm ? [...mm[1].matchAll(/<c:v>([^<]*)<\/c:v>/g)].map((x) => x[1]) : [] }
          return { name: grab('tx').join(' '), categories: grab('cat'), values: grab('val') }
        })
        slide.charts.push(series)
      } else if (r.type === 'image') {
        const name = r.target.split('/').pop()
        const buf = await zip.file(r.target)?.async('nodebuffer')
        if (!buf || buf.length < 16) { slide.skipped.push(`${name} (vazia)`); continue }
        // the extension can lie: what counts is what the bytes are
        const kind = sniff(buf)
        if (!kind) { slide.skipped.push(`${name} (formato real não suportado: ${guess(buf, r.target)})`); continue }
        let data = buf, repaired = false
        // a PNG that stops before its end marker is cut off inside the file: decode what is there and write it again
        if (kind === 'image/png' && !buf.subarray(-12).equals(IEND)) {
          try { data = await sharp(buf, { failOn: 'none' }).png().toBuffer(); repaired = true } catch { slide.skipped.push(`${name} (PNG truncado e sem conserto)`); continue }
        }
        slide.images.push({ name, mime: kind, b64: data.toString('base64'), bytes: data.length, ...(repaired ? { repaired: true } : {}) })
      }
    }
    slides.push(slide)
  }
  return slides
}
