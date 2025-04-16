# Site Ziyaretçi Botu / Stajyer Bot

Bu uygulama, verilen siteleri otomatik olarak ziyaret eden, her sitede belirlenen süre kadar kalan ve insan davranışlarını taklit eden bir bot sistemidir.

## Özellikler

- Sistemde kurulu olan Google Chrome ile çalışma
- İnsan davranışlarını simüle etme (scroll, mouse hareketi, güvenli tıklamalar)
- Zamanlanmış çalışma imkanı (belirli gün ve saatlerde çalışma)
- Kapsamlı loglama sistemi
- Kullanıcı dostu etkileşimli CLI arayüzü
- Özelleştirilebilir yapılandırma
- Geliştirilmiş hata yönetimi
- Basit User-Agent yönetimi
- Gelişmiş site engelleme tespit sistemi

## Kurulum

### Gereksinimler

- Node.js (14.x veya üzeri)
- npm (6.x veya üzeri)
- Google Chrome (sistemde kurulu olmalı)
- Makefile
- Chocolatey

### Windows Kullanıcıları İçin Ön Hazırlık

Windows kullanıcıları için, Makefile kullanabilmek amacıyla Chocolatey ve Make kurulması gerekmektedir:

1. **Chocolatey Kurulumu**:
   - PowerShell'i yönetici olarak açın
   - Aşağıdaki komutu çalıştırın:
   ```powershell
   Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
   ```
   -gerkeli durumlarda node indirimde gelen kısımda da kurulum sağlayabilrsiniz
   - Kurulum tamamlandıktan sonra PowerShell'i kapatıp yeniden açın

2. **Make Kurulumu**:
   - Chocolatey kurulduktan sonra aşağıdaki komutu çalıştırın:
   ```powershell
   choco install make
   ```
   - Kurulum tamamlandıktan sonra PowerShell'i kapatıp yeniden açın
   - `make --version` komutu ile kurulumun başarılı olduğunu kontrol edin

### Adımlar

1. Bu repoyu klonlayın veya indirin
2. Proje klasörüne gidin:
```bash 
cd site-visitor-bot
```

3. Kurulum için iki seçenek:

   **A) Make ile Kurulum (Önerilen):**
   ```bash
   make install
   ```
   Bu komut tüm bağımlılıkları ve Chrome eklentisini otomatik olarak yükleyecektir.

   **B) Manuel Kurulum:**
   ```bash
   npm install
   npx puppeteer browsers install chrome
   ```

## Kullanım

### Makefile ile Hızlı Kurulum ve Çalıştırma

Daha kolay kullanım için projede Makefile bulunmaktadır. Aşağıdaki komutları kullanabilirsiniz:

```bash
make install      # Tüm bağımlılıkları ve Chrome eklentisini yükler
make run          # Botu görünür modda çalıştırır
make run-headless # Botu arka planda (görünmez) çalıştırır
make run-once     # Tek seferlik çalıştırır
make menu         # Etkileşimli menüyü açar
make logs         # Son logları gösterir
make error-logs   # Hata loglarını gösterir
make clean        # node_modules klasörünü temizler
make help         # Tüm Makefile komutlarını listeler
```

### Etkileşimli Menü

Botu etkileşimli menü ile yönetmek için (önerilen yöntem):

```bash
node cli.js
# veya
node cli.js menu
```

Bu komut, aşağıdaki işlemleri yapabileceğiniz bir menü açacaktır:
- Botu başlatma
- Tek seferlik çalıştırma
- Tarayıcı görünürlüğünü değiştirme (Gizli/Görünür)
- Ayarları düzenleme
- Logları görüntüleme

### CLI Komutları

Bot'u doğrudan komut satırından başlatmak için:

```bash
node cli.js start         # Arka planda çalıştırır
node cli.js start -f      # Ön planda çalıştırır (tarayıcı kapatılana kadar bekler)
```

Siteleri bir kez ziyaret etmek için:

```bash
node cli.js run-once
```

Logları görüntülemek için:

```bash
node cli.js logs          # Tüm logları gösterir
node cli.js logs -e       # Sadece hata loglarını gösterir
node cli.js logs -n 100   # Son 100 satır logu gösterir
```

## Yapılandırma

`config.json` dosyası aşağıdaki ayarları içerir:

