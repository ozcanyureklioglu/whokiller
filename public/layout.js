// layout.js — masanın ekrandaki düzeni (yalnızca istemci; DOM/Three bilmez, Node testlerinde de çalışır).
//
// Sunucu oyunu YUVARLAK masada hesaplar (kanonik düzen): bakış açıları, kimin kime baktığı, nişan toleransı.
// Yuvarlak masada yan komşular yanda kalır ve bedenleri masanın ortasına döndüğü için yandan görünür;
// onlara bakmak için de çok dönmek gerekir.
//
// Bu yüzden her istemci kendi ekranında masayı KAVİSLİ kurar: oyuncu masanın bir ucunda oturur, diğerleri
// karşısındaki bir yay boyunca YÜZLERİ ONA DÖNÜK oturur (aralarında en az ARC.spacing metre). Herkes
// karşıdadır ve önden görünür; yayın uçları bile ±42–46° içinde kalır (16:9 ekrana sığar). Yay üzerinde
// komşular birbirine yandan bakar; bunu doğal göstermek için karakter yana bakarken omuzları da döner
// (scene.js, Avatar.update).
// ARC.k > 0 yayın merkezini izleyicinin önüne alır: masa yelpaze yerine daha yuvarlak görünür (uçtakiler
// izleyiciye biraz daha yakın, ortadakiler biraz daha uzak oturur). k = 1 tam yuvarlak masa olurdu.
//
// Bakışlar iki düzen arasında "koltuk koltuk" eşlenir: kanonik düzende X'in tam yüzüne bakan kişi,
// kavisli düzende de X'in tam yüzüne bakar; iki komşu arasının neresine bakıyorsa burada da oraya bakar.
// Böylece sunucunun kuralları değişmez, her oyuncu kendi ekranında doğru kişiyi doğru yöne bakarken görür.

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const wrapPi = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

/**
 * Kavisli düzenin ölçüleri.
 * k: yay merkezinin izleyicinin önündeki uzaklığı / yay yarıçapı — büyüdükçe masa daha yuvarlak (0: izleyici merkezde)
 * view: yayın uçlarının izleyiciden görünme açısı (4 kişide 42°, 10 kişide 46°: yakındakiler daha iri, payla ekrana sığsın)
 * spacing: yan yana oturanların arası en az (m)
 * endMin: uçtakilerin izleyiciye en küçük uzaklığı (m; küçük masada çok yakın olup ekranı kaplamasınlar)
 * edge: oturanların önündeki masa kenarına uzaklık (m) · near: izleyicinin önündeki masa ucunun uzaklığı (m)
 */
export const ARC = { k: 0.3, view: [42, 46], nMin: 4, nMax: 10, spacing: 1.25, endMin: 2.8, edge: 0.72, near: 0.45 };

/** Yayın merkezden görünen yarı açısı psi: uçlar izleyiciden tam viewDeg açısında görünsün. */
function arcHalfAngle(viewDeg) {
  const target = viewDeg * DEG;
  let lo = 0;
  let hi = Math.PI * 0.95;
  for (let i = 0; i < 50; i++) {
    const m = (lo + hi) / 2;
    if (Math.atan2(Math.sin(m), ARC.k + Math.cos(m)) < target) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

/** n kişilik masada yay: yarıçap r, merkezin izleyiciden uzaklığı c, yarı açı psi. */
export function arcDims(n) {
  const f = Math.min(1, Math.max(0, (n - ARC.nMin) / (ARC.nMax - ARC.nMin)));
  const psi = arcHalfAngle(ARC.view[0] + (ARC.view[1] - ARC.view[0]) * f);
  const endF = Math.hypot(ARC.k + Math.cos(psi), Math.sin(psi)); // uçtakinin uzaklığı / r
  const step = (2 * psi) / Math.max(1, n - 2); // komşular arası açı (yay merkezinden)
  // Komşuların arası (düz mesafe, kiriş) en az ARC.spacing olsun.
  const r = Math.max(ARC.endMin / endF, ARC.spacing / (2 * Math.sin(step / 2)));
  return { r, c: ARC.k * r, psi };
}

/**
 * Kavisli düzen. you: izleyicinin koltuk numarası. Döner:
 *  pos[seat]  = [x, y, z] göz konumu · face[seat] = [x, z] gövdenin döndüğü nokta
 *  table      = { cx, c, ri, ro, phi, near, mid } masa: izleyici (cx, 0)'da; uzak kenar merkezi (cx + c, 0) olan
 *               ro yarıçaplı yay (±phi), yakın kenar izleyicinin çevresinde ri yarıçaplı yay (±near);
 *               mid: izleyiciden masanın ortasına uzaklık
 * İzleyici +X'e bakar; sahnenin merkezi (0, 0) masanın ortasına düşer (lamba onun üstünde).
 * Diğerleri kanonik düzendeki sırayla (açı artan yönde) yay boyunca eşit aralıklı dizilir.
 */
export function arcLayout(n, you, y = 1.22) {
  const { r, c, psi } = arcDims(n);
  const ro = r - ARC.edge;
  const mid = (c + ro) / 2;
  const cx = -mid;
  const pos = new Array(n);
  const face = new Array(n);
  pos[you] = [cx, y, 0];
  face[you] = [0, 0];
  for (let k = 1; k < n; k++) {
    const a = n > 2 ? -psi + ((k - 1) * 2 * psi) / (n - 2) : 0;
    const seat = (you + k) % n;
    pos[seat] = [cx + c + r * Math.cos(a), y, r * Math.sin(a)];
    face[seat] = [cx, 0]; // herkes izleyiciye döner: önden görünür
  }
  // Uçtakilerin önünde de masa olsun: açıya yarım koltuk ekle.
  const phi = Math.min(Math.PI * 0.6, psi + Math.asin(Math.min(1, (ARC.spacing / 2) / ro)));
  return { pos, face, table: { cx, c, ri: ARC.near, ro, phi, near: 55 * DEG, mid } };
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
