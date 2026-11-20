// main.js — ağ, arayüz, girdi (fare / dokunmatik / klavye) ve oyun döngüsü.
import { loadThree, World } from './scene.js';
import { t, LANGS, detectLang, getLang, setLang, applyStatic } from './i18n.js';
import { tableLayout, GazeMap } from './layout.js';

const $ = (s) => document.querySelector(s);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrapPi = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

const MAX_REL_YAW = 1.2; // yuvarlak masada yan komşular ~46–52°'de: en fazla ~70° sağa/sola dönülür
const touchDevice = matchMedia('(pointer: coarse)').matches;
const params = new URLSearchParams(location.search);
const QUALITY_KEYS = ['auto', 'high', 'medium', 'low'];
const showStats = params.has('stats'); // ?stats=1 → FPS / draw call paneli

const el = {
  canvas: $('#gl'), home: $('#home'), lobby: $('#lobby'), hud: $('#hud'), over: $('#over'),
  name: $('#name'), gender: $('#gender'), joinCode: $('#joinCode'), connState: $('#connState'),
  timeNote: $('#timeNote'), timer: $('#timer'), timerVal: $('#timerVal'),
  btnQuick: $('#btnQuick'), btnCreate: $('#btnCreate'), btnJoin: $('#btnJoin'),
  roomCode: $('#roomCode'), btnCopy: $('#btnCopy'), plist: $('#plist'),
  total: $('#total'), totalVal: $('#totalVal'), signal: $('#signal'), difficulty: $('#difficulty'), lives: $('#lives'),
  killers: $('#killers'), policeCount: $('#policeCount'), roleNote: $('#roleNote'),
  botNote: $('#botNote'), readyNote: $('#readyNote'), btnStart: $('#btnStart'), btnLeave: $('#btnLeave'),
  roleBadge: $('#roleBadge'), roleTag: $('#roleTag'), roleSub: $('#roleSub'),
  stAlive: $('#stAlive'), stLives: $('#stLives'), feed: $('#feed'),
  crosshair: $('#crosshair'), focusFrame: $('#focusFrame'), focusLabel: $('#focusLabel'),
  closeup: $('#closeup'), closeupName: $('#closeupName'), stWatch: $('#stWatch'),
  noticed: $('#noticed'), noticedBar: $('#noticedBar'), lookHint: $('#lookHint'),
  actionBtn: $('#actionBtn'), actionLabel: $('#actionLabel'), actionKey: $('#actionKey'), cdFill: $('#cdFill'),
  flash: $('#flash'), joy: $('#joy'), joyKnob: $('#joy i'),
  revealCard: $('#revealCard'), revealRole: $('#revealRole'), revealDesc: $('#revealDesc'), revealBar: $('#revealBar'),
  overTitle: $('#overTitle'), overResult: $('#overResult'), overSub: $('#overSub'), overRoles: $('#overRoles'),
  btnAgain: $('#btnAgain'), btnHome: $('#btnHome'), overWait: $('#overWait'),
  fatal: $('#fatal'), toasts: $('#toasts'), quality: $('#quality'), lang: $('#lang'),
  codeRow: $('#codeRow'), soloHead: $('#soloHead'),
  menuBtn: $('#menuBtn'), pause: $('#pause'), pauseTitle: $('#pauseTitle'), pauseNote: $('#pauseNote'),
  btnResume: $('#btnResume'), btnQuit: $('#btnQuit'),
  roomType: $('#roomType'), rooms: $('#rooms'), roomsEmpty: $('#roomsEmpty'), rlCount: $('#rlCount'),
  roomRow: $('#roomRow'), visSeg: $('#visSeg'), roomTimer: $('#roomTimer'), visNote: $('#visNote'),
  kickBox: $('#kickBox'), kickList: $('#kickList'),
  howto: $('#howto'), htStep: $('#htStep'), htImgBox: $('#htImgBox'), htImg: $('#htImg'), htTitle: $('#htTitle'),
  htText: $('#htText'), htDots: $('#htDots'), htPrev: $('#htPrev'), htNext: $('#htNext'), htClose: $('#htClose'),
};

const S = {
  ws: null, id: null, code: null, hostId: null, players: [], settings: null,
  gender: null, // 'm' | 'f': isim ekranında seçilir (karakterin görünüşü); seçilmeden oyuna girilmez
  roomType: 'public', // kurulacak odanın türü: 'public' (listede görünür) | 'private' (yalnızca kodla)
  publicRooms: [], // ana ekrandaki açık odalar (sunucunun "rooms" mesajı; endAt: kapanma anı)
  isPublic: false, roomEndAt: 0, // içinde bulunduğum odanın görünürlüğü ve kapanma anı
  game: null, world: null, locked: false, roleHidden: false,
  menu: false, menuAt: 0, unlocking: false, solo: false,
  gaze: new Map(), // id -> [yaw, pitch]: sunucunun yayınladığı son bakışlar
};
const view = { yaw: 0, pitch: 0, fwd: 0, fov: 70, fovTarget: 70 };
const keys = new Set();
window.__wk = { S, view }; // geliştirici/hata ayıklama için

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------
function toast(msg, kind = '') {
  const box = document.createElement('div');
  box.className = `toast ${kind}`;
  box.textContent = msg;
  el.toasts.appendChild(box);
  setTimeout(() => box.remove(), 2800);
}

function showScreen(name) {
  for (const k of ['home', 'lobby', 'over']) el[k].classList.toggle('hidden', k !== name);
  el.hud.classList.toggle('hidden', name !== 'hud' && name !== 'over');
  if (name === 'hud') el.over.classList.add('hidden');
}

function send(o) {
  if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(o));
}

function nameOf(id) {
  return S.game?.byId.get(id)?.name ?? '?';
}

function addFeed(text, cls = '') {
  const li = document.createElement('li');
  li.textContent = text;
  if (cls) li.className = cls;
  el.feed.appendChild(li);
  while (el.feed.children.length > 5) el.feed.firstChild.remove();
  setTimeout(() => li.remove(), 9000);
}

/** Fare kilidini programla bırakır (Esc menüsü açılmasın diye işaretlenir). */
function exitLock() {
  if (document.pointerLockElement) { S.unlocking = true; document.exitPointerLock(); }
}

function playerName() {
  const n = el.name.value.trim();
  try { localStorage.setItem('wk-name', n); } catch { /* yoksay */ }
  return n || t('home.defaultName');
}

function renderGender() {
  for (const b of el.gender.querySelectorAll('button[data-g]')) {
    b.setAttribute('aria-checked', String(b.dataset.g === S.gender));
  }
}

/** Odaya gir (hızlı oyun / oda kur / koda katıl). Cinsiyet seçilmediyse önce onu ister. */
function joinRoom(extra) {
  if (!S.gender) {
    toast(t('toast.pickGender'), 'bad');
    el.gender.classList.remove('need');
    void el.gender.offsetWidth; // animasyonu yeniden başlat
    el.gender.classList.add('need');
    return;
  }
  send({ t: 'join', name: playerName(), gender: S.gender, ...extra });
}

