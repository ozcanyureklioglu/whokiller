// scene.js — Three.js ile 3B oda, masa, karakterler ve işaret animasyonları.
// Dış bağımlılık: yalnızca three (yerelden ya da CDN'den yüklenir).
// Masa kavislidir: izleyici yelpazenin ucunda, diğerleri yay boyunca ona dönük oturur (bkz. layout.js).
//
// Performans notları:
//  - Karakterin sabit parçaları (sandalye, kollar, eller, kafa, saç...) tek geometride birleştirilir;
//    renkler vertex color olarak gömülür, malzeme tüm karakterlerde ortaktır. ~30 mesh → ~9 mesh.
//  - Nokta ışığın gölgesi sahneyi 6 yönden yeniden çizer; bu yüzden gölge atan nesne sayısı en aza
//    indirildi ve gölge haritası her kare DEĞİL, yalnızca sahne değişince (masa kurulunca, biri ölünce)
//    çizilir. Karakterler yer değiştirmez; kafa kendi merkezi etrafında döner, kürenin gölgesi değişmez.
//  - Kalite ön ayarları (high / medium / low) ve "otomatik" mod: FPS düşerse önce gölgeyi kapatır,
//    sonra çözünürlüğü düşürür; düşürmek işe yaramıyorsa geri alır ve durur.

import { arcLayout } from './layout.js';

const TAU = Math.PI * 2;
const wrapPi = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

// Göz kapağı açısı: OPEN = açık (arkaya yatmış), CLOSED = göz önünü tamamen kapatmış.
const LID_OPEN = -1.15;
const LID_CLOSED = 1.5;

// Render katmanları: 0 = sahne, HUD = isim etiketleri / göz işaretleri, FX = odak karartması.
// Ana kamera hepsini, polisin yakın plan kamerası yalnızca sahneyi çizer.
const LAYER_HUD = 1;
const LAYER_FX = 2;

const SKINS = [0xf1c9a5, 0xe0ac86, 0xc68642, 0x9a6234, 0xffdbac, 0xd9a273];
const SHIRTS = [0xd94f4f, 0x4f86d9, 0x4fb37a, 0xd9a54f, 0x9a5fd9, 0x4fc7c7, 0xd96fa8, 0x8aa83c, 0xe07a3a, 0x6b7a8f];
const HAIRS_M = [0x1b1411, 0x3b2314, 0x6b4423, 0xb5651d, 0xd9b36a, 0x8a8a8a, 0x2b2b4a];
const HAIRS_F = [0x1b1411, 0x3b2314, 0x6b4423, 0xb5651d, 0xd9b36a, 0x7a2e1c, 0x2b2b4a];
// Makyaj (kadın karakterler): ruj, göz farı, allık
const LIPS = [0xc2185b, 0xd23a4f, 0xa8323e, 0xe06a85, 0x9a2f5a];
const SHADOWS = [0x8e5b9e, 0x6b4a3a, 0x4f7ab0, 0xb07a5a];
const BLUSH = 0xff6f91;
const GOLD = 0xd4af37;

/** Geometrinin yüzlerini ters çevirir (içten görünsün): uzun saçın iç yüzü için. */
function flipFaces(geo) {
  const ix = geo.index.array;
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; }
  const n = geo.attributes.normal.array;
  for (let i = 0; i < n.length; i++) n[i] = -n[i];
  return geo;
}

/**
 * Grafik kalite ön ayarları.
 * maxPR: en yüksek piksel oranı · aa: kenar yumuşatma (yalnızca açılışta değişebilir)
 * shadowSize: gölge haritasının bir yüzünün çözünürlüğü
 * lambert: karakterler dahil her şeyde ucuz ışıklandırma (odanın pürüzlü yüzeyleri her ayarda Lambert)
 */
export const QUALITY = {
  high:   { maxPR: 1.5,  aa: true,  shadows: true,  shadowSize: 1024, lambert: false, dust: 220 },
  medium: { maxPR: 1.25, aa: true,  shadows: true,  shadowSize: 512,  lambert: false, dust: 160 },
  low:    { maxPR: 1,    aa: false, shadows: false, shadowSize: 512,  lambert: true,  dust: 90 },
};

function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Three.js'i önce yerelden (npm i three), olmazsa CDN'den yükler. */
export async function loadThree() {
  const urls = [
    '/vendor/three/three.module.js',
    'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
    'https://unpkg.com/three@0.160.0/build/three.module.js',
  ];
  let last;
  for (const u of urls) {
    try { return await import(u); } catch (e) { last = e; }
  }
  throw last;
}

function canvasTex(T, w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) {
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  return tex;
}

/** Konum / dönüş (Euler dizisi ya da Quaternion) / ölçekten dönüşüm matrisi. */
function xf(T, p = [0, 0, 0], r = null, s = null) {
  const q = !r ? new T.Quaternion() : r.isQuaternion ? r : new T.Quaternion().setFromEuler(new T.Euler(r[0], r[1], r[2]));
  return new T.Matrix4().compose(new T.Vector3(p[0], p[1], p[2]), q, new T.Vector3(...(s || [1, 1, 1])));
}

/**
 * Parçaları tek BufferGeometry'de birleştirir → tek draw call (ve gölge geçişinde tek çizim).
 * parts: [{ geo, m?: Matrix4, color?: Color, tint?: bool }]. Girdi geometrileri dispose edilir.
 * withColor: her parçanın rengi vertex color olarak gömülür; tint=true parçaların aralıkları
 * userData.tint'e yazılır (ölünce griye boyamak için).
 */
