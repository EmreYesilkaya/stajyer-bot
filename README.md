# Site Ziyaretçi Botu

Bu uygulama, verilen siteleri otomatik olarak ziyaret eden, her sitede belirlenen süre kadar kalan ve insan davranışlarını taklit eden bir bot sistemidir.

## Özellikler

- Sistemde kurulu olan Google Chrome ile çalışma
- İnsan davranışlarını simüle etme (scroll, mouse hareketi, güvenli tıklamalar)
- Zamanlanmış çalışma imkanı (belirli gün ve saatlerde çalışma)
- Kapsamlı loglama sistemi
- Kullanıcı dostu etkileşimli CLI arayüzü
- Özelleştirilebilir yapılandırma
- Geliştirilmiş hata yönetimi
- User-Agent rotasyonu desteği

## Kurulum

### Gereksinimler

- Node.js (14.x veya üzeri)
- npm (6.x veya üzeri)
- Google Chrome (sistemde kurulu olmalı)

### Adımlar

1. Bu repoyu klonlayın veya indirin
2. Proje klasörüne gidin ve bağımlılıkları yükleyin: (Make ile kurulum yapcaksanız eğer burayıa atlayın)
```bash 
cd site-visitor-bot
npm install
```

3. Gerekirse özel Chrome bağımlılıklarını yükleyin (isteğe bağlı):

```bash
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
    "userAgent": null
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
  "userAgentRotation": {
    "enabled": true,
    "strategy": "smart",
    "customFile": "data/user-agents.json"
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
  - **userAgent**: Özel user agent (null ise varsayılan)
- **humanBehavior**: İnsan davranış simülasyonu
  - **scroll**: Otomatik scroll yapılsın mı?
  - **randomClicks**: Rastgele tıklamalar yapılsın mı?
  - **moveMouseRandomly**: Fare imleci rastgele hareket ettirilsin mi?
- **delay**: Siteler arası geçiş süreleri (milisaniye)
- **logging**: Loglama ayarları
- **userAgentRotation**: User-Agent rotasyon ayarları
  - **enabled**: Rotasyon aktif mi?
  - **strategy**: Rotasyon stratejisi ('random', 'sequential', 'smart')
  - **customFile**: Özel User-Agent dosyası

## Sorun Giderme

Eğer uygulama çalışırken sorunlarla karşılaşırsanız, aşağıdaki yaygın sorunları ve çözümlerini inceleyebilirsiniz:

### Bilinen Sorunlar

1. **Chrome başlatma sorunları**
   - Google Chrome uygulamasının sisteminizde kurulu ve erişilebilir olduğundan emin olun
   - Chrome'u manuel olarak başlatıp kapatarak süreci kontrol edin

2. **User-Agent Rotasyon Hataları**
   - "this.userAgentManager.isEnabled is not a function" hatası görürseniz:
     - Ayarlardan User-Agent rotasyonunu devre dışı bırakıp tekrar etkinleştirin
     - Uygulamayı yeniden başlatın
     - `data/user-agents.json` dosyasını kontrol edin

3. **Sistem kaynakları yetersizliği**
   - Çok sayıda tarayıcı oturumu açıldığında bellek kullanımı artabilir
   - Tek seferde daha az site ziyareti yapılandırın

4. **Ağ bağlantı sorunları**
   - İnternet bağlantınızın aktif olduğundan emin olun
   - Ziyaret edilecek siteler erişilebilir olmalıdır

5. **Site Engelleme Sorunları**
   - Popüler siteler (Instagram, Reddit, TikTok vb.) bot algılama sistemlerine sahiptir
   - Captcha sistemleri botları tespit ettiğinde erişim engellenebilir
   - Engelleme durumunda bot sonraki siteye geçer ve log dosyasına kayıt atar

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