/** Süre: 300 → "5 dk", 90 → "1 dk 30 sn", 45 → "45 sn" (dile göre). */
function fmtDur(sec) {
  const total = Math.max(0, Math.round(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (!m) return t('dur.sec', { n: s });
  return s ? t('dur.minSec', { m, s }) : t('dur.min', { n: m });
}

// Her kare çağrılan arayüz kodu DOM'a yalnızca değer değiştiğinde yazar
// (aynı değeri yazmak bile stil/yerleşim hesabını tetikleyip ana iş parçacığını yorar).
function setText(node, v) {
  if (node._text !== v) { node._text = v; node.textContent = v; }
}
function setClass(node, v) {
  if (node._cls !== v) { node._cls = v; node.className = v; }
}
function setTransform(node, v) {
  if (node._tf !== v) { node._tf = v; node.style.transform = v; }
}

/** Grafik kalitesi: ?q=high|medium|low|auto > kayıtlı seçim > otomatik. */
function qualityChoice() {
  let q = params.get('q');
  if (!QUALITY_KEYS.includes(q)) {
    try { q = localStorage.getItem('wk-quality'); } catch { q = null; }
  }
  return QUALITY_KEYS.includes(q) ? q : 'auto';
}

// ---------------------------------------------------------------------------
// Ağ
// ---------------------------------------------------------------------------
function setConnButtons(on) {
  for (const b of [el.btnQuick, el.btnCreate, el.btnJoin]) b.disabled = !on;
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  S.ws = ws;
  ws.onopen = () => {
    el.connState.dataset.i18n = 'conn.ok';
    el.connState.textContent = t('conn.ok');
    setConnButtons(true);
  };
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    handle(m);
  };
  ws.onclose = () => {
    setConnButtons(false);
    if (S.game || S.code) toast(t('toast.disconnected'), 'bad');
    resetToHome();
    S.publicRooms = [];
    renderRooms();
    el.connState.dataset.i18n = 'conn.none';
    el.connState.textContent = t('conn.none');
  };
}

function handle(m) {
  switch (m.t) {
    case 'welcome': S.id = m.id; break;
    case 'lobby': onLobby(m); break;
    case 'err': toast(m.code ? t(`err.${m.code}`) : m.msg, 'bad'); break;
    case 'start': onStart(m); break;
    case 'phase': onPhase(m); break;
    case 'countdown': onCountdown(m); break;
    case 'g': onGaze(m); break;
    case 'signal': S.world?.playSignal(m.from, m.kind, m.dur, m.side); break;
    case 'ack': onAck(m); break;
    case 'noticed': onNoticed(m); break;
    case 'died': onDied(m); break;
    case 'roles': S.world?.showRoles(m.roles); break;
    case 'accused': onAccused(m); break;
    case 'over': onOver(m); break;
    case 'quit': onQuit(m); break;
    case 'role': onRole(m); break;
    case 'mate': onMate(m); break;
    case 'host': onHost(m); break;
    case 'paused': onPaused(m); break;
    case 'left': resetToHome(); break;
    case 'rooms': onRooms(m); break;
    case 'kicked': toast(t('toast.kicked'), 'bad'); resetToHome(); break;
    case 'closed': toast(t('toast.closed'), 'bad'); resetToHome(); break;
    case 'roomWarn': toast(t('toast.roomWarn', { left: fmtLeft(m.left) })); break;
    case 'roomExpiring':
      toast(t('toast.roomExpiring'), 'bad');
      if (S.game) addFeed(t('toast.roomExpiring'), 'bad');
      break;
    default:
  }
}

// ---------------------------------------------------------------------------
// Açık odalar (ana ekran) ve oda süresi
// ---------------------------------------------------------------------------
/** Kalan süre: 2 dk'dan fazlaysa dakikaya yuvarlanır ("42 dk"), azsa saniyesiyle ("1 dk 30 sn"). */
function fmtLeft(sec) {
  return sec > 120 ? t('dur.min', { n: Math.ceil(sec / 60) }) : fmtDur(sec);
}

function onRooms(m) {
  const now = performance.now();
  S.publicRooms = (m.rooms || []).map((r) => ({ ...r, endAt: now + r.expiresIn * 1000 }));
  renderRooms();
}

function renderRooms() {
  const list = S.publicRooms;
  const online = S.ws?.readyState === 1;
  el.rlCount.textContent = list.length ? t('list.count', { n: list.length }) : '';
  el.roomsEmpty.classList.toggle('hidden', list.length > 0);
  el.rooms.replaceChildren(...list.map((r) => {
    const li = document.createElement('li');
    const info = document.createElement('div');
    info.className = 'ri';
    const name = document.createElement('b');
    name.textContent = t('list.room', { host: r.host });
    const sub = document.createElement('small');
    const status = document.createElement('span');
    status.className = r.status === 'game' ? 'ingame' : '';
    status.textContent = t(r.status === 'game' ? 'list.game' : 'list.lobby');
    r.leftEl = document.createElement('span');
    r.leftEl.textContent = t('list.left', { left: fmtLeft((r.endAt - performance.now()) / 1000) });
    sub.append(`${r.players}/${r.max} · `, status, ' · ', r.leftEl);
    info.append(name, sub);
    const full = r.players >= r.max;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = t(r.status === 'game' ? 'list.game' : full ? 'list.full' : 'home.join');
    btn.disabled = !online || r.status === 'game' || full;
    btn.onclick = () => joinRoom({ room: r.code });
    li.append(info, btn);
    return li;
  }));
}

/** Her saniye: lobideki oda süresi ve listedeki kalan süreler. */
function tickRoomTimers() {
  const now = performance.now();
  if (S.code && !S.game && S.roomEndAt) {
    const left = Math.max(0, (S.roomEndAt - now) / 1000);
    setText(el.roomTimer, t('lobby.roomTime', { left: fmtLeft(left) }));
    setClass(el.roomTimer, left <= 300 ? 'muted warn' : 'muted');
  }
  if (!el.home.classList.contains('hidden')) {
    for (const r of S.publicRooms) if (r.leftEl) setText(r.leftEl, t('list.left', { left: fmtLeft(Math.max(0, (r.endAt - now) / 1000)) }));
  }
}
setInterval(tickRoomTimers, 1000);

/** Kurucunun "Çıkar" düğmesi: yanlışlıkla basılmasın diye iki tıkla onaylanır. */
function kickButton(id) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'kick';
  b.textContent = t('lobby.kick');
  let timer = 0;
  b.onclick = () => {
    if (!b.classList.contains('sure')) {
      b.classList.add('sure');
      b.textContent = t('lobby.kickSure');
      timer = setTimeout(() => { b.classList.remove('sure'); b.textContent = t('lobby.kick'); }, 3000);
      return;
    }
    clearTimeout(timer);
    b.disabled = true;
    send({ t: 'kick', id });
  };
  return b;
}

function renderSeg(seg, value) {
  for (const b of seg.querySelectorAll('button[data-v]')) b.setAttribute('aria-checked', String(b.dataset.v === value));
}

/** Lobide görünürlük (kurucu değiştirir) ve açıklaması. */
function renderVisibility() {
  const isHost = S.id === S.hostId;
  renderSeg(el.visSeg, S.isPublic ? 'public' : 'private');
  for (const b of el.visSeg.querySelectorAll('button')) b.disabled = !isHost;
  el.visNote.textContent = t(S.isPublic ? 'lobby.publicNote' : 'lobby.privateNote');
}

// ---------------------------------------------------------------------------
// Lobi
// ---------------------------------------------------------------------------
function onLobby(m) {
  S.code = m.code;
  S.hostId = m.hostId;
  S.players = m.players;
  S.settings = m.settings;
  S.solo = !!m.solo;
  S.isPublic = !!m.public;
  if (m.expiresIn !== undefined) S.roomEndAt = performance.now() + m.expiresIn * 1000;
  if (S.game) { S.game = null; S.world?.setDemo(true); document.body.classList.remove('spectator'); }
  el.revealCard.classList.add('hidden');
  closeMenu(false);
  exitLock();
  showScreen('lobby');

  const isHost = S.id === m.hostId;
  // Hızlı oyun: botlara karşı tek kişilik oda — kod / davet / oyuncu listesi gerekmez, ayarlar aynı.
  el.codeRow.classList.toggle('hidden', S.solo);
  el.plist.classList.toggle('hidden', S.solo);
  el.roomRow.classList.toggle('hidden', S.solo);
  el.visNote.classList.toggle('hidden', S.solo);
  el.soloHead.classList.toggle('hidden', !S.solo);
  el.btnLeave.textContent = t(S.solo ? 'lobby.back' : 'lobby.leave');
  el.roomCode.textContent = m.code;
  renderVisibility();
  tickRoomTimers();
  el.plist.innerHTML = '';
  for (const p of m.players) {
    const li = document.createElement('li');
    const left = document.createElement('span');
    left.textContent = p.name + (p.id === S.id ? t('lobby.you') : '');
    // Sağda: kurucu ya da hazır durumu (kurucu hazır olmaz, o başlatır); kurucuya diğerlerinde "Çıkar"
    const right = document.createElement('div');
    right.className = 'pr';
    const tag = document.createElement('span');
    const host = p.id === m.hostId;
    tag.className = 'tagc' + (host ? ' host' : p.ready ? ' ready' : ' wait');
    tag.textContent = host ? t('lobby.host') : t(p.ready ? 'lobby.isReady' : 'lobby.notReady');
    right.append(tag);
    if (isHost && !host) right.append(kickButton(p.id));
    li.append(left, right);
    el.plist.appendChild(li);
  }
  const s = m.settings;
  el.total.min = s.min; el.total.max = s.max;
  el.total.value = s.total; el.totalVal.textContent = s.total;
  el.signal.value = s.signal; el.difficulty.value = s.difficulty; el.lives.value = s.policeLives;
  // Katil/polis: sunucunun izin verdiği aralık (her 4 oyuncuya en fazla 1)
  const maxRoles = s.maxRoles ?? 1;
  for (const [sel, val] of [[el.killers, s.killers ?? 1], [el.policeCount, s.police ?? 1]]) {
    if (sel.options.length !== maxRoles) {
      sel.replaceChildren(...Array.from({ length: maxRoles }, (_, i) => new Option(String(i + 1), String(i + 1))));
    }
    sel.value = String(val);
  }
  const controls = [el.total, el.killers, el.policeCount, el.signal, el.difficulty, el.lives];
  for (const c of controls) c.disabled = !isHost;
  const n = Math.min(s.max, Math.max(s.total, m.players.length));
  const citizens = n - (s.killers ?? 1) - (s.police ?? 1);
  el.roleNote.textContent = t(maxRoles > 1 ? 'lobby.roleNoteMany' : 'lobby.roleNoteOne', { n, max: maxRoles });
  const bots = Math.max(0, n - m.players.length);
  el.botNote.textContent = t(bots ? 'lobby.withBots' : 'lobby.noBots', { humans: m.players.length, bots })
    + t('lobby.mix', { t: s.killers ?? 1, p: s.police ?? 1, c: citizens });
  renderTimeNote();
  // Hazır sistemi: kurucu, diğer herkes "Hazırım" deyince başlatabilir. Diğerlerinde aynı düğme "Hazırım" olur.
  const others = m.players.filter((p) => p.id !== m.hostId);
  const readyN = others.filter((p) => p.ready).length;
  const me = m.players.find((p) => p.id === S.id);
  S.ready = !!me?.ready;
  if (isHost) {
    const all = readyN === others.length;
    el.btnStart.disabled = !all;
    el.btnStart.textContent = all ? t('lobby.start') : t('lobby.waitReady', { ready: readyN, total: others.length });
    el.readyNote.textContent = others.length ? t(all ? 'lobby.allReady' : 'lobby.hostHint') : '';
  } else {
    el.btnStart.disabled = false;
    el.btnStart.textContent = t(S.ready ? 'lobby.unready' : 'lobby.readyBtn');
    el.readyNote.textContent = t(S.ready ? 'lobby.readyWait' : 'lobby.readyHint');
  }
  el.btnStart.classList.toggle('isReady', !isHost && S.ready);
}

