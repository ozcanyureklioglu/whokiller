// Oda/lobi yönetimi: istemci mesajlarını oyuna çevirir, oyunu zamanlayıcıyla ilerletir.
import { Game } from './game.js';
import { DEFAULTS, SIGNALS, DIFFICULTY, maxRoleCount } from './config.js';
import { BOTS, cleanName, cleanGender, clamp, shuffle } from './util.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

class Room {
  /** solo: "Hızlı oyun" odası — tek kişi + botlar; kodla katılınamaz, oyun duraklatılabilir. */
  constructor(mgr, code, { solo = false } = {}) {
    this.mgr = mgr;
    this.code = code;
    this.solo = solo;
    this.paused = false;
    this.members = new Map(); // id -> client
    this.hostId = null;
    this.ready = new Set(); // "Hazırım" diyen insanlar (kurucu hazır sayılmaz; başlatan odur, botlar hiç sayılmaz)
    this.settings = {
      total: DEFAULTS.defaultTotal,
      signal: DEFAULTS.signal,
      difficulty: DEFAULTS.difficulty,
      policeLives: DEFAULTS.policeLives,
      killers: DEFAULTS.killers,
      police: DEFAULTS.police,
    };
    this.game = null;
    this.timer = null;
    this.last = 0;
  }

  /** Oyun başlarsa kaç kişi olacak: seçilen toplam, ama odadaki insan sayısından az olamaz. */
  playerCount() {
    return clamp(Math.max(this.settings.total, this.members.size), DEFAULTS.minPlayers, DEFAULTS.maxPlayers);
  }

  /** Katil/polis sayısını oyuncu sayısının izin verdiği aralığa çeker. */
  clampRoles() {
    const max = maxRoleCount(this.playerCount());
    this.settings.killers = clamp(this.settings.killers, 1, max);
    this.settings.police = clamp(this.settings.police, 1, max);
    return max;
  }

  emit(msg, to) {
    const data = JSON.stringify(msg);
    if (!to) {
      for (const c of this.members.values()) c.conn.send(data);
    } else {
      for (const id of to) this.members.get(id)?.conn.send(data);
    }
  }

  lobbyMsg() {
    const maxRoles = this.clampRoles(); // oyuncu çıkınca sayı sınırın üstünde kalmasın
    const cfg = { ...DEFAULTS, ...this.mgr.overrides };
    return {
      t: 'lobby',
      code: this.code,
      solo: this.solo,
      hostId: this.hostId,
      players: [...this.members.values()].map((c) => ({ id: c.id, name: c.name, gender: c.gender, ready: this.ready.has(c.id) })),
      settings: {
        ...this.settings, min: DEFAULTS.minPlayers, max: DEFAULTS.maxPlayers, maxRoles,
        // Bilgi amaçlı (lobide gösterilir): katilin süresi ve geri sayımın başladığı son saniyeler
        timeLimit: cfg.killerTimeLimit, countdown: cfg.countdownSeconds,
      },
    };
  }

  broadcastLobby() {
    this.emit(this.lobbyMsg(), null);
  }

  add(client) {
    // Aynı isim varsa sonuna numara ekle.
    const taken = new Set([...this.members.values()].map((c) => c.name));
    let name = client.name;
    for (let i = 2; taken.has(name); i++) name = `${client.name.slice(0, 11)} ${i}`;
    client.name = name;
    this.members.set(client.id, client);
    client.room = this;
    if (!this.hostId) this.hostId = client.id;
    if (!this.game) this.broadcastLobby();
    else client.conn.send(JSON.stringify(this.lobbyMsg()));
  }

  remove(client) {
    if (!this.members.delete(client.id)) return;
    client.room = null;
    this.ready.delete(client.id);
    this.setPaused(false);
    // Oyun sırasında çıkan: herkese duyurulur, gerekirse rolü başkasına geçer (bkz. Game.leave).
    if (this.game) this.game.leave(client.id);
    if (this.members.size === 0) return this.destroy();
    if (this.hostId === client.id) {
      this.hostId = this.members.keys().next().value;
      if (this.game) this.emit({ t: 'host', id: this.hostId }, null); // oyun sonu ekranındaki "Lobiye dön" yeni kurucuda
    }
    if (!this.game) this.broadcastLobby();
  }

