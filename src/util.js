// Ortak yardımcılar: açı/vektör matematiği, rastgelelik, isim temizleme.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Açıyı (-PI, PI] aralığına getirir. */
export function wrapPi(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/**
 * Bakış yönü: yaw, XZ düzleminde +X'ten +Z'ye doğru artar; pitch yukarı pozitiftir.
 * İstemci (Three.js) ile birebir aynı formül kullanılır.
 */
export function dirFromAngles(yaw, pitch) {
  const c = Math.cos(pitch);
  return [c * Math.cos(yaw), Math.sin(pitch), c * Math.sin(yaw)];
}

/** from -> to doğrultusunun [yaw, pitch] değeri. */
export function anglesTo(from, to) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  return [Math.atan2(dz, dx), Math.atan2(dy, Math.hypot(dx, dz))];
}

/** İki vektör arasındaki açı (radyan). */
export function angleBetween(a, b) {
  const la = Math.hypot(a[0], a[1], a[2]);
  const lb = Math.hypot(b[0], b[1], b[2]);
  if (!la || !lb) return Math.PI;
  const c = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb);
  return Math.acos(clamp(c, -1, 1));
}

export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Tohumlu rastgele sayı üreteci (testler ve simülasyon için). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bot isimleri ve cinsiyetleri (m: erkek, f: kadın) — karakterin görünüşü buna göre seçilir. */
export const BOTS = [
  ['Ayşe', 'f'], ['Mehmet', 'm'], ['Zeynep', 'f'], ['Ali', 'm'], ['Elif', 'f'], ['Can', 'm'],
  ['Deniz', 'f'], ['Burak', 'm'], ['Selin', 'f'], ['Emre', 'm'], ['Merve', 'f'], ['Kerem', 'm'],
  ['Ece', 'f'], ['Onur', 'm'], ['Gizem', 'f'], ['Cem', 'm'], ['Naz', 'f'], ['Tolga', 'm'],
].map(([name, gender]) => ({ name, gender }));

export const BOT_NAMES = BOTS.map((b) => b.name);

/** Cinsiyet: yalnızca 'm' (erkek) ya da 'f' (kadın); geçersiz/eksik değer erkek sayılır. */
export function cleanGender(g) {
  return g === 'f' ? 'f' : 'm';
}

/** Oyuncu adını güvenli hale getirir. */
export function cleanName(s) {
  const t = String(s ?? '')
    .replace(/[\u0000-\u001f\u007f<>&"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 14);
  return t || 'Oyuncu';
}