```json
{
  "sites": [
    "https://www.example.com",
    "https://www.google.com",
    "https://www.github.com"
  ],
  "visitDuration": 60000,
  "schedule": {
    "enabled": true,
    "startTime": "09:00",
    "endTime": "17:00",
    "days": ["monday", "tuesday", "wednesday", "thursday", "friday"]
  },
  "browser": {
    "headless": false,
    "windowSize": {
      "width": 1280,
      "height": 720
    },
    "userAgentRotation": false
  },
  "humanBehavior": {
    "scroll": true,
    "randomClicks": true,
    "moveMouseRandomly": true
  },
  "delay": {
    "min": 2000,
    "max": 5000
  },
  "logging": {
    "level": "info",
    "saveToFile": true,
    "logFilePath": "logs"
  },
  "blockDetection": {
    "enabled": true,
    "takeScreenshot": true,
    "slowThreshold": 30000
  }
}
```

### Yapılandırma Seçenekleri

- **sites**: Ziyaret edilecek URL'lerin listesi
- **visitDuration**: Her sitede kalma süresi (milisaniye cinsinden)
- **schedule**: Zamanlanmış çalışma ayarları
  - **enabled**: Zamanlanmış çalışma aktif mi?
  - **startTime**: Günlük başlangıç saati
  - **endTime**: Günlük bitiş saati
  - **days**: Çalışacağı günler
- **browser**: Tarayıcı ayarları
  - **headless**: Tarayıcı arka planda mı çalışsın? (false: görünür, true: gizli)
  - **windowSize**: Tarayıcı pencere boyutu
  - **userAgentRotation**: User-Agent rotasyonu etkin mi?
- **humanBehavior**: İnsan davranış simülasyonu
  - **scroll**: Otomatik scroll yapılsın mı?
  - **randomClicks**: Rastgele tıklamalar yapılsın mı?
  - **moveMouseRandomly**: Fare imleci rastgele hareket ettirilsin mi?
- **delay**: Siteler arası geçiş süreleri (milisaniye)
- **logging**: Loglama ayarları
- **blockDetection**: Engelleme tespit ayarları
  - **enabled**: Engelleme tespiti aktif mi?
  - **takeScreenshot**: Engelleme durumunda ekran görüntüsü alınsın mı?
  - **slowThreshold**: Sayfa yükleme süresinin hangi eşikten sonra "yavaş" sayılacağı

## Engelleme Tespit Sistemi

Bot, ziyaret ettiği sitelerde bot algılama sistemleri tarafından engellenip engellenmediğini otomatik olarak tespit eder. Bu tespit şu özelliklere sahiptir:

1. **Akıllı Engelleme Algılama**: Sistem, birçok farklı faktörü değerlendirerek bir sitenin bot engellemesi yapıp yapmadığını anlar:
   - Sayfa içeriğinde engelleme ifadeleri ("access denied", "captcha required", "security check" vb.)
   - Beklenmeyen yönlendirmeler
   - Anormal sayfa yükleme süreleri
   - Sayfadaki belirli HTML elementleri

2. **Popüler Site Optimizasyonu**: Instagram, Twitter, YouTube gibi popüler sitelerin normal davranışlarını tanır ve yanlış positif tespitleri azaltır.

3. **Engelleme Raporlama**: Engelleme tespit edildiğinde detaylı log kayıtları tutar ve isteğe bağlı olarak ekran görüntüsü alır.

4. **Yapılandırma Seçenekleri**:
   - `blockDetection.enabled`: Engelleme tespitini açıp kapatma
   - `blockDetection.takeScreenshot`: Engelleme durumunda ekran görüntüsü alma (kesin bir değer kontrolü yapar, sadece true olduğunda çalışır)
   - `blockDetection.slowThreshold`: Sayfa yükleme süresinin hangi eşikten sonra "yavaş" sayılacağı

Engelleme durumunda bot, ilgili siteyi atlayarak bir sonraki siteye geçer ve detaylı bilgileri loglara kaydeder.

### Engelleme Tespit Sistemini İyileştirme

Eğer engelleme tespit sisteminde sorunlar yaşıyorsanız (bloklanmayan sitelerin yanlışlıkla bloklanmış olarak algılanması veya captcha algılama sorunları):