/** Lobide katilin süresi: süre dolarsa katil kaybeder, son dakikada geri sayım başlar. */
function renderTimeNote() {
  const s = S.settings;
  if (!s?.timeLimit) { el.timeNote.textContent = ''; return; }
  el.timeNote.textContent = t((s.killers ?? 1) > 1 ? 'lobby.timeNoteMany' : 'lobby.timeNote', {
    limit: fmtDur(s.timeLimit),
    start: fmtDur(s.timeLimit - (s.countdown ?? 60)),
  });
}

function sendSettings() {
  send({
    t: 'settings', total: +el.total.value, signal: el.signal.value,
    difficulty: el.difficulty.value, policeLives: +el.lives.value,
    killers: +el.killers.value, police: +el.policeCount.value,
  });
}

// ---------------------------------------------------------------------------
// Oyun başlangıcı
// ---------------------------------------------------------------------------
function roleDescription(role, signal, lives) {
  const g = S.game;
  const mates = [...g.team].map(nameOf).join(', ');
  const many = g.nKillers > 1;
  const counts = many || g.nPolice > 1 ? t('desc.counts', { t: g.nKillers, p: g.nPolice }) : '';
  const limit = fmtDur(g.timeLimit);
  if (role === 'killer') {
    return counts + t('desc.killer', { verb: t(`verbl.${signal}`) })
      + (mates ? t('desc.killerMate', { mates }) : '')
      + t(many ? 'desc.killerGoalMany' : 'desc.killerGoal')
      + ' ' + t(many ? 'desc.timeKillerMany' : 'desc.timeKiller', { limit });
  }
  if (role === 'police') {
    return counts + t(many ? 'desc.policeMany' : 'desc.police', { noun: t(`noun.${signal}`) })
      + (mates ? t('desc.policeMate', { mates }) : '')
      + t('desc.policeLives', { lives })
      + ' ' + t('desc.timeOthers', { limit });
  }
  return counts + t('desc.citizen', { ving: t(`ving.${signal}`) }) + ' ' + t('desc.timeOthers', { limit });
}

/** Takım arkadaşlarının başına rollerini yaz (3B motor geç yüklenirse yeniden çağrılır). */
function showTeam() {
  const g = S.game;
  if (!g || !S.world || !g.team.size) return;
  S.world.showRoles(Object.fromEntries([...g.team].map((id) => [id, g.role])));
}

function onStart(m) {
  const g = (S.game = {
    you: m.you, role: m.role, signal: m.signal, seats: m.seats,
    byId: new Map(m.seats.map((s) => [s.id, s])),
    alive: new Set(m.seats.map((s) => s.id)),
    total: m.total, citizensLeft: m.citizens, citizensTotal: m.citizens, lives: m.lives,
    nKillers: m.killers ?? 1, nPolice: m.police ?? 1, killersLeft: m.killers ?? 1,
    team: new Set(m.team || []), // aynı roldeki takım arkadaşları (vatandaşta boş)
    cooldownUntil: 0, cooldownTotal: m.cooldown || 6, noticed: null,
    revealUntil: performance.now() + m.reveal * 1000, revealTotal: m.reveal * 1000,
    playing: false, over: false, dead: false, target: null,
    focus: null, contact: false, closeId: null, closeUntil: 0,
    focusDeg: m.focusDeg ?? (m.role === 'police' ? 6 : 13),
    witnessDeg: m.witnessDeg ?? 28,
    timeLimit: m.timeLimit ?? 300, // katilin süresi (sn)
    endAt: 0, // son dakika geri sayımının bittiği an (sunucu "countdown" gönderince kurulur)
  });
  S.gaze.clear();
  el.timer.classList.add('hidden');
  const me = g.byId.get(m.you);
  // Ekrandaki düzen: yuvarlak masa — herkes çemberde, masanın ortasına dönük; yan komşularım uzakta oturur
  // (bkz. layout.js). Kurallar sunucudaki yuvarlak düzende; bakışlar iki düzen arasında eşlenir.
  const canon = [];
  for (const q of m.seats) canon[q.seat] = q.pos;
  const L = tableLayout(m.seats.length, me.seat);
  g.view = {
    seats: m.seats.map((q) => ({ ...q, pos: L.pos[q.seat], face: L.face[q.seat] })),
    table: L.table,
    map: new GazeMap(canon, L.pos),
    me: L.pos[me.seat],
  };
  view.fwd = Math.atan2(-g.view.me[2], -g.view.me[0]); // masanın merkezine (karşıya) doğru
  // Oyun karşıdakinin yüzüne değil, masanın üstüne bakarak başlar (~15° aşağı). Herkesin başı göz hizasında
  // olduğundan bu açıda kimse odak konisine (en fazla 13°) girmez; masadakiler ekranın üst yarısında görünür.
  view.yaw = view.fwd;
  view.pitch = -0.27;
  view.fov = view.fovTarget = 70;
  S.roleHidden = false;
  closeMenu(false);
  document.body.classList.remove('spectator');
  S.world?.loadSeats(g.view.seats, m.you, g.view.table);
  S.world?.setDemo(false);
  showTeam();

  el.feed.innerHTML = '';
  el.noticed.classList.remove('on');
  el.revealRole.textContent = t(`roleUp.${m.role}`);
  el.revealRole.className = m.role;
  el.revealDesc.textContent = roleDescription(m.role, m.signal, m.lives);
  el.revealCard.classList.remove('hidden');
  showScreen('hud');
  renderStatus();
  renderRoleBadge();
  updateHint();
}

function onPhase(m) {
  const g = S.game;
  if (!g || m.phase !== 'playing') return;
  g.playing = true;
  el.revealCard.classList.add('hidden');
  addFeed(t('feed.started'));
  updateHint();
}

/** Katilin süresinin son dakikası: herkese geri sayım (sunucu süre dolunca oyunu bitirir). */
function onCountdown(m) {
  const g = S.game;
  if (!g || g.over) return;
  g.endAt = performance.now() + m.left * 1000;
  el.timer.classList.remove('hidden');
  addFeed(t('feed.countdown', { left: fmtDur(m.left) }), 'bad');
  if (navigator.vibrate) navigator.vibrate([60, 50, 60]);
}

function renderRoleBadge() {
  const g = S.game;
  if (!g) return;
  el.roleBadge.className = S.roleHidden ? 'hiddenrole' : g.role;
  if (S.roleHidden) {
    el.roleTag.textContent = t('badge.hidden');
    el.roleSub.textContent = t('badge.show');
  } else {
    const role = t(`roleUp.${g.role}`);
    el.roleTag.textContent = g.dead ? `${role} · ${t('badge.spectator')}` : role;
    el.roleSub.textContent = t('badge.hide');
  }
}

function renderStatus() {
  const g = S.game;
  if (!g) return;
  el.stAlive.textContent = t('st.citizens', { left: g.citizensLeft, total: g.citizensTotal })
    + (g.nKillers > 1 ? t('st.killers', { left: g.killersLeft, total: g.nKillers }) : '');
  el.stLives.textContent = g.role === 'police' && !g.dead
    ? (g.lives > 0 ? t('st.lives', { n: g.lives }) : t('st.livesOut'))
    : '';
}

function updateHint() {
  const g = S.game;
  if (!g || g.over) { el.lookHint.textContent = ''; return; }
  el.lookHint.textContent = t(touchDevice ? 'hint.touch' : S.locked ? 'hint.locked' : 'hint.unlocked');
}

// ---------------------------------------------------------------------------
// Sunucu olayları
// ---------------------------------------------------------------------------
function onGaze(m) {
  if (!S.game) return;
  const g = S.game;
  for (const [id, yaw, pitch] of m.g) {
    if (id === S.id) continue;
    S.gaze.set(id, [yaw, pitch]); // göz teması hesabı için (kanonik düzende; 3B motor yüklenmemiş olsa da)
    const q = g.byId.get(id);
    if (q) S.world?.setGaze(id, g.view.map.toView(q.seat, yaw), pitch); // ekrandaki masadaki karşılığı
  }
}

