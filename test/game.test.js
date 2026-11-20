// Oyun kuralları için birim testleri (ağ yok, zaman elle ilerletilir).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { mulberry32, anglesTo } from '../src/util.js';

/** n oyunculu oyun kurar; ilk `humans.length` oyuncu insandır, beyinleri kapalıdır. */
function make({ n = 5, humans = ['h1', 'h2', 'h3', 'h4', 'h5'], settings = {}, seed = 3 } = {}) {
  const events = [];
  const slots = Array.from({ length: n }, (_, i) => ({
    id: humans[i] ?? `b${i}`,
    name: `P${i}`,
    bot: i >= humans.length,
  }));
  const g = new Game({
    slots,
    settings: { revealSeconds: 0.2, ...settings },
    rng: mulberry32(seed),
    emit: (m, to) => events.push({ m, to }),
  });
  for (const p of g.players) p.brain = null; // senaryoyu elle yöneteceğiz
  return { g, events };
}

function setRoles(g, killerId, policeId) {
  for (const p of g.players) {
    p.role = p.id === killerId ? 'killer' : p.id === policeId ? 'police' : 'citizen';
    p.lives = p.role === 'police' ? g.cfg.policeLives : 0;
  }
}

function lookAt(g, fromId, toId) {
  const a = g.byId.get(fromId);
  const b = g.byId.get(toId);
  [a.yaw, a.pitch] = anglesTo(a.pos, b.pos);
}

function lookAway(g, id, fromId) {
  // fromId'ye tam ters yöne bakar
  const a = g.byId.get(id);
  const b = g.byId.get(fromId);
  const [y, p] = anglesTo(a.pos, b.pos);
  a.yaw = y + Math.PI;
  a.pitch = p;
}

function advance(g, sec) {
  for (let t = 0; t < sec; t += 0.1) g.update(0.1);
}

const find = (events, type) => events.filter((e) => e.m.t === type);

test('roller: 1 katil, 1 polis, kalanı vatandaş; start mesajı yalnızca kendi rolünü içerir', () => {
  const { g, events } = make({ n: 7, humans: ['h1', 'h2'] });
  const roles = g.players.map((p) => p.role);
  assert.equal(roles.filter((r) => r === 'killer').length, 1);
  assert.equal(roles.filter((r) => r === 'police').length, 1);
  assert.equal(roles.filter((r) => r === 'citizen').length, 5);
  assert.equal(new Set(g.players.map((p) => p.seat)).size, 7);
  g.start();
  const starts = find(events, 'start');
  assert.equal(starts.length, 2); // yalnızca insanlara gider
  for (const s of starts) {
    assert.deepEqual(s.to, [s.m.you]);
    assert.equal(s.m.role, g.byId.get(s.m.you).role);
    assert.ok(s.m.seats.every((x) => !('role' in x) && !('bot' in x)), 'koltuk listesi rol/bot sızdırmamalı');
  }
});

test('reveal süresince eylem yapılamaz, sonra oyun başlar', () => {
  const { g, events } = make();
  setRoles(g, 'h1', 'h2');
  assert.match(g.wink('h1', 'h3').error, /başlamadı/);
  advance(g, 0.5);
  assert.equal(g.phase, 'playing');
  assert.equal(find(events, 'phase').length, 1);
});