function mergeParts(T, parts, withColor = false) {
  let nv = 0;
  let ni = 0;
  for (const { geo } of parts) {
    nv += geo.attributes.position.count;
    ni += geo.index ? geo.index.count : geo.attributes.position.count;
  }
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const uv = new Float32Array(nv * 2);
  const col = withColor ? new Float32Array(nv * 3) : null;
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  const tint = [];
  let vo = 0;
  let io = 0;
  for (const p of parts) {
    const g = p.geo;
    if (p.m) g.applyMatrix4(p.m);
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    if (col) {
      const c = p.color;
      for (let i = vo; i < vo + n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      if (p.tint) tint.push([vo, n]);
    }
    if (g.index) {
      const a = g.index.array;
      for (let i = 0; i < a.length; i++) idx[io++] = a[i] + vo;
    } else {
      for (let i = 0; i < n; i++) idx[io++] = vo + i;
    }
    vo += n;
    g.dispose();
  }
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.BufferAttribute(pos, 3));
  out.setAttribute('normal', new T.BufferAttribute(nor, 3));
  out.setAttribute('uv', new T.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new T.BufferAttribute(col, 3));
  out.setIndex(new T.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  out.userData.tint = tint;
  return out;
}

/** Vertex color'ları (yalnızca tint aralıklarını) hedef renge doğru karıştırır. */
function tintGeometry(geo, color, k) {
  const attr = geo.attributes.color;
  const a = attr.array;
  for (const [start, n] of geo.userData.tint) {
    for (let i = start; i < start + n; i++) {
      a[i * 3] += (color.r - a[i * 3]) * k;
      a[i * 3 + 1] += (color.g - a[i * 3 + 1]) * k;
      a[i * 3 + 2] += (color.b - a[i * 3 + 2]) * k;
    }
  }
  attr.needsUpdate = true;
}

// ---------------------------------------------------------------------------
class Avatar {
  constructor(world, info, isYou) {
    const T = (this.T = world.T);
    const S = world.shared;
    this.id = info.id;
    this.name = info.name;
    this.isYou = isYou;
    this.alive = true;
    this.roleText = '';
    this.roleColor = '#fff';
    this.leftTag = ''; // oyundan çıktıysa ismin yanına yazılır

    const x = info.pos[0];
    const z = info.pos[2];
    // Gövdenin döndüğü nokta: kavisli düzende herkes izleyiciye döner (bkz. layout.js), yoksa masanın merkezi.
    const [fx, fz] = info.face || [0, 0];
    this.fwdYaw = Math.atan2(fz - z, fx - x);
    const rnd = rngFrom(hashStr(info.id + info.name));
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

    this.group = new T.Group();
    this.group.position.set(x, 0, z);
    this.group.lookAt(fx, 0, fz);
    const g = this.group;

    // Cinsiyet (isim ekranında seçilir, botlarda isme göre): saç, makyaj, omuz genişliği buna göre.
    const female = info.gender === 'f';
    this.gender = female ? 'f' : 'm';
    const skinC = new T.Color(pick(SKINS));
    const shirtC = new T.Color(pick(SHIRTS));
    const hairC = new T.Color(pick(female ? HAIRS_F : HAIRS_M));
    const woodC = new T.Color(0x3a2a1e);
    const mouthC = new T.Color(0x5a1f26);
    // Kadınlarda göz farı: göz kapağı tenle göz farı rengi arasında (kırpınca da görünür)
    const lidC = female ? skinC.clone().lerp(new T.Color(pick(SHADOWS)), 0.45) : skinC;

    // Karaktere özel iki malzeme (ölünce griye döner). Geri kalanı vertex color + ortak malzeme.
    this.shirt = world.mat({ color: shirtC, roughness: 0.85, metalness: 0.02 });
    this.lidMat = world.mat({ color: lidC, roughness: 0.65, metalness: 0.02, side: T.DoubleSide });

    // --- Gövde: sandalye + kollar + eller + boyun → tek mesh ---
    const body = [];
    const part = (list, geo, m, color, tint) => list.push({ geo, m, color, tint });
    part(body, new T.BoxGeometry(0.56, 0.06, 0.52), xf(T, [0, 0.43, -0.02]), woodC, false);
    part(body, new T.BoxGeometry(0.56, 0.62, 0.06), xf(T, [0, 0.78, -0.31]), woodC, false);
    for (const sx of [-0.24, 0.24]) {
      for (const sz of [-0.24, 0.2]) {
        part(body, new T.CylinderGeometry(0.025, 0.025, 0.42, 6), xf(T, [sx, 0.21, sz]), woodC, false);
      }
    }
    // Kollar (omuz → dirsek → el), eller masanın üstünde
    const up = new T.Vector3(0, 1, 0);
    const limb = (p0, p1, r) => {
      const v0 = new T.Vector3(...p0);
      const v1 = new T.Vector3(...p1);
      const mid = v0.clone().add(v1).multiplyScalar(0.5);
      const q = new T.Quaternion().setFromUnitVectors(up, v1.clone().sub(v0).normalize());
      part(body, new T.CylinderGeometry(r, r * 0.9, v0.distanceTo(v1), 10), xf(T, mid.toArray(), q), shirtC, true);
    };
    for (const s of [-1, 1]) {
      limb([s * 0.27, 0.95, 0], [s * 0.34, 0.8, 0.3], 0.055);
      limb([s * 0.34, 0.8, 0.3], [s * 0.2, 0.83, 0.58], 0.05);
      part(body, new T.SphereGeometry(0.058, 12, 10), xf(T, [s * 0.2, 0.83, 0.6]), skinC, true);
    }
    // Kendi kafamın içinden bakıyorum: boyun hiç eklenmez.
    if (!isYou) part(body, new T.CylinderGeometry(0.06, 0.07, 0.14, 10), xf(T, [0, 1.03, 0.01]), skinC, true);
    this.bodyGeo = mergeParts(T, body, true);
    const bodyMesh = new T.Mesh(this.bodyGeo, S.mat.body);
    bodyMesh.castShadow = true; // gölge almaz: lamba önden-üstten vurur, öz-gölge önden görünmez

    g.add(bodyMesh);

    // Gövde ayrı mesh: nefes alma animasyonu için ölçeklenir.
    this.torso = new T.Mesh(S.geo.torso, this.shirt);
    this.torso.position.set(0, 0.72, 0);
    this.torso.scale.set(female ? 1.15 : 1.25, 1, female ? 0.76 : 0.8); // kadınlarda omuzlar biraz dar
    this.torso.castShadow = true;
    g.add(this.torso);

    // --- Kafa ---
    this.head = new T.Group();
    this.head.position.set(0, 1.22, 0.03);
    g.add(this.head);
    const H = this.head;

    // Kafa derisi + kulaklar + burun + ağız + saç/şapka → tek mesh
    const head = [];
    // Saç modeli: kadında 0 uzun, 1 küt, 2 at kuyruğu, 3 topuz; erkekte 0–5 (aşağıda)
    const style = Math.floor(rnd() * (female ? 4 : 6));
    const earsHidden = female && style <= 1; // uzun / küt saç kulakları örter (kulak saçtan taşmasın)
    part(head, new T.SphereGeometry(0.19, 28, 20), null, skinC, true);
    for (const s of earsHidden ? [] : [-1, 1]) {
      part(head, new T.SphereGeometry(0.04, 10, 8), xf(T, [s * 0.19, 0, -0.01], null, [0.5, 1, 0.8]), skinC, true);
    }
    part(head, new T.SphereGeometry(0.03, 10, 8), xf(T, [0, -0.015, 0.185], null, [1, 1, 1.15]), skinC, true);

    // Saç / şapka / makyaj (rastgele, cinsiyete göre). Hepsi kafa geometrisine gömülür: ek draw call yok.
    // Kaşların ve ağzın önü hep açık kalır: kaş kaldırma ve dil çıkarma işaretleri her karakterde okunur.
    const hp = (geo, m, color) => part(head, geo, m, color, true);
    const cap = (color, r = 0.2) => hp(
      new T.SphereGeometry(r, 24, 12, 0, TAU, 0, Math.PI * 0.55), xf(T, [0, 0.015, -0.01], [-0.35, 0, 0]), color);
    // p0'dan p1'e uzanan, uca doğru incelen silindir (at kuyruğu vb.)
    const strand = (p0, p1, r0, r1, color) => {
      const v0 = new T.Vector3(...p0);
      const v1 = new T.Vector3(...p1);
      const q = new T.Quaternion().setFromUnitVectors(up, v0.clone().sub(v1).normalize());
      hp(new T.CylinderGeometry(r0, r1, v0.distanceTo(v1), 12), xf(T, v0.clone().add(v1).multiplyScalar(0.5).toArray(), q), color);
    };
    // Kafa yüzeyine yatık küçük disk (allık): (x, y) noktasında yüzeyin normaline döner.
    const onFace = (x, y, r, scale, color) => {
      const n = new T.Vector3(x, y, Math.sqrt(Math.max(0, 0.19 * 0.19 - x * x - y * y))).normalize();
      const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), n);
      hp(new T.SphereGeometry(r, 12, 8), xf(T, n.clone().multiplyScalar(0.191).toArray(), q, scale), color);
    };

    if (female) {
      // --- Saç: hepsinde kafayı saran saç + modele göre uzun saç / küt / at kuyruğu / topuz ---
      cap(hairC);
      // Omuzlara dökülen saç: önü açık, aşağı doğru genişleyen kabuk (dış + iç yüz, her yönden görünür)
      const curtain = (rTop, rBot, yTop, yBot, open) => {
        const mk = () => new T.CylinderGeometry(rTop, rBot, yTop - yBot, 28, 1, true, open, TAU - 2 * open);
        const m = xf(T, [0, (yTop + yBot) / 2, -0.012]);
        hp(mk(), m, hairC);
        hp(flipFaces(mk()), m.clone(), hairC);
      };
      if (style === 0) curtain(0.2, 0.228, 0.03, -0.3, 0.95);         // uzun düz saç (omuz hizası)
      else if (style === 1) curtain(0.205, 0.228, 0.03, -0.14, 0.9);  // küt (çene hizası)
      else if (style === 2) {                                         // at kuyruğu
        hp(new T.SphereGeometry(0.035, 10, 8), xf(T, [0, 0.05, -0.205]), hairC);
        strand([0, 0.04, -0.215], [0, -0.27, -0.27], 0.05, 0.022, hairC);
      } else {                                                        // topuz
        hp(new T.SphereGeometry(0.085, 16, 12), xf(T, [0, 0.15, -0.15]), hairC);
      }
      // --- Makyaj: ruj (iki dudak), allık, göz farı (kapaklarda), eyeliner ---
      const lipC = new T.Color(pick(LIPS));
      hp(new T.SphereGeometry(0.03, 14, 8), xf(T, [0, -0.081, 0.171], null, [1.3, 0.34, 0.5]), lipC);
      hp(new T.SphereGeometry(0.03, 14, 8), xf(T, [0, -0.095, 0.168], null, [1.15, 0.42, 0.5]), lipC);
      const blushC = skinC.clone().lerp(new T.Color(BLUSH), 0.42);
      for (const s of [-1, 1]) onFace(s * 0.108, -0.04, 0.034, [1, 0.62, 0.15], blushC);
      // Eyeliner: üst kapak çizgisi, dış köşede hafif kuyruk. Kapak açıkken de dışarıda kalır.
      const linerC = new T.Color(0x120c0c);
      for (const s of [-1, 1]) {
        const start = s > 0 ? -0.28 : Math.PI + 0.28 - 2.35;
        hp(new T.TorusGeometry(0.056, 0.0045, 6, 18, 2.35), xf(T, [s * 0.075, 0.03, 0.156], [0, s * 0.35, start]), linerC);
      }
      // Küpe (kulağı açık olanların yarısında): kulak memesinin altında küçük altın top
      if (!earsHidden && rnd() < 0.5) for (const s of [-1, 1]) hp(new T.SphereGeometry(0.016, 10, 8), xf(T, [s * 0.196, -0.055, -0.005]), new T.Color(GOLD));
    } else {
      part(head, new T.BoxGeometry(0.07, 0.012, 0.012), xf(T, [0, -0.088, 0.172]), mouthC, false);
      // --- Saç / şapka: kısa, kabarık önlü, favorili, tepesi açık, bere, kasket ---
      if (style <= 2) cap(hairC);
      if (style === 1) hp(new T.SphereGeometry(0.09, 16, 10), xf(T, [0, 0.165, 0.06], [-0.5, 0, 0], [1.25, 0.45, 1]), hairC);
      if (style === 2) for (const s of [-1, 1]) hp(new T.BoxGeometry(0.022, 0.07, 0.045), xf(T, [s * 0.185, -0.035, 0.045]), hairC);
      if (style === 3) {
        // Tepesi açık: kulakların hizasından başlayıp enseyi saran saç (yüzün yanları açık)
        hp(new T.SphereGeometry(0.198, 24, 8, Math.PI / 2 + 1.15, TAU - 2.3, Math.PI * 0.36, Math.PI * 0.24), null, hairC);
      }
      if (style === 4) {
        const hatC = new T.Color(pick(SHIRTS));
        cap(hatC, 0.205);
        hp(new T.SphereGeometry(0.05, 10, 8), xf(T, [0, 0.22, -0.02]), hatC);
      }
      if (style === 5) {
        const hatC = new T.Color(pick(SHIRTS));
        cap(hatC, 0.205);
        hp(new T.BoxGeometry(0.26, 0.012, 0.13), xf(T, [0, 0.07, 0.2]), hatC);
      }
      // --- Bıyık / sakal (bazılarında). Sakal ağzın altından başlar: dil çıkarma görünür kalır. ---
      const fh = rnd();
      if (fh < 0.4) hp(new T.SphereGeometry(0.045, 14, 8), xf(T, [0, -0.06, 0.174], null, [1, 0.28, 0.4]), hairC);
      if (fh < 0.18) {
        hp(new T.SphereGeometry(0.2, 24, 10, Math.PI / 2 - 1.45, 2.9, Math.PI * 0.66, Math.PI * 0.27), null, hairC);
      }
    }
    this.headGeo = mergeParts(T, head, true);
    const headMesh = new T.Mesh(this.headGeo, S.mat.head);
    headMesh.castShadow = true;
    H.add(headMesh);

    // Göz akları + göz bebekleri: tüm karakterlerde ortak tek geometri. Gölge almaz/atmaz.
    H.add(new T.Mesh(S.geo.eyes, S.mat.eyes));

    // Göz kapakları: pivot etrafında dönerek kapanır (göz kırpma bunlarla görünür).
    this.eyes = {};
    for (const s of [-1, 1]) {
      const pivot = new T.Group();
      pivot.position.set(s * 0.075, 0.03, 0.152);
      pivot.add(new T.Mesh(S.geo.lid, this.lidMat));
      pivot.rotation.x = LID_OPEN;
      H.add(pivot);
      this.eyes[s] = pivot;
    }

    // Kaşlar (kaş kaldırma işareti için hareketli), dil
    this.browL = new T.Mesh(S.geo.brow, S.mat.dark);
    this.browR = new T.Mesh(S.geo.brow, S.mat.dark);
    this.browL.position.set(-0.075, 0.1, 0.17);
    this.browR.position.set(0.075, 0.1, 0.17);
    this.browL.rotation.z = 0.1;
    this.browR.rotation.z = -0.1;
    const browScale = female ? [0.95, 0.6, 1] : [1.05, 1.3, 1]; // kadında ince, erkekte kalın kaş
    this.browL.scale.set(...browScale);
    this.browR.scale.set(...browScale);
    H.add(this.browL, this.browR);
    this.tongue = new T.Mesh(S.geo.tongue, S.mat.tongue);
    this.tongue.position.set(0, -0.096, 0.165);
    this.tongue.visible = false;
    H.add(this.tongue);

    // İsim etiketi + "sana bakıyor" göz işareti. HUD katmanında (LAYER_HUD): yakın plan kamerası çizmez.
    this.labelCanvas = document.createElement('canvas');
    this.labelCanvas.width = 512; this.labelCanvas.height = 128;
    this.labelTex = new T.CanvasTexture(this.labelCanvas);
    this.labelTex.colorSpace = T.SRGBColorSpace;
    this.label = new T.Sprite(new T.SpriteMaterial({ map: this.labelTex, transparent: true, depthWrite: false }));
    this.label.scale.set(1.2, 0.3, 1);
    this.label.position.set(0, 1.68, 0.03);
    this.label.layers.set(LAYER_HUD);
    g.add(this.label);
    this.drawLabel();

    this.eyeMark = new T.Sprite(S.mat.eyeMark);
    this.eyeMark.scale.set(0.3, 0.15, 1);
    this.eyeMark.position.set(0, 1.92, 0.03);
    this.eyeMark.layers.set(LAYER_HUD);
    this.eyeMark.visible = false;
    g.add(this.eyeMark);

    // Animasyon durumu
    this.tgtYaw = this.curYaw = this.fwdYaw;
    this.tgtPitch = this.curPitch = -0.12;
    this.sig = null;
    this.nextBlink = 1 + rnd() * 3;
    this.blink = 0;
    this.phase = rnd() * 10;
    this.rnd = rnd;
    this.tmpPos = new T.Vector3();
    this.tmpDir = new T.Vector3();
    if (isYou) this.setHidden(true);
  }

  setHidden(hidden) {
    // Kendi kafamın içinden bakıyorum: kafa ve etiket görünmez (boyun zaten eklenmedi).
    this.head.visible = !hidden;
    this.label.visible = !hidden;
  }

  drawLabel() {
    const c = this.labelCanvas;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '700 54px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    const y = this.roleText ? 42 : 64;
    const text = this.leftTag ? `${this.name} · ${this.leftTag}` : this.name;
    g.lineWidth = 9; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(0,0,0,.8)';
    g.strokeText(text, 256, y, 500);
    g.fillStyle = this.alive ? '#ffffff' : '#9aa0aa';
    g.fillText(text, 256, y, 500);
    if (!this.alive && !this.leftTag) {
      const w = g.measureText(this.name).width;
      g.fillRect(256 - w / 2, y, w, 5);
    }
    if (this.roleText) {
      g.font = '800 40px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      g.lineWidth = 8;
      g.strokeText(this.roleText, 256, 98);
      g.fillStyle = this.roleColor;
      g.fillText(this.roleText, 256, 98);
    }
    this.labelTex.needsUpdate = true;
  }

  setRole(text, color) {
    this.roleText = text;
    this.roleColor = color;
    this.drawLabel();
  }

  setGaze(yaw, pitch) {
    this.tgtYaw = yaw;
    this.tgtPitch = pitch;
  }

  playSignal(kind, dur, side) {
    this.sig = { kind, dur: dur || 0.6, side: side || 1, t: 0 };
  }

  kill() {
    if (!this.alive) return;
    this.alive = false;
    this.sig = null;
    this.eyeMark.visible = false;
    const gray = new this.T.Color(0x7d828c);
    for (const m of [this.shirt, this.lidMat]) m.color.lerp(gray, 0.62);
    tintGeometry(this.bodyGeo, gray, 0.62);
    tintGeometry(this.headGeo, gray, 0.62);
    this.drawLabel();
  }

  /**
   * @param viewerPos  izleyenin göz konumu [x,y,z]. faceViewer açıksa (oyun kuralına göre bana bakıyor),
   *                   kafa bakış açısının birkaç derece yanına değil, tam izleyene döner — gerçek hayattaki gibi
   *                   göz göze görünür; göz kırpma / dil çıkarma tam karşıdan okunur.
   */
  update(dt, t, viewerPos) {
    this.head.getWorldPosition(this.tmpPos);
    let ty = this.tgtYaw;
    let tp = this.tgtPitch;
    if (this.faceViewer && viewerPos) {
      const dx = viewerPos[0] - this.tmpPos.x;
      const dy = viewerPos[1] - this.tmpPos.y;
      const dz = viewerPos[2] - this.tmpPos.z;
      ty = Math.atan2(dz, dx);
      tp = Math.atan2(dy, Math.hypot(dx, dz));
    }
    // Bakış yumuşatma
    const k = 1 - Math.exp(-dt * 16);
    this.curYaw += wrapPi(ty - this.curYaw) * k;
    this.curPitch += (tp - this.curPitch) * k;

    // Boyun dönüş sınırı: oturan biri arkasına bakamaz
    let rel = clamp(wrapPi(this.curYaw - this.fwdYaw), -1.85, 1.85);
    let pit = clamp(this.curPitch, -0.7, 0.6);
    if (!this.alive) { rel = 0; pit = -0.85; } // ölenin başı öne düşer
    const yaw = this.fwdYaw + rel;
    const cp = Math.cos(pit);
    this.tmpDir.set(cp * Math.cos(yaw), Math.sin(pit), cp * Math.sin(yaw));
    this.tmpPos.add(this.tmpDir);
    this.head.lookAt(this.tmpPos);
    // Yana bakarken omuzlar da döner (gerçek hayattaki gibi): dönüşün ~1/3'ü gövdeye geçer, boyun daha az
    // bükülür. Yerel Y dönüşü dünya açısını azalttığı için işaret ters. Gövde Y ekseninde neredeyse simetrik:
    // gölgesi değişmez, gölge haritasını yenilemek gerekmez.
    this.torso.rotation.y = -clamp(rel * 0.35, -0.55, 0.55);

    // Nefes alma
    const br = Math.sin(t * 1.7 + this.phase);
    this.torso.scale.y = 1 + br * 0.012;
    if (this.alive) this.head.position.y = 1.22 + br * 0.004;

    // Doğal göz kırpma (iki göz birden; katilin tek gözlü işaretinden ayırt edilir)
    this.nextBlink -= dt;
    if (this.nextBlink <= 0 && this.blink === 0) {
      this.blink = 0.0001;
      this.nextBlink = 2 + this.rnd() * 3.5;
    }
    let blinkK = 0;
    if (this.blink > 0) {
      this.blink += dt / 0.16;
      if (this.blink >= 1) this.blink = 0; else blinkK = Math.sin(this.blink * Math.PI);
    }
    let lidL = blinkK;
    let lidR = blinkK;
    let roll = 0;
    let browUp = 0;
    let tongue = 0;
    let tilt = 0;

    if (this.sig) {
      this.sig.t += dt;
      const p = this.sig.t / this.sig.dur;
      if (p >= 1) {
        this.sig = null;
      } else {
        const env = Math.sin(Math.PI * p);
        const s = this.sig;
        // İşaretler uzaktan da okunabilsin diye belirgin: baş eğilir, kırpılmayan göz de hafifçe kısılır.
        if (s.kind === 'wink') {
          const e = clamp(env * 1.9, 0, 1);
          if (s.side < 0) { lidL = Math.max(lidL, e); lidR = Math.max(lidR, 0.28 * e); }
          else { lidR = Math.max(lidR, e); lidL = Math.max(lidL, 0.28 * e); }
          roll = s.side * 0.19 * e;
        } else if (s.kind === 'tongue') {
          tongue = clamp(env * 1.6, 0, 1);
          tilt = 0.12 * tongue;
        } else if (s.kind === 'brow') {
          browUp = clamp(env * 1.7, 0, 1);
          tilt = 0.08 * browUp;
        }
      }
    }
    if (!this.alive) { lidL = 1; lidR = 1; roll = 0; browUp = 0; tongue = 0; tilt = 0; }

    this.eyes[-1].rotation.x = lerp(LID_OPEN, LID_CLOSED, lidL);
    this.eyes[1].rotation.x = lerp(LID_OPEN, LID_CLOSED, lidR);
    const browY = 0.1 + 0.05 * browUp;
    const browRot = 0.1 + 0.22 * browUp;
    this.browL.position.y = browY;
    this.browR.position.y = browY;
    this.browL.rotation.z = browRot;
    this.browR.rotation.z = -browRot;
    this.tongue.visible = tongue > 0.02;
    this.tongue.scale.z = Math.max(0.05, tongue);
    this.tongue.position.z = 0.165 + 0.05 * tongue;
    if (roll) this.head.rotateZ(roll);
    if (tilt) this.head.rotateX(-tilt);
  }

  dispose() {
    this.labelTex.dispose();
  }
}