function onAck(m) {
  const g = S.game;
  if (!g) return;
  g.cooldownTotal = m.cooldown || g.cooldownTotal;
  g.cooldownUntil = performance.now() + g.cooldownTotal * 1000;
  g.firedUntil = performance.now() + 220;
  addFeed(t('feed.sent', { verb: t(`verb.${g.signal}`) }));
}

function onNoticed(m) {
  const g = S.game;
  if (!g || g.dead) return;
  g.noticed = { until: performance.now() + m.seconds * 1000, total: m.seconds * 1000 };
  el.noticed.classList.add('on');
  if (navigator.vibrate) navigator.vibrate(120);
}

function onDied(m) {
  const g = S.game;
  if (!g) return;
  const caught = m.reason === 'caught'; // yakalanan katil (suçlama mesajı akışa zaten yazıldı)
  g.alive.delete(m.id);
  g.citizensLeft = m.left;
  if (m.killersLeft !== undefined) g.killersLeft = m.killersLeft;
  S.world?.kill(m.id);
  if (!caught) addFeed(t('feed.died', { name: nameOf(m.id) }), 'bad');
  if (m.id === g.you) {
    g.dead = true;
    g.noticed = null;
    el.noticed.classList.remove('on');
    document.body.classList.add('spectator');
    toast(t(caught ? 'toast.caught' : 'toast.dead'));
    renderRoleBadge();
  }
  renderStatus();
}

function onAccused(m) {
  const g = S.game;
  if (!g) return;
  if (m.correct) {
    // Kalan katil sayısını hemen ardından gelen "died" mesajı günceller; burada tahmin et.
    const rest = Math.max(0, g.killersLeft - 1);
    addFeed(t('feed.caught', { by: nameOf(m.by), target: nameOf(m.target) })
      + (rest > 0 ? t('feed.caughtRest', { n: rest }) : ''), 'good');
    S.world?.showRoles({ [m.by]: 'police', [m.target]: 'killer' });
    return;
  }
  addFeed(t('feed.wrong', { by: nameOf(m.by), target: nameOf(m.target) })
    + (m.lives > 0 ? t('feed.livesLeft', { n: m.lives }) : t('feed.livesOut')), 'bad');
  S.world?.showRoles({ [m.by]: 'police' }); // yanlış suçlayan polis ortaya çıkar
  if (m.by === g.you) g.lives = m.lives;
  el.flash.classList.add('on');
  setTimeout(() => el.flash.classList.remove('on'), 90);
  renderStatus();
}

function onOver(m) {
  const g = S.game;
  if (!g) return;
  g.over = true;
  g.noticed = null;
  g.cardUntil = 0;
  g.endAt = 0;
  el.timer.classList.add('hidden');
  el.noticed.classList.remove('on');
  el.revealCard.classList.add('hidden');
  closeMenu(false);
  exitLock();
  S.world?.showRoles(Object.fromEntries(m.roles.map((r) => [r.id, r.role])));
  updateHint();

  // Oyundan çıkanlar listede görünür ama sonuç cümlelerine girmez (rolü devralan girer).
  const names = (role) => m.roles.filter((r) => r.role === role && !r.left).map((r) => r.name);
  const killers = names('killer');
  const police = names('police');
  const manyT = killers.length > 1;
  const manyP = police.length > 1;
  el.overTitle.textContent = m.winner === 'police'
    ? t(manyP ? 'over.policeMany' : 'over.police')
    : t(manyT ? 'over.killerMany' : 'over.killer');
  const myTeamWon = (m.winner === 'killer') === (g.role === 'killer');
  el.overResult.textContent = t(myTeamWon ? 'over.win' : 'over.lose');
  el.overResult.className = `result ${myTeamWon ? 'win' : 'lose'}`;
  const tList = t(manyT ? 'over.killerListMany' : 'over.killerList', { names: killers.join(', ') });
  const reasons = {
    caught: manyT ? t('over.caughtMany') + tList : t('over.caught', { police: police.join(', '), killer: killers[0] }),
    allDead: t('over.allDead') + tList,
    policeOut: t(manyP ? 'over.policeOutMany' : 'over.policeOut') + tList,
    killerLeft: t('over.killerLeft'),
    policeLeft: t('over.policeLeft') + tList,
    timeUp: t(manyT ? 'over.timeUpMany' : 'over.timeUp', { limit: fmtDur(g.timeLimit) }) + tList,
  };
  el.overSub.textContent = reasons[m.reason] || '';
  el.overRoles.innerHTML = '';
  for (const r of m.roles) {
    const li = document.createElement('li');
    if (!r.alive) li.className = 'dead';
    const a = document.createElement('span');
    a.textContent = r.name + (r.id === g.you ? t('lobby.you') : '') + (r.left ? t('over.leftTag') : '');
    const b = document.createElement('span');
    b.className = `r-${r.role}`;
    b.textContent = t(`role.${r.role}`);
    li.append(a, b);
    el.overRoles.appendChild(li);
  }
  const isHost = S.id === S.hostId;
  el.btnAgain.classList.toggle('hidden', !isHost);
  el.overWait.textContent = isHost ? '' : t('over.waitHost');
  setTimeout(() => { if (S.game?.over) showScreen('over'); }, 1800); // son anı görmek için kısa bekleme
}

/** Biri oyundan çıktı: herkese duyurulur. Rolün son kişisiyse rolü rastgele birine geçti (heir). */
function onQuit(m) {
  const g = S.game;
  if (!g) return;
  g.alive.delete(m.id);
  g.citizensLeft = m.left;
  g.citizensTotal = m.citizens;
  g.killersLeft = m.killersLeft;
  const name = nameOf(m.id);
  const role = t(`role.${m.role}`);
  const kicked = m.reason === 'kicked'; // kurucu çıkardı
  S.world?.markLeft(m.id, t(kicked ? 'tag.kicked' : 'tag.left'));
  S.world?.showRoles({ [m.id]: m.role });
  addFeed(t(kicked ? 'feed.kicked' : 'feed.quit', { name, role }) + (m.heir ? t('feed.heir') : ''), 'bad');
  toast(t(kicked ? 'toast.kickedOther' : 'toast.quit', { name }));
  S.players = S.players.filter((p) => p.id !== m.id);
  if (S.menu) renderMenu(); // kurucunun çıkarma listesi güncellensin
  renderStatus();
}

/** Çıkan son katilin / polisin rolü bana geçti. */
function onRole(m) {
  const g = S.game;
  if (!g || g.over) return;
  const now = performance.now();
  g.role = m.role;
  g.lives = m.lives;
  g.team = new Set(m.team || []);
  g.focusDeg = m.focusDeg ?? g.focusDeg;
  g.cooldownUntil = m.cooldown ? now + m.cooldown * 1000 : 0;
  g.noticed = null;
  el.noticed.classList.remove('on');
  S.roleHidden = false;
  // Rol kartı birkaç saniye: kim çıktı, yeni rolün ne.
  el.revealRole.textContent = t(`roleUp.${m.role}`);
  el.revealRole.className = m.role;
  el.revealDesc.textContent = `${t('reveal.heir', { name: nameOf(m.from) })} ${roleDescription(m.role, g.signal, m.lives)}`;
  el.revealCard.classList.remove('hidden');
  g.cardTotal = 4500;
  g.cardUntil = now + g.cardTotal;
  toast(t('toast.heir', { role: t(`role.${m.role}`) }));
  if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
  showTeam();
  renderRoleBadge();
  renderStatus();
  updateHint();
}

/** Takımıma (ör. hakkı bitmiş polise) rolü devralan yeni biri katıldı. */
function onMate(m) {
  const g = S.game;
  if (!g) return;
  g.team.add(m.id);
  showTeam();
  toast(t('toast.mate', { name: nameOf(m.id) }));
}

/** Kurucu oyundan çıktı: oyun sonu ekranındaki "Lobiye dön" yeni kurucuda. */
function onHost(m) {
  S.hostId = m.id;
  if (!S.game?.over) return;
  const isHost = S.id === S.hostId;
  el.btnAgain.classList.toggle('hidden', !isHost);
  el.overWait.textContent = isHost ? '' : t('over.waitHost');
}

/**
 * Sunucu duraklatmayı onayladı (yalnızca tek kişilik oyunda) ya da kaldırdı.
 * Duraklamada geçen süre yerel sayaçlara (bekleme, "fark ettin", rol kartı) eklenir.
 */
function onPaused(m) {
  const g = S.game;
  if (!g) return;
  const now = performance.now();
  if (m.on) {
    g.pausedAt = g.pausedAt || now;
  } else if (g.pausedAt) {
    const d = now - g.pausedAt;
    g.pausedAt = 0;
    g.revealUntil += d;
    if (g.cooldownUntil) g.cooldownUntil += d;
    if (g.noticed) g.noticed.until += d;
    if (g.cardUntil) g.cardUntil += d;
    if (g.endAt) g.endAt += d;
  }
  renderMenu();
}

