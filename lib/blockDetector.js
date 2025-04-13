const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * Otomatik engel tespiti sınıfı
 * 
 * Web sitelerinin engellenip engellenmediğini tespit eder,
 * yavaşlama durumlarını yakalar ve raporlar.
 */
class BlockDetector {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.screenshotPath = options.screenshotPath || './logs/blocked';
    this.timeoutThreshold = options.timeoutThreshold || 10000; // 10 saniye üzeri yavaş kabul edilir
    this.httpErrorCodes = options.httpErrorCodes || [403, 451, 418]; // DPI ile ilişkili HTTP kodları
    this.blockedPatterns = options.blockedPatterns || [
      'your access to this site has been denied',
      'your ip address has been blocked',
      'our systems have detected unusual traffic',
      'this website is not available in your country',
      'access to this website has been blocked',
      'we detected that you are using an automated tool',
      'please verify you are human',
      'this page has been blocked due to',
      'your account has been blocked',
      'your connection has been blocked',
      'we have detected suspicious activity',
      'automated access to this site has been denied',
      'captcha required to continue'
    ];
    
    // Popüler sitelerin beyaz listesi - bu siteler için daha toleranslı olunacak
    this.popularSites = [
      'instagram.com', 
      'facebook.com', 
      'twitter.com', 
      'youtube.com', 
      'linkedin.com', 
      'pinterest.com', 
      'tiktok.com',
      'netflix.com',
      'spotify.com',
      'amazon.com',
      'reddit.com'
    ];
    
    // Rapor için tutulan veriler
    this.blockedSites = [];
    this.slowSites = [];
    
