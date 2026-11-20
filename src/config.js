// Oyun dengesi burada. Sayıları değiştirip `npm run sim` ile etkisini ölçebilirsin.

/** Katilin kullanabileceği işaret türleri (lobide seçilir). */
export const SIGNALS = {
  wink:   { label: 'Göz kırpma',    verb: 'Göz kırp',    dur: 0.55 },
  tongue: { label: 'Dil çıkarma',   verb: 'Dil çıkar',   dur: 0.75 },
  brow:   { label: 'Kaş kaldırma',  verb: 'Kaş kaldır',  dur: 0.70 },
};

/** Bot becerisi. Hem bot katili hem bot polisi etkiler. */
export const DIFFICULTY = {
  easy: {
    policeAttention: 0.14, // polis bot, işareti gördüğünde fark etme ihtimali (5 kişilik masa için; kalabalıkta düşer)
    policeMisId: 0.15,     // fark ettiği halde yanlış kişiyi suçlama ihtimali
    killerRisk: 0.5,        // katil bot, tanık varken yine de işaret yapma eğilimi
    minEvidence: 3,        // polis bot, tahminle suçlamak için en az kaç kanıt puanı
    margin: 3,             // ... ve ikinci şüpheliyle arasındaki fark
    reaction: [1.2, 2.8],  // polis botun tepki süresi (sn)
    victimDelay: [2.5, 6], // fark eden bot vatandaşın "ben öldüm" demeden önceki bekleyişi
  },
  normal: {
    policeAttention: 0.27,
    policeMisId: 0.07,
    killerRisk: 0.3,
    minEvidence: 3,
    margin: 2,
    reaction: [0.8, 2.0],
    victimDelay: [1.5, 5],
  },
  hard: {
    policeAttention: 0.5,
    policeMisId: 0.02,
    killerRisk: 0.08,
    minEvidence: 3,
    margin: 2,
    reaction: [0.5, 1.4],
    victimDelay: [1.0, 4],
  },
};

/** Her bu kadar oyuncuya en fazla 1 katil ve 1 polis düşer (4–7 kişi: 1+1, 8–10 kişi: en fazla 2+2). */
export const PLAYERS_PER_ROLE = 4;

/** n oyunculu oyunda katil (ve ayrıca polis) sayısının üst sınırı. Vatandaşlar her zaman en az yarıdır. */
export function maxRoleCount(n) {
  return Math.max(1, Math.floor(n / PLAYERS_PER_ROLE));
}

export const DEFAULTS = {
  minPlayers: 4,
  maxPlayers: 10,
  defaultTotal: 6,
  killers: 1,              // lobide seçilir; maxRoleCount ile sınırlanır
  police: 1,
  revealSeconds: 5,        // herkesin rolünü öğrendiği, kimsenin oynayamadığı süre
  winkCooldown: 6,         // katil iki işaret arasında en az bu kadar bekler (sn)
  witnessAngleDeg: 28,     // birinin bakışı katile bu açıdan yakınsa işareti görür ("göz göze" sayılır)
  aimToleranceDeg: 22,     // istemci "şuna işaret yaptım" derken bakışı en fazla bu kadar sapabilir
  focusDeg: 13,            // katil/vatandaş: nişangâhın çevresindeki odak konisi (yarı açı). aimToleranceDeg'den küçük kalmalı
  policeFocusDeg: 6,       // polis: dar ve kesin odak; yakın plan görüntüsü odaktaki kişiyi gösterir
  noticeSeconds: 10,       // insan vatandaş fark ettikten sonra "ben öldüm" demek için süresi
  policeLives: 2,          // her polisin ayrı yanlış suçlama hakkı
  accuseCooldown: 2,       // polis iki suçlama arasında bekler (sn)
  spectatorsSeeRoles: true, // ölenler herkesin rolünü görür
  killerTimeLimit: 300,     // katilin süresi (sn, rol kartı kapandıktan sonra): dolarsa katil(ler) kaybeder
  countdownSeconds: 60,    // sürenin son bu kadar saniyesinde herkese geri sayım gösterilir (5 dk'da 4. dakikadan sonra)
  signal: 'wink',
  difficulty: 'normal',
};