#### 1. Yanlış Positif Tespitleri Azaltma (normal sitelerin engelli olarak algılanması)

- **`slowThreshold` değerini artırın**: `config.json` dosyasında `blockDetection.slowThreshold` değerini önemli ölçüde artırın (örn: 60000 ms veya daha fazla). Bu değer milisaniye cinsindendir ve yavaş internet bağlantılarında yanlış tespitleri önler.

```json
"blockDetection": {
  "enabled": true,
  "takeScreenshot": true,
  "slowThreshold": 60000  // 60 saniye
}
```

- **Görünür mod kullanın**: `browser.headless` ayarını kesinlikle `false` yapın. Headless (görünmez) mod, çoğu site tarafından daha kolay tespit edilir.

```json
"browser": {
  "headless": false
}
```

- **Yavaşlık tespitini devre dışı bırakın**: Yanlış tespitlerin çoğu yavaşlık nedeniyle oluşuyorsa, kodu düzenleyerek yavaşlık tespitini tamamen devre dışı bırakabilirsiniz. Bu için `index.js` dosyasında aşağıdaki bölümü yorum satırına alabilirsiniz:

```javascript
// Yavaş sayfayı da engelleme olarak işaretle...
/*
if (slowPage && !isBlocked && !popularSites.some(site => currentHostname.includes(site))) {
  isBlocked = true;
  blockReason = 'slow';
  blockScore = 0.4;
}
*/
```

#### 2. CAPTCHA Algılaması İyileştirme

- **CAPTCHA belirteçlerini güncelleme**: Daha fazla CAPTCHA türünü tanımak için aşağıdaki belirteçleri ekleyin. `blockSignals` dizisine bu belirteçleri eklemek veya mevcut belirteçleri güncellemek, CAPTCHA tespitini iyileştirecektir.

```javascript
// Bu belirteçleri blockSignals dizisine ekleyin
{ type: 'content', value: 'i am not a robot', score: 0.9 },
{ type: 'content', value: 'recaptcha', score: 0.9 },
{ type: 'content', value: 'hcaptcha', score: 0.9 },
{ type: 'content', value: 'cloudflare ray id', score: 0.8 },
{ type: 'content', value: 'proof of humanity', score: 0.8 },
{ type: 'content', value: 'ddos protection', score: 0.8 },
{ type: 'content', value: 'verification challenge', score: 0.8 }
```

- **Görüntü tabanlı CAPTCHA tespiti**: Daha gelişmiş tespit için, HTML içerisinde CAPTCHA görüntülerini ve iframe'lerini arayan kontroller ekleyin:

```javascript
// Sayfada reCAPTCHA veya hCAPTCHA iframe'leri kontrol edin
const hasCaptchaIframe = await page.evaluate(() => {
  const iframes = document.querySelectorAll('iframe');
  return Array.from(iframes).some(iframe => 
    iframe.src.includes('recaptcha') || 
    iframe.src.includes('hcaptcha')
  );
});

if (hasCaptchaIframe) {
  isBlocked = true;
  blockReason = 'captcha-iframe';
  blockScore = 0.9;
}
```

#### 3. Popüler Siteler için Özel Kurallar Ekleme

Sorun yaşayan belirli popüler siteler için özel kurallar ekleyin:

```javascript
// Örnek: Twitter (X) için özel kurallar
if (currentHostname.includes('twitter.com') || currentHostname.includes('x.com')) {
  // Sadece spesifik engelleme durumlarında true döndür
  return lowerContent.includes('unusual activity') || 
         lowerContent.includes('suspicious activity') ||
         lowerContent.includes('automated tools');
}

// Örnek: Reddit için özel kurallar
if (currentHostname.includes('reddit.com')) {
  // Sadece açık CAPTCHA veya engelleme durumlarında true döndür
  return lowerContent.includes('our systems have detected unusual traffic') ||
         lowerContent.includes('automated access');
}
```

#### 4. HTTPS Proxy Kullanarak Tespit İyileştirme

Bot algılama korumalarını aşmak için HTTPS proxy kullanabilirsiniz:

```json
"logging": {
  "level": "info",
  "saveToFile": true,
  "logFilePath": "logs",
  "enableTrafficLogging": true,
  "httpsProxy": true,
  "httpsProxyPort": 8080
}
```