// ---------------------------------------------------------------------------
// Otomatik kalite: FPS sürekli düşükse kademeli olarak gölgeyi kapatır, çözünürlüğü düşürür.
// Bir düşürme FPS'i artırmadıysa (ör. tarayıcı 30 FPS'e kilitli) geri alır ve ayarlamayı bırakır.
const SLOW_FPS = 48;
const GOOD_FPS = 57;

class AutoQuality {
  constructor(world) {
    this.w = world;
    const sh = world.q.shadows;
    this.states = [{ scale: 1, shadows: sh }];
    if (sh) this.states.push({ scale: 1, shadows: false });
    for (const scale of [0.85, 0.7]) this.states.push({ scale, shadows: false });
    this.i = 0;
    this.warm = 2.5;       // sn: ilk yükleme / shader derleme takılmalarını sayma
    this.t = 0;
    this.n = 0;
    this.check = null;     // son adımın işe yarayıp yaramadığını bir sonraki pencerede ölç
    this.good = 0;         // art arda kaç iyi pencere
    this.frozen = false;
    this.upLocked = false;
  }

  rewarm(sec) {
    this.warm = Math.max(this.warm, sec);
    this.t = this.n = 0;
  }

  frame(dt) {
    if (this.frozen) return;
    if (dt > 0.25) { this.t = this.n = 0; return; } // sekme değişimi ya da tek seferlik takılma
    if (this.warm > 0) { this.warm -= dt; return; }
    this.t += dt;
    this.n++;
    if (this.t < 2) return;
    const fps = this.n / this.t;
    this.t = this.n = 0;

    if (this.check) {
      const { fps: before, dir } = this.check;
      this.check = null;
      if (dir < 0 && fps < before * 1.06) { this.go(this.i - 1); this.frozen = true; return; }
      if (dir > 0 && fps < SLOW_FPS) { this.go(this.i + 1); this.upLocked = true; return; }
    }
    if (fps < SLOW_FPS) {
      this.good = 0;
      if (this.i < this.states.length - 1) { this.check = { fps, dir: -1 }; this.go(this.i + 1); }
    } else if (fps > GOOD_FPS && this.i > 0 && !this.upLocked) {
      if (++this.good >= 10) { this.good = 0; this.check = { fps, dir: 1 }; this.go(this.i - 1); }
    } else {
      this.good = 0;
    }
  }