test('işareti yalnızca bakan görür; hedef bakıyorsa fark eder ve "ben öldüm" diyebilir', () => {
  const { g, events } = make();
  setRoles(g, 'h1', 'h2');
  advance(g, 0.5);
  lookAt(g, 'h1', 'h3'); // katil hedefe bakıyor
  lookAt(g, 'h3', 'h1'); // hedef de katile bakıyor
  lookAway(g, 'h4', 'h1'); // h4 bakmıyor
  lookAway(g, 'h2', 'h1'); // polis de bakmıyor
  lookAway(g, 'h5', 'h1');
  const r = g.wink('h1', 'h3');
  assert.equal(r.ok, true);
  const sig = find(events, 'signal')[0];
  assert.deepEqual(sig.to, ['h3']);
  assert.equal(sig.m.from, 'h1');
  assert.equal(find(events, 'noticed')[0].to[0], 'h3');
  assert.equal(find(events, 'ack')[0].to[0], 'h1');
  assert.equal(g.byId.get('h3').alive, true); // henüz ölmedi
  assert.equal(g.die('h3').ok, true);
  const died = find(events, 'died')[0].m;
  assert.equal(died.id, 'h3');
  assert.equal(died.left, 2); // 5 oyuncu - katil - polis = 3 vatandaş; biri öldü
  assert.equal(g.byId.get('h3').alive, false);
});

test('hedef bakmıyorsa fark etmez; fark etmeden ölünemez', () => {
  const { g, events } = make();
  setRoles(g, 'h1', 'h2');
  advance(g, 0.5);
  lookAt(g, 'h1', 'h3');
  lookAway(g, 'h3', 'h1');
  lookAway(g, 'h2', 'h1');
  lookAway(g, 'h4', 'h1');
  lookAway(g, 'h5', 'h1');
  assert.equal(g.wink('h1', 'h3').ok, true);
  assert.equal(find(events, 'noticed').length, 0);
  assert.equal(find(events, 'signal')[0].to.length, 0);
  assert.match(g.die('h3').error, /Fark etmeden/);
  advance(g, 20);
  assert.equal(g.byId.get('h3').alive, true);
});

test('katil hedefe bakmıyorsa işaret reddedilir; bekleme süresi uygulanır', () => {
  const { g } = make();
  setRoles(g, 'h1', 'h2');
  advance(g, 0.5);
  lookAway(g, 'h1', 'h3');
  assert.match(g.wink('h1', 'h3').error, /bakmıyorsun/);
  lookAt(g, 'h1', 'h3');
  assert.equal(g.wink('h1', 'h3').ok, true);
  assert.match(g.wink('h1', 'h3').error, /bekle/);
  advance(g, g.cfg.winkCooldown + 0.2);
  assert.equal(g.wink('h1', 'h3').ok, true);
});

test('vatandaş ve polis katil gibi davranamaz', () => {
  const { g } = make();
  setRoles(g, 'h1', 'h2');
  advance(g, 0.5);
  lookAt(g, 'h3', 'h4');
  assert.ok(g.wink('h3', 'h4').error);
  lookAt(g, 'h2', 'h4');
  assert.ok(g.wink('h2', 'h4').error);
  assert.ok(g.accuse('h3', 'h1').error);
});

test('polise işaret yapılırsa polis ölmez (yalnızca görmüş olur)', () => {
  const { g, events } = make();
  setRoles(g, 'h1', 'h2');
  advance(g, 0.5);
  lookAt(g, 'h1', 'h2');
  lookAt(g, 'h2', 'h1');
  for (const id of ['h3', 'h4', 'h5']) lookAway(g, id, 'h1');
  assert.equal(g.wink('h1', 'h2').ok, true);
  assert.deepEqual(find(events, 'signal')[0].to, ['h2']);
  assert.equal(find(events, 'noticed').length, 0);
  assert.equal(g.byId.get('h2').alive, true);
});

test('fark eden insan süresinde "ben öldüm" demezse otomatik elenir', () => {
  const { g, events } = make({ settings: { noticeSeconds: 3 } });
  setRoles(g, 'h1', 'h2');
  advance(g, 0.5);
  lookAt(g, 'h1', 'h3');
  lookAt(g, 'h3', 'h1');
  g.wink('h1', 'h3');
  advance(g, 2.5);
  assert.equal(g.byId.get('h3').alive, true);
  advance(g, 1);
  assert.equal(g.byId.get('h3').alive, false);
  assert.equal(find(events, 'died')[0].m.reason, 'timeout');
});

