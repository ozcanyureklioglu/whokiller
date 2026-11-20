// layout.js — masanın ekrandaki düzeni (yalnızca istemci; DOM/Three bilmez, Node testlerinde de çalışır).
//
// Sunucu oyunu düzgün bir yuvarlak masada hesaplar (kanonik düzen): bakış açıları, kimin kime baktığı,
// nişan toleransı. O düzende izleyicinin yan komşuları çok yakında ve tam yanda (60–72°) oturur.
//
// Her istemci kendi ekranında masayı yine ÇEMBER biçiminde kurar: herkes (izleyici dahil) bir çemberin üstünde,
// gövdesi masanın ortasına dönük oturur. Tek fark, izleyicinin iki yanında boşluk bırakılmasıdır: yan
// komşular izleyiciden en az RING.nearMin metre uzakta ve ±46–52°'de oturur (rahat görülür, çok dönmek
// gerekmez); diğerleri çemberin geri kalanına, aralarında en az RING.spacing metre olacak şekilde dizilir.
// Çemberde karşılıklı oturanlar birbirine bakarken yüzleri izleyiciye de dönüktür: "sıra halinde, herkes
// karşıda" düzenine göre göz kırpma çok daha sık önden / yarı yandan görünür.
//
// Bakışlar iki düzen arasında "koltuk koltuk" eşlenir: kanonik düzende X'in tam yüzüne bakan kişi,
// ekrandaki düzende de X'in tam yüzüne bakar; iki komşu arasının neresine bakıyorsa burada da oraya bakar.
// Böylece sunucunun kuralları değişmez, her oyuncu kendi ekranında doğru kişiyi doğru yöne bakarken görür.

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const wrapPi = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

/**
 * Çember düzeninin ölçüleri.
 * side: izleyicinin yan komşularının görünme açısı (°; 4 kişide 46°, 10 kişide 52° — kalabalıkta çember
 *       daha çok dolsun, masa gereğinden büyümesin)
 * spacing: yan yana oturanların arası en az (m) · nearMin: yan komşuların izleyiciye en az uzaklığı (m)
 * edge: oturanların göz hizasından masa kenarına yatay uzaklık (m)
 */
export const RING = { side: [46, 52], nMin: 4, nMax: 10, spacing: 1.4, nearMin: 2.8, edge: 0.72 };

/** n kişilik masada çember: yarıçap r, izleyici–yan komşu arası merkez açısı gap, diğerlerinin arası step. */
export function ringDims(n) {
  const f = Math.min(1, Math.max(0, (n - RING.nMin) / (RING.nMax - RING.nMin)));
  const side = (RING.side[0] + (RING.side[1] - RING.side[0]) * f) * DEG;
  const gap = Math.PI - 2 * side; // çemberde: merkez açısı gap olan komşu, izleyiciden (90° − gap/2) yanda görünür
  const step = (TAU - 2 * gap) / Math.max(1, n - 2);
  // Yan komşu en az nearMin uzakta, yan yana oturanların arası (kiriş) en az spacing olsun.
  const r = Math.max(RING.nearMin / (2 * Math.sin(gap / 2)), RING.spacing / (2 * Math.sin(step / 2)));
  return { r, gap, step };
}

/**
 * Çember düzeni. you: izleyicinin koltuk numarası. Döner:
 *  pos[seat]  = [x, y, z] göz konumu · face[seat] = [x, z] gövdenin döndüğü nokta (masanın ortası)
 *  table      = { r, seat }: masa yarıçapı ve oturanların çemberinin yarıçapı
 * Masanın ortası sahnenin merkezidir (0, 0) (lamba onun üstünde); izleyici (-seat, 0)'da, +X'e bakar.
 * Diğerleri kanonik düzendeki sırayla (açı artan yönde) çember boyunca dizilir.
 */
export function tableLayout(n, you, y = 1.22) {
  const { r, gap, step } = ringDims(n);
  const pos = new Array(n);
  const face = new Array(n);
  pos[you] = [-r, y, 0];
  face[you] = [0, 0];
  for (let k = 1; k < n; k++) {
    const a = Math.PI + gap + (k - 1) * step;
    const seat = (you + k) % n;
    pos[seat] = [r * Math.cos(a), y, r * Math.sin(a)];
    face[seat] = [0, 0]; // herkes masanın ortasına döner (gerçek yuvarlak masa gibi)
  }
  return { pos, face, table: { r: r - RING.edge, seat: r } };
}

/**
 * Koltuk i'den diğer koltuklara (i+1, i+2, ... sırasıyla) yatay bakış açıları, masa merkezine bakış yönüne göre.
 * Dışbükey bir masada bu açılar sırayla artar; eşleme bunların arasında doğrusal yapılır.
 */
function seatAngles(pos, i) {
  const n = pos.length;
  const [x, , z] = pos[i];
  const ref = Math.atan2(-z, -x);
  const rel = [];
  for (let k = 1; k < n; k++) {
    const q = pos[(i + k) % n];
    rel.push(wrapPi(Math.atan2(q[2] - z, q[0] - x) - ref));
  }
  return { ref, rel };
}

/** src açı dizisindeki bir değeri dst dizisindeki karşılığına taşır (parça parça doğrusal; uçların dışında aynen kayar). */
function mapRel(v, src, dst) {
  const m = src.length;
  if (v <= src[0]) return dst[0] + (v - src[0]);
  if (v >= src[m - 1]) return dst[m - 1] + (v - src[m - 1]);
  let k = 0;
  while (k < m - 2 && v > src[k + 1]) k++;
  const f = (v - src[k]) / (src[k + 1] - src[k]);
  return dst[k] + f * (dst[k + 1] - dst[k]);
}

/**
 * Kanonik (sunucu) düzen ile görünüş (kavisli) düzeni arasında yatay bakış açısı (yaw) eşlemesi.
 * Dikey açı (pitch) iki düzende aynıdır: herkesin başı aynı yükseklikte.
 */
export class GazeMap {
  /** canon, view: koltuk numarasına göre [x, y, z] dizileri. */
  constructor(canon, view) {
    this.c = canon.map((_, i) => seatAngles(canon, i));
    this.v = view.map((_, i) => seatAngles(view, i));
  }

  /** Sunucudan gelen bakış → ekrandaki karakterin bakışı. */
  toView(seat, yaw) {
    const c = this.c[seat];
    const v = this.v[seat];
    if (!c || c.rel.length < 1) return yaw;
    return wrapPi(v.ref + mapRel(wrapPi(yaw - c.ref), c.rel, v.rel));
  }

  /** Ekranda baktığım yön → sunucuya gönderilecek (kanonik) bakış. */
  toCanon(seat, yaw) {
    const c = this.c[seat];
    const v = this.v[seat];
    if (!c || c.rel.length < 1) return yaw;
    return wrapPi(c.ref + mapRel(wrapPi(yaw - v.ref), v.rel, c.rel));
  }
}
