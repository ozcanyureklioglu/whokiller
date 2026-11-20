// Uçtan uca test: gerçek HTTP + WebSocket sunucusu, Node'un yerleşik WebSocket istemcisiyle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../src/app.js';

let srv;
test.before(async () => {
  srv = await startServer({ port: 0, host: '127.0.0.1', rooms: { overrides: { revealSeconds: 0.3 } } });
});
test.after(async () => {
  await srv.close();
});

function connect(port = srv.port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const msgs = [];
  const waiters = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    msgs.push(m);
    for (const w of [...waiters]) {
      if (w.pred(m)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(m);
      }
    }
  };
  const c = {
    ws,
    msgs,
    send: (o) => ws.send(JSON.stringify(o)),
    wait(type, pred = () => true, ms = 4000) {
      const hit = msgs.find((m) => m.t === type && pred(m));
      if (hit) return Promise.resolve(hit);
      return new Promise((resolve, reject) => {
        const w = { pred: (m) => m.t === type && pred(m), resolve };
        waiters.push(w);
        setTimeout(() => {
          waiters.splice(waiters.indexOf(w), 1);
          reject(new Error(`zaman aşımı: ${type}`));
        }, ms).unref();
      });
    },
    close: () => ws.close(),
  };
  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve(c);
    ws.onerror = () => reject(new Error('bağlanılamadı'));
  });
}

test('statik dosyalar ve sağlık kontrolü', async () => {
  const base = `http://127.0.0.1:${srv.port}`;
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /WhoKiller/);
  assert.equal((await fetch(`${base}/main.js`)).status, 200);
  assert.equal((await fetch(`${base}/..%2fserver.js`)).status, 403);
  assert.equal((await fetch(`${base}/yok.html`)).status, 404);
});