test('polis doğru suçlarsa polis kazanır', () => {
  const { g, events } = make();
  setRoles(g, 'h1', 'h2');
  advance(g, 0.5);
  lookAt(g, 'h2', 'h1');
  const r = g.accuse('h2', 'h1');
  assert.deepEqual(r, { ok: true, correct: true });
  assert.equal(g.phase, 'over');
  const over = find(events, 'over')[0].m;
  assert.equal(over.winner, 'police');
  assert.equal(over.reason, 'caught');
  assert.equal(over.roles.length, 5);
});

test('yanlış suçlama hak götürür; haklar bitince katil kazanır', () => {
  const { g, events } = make({ settings: { policeLives: 2, accuseCooldown: 0.5 } });
  setRoles(g, 'h1', 'h2');
  advance(g, 0.5);
  lookAt(g, 'h2', 'h3');
  let r = g.accuse('h2', 'h3');
  assert.deepEqual(r, { ok: true, correct: false });
  assert.equal(find(events, 'accused')[0].m.lives, 1);
  assert.equal(g.phase, 'playing');
  assert.match(g.accuse('h2', 'h4').error, /bekle|bakmıyorsun/); // bekleme süresi veya nişan
  advance(g, 0.6);
  lookAt(g, 'h2', 'h4');
  r = g.accuse('h2', 'h4');
  assert.equal(r.correct, false);
  assert.equal(g.phase, 'over');
  const over = find(events, 'over')[0].m;
  assert.equal(over.winner, 'killer');
  assert.equal(over.reason, 'policeOut');
});

test('tüm vatandaşlar ölürse katil kazanır', () => {
  const { g, events } = make({ n: 4, humans: ['h1', 'h2', 'h3', 'h4'], settings: { winkCooldown: 1 } });
  setRoles(g, 'h1', 'h2');
  advance(g, 0.5);
  for (const victim of ['h3', 'h4']) {
    lookAt(g, 'h1', victim);
    lookAt(g, victim, 'h1');
    lookAway(g, 'h2', 'h1');
    assert.equal(g.wink('h1', victim).ok, true);
    assert.equal(g.die(victim).ok, true);
    advance(g, 1.2);
  }
  assert.equal(g.phase, 'over');
  const over = find(events, 'over')[0].m;
  assert.equal(over.winner, 'killer');
  assert.equal(over.reason, 'allDead');
});

test('ölen insan, rolleri görür (seyirci)', () => {
  const { g, events } = make();
  setRoles(g, 'h1', 'h2');
  advance(g, 0.5);
  lookAt(g, 'h1', 'h3');
  lookAt(g, 'h3', 'h1');
  g.wink('h1', 'h3');
  g.die('h3');
  const roles = find(events, 'roles')[0];
  assert.deepEqual(roles.to, ['h3']);
  assert.equal(roles.m.roles.h1, 'killer');
  // ölen kişi sonraki işaretleri de görür
  advance(g, g.cfg.winkCooldown + 0.1);
  lookAt(g, 'h1', 'h4');
  lookAway(g, 'h4', 'h1');
  g.wink('h1', 'h4');
  const sigs = find(events, 'signal');
  assert.ok(sigs[sigs.length - 1].to.includes('h3'));
});

test('oyundan çıkan vatandaş herkese duyurulur, masadan kalkar, oyun sürer', () => {
  const { g, events } = make();
  setRoles(g, 'h1', 'h2');
  advance(g, 0.5);
  g.leave('h4');
  const q = find(events, 'quit');
  assert.equal(q.length, 1);
  assert.equal(q[0].to, null, 'herkese gider');
  assert.deepEqual([q[0].m.id, q[0].m.role, q[0].m.heir, q[0].m.left, q[0].m.citizens], ['h4', 'citizen', false, 2, 3]);
  assert.equal(g.byId.get('h4').alive, false);
  assert.equal(g.phase, 'playing');
  assert.equal(find(events, 'role').length, 0);
  lookAt(g, 'h1', 'h4');
  assert.ok(g.wink('h1', 'h4').error, 'çıkan kişiye işaret yapılamaz');
  g.leave('h4'); // ikinci kez çıkış yok sayılır
  assert.equal(find(events, 'quit').length, 1);
  advance(g, 0.3);
  assert.ok(!find(events, 'g').at(-1).m.g.some(([id]) => id === 'h4'), 'çıkanın bakışı yayınlanmaz');
});