Bu ayar, bot algılamaya karşı daha fazla koruma sağlamak için `lib/httpsProxy.js` modülünü kullanır. HTTPS trafiğini izleyerek daha doğru engelleme tespitleri yapabilirsiniz.

#### 5. Sabit Çözüm Adımları

Çok fazla yanlış tespit alıyorsanız ve hızlı bir çözüm istiyorsanız:

1. `config.json` dosyasında `blockDetection.enabled` değerini `false` yapın (engelleme tespitini kapatır)
2. `browser.headless` değerini `false` yapın (görünür modda çalıştırır)
3. Önemli sayfalar için manuel whitelist oluşturun
4. Ziyaret sürelerini kısaltın ve farklı siteler arasında daha uzun beklemeler ekleyin

## Son Güncellemeler

- **Screenshot kontrolü iyileştirildi**: Ekran görüntüsü alma işlemi artık sıkı kontroller ile yapılıyor. `blockDetectionSettings.takeScreenshot !== true` koşulu ile kontrol ediliyor ve devre dışı bırakıldığında hiç işlem yapılmıyor.
- **Browser sınıfı dışa aktarım sorunu çözüldü**: Browser sınıfının düzgün şekilde dışa aktarılması `module.exports = Browser` ile sağlandı.
- **Tutarlı logger kullanımı**: Tüm logger referansları tutarlı hale getirildi.
- **node-notifier** kütüphanesi kaldırıldı: Artık site ziyaretleri tamamlandığında masaüstü bildirimi gönderilmiyor.
- **UserAgentManager** modülü kaldırıldı: User-Agent yönetimi basitleştirildi. Karmaşık rotasyon stratejileri yerine, basit bir rastgele User-Agent seçimi kullanılıyor.

## Sorun Giderme

Eğer uygulama çalışırken sorunlarla karşılaşırsanız, aşağıdaki yaygın sorunları ve çözümlerini inceleyebilirsiniz:

### Bilinen Sorunlar

1. **Chrome başlatma sorunları**
   - Google Chrome uygulamasının sisteminizde kurulu ve erişilebilir olduğundan emin olun
   - Chrome'u manuel olarak başlatıp kapatarak süreci kontrol edin

2. **Sistem kaynakları yetersizliği**
   - Çok sayıda tarayıcı oturumu açıldığında bellek kullanımı artabilir
   - Tek seferde daha az site ziyareti yapılandırın

3. **Ağ bağlantı sorunları**
   - İnternet bağlantınızın aktif olduğundan emin olun
   - Ziyaret edilecek siteler erişilebilir olmalıdır

4. **Site Engelleme Sorunları**
   - Popüler siteler (Instagram, Reddit, TikTok vb.) bot algılama sistemlerine sahiptir
   - Captcha sistemleri botları tespit ettiğinde erişim engellenebilir
   - Engelleme durumunda bot sonraki siteye geçer ve log dosyasına kayıt atar
   - Sık engelleme yaşıyorsanız `browser.headless` ayarını `false` yaparak görünür modda çalıştırmayı deneyin

### Log Çıktıları

Log dosyalarında aşağıdaki gibi hata mesajları görebilirsiniz:

```
2025-04-13 13:57:50 [ERROR]: Sayfa yüklenirken hata oluştu (net::ERR_NETWORK_CHANGED at https://www.instagram.com)
2025-04-13 13:57:50 [ERROR]: https://www.instagram.com sitesinde engelleme tespit edildi. Neden: Bilinmeyen.
2025-04-13 13:59:04 [ERROR]: https://www.reddit.com sitesinde engelleme tespit edildi. Neden: Captcha tespit edildi.
```

Bu mesajlar normaldir ve bot koruma mekanizmalarından kaynaklanmaktadır. Bu durumda bot otomatik olarak listedeki bir sonraki siteye geçiş yapar.

## Güvenlik Notları

- Bu bot yalnızca yasal sınırlar içinde kullanılmalıdır
- Sitelerin kullanım koşullarını ihlal etmek yasal sonuçlar doğurabilir
- İzinsiz site taraması yapmayın
- Kapsamlı testler için site sahiplerinden izin alın

## Lisans

MIT

## Katkıda Bulunma

Katkılarınızı memnuniyetle karşılıyoruz! Lütfen bir pull request oluşturun veya bir issue açın.
