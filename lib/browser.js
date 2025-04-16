// Normal puppeteer yerine puppeteer-core kullan
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const child_process = require('child_process');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('./logger');
const TrafficLogger = require('./trafficLogger');
const BlockDetector = require('./blockDetector');
// const HttpsProxy = require('./httpsProxy');
// const UserAgent = require('user-agents');
// const humanBehavior = require('./humanBehavior');

// Stealth eklentisini ekle
puppeteer.use(StealthPlugin());

// Chrome işlemlerini temizle
const killChromeProcesses = () => {
  try {
    const cmd = process.platform === 'win32' ? 'taskkill /F /IM chrome.exe' : 'pkill -f chrome';
    execSync(cmd, { stdio: 'ignore' });
    logger.info('Chrome işlemleri temizlendi');
    return true;
  } catch (error) {
    // Çalışan Chrome işlemi yoksa hata verebilir, bu normal
    logger.debug('Chrome işlemleri temizlenemedi veya zaten çalışmıyor olabilir');
    return false;
  }
};

class Browser {
  constructor(options = {}) {
    // Default options
    this.options = {
      headless: options.headless !== false,
      userAgentRotation: options.userAgentRotation === true,
      userAgentStrategy: options.userAgentStrategy || 'random',
      ignoreHTTPSErrors: options.ignoreHTTPSErrors !== false, 
      timeout: options.timeout || 60000,
      width: options.width || 1366,
      height: options.height || 768,
      args: options.args || [],
      defaultViewport: null,
      // HTTPS proxy ayarlarını devre dışı bırakıyorum
      httpsProxy: false,
      httpsProxyPort: 8080,
      logTraffic: false,
      trafficLogPath: './logs/traffic',
      detectBlocks: true,
      blockedScreenshotPath: './logs/blocked',
      httpsLogPath: './logs/https',
      slowMo: 0,
      ...options
    };
    
    // Eğer options.args undefined ise, boş dizi olarak ayarla
    if (!this.options.args) {
      this.options.args = [];
    }
    
    // Headless mod durumunu logla
    logger.info(`Tarayıcı modu ayarlandı: ${this.options.headless ? 'Gizli (Headless)' : 'Görünür'}`);
    
    // Block detection varsayılan ayarları
    this.blockDetectionSettings = {
      enabled: this.options.detectBlocks,
      takeScreenshot: options.takeScreenshot === true,
      slowThreshold: 30000
    };
    
    this.browser = null;
    this.page = null;
    this.launchAttempts = 0;
    this.trafficLogger = null;
    this.blockDetector = null;
    this.httpsProxy = null;
    
    this.logger = logger.child({ service: 'browser' });
    this.navigationTimeout = options.navigationTimeout || 60000;
    
    // Trafik izleme özelliği etkinleştirilmişse logger'ı başlat
    if (options.logTraffic) {
      this.trafficLogger = new TrafficLogger({
        enabled: true,
        logPath: options.trafficLogPath || './logs/traffic'
      });
    }
    
    // Engel tespit sistemi başlat
    this.blockDetector = new BlockDetector({
      enabled: options.detectBlocks !== false,
      screenshotPath: options.blockedScreenshotPath || './logs/blocked'
    });
    
    // HTTPS Proxy başlat (etkinleştirilmişse)
    // if (options.httpsProxy) {
    //   this.httpsProxy = new HttpsProxy({
    //     enabled: true,
    //     port: options.httpsProxyPort || 8080,
    //     logPath: options.httpsLogPath || './logs/https'
    //   });
    // }
  }