test('son katil çıkarsa rolü rastgele bir vatandaşa geçer ve yalnızca ona bildirilir', () => {
  const { g, events } = make();
  setRoles(g, 'h1', 'h2');
  advance(g, 0.5);
  g.leave('h1');
  const q = find(events, 'quit')[0].m;
  assert.deepEqual([q.role, q.heir, q.killersLeft, q.left, q.citizens], ['killer', true, 1, 2, 2]);
  const heir = g.players.find((p) => p.alive && p.role === 'killer');
  assert.ok(['h3', 'h4', 'h5'].includes(heir.id), 'devralan canlı bir vatandaş');
  const r = find(events, 'role');
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].to, [heir.id]);
  assert.deepEqual([r[0].m.role, r[0].m.from, r[0].m.team], ['killer', 'h1', []]);
  assert.equal(g.phase, 'playing');
  // Devralan, kısa bir bekleme süresinden sonra işaret yapabilir.
  const victim = ['h3', 'h4', 'h5'].find((id) => id !== heir.id);
  lookAt(g, heir.id, victim);
  assert.match(g.wink(heir.id, victim).error, /bekle/);
  advance(g, 3.1);
  lookAt(g, heir.id, victim);
  assert.equal(g.wink(heir.id, victim).ok, true);
});

test('iki katilden biri çıkarsa devir yok; son polis çıkarsa polislik kalan hakkıyla devredilir', () => {
  const { g, events } = make({ n: 8, humans: H8, settings: { killers: 2, policeLives: 3 } });
  setTeams(g, ['h1', 'h2'], ['h3']);
  advance(g, 0.5);
  g.leave('h1');
  assert.deepEqual([find(events, 'quit')[0].m.heir, find(events, 'quit')[0].m.killersLeft], [false, 1]);
  assert.equal(find(events, 'role').length, 0, 'diğer katil masada: devir yok');
  lookAt(g, 'h3', 'h5');
  assert.equal(g.accuse('h3', 'h5').correct, false); // 3 → 2 hak
  g.leave('h3');
  const q = find(events, 'quit')[1].m;
  assert.deepEqual([q.role, q.heir], ['police', true]);
  const heir = g.players.find((p) => p.alive && p.role === 'police');
  assert.equal(heir.lives, 2);
  const r = find(events, 'role')[0];
  assert.deepEqual([r.to[0], r.m.role, r.m.lives], [heir.id, 'police', 2]);
  assert.equal(g.phase, 'playing');
});

test('hakkı biten polis kalırken son "aktif" polis çıkarsa devralan olur, eski polise takım arkadaşı bildirilir', () => {
  const { g, events } = make({ n: 8, humans: H8, settings: { police: 2, policeLives: 1 } });
  setTeams(g, ['h1'], ['h3', 'h4']);
  advance(g, 0.5);
  lookAt(g, 'h3', 'h5');
  g.accuse('h3', 'h5'); // h3'ün hakkı bitti
  g.leave('h4');
  const heir = g.players.find((p) => p.alive && p.role === 'police' && p.id !== 'h3');
  assert.ok(heir && heir.lives === 1);
  assert.deepEqual(find(events, 'role')[0].m.team, ['h3']);
  const mate = find(events, 'mate')[0];
  assert.deepEqual([mate.to, mate.m.id], [['h3'], heir.id]);
});