    // Klasörü oluştur
    this.ensureBlockedDirectory();
  }
  
  ensureBlockedDirectory() {
    try {
      if (!fs.existsSync(this.screenshotPath)) {
        fs.mkdirSync(this.screenshotPath, { recursive: true });
        logger.debug(`Engellenen siteler için dizin oluşturuldu: ${this.screenshotPath}`);
      }
    } catch (error) {
      logger.error(`Engellenen siteler için dizin oluşturulurken hata: ${error.message}`);
    }
  }
  
  /**
   * Bir sayfanın yüklenme süresini ölçer
   * @param {Object} page - Puppeteer Page nesnesi
   * @param {string} url - Ziyaret edilecek URL
   * @returns {Object} Performans metrikleri
   */
  async measureLoadTime(page, url) {
    try {
      // Sayfa ziyaretinden önce zaman al
      const startTime = Date.now();
      
      // Ziyaret et ve bekle
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: 60000  // 60 saniye zaman aşımı
      });
      
      // Ziyaret sonrası zaman
      const endTime = Date.now();
      const loadTime = endTime - startTime;
      
      // Yavaş mı kontrol et
      const isSlow = loadTime > this.timeoutThreshold;
      
      if (isSlow) {
        logger.warn(`Yavaş yüklenen site tespit edildi: ${url} (${loadTime}ms)`);
        this.slowSites.push({
          url,
          loadTime,
          timestamp: new Date().toISOString()
        });
      }
      
      return {
        loadTime,
        isSlow,
        error: null,
        blocked: false
      };
    } catch (error) {
      // Zaman aşımı veya diğer hatalar
      logger.error(`Sayfa yüklenirken hata oluştu: ${error.message}`);
      
      // Bu bir zaman aşımı hatası mı?
      const isTimeout = error.message.includes('timeout') || error.message.includes('zaman aşımı');
      
      return {
        loadTime: this.timeoutThreshold,
        isSlow: true,
        error: error.message,
        isTimeout,
        blocked: isTimeout  // Zaman aşımı genellikle bir engelleme belirtisidir
      };
    }
  }
  
  /**
   * HTTP yanıt koduna göre engelleme durumunu kontrol eder
   * @param {number} statusCode - HTTP yanıt kodu
   * @returns {boolean} Engellenme durumu
   */
  isBlockedStatusCode(statusCode) {
    return this.httpErrorCodes.includes(statusCode);
  }
  
  /**
   * Sayfa içeriğinde engelleme işaretlerini arar
   * @param {string} content - Sayfa içeriği
   * @returns {boolean} Engellenme durumu
   */
  hasBlockedContent(content) {
    if (!content) return false;
    
    // İçeriği küçük harfe çevir
    const lowerContent = content.toLowerCase();
    
    // Sayfanın uzunluğu (hızlı bir içerik kontrolü için)
    const contentLength = lowerContent.length;
    
    // Çok kısa içerik genellikle engelleme sayfalarıdır
    if (contentLength < 500 && 
        (lowerContent.includes('access denied') || 
         lowerContent.includes('forbidden') || 
         lowerContent.includes('blocked'))) {
      return true;
    }
    
    // Popüler siteleri kontrol et ve bunlar için daha spesifik kriterleri kullan
    if (this.isPopularSite(lowerContent)) {
      // Popüler siteler için daha kesin engelleme terimleri kullan
      const definiteSiteBlockTerms = [
        'your ip address has been blocked',
        'automated access to this site has been detected',
        'unusual traffic from your computer network',
        'we have detected unusual activity from your connection',
        'please verify you are a human'
      ];
      
      // Daha spesifik engelleme kontrolü - popüler siteler için
      return definiteSiteBlockTerms.some(term => lowerContent.includes(term));
    }
    
    // Normal siteler için standart engelleme kalıplarını kontrol et
    return this.blockedPatterns.some(pattern => 
      lowerContent.includes(pattern.toLowerCase())
    );
  }
  
  /**
   * Popüler bir site olup olmadığını kontrol et
   * @param {string} content - Sayfa içeriği
   * @returns {boolean} Popüler site durumu
   */
  isPopularSite(content) {
    const popularSiteMarkers = [
      'youtube.com', 'instagram.com', 'facebook.com', 'twitter.com', 
      'reddit.com', 'linkedin.com', 'netflix.com', 'amazon.com',
      'spotify.com', 'twitch.tv', 'tiktok.com', 'pinterest.com',
      'ebay.com', 'quora.com', 'stackoverflow.com', 'github.com'
    ];
    
    return popularSiteMarkers.some(marker => content.includes(marker));
  }
  
  /**
   * URL'nin popüler bir site olup olmadığını kontrol et
   * @param {string} url - Kontrol edilecek URL
   * @returns {boolean} Popüler site durumu
   */
  isPopularSiteURL(url) {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return this.popularSites.some(site => hostname.includes(site));
    } catch (e) {
      return false;
    }
  }
  
  /**
   * Bir sayfanın engellenip engellenmediğini tespit eder
   * @param {Object} page - Puppeteer Page nesnesi
   * @param {string} url - Test edilecek URL
   * @returns {Object} Tespit sonucu
   */
  async detectBlock(page, url) {
    if (!this.enabled || !page) {
      return { blocked: false, reason: null };
    }
    
    try {
      logger.info(`Engel tespiti başlatılıyor: ${url}`);
      
      // URL bilgilerini analiz et
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      
      // Beyaz listedeki domain'ler - bu sitelerde engelleme tespiti yapmayacağız 
      // (çok gerekli olmadıkça)
      const whitelistedDomains = [
        'youtube.com', 'google.com', 'instagram.com', 'facebook.com', 
        'twitter.com', 'linkedin.com', 'github.com', 'reddit.com', 
        'netflix.com', 'amazon.com', 'microsoft.com', 'apple.com',
        'spotify.com', 'twitch.tv', 'tiktok.com', 'pinterest.com',
        'ebay.com', 'quora.com', 'stackoverflow.com', 'tumblr.com',
        'booking.com', 'tripadvisor.com', 'expedia.com', 'cnn.com',
        'bbc.com', 'nytimes.com', 'theguardian.com', 'forbes.com',
        'wsj.com', 'bloomberg.com', 'medium.com', 'etsy.com',
        'wordpress.com', 'samsung.com', 'intel.com', 'nvidia.com',
        'amd.com', 'ibm.com', 'oracle.com', 'adobe.com',
        'salesforce.com', 'cloudflare.com', 'digitalocean.com', 'heroku.com',
        'netlify.com', 'vercel.com', 'hubspot.com', 'slack.com', 
        'wikipedia.org'
      ];
      
      // Ana domain'i kontrol et
      let isWhitelisted = false;
      for (const domain of whitelistedDomains) {
        if (hostname.includes(domain)) {
          isWhitelisted = true;
          break;
        }
      }
      
      // Performans metrikleri ölç
      const performanceMetrics = await this.measureLoadTime(page, url);
      
      // Zaman aşımı durumu - beyaz listedeki siteler için bile bu önemli bir gösterge
      if (performanceMetrics.isTimeout) {
        logger.warn(`Zaman aşımı oluştu: ${url} (${performanceMetrics.loadTime}ms)`);
        
        this.blockedSites.push({
          url,
          reason: 'Zaman aşımı',
          timestamp: new Date().toISOString(),
          whitelisted: isWhitelisted
        });
        
        return {
          blocked: true,
          reason: 'timeout',
          loadTime: performanceMetrics.loadTime,
          metrics: performanceMetrics
        };
      }
      
      // Eğer site beyaz listede ise, engelleme tespitini sadece kesin durumlar için yap
      if (isWhitelisted) {
        // Sayfada doğrudan "captcha" veya diğer kesin engel belirtileri var mı?
        const hasCaptcha = await page.evaluate(() => {
          // Captcha var mı?
          const captchaElements = document.querySelectorAll(
            'iframe[src*="captcha"], iframe[src*="recaptcha"], iframe[src*="hcaptcha"], ' +
            'div[class*="captcha"], div[id*="captcha"], #recaptcha, .g-recaptcha'
          );
          
          if (captchaElements.length > 0) return true;
          
          // Sayfada kesin engelleme ifadeleri içeren görünür metin var mı?
          const visibleText = document.body.innerText.toLowerCase();
          const definitiveBlockPhrases = [
            'ip address has been blocked',
            'access to this site has been denied',
            'verify you are not a robot',
            'please complete the security check',
            'unusual traffic from your computer',
            'automated access to this site has been denied'
          ];
          
          return definitiveBlockPhrases.some(phrase => visibleText.includes(phrase));
        });
        
        if (hasCaptcha) {
          logger.warn(`Beyaz listedeki site için kesin engelleme tespit edildi: ${url}`);
          
          this.blockedSites.push({
            url,
            reason: 'Kesin engelleme belirtisi (beyaz liste)',
            timestamp: new Date().toISOString()
          });
          
          return {
            blocked: true,
            reason: 'definitive_block',
            loadTime: performanceMetrics.loadTime,
            metrics: performanceMetrics
          };
        }
        
        // Popüler siteler için ek kontrol
        if (this.isPopularSiteURL(url)) {
          // Instagram ve diğer sosyal medya siteleri için yanlış alarm kontrolü
          const isNormalContent = await page.evaluate(() => {
            // Sayfada normal içerik var mı kontrol et
            const hasNormalContent = document.querySelector('header') !== null || 
                                   document.querySelector('nav') !== null || 
                                   document.querySelector('footer') !== null ||
                                   document.querySelector('article') !== null ||
                                   document.querySelector('main') !== null;
            
            // Instagram özel kontrolü
            if (window.location.hostname.includes('instagram.com')) {
              // Login sayfası veya ana sayfa içeriği
              const hasLoginForm = document.querySelector('form') !== null;
              const hasFeed = document.querySelector('main') !== null;
              
              return hasLoginForm || hasFeed || hasNormalContent;
            }
            
            return hasNormalContent;
          });
          
          if (isNormalContent) {
            logger.debug(`Popüler site ${url} normal içerik içeriyor, engelleme yok.`);
            return {
              blocked: false,
              throttled: false,
              reason: null,
              loadTime: performanceMetrics.loadTime,
              metrics: performanceMetrics,
              whitelisted: true,
              popularSite: true
            };
          }
        }
        
        // Beyaz listedeki site için hiçbir kesin engel belirtisi yoksa, ENGELLEME YOK
        return {
          blocked: false,
          throttled: false,
          reason: null,
          loadTime: performanceMetrics.loadTime,
          metrics: performanceMetrics,
          whitelisted: true
        };
      }
      
      // Buradan sonrası beyaz listede OLMAYAN siteler için engelleme tespiti
      
      // HTTP yanıt kodunu kontrol et
      const response = await page.evaluate(() => ({
        status: window.performance.timing.responseStart > 0 ? 200 : 0
      }));
      
      if (this.isBlockedStatusCode(response.status)) {
        logger.warn(`Engellenen site tespit edildi (HTTP ${response.status}): ${url}`);
        
        this.blockedSites.push({
          url,
          reason: `HTTP ${response.status}`,
          timestamp: new Date().toISOString()
        });
        
        return {
          blocked: true,
          reason: `HTTP ${response.status}`,
          loadTime: performanceMetrics.loadTime,
          metrics: performanceMetrics
        };
      }
      
      // URL yönlendirmesi kontrolü
      const currentUrl = await page.url();
      const isRedirected = currentUrl !== url;
      
      // Şüpheli yönlendirme kontrolü (sadece beyaz listede olmayan siteler için)
      if (isRedirected) {
        try {
          const redirectedHostname = new URL(currentUrl).hostname;
          const isCompleteDifferentDomain = !redirectedHostname.includes(urlObj.hostname) && 
                                           !urlObj.hostname.includes(redirectedHostname);
          
          // Tamamen farklı domain'e yönlendirme engelleme belirtisi olabilir
          if (isCompleteDifferentDomain) {
            // Şüpheli yönlendirme domain'leri
            const suspiciousDomains = ['captcha', 'verify', 'check', 'security', 'cloudflare'];
            const isSuspiciousRedirect = suspiciousDomains.some(domain => redirectedHostname.includes(domain));
            
            if (isSuspiciousRedirect) {
              logger.warn(`Şüpheli yönlendirme tespit edildi: ${url} -> ${currentUrl}`);
              
              this.blockedSites.push({
                url,
                reason: 'Şüpheli yönlendirme',
                redirectUrl: currentUrl,
                timestamp: new Date().toISOString()
              });
              
              return {
                blocked: true,
                reason: 'suspicious_redirect',
                redirectUrl: currentUrl,
                loadTime: performanceMetrics.loadTime,
                metrics: performanceMetrics
              };
            }
          }
        } catch (urlError) {
          // URL analiz hatası, devam et
          logger.debug(`Yönlendirilen URL analiz hatası: ${urlError.message}`);
        }
      }
      
      // Sayfa içeriğini kontrol et
      const content = await page.content();
      const hasBlockedText = this.hasBlockedContent(content);
      
      if (hasBlockedText) {
        logger.warn(`Engellenen site tespit edildi (İçerik tabanlı): ${url}`);
        
        this.blockedSites.push({
          url,
          reason: 'İçerik tabanlı engel',
          timestamp: new Date().toISOString()
        });
        
        return {
          blocked: true,
          reason: 'content',
          loadTime: performanceMetrics.loadTime,
          metrics: performanceMetrics
        };
      }
      
      // Yavaşlama durumu
      if (performanceMetrics.isSlow) {
        return {
          blocked: false,
          throttled: true,
          reason: 'slow',
          loadTime: performanceMetrics.loadTime,
          metrics: performanceMetrics
        };
      }
      
      // Herhangi bir engel tespit edilmedi
      return {
        blocked: false,
        throttled: false,
        reason: null,
        loadTime: performanceMetrics.loadTime,
        metrics: performanceMetrics
      };
    } catch (error) {
      logger.error(`Engel tespiti sırasında hata: ${error.message}`);
      
      return {
        blocked: false,
        error: error.message,
        metrics: { error: error.message }
      };
    }
  }
  
  /**
   * Engellenen veya yavaşlayan sayfanın ekran görüntüsünü alır
   * @param {Object} page - Puppeteer Page nesnesi
   * @param {string} url - Sayfa URL'si
   * @param {string} reason - Engelleme/yavaşlama nedeni
   * @returns {string|null} Ekran görüntüsü dosya yolu veya null
   */
  async takeBlockedScreenshot(page, url, reason) {
    try {
      if (!page) return null;
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const urlSafe = url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
      const filename = `${urlSafe}_${reason}_${timestamp}.png`;
      const filePath = path.join(this.screenshotPath, filename);
      
      // Ekran görüntüsü al
      await page.screenshot({ path: filePath, fullPage: true });
      logger.info(`Engelleme/yavaşlama ekran görüntüsü alındı: ${filePath}`);
      
      return filePath;
    } catch (error) {
      logger.error(`Ekran görüntüsü alınırken hata: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Engel raporunu JSON olarak kaydeder
   * @returns {string|null} Rapor dosya yolu veya null
   */
  async saveBlockReport() {
    try {
      if (this.blockedSites.length === 0 && this.slowSites.length === 0) {
        logger.debug('Kaydedilecek engel raporu bulunamadı');
        return null;
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `block_report_${timestamp}.json`;
      const filePath = path.join(this.screenshotPath, filename);
      
      const report = {
        timestamp: new Date().toISOString(),
        totalBlocked: this.blockedSites.length,
        totalSlow: this.slowSites.length,
        blockedSites: this.blockedSites,
        slowSites: this.slowSites
      };
      
      fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
      logger.info(`Engel raporu kaydedildi: ${filePath}`);
      
      return filePath;
    } catch (error) {
      logger.error(`Engel raporu kaydedilirken hata: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Tüm engel raporlarını listeler
   * @returns {Array} Rapor dosyaları listesi
   */
  getBlockReportsList() {
    try {
      this.ensureBlockedDirectory();
      
      const files = fs.readdirSync(this.screenshotPath)
        .filter(file => file.startsWith('block_report_') && file.endsWith('.json'))
        .map(file => {
          const filePath = path.join(this.screenshotPath, file);
          const stats = fs.statSync(filePath);
          
          return {
            name: file,
            path: filePath,
            size: stats.size,
            created: stats.birthtime
          };
        })
        .sort((a, b) => b.created - a.created); // En yeniden en eskiye sırala
        
      return files;
    } catch (error) {
      logger.error(`Engel rapor listesi alınırken hata: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Engellenen siteler istatistiklerini verir
   * @returns {Object} İstatistikler
   */
  getBlockStatistics() {
    return {
      totalBlocked: this.blockedSites.length,
      totalSlow: this.slowSites.length,
      latestBlocked: this.blockedSites.length > 0 ? this.blockedSites[this.blockedSites.length - 1] : null,
      latestSlow: this.slowSites.length > 0 ? this.slowSites[this.slowSites.length - 1] : null
    };
  }
  
  /**
   * Belirli bir raporu okur
   * @param {string} reportFilename - Rapor dosya adı
   * @returns {Object|null} Rapor içeriği veya null
   */
  getReportContent(reportFilename) {
    try {
      const filePath = path.join(this.screenshotPath, reportFilename);
      
      if (!fs.existsSync(filePath)) {
        logger.warn(`Rapor dosyası bulunamadı: ${filePath}`);
        return null;
      }
      
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      logger.error(`Rapor içeriği alınırken hata: ${error.message}`);
      return null;
    }
  }
}

module.exports = BlockDetector;