  /**
   * Tarayıcının headless modunda çalışıp çalışmadığını kontrol eder
   * @returns {Promise<boolean>} Tarayıcı headless modunda ise true, değilse false döner
   */
  async isHeadless() {
    try {
      // Tarayıcı başlatılmamışsa uyarı ver
      if (!this.browser) {
        logger.warn('isHeadless: Tarayıcı henüz başlatılmamış');
        return false;
      }
      
      // Tarayıcı süreç argümanlarını al
      let pid = 'unknown';
      try {
        if (this.browser._process && this.browser._process.pid) {
          pid = this.browser._process.pid;
        }
      } catch (pidError) {
        logger.warn(`PID değeri alınamadı: ${pidError.message}`);
      }
      
      const version = await this.browser.version();
      const pages = await this.browser.pages();
      
      logger.debug(`Browser bilgisi: PID=${pid}, Versiyon=${version}, Açık Sayfa Sayısı=${pages.length}`);
      
      // Headless durumunu kontrol etmek için birkaç yöntem
      
      // 1. Tarayıcı başlatma argümanlarını kontrol et
      const browserWSEndpoint = this.browser.wsEndpoint();
      const isHeadlessNew = browserWSEndpoint.includes('headless=new');
      const isHeadlessTrue = browserWSEndpoint.includes('headless=true');
      
      if (isHeadlessNew || isHeadlessTrue) {
        logger.debug(`Tarayıcı headless modunda çalışıyor (${isHeadlessNew ? 'new' : 'true'} modu)`);
        return true;
      }
      
      // 2. Browser user agent'ını kontrol et (Headless genellikle içerir)
      if (this.page) {
        const userAgent = await this.page.evaluate(() => navigator.userAgent);
        if (userAgent.includes('Headless')) {
          logger.debug(`User-Agent headless içeriyor: ${userAgent}`);
          return true;
        }
      }
      
      logger.debug('Tarayıcı görünür modda çalışıyor');
      return false;
    } catch (error) {
      logger.error(`Headless durumu kontrol edilirken hata oluştu: ${error.message}`);
      return false;
    }
  }

  // Chrome'un yürütülebilir dosyasının yolunu platform bazında tespit eder
  getChromeExecutablePath() {
    try {
      const platform = process.platform;
      
      // macOS
      if (platform === 'darwin') {
        // MacOS için yaygın Chrome yolları
        const macPaths = [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
          '/Applications/Chromium.app/Contents/MacOS/Chromium'
        ];
        
        for (const path of macPaths) {
          if (fs.existsSync(path)) {
            this.logger.debug(`Chrome yolu bulundu (macOS): ${path}`);
            return path;
          }
        }
      }
      
      // Windows
      else if (platform === 'win32') {
        // Windows için yaygın Chrome yolları
        const winPaths = [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
        ];
        
        for (const path of winPaths) {
          if (fs.existsSync(path)) {
            this.logger.debug(`Chrome yolu bulundu (Windows): ${path}`);
            return path;
          }
        }
      }
      
      // Linux
      else if (platform === 'linux') {
        // Linux için yaygın Chrome yolları
        const linuxPaths = [
          '/usr/bin/google-chrome',
          '/usr/bin/chromium-browser',
          '/usr/bin/chromium'
        ];
        
        for (const path of linuxPaths) {
          if (fs.existsSync(path)) {
            this.logger.debug(`Chrome yolu bulundu (Linux): ${path}`);
            return path;
          }
        }
      }
      
      this.logger.warn(`Chrome yolu bulunamadı. Platform: ${platform}`);
      return null; // Yol bulunamadı, Puppeteer varsayılan tarayıcıyı kullanacak
    } catch (error) {
      this.logger.error(`Chrome yolu tespit edilirken hata: ${error.message}`);
      return null;
    }
  }

