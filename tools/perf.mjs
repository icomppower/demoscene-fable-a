// Frame-time probe without screencast: node tools/perf.mjs <file.html> <t1> [t2...]
import { chromium } from 'playwright'; import path from 'node:path';
const [file, ...ts] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required','--use-gl=angle','--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
if (process.env.SC) { const cdp = await ctx.newCDPSession(page); cdp.on('Page.screencastFrame', ({ sessionId }) => cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})); await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, everyNthFrame: 1 }); }
if (process.env.TAP) await page.addInitScript(`(() => {
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
  
  
  })();`);
await page.addInitScript(`let last=0;window.__ft=[];const loop=t=>{if(last)window.__ft.push(t-last);last=t;requestAnimationFrame(loop)};requestAnimationFrame(loop);`);
for (const t of ts) {
  await page.goto('file://' + path.resolve(file) + '?' + t + '#t=' + t + (process.env.SND?'':'&mute=1'));
  await page.waitForTimeout(300); await page.mouse.click(640, 360); await page.waitForTimeout(1500);
  await page.evaluate(() => window.__ft.length = 0); await page.waitForTimeout(4000);
  const ft = await page.evaluate(() => window.__ft.sort((a, b) => a - b));
  const p = q => ft[Math.floor(ft.length * q)].toFixed(1);
  console.log(`t=${t} n=${ft.length} p50=${p(.5)} p95=${p(.95)}`);
}
await browser.close();
