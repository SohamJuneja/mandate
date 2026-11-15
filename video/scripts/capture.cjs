const { chromium } = require('E:/blockchain/spare/node_modules/playwright');
const fs = require('fs');
const EX = 'https://explorer.testnet.somnia.network/tokyo/tx/';
const APP = 'https://sohamjuneja.github.io/mandate/';
const T = [
  ['D', EX + '0x7fe4b28f9ef099401686660232775824bf7d7571b26e33a6614e917908c09990', [['status', '^FAILED$'], ['revert', '^0x6f538c72$'], ['block', '^50,492,587$']]],
  ['E', EX + '0xea703717dc517a189e7651e333519530be6b309d511d823e1991b07d70998832', [['status', '^FAILED$'], ['revert', '^0xd8c73c46'], ['block', '^50,\d{3},\d{3}$']]],
  ['F', EX + '0xa40b162a22f33df9e3278ca053016c341e367ed0d47f07f01169ba1473c13964', [['status', '^SUCCESS$'], ['block', '^50,505,949$'], ['to', '^0x7aaf4723']]],
  ['G', EX + '0x3105fc64b136633fe45b0030c05e5a94662c238a2c54f351eea2f3850b21110e', [['status', '^FAILED$'], ['revert', '^0x5b0f71a2'], ['block', '^50,\d{3},\d{3}$']]],
];
(async () => {
  const b = await chromium.launch();
  const out = JSON.parse(fs.readFileSync('captures/caps-apps.json','utf8'));
  for (const [k, url, targets] of T) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: 'dark' });
        const p = await ctx.newPage();
        await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
        await p.waitForTimeout(5000);
        const boxes = await p.evaluate((targets) => {
          const r = {};
          for (const [name, re] of targets) {
            const rx = new RegExp(re); let best = null;
            for (const el of document.querySelectorAll('body *')) {
              const t = (el.innerText || '').trim(); if (!t || !rx.test(t)) continue;
              const bb = el.getBoundingClientRect(); if (bb.width < 2 || bb.height < 2) continue;
              const a = bb.width * bb.height; if (!best || a < best.a) best = { a, x: bb.x + scrollX, y: bb.y + scrollY, w: bb.width, h: bb.height };
            }
            if (best && location.host.includes('explorer')) { best = { a: best.a, x: 470, y: best.y - 14, w: 1250, h: best.h + 28 }; } r[name] = best;
          }
          return r;
        }, targets);
        const H = await p.evaluate(() => document.documentElement.scrollHeight);
        await p.screenshot({ path: `public/cap/${k}.png`, fullPage: true });
        out[k] = { url, h: H, boxes };
        console.log(k, H, JSON.stringify(Object.fromEntries(Object.entries(boxes).map(([n, v]) => [n, v && [Math.round(v.x), Math.round(v.y), Math.round(v.w), Math.round(v.h)]]))));
        await ctx.close(); break;
      } catch (e) { console.log('retry', k, e.message.slice(0, 80)); }
    }
  }
  fs.writeFileSync('src/caps.json', JSON.stringify(out, null, 1));
  await b.close();
})();