// ---------------------------------------------------------------------------
// Esc menüsü. Tek kişilik oyunda (botlara karşı) oyun gerçekten durur; çok oyunculu oyunda menü açılır
// ama oyun diğerleri için sürer. Buradan oyundan çıkılabilir.
// ---------------------------------------------------------------------------
function renderMenu() {
  const paused = !!S.game?.pausedAt;
  el.pauseTitle.textContent = t(paused ? 'pause.paused' : 'pause.title');
  el.pauseNote.textContent = t(paused ? 'pause.solo' : 'pause.live');
  // Kurucu: oyun sırasında AFK kalan ya da iki kez girmiş oyuncuyu buradan çıkarır.
  const others = S.solo || S.id !== S.hostId ? [] : S.players.filter((p) => p.id !== S.id);
  el.kickBox.classList.toggle('hidden', !others.length);
  el.kickList.replaceChildren(...others.map((p) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = p.name;
    li.append(name, kickButton(p.id));
    return li;
  }));
}

function openMenu() {
  if (S.menu || !inGame()) return;
  S.menu = true;
  S.menuAt = performance.now();
  keys.clear();
  dragging = false;
  exitLock();
  el.pause.classList.remove('hidden');
  renderMenu();
  send({ t: 'pause', on: true });
}

function closeMenu(relock = true) {
  if (!S.menu) return;
  S.menu = false;
  el.pause.classList.add('hidden');
  send({ t: 'pause', on: false });
  if (relock && !touchDevice && inGame()) tryLock();
}

function resetToHome() {
  closeMenu(false);
  if (joy.active) joyRelease();
  el.joy.classList.remove('on');
  S.game = null; S.code = null; S.hostId = null; S.roomEndAt = 0; S.players = [];
  el.revealCard.classList.add('hidden'); // rol kartı açıkken bağlantı koparsa ana menüyü kapatmasın
  document.body.classList.remove('spectator');
  exitLock();
  S.world?.setDemo(true);
  showScreen('home');
}

// ---------------------------------------------------------------------------
// Girdi: bakış, yakınlaştırma, eylem
// ---------------------------------------------------------------------------
function inGame() {
  return !!S.game && !S.game.over;
}

/** Oyunda ve menü kapalı: bakış ve eylem girdileri işlenir. */
function canPlay() {
  return inGame() && !S.menu;
}

/** Bakış girdisi: rol kartı (ilk 5 sn) kapanınca. Böylece oyun masaya bakan açıyla başlar. */
function canLook() {
  return canPlay() && S.game.playing;
}

function clampView() {
  view.yaw = view.fwd + clamp(wrapPi(view.yaw - view.fwd), -MAX_REL_YAW, MAX_REL_YAW);
  view.pitch = clamp(view.pitch, -0.75, 0.55);
}

function look(dx, dy, scale = 0.0024) {
  // Tarayıcılar fare kilidi alınırken / imleç pencereye girerken tek seferlik dev sıçramalar bildirebiliyor.
  dx = clamp(dx, -160, 160);
  dy = clamp(dy, -160, 160);
  const s = scale * (view.fov / 70);
  view.yaw += dx * s;
  view.pitch -= dy * s;
  clampView();
}

function doAction() {
  const g = S.game;
  if (!g || g.over || !g.playing || g.dead || S.menu) return;
  if (g.role === 'killer') {
    if (performance.now() < g.cooldownUntil) return;
    if (!g.target) { toast(t('toast.lookFirst')); return; }
    if (g.team.has(g.target)) { toast(t('toast.teammate')); return; }
    send({ t: 'wink', target: g.target });
  } else if (g.role === 'police') {
    if (g.lives <= 0) { toast(t('toast.noLives')); return; }
    if (!g.target) { toast(t('toast.lookSuspect')); return; }
    if (g.team.has(g.target)) { toast(t('toast.teammate')); return; }
    send({ t: 'accuse', target: g.target });
  } else if (g.noticed) {
    send({ t: 'die' });
  }
}

function tryLock() {
  try {
    const p = el.canvas.requestPointerLock?.();
    if (p && p.catch) p.catch(() => {});
  } catch { /* sürükleyerek bakma yedek yöntemi */ }
}

document.addEventListener('pointerlockchange', () => {
  const was = S.locked;
  S.locked = document.pointerLockElement === el.canvas;
  updateHint();
  // Kilitliyken Esc'yi tarayıcı yakalar (kilidi bırakır, sayfaya iletmez): kilit kendiliğinden
  // bırakıldıysa bu Esc demektir → menüyü aç. Programla bırakmada (oyun sonu vb.) açma.
  if (was && !S.locked) {
    if (S.unlocking) S.unlocking = false;
    else openMenu();
  }
});

let dragging = false;
el.canvas.addEventListener('mousedown', (e) => {
  if (!canPlay() || e.button !== 0 || touchDevice) return;
  if (S.locked) doAction();
  else { dragging = true; tryLock(); }
});
window.addEventListener('mouseup', () => { dragging = false; });
window.addEventListener('mousemove', (e) => {
  if (!canLook() || touchDevice) return;
  // Kilit olmadan da tıklamaya gerek yok: fareyi oynatmak bakışı çevirir (imleç oyun alanında gizli).
  // Düğmelerin üstündeyken çevirmez, tıklanabilsinler. İmleç ekran kenarına dayanırsa bir tık fareyi kilitler.
  if (!S.locked && !dragging && e.target.closest?.('button')) return;
  look(e.movementX, e.movementY);
});
window.addEventListener('wheel', (e) => {
  if (!canPlay()) return;
  view.fovTarget = clamp(view.fovTarget * (1 + e.deltaY * 0.0012), 16, 75);
}, { passive: true });

// Dokunmatik: tek parmak kaydırarak bakış, iki parmak yakınlaştırma, ve joystick.
// Joystick (2B oyunlardaki yön çubuğu gibi): ekrana dokununca ortanın biraz altında belirir. Üstünden dokunup
// sürükleyince topuz parmağı izler ve görüş o yöne, topuz ne kadar itildiyse o hızda sürekli döner; bırakınca
// topuz ortaya döner ve görüş hemen durur. Dönüş ani değil yumuşakça hızlanır, böylece bir yüzü tutturmak kolaydır.
// Ekranın başka yerinde kaydırmak hassas bakıştır (bir yüze kaydırıp parmağı tutunca görüş kaymaz).
// Hassasiyet ayarları (hepsi yakınlaştırınca kendiliğinden yavaşlar):
const JOY_R = 42;         // topuzun merkezden en fazla uzaklığı (px)
const JOY_HIT = 80;       // joystick'e dokunmuş sayılma yarıçapı (px)
const JOY_SPEED = 0.9;    // topuz tam itildiğinde yatay dönüş hızı (rad/sn ≈ 52°/sn)
const JOY_PITCH = 0.6;    // dikey dönüş yataya göre bu oranda yavaş
const JOY_DEAD = 0.15;    // ölü bölge: topuz yarıçapının bu oranına kadar itmek döndürmez (titreyen parmak oynatmaz)
const JOY_ACCEL = 6;      // hızlanma yumuşaklığı (1/sn): tam hıza ~0.4 sn'de varır
const JOY_DECEL = 25;     // topuz geri çekilince yavaşlama (1/sn): neredeyse anında
const TOUCH_LOOK = 0.003; // kaydırarak bakış: piksel başına dönüş (rad)
const joy = { active: false, id: null, cx: 0, cy: 0, ox: 0, oy: 0, vx: 0, vy: 0, hideTimer: 0 };
let touchPrev = null;
let pinchPrev = 0;

function touchById(list, id) {
  for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
  return null;
}
function joyCenter() {
  const b = el.joy.getBoundingClientRect();
  joy.cx = b.left + b.width / 2;
  joy.cy = b.top + b.height / 2;
}
function joyShow() {
  clearTimeout(joy.hideTimer);
  el.joy.classList.add('on');
}
function joyHideLater() {
  clearTimeout(joy.hideTimer);
  joy.hideTimer = setTimeout(() => { if (!joy.active) el.joy.classList.remove('on'); }, 2500);
}
function joyKnob(x, y) {
  let dx = x - joy.cx;
  let dy = y - joy.cy;
  const d = Math.hypot(dx, dy);
  if (d > JOY_R) { dx *= JOY_R / d; dy *= JOY_R / d; }
  joy.ox = dx;
  joy.oy = dy;
  setTransform(el.joyKnob, `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`);
}
function joyRelease() {
  joy.active = false;
  joy.id = null;
  joy.ox = joy.oy = 0;
  joy.vx = joy.vy = 0; // bırakınca kaymadan dur
  setTransform(el.joyKnob, 'translate3d(0px, 0px, 0)');
  el.joy.classList.remove('held');
  joyHideLater();
}
/** Her kare: joystick tutuluyorsa topuzun yönüne dön (ölü bölge, kenara doğru hızlanan eğri, yumuşak ivme). */
function joyTurn(dt) {
  if (!joy.active || !canLook()) { joy.vx = joy.vy = 0; return; }
  const d = Math.hypot(joy.ox, joy.oy);
  const k = d ? clamp((d / JOY_R - JOY_DEAD) / (1 - JOY_DEAD), 0, 1) : 0;
  const sp = JOY_SPEED * k * k * (view.fov / 70);
  const tx = k ? (joy.ox / d) * sp : 0;
  const ty = k ? (joy.oy / d) * sp * JOY_PITCH : 0;
  // Hız hedefe yumuşakça yaklaşır: hızlanırken yavaş, yavaşlarken / yön değiştirirken çabuk.
  const ease = (v, t) => {
    const rate = Math.abs(t) < Math.abs(v) || t * v < 0 ? JOY_DECEL : JOY_ACCEL;
    return v + (t - v) * (1 - Math.exp(-dt * rate));
  };
  joy.vx = ease(joy.vx, tx);
  joy.vy = ease(joy.vy, ty);
  view.yaw += joy.vx * dt;
  view.pitch -= joy.vy * dt;
  clampView();
}

