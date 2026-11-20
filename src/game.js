// Saf oyun mantığı: ağ/zamanlayıcı bilmez. `update(dt)` ile ilerler, olayları `emit` ile bildirir.
// Böylece hem gerçek sunucuda hem de hızlandırılmış simülasyonda aynen çalışır.
import { DEFAULTS, SIGNALS, DIFFICULTY, maxRoleCount } from './config.js';
import { Bot } from './bots.js';
import { DEG, TAU, clamp, wrapPi, dirFromAngles, angleBetween, shuffle, cleanGender } from './util.js';

const EYE_Y = 1.22;   // kafa/göz yüksekliği (istemcideki sahneyle aynı)
const LOOK_RAD = 12 * DEG; // "birine bakıyor" sayılma açısı (bot polisin şüphe günlüğü için)
const HEIR_GRACE = 3;      // rolü devralan katil ilk işaretinden önce bu kadar bekler (sn)

export class Game {
  /**
   * @param {{slots:{id:string,name:string,gender?:'m'|'f',bot?:boolean}[], settings?:object, rng?:()=>number,
   *          emit?:(msg:object, to:string[]|null)=>void}} opts
   */
  constructor({ slots, settings = {}, rng = Math.random, emit = () => {} }) {
    if (slots.length < 3) throw new Error('En az 3 oyuncu gerekir.');
    this.cfg = { ...DEFAULTS, ...settings };
    if (!SIGNALS[this.cfg.signal]) this.cfg.signal = 'wink';
    this.diff = DIFFICULTY[this.cfg.difficulty] ?? DIFFICULTY.normal;
    this.rng = rng;
    this.emit = emit;
    this.n = slots.length;
    this.phase = 'reveal';
    this.time = 0;
    this.sched = [];
    this.gazeAcc = 0;
    this.winner = null;
    this.playStart = null;      // oyunun (rol kartından sonra) başladığı an; katilin süresi buradan sayılır
    this.countdownSent = false; // son dakika geri sayımı duyuruldu mu
    this.stats = {}; // simülasyon istatistikleri (bot suçlamaları nasıl sonuçlandı)

    // Katil ve polis sayısı: lobide seçilir, oyuncu sayısına göre sınırlanır (bkz. maxRoleCount).
    const maxR = maxRoleCount(this.n);
    this.nKillers = clamp(Math.round(Number(this.cfg.killers) || 1), 1, maxR);
    this.nPolice = clamp(Math.round(Number(this.cfg.police) || 1), 1, maxR);
    this.nCitizens = this.n - this.nKillers - this.nPolice;

    const seated = shuffle(slots, rng);
    const roles = shuffle([
      ...Array(this.nKillers).fill('killer'),
      ...Array(this.nPolice).fill('police'),
      ...Array(this.nCitizens).fill('citizen'),
    ], rng);
    this.R = 1.45 + 0.07 * this.n; // masa etrafındaki oturma yarıçapı
    this.players = seated.map((s, i) => {
      const a = (i / this.n) * TAU;
      return {
        id: s.id,
        name: s.name,
        gender: cleanGender(s.gender),
        bot: !!s.bot,
        seat: i,
        role: roles[i],
        alive: true,
        pos: [this.R * Math.cos(a), EYE_Y, this.R * Math.sin(a)],
        yaw: a + Math.PI, // masanın merkezine bakar
        pitch: -0.12,
        cooldownUntil: 0,
        accuseUntil: 0,
        pending: null,
        lives: roles[i] === 'police' ? this.cfg.policeLives : 0,
        brain: null,
      };
    });
    this.byId = new Map(this.players.map((p) => [p.id, p]));
    this.lookLog = new Map(this.players.map((p) => [p.id, new Map()]));
    for (const p of this.players) if (p.bot) p.brain = new Bot(this, p);
  }

  // ---------- Başlangıç ----------
  start() {
    for (const p of this.players) if (!p.bot) this.emit(this.startPayload(p), [p.id]);
  }

