// Self-review recorder. Usage: node tools/record.mjs <file.html> <seconds> <tag>
// Output: review/<tag>.mp4 (video + audio), review/<tag>/f###.jpg (1 fps stills),
//         review/<tag>/info.json (WebGL renderer, console errors, frame-time stats).
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [file = 'index.html', secs = '60', tag = 'v01'] = process.argv.slice(2);
const dur = Number(secs) * 1000;
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'review'); const stills = path.join(out, tag);
fs.mkdirSync(stills, { recursive: true });
const tmp = fs.mkdtempSync(path.join(out, '.tmp-'));

// Tap every connection to an AudioContext destination into a raw PCM recorder.
const tap = `(() => {
  const orig = AudioNode.prototype.connect; const taps = new Map();
  window.__audio = { ctxs: [] };
  AudioNode.prototype.connect = function (dst, ...a) {
    const r = orig.call(this, dst, ...a);
    if (dst instanceof AudioDestinationNode) {
      const ctx = dst.context; let sp = taps.get(ctx);
      if (!sp) {
        sp = ctx.createScriptProcessor(4096, 2, 2); taps.set(ctx, sp);
        const rec = { sr: ctx.sampleRate, L: [], R: [], t0: null };
        window.__audio.ctxs.push(rec);
        sp.onaudioprocess = e => {
          const i = e.inputBuffer;
          if (rec.t0 === null) {
            const ts = ctx.getOutputTimestamp();
            const tIn = e.playbackTime - i.length / ctx.sampleRate;
            rec.t0 = performance.timeOrigin + ts.performanceTime + (tIn - ts.contextTime) * 1000;
          }
          rec.L.push(i.getChannelData(0).slice()); rec.R.push(i.getChannelData(i.numberOfChannels > 1 ? 1 : 0).slice());
        };
        orig.call(sp, ctx.destination);
      }
      orig.call(this, sp);
    }
    return r;
  };
  let last = 0; window.__ft = [];
  const loop = t => { if (last) window.__ft.push(t - last); last = t; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
})();`;

const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
});
const page = await ctx.newPage();
// CDP screencast: every frame carries a wall-clock timestamp, so audio aligns exactly.
const cdp = await ctx.newCDPSession(page); const frames = []; let nf = 0;
cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  const f = path.join(tmp, `s${String(nf++).padStart(6, '0')}.jpg`);
  fs.writeFileSync(f, Buffer.from(data, 'base64')); frames.push([f, metadata.timestamp]);
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
const errors = [];
page.on('console', m => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', e => errors.push(String(e)));
await page.addInitScript(tap);
await page.goto('file://' + path.resolve(file));
const renderer = await page.evaluate(() => {
  const g = document.createElement('canvas').getContext('webgl');
  const d = g && g.getExtension('WEBGL_debug_renderer_info');
  return g ? (d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'webgl') : 'none';
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, everyNthFrame: 1 });
await page.waitForTimeout(500);
await page.mouse.click(640, 360); // satisfy any click-to-start overlay
await page.keyboard.press('Space').catch(() => {});
await page.waitForTimeout(dur);

const audio = await page.evaluate(() => {
  const r = window.__audio.ctxs.find(c => c.L.length); if (!r) return null;
  const n = r.L.reduce((k, b) => k + b.length, 0), pcm = new Int16Array(n * 2); let k = 0;
  for (let j = 0; j < r.L.length; j++) for (let i = 0; i < r.L[j].length; i++) {
    pcm[k++] = Math.max(-1, Math.min(1, r.L[j][i])) * 32767; pcm[k++] = Math.max(-1, Math.min(1, r.R[j][i])) * 32767;
  }
  const u8 = new Uint8Array(pcm.buffer); let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return { b64: btoa(s), t0: r.t0, sr: r.sr };
});
const ft = await page.evaluate(() => window.__ft.slice(30).sort((a, b) => a - b));
await cdp.send('Page.stopScreencast').catch(() => {});
await ctx.close(); await browser.close();

const mp4 = path.join(out, `${tag}.mp4`);
const T0 = frames[0][1], list = path.join(tmp, 'frames.txt');
fs.writeFileSync(list, frames.map(([f, t], i) => `file '${f}'\nduration ${((frames[i + 1]?.[1] ?? t + 1 / 60) - t).toFixed(4)}`).join('\n') + `\nfile '${frames.at(-1)[0]}'\n`);
const ff = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list];
if (audio) {
  const apath = path.join(tmp, 'a.pcm'); fs.writeFileSync(apath, Buffer.from(audio.b64, 'base64'));
  const off = audio.t0 / 1000 - T0; console.error('audio offset vs first frame (s):', off.toFixed(3));
  ff.push('-f', 's16le', '-ar', String(audio.sr), '-ac', '2', '-i', apath, '-map', '0:v', '-map', '1:a', '-af', off >= 0 ? `adelay=${Math.round(off * 1000)}:all=1` : `atrim=start=${-off},asetpts=PTS-STARTPTS`, '-c:a', 'aac', '-b:a', '192k');
}
ff.push('-vf', 'fps=60,scale=1280:720', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', mp4);
execFileSync('ffmpeg', ff);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-vf', 'fps=1,scale=960:-2', '-q:v', '4', path.join(stills, 'f%03d.jpg')]);
if (!process.env.KEEP) fs.rmSync(tmp, { recursive: true, force: true });

const pct = p => ft.length ? +ft[Math.floor(ft.length * p)].toFixed(2) : null;
const info = { file, tag, seconds: +secs, renderer, audio: !!audio, errors, frames: ft.length, ft_p50: pct(0.5), ft_p95: pct(0.95), ft_max: pct(0.999) };
fs.writeFileSync(path.join(stills, 'info.json'), JSON.stringify(info, null, 2));
console.log(JSON.stringify(info));
if (/swiftshader/i.test(renderer)) { console.error('FAIL: WebGL fell back to SwiftShader'); process.exit(2); }