test('rolü devralacak kimse kalmadıysa oyun biter', () => {
  const { g, events } = make({ n: 4, humans: ['h1', 'h2', 'h3', 'h4'] });
  setRoles(g, 'h1', 'h2');
  advance(g, 0.5);
  for (const id of ['h3', 'h4']) g.byId.get(id).pending = { since: g.time }; // ikisi de işaret almış: aday değil
  g.leave('h1');
  const over = find(events, 'over')[0].m;
  assert.deepEqual([over.winner, over.reason], ['police', 'killerLeft']);
  assert.equal(over.roles.find((r) => r.id === 'h1').left, true);
});

test('rolü bot devralırsa yeni rolüyle oynar ve oyun biter', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const slots = [{ id: 'h1', name: 'İnsan' }, ...Array.from({ length: 5 }, (_, i) => ({ id: `b${i}`, name: `B${i}`, bot: true }))];
    const g = new Game({ slots, settings: { revealSeconds: 1 }, rng: mulberry32(seed) });
    // İnsan katil olsun (asıl katil vatandaş olur)
    const killer = g.players.find((p) => p.role === 'killer');
    const me = g.byId.get('h1');
    if (killer !== me) { killer.role = me.role; killer.lives = me.lives; killer.brain = new killer.brain.constructor(g, killer); me.role = 'killer'; me.lives = 0; }
    while (g.time < 8) g.update(0.1);
    if (g.phase === 'over') continue;
    g.leave('h1');
    const heir = g.players.find((p) => p.alive && p.role === 'killer');
    assert.ok(heir?.bot && heir.brain, `seed ${seed}: bot devralmalı`);
    while (g.phase !== 'over' && g.time < 900) g.update(0.1);
    assert.equal(g.phase, 'over', `seed ${seed} bitmedi`);
  }
});

test('bakış açıları sunucuda sınırlanır ve geçersiz değerler yok sayılır', () => {
  const { g } = make();
  g.setGaze('h1', NaN, 0);
  const before = g.byId.get('h1').yaw;
  assert.equal(g.byId.get('h1').yaw, before);
  g.setGaze('h1', 1, 99);
  assert.ok(g.byId.get('h1').pitch <= 1.2);
  g.setGaze('b99', 1, 1); // olmayan oyuncu
});

// ---------- Birden fazla katil / polis ----------
const H8 = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8'];
const count = (g, role) => g.players.filter((p) => p.role === role).length;

function setTeams(g, killers, police) {
  for (const p of g.players) {
    p.role = killers.includes(p.id) ? 'killer' : police.includes(p.id) ? 'police' : 'citizen';
    p.lives = p.role === 'police' ? g.cfg.policeLives : 0;
  }
}

test('katil/polis sayısı: her 4 oyuncuya en fazla 1; takım arkadaşları birbirini bilir', () => {
  let { g } = make({ n: 4, humans: H8, settings: { killers: 3, police: 2 } });
  assert.deepEqual([count(g, 'killer'), count(g, 'police')], [1, 1]);
  ({ g } = make({ n: 7, humans: H8, settings: { killers: 2, police: 2 } }));
  assert.deepEqual([count(g, 'killer'), count(g, 'police')], [1, 1]);
  ({ g } = make({ n: 10, humans: H8, settings: { killers: 9, police: 0 } }));
  assert.deepEqual([count(g, 'killer'), count(g, 'police')], [2, 1]);

  const r = make({ n: 8, humans: H8, settings: { killers: 2, police: 2 } });
  assert.deepEqual([count(r.g, 'killer'), count(r.g, 'police'), count(r.g, 'citizen')], [2, 2, 4]);
  r.g.start();
  for (const { m } of find(r.events, 'start')) {
    assert.deepEqual([m.killers, m.police, m.citizens], [2, 2, 4]);
    const me = r.g.byId.get(m.you);
    if (me.role === 'citizen') assert.deepEqual(m.team, []);
    else {
      assert.equal(m.team.length, 1);
      assert.equal(r.g.byId.get(m.team[0]).role, me.role, 'yalnızca aynı roldeki arkadaş bildirilir');
    }
  }
});

