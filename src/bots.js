// Bot beyni. Botlar da insanlar gibi yalnızca "bakış" üzerinden oynar:
// etrafa bakar, katil olanlar uygun anı kollar, polis olanlar şüphe puanı biriktirir.
import { anglesTo, wrapPi, clamp, DEG } from './util.js';

const TURN_RATE = 3.4; // rad/sn: botun kafasını çevirme hızı

export class Bot {
  constructor(game, player) {
    this.g = game;
    this.p = player;
    this.d = game.diff;
    this.look = { id: null, until: 0, jy: 0, jp: 0 };
    this.lastWatched = new Map();
    this.suspicion = new Map();
    this.aim = null;        // katil: hedefine dönüyor
    this.holdUntil = 0;     // katil: işaretten sonra kısa süre bakışını sabit tutar
    this.accuse = null;     // polis: planlanmış suçlama {at, id}
    this.lastAccuseAt = -99;
    // Kalabalık masada polisin herkesi izlemesi zorlaşır: dikkat oyuncu sayısıyla düşer.
    this.attention = clamp(this.d.policeAttention * Math.pow(4 / (game.n - 1), 1.6), 0.03, 0.95);
    this.nextDecision = Math.max(game.time, game.cfg.revealSeconds) + this.rnd(2, 5);
  }

  rnd(a, b) {
    return a + this.g.rng() * (b - a);
  }

  others() {
    return this.g.players.filter((q) => q !== this.p && q.alive);
  }

  /** Katiller birbirini, polisler birbirini bilir. */
  isTeammate(q) {
    return q !== this.p && this.p.role !== 'citizen' && q.role === this.p.role;
  }

  /** Takım arkadaşları dışındaki canlılar (şüpheli / hedef / tanık adayları). */
  strangers() {
    return this.others().filter((q) => !this.isTeammate(q));
  }

  turnToward(goalYaw, goalPitch, dt) {
    const p = this.p;
    const step = TURN_RATE * dt;
    p.yaw = wrapPi(p.yaw + clamp(wrapPi(goalYaw - p.yaw), -step, step));
    p.pitch += clamp(goalPitch - p.pitch, -step, step);
  }

  lookAtPlayer(q, dt, jitter = true) {
    const [y, pt] = anglesTo(this.p.pos, q.pos);
    const jy = jitter ? this.look.jy : 0;
    const jp = jitter ? this.look.jp : 0;
    this.turnToward(y + jy, pt + jp, dt);
  }

  chooseLook() {
    const g = this.g;
    let others = this.others();
    if (!others.length) return;
    let target;
    let dwell;
    if (this.p.role === 'police') {
      // Diğer polisleri izlemenin anlamı yok (kim olduklarını biliyor).
      if (this.strangers().length) others = this.strangers();
      // Uzun süredir izlemediği ve şüpheli olan kişilere öncelik verir.
      let best = -1;
      for (const q of others) {
        const stale = g.time - (this.lastWatched.get(q.id) ?? -5) + 1;
        const s = Math.max(0.2, 1 + (this.suspicion.get(q.id) || 0) * 1.2);
        const score = stale * s * (0.6 + g.rng() * 0.8);
        if (score > best) { best = score; target = q; }
      }
      this.lastWatched.set(target.id, g.time);
      dwell = this.rnd(0.9, 2.0);
    } else {
      target = others[Math.floor(g.rng() * others.length)];
      dwell = this.rnd(0.8, 2.6);
    }
    this.look = {
      id: target.id,
      until: g.time + dwell,
      jy: this.rnd(-0.05, 0.05),
      jp: this.rnd(-0.04, 0.03),
    };
  }

  wander(dt) {
    const cur = this.g.byId.get(this.look.id);
    if (!cur || !cur.alive || this.g.time >= this.look.until) this.chooseLook();
    const q = this.g.byId.get(this.look.id);
    if (q) this.lookAtPlayer(q, dt);
  }

  think(dt) {
    if (this.g.phase !== 'playing') return;
    if (this.p.role === 'killer') return this.thinkKiller(dt);
    if (this.p.role === 'police') this.thinkPolice();
    this.wander(dt);
  }

  // ---------- Katil ----------
  thinkKiller(dt) {
    const g = this.g;
    const p = this.p;
    if (this.aim) {
      const t = g.byId.get(this.aim.id);
      const lostEyeContact = t && g.angleFromGaze(t, p) > g.cfg.witnessAngleDeg * DEG * 0.8;
      if (!t || !t.alive || lostEyeContact || g.time - this.aim.since > 2.2) {
        this.aim = null;
      } else {
        this.lookAtPlayer(t, dt, false);
        if (g.angleFromGaze(p, t) < 3.5 * DEG && g.time >= p.cooldownUntil) {
          // Dönerken başkası bakmaya başladıysa vazgeçer (riskli ise nadiren yine de dener).
          const wr = g.cfg.witnessAngleDeg * DEG;
          const bystanders = this.strangers().filter((q) => q !== t && g.angleFromGaze(q, p) <= wr * 1.1).length;
          if (bystanders > 0 && g.rng() > this.d.killerRisk) {
            this.aim = null;
            this.nextDecision = g.time + this.rnd(0.4, 1.0);
            return;
          }
          g.wink(p.id, t.id);
          this.aim = null;
          this.holdUntil = g.time + 0.6;
          this.nextDecision = g.time + this.rnd(0.5, 1.2);
        }
        return;
      }
    }
    if (g.time < this.holdUntil) return;
    this.wander(dt);
    if (g.time >= this.nextDecision && g.time >= p.cooldownUntil) this.decideWink();
  }