  async launch() {
    try {
      // Önceki tarayıcı işlemlerini temizle
      if (this.browser) {
        await this.closeBrowser();
      }

      // Tarayıcı argümanlarını hazırla
      const defaultArgs = [
        '--disable-notifications',
        '--disable-popup-blocking',
        '--disable-infobars',
        '--window-size=1366,768',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials'
      ];
      
      // Headless modunu options'tan alıyoruz (burada kritik değişiklik)
      // Ancak options'ta yanlış bilgi olabilir, bu yüzden tam options'ı logluyoruz
      logger.debug(`Tarayıcı headless ayarı: ${this.options.headless}`);
      
      // headless değerini doğrudan config.json'dan okuyalım
      try {
        const configPath = path.join(__dirname, '..', 'config.json');
        const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        // config.json'daki headless değerini kullan, options'ı güncelle
        this.options.headless = configData.browser.headless;
        logger.debug(`Config dosyasından headless ayarı: ${this.options.headless}`);
      } catch (configErr) {
        logger.error(`Config dosyası okunamadı: ${configErr.message}`);
      }
      
      // Güncellenmiş options ile headless modunu ayarla
      if (this.options.headless === true) {
        logger.info('Tarayıcı gizli modda başlatılıyor (headless=true)');
        defaultArgs.push('--headless=new');
      } else {
        logger.info('Tarayıcı görünür modda başlatılıyor (headless=false)');
      }
      
      const mergedArgs = [...defaultArgs, ...this.options.args];
      
      const launchOptions = {
        // headless modunu biz argümanlar üzerinden yönetiyoruz
        headless: false, // boolean olarak headless modunu devre dışı bırak
        slowMo: this.options.slowMo,
        args: mergedArgs,
        ignoreHTTPSErrors: true,
        timeout: 60000
      };
      
      // Proxy varsa ekle
      // if (this.options.httpsProxy) {
      //   launchOptions.args.push(`--proxy-server=${this.options.httpsProxy}`);
      //   logger.debug(`Proxy ayarlandı: ${this.options.httpsProxy}`);
      // }
      
      // ChromeExecutablePath'i platform bazında ayarla
      const executablePath = this.getChromeExecutablePath();
      if (executablePath) {
        launchOptions.executablePath = executablePath;
        logger.debug(`Chrome yürütülebilir dosyası: ${executablePath}`);
      }
      
      logger.debug('Tarayıcı başlatma seçenekleri:', { 
        headless: launchOptions.headless,
        slowMo: launchOptions.slowMo,
        args: launchOptions.args
      });
      
      // Tarayıcıyı başlatmayı dene
      try {
        this.browser = await puppeteer.launch(launchOptions);
        
        let pid = 'unknown';
        try {
          if (this.browser._process && this.browser._process.pid) {
            pid = this.browser._process.pid;
          }
        } catch (pidError) {
          logger.warn(`PID değeri alınamadı: ${pidError.message}`);
        }
        
        logger.debug(`Tarayıcı başarıyla başlatıldı - PID: ${pid}`);
      } catch (launchError) {
        // İlk deneme başarısız oldu, headless ayarını değiştirip tekrar dene
        logger.warn(`Tarayıcı başlatılamadı: ${launchError.message}. Farklı parametrelerle tekrar deneniyor...`);
        
        // Tüm headless parametrelerini kaldır ve sadece temel argümanlarla dene
        launchOptions.args = launchOptions.args.filter(arg => !arg.includes('--headless'));
        
        // Sandbox kısıtlamalarını kaldır
        launchOptions.args.push('--no-sandbox', '--disable-setuid-sandbox');
        
        logger.debug('Yeni başlatma seçenekleri:', { 
          headless: false,
          args: launchOptions.args
        });
        
        this.browser = await puppeteer.launch(launchOptions);
        
        let pid = 'unknown';
        try {
          if (this.browser._process && this.browser._process.pid) {
            pid = this.browser._process.pid;
          }
        } catch (pidError) {
          logger.warn(`PID değeri alınamadı: ${pidError.message}`);
        }
        
        logger.debug(`Tarayıcı alternatif modda başlatıldı - PID: ${pid}`);
      }

      // Başlatma sonrası headless durumunu kontrol et ve logla
      const isHeadlessMode = await this.isHeadless();
      logger.debug(`Tarayıcı headless durumu: ${isHeadlessMode ? 'Evet (Headless)' : 'Hayır (Görünür)'}`);

      // Yeni sayfa aç
      this.page = await this.browser.newPage();
      logger.debug('Yeni sayfa açıldı');
      
      // Ekran boyutunu ayarla
      await this.page.setViewport({ width: 1366, height: 768 });
      logger.debug('Ekran boyutu ayarlandı: 1366x768');

      // Kullanıcı ajanı ayarla
      await this.setRandomUserAgent();
      
      // Log trafiği izle
      if (this.options.logTraffic) {
        this.setupNetworkLogging();
      }

      this.setupPageEvents();
      return true;
      
    } catch (error) {
      logger.error(`Tarayıcı başlatılırken hata oluştu: ${error.message}`);
      console.error(error);
      return false;
    }
  }