  startPayload(p) {
    return {
      t: 'start',
      you: p.id,
      role: p.role, // özel bilgi: yalnızca kendi rolünü alır
      signal: this.cfg.signal,
      total: this.n,
      citizens: this.nCitizens,
      killers: this.nKillers,
      police: this.nPolice,
      // Katiller birbirini, polisler birbirini bilir. Vatandaş kimseyi bilmez.
      team: p.role === 'citizen' ? [] : this.players.filter((q) => q !== p && q.role === p.role).map((q) => q.id),
      reveal: this.cfg.revealSeconds,
      cooldown: this.cfg.winkCooldown,
      lives: p.role === 'police' ? p.lives : 0,
      witnessDeg: this.cfg.witnessAngleDeg, // istemci "göz göze" göstergesini sunucuyla aynı kuralla hesaplar
      focusDeg: p.role === 'police' ? this.cfg.policeFocusDeg : this.cfg.focusDeg,
      timeLimit: this.cfg.killerTimeLimit,      // katilin süresi (sn)
      countdown: this.cfg.countdownSeconds,    // son kaç saniyede geri sayım gösterilir
      seats: this.players.map((q) => ({
        id: q.id,
        name: q.name,
        gender: q.gender, // görünüş (saç, makyaj) buna göre; herkesin gördüğü bilgi
        seat: q.seat,
        pos: q.pos.map((v) => +v.toFixed(3)),
      })),
    };
  }

  // ---------- Zaman ----------
  at(delay, fn) {
    this.sched.push({ at: this.time + delay, fn });
  }

  update(dt) {
    if (this.phase === 'over') return;
    this.time += dt;
    if (this.phase === 'reveal' && this.time >= this.cfg.revealSeconds) {
      this.phase = 'playing';
      this.playStart = this.time;
      this.emit({ t: 'phase', phase: 'playing', timeLimit: this.cfg.killerTimeLimit }, null);
    }
    if (this.phase === 'playing') {
      this.trackLooks();
      for (const p of this.players) if (p.brain && p.alive) p.brain.think(dt);
    }
    if (this.sched.length) {
      const due = this.sched.filter((e) => e.at <= this.time).sort((a, b) => a.at - b.at);
      if (due.length) {
        this.sched = this.sched.filter((e) => e.at > this.time);
        for (const e of due) if (this.phase !== 'over') e.fn();
      }
    }
    if (this.phase === 'playing') this.checkClock();
    this.gazeAcc += dt;
    if (this.gazeAcc >= 0.1 && this.phase !== 'over') {
      this.gazeAcc = 0;
      this.broadcastGaze();
    }
  }

  // ---------- Süre ----------
  /** Katilin kalan süresi (sn). Oyun başlamadan önce tam süre. */
  timeLeft() {
    if (this.playStart === null) return this.cfg.killerTimeLimit;
    return this.cfg.killerTimeLimit - (this.time - this.playStart);
  }

  /**
   * Son dakikaya girilince herkese geri sayımı bir kez duyurur (istemci oradan kendisi sayar).
   * Süre dolduğunda katil(ler) tüm vatandaşları bitirememiş demektir: polis ve vatandaşlar kazanır.
   */
  checkClock() {
    const left = this.timeLeft();
    if (!this.countdownSent && left <= this.cfg.countdownSeconds) {
      this.countdownSent = true;
      this.emit({ t: 'countdown', left: +Math.max(0, left).toFixed(2) }, null);
    }
    if (left <= 0) this.finish('police', 'timeUp');
  }

  // ---------- Bakış ----------
  angleFromGaze(p, q) {
    const d = dirFromAngles(p.yaw, p.pitch);
    const v = [q.pos[0] - p.pos[0], q.pos[1] - p.pos[1], q.pos[2] - p.pos[2]];
    return angleBetween(d, v);
  }

