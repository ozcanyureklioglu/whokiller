// i18n.js — arayüz metinleri. Yeni dil eklemek için: LANGS'a ekle, aşağıya aynı anahtarlarla bir sözlük yaz.
// Eksik anahtar önce Türkçeye, o da yoksa anahtarın kendisine düşer.
// HTML'de: data-i18n="anahtar" (metin), data-i18n-ph="anahtar" (placeholder).

export const LANGS = { tr: 'Türkçe', en: 'English' };

export const DICT = {
  tr: {
    'app.title': 'WhoKiller',
    'role.killer': 'Katil', 'role.police': 'Polis', 'role.citizen': 'Vatandaş',
    'roleUp.killer': 'KATİL', 'roleUp.police': 'POLİS', 'roleUp.citizen': 'VATANDAŞ',

    'home.tag': 'Göz kırpmayı yakala… ya da fark edip öl.',
    'home.name': 'Adın', 'home.namePh': 'Takma adın', 'home.defaultName': 'Oyuncu',
    'home.gender': 'Cinsiyet (karakterinin görünüşü)', 'gender.m': 'Erkek', 'gender.f': 'Kadın',
    'toast.pickGender': 'Önce cinsiyetini seç.',
    'dur.min': '{n} dk', 'dur.sec': '{n} sn', 'dur.minSec': '{m} dk {s} sn',
    'home.quick': 'Hızlı oyun', 'home.quickSub': 'botlara karşı, tek başına',
    'home.create': 'Oda kur', 'home.codePh': 'KOD', 'home.join': 'Katıl',
    'home.quality': 'Grafik kalitesi', 'home.lang': 'Dil',
    'q.auto': 'Otomatik', 'q.high': 'Yüksek', 'q.medium': 'Orta', 'q.low': 'Düşük',
    'conn.connecting': 'Sunucuya bağlanıyor…', 'conn.ok': 'Bağlandı.', 'conn.none': 'Bağlantı yok. Sayfayı yenile.',

    'lobby.code': 'Oda kodu', 'lobby.copy': 'Davet linkini kopyala', 'lobby.total': 'Toplam oyuncu:',
    'lobby.killers': 'Katil sayısı', 'lobby.police': 'Polis sayısı', 'lobby.signal': 'İşaret',
    'lobby.difficulty': 'Bot becerisi', 'lobby.lives': 'Polisin hakkı',
    'diff.easy': 'Kolay', 'diff.normal': 'Normal', 'diff.hard': 'Zor',
    'lobby.start': 'Başlat', 'lobby.leave': 'Odadan çık',
    'lobby.readyBtn': 'Hazırım', 'lobby.unready': 'Hazırsın ✓ · geri al',
    'lobby.isReady': 'hazır', 'lobby.notReady': 'bekleniyor',
    'lobby.waitReady': 'Hazır bekleniyor ({ready}/{total})',
    'lobby.hostHint': 'Herkes "Hazırım" deyince oyunu başlatabilirsin.', 'lobby.allReady': 'Herkes hazır!',
    'lobby.readyHint': 'Hazır olunca "Hazırım"a bas; herkes hazır olunca kurucu başlatır.',
    'lobby.readyWait': 'Hazırsın. Kurucunun başlatması bekleniyor…',
    'lobby.you': ' (sen)', 'lobby.host': 'kurucu',
    'lobby.roleNoteMany': 'Her 4 oyuncuya en fazla 1 katil ve 1 polis. {n} kişide en fazla {max}\'şer.',
    'lobby.roleNoteOne': 'Her 4 oyuncuya en fazla 1 katil ve 1 polis: {n} kişide 1 katil, 1 polis (8+ kişide 2\'ye kadar).',
    'lobby.withBots': '{humans} kişi + {bots} bot oynayacak', 'lobby.noBots': '{humans} kişi oynayacak, bot yok',
    'lobby.mix': ' · {t} katil, {p} polis, {c} vatandaş.',
    'lobby.timeNote': '⏱ Süre sınırı {limit}: katil bu sürede tüm vatandaşları öldüremezse kaybeder. {start} sonra herkese geri sayım başlar.',
    'lobby.timeNoteMany': '⏱ Süre sınırı {limit}: katiller bu sürede tüm vatandaşları öldüremezse kaybeder. {start} sonra herkese geri sayım başlar.',
    'lobby.soloTitle': 'Hızlı oyun', 'lobby.soloSub': 'Botlara karşı, tek başına. Ayarları seç ve başlat.',
    'lobby.back': 'Geri',

    'pause.title': 'Menü', 'pause.paused': 'Oyun duraklatıldı',
    'pause.live': 'Çok oyunculu oyunda oyun durmaz: masadakiler oynamaya devam ediyor.',
    'pause.solo': 'Botlar da bekliyor; devam edince kaldığın yerden sürer.',
    'pause.resume': 'Devam et', 'pause.quit': 'Oyundan çık',
    'pause.quitNote': 'Çıkarsan herkese bildirilir. Masadaki son katil ya da polissen rolün rastgele bir oyuncuya geçer.',

    'signal.wink': 'Göz kırpma', 'signal.tongue': 'Dil çıkarma', 'signal.brow': 'Kaş kaldırma',
    'verb.wink': 'Göz kırp', 'verb.tongue': 'Dil çıkar', 'verb.brow': 'Kaş kaldır',
    'verbl.wink': 'göz kırp', 'verbl.tongue': 'dil çıkar', 'verbl.brow': 'kaş kaldır',
    'noun.wink': 'göz kırpmasını', 'noun.tongue': 'dil çıkarmasını', 'noun.brow': 'kaş kaldırmasını',
    'ving.wink': 'göz kırptığını', 'ving.tongue': 'dil çıkardığını', 'ving.brow': 'kaş kaldırdığını',

    'badge.spectator': 'SEYİRCİ', 'badge.hidden': 'Rol gizli', 'badge.show': 'R: göster', 'badge.hide': 'R: gizle',
    'reveal.your': 'Rolün', 'reveal.secret': 'Kimseye söyleme!',
    'desc.counts': 'Bu oyunda {t} katil, {p} polis var. ',
    'desc.killer': 'Bir vatandaşın gözüne bakıp {verb} (Boşluk). İşareti fark eden vatandaş ölür. ',
    'desc.killerMate': 'Takım arkadaşın: {mates} (başında “Katil” yazar). ',
    'desc.killerGoal': 'Polis seni yakalamadan tüm vatandaşları bitir. Polise ya da başkasına yakalanma!',
    'desc.killerGoalMany': 'Polis hepinizi yakalamadan tüm vatandaşları bitirin.',
    'desc.police': 'Katilin {noun} yakalamaya çalış. Bulduğunda ona bakıp “Suçla” de (Boşluk). ',
    'desc.policeMany': 'Katillerin {noun} yakalamaya çalış. Bulduğunda ona bakıp “Suçla” de (Boşluk). Kazanmak için hepsini yakalamalısınız. ',
    'desc.policeMate': 'Takım arkadaşın: {mates}. Her polisin ayrı hakkı var. ',
    'desc.policeLives': 'Yanlış suçlamada hak kaybedersin. Hakkın: {lives}.',
    'desc.citizen': 'Biri sana {ving} fark edersen “Ben öldüm!” de (Boşluk) ve oyundan çık. Rolünü kimseye söyleme; polise yardım etmek için etrafı izle.',
    'desc.timeKiller': 'Süren {limit}: dolmadan bitiremezsen kaybedersin.',
    'desc.timeKillerMany': 'Süreniz {limit}: dolmadan bitiremezseniz kaybedersiniz.',
    'desc.timeOthers': 'Katilin süresi {limit}: süre dolarsa katil kaybeder.',
    'timer.label': 'KATİLİN SÜRESİ',
    'feed.countdown': '⏱ Son {left}! Süre dolarsa katil kaybeder.',

    'noticed.title': 'Biri sana işaret yaptı!', 'noticed.sub': 'Fark ettin: “Ben öldüm!” de.',
    'feed.started': 'Oyun başladı. Etrafı izle!',
    'feed.sent': '{verb} — işaret gönderildi.',
    'feed.died': '{name} öldü.',
    'feed.caught': '{by} (Polis): “Katil sensin!” → {target} yakalandı!',
    'feed.caughtRest': ' Kalan katil: {n}',
    'feed.wrong': '{by} (Polis), {target} kişisini suçladı: yanlış! ',
    'feed.livesLeft': 'Kalan hak: {n}', 'feed.livesOut': 'Bu polisin hakkı bitti.',
    'feed.quit': '{name} oyundan çıktı ({role}).', 'feed.heir': ' Rolü rastgele bir oyuncuya geçti.',
    'tag.left': 'çıktı',
    'reveal.heir': '{name} oyundan çıktı; rolü sana geçti.',

    'toast.quit': '{name} oyundan çıktı.', 'toast.heir': 'Rolün değişti: artık {role} sensin!',
    'toast.mate': '{name} artık takım arkadaşın.',
    'toast.disconnected': 'Bağlantı koptu.', 'toast.copied': 'Link kopyalandı.', 'toast.enterCode': 'Oda kodunu yaz.',
    'toast.lookFirst': 'Önce birine bak.', 'toast.lookSuspect': 'Önce şüphelendiğin kişiye bak.',
    'toast.teammate': 'O senin takım arkadaşın.', 'toast.noLives': 'Suçlama hakkın kalmadı; izlemeye devam et.',
    'toast.dead': 'Öldün. Artık seyircisin.', 'toast.caught': 'Yakalandın. Artık seyircisin.',

    'st.citizens': 'Vatandaş: {left} / {total}', 'st.killers': ' · Katil: {left} / {total}',
    'st.lives': 'Hakkın: {n}', 'st.livesOut': 'Hakkın bitti', 'st.watch': '👁 Sana bakan: {n}',
    'hint.touch': 'Kaydırarak bak · joystick\'i sürükle: o yöne dön · iki parmakla yakınlaştır',
    'hint.unlocked': 'Fareyi oynatarak bak · İmleç kenara dayanırsa ekrana tıkla (fare kilitlenir) · Tekerlek: yakınlaştır · Boşluk: eylem · Esc: menü',
    'hint.locked': 'Esc: menü · Tekerlek: yakınlaştır · Boşluk/Tık: eylem · R: rolü gizle',
    'act.accuse': 'Katil sensin!', 'act.noLives': 'Hakkın bitti', 'act.dead': 'Ben öldüm!', 'act.spectator': 'Seyirci',
    'act.key': 'Boşluk',
    'focus.mate': '{name} · takım arkadaşın', 'focus.contact': '{name} · göz göze!',
    'focus.away': '{name} · sana bakmıyor', 'focus.looking': '{name} sana bakıyor',
    'closeup': 'Yakın plan · {name}',

    'over.police': 'Polis kazandı!', 'over.policeMany': 'Polisler kazandı!',
    'over.killer': 'Katil kazandı!', 'over.killerMany': 'Katiller kazandı!',
    'over.win': 'Kazandın 🎉', 'over.lose': 'Kaybettin',
    'over.killerList': 'Katil: {names}.', 'over.killerListMany': 'Katiller: {names}.',
    'over.caught': '{police} katili yakaladı: {killer}.', 'over.caughtMany': 'Tüm katiller yakalandı. ',
    'over.allDead': 'Tüm vatandaşlar öldü. ',
    'over.policeOut': 'Polisin tüm hakları yanlış suçlamaya gitti. ',
    'over.policeOutMany': 'Polislerin tüm hakları yanlış suçlamaya gitti. ',
    'over.killerLeft': 'Katil oyundan çıktı ve rolünü devralacak kimse kalmadı.',
    'over.policeLeft': 'Polis oyundan çıktı ve rolünü devralacak kimse kalmadı. ',
    'over.timeUp': 'Süre doldu: katil {limit} içinde tüm vatandaşları öldüremedi. ',
    'over.timeUpMany': 'Süre doldu: katiller {limit} içinde tüm vatandaşları öldüremedi. ',
    'over.leftTag': ' · çıktı',
    'over.again': 'Lobiye dön', 'over.home': 'Ana menü', 'over.waitHost': 'Kurucunun lobiye dönmesi bekleniyor…',

    'fatal.title': '3B motor yüklenemedi',
    'fatal.body': 'Three.js ilk açılışta internetten indirilir. Çevrimdışıysan proje klasöründe {cmd} çalıştırıp sunucuyu yeniden başlat.',
    'stats': '{fps} FPS · {calls} draw call · {tris}k üçgen · PR {pr} · gölge {sh} · {q} (oto: {auto})',
    'on': 'açık', 'off': 'kapalı',

    // Sunucu hata kodları (src/game.js, src/rooms.js)
    'err.notStarted': 'Oyun henüz başlamadı.', 'err.notAllowed': 'Bu eylemi yapamazsın.',
    'err.badTarget': 'Geçersiz hedef.', 'err.teammate': 'O senin takım arkadaşın.', 'err.wait': 'Biraz bekle.',
    'err.notLooking': 'Hedefe bakmıyorsun.', 'err.notPlaying': 'Oyun şu an oynanmıyor.',
    'err.alreadyOut': 'Zaten oyun dışısın.', 'err.notNoticed': 'Fark etmeden ölemezsin.',
    'err.noLives': 'Suçlama hakkın kalmadı.', 'err.hostOnly': 'Oyunu yalnızca oda kurucusu başlatabilir.',
    'err.notReady': 'Herkes hazır değil.', 'err.noRoom': 'Oda bulunamadı.', 'err.inProgress': 'Bu odada oyun devam ediyor.', 'err.full': 'Oda dolu.',
  },

  en: {
    'app.title': 'WhoKiller',
    'role.killer': 'Killer', 'role.police': 'Police', 'role.citizen': 'Citizen',
    'roleUp.killer': 'KILLER', 'roleUp.police': 'POLICE', 'roleUp.citizen': 'CITIZEN',

    'home.tag': 'Catch the wink… or notice it and die.',
    'home.name': 'Your name', 'home.namePh': 'Nickname', 'home.defaultName': 'Player',
    'home.gender': 'Gender (your character\'s look)', 'gender.m': 'Male', 'gender.f': 'Female',
    'toast.pickGender': 'Pick your gender first.',
    'dur.min': '{n} min', 'dur.sec': '{n} s', 'dur.minSec': '{m} min {s} s',
    'home.quick': 'Quick game', 'home.quickSub': 'solo, against bots',
    'home.create': 'Create room', 'home.codePh': 'CODE', 'home.join': 'Join',
    'home.quality': 'Graphics quality', 'home.lang': 'Language',
    'q.auto': 'Auto', 'q.high': 'High', 'q.medium': 'Medium', 'q.low': 'Low',
    'conn.connecting': 'Connecting to server…', 'conn.ok': 'Connected.', 'conn.none': 'No connection. Refresh the page.',

    'lobby.code': 'Room code', 'lobby.copy': 'Copy invite link', 'lobby.total': 'Total players:',
    'lobby.killers': 'Killers', 'lobby.police': 'Police', 'lobby.signal': 'Signal',
    'lobby.difficulty': 'Bot skill', 'lobby.lives': 'Police chances',
    'diff.easy': 'Easy', 'diff.normal': 'Normal', 'diff.hard': 'Hard',
    'lobby.start': 'Start', 'lobby.leave': 'Leave room',
    'lobby.readyBtn': 'I\'m ready', 'lobby.unready': 'Ready ✓ · undo',
    'lobby.isReady': 'ready', 'lobby.notReady': 'waiting',
    'lobby.waitReady': 'Waiting for ready ({ready}/{total})',
    'lobby.hostHint': 'You can start once everyone is ready.', 'lobby.allReady': 'Everyone is ready!',
    'lobby.readyHint': 'Press "I\'m ready" when you are; the host starts once everyone is ready.',
    'lobby.readyWait': 'You\'re ready. Waiting for the host to start…',
    'lobby.you': ' (you)', 'lobby.host': 'host',
    'lobby.roleNoteMany': 'At most 1 killer and 1 police per 4 players. With {n} players: up to {max} each.',
    'lobby.roleNoteOne': 'At most 1 killer and 1 police per 4 players: with {n} players, 1 killer and 1 police (up to 2 with 8+).',
    'lobby.withBots': '{humans} people + {bots} bots will play', 'lobby.noBots': '{humans} people will play, no bots',
    'lobby.mix': ' · {t} killers, {p} police, {c} citizens.',
    'lobby.timeNote': '⏱ Time limit {limit}: if the killer hasn\'t eliminated every citizen by then, the killer loses. A countdown starts for everyone after {start}.',
    'lobby.timeNoteMany': '⏱ Time limit {limit}: if the killers haven\'t eliminated every citizen by then, they lose. A countdown starts for everyone after {start}.',
    'lobby.soloTitle': 'Quick game', 'lobby.soloSub': 'Solo, against bots. Pick your settings and start.',
    'lobby.back': 'Back',

    'pause.title': 'Menu', 'pause.paused': 'Game paused',
    'pause.live': 'Online games don\'t pause: everyone else at the table keeps playing.',
    'pause.solo': 'The bots are waiting too; resume to pick up where you left off.',
    'pause.resume': 'Resume', 'pause.quit': 'Leave game',
    'pause.quitNote': 'Everyone will be told that you left. If you are the last killer or police officer at the table, your role passes to a random player.',

    'signal.wink': 'Wink', 'signal.tongue': 'Tongue out', 'signal.brow': 'Eyebrow raise',
    'verb.wink': 'Wink', 'verb.tongue': 'Stick tongue out', 'verb.brow': 'Raise eyebrow',
    'verbl.wink': 'wink', 'verbl.tongue': 'stick your tongue out', 'verbl.brow': 'raise an eyebrow',
    'noun.wink': 'wink', 'noun.tongue': 'tongue-out', 'noun.brow': 'eyebrow raise',
    'ving.wink': 'winking at you', 'ving.tongue': 'sticking their tongue out at you', 'ving.brow': 'raising an eyebrow at you',

    'badge.spectator': 'SPECTATOR', 'badge.hidden': 'Role hidden', 'badge.show': 'R: show', 'badge.hide': 'R: hide',
    'reveal.your': 'Your role', 'reveal.secret': 'Tell no one!',
    'desc.counts': 'This game has {t} killers and {p} police. ',
    'desc.killer': 'Look a citizen in the eye and {verb} (Space). A citizen who notices the signal dies. ',
    'desc.killerMate': 'Your teammate: {mates} (marked “Killer”). ',
    'desc.killerGoal': 'Eliminate every citizen before the police catches you. Don\'t get caught!',
    'desc.killerGoalMany': 'Eliminate every citizen before the police catches all of you.',
    'desc.police': 'Watch for the killer\'s {noun}. When you spot it, look at them and accuse (Space). ',
    'desc.policeMany': 'Watch for the killers\' {noun}. When you spot one, look at them and accuse (Space). You must catch them all to win. ',
    'desc.policeMate': 'Your teammate: {mates}. Each officer has their own chances. ',
    'desc.policeLives': 'A wrong accusation costs a chance. Chances: {lives}.',
    'desc.citizen': 'If you notice someone {ving}, say “I\'m dead!” (Space) and leave the game. Keep your role secret; watch the table to help the police.',
    'desc.timeKiller': 'You have {limit}: if time runs out first, you lose.',
    'desc.timeKillerMany': 'You have {limit}: if time runs out first, you lose.',
    'desc.timeOthers': 'The killer has {limit}: if time runs out, the killer loses.',
    'timer.label': 'KILLER\'S TIME',
    'feed.countdown': '⏱ Last {left}! If time runs out, the killer loses.',

    'noticed.title': 'Someone signaled you!', 'noticed.sub': 'You noticed: say “I\'m dead!”',
    'feed.started': 'The game has started. Keep watching!',
    'feed.sent': '{verb} — signal sent.',
    'feed.died': '{name} died.',
    'feed.caught': '{by} (Police): “You\'re the killer!” → {target} caught!',
    'feed.caughtRest': ' Killers left: {n}',
    'feed.wrong': '{by} (Police) accused {target}: wrong! ',
    'feed.livesLeft': 'Chances left: {n}', 'feed.livesOut': 'This officer is out of chances.',
    'feed.quit': '{name} left the game ({role}).', 'feed.heir': ' Their role passed to a random player.',
    'tag.left': 'left',
    'reveal.heir': '{name} left the game; their role passed to you.',

    'toast.quit': '{name} left the game.', 'toast.heir': 'Your role changed: you are now the {role}!',
    'toast.mate': '{name} is now your teammate.',
    'toast.disconnected': 'Connection lost.', 'toast.copied': 'Link copied.', 'toast.enterCode': 'Enter the room code.',
    'toast.lookFirst': 'Look at someone first.', 'toast.lookSuspect': 'Look at your suspect first.',
    'toast.teammate': 'That\'s your teammate.', 'toast.noLives': 'You have no accusations left; keep watching.',
    'toast.dead': 'You died. You\'re a spectator now.', 'toast.caught': 'You were caught. You\'re a spectator now.',

    'st.citizens': 'Citizens: {left} / {total}', 'st.killers': ' · Killers: {left} / {total}',
    'st.lives': 'Chances: {n}', 'st.livesOut': 'No chances left', 'st.watch': '👁 Looking at you: {n}',
    'hint.touch': 'Swipe to look · drag the joystick to keep turning · pinch to zoom',
    'hint.unlocked': 'Move the mouse to look · If the cursor hits the edge, click to lock the mouse · Wheel: zoom · Space: action · Esc: menu',
    'hint.locked': 'Esc: menu · Wheel: zoom · Space/Click: action · R: hide role',
    'act.accuse': 'You\'re the killer!', 'act.noLives': 'Out of chances', 'act.dead': 'I\'m dead!', 'act.spectator': 'Spectator',
    'act.key': 'Space',
    'focus.mate': '{name} · your teammate', 'focus.contact': '{name} · eye contact!',
    'focus.away': '{name} · not looking at you', 'focus.looking': '{name} is looking at you',
    'closeup': 'Close-up · {name}',

    'over.police': 'The police win!', 'over.policeMany': 'The police win!',
    'over.killer': 'The killer wins!', 'over.killerMany': 'The killers win!',
    'over.win': 'You won 🎉', 'over.lose': 'You lost',
    'over.killerList': 'Killer: {names}.', 'over.killerListMany': 'Killers: {names}.',
    'over.caught': '{police} caught the killer: {killer}.', 'over.caughtMany': 'All killers were caught. ',
    'over.allDead': 'All citizens are dead. ',
    'over.policeOut': 'The police used up every chance on wrong accusations. ',
    'over.policeOutMany': 'The officers used up every chance on wrong accusations. ',
    'over.killerLeft': 'The killer left the game and nobody was left to take over.',
    'over.policeLeft': 'The police officer left the game and nobody was left to take over. ',
    'over.timeUp': 'Time\'s up: the killer didn\'t eliminate every citizen within {limit}. ',
    'over.timeUpMany': 'Time\'s up: the killers didn\'t eliminate every citizen within {limit}. ',
    'over.leftTag': ' · left',
    'over.again': 'Back to lobby', 'over.home': 'Main menu', 'over.waitHost': 'Waiting for the host to return to the lobby…',

    'fatal.title': 'Could not load the 3D engine',
    'fatal.body': 'Three.js is downloaded on first launch. If you are offline, run {cmd} in the project folder and restart the server.',
    'stats': '{fps} FPS · {calls} draw calls · {tris}k tris · PR {pr} · shadows {sh} · {q} (auto: {auto})',
    'on': 'on', 'off': 'off',

    'err.notStarted': 'The game hasn\'t started yet.', 'err.notAllowed': 'You can\'t do that.',
    'err.badTarget': 'Invalid target.', 'err.teammate': 'That\'s your teammate.', 'err.wait': 'Wait a moment.',
    'err.notLooking': 'You\'re not looking at the target.', 'err.notPlaying': 'The game is not in progress.',
    'err.alreadyOut': 'You\'re already out.', 'err.notNoticed': 'You can\'t die without noticing a signal.',
    'err.noLives': 'You have no accusations left.', 'err.hostOnly': 'Only the host can start the game.',
    'err.notReady': 'Not everyone is ready.', 'err.noRoom': 'Room not found.', 'err.inProgress': 'A game is in progress in this room.', 'err.full': 'The room is full.',
  },
};