  /**
   * Belirtilen URL'ye git ve engelleme kontrolü yap
   * @param {string} url 
   * @returns {Promise<Object>} navigasyon sonucu hakkında bilgiler içeren bir nesne
   */
  async goTo(url) {
    const result = {
      success: false,
      isBlocked: false,
      error: null,
      message: '',
      httpStatus: null,
      loadTime: 0,
      finalUrl: '',
      blocked: {
        reason: null,
        pattern: null,
        evidence: null
      }
    };
    
    // Ziyaret girişimini logla
    this.logger.info(`${url} adresine gidiliyor...`);
    
    // Mevcut URL kontrol et - aynı sayfaya yönlendirme için
    const currentUrl = this.page.url();
    if (currentUrl === url) {
      this.logger.info(`Zaten ${url} adresindeyiz, sayfa yenileniyor...`);
      try {
        await this.page.reload({ waitUntil: 'networkidle2', timeout: this.navigationTimeout });
        result.success = true;
        result.finalUrl = this.page.url();
        return result;
      } catch (reloadError) {
        result.error = reloadError;
        result.message = `Sayfa yenileme hatası: ${reloadError.message}`;
        return result;
      }
    }
    
    // Navigasyon başlama zamanı
    const startTime = Date.now();
    
    try {
      // Sayfa yönlendirmesini takip ederek siteye git
      const response = await this.page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: this.navigationTimeout
      });
      
      // Yükleme süresini kaydet
      result.loadTime = Date.now() - startTime;
      result.finalUrl = this.page.url();
      
      // HTTP durum kodu kontrol et
      if (response) {
        const status = response.status();
        result.httpStatus = status;
        
        // 4xx veya 5xx hata durum kodları
        if (status >= 400) {
          result.success = false;
          result.message = `HTTP Hata: ${status} ${response.statusText()}`;
          return result;
        }
        
        // Yönlendirmeler sonucunda güvenlik sayfasına yönlendirildi mi?
        const finalUrl = this.page.url().toLowerCase();
        const securityRedirectPatterns = [
          'security', 'captcha', 'challenge', 'blocked', 'bot', 'check',
          'ddos', 'protection', 'cloudflare', 'detected', 'verification',
          'verify', 'human', 'secure'
        ];
        
        for (const pattern of securityRedirectPatterns) {
          if (finalUrl.includes(pattern)) {
            result.isBlocked = true;
            result.success = false;
            result.blocked.reason = 'security_redirect';
            result.blocked.pattern = pattern;
            result.blocked.evidence = finalUrl;
            result.message = `Güvenlik yönlendirmesi tespit edildi: ${pattern}`;
            
            // Engellenen sayfanın ekran görüntüsünü al
            await this._takeBlockedScreenshot(url, 'security_redirect');
            
            return result;
          }
        }
      }
      
      // İçerik ve başlığa göre engelleme kontrolü
      const isBlocked = await this._checkIfBlocked(url);
      if (isBlocked.blocked) {
        result.isBlocked = true;
        result.success = false;
        result.blocked = isBlocked.details;
        result.message = isBlocked.message;
        return result;
      }
      
      // Navigasyon başarılı
      result.success = true;
      this.logger.info(`${url} başarıyla açıldı (${result.loadTime}ms)`);
      