test('iki katil: biri yakalanınca oyun sürer, ikisi de yakalanınca polis kazanır', () => {
  const { g, events } = make({ n: 8, humans: H8, settings: { killers: 2, police: 2 } });
  setTeams(g, ['h1', 'h2'], ['h3', 'h4']);
  advance(g, 0.5);
  lookAt(g, 'h3', 'h1');
  assert.deepEqual(g.accuse('h3', 'h1'), { ok: true, correct: true });
  assert.equal(g.phase, 'playing');
  const died = find(events, 'died')[0].m;
  assert.deepEqual([died.id, died.reason, died.killersLeft], ['h1', 'caught', 1]);
  lookAt(g, 'h1', 'h5');
  assert.ok(g.wink('h1', 'h5').error, 'yakalanan katil işaret yapamaz');
  lookAt(g, 'h4', 'h2');
  assert.equal(g.accuse('h4', 'h2').correct, true);
  assert.equal(g.phase, 'over');
  const over = find(events, 'over')[0].m;
  assert.deepEqual([over.winner, over.reason], ['police', 'caught']);
});

test('takım arkadaşına işaret yapılamaz, polis takım arkadaşını suçlayamaz', () => {
  const { g, events } = make({ n: 8, humans: H8, settings: { killers: 2, police: 2 } });
  setTeams(g, ['h1', 'h2'], ['h3', 'h4']);
  advance(g, 0.5);
  lookAt(g, 'h1', 'h2');
  assert.match(g.wink('h1', 'h2').error, /takım/);
  lookAt(g, 'h3', 'h4');
  assert.match(g.accuse('h3', 'h4').error, /takım/);
  assert.equal(find(events, 'signal').length, 0);
  assert.equal(g.byId.get('h3').lives, g.cfg.policeLives, 'reddedilen suçlama hak götürmez');
});

test('iki polis: hakkı biten suçlayamaz; ikisinin de hakkı bitince katiller kazanır', () => {
  const { g, events } = make({ n: 8, humans: H8, settings: { police: 2, policeLives: 1 } });
  setTeams(g, ['h1'], ['h3', 'h4']);
  advance(g, 0.5);
  lookAt(g, 'h3', 'h5');
  assert.equal(g.accuse('h3', 'h5').correct, false);
  assert.equal(g.phase, 'playing', 'diğer polisin hakkı var');
  advance(g, g.cfg.accuseCooldown + 0.1);
  lookAt(g, 'h3', 'h6');
  assert.match(g.accuse('h3', 'h6').error, /hakkın kalmadı/);
  lookAt(g, 'h4', 'h6');
  assert.equal(g.accuse('h4', 'h6').correct, false);
  const over = find(events, 'over')[0].m;
  assert.deepEqual([over.winner, over.reason], ['killer', 'policeOut']);
});

test('2 katil + 2 polisli tüm botlu oyun da bitiyor', () => {
  const slots = Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, name: `B${i}`, bot: true }));
  for (let seed = 1; seed <= 15; seed++) {
    const g = new Game({ slots, settings: { revealSeconds: 1, killers: 2, police: 2 }, rng: mulberry32(seed) });
    assert.deepEqual([count(g, 'killer'), count(g, 'police')], [2, 2]);
    while (g.phase !== 'over' && g.time < 900) g.update(0.1);
    assert.equal(g.phase, 'over', `seed ${seed} bitmedi`);
  }
});