let lang = 'tr';

/** ?lang= > kayıtlı seçim > tarayıcı dili (tr değilse İngilizce). */
export function detectLang() {
  const p = new URLSearchParams(location.search).get('lang');
  if (p && DICT[p]) return p;
  try {
    const saved = localStorage.getItem('wk-lang');
    if (saved && DICT[saved]) return saved;
  } catch { /* yoksay */ }
  return (navigator.language || 'tr').toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

export function getLang() { return lang; }

export function setLang(l) {
  lang = DICT[l] ? l : 'tr';
  document.documentElement.lang = lang;
  try { localStorage.setItem('wk-lang', lang); } catch { /* yoksay */ }
}

/** Çeviri: t('feed.died', { name: 'Ayşe' }) */
export function t(key, params) {
  let s = DICT[lang][key] ?? DICT.tr[key] ?? key;
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] ?? m));
  return s;
}

/** Sayfadaki sabit metinleri (data-i18n, data-i18n-ph) geçerli dile çevirir. */
export function applyStatic(root = document) {
  for (const n of root.querySelectorAll('[data-i18n]')) n.textContent = t(n.dataset.i18n);
  for (const n of root.querySelectorAll('[data-i18n-ph]')) n.placeholder = t(n.dataset.i18nPh);
  document.title = t('app.title');
}