  go(i) {
    this.i = i;
    const st = this.states[i];
    this.w.applyLevel(st.scale, st.shadows);
    this.rewarm(1); // gölge aç/kapa shader'ları yeniden derletir; o takılmayı sayma
  }
}

// ---------------------------------------------------------------------------
export class World {
  /**
   * @param {object} opts  quality: 'high' | 'medium' | 'low'; auto: FPS'e göre otomatik düşür
   */
  constructor(T, canvas, opts = {}) {
    this.T = T;
    this.rev = parseInt(T.REVISION, 10) || 0;
    this.canvas = canvas;
    this.qName = QUALITY[opts.quality] ? opts.quality : 'high';
    const q = (this.q = QUALITY[this.qName]);
    const r = (this.renderer = new T.WebGLRenderer({ canvas, antialias: q.aa, powerPreference: 'high-performance' }));
    this.resScale = 1;
    // Nokta ışıkta PCF ile PCFSoft aynı filtreyi kullanır; gölge haritası elle (seyrek) güncellenir.
    r.shadowMap.enabled = q.shadows;
    r.shadowMap.type = T.PCFShadowMap;
    r.shadowMap.autoUpdate = false;
    r.toneMapping = T.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.15;
    // Ana kamera + yakın plan aynı karede çizilir; istatistik ikisini birden saysın.
    r.info.autoReset = false;

    this.scene = new T.Scene();
    this.scene.background = new T.Color(0x07080c);
    this.scene.fog = new T.FogExp2(0x07080c, 0.035);
    this.camera = new T.PerspectiveCamera(70, 1, 0.05, 80);
    this.camera.layers.enable(LAYER_HUD);
    this.camera.layers.enable(LAYER_FX);
    // Polisin "yakın plan"ı: kendi koltuğundan, odaktaki yüze dar açılı (telefoto) bakan ikinci kamera.
    this.closeCam = new T.PerspectiveCamera(10, 4 / 3, 0.05, 30);
    this.closeAim = new T.Vector3();
    this.closeId = null;
    this.closeRect = null;
    this.closeFresh = true;
    this.size = { w: 1, h: 1 };
    this.tmpV = new T.Vector3();
    this.avatars = new Map();
    this.time = 0;
    this.demo = true;
    this.demoAngle = 0;
    this.demoLook = 0;
    this.demoSig = 2;
    this.viewer = null;
    this.shadowDirty = true;
    this.lastRender = 0;
    this.dynamic = new T.Group();
    this.scene.add(this.dynamic);

    this.buildShared();
    this.buildRoom();
    this.buildFocusFx();
    this.buildLockFx();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.auto = opts.auto ? new AutoQuality(this) : null;
    this.setDemo(true);
  }

  /** Kaliteye göre malzeme: düşükte ucuz Lambert, diğerlerinde PBR (Standard). */
  mat(p) {
    const T = this.T;
    if (!this.q.lambert) return new T.MeshStandardMaterial(p);
    const { roughness, metalness, ...rest } = p;
    return new T.MeshLambertMaterial(rest);
  }