test('çeviriler: her dil tam; sunucunun her hata kodunun çevirisi var', async () => {
  const { DICT, LANGS } = await import('../public/i18n.js');
  const { readFileSync } = await import('node:fs');
  const trKeys = Object.keys(DICT.tr).sort();
  for (const lang of Object.keys(LANGS)) {
    assert.deepEqual(Object.keys(DICT[lang]).sort(), trKeys, `${lang} sözlüğünde eksik/fazla anahtar`);
  }
  const src = ['../src/game.js', '../src/rooms.js'].map((p) => readFileSync(new URL(p, import.meta.url), 'utf8')).join('\n');
  const codes = new Set([...src.matchAll(/code: '(\w+)'/g), ...src.matchAll(/err\(client, '[^']*', '(\w+)'\)/g)].map((m) => m[1]));
  assert.ok(codes.size >= 14, 'hata kodları bulunamadı');
  for (const c of codes) assert.ok(DICT.tr[`err.${c}`], `err.${c} çevirisi yok`);
});

test('yuvarlak masa: herkes çemberde ve ortaya dönük; yan komşular uzakta; bakışlar sunucunun düzeniyle koltuk koltuk eşlenir', async () => {
  const { tableLayout, GazeMap, RING } = await import('../public/layout.js');
  const yawTo = (a, b) => Math.atan2(b[2] - a[2], b[0] - a[0]);
  const diff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  for (const n of [4, 6, 8, 10]) {
    const { g } = make({ n, humans: H8 });
    const canon = [];
    for (const p of g.players) canon[p.seat] = p.pos; // sunucunun gönderdiği konumlar
    for (const you of [0, n - 1]) {
      const L = tableLayout(n, you);
      const view = L.pos;
      assert.ok(view[you][0] < 0 && Math.abs(view[you][2]) < 1e-9, 'izleyici masanın bir yanında, ortaya (+X) bakar');
      // Herkes (izleyici dahil) masanın ortasındaki aynı çemberde oturur, gövdesi masanın ortasına dönük
      const rad = view.map((p) => Math.hypot(p[0], p[2]));
      assert.ok(Math.max(...rad) - Math.min(...rad) < 1e-9, 'herkes aynı çemberde');
      assert.ok(Math.abs(rad[0] - L.table.seat) < 1e-9);
      assert.ok(L.table.r > 0.5 && L.table.r < L.table.seat, 'masa oturanların içinde');
      for (const f of L.face) assert.deepEqual(f, [0, 0]);
      const dists = [];
      for (let j = 0; j < n; j++) {
        if (j === you) continue;
        assert.ok(diff(yawTo(view[you], view[j]), 0) <= (RING.side[1] + 0.01) * (Math.PI / 180), `n=${n}: koltuk ${j} çok yanda`);
        dists.push(Math.hypot(view[j][0] - view[you][0], view[j][2] - view[you][2]));
      }
      for (let k = 0; k < dists.length; k++) assert.ok(Math.abs(dists[k] - dists[dists.length - 1 - k]) < 1e-9, 'simetrik');
      // Yan komşular izleyiciye en yakın olanlar ama en az nearMin uzakta (düzgün yuvarlak masadaki gibi dibinde değil)
      assert.ok(Math.abs(dists[0] - Math.min(...dists)) < 1e-9);
      assert.ok(Math.min(...dists) >= RING.nearMin - 0.01, `n=${n}: yan komşular çok yakın`);
      for (let k = 1; k < n - 1; k++) {
        const p = view[(you + k) % n];
        const q = view[(you + k + 1) % n];
        assert.ok(Math.hypot(p[0] - q[0], p[2] - q[2]) >= RING.spacing - 0.01, `n=${n}: yan yana oturanlar çok yakın`);
      }
      const gm = new GazeMap(canon, view);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          assert.ok(diff(gm.toView(i, yawTo(canon[i], canon[j])), yawTo(view[i], view[j])) < 1e-9);
          assert.ok(diff(gm.toCanon(i, yawTo(view[i], view[j])), yawTo(canon[i], canon[j])) < 1e-9);
        }
        // Komşuların arası da tutarlı: gidip gelince aynı açı (erişilebilir ±100° içinde)
        for (let d = -100; d <= 100; d += 7) {
          const y = gm.v[i].ref + (d * Math.PI) / 180;
          assert.ok(diff(gm.toView(i, gm.toCanon(i, y)), y) < 1e-9);
        }
      }
    }
  }
});

test('süre sınırı: son dakikada herkese bir kez geri sayım duyurulur; süre dolarsa katil kaybeder', () => {
  const { g, events } = make({ settings: { killerTimeLimit: 3, countdownSeconds: 1 } });
  setRoles(g, 'h1', 'h2');
  assert.equal(g.timeLeft(), 3, 'oyun başlamadan süre işlemez');
  while (g.phase === 'reveal') g.update(0.1);
  assert.ok(g.timeLeft() > 2.8, 'süre rol kartı kapanınca başlar');
  while (g.timeLeft() > 1.15) g.update(0.1);
  assert.equal(find(events, 'countdown').length, 0, 'son saniyelerden önce geri sayım yok');
  while (!find(events, 'countdown').length) g.update(0.1);
  assert.ok(g.timeLeft() <= 1 && g.timeLeft() > 0.85, 'geri sayım son saniyede başlar');
  const cd = find(events, 'countdown');
  assert.equal(cd.length, 1);
  assert.equal(cd[0].to, null, 'herkese gider');
  assert.ok(cd[0].m.left > 0 && cd[0].m.left <= 1);
  const start = g.playStart;
  while (g.phase !== 'over' && g.time < 10) g.update(0.1);
  assert.equal(g.winner, 'police');
  assert.equal(g.reason, 'timeUp');
  assert.ok(Math.abs(g.time - start - 3) < 0.11, 'tam süre dolunca biter');
  assert.equal(find(events, 'countdown').length, 1, 'geri sayım bir kez duyurulur');
  assert.equal(find(events, 'over')[0].m.reason, 'timeUp');
});

test('süre dolmadan tüm vatandaşlar ölürse katil kazanır (süre bitişi oyunu sonradan değiştirmez)', () => {
  const { g } = make({ n: 4, humans: ['h1', 'h2', 'h3', 'h4'], settings: { killerTimeLimit: 5, countdownSeconds: 1 } });
  setRoles(g, 'h1', 'h2');
  while (g.phase === 'reveal') g.update(0.1);
  for (const id of ['h3', 'h4']) g.kill(g.byId.get(id), 'noticed');
  assert.equal(g.winner, 'killer');
  advance(g, 6);
  assert.equal(g.winner, 'killer');
  assert.equal(g.reason, 'allDead');
});

test('cinsiyet: start mesajında herkesin cinsiyeti ve süre bilgisi var; geçersiz değer erkek sayılır', () => {
  const slots = [
    { id: 'h1', name: 'A', gender: 'f' }, { id: 'h2', name: 'B', gender: 'm' },
    { id: 'h3', name: 'C', gender: 'x' }, { id: 'h4', name: 'D' },
  ];
  const events = [];
  const g = new Game({ slots, settings: { revealSeconds: 0.2 }, rng: mulberry32(1), emit: (m, to) => events.push({ m, to }) });
  g.start();
  const s = find(events, 'start')[0].m;
  assert.deepEqual(Object.fromEntries(s.seats.map((x) => [x.id, x.gender])), { h1: 'f', h2: 'm', h3: 'm', h4: 'm' });
  assert.equal(s.timeLimit, 300);
  assert.equal(s.countdown, 60);
});

test('tüm botlu oyun bitiyor (zamanaşımı yok)', () => {
  const slots = Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, name: `B${i}`, bot: true }));
  for (let seed = 1; seed <= 20; seed++) {
    const g = new Game({ slots, settings: { revealSeconds: 1 }, rng: mulberry32(seed) });
    while (g.phase !== 'over' && g.time < 900) g.update(0.1);
    assert.equal(g.phase, 'over', `seed ${seed} bitmedi`);
  }
});