el.canvas.addEventListener('touchstart', (e) => {
  if (!canLook()) return;
  joyShow();
  if (e.touches.length === 1) {
    const tch = e.touches[0];
    joyCenter();
    if (Math.hypot(tch.clientX - joy.cx, tch.clientY - joy.cy) <= JOY_HIT) {
      joy.active = true;
      joy.id = tch.identifier;
      el.joy.classList.add('held');
      joyKnob(tch.clientX, tch.clientY);
      touchPrev = null;
    } else {
      touchPrev = [tch.clientX, tch.clientY];
    }
  }
  if (e.touches.length === 2) {
    if (joy.active) joyRelease();
    pinchPrev = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  }
}, { passive: true });
el.canvas.addEventListener('touchmove', (e) => {
  if (!canLook()) return;
  e.preventDefault();
  if (e.touches.length === 1 && joy.active) {
    const tch = touchById(e.touches, joy.id) || e.touches[0];
    joyKnob(tch.clientX, tch.clientY);
  } else if (e.touches.length === 1 && touchPrev) {
    const touch = e.touches[0];
    look(touch.clientX - touchPrev[0], touch.clientY - touchPrev[1], TOUCH_LOOK);
    touchPrev = [touch.clientX, touch.clientY];
  } else if (e.touches.length === 2) {
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    if (pinchPrev) view.fovTarget = clamp(view.fovTarget * (pinchPrev / d), 16, 75);
    pinchPrev = d;
  }
}, { passive: false });
const touchEnd = (e) => {
  touchPrev = null;
  pinchPrev = 0;
  if (joy.active && !touchById(e.touches, joy.id)) joyRelease();
  if (!e.touches.length) joyHideLater();
};
el.canvas.addEventListener('touchend', touchEnd, { passive: true });
el.canvas.addEventListener('touchcancel', touchEnd, { passive: true });

// ---------------------------------------------------------------------------
// Nasıl oynanır: adım adım anlatım. Her adımın görseli oyundan çekilmiş bir ekran görüntüsü
// (public/howto/<adım>-<dil>.webp), başlığı ve maddeleri i18n.js'de (ht.<adım>.t / ht.<adım>.b, satır satır).
// ---------------------------------------------------------------------------
const HOWTO = ['roles', 'look', 'killer', 'citizen', 'police', 'win', 'controls', 'rooms'];
let htStep = 0;
let htSwipe = null;

function howtoOpen() {
  return !el.howto.classList.contains('hidden');
}

function howtoImg(step, lang = getLang()) {
  return `howto/${step}-${lang}.webp`;
}

function openHowto(step = 0) {
  htStep = step;
  el.howto.classList.remove('hidden');
  renderHowto();
  el.htNext.focus({ preventScroll: true });
}

function closeHowto() {
  el.howto.classList.add('hidden');
}

function goHowto(step) {
  if (step >= HOWTO.length) return closeHowto();
  htStep = clamp(step, 0, HOWTO.length - 1);
  renderHowto();
}

function renderHowto() {
  const k = HOWTO[htStep];
  const last = htStep === HOWTO.length - 1;
  el.htStep.textContent = t('ht.step', { n: htStep + 1, total: HOWTO.length });
  el.htTitle.textContent = t(`ht.${k}.t`);
  el.htText.replaceChildren(...t(`ht.${k}.b`).split('\n').map((line) => {
    const li = document.createElement('li');
    li.textContent = line;
    return li;
  }));
  // Görsel: arayüz dilindeki sürüm; yoksa Türkçesi
  el.htImg.onerror = () => {
    if (!el.htImg.src.endsWith(howtoImg(k, 'tr'))) el.htImg.src = howtoImg(k, 'tr');
  };
  el.htImg.src = howtoImg(k);
  el.htImg.alt = t(`ht.${k}.t`);
  el.htImg.style.animation = 'none';
  void el.htImg.offsetWidth; // geçiş animasyonunu her adımda yeniden başlat
  el.htImg.style.animation = '';
  if (!last) new Image().src = howtoImg(HOWTO[htStep + 1]); // sonraki görseli önceden yükle
  el.htDots.replaceChildren(...HOWTO.map((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = i === htStep ? 'on' : '';
    b.setAttribute('aria-label', t('ht.step', { n: i + 1, total: HOWTO.length }));
    b.onclick = () => goHowto(i);
    return b;
  }));
  el.htPrev.disabled = htStep === 0;
  el.htNext.textContent = t(last ? 'ht.done' : 'ht.next');
}

for (const b of document.querySelectorAll('[data-howto]')) b.addEventListener('click', () => openHowto(0));
el.htClose.onclick = closeHowto;
el.htPrev.onclick = () => goHowto(htStep - 1);
el.htNext.onclick = () => goHowto(htStep + 1);
el.howto.addEventListener('click', (e) => { if (e.target === el.howto) closeHowto(); }); // dışına tıklayınca kapanır
// Telefonda görselin üstünde sağa / sola kaydırarak adım değiştir
el.htImgBox.addEventListener('touchstart', (e) => { htSwipe = e.touches[0].clientX; }, { passive: true });
el.htImgBox.addEventListener('touchend', (e) => {
  if (htSwipe === null) return;
  const dx = e.changedTouches[0].clientX - htSwipe;
  htSwipe = null;
  if (Math.abs(dx) > 45) goHowto(htStep + (dx < 0 ? 1 : -1));
}, { passive: true });
// Açıkken klavye yalnızca anlatımı yönetir (oyunun tuşlarına gitmez): ← → Esc
window.addEventListener('keydown', (e) => {
  if (!howtoOpen()) return;
  e.stopImmediatePropagation();
  if (e.key === 'Escape') { e.preventDefault(); closeHowto(); }
  else if (e.key === 'ArrowRight') goHowto(htStep + 1);
  else if (e.key === 'ArrowLeft') goHowto(htStep - 1);
}, true);

window.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
  if (e.code === 'Escape') {
    // Kilit açıkken gelen Esc'yi pointerlockchange işler; az önce açılan menüyü hemen kapatma.
    if (!inGame() || S.locked || performance.now() - S.menuAt < 400) return;
    e.preventDefault();
    if (S.menu) closeMenu(); else openMenu();
    return;
  }
  if (!canPlay()) return;
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) doAction(); return; }
  if (e.code === 'KeyR' && !e.repeat) { S.roleHidden = !S.roleHidden; renderRoleBadge(); return; }
  if (e.code === 'Equal' || e.code === 'NumpadAdd') view.fovTarget = clamp(view.fovTarget * 0.85, 16, 75);
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') view.fovTarget = clamp(view.fovTarget / 0.85, 16, 75);
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

el.actionBtn.addEventListener('click', doAction);

// ---------------------------------------------------------------------------
// Odak: nişangâhın çevresindeki koni içinde, merkeze en yakın oyuncu.
// Katil/vatandaş: geniş koni (~13°), göz teması ve sana bakanlar gösterilir.
// Polis: dar ve kesin koni (~6°) + odaktaki yüzün yakın planı.
// ---------------------------------------------------------------------------
const DEG = Math.PI / 180;
const dirOf = (yaw, pitch) => {
  const c = Math.cos(pitch);
  return [c * Math.cos(yaw), Math.sin(pitch), c * Math.sin(yaw)];
};
function angleTo(d, from, to) {
  const v = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const dist = Math.hypot(v[0], v[1], v[2]);
  return [Math.acos(clamp((d[0] * v[0] + d[1] * v[1] + d[2] * v[2]) / dist, -1, 1)), dist];
}

/** Ekranda baktığım yön, sunucunun (kanonik) düzeninde. */
function canonYaw() {
  const g = S.game;
  return g.view.map.toCanon(g.byId.get(g.you).seat, view.yaw);
}

