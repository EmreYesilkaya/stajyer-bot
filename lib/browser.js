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
const HttpsProxy = require('./httpsProxy');

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
      headless: true,
      logTraffic: false,
      trafficLogPath: './logs/traffic',
      detectBlocks: true,
      blockedScreenshotPath: './logs/blocked',
      httpsProxy: false,
      httpsProxyPort: 8080,
      httpsLogPath: './logs/https',
      args: [], // Varsayılan olarak boş dizi olarak ayarlandı
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
      takeScreenshot: true,
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
    if (options.httpsProxy) {
      this.httpsProxy = new HttpsProxy({
        enabled: true,
        port: options.httpsProxyPort || 8080,
        logPath: options.httpsLogPath || './logs/https'
      });
    }
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

      // Başlatma seçeneklerini hazırla
      const headlessOption = this.options.headless === true ? 'new' : false;
      
      logger.debug(`Tarayıcı başlatma seçenekleri hazırlanıyor - headless: ${headlessOption}`);
      
      // Tarayıcı argümanlarını hazırla
      const defaultArgs = [
        '--disable-notifications',
        '--disable-popup-blocking',
        '--disable-infobars',
        '--window-size=1366,768',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials'
      ];
      
      const mergedArgs = [...defaultArgs, ...this.options.args];
      
      const launchOptions = {
        headless: headlessOption,
        slowMo: this.options.slowMo,
        args: mergedArgs,
        ignoreHTTPSErrors: true,
        timeout: 60000
      };
      
      // Proxy varsa ekle
      if (this.options.httpsProxy) {
        launchOptions.args.push(`--proxy-server=${this.options.httpsProxy}`);
        logger.debug(`Proxy ayarlandı: ${this.options.httpsProxy}`);
      }
      
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
        logger.warn(`Tarayıcı başlatılamadı: ${launchError.message}. Farklı headless modu ile tekrar deneniyor...`);
        
        if (launchOptions.headless === 'new') {
          launchOptions.headless = true; // Eski headless modu (true)
        } else if (launchOptions.headless === true) {
          launchOptions.headless = false; // Görünür mod
        } else {
          // Diğer başlatma seçeneklerini değiştir
          launchOptions.args = ['--no-sandbox', '--disable-setuid-sandbox', ...launchOptions.args];
        }
        
        logger.debug('Yeni başlatma seçenekleri:', { 
          headless: launchOptions.headless,
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
  
  // Engellenen siteler için ekran görüntüsü alma metodu (alt seviye)
  async _takeBlockedScreenshot(url, blockReason) {
    if (!this.options.blockedScreenshotPath) {
      return; // Ekran görüntüsü dizini tanımlanmamışsa atla
    }
    
    try {
      // Dizin yoksa oluştur
      if (!fs.existsSync(this.options.blockedScreenshotPath)) {
        fs.mkdirSync(this.options.blockedScreenshotPath, { recursive: true });
      }
      
      // URL'den domain adı çıkar
      const domain = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      
      // Ekran görüntüsü dosya adı
      const filename = `blocked_${domain}_${blockReason}_${Date.now()}.png`;
      const filepath = path.join(this.options.blockedScreenshotPath, filename);
      
      // Ekran görüntüsünü al
      await this.page.screenshot({ path: filepath, fullPage: false });
      this.logger.info(`Engellenen sayfa ekran görüntüsü alındı: ${filepath}`);
      
    } catch (screenshotError) {
      this.logger.error(`Engellenmiş sayfa ekran görüntüsü alınamadı: ${screenshotError.message}`);
    }
  }
  
  // Ekran görüntüsü alma (üst seviye)
  async takeBlockedScreenshot(url, reason, loadTime) {
    if (!this.page) {
      logger.error('Screenshot alınamadı: Tarayıcı sayfası oluşturulmamış');
      return null;
    }
    
    try {
      // URL'den filename oluştur - sayfanın gerçek URL'sini kullan
      let currentUrl = url;
      try {
        currentUrl = await this.page.url();
        logger.info(`Ekran görüntüsü için gerçek URL: ${currentUrl}`);
      } catch (urlError) {
        logger.warn(`Sayfa URL'si alınamadı, parametre olarak gelen URL kullanılıyor: ${url}`);
      }
      
      // Geçerli bir URL olup olmadığını kontrol et
      let hostname;
      try {
        const urlObj = new URL(currentUrl);
        hostname = urlObj.hostname.replace(/\./g, '_');
      } catch (urlParseError) {
        logger.warn(`URL ayrıştırma hatası, ham URL kullanılıyor: ${currentUrl}`);
        hostname = currentUrl.replace(/[^a-zA-Z0-9]/g, '_');
      }
      
      const datetime = new Date().toISOString().replace(/:/g, '-');
      
      // Dizini kontrol et ve oluştur
      const screenshotDir = this.options.blockedScreenshotPath || path.join(__dirname, '..', 'logs', 'blocked');
      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }
      
      // Dosya adı oluştur
      const filename = `${hostname}_${reason}_${loadTime}ms_${datetime}.png`;
      const screenshotPath = path.join(screenshotDir, filename);
      
      // Ekran görüntüsü al
      await this.page.screenshot({
        path: screenshotPath,
        fullPage: true
      });
      
      logger.info(`Engelleme/yavaşlama ekran görüntüsü alındı: ${screenshotPath}`);
      return screenshotPath;
    } catch (error) {
      logger.error(`Ekran görüntüsü alınırken hata oluştu: ${error.message}`);
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
      await this.close();
      
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

  async screenshot(filename) {
    try {
      if (!this.page) {
        logger.error('Ekran görüntüsü alınamadı: Tarayıcı sayfası oluşturulmamış');
        return false;
      }
      
      // URL ise, dosya adına dönüştür
      let screenshotPath = filename;
      if (filename.startsWith('http')) {
        // URL'den geçerli bir dosya adı oluştur
        try {
          const url = new URL(filename);
          const hostname = url.hostname.replace(/\./g, '_');
          const timestamp = new Date().toISOString().replace(/:/g, '-');
          screenshotPath = path.join(__dirname, '..', 'logs', 'screenshots', `${hostname}_${timestamp}.png`);
        } catch (e) {
          // URL parse hata durumunda zamanla isimlendir
          screenshotPath = path.join(__dirname, '..', 'logs', 'screenshots', `screenshot_${Date.now()}.png`);
        }
        
        // Dizin yoksa oluştur
        const dir = path.dirname(screenshotPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }
      
      await this.page.screenshot({ path: screenshotPath, fullPage: true });
      logger.info(`Ekran görüntüsü alındı: ${screenshotPath}`);
      return screenshotPath;
    } catch (error) {
      logger.error('Ekran görüntüsü alınırken hata oluştu:', error);
      return false;
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
    
    // HTTPS proxy'yi durdur (eğer varsa)
    if (this.httpsProxy) {
      this.httpsProxy.stop();
    }
    
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
    return this.httpsProxy;
  }
  
  async getHttpsSessionsList() {
    if (this.httpsProxy) {
      return await this.httpsProxy.getSessionsList();
    }
    return [];
  }
  
  async generateHttpsReport(site = null) {
    if (this.httpsProxy) {
      return await this.httpsProxy.generateReport(site);
    }
    return null;
  }
  
  getHttpsProxyInstructions() {
    if (this.httpsProxy) {
      return this.httpsProxy.getSetupInstructions();
    }
    return "HTTPS Proxy etkin değil";
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
    logger.info(`Block detection ayarları güncellendi: Etkin: ${settings.enabled}, Ekran Görüntüsü: ${settings.takeScreenshot}, Yavaşlık Eşiği: ${settings.slowThreshold}ms`);
  }

  // Yeni eklenen fonksiyonlar
  async getRandomUserAgent() {
    const defaultUserAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/110.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Safari/605.1.15'
    ];
    
    return defaultUserAgents[Math.floor(Math.random() * defaultUserAgents.length)];
  }

  // Engelleme tespiti
  async checkPageBlocked(url, loadTime) {
    // Engelleme tespiti devre dışı bırakıldıysa
    if (this.blockDetectionSettings?.enabled === false) {
      return false;
    }
    
    try {
      // Yavaşlık eşiği ayarını kullan
      const slowThreshold = this.blockDetectionSettings?.slowThreshold || 10000;
      const slowPage = loadTime > slowThreshold;
      
      if (slowPage) {
        logger.warn(`Yavaş yüklenen site tespit edildi: ${url} (${loadTime}ms)`);
      }
      
      // Geçerli URL'yi al
      let currentUrl = url;
      try {
        currentUrl = await this.page.url();
        // Beklenen URL ile gerçek URL farklıysa uyar
        if (currentUrl !== url) {
          logger.warn(`URL farklılığı tespit edildi - Beklenen: ${url}, Gerçek: ${currentUrl}`);
        }
      } catch (urlError) {
        logger.warn(`Sayfa URL'si alınamadı: ${urlError.message}`);
      }
      
      // Sayfanın içeriğini kontrol et
      const content = await this.page.content();
      const title = await this.page.title();
      
      logger.info(`Sayfa başlığı: "${title}", URL: ${currentUrl}`);
      
      // Engelleme belirtileri
      const blockSignals = [
        { type: 'title', value: 'Access Denied', score: 0.9 },
        { type: 'title', value: 'Forbidden', score: 0.9 },
        { type: 'title', value: '403', score: 0.8 },
        { type: 'title', value: 'Cloudflare', score: 0.7 },
        { type: 'content', value: 'captcha', score: 0.8 },
        { type: 'content', value: 'security check', score: 0.7 },
        { type: 'content', value: 'access denied', score: 0.9 },
        { type: 'content', value: 'blocked', score: 0.7 },
        { type: 'content', value: 'forbidden', score: 0.9 },
      ];
      
      // Engel belirtilerini kontrol et
      let isBlocked = false;
      let blockReason = '';
      let blockScore = 0;
      
      for (const signal of blockSignals) {
        const checkValue = signal.type === 'title' ? title.toLowerCase() : content.toLowerCase();
        
        if (checkValue.includes(signal.value)) {
          isBlocked = true;
          blockReason = signal.value;
          blockScore = signal.score;
          break;
        }
      }
      
      // Yavaş sayfayı da engelleme olarak işaretle ancak skorunu düşük tut
      if (slowPage && !isBlocked) {
        isBlocked = true;
        blockReason = 'slow';
        blockScore = 0.4; // Yavaşlık daha düşük bir engelleme skoru
      }
      
      // Engel tespit edildi
      if (isBlocked) {
        logger.warn(`${currentUrl} adresinde yavaşlama/engelleme tespit edildi. Neden: ${blockReason}`);
        
        // Ekran görüntüsü al (eğer etkinse)
        if (this.blockDetectionSettings?.takeScreenshot !== false && this.options.detectBlocks) {
          await this.takeBlockedScreenshot(currentUrl, blockReason, loadTime);
        }
        
        // Engel raporunu kaydet
        const blockReport = {
          url: currentUrl,
          originalUrl: url,
          timestamp: new Date().toISOString(),
          reason: blockReason,
          score: blockScore,
          loadTime,
          pageTitle: title,
          userAgent: await this.page.evaluate(() => navigator.userAgent)
        };
        
        this.saveBlockReport(blockReport);
        
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error(`Engel tespiti sırasında hata: ${error.message}`);
      return false;
    }
  }

  // Engelleme raporu kaydet
  saveBlockReport(report) {
    try {
      // Dizini kontrol et ve oluştur
      const reportDir = path.resolve(this.options.blockedScreenshotPath);
      if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
      }
      
      // Dosya adı oluştur
      const datetime = new Date().toISOString().replace(/:/g, '-');
      const filename = `block_report_${datetime}.json`;
      const reportPath = path.join(reportDir, filename);
      
      // Raporu kaydet
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
      
      logger.info(`Engelleme raporu kaydedildi: ${reportPath}`);
      
      // Engelleme istatistiklerini sakla
      if (!this.blockedHistory) {
        this.blockedHistory = [];
      }
      this.blockedHistory.push(report);
      
      return reportPath;
    } catch (error) {
      logger.error(`Engelleme raporu kaydedilirken hata oluştu: ${error.message}`);
      return null;
    }
  }
}

module.exports = Browser;