  trackLooks() {
    for (const p of this.players) {
      if (!p.alive) continue;
      const log = this.lookLog.get(p.id);
      for (const q of this.players) {
        if (q === p || !q.alive) continue;
        if (this.angleFromGaze(p, q) <= LOOK_RAD) log.set(q.id, this.time);
      }
    }
  }

  setGaze(id, yaw, pitch) {
    const p = this.byId.get(id);
    if (!p || p.bot) return;
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return;
    p.yaw = wrapPi(yaw);
    p.pitch = clamp(pitch, -1.2, 1.2);
  }

  broadcastGaze() {
    const g = this.players
      .filter((p) => p.alive)
      .map((p) => [p.id, +p.yaw.toFixed(3), +p.pitch.toFixed(3)]);
    this.emit({ t: 'g', g }, null);
  }

  // ---------- Eylemler ----------
  wink(id, targetId) {
    const p = this.byId.get(id);
    const tgt = this.byId.get(targetId);
    if (this.phase !== 'playing') return { error: 'Oyun henüz başlamadı.', code: 'notStarted' };
    if (!p || p.role !== 'killer' || !p.alive) return { error: 'Bu eylemi yapamazsın.', code: 'notAllowed' };
    if (!tgt || tgt === p || !tgt.alive) return { error: 'Geçersiz hedef.', code: 'badTarget' };
    if (tgt.role === 'killer') return { error: 'O senin takım arkadaşın.', code: 'teammate' };
    if (this.time < p.cooldownUntil) return { error: 'Biraz bekle.', code: 'wait' };
    if (!p.bot && this.angleFromGaze(p, tgt) > this.cfg.aimToleranceDeg * DEG) {
      return { error: 'Hedefe bakmıyorsun.', code: 'notLooking' };
    }
    p.cooldownUntil = this.time + this.cfg.winkCooldown;

    // İşareti yalnızca o anda katile bakanlar (ve ölü seyirciler) görür.
    const witnesses = this.players.filter(
      (q) => q !== p && q.alive && this.angleFromGaze(q, p) <= this.cfg.witnessAngleDeg * DEG,
    );
    const spectators = this.players.filter((q) => !q.alive);
    const to = [...witnesses, ...spectators].filter((q) => !q.bot).map((q) => q.id);
    this.emit(
      {
        t: 'signal',
        from: p.id,
        kind: this.cfg.signal,
        dur: SIGNALS[this.cfg.signal].dur,
        side: this.rng() < 0.5 ? -1 : 1,
      },
      to,
    );
    this.emit({ t: 'ack', cooldown: this.cfg.winkCooldown }, [p.id]);

    const st = this.stats;
    st.winks = (st.winks || 0) + 1;
    if (witnesses.some((q) => q.role === 'police')) st.policeSaw = (st.policeSaw || 0) + 1;
    if (tgt.role === 'police') st.policeTarget = (st.policeTarget || 0) + 1;
    if (witnesses.length === 1) st.soloWitness = (st.soloWitness || 0) + 1;
    if (witnesses.includes(tgt) && tgt.role === 'citizen' && !tgt.pending) this.markNoticed(tgt);
    for (const q of witnesses) if (q.brain) q.brain.onSignalSeen(p);
    return { ok: true };
  }

  markNoticed(tgt) {
    tgt.pending = { since: this.time };
    if (tgt.bot) {
      const [a, b] = this.diff.victimDelay;
      this.at(a + this.rng() * (b - a), () => this.kill(tgt, 'noticed'));
    } else {
      this.emit({ t: 'noticed', seconds: this.cfg.noticeSeconds }, [tgt.id]);
      this.at(this.cfg.noticeSeconds, () => this.kill(tgt, 'timeout'));
    }
  }

  die(id) {
    const p = this.byId.get(id);
    if (this.phase !== 'playing') return { error: 'Oyun şu an oynanmıyor.', code: 'notPlaying' };
    if (!p || !p.alive) return { error: 'Zaten oyun dışısın.', code: 'alreadyOut' };
    if (!p.pending) return { error: 'Fark etmeden ölemezsin.', code: 'notNoticed' };
    this.kill(p, 'noticed');
    return { ok: true };
  }

