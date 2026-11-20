// Hızlandırılmış bot-bot simülasyonu: dengeyi ölçmek için.
// Kullanım: node test/simulate.js [oyunSayısı] [zorluk]
import { Game } from '../src/game.js';
import { pathToFileURL } from 'node:url';
import { BOT_NAMES, mulberry32 } from '../src/util.js';

export function runOne(n, difficulty, seed, overrides = {}) {
  const rng = mulberry32(seed);
  const slots = Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: BOT_NAMES[i], bot: true }));
  let wrong = 0;
  let winks = 0;
  const game = new Game({
    slots,
    settings: { difficulty, revealSeconds: 1, ...overrides },
    rng,
    emit: (m) => {
      if (m.t === 'accused' && !m.correct) wrong++;
      if (m.t === 'signal') winks++;
    },
  });
  const LIMIT = 900; // sn
  while (game.phase !== 'over' && game.time < LIMIT) game.update(0.1);
  return { winner: game.winner ?? 'timeout', reason: game.reason, time: game.time, wrong, winks, stats: game.stats };
}

export function runBatch(n, difficulty, games, overrides = {}) {
  const agg = { police: 0, killer: 0, timeout: 0, time: 0, wrong: 0, winks: 0, caught: 0 };
  for (let i = 0; i < games; i++) {
    const r = runOne(n, difficulty, 1000 + i * 7919 + n * 31, overrides);
    agg[r.winner]++;
    agg.time += r.time;
    agg.wrong += r.wrong;
    agg.winks += r.winks;
    if (r.reason === 'caught') agg.caught++;
    for (const [k, v] of Object.entries(r.stats)) agg[k] = (agg[k] || 0) + v;
  }
  return agg;
}

// Doğrudan çalıştırıldıysa (npm run sim). pathToFileURL: Windows yollarında da doğru karşılaştırır.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const games = Number(process.argv[2]) || 300;
  const only = process.argv[3];
  const diffs = only ? [only] : ['easy', 'normal', 'hard'];
  console.log(`Her satırda ${games} oyun. Polis% = polis (vatandaşlarla birlikte) kazanma oranı.\n`);
  for (const d of diffs) {
    console.log(`Zorluk: ${d}`);
    console.log('  oyuncu  polis%  katil%  zamanaşımı  ort.süre(sn)  ort.yanlış-suçlama  ort.işaret');
    for (let n = 4; n <= 10; n++) {
      const a = runBatch(n, d, games);
      const pct = (x) => ((100 * x) / games).toFixed(0).padStart(5);
      console.log(
        `  ${String(n).padStart(4)}   ${pct(a.police)}   ${pct(a.killer)}   ${pct(a.timeout)}` +
          `        ${(a.time / games).toFixed(0).padStart(8)}        ${(a.wrong / games).toFixed(2).padStart(8)}` +
          `        ${(a.winks / games).toFixed(1).padStart(6)}`,
      );
    }
    console.log('');
  }
}