/** Odak sunucunun düzeninde seçilir: ekranda kimin yüzüne bakıyorsam sunucu da onu görür. */
function pickFocus() {
  const g = S.game;
  const me = g.byId.get(g.you);
  const d = dirOf(canonYaw(), view.pitch);
  const cone = g.focusDeg * DEG;
  let best = null;
  let bestAng = Infinity;
  for (const q of g.seats) {
    if (q.id === g.you || !g.alive.has(q.id)) continue;
    const [ang, dist] = angleTo(d, me.pos, q.pos);
    // Yakındaki kişinin kafası ekranda büyük: koni en az kafanın görünen boyu kadar olsun.
    const radius = Math.max(cone, Math.asin(Math.min(1, 0.26 / dist)) + 0.03);
    if (ang <= radius && ang < bestAng) { best = q.id; bestAng = ang; }
  }
  return best;
}

/** from'un (sunucudan gelen son) bakışı to'ya "göz göze" açısı içinde mi? Sunucudaki tanık kuralıyla aynı. */
function isLookingAt(fromId, toId) {
  const g = S.game;
  const gz = S.gaze.get(fromId);
  if (!gz) return false;
  const [ang] = angleTo(dirOf(gz[0], gz[1]), g.byId.get(fromId).pos, g.byId.get(toId).pos);
  return ang <= g.witnessDeg * DEG;
}

function updateFocus() {
  const g = S.game;
  const active = g.playing && !g.dead && !g.over;
  const focus = active ? pickFocus() : null;
  g.focus = focus;
  const target = g.role === 'killer' || g.role === 'police' ? focus : null;
  if (target !== g.target) {
    g.target = target;
    el.crosshair.classList.toggle('locked', !!target);
  }

  // Kurala göre bana bakanlar (her rolde): kafaları ekranımda tam bana döner, göz göze görünür.
  const facing = new Set();
  if (active) {
    for (const q of g.seats) {
      if (q.id !== g.you && g.alive.has(q.id) && isLookingAt(q.id, g.you)) facing.add(q.id);
    }
  }
  S.world?.setFacing(facing);

  // Göstergeler (polis hariç): başlarında göz işareti, katile tanık sayısı.
  // Takım arkadaşının bakması risk değil: göz işareti ve tanık sayısına girmez.
  const gazeInfo = active && g.role !== 'police';
  const watchers = new Set();
  if (gazeInfo) for (const id of facing) if (!g.team.has(id)) watchers.add(id);
  S.world?.setWatchers(watchers);
  g.contact = !!focus && gazeInfo && watchers.has(focus);
  setText(el.stWatch, gazeInfo ? t('st.watch', { n: watchers.size }) : '');
  setClass(el.stWatch, g.role === 'killer' && watchers.size > 1 ? 'warn' : '');

  // Bakışma: odağımdaki kişi de bana bakıyorsa göz gözeyiz → yalnızca o net, diğerleri bulanık
  // (ne yaptıkları seçilmez). Polisin net alanı biraz daha geniş. Bakışlar kesişip ayrılırken
  // titremesin diye kilit, temas bittikten sonra kısa süre korunur.
  const now = performance.now();
  if (focus && facing.has(focus)) { g.lockId = focus; g.lockUntil = now + 220; }
  else if (g.lockId && (!active || now > g.lockUntil || !g.alive.has(g.lockId))) g.lockId = null;
  S.world?.setGazeLock(g.lockId, g.role === 'police');

  // Odak efekti (hafif karartma): polis hariç, bakışma yokken.
  S.world?.setFocus(gazeInfo && !g.lockId ? focus : null, 0.3);

  // Polis: yakın plan. Odak kısa süre kaybolunca hemen kapanmasın (titremesin).
  if (g.role === 'police' && active) {
    if (focus) { g.closeId = focus; g.closeUntil = performance.now() + 700; }
    else if (g.closeId && (performance.now() > g.closeUntil || !g.alive.has(g.closeId))) g.closeId = null;
  } else {
    g.closeId = null;
  }
}

/** Odak çerçevesini ve yakın planı ekrana yerleştirir (render'dan sonra: aynı karenin kamerası). */
function updateFocusOverlay() {
  const g = S.game;
  const fr = el.focusFrame;
  const p = g?.focus ? S.world.projectHead(g.focus) : null;
  if (!p) {
    setClass(fr, '');
  } else {
    const size = Math.round(Math.max(56, p.r * 3.1));
    if (fr._size !== size) { fr._size = size; fr.style.width = fr.style.height = `${size}px`; }
    setTransform(fr, `translate3d(${(p.x - size / 2).toFixed(1)}px, ${(p.y - size / 2).toFixed(1)}px, 0)`);
    const name = nameOf(g.focus);
    const mate = g.team.has(g.focus);
    let label = name;
    if (mate) label = t('focus.mate', { name });
    else if (g.role === 'killer') label = t(g.contact ? 'focus.contact' : 'focus.away', { name });
    else if (g.role === 'citizen' && g.contact) label = t('focus.looking', { name });
    setText(el.focusLabel, label);
    setClass(fr, `on ${g.role}${g.contact ? ' contact' : ''}${mate ? ' mate' : ''}`);
  }

  // Polisin yakın planı
  const show = !!g?.closeId;
  if (el.closeup._show !== show) {
    el.closeup._show = show;
    el.closeup.classList.toggle('hidden', !show);
    if (show) closeRect = null; // görünür olunca yeniden ölç
  }
  if (show) {
    if (!closeRect) {
      const b = el.closeup.getBoundingClientRect();
      closeRect = { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) };
    }
    setText(el.closeupName, t('closeup', { name: nameOf(g.closeId) }));
  }
  S.world.setCloseUp(show ? g.closeId : null, closeRect);
}
let closeRect = null;
window.addEventListener('resize', () => { closeRect = null; });

