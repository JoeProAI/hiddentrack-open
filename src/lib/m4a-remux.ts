// Pulls the AAC audio track out of an MP4 into an audio-only .m4a, with no re-encoding.
// Keeps the audio trak boxes as they are, rewrites the chunk offsets (stco), and
// writes the samples into a new mdat in the same chunk order.

type Box = { type: string; start: number; size: number; header: number };

const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts", "dinf"]);

const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const u64 = (b: Uint8Array, o: number) => u32(b, o) * 2 ** 32 + u32(b, o + 4);
const type4 = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

function boxes(b: Uint8Array, start: number, end: number): Box[] {
  const out: Box[] = [];
  let o = start;
  while (o + 8 <= end) {
    let size = u32(b, o);
    let header = 8;
    if (size === 1) { size = u64(b, o + 8); header = 16; }
    else if (size === 0) size = end - o;
    if (size < header || o + size > end) throw new Error("Bad MP4 box");
    out.push({ type: type4(b, o + 4), start: o, size, header });
    o += size;
  }
  return out;
}

const child = (b: Uint8Array, parent: Box, type: string) =>
  boxes(b, parent.start + parent.header, parent.start + parent.size).find((x) => x.type === type);

function box(type: string, ...parts: Uint8Array[]) {
  const len = 8 + parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, len);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  let o = 8;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export type RemuxResult = { header: Uint8Array; chunks: Array<[number, number]>; byteLength: number };

export function remuxAudio(src: Uint8Array): RemuxResult {
  const top = boxes(src, 0, src.length);
  const moov = top.find((x) => x.type === "moov");
  if (!moov) throw new Error("No moov box");
  const moovKids = boxes(src, moov.start + moov.header, moov.start + moov.size);
  const mvhd = moovKids.find((x) => x.type === "mvhd");
  if (!mvhd) throw new Error("No mvhd box");

  const trak = moovKids.find((t) => {
    if (t.type !== "trak") return false;
    const mdia = child(src, t, "mdia");
    const hdlr = mdia && child(src, mdia, "hdlr");
    return !!hdlr && type4(src, hdlr.start + hdlr.header + 8) === "soun";
  });
  if (!trak) throw new Error("No audio track");
  const mdia = child(src, trak, "mdia")!;
  const minf = child(src, mdia, "minf");
  const stbl = minf && child(src, minf, "stbl");
  if (!stbl) throw new Error("No sample table");
  const stsd = child(src, stbl, "stsd");
  if (!stsd || type4(src, stsd.start + stsd.header + 8 + 4) !== "mp4a") throw new Error("Audio is not AAC");

  // Sample sizes
  const stsz = child(src, stbl, "stsz");
  if (!stsz) throw new Error("No stsz");
  const zb = stsz.start + stsz.header;
  const constSize = u32(src, zb + 4);
  const count = u32(src, zb + 8);
  const sizeOf = (i: number) => (constSize ? constSize : u32(src, zb + 12 + i * 4));

  // Chunk offsets
  const stco = child(src, stbl, "stco");
  const co64 = child(src, stbl, "co64");
  const cb = (stco ?? co64)!;
  if (!cb) throw new Error("No chunk offsets");
  const cbase = cb.start + cb.header;
  const nChunks = u32(src, cbase + 4);
  const offsetOf = (i: number) => (stco ? u32(src, cbase + 8 + i * 4) : u64(src, cbase + 8 + i * 8));

  // Samples per chunk
  const stsc = child(src, stbl, "stsc");
  if (!stsc) throw new Error("No stsc");
  const sb = stsc.start + stsc.header;
  const nEntries = u32(src, sb + 4);
  const runs: Array<{ first: number; per: number }> = [];
  for (let i = 0; i < nEntries; i++) runs.push({ first: u32(src, sb + 8 + i * 12), per: u32(src, sb + 12 + i * 12) });

  const chunks: Array<[number, number]> = [];
  let sample = 0;
  for (let c = 0, r = 0; c < nChunks; c++) {
    while (r + 1 < runs.length && runs[r + 1].first <= c + 1) r++;
    const per = runs[r]?.per ?? 0;
    let bytes = 0;
    for (let k = 0; k < per && sample < count; k++, sample++) bytes += sizeOf(sample);
    const off = offsetOf(c);
    if (off + bytes > src.length) throw new Error("Chunk past end of file");
    chunks.push([off, bytes]);
  }
  if (sample !== count) throw new Error(`Sample table mismatch (${sample} of ${count})`);

  const rebuild = (b: Box, stcoBytes: Uint8Array): Uint8Array => {
    if (b.type === "stco" || b.type === "co64") return stcoBytes;
    if (!CONTAINERS.has(b.type)) return src.slice(b.start, b.start + b.size);
    const kids = boxes(src, b.start + b.header, b.start + b.size).map((k) => rebuild(k, stcoBytes));
    return box(b.type, ...kids);
  };

  const makeStco = (base: number) => {
    const body = new Uint8Array(8 + chunks.length * 4);
    const dv = new DataView(body.buffer);
    dv.setUint32(4, chunks.length);
    let o = base;
    chunks.forEach(([, n], i) => { dv.setUint32(8 + i * 4, o); o += n; });
    return box("stco", body);
  };

  // mvhd with the audio track's duration
  const mvhdBytes = src.slice(mvhd.start, mvhd.start + mvhd.size);
  const tkhd = child(src, trak, "tkhd");
  if (tkhd) {
    const tv = src[tkhd.start + tkhd.header];
    const mv = mvhdBytes[mvhd.header];
    const tdur = tv === 1 ? u64(src, tkhd.start + tkhd.header + 28) : u32(src, tkhd.start + tkhd.header + 20);
    const dv = new DataView(mvhdBytes.buffer);
    if (mv === 1) dv.setBigUint64(mvhd.header + 24, BigInt(tdur));
    else if (tdur < 2 ** 32) dv.setUint32(mvhd.header + 16, tdur);
  }
  const udta = moovKids.find((x) => x.type === "udta");
  const udtaBytes = udta ? src.slice(udta.start, udta.start + udta.size) : new Uint8Array(0);

  const ftypBody = new Uint8Array(16);
  const ascii = (s: string, o: number) => { for (let i = 0; i < 4; i++) ftypBody[o + i] = s.charCodeAt(i); };
  ascii("M4A ", 0); ascii("M4A ", 8); ascii("isom", 12);
  const ftyp = box("ftyp", ftypBody, Uint8Array.from([109, 112, 52, 50])); // + "mp42"

  const dataBytes = chunks.reduce((n, [, len]) => n + len, 0);
  // stco size does not depend on the offsets, so build once to measure, then for real.
  const probeMoov = box("moov", mvhdBytes, rebuild(trak, makeStco(0)), udtaBytes);
  const dataStart = ftyp.length + probeMoov.length + 8;
  const moovOut = box("moov", mvhdBytes, rebuild(trak, makeStco(dataStart)), udtaBytes);

  const mdatHeader = new Uint8Array(8);
  new DataView(mdatHeader.buffer).setUint32(0, 8 + dataBytes);
  mdatHeader.set([109, 100, 97, 116], 4);

  const header = new Uint8Array(ftyp.length + moovOut.length + 8);
  header.set(ftyp, 0); header.set(moovOut, ftyp.length); header.set(mdatHeader, ftyp.length + moovOut.length);
  return { header, chunks, byteLength: header.length + dataBytes };
}
