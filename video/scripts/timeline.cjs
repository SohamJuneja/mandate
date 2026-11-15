// One source of truth for scene timing: used by the Remotion composition and the audio mix.
const fs = require('fs');
const vo = JSON.parse(fs.readFileSync('src/vo.json', 'utf8'));
const FPS = 30, XF = 12;
const ORDER = ['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's11'];
const LEAD = { s01: 2.0 };          // music-only open before the first line
const EXTRA = { s05: 0.8, s07: 1.2, s09: 1.4, s08: 0.6, s11: 4.5 }; // capture dwell, stamps, outro hold + fade
let start = 0; const scenes = [];
for (const id of ORDER) {
  const lead = LEAD[id] ?? 0.35;
  const frames = Math.round((lead + vo[id].dur + 0.6 + (EXTRA[id] ?? 0)) * FPS);
  scenes.push({ id, start, frames, voStart: start + Math.round(lead * FPS), voDur: vo[id].dur });
  start += frames - XF;
}
const total = start + XF;
fs.writeFileSync('src/timeline.json', JSON.stringify({ fps: FPS, xf: XF, total, scenes }, null, 1));
console.log('total', (total / FPS).toFixed(1), 's');