// ---------------------------------------------------------------------------
// Arayüzü kare kare güncelle
// ---------------------------------------------------------------------------
function updateHud(now) {
  const g = S.game;

  const paused = !!g.pausedAt; // tek kişilik oyun duraklatıldı: sayaçlar donar
  if (!g.playing && !paused) {
    const left = clamp((g.revealUntil - now) / g.revealTotal, 0, 1);
    setTransform(el.revealBar, `scaleX(${left.toFixed(3)})`);
  }
  // Rol devri kartı (bkz. onRole)
  if (g.cardUntil && !paused) {
    const left = clamp((g.cardUntil - now) / g.cardTotal, 0, 1);
    setTransform(el.revealBar, `scaleX(${left.toFixed(3)})`);
    if (left <= 0) { g.cardUntil = 0; if (g.playing) el.revealCard.classList.add('hidden'); }
  }

  // Eylem düğmesi
  const btn = el.actionBtn;
  let cls = g.over || g.dead ? '' : g.role;
  if (g.role === 'citizen' && !!g.noticed && !g.dead) cls += ' pulse';
  if (now < (g.firedUntil || 0)) cls += ' fired';
  setClass(btn, cls);
  let label;
  let disabled = !g.playing || g.over || g.dead;
  let cd = 0;
  const at = paused ? g.pausedAt : now;
  if (g.dead && !g.over) label = t('act.spectator');
  else if (g.role === 'killer') {
    label = t(`verb.${g.signal}`);
    cd = clamp((g.cooldownUntil - at) / (g.cooldownTotal * 1000), 0, 1);
    if (cd > 0) disabled = true;
  } else if (g.role === 'police') {
    label = t(g.lives > 0 ? 'act.accuse' : 'act.noLives');
    if (g.lives <= 0) disabled = true;
  } else {
    label = t('act.dead');
    if (!g.noticed) disabled = true;
  }
  setText(el.actionLabel, label);
  if (btn.disabled !== disabled) btn.disabled = disabled;
  // width yerine transform: yerleşim (layout) hesabı yok, yalnızca birleştirme (composite).
  setTransform(el.cdFill, `scaleX(${cd.toFixed(3)})`);

  // Son dakika geri sayımı (duraklamada donar)
  if (g.endAt) {
    const left = Math.max(0, Math.ceil((g.endAt - at) / 1000));
    setText(el.timerVal, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
    setClass(el.timer, left <= 10 ? 'urgent' : '');
  }

  // "Fark ettin" süresi
  if (g.noticed && !paused) {
    const left = clamp((g.noticed.until - now) / g.noticed.total, 0, 1);
    setTransform(el.noticedBar, `scaleX(${left.toFixed(3)})`);
    if (left <= 0) g.noticed = null;
  }
}

let sentYaw = NaN;
let sentPitch = NaN;
let lastSent = 0;
function sendGaze(now) {
  if (now - lastSent < 66) return;
  const moved = Math.abs(view.yaw - sentYaw) > 1e-3 || Math.abs(view.pitch - sentPitch) > 1e-3;
  if (!moved && now - lastSent < 700) return;
  lastSent = now;
  sentYaw = view.yaw; sentPitch = view.pitch;
  send({ t: 'gaze', y: +canonYaw().toFixed(4), p: +view.pitch.toFixed(4) }); // sunucu kanonik düzende hesaplar
}

// ?stats=1 paneli: FPS, draw call, üçgen, piksel oranı, gölge durumu
const stats = { el: null, t: 0, n: 0 };
function updateStats(dt) {
  if (!stats.el) {
    stats.el = document.createElement('div');
    stats.el.id = 'stats';
    document.body.appendChild(stats.el);
  }
  stats.t += dt;
  stats.n++;
  if (stats.t < 0.5) return;
  const s = S.world.stats();
  stats.el.textContent = t('stats', {
    fps: (stats.n / stats.t).toFixed(0), calls: s.calls, tris: (s.tris / 1000).toFixed(1),
    pr: s.pr, sh: t(s.shadows ? 'on' : 'off'), q: s.quality, auto: s.auto,
  });
  stats.t = stats.n = 0;
}

let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  // Oyun alanında imleç gizli (nişangâh var); menüde, oyun sonunda, ana menüde ve düğme üstünde görünür.
  const hideCursor = canLook() && !touchDevice;
  if (hideCursor !== S.cursorHidden) { S.cursorHidden = hideCursor; document.body.classList.toggle('nocursor', hideCursor); }
  const w = S.world;
  if (w) {
    if (S.game) {
      const g = S.game;
      if (!g.over && !S.menu) {
        // Klavye ile bakış (WASD / oklar)
        const k = 1.7 * dt * (view.fov / 70);
        joyTurn(dt);
        if (g.playing) {
          if (keys.has('ArrowLeft') || keys.has('KeyA')) view.yaw -= k;
          if (keys.has('ArrowRight') || keys.has('KeyD')) view.yaw += k;
          if (keys.has('ArrowUp') || keys.has('KeyW')) view.pitch += k;
          if (keys.has('ArrowDown') || keys.has('KeyS')) view.pitch -= k;
        }
        clampView();
        sendGaze(now);
      }
      if (!g.over) updateHud(now);
      updateFocus(); // oyun bitince/ölünce odak, karartma ve yakın plan kendiliğinden kapanır
      view.fov += (view.fovTarget - view.fov) * (1 - Math.exp(-dt * 10));
      w.setViewer(g.view.me, view.yaw, view.pitch, view.fov);
    }
    w.update(dt);
    w.render();
    if (S.game) updateFocusOverlay();
    if (showStats) updateStats(dt);
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Düğmeler
// ---------------------------------------------------------------------------
el.btnQuick.onclick = () => joinRoom({ quick: true });
el.btnCreate.onclick = () => joinRoom({ create: true, public: S.roomType === 'public' });
el.roomType.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-v]');
  if (!b) return;
  S.roomType = b.dataset.v;
  try { localStorage.setItem('wk-roomType', S.roomType); } catch { /* yoksay */ }
  renderSeg(el.roomType, S.roomType);
});
// Lobide görünürlük: yalnızca kurucu değiştirir (sunucu da denetler)
el.visSeg.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-v]');
  if (!b || b.disabled || S.id !== S.hostId) return;
  send({ t: 'settings', public: b.dataset.v === 'public' });
});
el.btnJoin.onclick = () => {
  const code = el.joinCode.value.trim();
  if (code.length < 3) return toast(t('toast.enterCode'), 'bad');
  joinRoom({ room: code });
};
el.gender.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-g]');
  if (!b) return;
  S.gender = b.dataset.g;
  try { localStorage.setItem('wk-gender', S.gender); } catch { /* yoksay */ }
  el.gender.classList.remove('need');
  renderGender();
});
el.joinCode.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.btnJoin.click(); });
el.btnStart.onclick = () => {
  // Kurucu değilsen bu düğme "Hazırım" / "geri al"
  if (S.id !== S.hostId) { send({ t: 'ready', on: !S.ready }); return; }
  send({ t: 'start' });
  // Tarayıcı fare kilidini yalnızca bir tıklama anında verir: "Başlat" tıklamasını kullan, böylece oyun
  // açıldığında ayrıca tıklamak gerekmez. Oyun başlamazsa (ör. hata) kilidi geri bırak.
  if (!touchDevice) {
    tryLock();
    setTimeout(() => { if (!S.game) exitLock(); }, 2500);
  }
};
el.btnLeave.onclick = () => send({ t: 'leave' });
el.btnAgain.onclick = () => send({ t: 'again' });
el.btnHome.onclick = () => send({ t: 'leave' });
el.menuBtn.onclick = () => (S.menu ? closeMenu() : openMenu());
el.btnResume.onclick = () => closeMenu();
el.btnQuit.onclick = () => send({ t: 'leave' }); // sunucu herkese duyurur; 'left' gelince ana menüye dönülür
el.btnCopy.onclick = async () => {
  const url = `${location.origin}/?room=${S.code}`;
  try { await navigator.clipboard.writeText(url); toast(t('toast.copied')); } catch { toast(url); }
};
for (const c of [el.total, el.signal, el.difficulty, el.lives, el.killers, el.policeCount]) c.addEventListener('input', sendSettings);
el.total.addEventListener('input', () => { el.totalVal.textContent = el.total.value; });

// ---------------------------------------------------------------------------
// Başlat
// ---------------------------------------------------------------------------
/** Dili uygular: sabit metinler + 3B sahnedeki rol etiketleri. (Oyundaki dinamik metinler bir sonraki karede yenilenir.) */
function applyLang(l) {
  setLang(l);
  applyStatic();
  el.lang.value = getLang();
  S.world?.setRoleLabels({ killer: t('role.killer'), police: t('role.police') });
  if (S.code) el.btnLeave.textContent = t(S.solo ? 'lobby.back' : 'lobby.leave');
  renderTimeNote();
  renderMenu();
  renderRooms();
  if (S.code) renderVisibility();
  if (howtoOpen()) renderHowto();
  el.roomTimer._text = null; // dil değişince süre yazısı hemen yenilensin
  tickRoomTimers();
  updateHint();
}

/** Oyunun eski adıyla (hpv-*) kaydedilmiş seçimleri yeni anahtarlara (wk-*) bir kez taşır. */
function migrateStorage() {
  try {
    for (const k of ['name', 'gender', 'quality', 'lang', 'roomType']) {
      const old = localStorage.getItem(`hpv-${k}`);
      if (old !== null && localStorage.getItem(`wk-${k}`) === null) localStorage.setItem(`wk-${k}`, old);
      localStorage.removeItem(`hpv-${k}`);
    }
  } catch { /* yoksay */ }
}

(async function init() {
  migrateStorage();
  try { el.name.value = localStorage.getItem('wk-name') || ''; } catch { /* yoksay */ }
  try {
    const g = localStorage.getItem('wk-gender');
    if (g === 'm' || g === 'f') S.gender = g;
    if (localStorage.getItem('wk-roomType') === 'private') S.roomType = 'private';
  } catch { /* yoksay */ }
  renderGender();
  renderSeg(el.roomType, S.roomType);
  const room = new URLSearchParams(location.search).get('room');
  if (room) el.joinCode.value = room.toUpperCase().slice(0, 5);

  el.lang.replaceChildren(...Object.entries(LANGS).map(([k, name]) => new Option(name, k)));
  el.lang.addEventListener('change', () => applyLang(el.lang.value));
  applyLang(detectLang());

  el.actionKey.style.display = touchDevice ? 'none' : '';
  const quality = qualityChoice();
  el.quality.value = quality;
  el.quality.addEventListener('change', () => {
    // Kenar yumuşatma yalnızca WebGL bağlamı kurulurken seçilebildiği için sayfa yenilenir.
    try {
      localStorage.setItem('wk-quality', el.quality.value);
      localStorage.setItem('wk-name', el.name.value.trim());
    } catch { /* yoksay */ }
    params.delete('q');
    const qs = params.toString();
    location.href = location.pathname + (qs ? `?${qs}` : '');
  });

  showScreen('home');
  connect();
  try {
    const T = await loadThree();
    // Otomatik: telefonda orta, bilgisayarda yüksek ile başla; FPS düşerse kendini kısar.
    const preset = quality === 'auto' ? (touchDevice ? 'medium' : 'high') : quality;
    S.world = new World(T, el.canvas, { quality: preset, auto: quality === 'auto' });
    S.world.setRoleLabels({ killer: t('role.killer'), police: t('role.police') });
    if (S.game) { S.world.loadSeats(S.game.view.seats, S.game.you, S.game.view.table); S.world.setDemo(false); showTeam(); } // 3B motor geç yüklendiyse
  } catch (err) {
    console.error(err);
    el.fatal.classList.remove('hidden');
    // Metin DOM düğümleriyle kurulur (çeviride HTML yorumlanmaz); {cmd} yerine <code> konur.
    const [before, after] = t('fatal.body').split('{cmd}');
    const h = document.createElement('h2');
    h.textContent = t('fatal.title');
    const p = document.createElement('p');
    const code = document.createElement('code');
    code.textContent = 'npm i three';
    p.append(before, code, after ?? '');
    const box = document.createElement('div');
    box.append(h, p);
    el.fatal.replaceChildren(box);
  }
  requestAnimationFrame(frame);
})();