      return result;
      
    } catch (error) {
      result.success = false;
      result.error = error;
      result.loadTime = Date.now() - startTime;
      
      // Zaman aşımı hataları
      if (error.name === 'TimeoutError') {
        result.message = `Navigasyon zaman aşımı: ${error.message}`;
        this.logger.warn(`${url} zaman aşımı: ${error.message}`);
      } else {
        result.message = `Navigasyon hatası: ${error.message}`;
        this.logger.error(`${url} navigasyon hatası: ${error.message}`);
      }
      
      return result;
    }
  }

  // Site engelleme tespiti için özel metod
  async _checkIfBlocked(url) {
    const result = {
      blocked: false,
      message: '',
      details: {
        reason: null,
        pattern: null,
        evidence: null
      }
    };
    
    try {
      // 1. Sayfa içeriği ve başlık kontrolü
      const content = await this.page.content();
      const title = await this.page.title();
      
      // Engelleme işaretlerini arayacak regex kalıpları
      const blockingPatterns = [
        // Genel engelleme mesajları
        /denied|access\s*denied|blocked|suspicious|unusual\s*activity|verify\s*human|robot|captcha|challenge|check|detection|security\s*check|prove\s*human/i,
        // Popüler bot koruması sağlayıcıları
        /cloudflare|akamai|imperva|distil|perimeterx|datadome|human\s*only|recaptcha|are\s*you\s*a\s*robot|automated\s*query|bot\s*protection/i,
        // Spesifik mesajlar
        /automated\s*access|unusual\s*traffic|temporarily\s*blocked|too\s*many\s*requests|rate\s*limit|abuse/i
      ];
      
      // İçerikte ve başlıkta engelleme kalıplarını ara
      for (const pattern of blockingPatterns) {
        if (pattern.test(content) || pattern.test(title)) {
          result.blocked = true;
          result.details.reason = 'content_pattern';
          result.details.pattern = pattern.toString();
          
          // Eşleşen içeriği bul
          const match = content.match(pattern) || title.match(pattern);
          result.details.evidence = match ? match[0] : 'pattern match found';
          
          result.message = `Engelleyici içerik tespit edildi: ${result.details.evidence}`;
          this.logger.warn(`${url} içerikte engelleme tespit edildi: ${result.details.evidence}`);
          
          // Engellenen sayfanın ekran görüntüsünü al
          await this._takeBlockedScreenshot(url, 'content_pattern');
          
          return result;
        }
      }
      
      // 2. Element tabanlı kontroller - özellikle CAPTCHA ve anti-bot akışları
      const blockingSelectors = [
        // Captcha
        'iframe[src*="captcha"]',
        'iframe[src*="recaptcha"]',
        'iframe[src*="challenge"]',
        'div.g-recaptcha',
        'div[class*="captcha"]',
        // Diğer engelleme arabirimlerinin seçicileri
        'div[class*="challenge"]',
        'div[class*="block"]',
        'div[class*="security"]',
        'div[id*="captcha"]'
      ];
      
      for (const selector of blockingSelectors) {
        const elementExists = await this.page.$(selector);
        if (elementExists) {
          result.blocked = true;
          result.details.reason = 'blocking_element';
          result.details.pattern = selector;
          result.details.evidence = 'Element bulundu: ' + selector;
          
          result.message = `Engelleyici element tespit edildi: ${selector}`;
          this.logger.warn(`${url} engelleyici element tespit edildi: ${selector}`);
          
          // Engellenen sayfanın ekran görüntüsünü al
          await this._takeBlockedScreenshot(url, 'blocking_element');
          
          return result;
        }
      }
      
    } catch (checkError) {
      // İçerik kontrolü sırasında hata - bloklama olarak değerlendirme
      this.logger.error(`${url} engelleme kontrolü sırasında hata: ${checkError.message}`);
      // İçerik kontrolündeki hataları bloklama olarak değerlendirme, ancak şüpheli olarak işaretle
      result.blocked = false;
      result.message = `Engelleme kontrolü sırasında hata: ${checkError.message}`;
    }
    
    return result;
  }
  
  // Engellenen sayfalar için ekran görüntüsü alma
  async _takeBlockedScreenshot(url, reason) {
    try {
      // Ekran görüntüsü alma devre dışı bırakıldıysa hiç işlem yapma
      if (this.blockDetectionSettings?.takeScreenshot !== true) {
        logger.debug(`Ekran görüntüsü alma devre dışı, engellenen site için görüntü alınmıyor. URL: ${url}`);
        return null;
      }

      if (!this.page) {
        logger.error(`Engellenen site ekran görüntüsü alınamadı: Sayfa açık değil. URL: ${url}`);
        return null;
      }

      // Klasörü kontrol et
      const screenshotDir = this.options.blockedScreenshotPath;
      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }

      // Dosya adını oluştur
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.replace(/\./g, '_');
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
      const filename = `block_${hostname}_${reason}_${timestamp}.png`;
      const screenshotPath = path.join(screenshotDir, filename);

      // Ekran görüntüsü al
      await this.page.screenshot({ path: screenshotPath, fullPage: true });
      logger.info(`Engellenen site ekran görüntüsü kaydedildi: ${screenshotPath}`);
      return { path: screenshotPath, filename };
    } catch (error) {
      logger.error(`Engellenen site ekran görüntüsü alınırken hata oluştu: ${error.message}, URL: ${url}`);
      return null;
    }
  }
  
  // Engellenen site için ekran görüntüsü alma
  async takeBlockedScreenshot(url, reason, loadTime = 0) {
    // Ekran görüntüsü alma devre dışı bırakıldıysa hiç işlem yapma
    if (this.blockDetectionSettings?.takeScreenshot !== true) {
      logger.debug(`Ekran görüntüsü alma devre dışı, görüntü alınmıyor. URL: ${url}, Sebep: ${reason}`);
      return null;
    }

    // Bu metod, bloke olmuş sitelerin ekran görüntüsünü almak ve bilgilerini kaydetmek için kullanılır
    try {
      if (!this.page) {
        logger.error(`Blok ekran görüntüsü alınamadı: Tarayıcı sayfası oluşturulmamış. URL: ${url}`);
        return null;
      }

      // Bloke edilmiş site için ekran görüntüsü dizinini kontrol et
      const blockedDir = this.options.blockedScreenshotPath;
      if (!fs.existsSync(blockedDir)) {
        fs.mkdirSync(blockedDir, { recursive: true });
      }

      // Ekran görüntüsü dosya adını oluştur - zamanı ve sebebi içerecek şekilde
      const sanitizedUrl = url.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
      const filename = `block_${sanitizedUrl}_${timestamp}_${reason}.png`;
      const screenshotPath = path.join(blockedDir, filename);

      // Ekran görüntüsü al
      await this.page.screenshot({ path: screenshotPath, fullPage: true });
      
      // JSON bilgi dosyasını oluştur
      const infoFilename = `${path.basename(screenshotPath, '.png')}.json`;
      const infoPath = path.join(blockedDir, infoFilename);
      
      // Blok bilgilerini JSON dosyasına kaydet
      const blockInfo = {
        url: url,
        reason: reason,
        timestamp: new Date().toISOString(),
        loadTime: loadTime
      };
      
      fs.writeFileSync(infoPath, JSON.stringify(blockInfo, null, 2));
      
      logger.info(`Blok ekran görüntüsü alındı: ${screenshotPath}`);
      logger.debug(`Blok bilgileri kaydedildi: ${infoPath}`);
      
      return screenshotPath;
    } catch (error) {
      logger.error(`Blok ekran görüntüsü alınırken hata: ${error.message}, URL: ${url}`);
      return null;
    }
  }
  
  // Sayfa olayları için kurulum metodu
  setupPageEvents() {
    try {
      if (!this.page) {
        logger.warn('setupPageEvents: Sayfa mevcut değil');
        return;
      }
      
      // Sayfa hata olayı
      this.page.on('error', error => {
        logger.error(`Sayfa hatası: ${error.message}`);
      });
      
      // Sayfa kapatma olayı
      this.page.on('close', () => {
        logger.debug('Sayfa kapatıldı');
      });
      
      // JavaScript hataları
      this.page.on('pageerror', error => {
        logger.debug(`Sayfa JavaScript hatası: ${error.message}`);
      });
      
      // İstek başarısızlık olayı 
      this.page.on('requestfailed', request => {
        const url = request.url();
        const resourceType = request.resourceType();
        const failureText = request.failure() ? request.failure().errorText : 'unknown';
        
        // Sadece önemli kaynakları logla
        if (['document', 'script', 'xhr', 'fetch'].includes(resourceType)) {
          logger.debug(`İstek başarısız: ${url}, Tip: ${resourceType}, Hata: ${failureText}`);
        }
      });
      
      logger.debug('Sayfa olayları kuruldu');
    } catch (error) {
      logger.error(`Sayfa olayları kurulurken hata: ${error.message}`);
    }
  }
  
  // Network loglama ayarları
  setupNetworkLogging() {
    try {
      if (!this.page || !this.trafficLogger) {
        logger.warn('setupNetworkLogging: Sayfa veya trafik logger mevcut değil');
        return;
      }
      
      // İstek dinleyicisi
      this.page.on('request', request => {
        const url = request.url();
        const method = request.method();
        const resourceType = request.resourceType();
        
        this.trafficLogger.logRequest(url, method, resourceType);
      });
      
      // Yanıt dinleyicisi
      this.page.on('response', response => {
        const url = response.url();
        const status = response.status();
        const headers = response.headers();
        
        this.trafficLogger.logResponse(url, status, headers);
      });
      
      logger.debug('Network loglama kuruldu');
    } catch (error) {
      logger.error(`Network loglama kurulurken hata: ${error.message}`);
    }
  }

  // Tarayıcıyı tamamen yeniden başlatma metodu
  async restart() {
    this.logger.info('Tarayıcı yeniden başlatılıyor...');
    
    try {
      // Mevcut tarayıcıyı kapat
      await this.closeBrowser();
      
      // Kısa bir bekletme
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Chrome işlemlerini temizleme (isteğe bağlı)
      if (process.platform === 'win32') {
        // Windows için Chrome işlemlerini sonlandır
        child_process.exec('taskkill /F /IM chrome.exe', () => {});
      } else if (process.platform === 'darwin') {
        // macOS için Chrome işlemlerini sonlandır
        child_process.exec('pkill -f "Google Chrome"', () => {});
      } else if (process.platform === 'linux') {
        // Linux için Chrome işlemlerini sonlandır
        child_process.exec('pkill -f chrome', () => {});
      }
      
      // Yeni tarayıcı başlat
      await this.launch();
      this.logger.info('Tarayıcı başarıyla yeniden başlatıldı.');
      
    } catch (error) {
      this.logger.error(`Tarayıcı yeniden başlatma hatası: ${error.message}`);
      throw new Error(`Tarayıcı yeniden başlatılamadı: ${error.message}`);
    }
  }

  // Genel ekran görüntüsü alma metodu
  async screenshot(filename) {
    if (this.blockDetectionSettings?.takeScreenshot !== true) {
      logger.debug('Ekran görüntüsü alma devre dışı, görüntü alınmıyor.');
      return null;
    }
    
    try {
      if (!this.page) {
        logger.error('Screenshot alınamadı: Tarayıcı sayfası oluşturulmamış');
        return null;
      }
      
      if (!filename) {
        filename = `screenshot_${new Date().toISOString().replace(/:/g, '-')}.png`;
      }
      
      // Ekran görüntüsü dizini kontrol et ve oluştur
      const screenshotDir = path.dirname(filename);
      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }
      
      await this.page.screenshot({ path: filename, fullPage: true });
      logger.info(`Ekran görüntüsü alındı: ${filename}`);
      return filename;
    } catch (error) {
      logger.error(`Ekran görüntüsü alınırken hata: ${error.message}`);
      return null;
    }
  }

  async close() {
    // Trafik logları ve engel raporu kaydet
    if (this.trafficLogger) {
      await this.trafficLogger.saveCurrentLogs();
    }
    
    if (this.blockDetector) {
      await this.blockDetector.saveBlockReport();
    }
    
    // HTTPS proxy'yi durdurma kodunu kaldırıyorum
    // if (this.httpsProxy) {
    //   this.httpsProxy.stop();
    // }
    
    if (this.browser) {
      try {
        await this.browser.close();
        logger.debug('Tarayıcı başarıyla kapatıldı');
      } catch (err) {
        logger.warn(`Tarayıcı kapatılırken hata oluştu: ${err.message}`);
        // Tarayıcı kapatılamazsa Chrome süreçlerini elle temizle
        killChromeProcesses();
      } finally {
        this.browser = null;
        this.page = null;
      }
    }
  }
  
  // Trafik kayıtları ile ilgili yardımcı metodlar
  getTrafficLogger() {
    return this.trafficLogger;
  }
  
  // Tarayıcının açık olup olmadığını kontrol et
  isBrowserOpen() {
    return this.browser !== null && this.browser !== undefined;
  }
  
  async saveTrafficLogs(customFilename) {
    if (this.trafficLogger) {
      return await this.trafficLogger.saveCurrentLogs(customFilename);
    }
    return false;
  }
  
  async getTrafficLogsList() {
    if (this.trafficLogger) {
      return await this.trafficLogger.getLogsList();
    }
    return [];
  }
  
  // Engel tespiti ile ilgili yardımcı metodlar
  getBlockDetector() {
    return this.blockDetector;
  }
  
  async getBlockReports() {
    if (this.blockDetector) {
      return this.blockDetector.getBlockReportsList();
    }
    return [];
  }
  
  getBlockStatistics() {
    if (this.blockDetector) {
      return this.blockDetector.getBlockStatistics();
    }
    return { totalBlocked: 0, totalSlow: 0 };
  }
  
  // HTTPS Proxy ile ilgili yardımcı metodlar
  getHttpsProxy() {
    return null;
  }
  
  async getHttpsProxySessions() {
    return [];
  }
  
  async generateHttpsProxyReport(site) {
    return null;
  }
  
  getHttpsProxyInstructions() {
    return "HTTPS Proxy devre dışı bırakılmıştır.";
  }

  // Rasgele User-Agent ayarla
  async setRandomUserAgent() {
    try {
      // Basitleştirilmiş, UserAgentManager'a bağımlılığı kaldırılmış versiyon
      const defaultUserAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/110.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Safari/605.1.15'
      ];
      
      const userAgent = defaultUserAgents[Math.floor(Math.random() * defaultUserAgents.length)];
      await this.page.setUserAgent(userAgent);
      logger.debug(`User-Agent ayarlandı: ${userAgent}`);
    } catch (error) {
      logger.error(`User-Agent ayarlanırken hata oluştu: ${error.message}`);
      // Hata durumunda varsayılan User-Agent kullan
      try {
        await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36');
      } catch (setError) {
        logger.error(`Varsayılan User-Agent ayarlanırken hata: ${setError.message}`);
      }
    }
  }

  // Tarayıcı kapatma fonksiyonu - browser.close() ile aynı işlevi görür
  async closeBrowser() {
    try {
      if (this.browser) {
        logger.debug('Önceki tarayıcı oturumu kapatılıyor...');
        await this.browser.close();
        this.browser = null;
        this.page = null;
        return true;
      }
      return false;
    } catch (error) {
      logger.error(`Tarayıcı kapatılırken hata oluştu: ${error.message}`);
      // Hata durumunda Chrome süreçlerini temizlemeyi dene
      killChromeProcesses();
      this.browser = null;
      this.page = null;
      return false;
    }
  }

  // Eksik kalan fonksiyonları kaldırdığımız UserAgentManager yerine ekleyelim
  setBlockDetectionSettings(settings) {
    this.blockDetectionSettings = settings;
    logger.info(`Engel tespiti ayarları güncellendi: ${JSON.stringify(settings)}`);
  }
}

// Sınıfı dışa aktar
module.exports = Browser;