  /**
   * Duraklatma (Esc menüsü): yalnızca odada tek insan varsa oyun gerçekten durur (botlar dahil her şey).
   * Çok oyunculu oyunda menü açılır ama oyun diğerleri için akmaya devam eder.
   */
  pause(client, on) {
    const ok = !!on && !!this.game && this.game.phase !== 'over' && this.members.size === 1;
    this.setPaused(ok);
    client.conn.send(JSON.stringify({ t: 'paused', on: this.paused }));
  }

  /** Kurucunun başlatabilmesi için diğer tüm insanlar hazır mı? (Tek kişilik odada her zaman evet.) */
  allReady() {
    for (const id of this.members.keys()) if (id !== this.hostId && !this.ready.has(id)) return false;
    return true;
  }

  /** Lobide "Hazırım" / "geri al". Kurucu hazır olmaz, o başlatır. */
  setReady(client, on) {
    if (this.game || client.id === this.hostId) return;
    if (on) this.ready.add(client.id); else this.ready.delete(client.id);
    this.broadcastLobby();
  }

  setPaused(on) {
    if (this.paused === on) return;
    this.paused = on;
    this.last = Date.now(); // duraklamada geçen süre oyuna yansımasın
  }

  destroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.game = null;
    this.mgr.rooms.delete(this.code);
  }

  updateSettings(client, m) {
    if (client.id !== this.hostId || this.game) return;
    const s = this.settings;
    const before = JSON.stringify(s);
    if (m.total !== undefined) {
      s.total = clamp(Math.round(Number(m.total) || s.total), DEFAULTS.minPlayers, DEFAULTS.maxPlayers);
    }
    if (m.signal in SIGNALS) s.signal = m.signal;
    if (m.difficulty in DIFFICULTY) s.difficulty = m.difficulty;
    if (m.policeLives !== undefined) s.policeLives = clamp(Math.round(Number(m.policeLives) || 2), 1, 3);
    if (m.killers !== undefined) s.killers = Math.round(Number(m.killers) || 1);
    if (m.police !== undefined) s.police = Math.round(Number(m.police) || 1);
    this.clampRoles();
    // Ayar değiştiyse herkes yeni ayarları görüp yeniden "Hazırım" desin.
    if (JSON.stringify(s) !== before) this.ready.clear();
    this.broadcastLobby();
  }

  startGame(client) {
    if (client.id !== this.hostId) return this.mgr.err(client, 'Oyunu yalnızca oda kurucusu başlatabilir.', 'hostOnly');
    if (this.game) return;
    if (!this.allReady()) return this.mgr.err(client, 'Herkes hazır değil.', 'notReady');
    this.ready.clear(); // oyun bitip lobiye dönülünce herkes yeniden hazır olur
    const humans = [...this.members.values()];
    const total = this.playerCount();
    this.clampRoles();
    const used = new Set(humans.map((h) => h.name));
    const bots = shuffle(BOTS, this.mgr.rng).filter((b) => !used.has(b.name));
    const slots = humans.map((h) => ({ id: h.id, name: h.name, gender: h.gender, bot: false }));
    for (let i = 0; slots.length < total; i++) {
      const b = bots[i] ?? { name: `Bot ${i + 1}`, gender: i % 2 ? 'f' : 'm' };
      slots.push({ id: `b${i + 1}`, name: b.name, gender: b.gender, bot: true });
    }
    this.game = new Game({
      slots,
      settings: {
        signal: this.settings.signal,
        difficulty: this.settings.difficulty,
        policeLives: this.settings.policeLives,
        killers: this.settings.killers,
        police: this.settings.police,
        ...this.mgr.overrides,
      },
      rng: this.mgr.rng,
      emit: (msg, to) => this.emit(msg, to),
    });
    this.game.start();
    this.paused = false;
    this.last = Date.now();
    this.timer = setInterval(() => this.tick(), this.mgr.tickMs);
  }

  tick() {
    if (!this.game) return;
    const now = Date.now();
    if (this.paused) { this.last = now; return; }
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    this.game.update(dt);
    if (this.game.phase === 'over' && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  backToLobby(client) {
    if (client.id !== this.hostId || !this.game || this.game.phase !== 'over') return;
    this.game = null;
    this.broadcastLobby();
  }
}

export class Rooms {
  constructor({ rng = Math.random, tickMs = 100, overrides = {} } = {}) {
    this.rooms = new Map();
    this.clients = new Set();
    this.nextId = 1;
    this.rng = rng;
    this.tickMs = tickMs;
    this.overrides = overrides;
    this.hb = setInterval(() => this.heartbeat(), 20000);
    this.hb.unref();
  }

  close() {
    clearInterval(this.hb);
    for (const room of [...this.rooms.values()]) room.destroy();
    for (const c of this.clients) c.conn.close(1001);
  }

  /** Hata: msg Türkçe metin (geriye dönük), code istemcinin kendi dilinde göstermesi için. */
  err(client, msg, code) {
    client.conn.send(JSON.stringify({ t: 'err', msg, code }));
  }

  newCode() {
    for (;;) {
      let c = '';
      for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!this.rooms.has(c)) return c;
    }
  }

  handleConnection(conn) {
    const client = { id: `p${this.nextId++}`, conn, name: 'Oyuncu', gender: 'm', room: null, sec: 0, count: 0 };
    this.clients.add(client);
    conn.onmessage = (txt) => this.onMessage(client, txt);
    conn.onclose = () => {
      client.room?.remove(client);
      this.clients.delete(client);
    };
    conn.send(JSON.stringify({ t: 'welcome', id: client.id }));
  }

  heartbeat() {
    const now = Date.now();
    for (const c of this.clients) {
      if (now - c.conn.lastSeen > 70000) c.conn.close(1001);
      else c.conn.ping();
    }
  }

  onMessage(client, txt) {
    const sec = Math.floor(Date.now() / 1000);
    if (client.sec !== sec) { client.sec = sec; client.count = 0; }
    if (++client.count > 80) return; // aşırı mesaj gönderen istemciyi yok say
    let m;
    try { m = JSON.parse(txt); } catch { return; }
    if (!m || typeof m !== 'object') return;
    const room = client.room;

    switch (m.t) {
      case 'join': return this.join(client, m);
      case 'leave': {
        room?.remove(client);
        client.conn.send(JSON.stringify({ t: 'left' }));
        return;
      }
      case 'settings': return room?.updateSettings(client, m);
      case 'start': return room?.startGame(client);
      case 'again': return room?.backToLobby(client);
      case 'pause': return room?.pause(client, m.on);
      case 'ready': return room?.setReady(client, !!m.on);
      case 'gaze': return room?.game?.setGaze(client.id, Number(m.y), Number(m.p));
      case 'wink':
      case 'accuse':
      case 'die': {
        const g = room?.game;
        if (!g) return;
        const r = m.t === 'wink' ? g.wink(client.id, m.target)
          : m.t === 'accuse' ? g.accuse(client.id, m.target)
          : g.die(client.id);
        if (r?.error) this.err(client, r.error, r.code);
        return;
      }
      default:
    }
  }

  join(client, m) {
    if (client.room) return;
    client.name = cleanName(m.name);
    client.gender = cleanGender(m.gender); // isim ekranında seçilir; karakterin görünüşünü belirler
    let room;
    if (m.create || m.quick) {
      // Hızlı oyun da önce ayar ekranına (lobiye) gelir; botlara karşı tek kişilik, kodu paylaşılmayan oda.
      room = new Room(this, this.newCode(), { solo: !!m.quick });
      this.rooms.set(room.code, room);
    } else {
      room = this.rooms.get(String(m.room || '').toUpperCase().trim());
      if (!room || room.solo) return this.err(client, 'Oda bulunamadı.', 'noRoom');
    }
    if (room.game) return this.err(client, 'Bu odada oyun devam ediyor.', 'inProgress');
    if (room.members.size >= DEFAULTS.maxPlayers) return this.err(client, 'Oda dolu.', 'full');
    room.add(client);
  }
}