  /** Oyundan çıkarır. reason: 'noticed' | 'timeout' (vatandaş öldü) ya da 'caught' (katil yakalandı). */
  kill(p, reason) {
    if (!p.alive || this.phase === 'over') return;
    p.alive = false;
    p.pending = null;
    const left = this.players.filter((q) => q.alive && q.role === 'citizen').length;
    const killersLeft = this.players.filter((q) => q.alive && q.role === 'killer').length;
    this.emit({ t: 'died', id: p.id, left, killersLeft, reason }, null);
    if (!p.bot && this.cfg.spectatorsSeeRoles) this.emit({ t: 'roles', roles: this.roleMap() }, [p.id]);
    for (const q of this.players) if (q.brain && q.alive) q.brain.onDeath(p, reason);
    if (killersLeft === 0) this.finish('police', 'caught');
    else if (left === 0) this.finish('killer', 'allDead');
  }

  accuse(id, targetId) {
    const p = this.byId.get(id);
    const tgt = this.byId.get(targetId);
    if (this.phase !== 'playing') return { error: 'Oyun henüz başlamadı.', code: 'notStarted' };
    if (!p || p.role !== 'police' || !p.alive) return { error: 'Bu eylemi yapamazsın.', code: 'notAllowed' };
    if (p.lives <= 0) return { error: 'Suçlama hakkın kalmadı.', code: 'noLives' };
    if (!tgt || tgt === p || !tgt.alive) return { error: 'Geçersiz hedef.', code: 'badTarget' };
    if (tgt.role === 'police') return { error: 'O senin takım arkadaşın.', code: 'teammate' };
    if (this.time < p.accuseUntil) return { error: 'Biraz bekle.', code: 'wait' };
    if (!p.bot && this.angleFromGaze(p, tgt) > this.cfg.aimToleranceDeg * DEG) {
      return { error: 'Hedefe bakmıyorsun.', code: 'notLooking' };
    }
    p.accuseUntil = this.time + this.cfg.accuseCooldown;
    if (tgt.role === 'killer') {
      // Yakalanan katil oyundan çıkar; son katil da yakalandıysa kill() oyunu polis lehine bitirir.
      this.emit({ t: 'accused', by: p.id, target: tgt.id, correct: true, lives: p.lives }, null);
      this.kill(tgt, 'caught');
      return { ok: true, correct: true };
    }
    p.lives -= 1;
    this.emit({ t: 'accused', by: p.id, target: tgt.id, correct: false, lives: p.lives }, null);
    // Hakkı biten polis masada kalır ama suçlayamaz. Hiçbir polisin hakkı kalmadıysa katiller kazanır.
    if (!this.players.some((q) => q.role === 'police' && q.alive && q.lives > 0)) this.finish('killer', 'policeOut');
    return { ok: true, correct: false };
  }

  finish(winner, reason) {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.winner = winner;
    this.reason = reason;
    this.sched = [];
    this.emit({ t: 'over', winner, reason, roles: this.roleList() }, null);
  }

  // ---------- Yardımcılar ----------
  roleMap() {
    return Object.fromEntries(this.players.map((p) => [p.id, p.role]));
  }

  roleList() {
    return this.players.map((p) => ({ id: p.id, name: p.name, role: p.role, alive: p.alive, left: !!p.left }));
  }