  /**
   * Odanın pürüzlü, koyu yüzeyleri (duvar, zemin, tavan, halı, çerçeve...) her ayarda Lambert:
   * bu yüzeylerde PBR'nin parlama hesabı görünmüyor ama ekranın büyük kısmını kaplıyorlar.
   */
  matRough(p) {
    const { roughness, metalness, ...rest } = p;
    return new this.T.MeshLambertMaterial(rest);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.size = { w, h };
    const base = Math.min(window.devicePixelRatio || 1, this.q.maxPR);
    this.renderer.setPixelRatio(Math.max(0.6, base * this.resScale));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Otomatik kalite adımı: çözünürlük ölçeği + gölge. */
  applyLevel(scale, shadows) {
    if (scale !== this.resScale) { this.resScale = scale; this.resize(); }
    this.setShadows(shadows);
  }

  setShadows(on) {
    if (this.lamp.castShadow === on) return;
    // castShadow değişince three ışık durumunu yeniler ve shader'ları yeniden derler.
    this.lamp.castShadow = on;
    this.renderer.shadowMap.enabled = on;
    this.shadowDirty = true;
  }

  stats() {
    const i = this.renderer.info.render;
    return {
      calls: i.calls,
      tris: i.triangles,
      pr: +this.renderer.getPixelRatio().toFixed(2),
      shadows: this.lamp.castShadow,
      quality: this.qName,
      auto: this.auto ? (this.auto.frozen ? 'fixed' : `L${this.auto.i}`) : '-',
    };
  }

  // ---------- Karakterlerin ortak geometri / malzemeleri (bir kez oluşturulur, hiç silinmez) ----------
  buildShared() {
    const T = this.T;
    const keep = (o) => { o.userData.shared = true; return o; };
    const eyes = [];
    for (const s of [-1, 1]) {
      eyes.push({ geo: new T.SphereGeometry(0.045, 16, 12), m: xf(T, [s * 0.075, 0.03, 0.152]), color: new T.Color(0xffffff) });
      eyes.push({ geo: new T.SphereGeometry(0.024, 12, 10), m: xf(T, [s * 0.075, 0.03, 0.18]), color: new T.Color(0x141414) });
    }
    // "Sana bakıyor" işareti: koyu hap üstünde kehribar renkli göz
    const ec = document.createElement('canvas');
    ec.width = 128; ec.height = 64;
    const eg = ec.getContext('2d');
    eg.fillStyle = 'rgba(10,12,18,.78)';
    eg.beginPath();
    if (eg.roundRect) eg.roundRect(4, 6, 120, 52, 26); else eg.rect(4, 6, 120, 52);
    eg.fill();
    eg.strokeStyle = '#f5b84b'; eg.lineWidth = 5; eg.lineJoin = 'round';
    eg.beginPath();
    eg.moveTo(28, 32); eg.quadraticCurveTo(64, 4, 100, 32); eg.quadraticCurveTo(64, 60, 28, 32);
    eg.closePath(); eg.stroke();
    eg.fillStyle = '#f5b84b';
    eg.beginPath(); eg.arc(64, 32, 10, 0, TAU); eg.fill();
    const eyeTex = new T.CanvasTexture(ec);
    eyeTex.colorSpace = T.SRGBColorSpace;

    this.shared = {
      geo: {
        torso: keep(new T.CapsuleGeometry(0.2, 0.28, 6, 14)),
        eyes: keep(mergeParts(T, eyes, true)),
        lid: keep(new T.SphereGeometry(0.052, 18, 10, 0, TAU, 0, Math.PI / 2)),
        brow: keep(new T.BoxGeometry(0.08, 0.016, 0.02)),
        tongue: keep(new T.BoxGeometry(0.05, 0.016, 0.09)),
      },
      mat: {
        body: keep(this.mat({ vertexColors: true, roughness: 0.8, metalness: 0.02 })),
        head: keep(this.mat({ vertexColors: true, roughness: 0.7, metalness: 0.02 })),
        eyes: keep(this.mat({ vertexColors: true, roughness: 0.3, metalness: 0.02 })),
        dark: keep(this.mat({ color: 0x141414, roughness: 0.4, metalness: 0.02 })),
        tongue: keep(this.mat({ color: 0xe86a7a, roughness: 0.5, metalness: 0.02 })),
        eyeMark: keep(new T.SpriteMaterial({ map: eyeTex, transparent: true, depthWrite: false })),
      },
    };
  }

  /**
   * Odak efekti: odaktaki yüzün çevresi dışını hafifçe karartan tam ekran katman.
   * Köşeleri doğrudan clip-space'te çizer (kameradan bağımsız), tek ucuz geçiş; yalnızca odak varken görünür.
   */
  buildFocusFx() {
    const T = this.T;
    const mat = new T.ShaderMaterial({
      uniforms: {
        uCenter: { value: new T.Vector2() },   // cihaz pikseli, sol-alt köken
        uRadius: { value: 100 },
        uStrength: { value: 0 },
      },
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform vec2 uCenter; uniform float uRadius; uniform float uStrength;
        void main() {
          float d = distance(gl_FragCoord.xy, uCenter);
          gl_FragColor = vec4(0.0, 0.0, 0.0, smoothstep(uRadius, uRadius * 2.8, d) * uStrength);
        }`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const m = new T.Mesh(new T.PlaneGeometry(2, 2), mat);
    m.frustumCulled = false;
    m.renderOrder = 999;
    m.layers.set(LAYER_FX);
    m.visible = false;
    this.scene.add(m);
    this.focusFx = { mesh: m, u: mat.uniforms, strength: 0, target: 0, x: 0, y: 0, r: 0 };
  }

  /**
   * Bakışma efekti: biriyle göz göze gelince yalnızca o kişi net kalır; ekranın geri kalanı bulanıklaşır,
   * solar ve kararır — diğerlerinin ne yaptığı (göz kırpma, dil çıkarma) seçilemez.
   * Sahne her zamanki gibi ekrana çizilir; efekt açıkken o kare bir dokuya kopyalanır, 1/4 çözünürlükte
   * bulanıklaştırılır ve maskeyle üstüne çizilir. Sahne ikinci kez çizilmez (draw call artmaz),
   * kapalıyken hiçbir maliyeti yoktur.
   */
  buildLockFx() {
    const T = this.T;
    const vs = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    const mk = (fs, uniforms, extra = {}) => new T.ShaderMaterial({
      vertexShader: vs, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, toneMapped: false, ...extra,
    });
    // 1) Küçültme: her çıktı pikseli kaynaktaki 4×4 bloğun ortalaması (4 çift-doğrusal örnek)
    const down = mk(`
      uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb
               + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
        gl_FragColor = vec4(c * 0.25, 1.0);
      }`, { tSrc: { value: null }, uTexel: { value: new T.Vector2() } });
    // 2) Ayrılabilir Gauss bulanıklığı (yatay/dikey, 5 çift-doğrusal örnek = 9 dokusal)
    const blur = mk(`
      uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270;
        c += (texture2D(tSrc, vUv + uDir * 1.3846154).rgb + texture2D(tSrc, vUv - uDir * 1.3846154).rgb) * 0.3162162;
        c += (texture2D(tSrc, vUv + uDir * 3.2307692).rgb + texture2D(tSrc, vUv - uDir * 3.2307692).rgb) * 0.0702703;
        gl_FragColor = vec4(c, 1.0);
      }`, { tSrc: { value: null }, uDir: { value: new T.Vector2() } });
    // 3) Birleştirme: maskenin dışında bulanık + soluk + karanlık görüntü, içinde (bakıştığın kişi) dokunulmaz.
    const comp = mk(`
      uniform sampler2D tSrc; uniform vec2 uCenter; uniform vec2 uAxes; uniform float uAmount; varying vec2 vUv;
      void main() {
        float m = smoothstep(1.0, 1.5, length((gl_FragCoord.xy - uCenter) / uAxes)) * uAmount;
        vec3 c = texture2D(tSrc, vUv).rgb;
        c = mix(c, vec3(dot(c, vec3(0.299, 0.587, 0.114))), 0.4) * 0.6;
        gl_FragColor = vec4(c, m);
      }`, {
      tSrc: { value: null }, uCenter: { value: new T.Vector2() }, uAxes: { value: new T.Vector2(1, 1) }, uAmount: { value: 0 },
    }, { transparent: true });
    const scene = new T.Scene();
    const mesh = new T.Mesh(new T.PlaneGeometry(2, 2), down);
    mesh.frustumCulled = false;
    scene.add(mesh);
    const rtOpt = { depthBuffer: false, stencilBuffer: false, generateMipmaps: false, minFilter: T.LinearFilter, magFilter: T.LinearFilter };
    this.lockFx = {
      scene, mesh, cam: new T.Camera(), down, blur, comp,
      rtA: new T.WebGLRenderTarget(1, 1, rtOpt), rtB: new T.WebGLRenderTarget(1, 1, rtOpt),
      tex: null, w: 0, h: 0, size: new T.Vector2(),
      id: null, wide: false, strength: 0, target: 0, x: 0, y: 0, r: 0, fresh: true,
    };
  }

  // ---------- Sabit oda ----------
  buildRoom() {
    const T = this.T;
    const s = this.scene;

    // Işık şiddeti, adres çubuğuna ?light=1.5 yazarak ölçeklenebilir (ekranın karanlık/parlak olmasına göre).
    const lightK = clamp(parseFloat(new URLSearchParams(location.search).get('light')) || 1, 0.2, 5);
    s.add(new T.HemisphereLight(0x9fb4d8, 0x2a1d14, 0.7 * lightK));
    const fill = new T.DirectionalLight(0x6f86b8, 0.4 * lightK);
    fill.position.set(3, 5, 4);
    s.add(fill);

    const lamp = (this.lamp = new T.PointLight(0xffd7a0, 16 * lightK, 16, 2));
    lamp.position.set(0, 2.45, 0);
    lamp.castShadow = this.q.shadows;
    lamp.shadow.mapSize.set(this.q.shadowSize, this.q.shadowSize);
    lamp.shadow.bias = -0.0006;
    s.add(lamp);

    // Dokular (canvas ile üretilir, dış dosya yok)
    this.tex = {};
    this.tex.floor = canvasTex(T, 512, 512, (g, w, h) => {
      g.fillStyle = '#3a281b'; g.fillRect(0, 0, w, h);
      const planks = 8;
      for (let i = 0; i < planks; i++) {
        const x = (i * w) / planks;
        const l = 22 + Math.random() * 8;
        g.fillStyle = `hsl(25 38% ${l}%)`;
        g.fillRect(x, 0, w / planks - 2, h);
        for (let k = 0; k < 70; k++) {
          g.fillStyle = `rgba(0,0,0,${Math.random() * 0.09})`;
          g.fillRect(x + Math.random() * (w / planks), Math.random() * h, 1 + Math.random() * 2, 8 + Math.random() * 40);
        }
      }
      g.fillStyle = 'rgba(0,0,0,.55)';
      for (let i = 0; i <= planks; i++) g.fillRect((i * w) / planks - 1, 0, 2, h);
    }, [5, 5]);
    this.tex.wood = canvasTex(T, 512, 256, (g, w, h) => {
      g.fillStyle = '#5a3b24'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) {
        g.strokeStyle = `rgba(${20 + Math.random() * 30},${10 + Math.random() * 15},5,${0.1 + Math.random() * 0.2})`;
        g.lineWidth = 1 + Math.random() * 2;
        g.beginPath();
        const y = Math.random() * h;
        g.moveTo(0, y);
        g.bezierCurveTo(w * 0.3, y + (Math.random() - 0.5) * 18, w * 0.7, y + (Math.random() - 0.5) * 18, w, y + (Math.random() - 0.5) * 8);
        g.stroke();
      }
    }, [2, 2]);
    this.tex.wall = canvasTex(T, 256, 512, (g, w, h) => {
      g.fillStyle = '#1d3a3c'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 32) {
        g.fillStyle = x % 64 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.12)';
        g.fillRect(x, 0, 16, h);
      }
      g.fillStyle = 'rgba(245,184,75,.10)';
      for (let y = 20; y < h; y += 64) for (let x = 16; x < w; x += 64) {
        g.beginPath(); g.arc(x + (y % 128 ? 16 : 0), y, 4, 0, TAU); g.fill();
      }
    }, [14, 1]);
    this.tex.rug = canvasTex(T, 512, 512, (g, w) => {
      const c = w / 2;
      g.fillStyle = '#4a1418'; g.beginPath(); g.arc(c, c, c, 0, TAU); g.fill();
      for (const [r, col, lw] of [[0.94, '#c9a24a', 6], [0.84, '#2a0a0d', 14], [0.7, '#c9a24a', 3], [0.5, '#5e1c22', 22], [0.3, '#c9a24a', 3]]) {
        g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.arc(c, c, c * r, 0, TAU); g.stroke();
      }
      g.fillStyle = 'rgba(201,162,74,.5)';
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU;
        g.beginPath(); g.arc(c + Math.cos(a) * c * 0.6, c + Math.sin(a) * c * 0.6, 6, 0, TAU); g.fill();
      }
    });

    const floor = new T.Mesh(new T.CircleGeometry(10, 64), this.matRough({ map: this.tex.floor }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);

    // Duvar gölge almaz: lambadan çıkan gölgeler en fazla ~4,5 m'de yere düşer, 10 m'deki duvara ulaşmaz.
    // (Gölge alan her piksel 9 doku okuması yapar; duvar ekranın büyük kısmını kaplar.)
    const wall = new T.Mesh(
      new T.CylinderGeometry(10, 10, 5, 64, 1, true),
      this.matRough({ map: this.tex.wall, side: T.BackSide }),
    );
    wall.position.y = 2.5;
    s.add(wall);

    const ceil = new T.Mesh(new T.CircleGeometry(10, 48), this.matRough({ color: 0x12151b }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = 5;
    s.add(ceil);

    // Süpürgelik ve korniş: aynı malzeme → tek mesh
    const trims = [[0.15, 0.3], [1.1, 0.08], [4.9, 0.2]].map(([y, h]) => (
      { geo: new T.CylinderGeometry(9.95, 9.95, h, 64, 1, true), m: xf(T, [0, y, 0]) }));
    s.add(new T.Mesh(mergeParts(T, trims), this.matRough({ color: 0x2a1d14, side: T.BackSide })));

    // Duvar tabloları: çerçeveler tek mesh, resimler ayrı (her birinin dokusu farklı)
    const frames = [];
    const o = new T.Object3D();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + 0.2;
      o.position.set(Math.cos(a) * 9.9, 2.5 + (i % 2) * 0.35, Math.sin(a) * 9.9);
      o.lookAt(0, o.position.y, 0);
      o.updateMatrix();
      frames.push({ geo: new T.BoxGeometry(1.5, 1.05, 0.07), m: o.matrix.clone() });
      const hue = (i * 47) % 360;
      const art = canvasTex(T, 128, 96, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, w, h);
        gr.addColorStop(0, `hsl(${hue} 40% 28%)`); gr.addColorStop(1, `hsl(${(hue + 60) % 360} 45% 16%)`);
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = `hsla(${(hue + 30) % 360},60%,60%,.55)`;
        g.beginPath(); g.arc(w * (0.3 + 0.4 * ((i * 37) % 10) / 10), h * 0.45, 18 + (i % 3) * 6, 0, TAU); g.fill();
      });
      const pic = new T.Mesh(new T.PlaneGeometry(1.34, 0.9), this.matRough({ map: art }));
      pic.position.copy(o.position);
      pic.quaternion.copy(o.quaternion);
      pic.translateZ(0.04);
      s.add(pic);
    }
    s.add(new T.Mesh(mergeParts(T, frames), this.matRough({ color: 0x3b2a18 })));

    // Tavan lambası + ışık hüzmesi
    const cord = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 2.6, 6), this.matRough({ color: 0x111111 }));
    cord.position.y = 3.75;
    s.add(cord);
    const shade = new T.Mesh(
      new T.ConeGeometry(0.46, 0.34, 28, 1, true),
      this.mat({ color: 0x1f4a3c, roughness: 0.45, metalness: 0.5, side: T.DoubleSide }),
    );
    shade.position.y = 2.62;
    s.add(shade);
    const bulb = new T.Mesh(new T.SphereGeometry(0.07, 12, 10), new T.MeshBasicMaterial({ color: 0xfff1c9 }));
    bulb.position.set(0, 2.45, 0);
    s.add(bulb);
    const beam = new T.Mesh(
      new T.ConeGeometry(1.9, 2.2, 36, 1, true),
      // Tek yüz + iki kat opaklık: çift yüzlü eski haliyle aynı parlaklık, yarı piksel maliyeti.
      new T.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.1, blending: T.AdditiveBlending, depthWrite: false }),
    );
    beam.position.y = 1.35;
    s.add(beam);

    // Havada uçuşan toz
    const N = this.q.dust;
    const pos = new Float32Array(N * 3);
    this.dust = { N, pos, speed: new Float32Array(N) };
    for (let i = 0; i < N; i++) {
      const a = Math.random() * TAU;
      const r = Math.sqrt(Math.random()) * 4.5;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 0.2 + Math.random() * 2.8;
      pos[i * 3 + 2] = Math.sin(a) * r;
      this.dust.speed[i] = 0.01 + Math.random() * 0.03;
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    this.dust.geo = geo;
    s.add(new T.Points(geo, new T.PointsMaterial({ color: 0xffe6b8, size: 0.022, transparent: true, opacity: 0.55, depthWrite: false })));
  }

  // ---------- Oyun başına yeniden kurulan kısım ----------
  clearDynamic() {
    for (const a of this.avatars.values()) a.dispose();
    this.avatars.clear();
    const kill = (o) => {
      o.traverse((c) => {
        // Ortak (shared) kaynaklar ve three'nin tüm sprite'larda paylaştığı geometri silinmez.
        if (c.geometry && !c.isSprite && !c.geometry.userData.shared) c.geometry.dispose();
        if (c.material) {
          for (const m of Array.isArray(c.material) ? c.material : [c.material]) {
            if (!m.userData.shared) m.dispose();
          }
        }
      });
    };
    for (const c of [...this.dynamic.children]) { this.dynamic.remove(c); kill(c); }
  }

  /**
   * Masayı ve karakterleri kurar. seats[i].face = [x, z]: gövdenin döndüğü nokta.
   * table: kavisli masa { cx, c, ri, ro, phi, near, mid } (bkz. layout.js arcLayout) — izleyici (cx, 0)'da;
   * uzak kenar, merkezi izleyicinin c önünde olan ro yarıçaplı yay (±phi); yakın kenar izleyicinin
   * çevresinde ri yarıçaplı küçük yay (±near). Arası düz kenarlarla birleşir: yuvarlak hatlı bir masa.
   */
  loadSeats(seats, youId, table) {
    const T = this.T;
    this.clearDynamic();
    // Önceki oyunun odak / bakışma efekti ve yakın planı yeni masaya taşınmasın.
    Object.assign(this.focusFx, { id: null, target: 0, strength: 0 });
    this.focusFx.mesh.visible = false;
    Object.assign(this.lockFx, { id: null, target: 0, strength: 0 });
    this.closeId = null;
    const { cx, c, ri, ro, phi, near } = table;

    // Şekil izleyiciye göre XY'de çizilir, XZ düzlemine yatırılır (kalınlık +Y) ve izleyicinin yerine taşınır.
    // inset: alt kasa için içeri çekilmiş aynı biçim.
    const shape = (inset, depth, y) => {
      const r0 = ri + inset;
      const r1 = ro - inset;
      const p1 = phi - inset * 0.5;
      const n0 = near - inset * 0.5;
      // Yan kenarlar düz değil, dışa doğru kavisli: uzak kenarın yayına kesintisiz bağlanır (masa dilim
      // gibi değil, yuvarlak görünür). Kontrol noktası, yayın ucundaki teğet üzerinde geriye doğru.
      const nx = r0 * Math.cos(n0);
      const ny = r0 * Math.sin(n0);
      const ex = c + r1 * Math.cos(p1);
      const ey = r1 * Math.sin(p1);
      const lam = 0.42 * Math.hypot(ex - nx, ey - ny);
      const s = new T.Shape();
      s.moveTo(nx, -ny);
      s.quadraticCurveTo(ex - lam * Math.sin(p1), -ey - lam * Math.cos(p1), ex, -ey);
      s.absarc(c, 0, r1, -p1, p1, false);
      s.quadraticCurveTo(ex - lam * Math.sin(p1), ey + lam * Math.cos(p1), nx, ny);
      s.absarc(0, 0, r0, n0, -n0, true);
      const geo = new T.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 72 });
      const uv = geo.attributes.uv; // UV'ler metre cinsinden: ahşap dokusu çok sık tekrarlanmasın
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.3, uv.getY(i) * 0.3);
      geo.rotateX(-Math.PI / 2);
      geo.translate(cx, y, 0);
      return geo;
    };
    const top = new T.Mesh(shape(0, 0.07, 0.71), this.mat({ map: this.tex.wood, roughness: 0.55 }));
    top.castShadow = true; top.receiveShadow = true;
    this.dynamic.add(top);
    const apron = new T.Mesh(shape(0.12, 0.14, 0.57), this.matRough({ color: 0x2b1c11 }));
    this.dynamic.add(apron);
    // Ayaklar: kavisin iki yanında ve ortada (uzak kenarın merkezine göre)
    const legAt = [[ro * 0.6, -phi * 0.55], [ro * 0.6, phi * 0.55], [ro * 0.15, 0]];
    const legs = legAt.map(([r, a]) => (
      { geo: new T.CylinderGeometry(0.13, 0.24, 0.57, 16), m: xf(T, [cx + c + r * Math.cos(a), 0.285, r * Math.sin(a)]) }));
    const leg = new T.Mesh(mergeParts(T, legs), this.matRough({ color: 0x2b1c11 }));
    leg.castShadow = true;
    this.dynamic.add(leg);
    // Halı: herkesin altında kalan elips (izleyiciden en uzaktakine kadar)
    const far = c + ro + 0.72;
    const rug = new T.Mesh(new T.CircleGeometry(1, 72), this.matRough({ map: this.tex.rug }));
    rug.scale.set(far / 2 + 1.1, (ro + 0.72) * Math.sin(Math.min(phi, Math.PI / 2)) + 1.1, 1);
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(cx + far / 2, 0.012, 0);
    rug.receiveShadow = true;
    this.dynamic.add(rug);

    // Masanın ortasında birkaç kart (tek mesh)
    const mid = 0; // masanın ortası sahnenin merkezidir (bkz. arcLayout)
    const cards = [];
    for (let i = 0; i < 4; i++) {
      cards.push({
        geo: new T.BoxGeometry(0.1, 0.004, 0.15),
        m: xf(T, [mid + Math.cos(i * 1.7) * 0.22, 0.784 + i * 0.004, Math.sin(i * 1.7) * 0.22], [0, i * 1.1, 0]),
      });
    }
    const cardMesh = new T.Mesh(mergeParts(T, cards), this.matRough({ color: 0xf2ecdc }));
    cardMesh.receiveShadow = true;
    this.dynamic.add(cardMesh);

    for (const info of seats) {
      const av = new Avatar(this, info, info.id === youId);
      this.avatars.set(info.id, av);
      this.dynamic.add(av.group);
    }
    this.shadowDirty = true;
    this.auto?.rewarm(2); // yeni geometri/doku yüklemesi takılmasını sayma
  }

  // ---------- Dışarıya açılan API ----------
  setDemo(on) {
    this.demo = on;
    this.viewer = null;
    if (on) {
      const names = ['Ayşe', 'Mehmet', 'Zeynep', 'Can', 'Elif', 'Burak'];
      const L = arcLayout(names.length, 0);
      const seats = names.map((name, i) => ({
        id: `demo${i}`, name, gender: i % 2 ? 'm' : 'f', pos: L.pos[i], face: L.face[i],
      }));
      this.loadSeats(seats, null, L.table);
      this.demoSeats = seats;
      this.camera.fov = 55;
      this.camera.updateProjectionMatrix();
    }
  }

  setViewer(pos, yaw, pitch, fov) {
    this.viewer = { pos, yaw, pitch };
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  setGaze(id, yaw, pitch) { this.avatars.get(id)?.setGaze(yaw, pitch); }
  playSignal(id, kind, dur, side) { this.avatars.get(id)?.playSignal(kind, dur, side); }
  kill(id) { this.avatars.get(id)?.kill(); this.shadowDirty = true; }

  /** Oyundan çıkan oyuncu: ölü gibi çöker, isminin yanına tag ("çıktı") yazılır. */
  markLeft(id, tag) {
    const a = this.avatars.get(id);
    if (!a) return;
    a.leftTag = tag;
    if (a.alive) this.kill(id); else a.drawLabel();
  }

  /**
   * Bakışma efekti (bkz. buildLockFx). id: göz göze gelinen kişi (null → efekt yumuşakça kapanır).
   * wide: polis — net kalan alan biraz daha geniş.
   */
  setGazeLock(id, wide = false) {
    const L = this.lockFx;
    if (id && id !== L.id && L.strength < 0.05) L.fresh = true;
    if (id) { L.id = id; L.wide = wide; }
    L.target = id ? 1 : 0;
  }

  /** Oyun kuralına göre bana bakanlar (ids: Set): kafaları ekranımda tam bana döner. */
  setFacing(ids) {
    for (const a of this.avatars.values()) a.faceViewer = a.alive && !a.isYou && ids.has(a.id);
  }

  /** Şu an bana bakanların başında göz işareti yanar (ids: Set). */
  setWatchers(ids) {
    for (const a of this.avatars.values()) {
      const on = a.alive && !a.isYou && ids.has(a.id);
      if (a.eyeMark.visible !== on) a.eyeMark.visible = on;
    }
  }

  /**
   * Bir oyuncunun kafasının ekrandaki yeri (CSS pikseli, sol-üst köken) ve kafanın ekrandaki yarıçapı.
   * Son render'daki kamera matrisini kullanır; render'dan sonra çağrılmalı. Kamera arkasındaysa null.
   */
  projectHead(id) {
    const a = this.avatars.get(id);
    if (!a) return null;
    const v = a.head.getWorldPosition(this.tmpV);
    const dist = v.distanceTo(this.camera.position);
    v.project(this.camera);
    if (v.z > 1) return null;
    const { w, h } = this.size;
    const halfH = Math.tan((this.camera.fov * Math.PI) / 360) * dist;
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, r: (0.2 / halfH) * (h / 2) };
  }

  /**
   * Odak efekti: id'li oyuncunun yüzü etrafı açık kalır, ekranın geri kalanı strength oranında kararır.
   * id null ya da strength 0 → efekt yumuşakça kapanır. Konum her karede render içinde hesaplanır.
   */
  setFocus(id, strength) {
    const f = this.focusFx;
    f.id = id;
    f.target = id ? strength : 0;
  }

  /** Polisin yakın planı: odaktaki kişinin yüzü, ekranın rect (CSS px) bölgesine çizilir. id null → kapalı. */
  setCloseUp(id, rect) {
    if (id !== this.closeId) this.closeFresh = true;
    this.closeId = id;
    this.closeRect = rect;
  }

  /** Başların üstündeki rol yazıları (dil seçimine göre main.js verir). */
  setRoleLabels(labels) {
    this.roleLabels = labels;
  }

  showRoles(map) {
    const names = this.roleLabels || { killer: 'Katil', police: 'Polis' };
    const color = { killer: '#ff6b6b', police: '#5aa9ff' };
    for (const [id, role] of Object.entries(map)) {
      const a = this.avatars.get(id);
      if (!a) continue;
      a.setRole(names[role] || '', color[role] || '#fff');
    }
  }

  update(dt) {
    this.time += dt;

    if (this.demo) {
      this.demoAngle += dt * 0.1;
      const a = this.demoAngle;
      this.camera.position.set(Math.cos(a) * 5.4, 2.1 + Math.sin(a * 0.7) * 0.25, Math.sin(a) * 5.4);
      this.camera.lookAt(0, 1.0, 0);
      this.demoLook -= dt;
      if (this.demoLook <= 0) {
        this.demoLook = 1 + Math.random() * 1.5;
        for (const av of this.avatars.values()) {
          const other = this.demoSeats[Math.floor(Math.random() * this.demoSeats.length)];
          const me = this.demoSeats.find((s) => s.id === av.id);
          if (other === me) continue;
          const dx = other.pos[0] - me.pos[0];
          const dz = other.pos[2] - me.pos[2];
          av.setGaze(Math.atan2(dz, dx), (Math.random() - 0.5) * 0.15);
        }
      }
      this.demoSig -= dt;
      if (this.demoSig <= 0) {
        this.demoSig = 3 + Math.random() * 3;
        const list = [...this.avatars.values()];
        list[Math.floor(Math.random() * list.length)].playSignal('wink', 0.55, Math.random() < 0.5 ? -1 : 1);
      }
    } else if (this.viewer) {
      const { pos, yaw, pitch } = this.viewer;
      const cp = Math.cos(pitch);
      this.camera.position.set(pos[0], pos[1], pos[2]);
      this.camera.lookAt(pos[0] + cp * Math.cos(yaw), pos[1] + Math.sin(pitch), pos[2] + cp * Math.sin(yaw));
    }

    const viewerPos = !this.demo && this.viewer ? this.viewer.pos : null;
    for (const av of this.avatars.values()) av.update(dt, this.time, viewerPos);

    // Gölge haritası yalnızca sahne değiştiğinde yeniden çizilir (bkz. dosya başı).
    if (this.shadowDirty && this.lamp.castShadow) {
      this.shadowDirty = false;
      this.renderer.shadowMap.needsUpdate = true;
    }

    // Toz
    const d = this.dust;
    for (let i = 0; i < d.N; i++) {
      d.pos[i * 3 + 1] += d.speed[i] * dt;
      d.pos[i * 3] += Math.sin(this.time * 0.3 + i) * 0.002;
      if (d.pos[i * 3 + 1] > 3.2) d.pos[i * 3 + 1] = 0.2;
    }
    d.geo.attributes.position.needsUpdate = true;
  }

  render() {
    const now = performance.now();
    const rawDt = this.lastRender ? (now - this.lastRender) / 1000 : 0;
    if (this.auto && this.lastRender) this.auto.frame(rawDt);
    this.lastRender = now;
    const dt = Math.min(rawDt, 0.1);
    this.renderer.info.reset();
    this.camera.updateMatrixWorld();
    this.updateFocusFx(dt);
    this.renderer.render(this.scene, this.camera);
    this.renderLock(dt);
    if (this.closeId && this.closeRect) this.renderCloseUp(dt);
  }

  /** Bakışma efekti: ekrana çizilmiş kareyi kopyala → küçült → bulanıklaştır → maskeyle üstüne çiz. */
  renderLock(dt) {
    const L = this.lockFx;
    L.strength += (L.target - L.strength) * (1 - Math.exp(-dt * (L.target ? 9 : 12)));
    if (L.target === 0 && L.strength < 0.01) L.strength = 0;
    if (L.strength <= 0 || this.demo) return;
    const p = L.id ? this.projectHead(L.id) : null;
    if (p) {
      // Bakışılan kişi değişince maske yeni yüze kısa bir geçişle kayar.
      const k = L.fresh ? 1 : 1 - Math.exp(-dt * 18);
      L.fresh = false;
      L.x += (p.x - L.x) * k; L.y += (p.y - L.y) * k; L.r += (p.r - L.r) * k;
    }
    const r = this.renderer;
    const pr = r.getPixelRatio();
    const size = r.getDrawingBufferSize(L.size);
    const w = size.x;
    const h = size.y;
    if (L.w !== w || L.h !== h || !L.tex) {
      L.tex?.dispose();
      L.tex = new this.T.FramebufferTexture(w, h);
      L.tex.minFilter = L.tex.magFilter = this.T.LinearFilter;
      L.rtA.setSize(Math.ceil(w / 4), Math.ceil(h / 4));
      L.rtB.setSize(Math.ceil(w / 4), Math.ceil(h / 4));
      L.w = w; L.h = h;
    }
    // three r165'te parametre sırası değişti (yerel paket yeni sürüm, CDN yedeği r160 olabilir).
    if (this.rev >= 165) r.copyFramebufferToTexture(L.tex);
    else r.copyFramebufferToTexture(this.zero2 || (this.zero2 = new this.T.Vector2()), L.tex);

    const pass = (mat, target) => { L.mesh.material = mat; r.setRenderTarget(target); r.render(L.scene, L.cam); };
    L.down.uniforms.tSrc.value = L.tex;
    L.down.uniforms.uTexel.value.set(1 / w, 1 / h);
    pass(L.down, L.rtA);
    // Dört tur yatay+dikey: yüz ifadeleri seçilemeyecek kadar bulanık. Örnekler sık tutulur (seyrek örnek
    // ince yazılarda noktalı desen bırakıyordu); yayılım piksel oranıyla ölçeklenir (CSS pikseli olarak aynı bulanıklık).
    const spread = 0.9 * Math.max(1, pr);
    const bw = 1 / L.rtA.width;
    const bh = 1 / L.rtA.height;
    for (let i = 0; i < 4; i++) {
      L.blur.uniforms.tSrc.value = L.rtA.texture; L.blur.uniforms.uDir.value.set(bw * spread, 0); pass(L.blur, L.rtB);
      L.blur.uniforms.tSrc.value = L.rtB.texture; L.blur.uniforms.uDir.value.set(0, bh * spread); pass(L.blur, L.rtA);
    }
    r.setRenderTarget(null);

    // Net kalan alan: bakışılan kişinin başı + omuzları. Polis için biraz daha geniş.
    const u = L.comp.uniforms;
    const k = L.wide ? 1.35 : 1;
    const rad = Math.max(L.r, 24) * pr * k;
    u.tSrc.value = L.rtA.texture;
    u.uCenter.value.set(L.x * pr, (this.size.h - L.y) * pr - rad * 0.35);
    u.uAxes.value.set(rad * 1.75, rad * 2.2);
    u.uAmount.value = Math.min(1, L.strength);
    L.mesh.material = L.comp;
    const ac = r.autoClear;
    r.autoClear = false;
    r.render(L.scene, L.cam);
    r.autoClear = ac;
  }

  updateFocusFx(dt) {
    const f = this.focusFx;
    f.strength += (f.target - f.strength) * (1 - Math.exp(-dt * 8));
    if (f.target === 0 && f.strength < 0.01) f.strength = 0;
    const p = f.strength > 0 && f.id ? this.projectHead(f.id) : null;
    if (p) { f.x = p.x; f.y = p.y; f.r = p.r; }
    f.mesh.visible = f.strength > 0;
    if (!f.mesh.visible) return;
    const pr = this.renderer.getPixelRatio();
    f.u.uCenter.value.set(f.x * pr, (this.size.h - f.y) * pr);
    f.u.uRadius.value = Math.max(f.r * 1.6, 40) * pr;
    f.u.uStrength.value = f.strength;
  }

  /** Polisin yakın planı: aynı sahne, kendi göz konumundan dar açıyla, ekranın küçük bir bölgesine. */
  renderCloseUp(dt) {
    const a = this.avatars.get(this.closeId);
    if (!a) return;
    const head = a.head.getWorldPosition(this.tmpV);
    const cam = this.closeCam;
    cam.position.copy(this.camera.position);
    if (this.closeFresh) { this.closeAim.copy(head); this.closeFresh = false; }
    else this.closeAim.lerp(head, 1 - Math.exp(-dt * 14));
    cam.lookAt(this.closeAim);
    const { x, y, w, h } = this.closeRect;
    cam.fov = (2 * Math.atan(0.3 / Math.max(0.5, cam.position.distanceTo(head))) * 180) / Math.PI;
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    const r = this.renderer;
    const vy = this.size.h - y - h; // WebGL viewport'u sol-alt kökenli
    r.setScissorTest(true);
    r.setScissor(x, vy, w, h);
    r.setViewport(x, vy, w, h);
    r.render(this.scene, cam); // katman 0: etiket, göz işareti ve karartma çizilmez
    r.setScissorTest(false);
    r.setViewport(0, 0, this.size.w, this.size.h);
  }
}
