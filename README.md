# WhoKiller — HTML/JS prototipi

Göz kırpma tabanlı sosyal çıkarım oyunu. Katil ve polis sayısı lobide seçilir (her 4 oyuncuya en fazla 1'er), kalanı vatandaş. Eksik oyuncular botlarla tamamlanır. Arayüz Türkçe ve İngilizce (ana menüde **Dil**).
Sahne 3B: herkes yuvarlak bir masada oturur, fareyle etrafına bakar; kimin ne olduğunu kimse bilmez.

## Çalıştırma

Gereken: Node.js 18+ (sunucu hiçbir paket gerektirmez).

```bash
npm start            # http://localhost:3000
```

- Aynı Wi-Fi'deki telefon/PC'ler için sunucu açılışta `http://192.168.x.x:3000` adresini yazar. Telefondan o adrese gir.
- Three.js ilk açılışta CDN'den inir (internet gerekir). Çevrimdışı çalıştırmak için: `npm i three` (bir kez). Sunucu onu otomatik kullanır.
- Port değiştirmek için: `PORT=4000 npm start`

## Nasıl oynanır

Oyunun içinde de anlatılır: ana ekranda (başlığın yanında) ve lobide **❔ Nasıl oynanır?** düğmesi 8 adımlık bir pencere açar (roller, masaya bakmak, katil, vatandaş, polis, kazanma, kontroller, odalar). Her adımda oyundan çekilmiş bir ekran görüntüsü var; ← → / kaydırma ile ilerlenir, Esc ile kapanır. Görseller `public/howto/<adım>-<dil>.webp` (Türkçe ve İngilizce ayrı, toplam ~260 KB), metinler `public/i18n.js` → `ht.*`, adım sırası `public/main.js` → `HOWTO`.

0. Ana menüde adını yaz ve **cinsiyetini seç** (Erkek / Kadın): karakterinin görünüşü buna göre çizilir. Seçmeden oyuna girilmez; seçim tarayıcıda hatırlanır. Botların cinsiyeti isimlerinden gelir.
1. **Hızlı oyun**: tek başına botlara karşı; önce ayar ekranı gelir (oyuncu sayısı, katil/polis sayısı, işaret, bot becerisi), oda kodla katılmaya kapalıdır. **Oda kur**: **herkese açık** (ana ekrandaki listede görünür, isteyen katılır) ya da **özel** (yalnızca kodla / davet linkiyle) oda; eksikler bot olur (bkz. *Odalar*). Katılanlar lobide **"Hazırım"** der (listede ✓ hazır görünür); kurucunun **Başlat** düğmesi diğer herkes hazır olana kadar kilitlidir ("Hazır bekleniyor (1/2)"), sunucu da bunu denetler. Botlar hazır beklemez. Kurucu bir ayarı değiştirirse hazırlar sıfırlanır: herkes son ayarları görüp yeniden onaylar.
2. Herkes rolünü 5 sn görür (ve kimseye söylemez). Sonra oyun başlar.
3. **Katil**: bir oyuncunun gözüne bak, işaret yap (göz kırp / dil çıkar / kaş kaldır). O an sana bakan herkes işareti görür.
4. **Vatandaş**: bir işareti *kendine yapıldığını fark ettiysen* ekranda kırmızı uyarı çıkar, **"Ben öldüm!"** de. Fark etmediysen ölmezsin.
5. **Polis**: işareti yakalamaya çalış. Katili bulursan ona bakıp **"Katil sensin!"** de. Yanlış suçlarsan hak kaybedersin ve polis olduğun herkese görünür.
6. Polis katili yakalarsa polis (ve vatandaşlar) kazanır. Katil tüm vatandaşları bitirirse ya da polisin hakkı biterse katil kazanır.
7. **Süre sınırı:** katilin **5 dakikası** var (rol kartı kapanınca başlar). Bu sürede tüm vatandaşları öldüremezse katil kaybeder. Bu bilgi lobide yazılıdır. **4. dakikadan sonra** (son 1 dakika) ekranın üstünde herkese geri sayım çıkar; son 10 saniyede kırmızıya döner. Süreler `src/config.js` → `killerTimeLimit`, `countdownSeconds`.

### Odalar

- **Herkese açık / özel:** ana ekranda "Oda kur"un üstünden seçilir (seçim hatırlanır); kurucu lobide de değiştirebilir (oyun ayarı sayılmaz, "Hazırım"lar sıfırlanmaz). Özel odaya yalnızca kodla ya da davet linkiyle girilir.
- **Açık odalar listesi** (ana ekran, CS sunucu listesi gibi): kurucunun adı, kişi sayısı (`3/10`), durum (*Lobide* / *Oyunda*) ve odanın kapanmasına kalan süre. Lobidekiler üstte; oyunda ya da dolu olana katılınamaz. Liste sunucudan anlık gelir (değişiklikler 0,3 sn içinde birleştirilip yayınlanır).
- **Oda süresi:** sunucuda yük birikmesin diye her oda kurulduktan **60 dk** sonra kapanır; **5 dk** kala odadakilere haber verilir, lobide kalan süre görünür. Süre dolduğunda oyun sürüyorsa oda, oyun bitip sonuç ekranı görüldükten (15 sn) sonra kapanır; herkes ana ekrana döner. Sunucuda aynı anda en fazla **50 oda** olabilir. Boş kalan oda hemen silinir. Ayarlar `src/config.js` → `ROOMS`.
- **Kurucu oyuncu çıkarabilir:** lobide oyuncu listesinde, oyun sırasında Esc menüsünde **Çıkar** (iki tıkla onay). AFK kalanlar ya da yeniden girip eski girişi odada kalanlar için. Çıkarılan ana ekrana döner; oyundaysa herkese "kurucu tarafından çıkarıldı" diye duyurulur ve rolü gerekirse (son katil / hakkı olan son polis) başkasına geçer.

### Karakterlerin görünüşü

Erkek karakterler: kısa saç, kabarık önlü saç, favori, tepesi açık saç, bere ya da kasket; bazılarında bıyık / sakal, kalın kaş. Kadın karakterler: uzun, küt, at kuyruğu ya da topuz saç; ruj, allık, göz farı (göz kapağında, kırpınca görünür), eyeliner, ince kaş; kulağı açık olanların yarısında küpe; omuzlar biraz daha dar. Saç ve makyaj kaşları ve ağzı kapatmaz: kaş kaldırma ve dil çıkarma işaretleri her karakterde okunur. Hepsi karakterin tek kafa geometrisine gömülür (ek draw call yok); seçimler oyuncu kimliğinden tohumlanır (`public/scene.js` → `Avatar`).

### Katil / polis sayısı

| Oyuncu | Katil | Polis |
|---|---|---|
| 4–7 | 1 | 1 |
| 8–10 | 1–2 | 1–2 |

Kural: her 4 oyuncuya en fazla 1 katil ve 1 polis (`src/config.js` → `PLAYERS_PER_ROLE`, `maxRoleCount`); vatandaşlar her zaman en az yarıdır. Oyuncu sayısı düşünce seçim otomatik sınıra çekilir.

Birden fazlaysa:
- Katiller birbirini, polisler birbirini bilir; takım arkadaşının başında rolü yazar. Takım arkadaşına işaret yapılamaz, suçlanamaz.
- Doğru suçlanan katil yakalanır ve oyundan çıkar (seyirci olur). Polis tarafı **tüm katiller yakalanınca** kazanır.
- Her polisin ayrı hakkı var; hakkı biten polis masada kalır ama suçlayamaz. Katiller tüm vatandaşlar ölünce ya da **tüm polislerin** hakkı bitince kazanır.

Denge (bot-bot, normal zorluk, 10 kişi, polis kazanma oranı): 1+1 %57 · 1+2 %73 · 2+2 %37 · 2+1 %23. İki katil belirgin şekilde güçlüdür: öldürmeyi paylaştıkları için polis her birinin işaretini daha az görür ve ikisini de yakalamak zorundadır.

### Yuvarlak masa: herkes çemberde, yan komşular uzakta

Her oyuncu kendi ekranında gerçek bir **yuvarlak masa** görür: herkes (kendisi dahil) bir çemberin üstünde, **gövdesi masanın ortasına dönük** oturur. Tek fark, senin iki yanında boşluk bırakılmasıdır: düzgün yuvarlak masada yan komşular dibinde ve tam yanda (1,3–1,9 m, ±60–72°) olurdu; burada en az **2,8 m** uzakta ve **±46° (4 kişi) – ±52° (10 kişi)** yanda otururlar, kısa bir dönüşle rahat görülürler. Diğerleri çemberin geri kalanına, aralarında en az 1,4 m olacak şekilde dizilir. Uzaklıklar: 4–6 kişide 2,8–4,2 m, 8 kişide 3,1–4,9 m, 10 kişide 3,8–6,2 m; yüzler küçülürse tekerlekle / iki parmakla yakınlaştır. Ölçüler `public/layout.js` → `RING` (`side`: yan komşuların açısı, `nearMin`: yan komşuların uzaklığı, `spacing`: aralık).

Neden çember: herkes karşıda tek sıra halinde otururken iki kişi birbirine baktığında başlarını yana çevirir ve sana **profilden** görünürler; polis göz kırpmayı seçemez. Çemberde karşılıklı oturanlar birbirine bakarken yüzleri sana da dönüktür (göz kırpmanın rahat görüldüğü bakışlar ~%5'ten ~%30–40'a çıkar). Ayrıca **göz kırpma, her izleyicinin ekranında ona yakın olan gözle oynatılır**: karakter yandan görünse bile kırpan göz sana dönüktür (hangi gözün kırpıldığının oyunda anlamı yok).

Karakter yana bakarken **omuzları da döner**: dönüşün ~1/3'ü gövdeye geçer, boyun gövdeye göre en fazla ~55° bükülür (gövde Y ekseninde neredeyse simetrik; gölge haritası yenilenmez).

Oyun karşıdakinin yüzüne değil, **masanın üstüne** bakarak başlar (~15° aşağı); bu açıda kimse odakta olmaz.

Sunucu kuralları değişmedi: oyun sunucuda yuvarlak masada (kanonik düzen) hesaplanır. İstemci bakışları iki düzen arasında **koltuk koltuk** eşler (`public/layout.js`): kanonik düzende X'in yüzüne bakan, ekrandaki masada da X'in yüzüne bakar; iki komşunun arasına bakıyorsa burada da oraya. Senin bakışın sunucuya kanonik açıyla gider, diğerlerininki ekranındaki düzene çevrilir. Böylece her karakter diğerlerine ekrandaki masada oturdukları yerlere göre bakar.

### Odak ve göz teması

Nişangâhın çevresindeki bir koni içindeki, merkeze en yakın kişi **odakta** sayılır. Yüzünün etrafında köşeli bir çerçeve çıkar.

- **Göz teması gerçekçi görünür:** kurala göre sana bakan (bakışı sana 28°'den yakın) herkesin kafası *senin ekranında* tam sana döner, yani yanındakine baksa bile göz göze görünür ve işaret tam karşıdan okunur. Başkalarına bakanlar gerçek yönleriyle çizilir.
- **Bakışma (herkes):** odağındaki kişi de sana bakıyorsa göz gözesiniz. O an **yalnızca o kişi net** kalır; ekranın geri kalanı bulanıklaşır, solar ve kararır, yani diğerlerinin ne yaptığı (göz kırpma, dil çıkarma) seçilemez. Bakış ayrılınca efekt yumuşakça kalkar. **Polisin** net alanı biraz daha geniştir (~1,35×: bakıştığı kişinin elleri ve masanın kenarı da görünür, komşular yine bulanık).
- **Katil / vatandaş:** geniş odak (~13°); yüzüne tam nişan almak gerekmez. Bakışma yokken ekranın geri kalanı hafifçe kararır.
  - Odaktaki kişi sana bakıyorsa çerçeve kehribar rengine döner: katilde "göz göze!", vatandaşta "… sana bakıyor". Katil bu anda işaret yaparsa hedef fark eder.
  - Sana bakan herkesin başında göz işareti yanar. Üstte "Sana bakan: N" yazar; katil için birden fazlaysa kırmızıdır, çünkü her biri işaretini görebilir (tanık riski).
  - "Göz göze" kuralı sunucudaki tanık kuralıyla aynıdır (`witnessAngleDeg`, 28°).
- **Polis:** dar ve kesin odak (~6°). Odaktaki kişinin yüzü sağ altta **yakın plan** olarak görünür (kendi koltuğundan dar açıyla, yani zoom'la görebileceğinden fazlası değil); göz kırpma / dil / kaş burada net seçilir. Polis, kimin kime baktığı göstergelerini görmez.

Açılar `src/config.js` içinde: `focusDeg`, `policeFocusDeg`, `witnessAngleDeg`. `focusDeg`, `aimToleranceDeg`'den (22°) küçük kalmalı.

### Kontroller

| Girdi | İşlev |
|---|---|
| Fareyi oynat | Etrafa bak — tıklamak gerekmez. "Başlat"a tıkladığın anda fare kilitlenir (tarayıcı kilidi yalnızca bir tıklamada verir); başkası başlattıysa kilit olmadan da fareyle bakılır, imleç ekran kenarına dayanırsa bir tık fareyi kilitler. Rol kartı (ilk 5 sn) açıkken bakış sabit kalır |
| **Esc** / sağ üstteki ❚❚ düğmesi | Menü: **Devam et** / **Oyundan çık**. Tek kişilik oyunda (botlara karşı) oyun gerçekten durur, botlar da bekler; çok oyunculu oyunda menü açılır ama oyun diğerleri için sürer |
| WASD / oklar | Klavyeyle bak |
| Tekerlek, `+`/`-`, iki parmakla sıkıştır | Yakınlaştır (göz kırpmayı yakından görmek için) |
| **Boşluk** / tıkla / alttaki düğme | Eylem: katil işaret yapar, polis suçlar, vatandaş "Ben öldüm" der |
| `R` | Rolünü ekranda gizle/göster (omuz üstünden bakanlara karşı) |
| Telefon | Parmakla kaydırarak bak (parmak durunca görüş durur), alttaki düğmeyle eylem. Ekrana dokununca ortanın biraz altında bir **joystick** belirir: üstünden sürükleyince topuz parmağı izler ve görüş o yöne, ne kadar itildiyse o hızda sürekli döner (yumuşakça hızlanır, ortaya yakın itmek ince ayar içindir); bırakınca hemen durur (2B oyunlardaki yön çubuğu gibi). Birkaç saniye dokunulmazsa kaybolur. Hız ayarları `public/main.js` içindeki `JOY_SPEED` ve `TOUCH_LOOK` sabitlerinde |

Adres çubuğuna `?light=1.5` yazarak sahne ışığını ölçekleyebilirsin (ekran çok karanlık/parlaksa).

### Dil

Ana menüdeki **Dil** seçimi (ya da `?lang=tr|en`) anında uygulanır ve hatırlanır; ilk açılışta tarayıcı dili kullanılır. Tüm metinler `public/i18n.js` içinde. Yeni dil eklemek için `LANGS`'a ekleyip aynı anahtarlarla bir sözlük yaz; `npm test` eksik anahtarı yakalar. Sunucu hataları dilden bağımsız bir `code` ile gelir, istemci kendi dilinde gösterir.

### Grafik kalitesi ve performans

Ana menüdeki **Grafik kalitesi** seçimi (ya da adres çubuğunda `?q=auto|high|medium|low`):

| Ayar | Çözünürlük (en fazla) | Kenar yumuşatma | Gölge | Işıklandırma |
|---|---|---|---|---|
| Yüksek | 1,5× | var | 1024 | PBR (Standard) |
| Orta | 1,25× | var | 512 | PBR (Standard) |
| Düşük | 1× | yok | yok | Lambert (ucuz) |
| **Otomatik** (varsayılan) | Bilgisayarda Yüksek, telefonda Orta ile başlar. FPS sürekli 48'in altındaysa önce gölgeyi kapatır, sonra çözünürlüğü düşürür. Düşürmek FPS'i artırmazsa (ör. tarayıcı 30 FPS'e kilitli) geri alır ve durur. | | | |

`?stats=1` sol altta FPS / draw call / piksel oranı / gölge durumunu gösterir.

Neden hızlı (`public/scene.js` başındaki notlar):
- Her karakterin sabit parçaları tek geometride birleştirilir (renkler vertex color); karakter başına ~30 yerine ~9 mesh.
- Nokta ışığın gölgesi sahneyi 6 yönden çizer. Gölge atan nesne ~200'den ~30'a indi ve gölge haritası her kare değil, yalnızca sahne değişince (masa kurulunca, biri ölünce) çizilir. Karakterler yer değiştirmediği ve kafa kendi merkezi etrafında döndüğü için görüntü aynıdır.
- Duvar gölge almaz (lambanın gölgeleri duvara ulaşmaz); canvas üstündeki panellerde `backdrop-filter` yok; HUD DOM'a yalnızca değer değişince yazılır.
- Odanın pürüzlü yüzeyleri (duvar, zemin, tavan, halı, çerçeveler) PBR yerine Lambert; görüntü aynı. Iris Xe'de ölçülebilir fark yok, zayıf telefon GPU'ları için.
- Odak karartması tek tam ekran geçiş; polisin yakın planı aynı canvas'a ikinci, dar açılı bir çizim (yalnızca odak varken).
- Bakışma bulanıklığı sahneyi ikinci kez çizmez: ekrana çizilmiş kare bir dokuya kopyalanır, 1/4 çözünürlükte bulanıklaştırılıp maskeyle üstüne çizilir (yalnızca efekt açıkken; ölçümde ~0,5 ms/kare).

Ölçüm (Intel Iris Xe, 2400×1350, 10 oyuncu, vsync kapalı): önce ~50 FPS / p95 31 ms / kare başı 525 draw call → Yüksek ayarda ~90 FPS / p95 13 ms / 86 draw call; Orta ~118 FPS; Düşük ~235 FPS.

## Oyun kuralları (sunucuda uygulanır)

- **Görme kuralı:** bir işaret yalnızca o anda bakışı katile 28°'den yakın olanlara gönderilir. Başkalarının istemcisi işareti hiç almaz.
- **Fark etme:** hedef o an katile bakıyorsa fark etmiş sayılır. İnsan vatandaş 10 sn içinde "Ben öldüm" demezse otomatik elenir. Fark etmeden ölemezsin.
- **Katil bekleme süresi:** iki işaret arası 6 sn. Hedefe gerçekten bakıyor olmak zorunda (en fazla 22° sapma).
- **Polis hakkı:** her polisin 2 yanlış suçlama hakkı (lobide 1–3). Her suçlama arası 2 sn.
- **Süre sınırı:** oyun başladıktan 5 dk sonra katil(ler) hâlâ tüm vatandaşları bitirmediyse polis (ve vatandaşlar) kazanır (sebep `timeUp`). Son 1 dakikaya girilince sunucu herkese bir kez `countdown` gönderir; istemci oradan sayar (tek kişilik oyunda duraklatınca sayaç da durur).
- **Ölenler** seyirci olur: herkesin rolünü görür, işaretleri görür.
- **Oyundan çıkan** (menüden, bağlantısı koptu ya da kurucu çıkardı) masadan kalkar ve **herkese duyurulur** (bildirim, akışta rolüyle birlikte, başının üstünde "çıktı"). Masadaki **son katil** ya da **hakkı olan son polis** ise rolü, canlı ve işaret almamış **rastgele bir vatandaşa** geçer: yalnızca o kişiye bildirilir (rol kartı + "Rolün değişti"). Polis kalan hakkını devralır; katil ilk işaretinden önce 3 sn etrafa bakabilir. Devralacak kimse yoksa oyun biter. Kurucu çıkarsa kuruculuk bir sonrakine geçer.
- Vatandaşlar polisle aynı takım sayılır ("Kazandın/Kaybettin" ekranı buna göre).

## Botlar

Botlar da yalnızca *bakış* üzerinden oynar; kimin hangi rolde olduğunu bilmezler (katil bot polisi, polis bot katili tahmin etmek zorundadır).

- **Vatandaş bot:** rastgele birilerine bakar, fark ederse birkaç saniye sonra ölür.
- **Katil bot:** gözünün içine bakan birini seçer, başka kimsenin bakmadığı anı kollar, yöneldikten sonra biri bakmaya başlarsa vazgeçebilir. Polisi bilmediği için ona da işaret yapabilir. Son dakikada (geri sayım) daha çok risk alır.
- **Polis bot:** uzun süredir izlemediği / şüpheli kişilere bakar. İşareti görürse (dikkat olasılığıyla) suçlar. Ayrıca biri öldüğünde "ölmeden hemen önce ona kimler bakmıştı?" diye şüphe puanı biriktirir; yeterince net bir şüpheli çıkarsa suçlar.
- **Bot becerisi** (lobi): Kolay / Normal / Zor. Normal, bot-bot simülasyonunda 4–10 oyuncuda polis ~%47–58 kazanır.

## Dosya yapısı

```
server.js            başlatıcı (npm start)
src/app.js           HTTP (statik dosya) + WebSocket birleştirme
src/ws.js            bağımlılıksız WebSocket sunucusu
src/rooms.js         oda/lobi, mesaj yönlendirme, oyun döngüsü zamanlayıcısı
src/game.js          saf oyun mantığı (ağ yok; testlenebilir)
src/bots.js          bot beyni
src/config.js        denge ayarları (cooldown, açılar, bot zorlukları)
public/index.html    arayüz iskeleti     public/style.css   stil
public/main.js       ağ, HUD, girdi      public/scene.js    Three.js sahnesi/karakterler
public/layout.js     ekrandaki yuvarlak masa düzeni + sunucunun düzeniyle bakış eşlemesi
public/i18n.js       arayüz metinleri (Türkçe, İngilizce)
public/howto/        "Nasıl oynanır" görselleri (oyundan ekran görüntüleri, her dil için)
test/                birim + uçtan uca testler, denge simülasyonu
```

Sunucu kimin hangi rolde olduğunu yalnızca o oyuncuya söyler; işaret olayları yalnızca tanıklara gider.

## Test ve denge

```bash
npm test             # 43 test: kurallar, nasıl oynanır görselleri, süre sınırı, cinsiyet, açık/özel oda listesi, oda süresi, oyuncu çıkarma, çok katil/polis, hazır sistemi, çıkış ve rol devri, duraklatma, yuvarlak masa eşlemesi, protokol, çeviri tamlığı
npm run sim          # bot-bot simülasyonu: polis/katil kazanma oranları
node test/simulate.js 500 normal
```

Dengeyi değiştirmek için `src/config.js` içindeki sayılara bak (görme açısı, bekleme süresi, bot dikkati…), sonra `npm run sim` ile etkisini ölç.

## Bilinen sınırlar (prototip)

- 3B sahne Chrome'da (Windows, Intel Iris Xe) gerçek Three.js ile denendi; başka GPU/tarayıcılarda ışık ayarı gerekebilir (`?light=` ve `scene.js`).
- Yeniden bağlanma yok: sayfayı yenileyen oyuncu oyundan çıkmış sayılır.
- Three.js: yerelde `npm i three` ile kurulan sürüm (şu an 0.187), yoksa CDN'den 0.160 yüklenir; ikisiyle de denendi.
- Hile koruması sınırlı: işaretler yalnızca tanıklara gönderilir ama istemci bakış yönünü kendisi bildirir.
- Sesli/yazılı sohbet yok (aynı odadaysanız zaten gerekmez; uzaktan oynanacaksa sesli görüşme önerilir).

## Sıradaki adımlar

- Gerçek telefon deneyimi: PWA ya da Capacitor ile paketleme, jiroskopla bakış (`DeviceOrientationEvent`).
- Alternatif işaretler: dil çıkarma / kaş kaldırma zaten var; ayrıca "burun silme", "kulak çekme", "baş eğme" eklenebilir (`scene.js` > `Avatar.update`, `config.js` > `SIGNALS`).
- Oyun fikirleri: katil için yem hareketi ("sahte işaret" cezasız), polis için ek yetenek, 2 katilli mod.
- Üretim için: sunucuyu bir bulut makinesine koy (HTTPS için ters vekil/nginx arkasında `wss://` otomatik çalışır).