test('nasıl oynanır: her adımın her dilde görseli ve metni var, görseller webp olarak sunulur', async () => {
  const { readFileSync } = await import('node:fs');
  const { DICT, LANGS } = await import('../public/i18n.js');
  const src = readFileSync(new URL('../public/main.js', import.meta.url), 'utf8');
  const steps = JSON.parse(src.match(/const HOWTO = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
  assert.ok(steps.length >= 6, 'adımlar bulunamadı');
  const base = `http://127.0.0.1:${srv.port}`;
  for (const lang of Object.keys(LANGS)) {
    for (const s of steps) {
      const res = await fetch(`${base}/howto/${s}-${lang}.webp`);
      assert.equal(res.status, 200, `howto/${s}-${lang}.webp yok`);
      assert.equal(res.headers.get('content-type'), 'image/webp');
      assert.ok((await res.arrayBuffer()).byteLength > 2000);
      assert.ok(DICT[lang][`ht.${s}.t`] && DICT[lang][`ht.${s}.b`], `ht.${s} metni (${lang}) yok`);
    }
  }
});

test('hızlı oyun: önce ayar ekranı (kodla katılınamaz), sonra rol, koltuklar, bakış yayını, yetkisiz eylemler', async () => {
  const c = await connect();
  await c.wait('welcome');
  c.send({ t: 'join', name: 'Tester', gender: 'f', quick: true });
  const lobby = await c.wait('lobby');
  assert.equal(lobby.solo, true);
  // Lobide katilin süresi bilgisi (5 dk, son 1 dk geri sayım) ve oyuncunun cinsiyeti
  assert.equal(lobby.settings.timeLimit, 300);
  assert.equal(lobby.settings.countdown, 60);
  assert.equal(lobby.players[0].gender, 'f');
  await new Promise((r) => setTimeout(r, 150));
  assert.ok(!c.msgs.some((m) => m.t === 'start'), 'hızlı oyun ayar ekranını atlamamalı');
  // Hızlı oyun odası tek kişilik: kodu bilinse de katılınamaz.
  const intruder = await connect();
  await intruder.wait('welcome');
  intruder.send({ t: 'join', name: 'Davetsiz', room: lobby.code });
  assert.equal((await intruder.wait('err')).code, 'noRoom');
  intruder.close();
  c.send({ t: 'settings', total: 6 });
  await c.wait('lobby', (m) => m.settings.total === 6);
  c.send({ t: 'start' });
  const start = await c.wait('start');
  assert.ok(['killer', 'police', 'citizen'].includes(start.role));
  assert.equal(start.seats.length, 6);
  assert.equal(start.seats.filter((s) => s.id === start.you).length, 1);
  assert.equal(start.signal, 'wink');
  // Cinsiyet: oyuncununki seçtiği gibi, botlarınki isimlerine göre; herkesin görünüşü buna göre çizilir
  assert.equal(start.seats.find((s) => s.id === start.you).gender, 'f');
  assert.ok(start.seats.every((s) => s.gender === 'm' || s.gender === 'f'));
  assert.equal(start.timeLimit, 300);
  await c.wait('phase', (m) => m.phase === 'playing');
  c.send({ t: 'gaze', y: 1.5, p: 0.1 });
  const g = await c.wait('g');
  assert.ok(g.g.length >= 6);
  // Yetkisiz / geçersiz eylemler hata döndürür, sunucu çökmez.
  const other = start.seats.find((s) => s.id !== start.you).id;
  c.send({ t: 'die' });
  const err = await c.wait('err');
  assert.ok(err.msg);
  c.send({ t: 'accuse', target: 'yok' });
  c.send({ t: 'garbage' });
  ws_raw(c, 'bu json değil');
  c.send({ t: 'wink', target: other });
  c.send({ t: 'gaze', y: 'abc', p: null });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(c.ws.readyState, WebSocket.OPEN);
  c.close();
});

/** Diğerleri "Hazırım" der; kurucu herkesi hazır görünce başlatır. */
async function readyAndStart(host, ...others) {
  for (const o of others) o.send({ t: 'ready', on: true });
  await host.wait('lobby', (m) => m.players.length === others.length + 1 && m.players.every((p) => p.id === m.hostId || p.ready));
  host.send({ t: 'start' });
}

function ws_raw(c, s) {
  c.ws.send(s);
}

test('oda kurma, katılma, ayarlar, başlatma, ayrılma ve oda temizliği', async () => {
  const a = await connect();
  const b = await connect();
  await a.wait('welcome');
  await b.wait('welcome');

  a.send({ t: 'join', name: 'Ayşe', create: true });
  const lobbyA = await a.wait('lobby');
  assert.match(lobbyA.code, /^[A-Z2-9]{5}$/);
  assert.equal(lobbyA.hostId, (await a.wait('welcome')).id);

  b.send({ t: 'join', name: 'Ayşe', room: lobbyA.code.toLowerCase() }); // aynı isim + küçük harf kod
  const lobbyB = await b.wait('lobby');
  assert.equal(lobbyB.players.length, 2);
  assert.notEqual(lobbyB.players[0].name, lobbyB.players[1].name, 'aynı isim numaralanmalı');
  await a.wait('lobby', (m) => m.players.length === 2);

  // Kurucu olmayan ne ayar değiştirebilir ne başlatabilir.
  b.send({ t: 'settings', total: 9 });
  b.send({ t: 'start' });
  assert.match((await b.wait('err')).msg, /kurucu/);

  a.send({ t: 'settings', total: 5, signal: 'tongue', difficulty: 'hard', policeLives: 3 });
  const upd = await a.wait('lobby', (m) => m.settings.total === 5);
  assert.equal(upd.settings.signal, 'tongue');
  assert.equal(upd.settings.difficulty, 'hard');
  assert.equal(upd.settings.policeLives, 3);

  a.send({ t: 'settings', total: 99, signal: 'saçma' }); // sınırlara çekilir, geçersiz tür yok sayılır
  const clamped = await a.wait('lobby', (m) => m.settings.total === 10);
  assert.equal(clamped.settings.signal, 'tongue');
  a.send({ t: 'settings', total: 5 });
  await a.wait('lobby', (m) => m.settings.total === 5);

  await readyAndStart(a, b);
  const sa = await a.wait('start');
  const sb = await b.wait('start');
  assert.notEqual(sa.you, sb.you);
  assert.equal(sa.seats.length, 5);
  assert.deepEqual(sa.seats.map((s) => s.id).sort(), sb.seats.map((s) => s.id).sort());
  assert.equal(sa.signal, 'tongue');
  const police = [sa, sb].find((s) => s.role === 'police');
  if (police) assert.equal(police.lives, 3);

  // Oyun başlamışken yeni oyuncu giremez.
  const late = await connect();
  await late.wait('welcome');
  late.send({ t: 'join', name: 'Geç', room: lobbyA.code });
  assert.match((await late.wait('err')).msg, /devam/);
  late.close();

  // B oyundan çıkar: oyun A için devam eder, oda yaşar.
  b.send({ t: 'leave' });
  await b.wait('left');
  await new Promise((r) => setTimeout(r, 250));
  assert.equal(srv.rooms.rooms.size >= 1, true);
  assert.equal(a.ws.readyState, WebSocket.OPEN);

  // A da çıkınca oda silinir.
  const before = srv.rooms.rooms.size;
  a.send({ t: 'leave' });
  await a.wait('left');
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(srv.rooms.rooms.size, before - 1);
  a.close();
  b.close();
});

test('lobi: katil/polis sayısı oyuncu sayısına göre sınırlanır ve oyuna geçer', async () => {
  const a = await connect();
  a.send({ t: 'join', name: 'Kurucu', create: true });
  const l0 = await a.wait('lobby');
  assert.deepEqual([l0.settings.killers, l0.settings.police, l0.settings.maxRoles], [1, 1, 1]); // 6 kişi
  a.send({ t: 'settings', total: 8, killers: 2, police: 2 });
  const l1 = await a.wait('lobby', (m) => m.settings.total === 8);
  assert.deepEqual([l1.settings.killers, l1.settings.police, l1.settings.maxRoles], [2, 2, 2]);
  a.send({ t: 'settings', total: 4 }); // oyuncu azalınca sayılar sınıra çekilir
  const l2 = await a.wait('lobby', (m) => m.settings.total === 4);
  assert.deepEqual([l2.settings.killers, l2.settings.police, l2.settings.maxRoles], [1, 1, 1]);
  a.send({ t: 'settings', total: 10, killers: 9, police: 'x' });
  const l3 = await a.wait('lobby', (m) => m.settings.total === 10);
  assert.deepEqual([l3.settings.killers, l3.settings.police], [2, 1]);
  a.send({ t: 'settings', total: 8, police: 2 });
  await a.wait('lobby', (m) => m.settings.total === 8 && m.settings.police === 2 && m.settings.killers === 2);
  a.send({ t: 'start' });
  const st = await a.wait('start');
  assert.deepEqual([st.killers, st.police, st.citizens, st.seats.length], [2, 2, 4, 8]);
  assert.equal(st.team.length, st.role === 'citizen' ? 0 : 1);
  a.close();
});

test('olmayan oda koduna katılınamaz', async () => {
  const c = await connect();
  await c.wait('welcome');
  c.send({ t: 'join', name: 'X', room: 'ZZZZZ' });
  assert.match((await c.wait('err')).msg, /bulunamadı/);
  c.close();
});

test('hazır sistemi: kurucu, herkes hazır olmadan başlatamaz; ayar değişince hazırlar sıfırlanır', async () => {
  const a = await connect();
  const b = await connect();
  await a.wait('welcome');
  const idb = (await b.wait('welcome')).id;
  a.send({ t: 'join', name: 'A', create: true });
  const lobby = await a.wait('lobby');
  b.send({ t: 'join', name: 'B', room: lobby.code });
  const two = await a.wait('lobby', (m) => m.players.length === 2);
  assert.equal(two.players.find((p) => p.id === idb).ready, false, 'yeni gelen hazır değil');
  a.send({ t: 'start' });
  assert.equal((await a.wait('err')).code, 'notReady');
  b.send({ t: 'ready', on: true });
  await a.wait('lobby', (m) => m.players.find((p) => p.id === idb)?.ready === true);
  b.send({ t: 'ready', on: false }); // geri al
  await a.wait('lobby', (m) => m.players.length === 2 && m.players.every((p) => !p.ready));
  b.send({ t: 'ready', on: true });
  await a.wait('lobby', (m) => m.players.find((p) => p.id === idb)?.ready === true);
  a.send({ t: 'settings', total: 7 }); // ayar değişti → herkes yeniden onaylamalı
  await a.wait('lobby', (m) => m.settings.total === 7 && m.players.every((p) => !p.ready));
  a.send({ t: 'start' });
  await a.wait('err', (m) => m.code === 'notReady' && a.msgs.filter((x) => x.t === 'err').length >= 2);
  b.send({ t: 'ready', on: true });
  await a.wait('lobby', (m) => m.settings.total === 7 && m.players.find((p) => p.id === idb)?.ready === true);
  a.send({ t: 'start' });
  assert.equal((await b.wait('start')).total, 7);
  a.close();
  b.close();
});

test('Esc menüsü: tek kişilik oyunda oyun durur, devam edince sürer', async () => {
  const c = await connect();
  await c.wait('welcome');
  c.send({ t: 'join', name: 'Solo', quick: true });
  await c.wait('lobby');
  c.send({ t: 'start' });
  await c.wait('start');
  await c.wait('phase', (m) => m.phase === 'playing');
  c.send({ t: 'pause', on: true });
  assert.equal((await c.wait('paused')).on, true);
  await new Promise((r) => setTimeout(r, 200)); // yoldaki mesajlar gelsin
  const before = c.msgs.filter((m) => m.t === 'g').length;
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(c.msgs.filter((m) => m.t === 'g').length, before, 'duraklamada oyun ilerlememeli');
  c.send({ t: 'pause', on: false });
  await c.wait('paused', (m) => m.on === false);
  const n = c.msgs.length;
  await c.wait('g', () => c.msgs.length > n);
  c.close();
});

test('çok oyunculu oyunda duraklatma yok; oyundan çıkan herkese bildirilir', async () => {
  const a = await connect();
  const b = await connect();
  const ida = (await a.wait('welcome')).id;
  const idb = (await b.wait('welcome')).id;
  a.send({ t: 'join', name: 'A', create: true });
  const lobby = await a.wait('lobby');
  assert.equal(lobby.solo, false);
  b.send({ t: 'join', name: 'B', room: lobby.code });
  await b.wait('lobby');
  await readyAndStart(a, b);
  await a.wait('start');
  await b.wait('start');
  b.send({ t: 'pause', on: true });
  assert.equal((await b.wait('paused')).on, false, 'iki insan varken oyun durmaz');
  a.send({ t: 'leave' }); // kurucu menüden çıkar
  await a.wait('left');
  const q = await b.wait('quit');
  assert.equal(q.id, ida);
  assert.ok(['killer', 'police', 'citizen'].includes(q.role));
  assert.equal((await b.wait('host')).id, idb, 'kurucu çıkınca yeni kurucu bildirilir');
  a.close();
  b.close();
});

test('bağlantısı kopan oyuncunun çıkışı herkese bildirilir ve oyun çökmez', async () => {
  const a = await connect();
  const b = await connect();
  await a.wait('welcome');
  await b.wait('welcome');
  a.send({ t: 'join', name: 'A', create: true });
  const lobby = await a.wait('lobby');
  b.send({ t: 'join', name: 'B', room: lobby.code });
  await b.wait('lobby');
  await readyAndStart(a, b);
  await a.wait('start');
  await b.wait('start');
  const idb = (await b.wait('welcome')).id;
  b.close(); // sert kopma
  assert.equal((await a.wait('quit')).id, idb);
  await new Promise((r) => setTimeout(r, 400));
  const g = await a.wait('g');
  assert.ok(g.g.length >= 4, 'oyun akmaya devam etmeli');
  a.close();
  await new Promise((r) => setTimeout(r, 100));
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastOf = (c, type) => c.msgs.filter((m) => m.t === type).at(-1);

test('herkese açık oda ana ekranda listelenir, özel oda ve hızlı oyun listelenmez; listeden katılınır', async () => {
  const watcher = await connect();
  await watcher.wait('welcome');
  await watcher.wait('rooms'); // bağlanınca liste gelir
  const host = await connect();
  await host.wait('welcome');
  host.send({ t: 'join', name: 'Açık', gender: 'f', create: true, public: true });
  const lobby = await host.wait('lobby');
  assert.equal(lobby.public, true);
  assert.ok(lobby.expiresIn > 3500 && lobby.expiresIn <= 3600, 'oda ömrü (60 dk) lobide bildirilir');
  const listed = await watcher.wait('rooms', (m) => m.rooms.some((r) => r.code === lobby.code));
  const row = listed.rooms.find((r) => r.code === lobby.code);
  assert.deepEqual([row.host, row.players, row.max, row.status], ['Açık', 1, 10, 'lobby']);

  // Özel oda ve hızlı oyun listede görünmez; özel odaya kodla girilir
  const priv = await connect();
  await priv.wait('welcome');
  priv.send({ t: 'join', name: 'Gizli', create: true, public: false });
  const plobby = await priv.wait('lobby');
  assert.equal(plobby.public, false);
  const solo = await connect();
  await solo.wait('welcome');
  solo.send({ t: 'join', name: 'Tek', quick: true, public: true });
  const slobby = await solo.wait('lobby');
  await sleep(500);
  const codes = lastOf(watcher, 'rooms').rooms.map((r) => r.code);
  assert.ok(codes.includes(lobby.code));
  assert.ok(!codes.includes(plobby.code), 'özel oda listelenmemeli');
  assert.ok(!codes.includes(slobby.code), 'hızlı oyun listelenmemeli');
  const byCode = await connect();
  await byCode.wait('welcome');
  byCode.send({ t: 'join', name: 'Davetli', room: plobby.code });
  await byCode.wait('lobby', (m) => m.code === plobby.code);

  // Listeden katıl: kişi sayısı listede güncellenir
  watcher.send({ t: 'join', name: 'Gelen', room: row.code });
  await watcher.wait('lobby', (m) => m.code === lobby.code);
  await host.wait('lobby', (m) => m.players.length === 2);
  const out = await connect();
  await out.wait('welcome');
  const now = await out.wait('rooms');
  assert.equal(now.rooms.find((r) => r.code === lobby.code).players, 2);

  // Kurucu odayı özel yaparsa listeden düşer ("Hazırım"lar sıfırlanmaz: oyun ayarı değil)
  watcher.send({ t: 'ready', on: true });
  await host.wait('lobby', (m) => m.players.some((p) => p.ready));
  host.send({ t: 'settings', public: false });
  const hidden = await host.wait('lobby', (m) => m.public === false);
  assert.ok(hidden.players.some((p) => p.ready), 'görünürlük değişince hazırlar sıfırlanmamalı');
  await out.wait('rooms', (m) => !m.rooms.some((r) => r.code === lobby.code));
  // Kurucu olmayan görünürlüğü değiştiremez
  watcher.send({ t: 'settings', public: true });
  await sleep(200);
  assert.equal(lastOf(host, 'lobby').public, false);
  for (const c of [watcher, host, priv, solo, byCode, out]) c.close();
  await sleep(100);
});

test('kurucu oyuncu çıkarabilir (lobide ve oyun sırasında); kurucu olmayan çıkaramaz', async () => {
  const h = await connect();
  await h.wait('welcome');
  h.send({ t: 'join', name: 'Kurucu', create: true });
  const lobby = await h.wait('lobby');
  const a = await connect();
  await a.wait('welcome');
  a.send({ t: 'join', name: 'Afk', room: lobby.code });
  await a.wait('lobby');
  const b = await connect();
  await b.wait('welcome');
  b.send({ t: 'join', name: 'Normal', room: lobby.code });
  await b.wait('lobby');
  const full = await h.wait('lobby', (m) => m.players.length === 3);
  const ids = Object.fromEntries(full.players.map((p) => [p.name, p.id]));

  b.send({ t: 'kick', id: ids.Afk }); // kurucu değil: yok sayılır
  await sleep(200);
  assert.ok(!a.msgs.some((m) => m.t === 'kicked'));
  h.send({ t: 'kick', id: ids.Kurucu }); // kendini çıkaramaz
  await sleep(100);
  assert.ok(!h.msgs.some((m) => m.t === 'kicked'));

  // Lobide çıkarma: AFK oyuncu ana ekrana döner (açık odalar listesini alır), "Hazırım" beklenmez
  const before = a.msgs.length;
  h.send({ t: 'kick', id: ids.Afk });
  await a.wait('kicked');
  await sleep(100);
  assert.ok(a.msgs.slice(before).some((m) => m.t === 'rooms'), 'çıkarılan liste almalı');
  const two = await h.wait('lobby', (m) => m.players.length === 2 && m.players.some((p) => p.name === 'Normal'));
  assert.ok(!two.players.some((p) => p.name === 'Afk'));

  // Oyunda çıkarma: herkese "kurucu çıkardı" diye duyurulur, oyun sürer
  b.send({ t: 'ready', on: true });
  await h.wait('lobby', (m) => m.players.find((p) => p.name === 'Normal')?.ready);
  h.send({ t: 'start' });
  await h.wait('start');
  await b.wait('start');
  h.send({ t: 'kick', id: ids.Normal });
  await b.wait('kicked');
  const q = await h.wait('quit', (m) => m.id === ids.Normal);
  assert.equal(q.reason, 'kicked');
  for (const c of [h, a, b]) c.close();
  await sleep(100);
});

test('oda süresi: kapanmadan önce uyarı, süre dolunca kapanır; oyun sürüyorsa oyun bitince; sunucu oda sınırı', async () => {
  // Kısa ömürlü odalar: 0,8 sn ömür, 0,4 sn kala uyarı, oyun bitince 0,3 sn sonuç ekranı; en fazla 2 oda
  const s2 = await startServer({
    port: 0, host: '127.0.0.1',
    rooms: {
      overrides: { revealSeconds: 0.2, killerTimeLimit: 1.5, countdownSeconds: 0.5 },
      roomCfg: { lifetimeMin: 0.8 / 60, warnMin: 0.4 / 60, overGraceSec: 0.3, maxRooms: 2, listThrottleMs: 50 },
    },
  });
  try {
    // 1) Lobide bekleyen oda: uyarı, sonra kapanır ve listeden düşer
    const c = await connect(s2.port);
    await c.wait('welcome');
    c.send({ t: 'join', name: 'A', create: true, public: true });
    const lobby = await c.wait('lobby');
    const w = await c.wait('roomWarn');
    assert.ok(w.left > 0 && w.left <= 1);
    assert.equal((await c.wait('closed')).reason, 'expired');
    await c.wait('rooms', (m) => !m.rooms.some((r) => r.code === lobby.code));
    assert.equal(s2.rooms.rooms.size, 0, 'oda silinmeli');

    // 2) Süre oyun sırasında dolarsa: haber verilir, oyun bitip sonuç ekranından sonra kapanır
    const d = await connect(s2.port);
    await d.wait('welcome');
    d.send({ t: 'join', name: 'B', quick: true });
    await d.wait('lobby');
    d.send({ t: 'settings', total: 4 });
    d.send({ t: 'start' });
    await d.wait('start');
    await d.wait('roomExpiring');
    assert.ok(!d.msgs.some((m) => m.t === 'closed'), 'oyun sürerken kapanmamalı');
    await d.wait('over');
    assert.ok(!d.msgs.some((m) => m.t === 'closed'), 'sonuç ekranı görülmeden kapanmamalı');
    assert.equal((await d.wait('closed')).reason, 'expired');
    assert.equal(s2.rooms.rooms.size, 0);

    // 3) Sunucuda en fazla 2 oda
    const e1 = await connect(s2.port);
    const e2 = await connect(s2.port);
    const e3 = await connect(s2.port);
    for (const e of [e1, e2, e3]) await e.wait('welcome');
    e1.send({ t: 'join', name: 'E1', create: true });
    await e1.wait('lobby');
    e2.send({ t: 'join', name: 'E2', quick: true });
    await e2.wait('lobby');
    e3.send({ t: 'join', name: 'E3', create: true });
    assert.equal((await e3.wait('err')).code, 'serverFull');
    for (const x of [c, d, e1, e2, e3]) x.close();
  } finally {
    await s2.close();
  }
});