  /**
   * Bir insan oyun sırasında çıktı (menüden, bağlantısı koptu ya da kurucu çıkardı). Masadan kalkar ve herkese duyurulur.
   * Rolünün masada kalan son kişisiyse (son katil / hakkı olan son polis) rolü, canlı ve işaret almamış
   * rastgele bir vatandaşa geçer; yalnızca o kişiye bildirilir. Devralacak kimse yoksa oyun biter.
   */
  leave(id, reason = 'left') {
    const p = this.byId.get(id);
    if (!p || p.left || this.phase === 'over') return;
    const wasAlive = p.alive;
    p.left = true;
    p.alive = false;
    p.pending = null;
    p.bot = true; // artık ona mesaj gönderilmez, bakışı yayınlanmaz
    p.brain = null;

    let heir = null;
    if (wasAlive && p.role !== 'citizen') {
      const stillPlaying = this.players.some((q) => q.alive && q.role === p.role && (p.role !== 'police' || q.lives > 0));
      if (!stillPlaying) {
        const pool = this.players.filter((q) => q.alive && q.role === 'citizen' && !q.pending);
        if (pool.length) heir = pool[Math.floor(this.rng() * pool.length)];
      }
    }
    if (heir) this.transferRole(p, heir);

    this.emit({
      t: 'quit',
      id: p.id,
      reason, // 'left': kendisi çıktı / bağlantısı koptu · 'kicked': kurucu çıkardı
      role: p.role,
      heir: !!heir,
      left: this.players.filter((q) => q.alive && q.role === 'citizen').length,
      citizens: this.players.filter((q) => q.role === 'citizen').length,
      killersLeft: this.players.filter((q) => q.alive && q.role === 'killer').length,
    }, null);
    if (heir) this.announceHeir(p, heir);
    if (wasAlive) this.checkEnd(p.role);
  }

  /** Rolü devreder. Polis hakkını da devralır; katil ilk işaretinden önce birkaç saniye etrafa bakabilir. */
  transferRole(from, heir) {
    heir.role = from.role;
    heir.pending = null;
    if (heir.role === 'police') {
      heir.lives = Math.max(1, from.lives);
      heir.accuseUntil = this.time + this.cfg.accuseCooldown;
    } else {
      heir.cooldownUntil = this.time + HEIR_GRACE;
    }
    if (heir.brain) heir.brain = new Bot(this, heir); // yeni rolüyle baştan düşünür
  }

  announceHeir(from, heir) {
    const team = this.players.filter((q) => q !== heir && q.role === heir.role && !q.left).map((q) => q.id);
    if (!heir.bot) {
      this.emit({
        t: 'role',
        role: heir.role,
        from: from.id,
        lives: heir.role === 'police' ? heir.lives : 0,
        cooldown: heir.role === 'killer' ? HEIR_GRACE : 0,
        focusDeg: heir.role === 'police' ? this.cfg.policeFocusDeg : this.cfg.focusDeg,
        team,
      }, [heir.id]);
    }
    // Aynı roldeki diğerleri (ör. hakkı bitmiş polis) yeni takım arkadaşını öğrenir.
    const mates = team.map((id) => this.byId.get(id)).filter((q) => !q.bot);
    if (mates.length) this.emit({ t: 'mate', id: heir.id }, mates.map((q) => q.id));
    // Seyirciler herkesin rolünü görür: güncel listeyi alsınlar.
    const spectators = this.players.filter((q) => !q.alive && !q.bot);
    if (this.cfg.spectatorsSeeRoles && spectators.length) {
      this.emit({ t: 'roles', roles: this.roleMap() }, spectators.map((q) => q.id));
    }
  }

  /** Biri masadan kalktıktan sonra: bir taraf tükendiyse oyun biter. */
  checkEnd(role) {
    if (this.phase === 'over') return;
    const alive = (r) => this.players.filter((q) => q.alive && q.role === r);
    if (!alive('killer').length) return this.finish('police', role === 'killer' ? 'killerLeft' : 'caught');
    if (!alive('police').some((q) => q.lives > 0)) return this.finish('killer', role === 'police' ? 'policeLeft' : 'policeOut');
    if (!alive('citizen').length) return this.finish('killer', 'allDead');
  }

  humanCount() {
    return this.players.filter((p) => !p.bot).length;
  }
}