  decideWink() {
    const g = this.g;
    const p = this.p;
    const wr = g.cfg.witnessAngleDeg * DEG;
    this.nextDecision = g.time + this.rnd(0.35, 0.8);
    // Takım arkadaşları ne hedef ne de tanık riski sayılır.
    const others = this.strangers();
    // Şu an gözünün içine bakanlar adaydır (bakmayan işareti fark edemez).
    const looking = others.filter((q) => g.angleFromGaze(q, p) <= wr * 0.6);
    if (!looking.length) return;
    let best = null;
    let bestScore = 99;
    for (const t of looking) {
      // Başka kaç kişi katile bakıyor? Her biri polis olabilir.
      const risk = others.filter((q) => q !== t && g.angleFromGaze(q, p) <= wr * 1.15).length;
      const score = risk + g.rng() * 0.5;
      if (score < bestScore) { bestScore = score; best = t; }
    }
    const risk = Math.floor(bestScore);
    const sinceLast = g.time - Math.max(p.cooldownUntil - g.cfg.winkCooldown, g.cfg.revealSeconds);
    let go = risk === 0;
    if (!go) {
      // Son dakikada (geri sayım) daha çok risk alır: süre dolarsa zaten kaybeder.
      const urgency = g.timeLeft() <= g.cfg.countdownSeconds ? 0.35 : 0;
      const impatience = Math.min(0.25, Math.max(0, sinceLast - 8) * 0.03) + urgency;
      go = g.rng() < this.d.killerRisk * (risk === 1 ? 1 : 0.4) + impatience;
    }
    if (go) this.aim = { id: best.id, since: g.time };
  }

  // ---------- Polis ----------
  thinkPolice() {
    const g = this.g;
    if (this.p.lives <= 0) { this.accuse = null; return; } // hakkı bitti: yalnızca izler
    if (this.accuse && g.time >= this.accuse.at) {
      const plan = this.accuse;
      this.accuse = null;
      const t = g.byId.get(plan.id);
      if (t && t.alive) {
        const r = g.accuse(this.p.id, t.id);
        if (r && r.ok) {
          const key = (r.correct ? 'ok_' : 'wrong_') + plan.via;
          g.stats[key] = (g.stats[key] || 0) + 1;
          if (!r.correct) this.suspicion.set(t.id, -99); // masum çıktı, listeden düş
        }
      }
      return;
    }
    if (!this.accuse && g.time - this.lastAccuseAt > 3) {
      const ranked = this.strangers()
        .map((q) => [q.id, this.suspicion.get(q.id) || 0])
        .sort((a, b) => b[1] - a[1]);
      // K katil kaldıysa K şüphelinin birden yüksek puan alması beklenir: en şüpheliyi ikinciyle değil,
      // (K+1)'inciyle karşılaştır. Kalan katil sayısı herkesin bildiği bilgidir (yakalananlar duyurulur).
      const k = g.players.filter((q) => q.alive && q.role === 'killer').length;
      const rival = ranked[k] ?? [null, 0];
      if (
        ranked.length >= 2 &&
        ranked[0][1] >= this.d.minEvidence &&
        ranked[0][1] - rival[1] >= this.d.margin
      ) {
        this.accuse = { at: g.time + this.rnd(1.0, 2.5), id: ranked[0][0], via: 'deduced' };
        this.lastAccuseAt = g.time;
      }
    }
  }

  /** Oyun, bu botun işareti gördüğünü bildirir (yalnızca bakışı katile yeterince yakınsa). */
  onSignalSeen(killer) {
    if (this.p.role !== 'police' || this.accuse || this.p.lives <= 0) return;
    const g = this.g;
    if (g.rng() > this.attention) return;
    let target = killer;
    if (g.rng() < this.d.policeMisId) {
      const pool = this.strangers().filter((q) => q !== killer);
      if (pool.length) target = pool[Math.floor(g.rng() * pool.length)];
    }
    this.accuse = { at: g.time + this.rnd(this.d.reaction[0], this.d.reaction[1]), id: target.id, via: 'seen' };
    this.look = { id: killer.id, until: this.accuse.at + 0.5, jy: 0, jp: 0 };
  }

  /** Biri öldüğünde: ölmeden hemen önce ona bakmış olanların şüphe puanı artar. */
  onDeath(victim, reason) {
    if (this.p.role !== 'police' || reason === 'caught') return; // yakalanan katil bir cinayet değil
    const g = this.g;
    for (const q of g.players) {
      if (q === this.p || q === victim || !q.alive || this.isTeammate(q)) continue;
      const t = g.lookLog.get(q.id).get(victim.id);
      if (t !== undefined && g.time - t <= 6.5) {
        this.suspicion.set(q.id, (this.suspicion.get(q.id) || 0) + 1);
      }
    }
  }
}
