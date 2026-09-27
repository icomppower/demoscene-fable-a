// Render the demo's soundtrack offline: node tools/music.mjs [out.wav]
import fs from 'node:fs';
const src = fs.readFileSync('index.html', 'utf8');
const js = src.split('// ---------- music ----------')[1].split('// ---------- timeline ----------')[0];
const out = process.argv[2] || 'review/music.wav';
const pre = `const AudioContext=function(){this.sampleRate=48000;this.createBuffer=(c,n,sr)=>({copyToChannel(a,i){this['ch'+i]=a;}})};`;
const code = pre + js + `render();const b=buf;`;
const fn = new Function(code + `return {L:buf.ch0,R:buf.ch1,SR,DUR,BAR,SPB};`);
const t0 = Date.now(); const r = fn(); console.error('rendered in', Date.now() - t0, 'ms');
const n = r.L.length, pcm = Buffer.alloc(44 + n * 4);
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + n * 4, 4); pcm.write('WAVEfmt ', 8); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22);
pcm.writeUInt32LE(r.SR, 24); pcm.writeUInt32LE(r.SR * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(n * 4, 40);
for (let i = 0; i < n; i++) { pcm.writeInt16LE(Math.max(-1, Math.min(1, r.L[i])) * 32767 | 0, 44 + i * 4); pcm.writeInt16LE(Math.max(-1, Math.min(1, r.R[i])) * 32767 | 0, 46 + i * 4); }
fs.writeFileSync(out, pcm);
// per-bar RMS
const bars = Math.floor(r.DUR / r.BAR); let line = '';
for (let b = 0; b < bars; b++) { const s = Math.floor(b * r.BAR * r.SR), e = Math.floor((b + 1) * r.BAR * r.SR); let q = 0; for (let i = s; i < e; i++) q += r.L[i] * r.L[i]; line += (20 * Math.log10(Math.sqrt(q / (e - s)) + 1e-9)).toFixed(0) + ' '; }
console.log('bar RMS dB:', line);
