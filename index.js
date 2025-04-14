const fs = require('fs');
const path = require('path');
const { CronJob } = require('cron');
const Browser = require('./lib/browser');
const logger = require('./lib/logger');
const humanBehavior = require('./lib/humanBehavior');

// Komut satırı argümanlarını kontrol et
const args = process.argv.slice(2);
const isDaemon = args.includes('--daemon');
const isVerbose = args.includes('--verbose');

// Daemon modunda çalışıyorsa extra log bilgisi yaz
if (isDaemon) {
  logger.debug('Daemon modunda başlatılıyor...');
  
  if (isVerbose) {
    logger.debug('Detaylı log modu etkin');
  }
  
  logger.debug('Komut satırı argümanları:', { args });
  logger.debug('Ortam değişkenleri:', { 
    LOG_LEVEL: process.env.LOG_LEVEL,
    HEADLESS_MODE: process.env.HEADLESS_MODE,
    DAEMON_MODE: process.env.DAEMON_MODE
  });
}

// Config dosyasını oku
let config;
try {
  config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
  
  // ASCII art'ı konsola yazdır (eğer varsa ve daemon modunda değilsek)
  if (config.asciiArt && !isDaemon) {
    console.log('\n' + config.asciiArt + '\n');
  }
  
  // Headless mod durumunu logla
  logger.debug(`Tarayıcı modu yapılandırmadan okundu: ${config.browser.headless ? 'Gizli' : 'Görünür'}`);
} catch (error) {
  logger.error('Config dosyası okunamadı:', error);
  process.exit(1);
}

// Saatleri hesapla
const getScheduleTime = () => {
  const { startTime, endTime } = config.schedule;
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  
  return {
    startHour,
    startMinute,
    endHour,
    endMinute
  };
};
 
// Rastgele gecikme süresi oluştur
const getRandomDelay = (isBlocked = false) => {
  if (isBlocked) {
    // Engellenme durumunda 20-40 saniye arası bekle
    return Math.floor(Math.random() * (40000 - 20000 + 1)) + 20000;
  }
  
  // Normal durum için config'deki gecikme değerlerini kullan
  const { min, max } = config.delay;
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Hatalı durumda ekran görüntüsü almak için yardımcı fonksiyon
async function takeErrorScreenshot(browser, fileName) {
  try {
    if (!browser || !browser.page) {
      logger.error('Ekran görüntüsü alınamadı: Tarayıcı veya sayfa yok');
      return null;
    }
    
    // Dizini kontrol et ve oluştur
    const screenshotDir = path.join(__dirname, 'logs', 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    
    const screenshotPath = path.join(screenshotDir, `${fileName}.png`);
    await browser.page.screenshot({ path: screenshotPath, fullPage: true });
    logger.info(`Hata ekran görüntüsü alındı: ${screenshotPath}`);
    return screenshotPath;
  } catch (error) {
    logger.error(`Ekran görüntüsü alınırken hata oluştu: ${error.message}`);
    return null;
  }
}

// Engellenen sayfaların ekran görüntüsünü almak için kullanılacak fonksiyon
async function takeBlockedScreenshot(browser, url, reason, loadTime) {
  try {
    // Ekran görüntüsü dizini kontrolü
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
    const screenshotPath = path.join(__dirname, config.logging?.screenshotPath || 'logs/screenshots');
    
    if (!fs.existsSync(screenshotPath)) {
      fs.mkdirSync(screenshotPath, { recursive: true });
    }
    
    // Ekran görüntüsü için URL'yi formatla
    const hostname = new URL(url).hostname.replace(/[^a-z0-9]/gi, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${hostname}_${reason}_${timestamp}.png`;
    const fullPath = path.join(screenshotPath, fileName);
    
    // Tam sayfa ekran görüntüsü çek
    const page = (await browser.pages())[0];
    if (!page) {
      logger.error('Ekran görüntüsü için açık sayfa bulunamadı');
      return;
    }
    
    // Sayfada scroll yap, blok uyarılarını daha iyi görebilmek için
    await page.evaluate(() => {
      window.scrollTo(0, 200); // Sayfanın üst kısmını kaydırarak engelleme bilgisinin görünmesini sağla
    });
    
    // Biraz bekle ve ekran görüntüsünü al
    await new Promise(resolve => setTimeout(resolve, 500));
    await page.screenshot({ path: fullPath, fullPage: false, captureBeyondViewport: false });
    
    logger.info(`Engellenen site için ekran görüntüsü kaydedildi: ${fileName}`);
    
    // Ek olarak blok uyarısını gösteren HTML bölümün ekran görüntüsünü alma
    try {
      // Engelleme ile ilgili olabilecek elementleri seçmeye çalış
      const blockElement = await page.evaluate(() => {
        // Olası engelleme mesajını içerebilecek elementleri ara
        const selectors = [
          'div.error-container', '.error-message', '.access-denied', '.blocked-message',
          '#main-message', '.alert-error', '.cf-error-overview', '.oops', '.captcha',
          'div.error', 'div#error', 'form[id*="captcha"]', 'div[id*="blocked"]',
          'div[class*="blocked"]', 'div[class*="error"]', 'div[id*="error"]'
        ];
        
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element && element.offsetHeight > 0 && element.offsetWidth > 0) {
            // Element koordinatlarını ve boyutunu dön
            const rect = element.getBoundingClientRect();
            return {
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height
            };
          }
        }
        
        return null;
      });
      
      // Eğer engelleme ile ilgili bir element bulunduysa, onun ekran görüntüsünü de al
      if (blockElement) {
        const blockScreenPath = path.join(screenshotPath, `${hostname}_block_detail_${timestamp}.png`);
        await page.screenshot({
          path: blockScreenPath,
          clip: {
            x: blockElement.left,
            y: blockElement.top,
            width: blockElement.width,
            height: blockElement.height
          }
        });
        logger.info(`Engelleme detay ekran görüntüsü kaydedildi: ${blockScreenPath}`);
      }
    } catch (detailError) {
      logger.debug(`Engelleme detay görüntüsü alınırken hata: ${detailError.message}`);
    }
    
    return fullPath;
  } catch (error) {
    logger.error(`Ekran görüntüsü alınırken hata: ${error.message}`);
    return null;
  }
}

// Web sitesini ziyaret etme fonksiyonu
async function visitWebsite(browser, site, userAgent) {
  try {
    // Sayfa açma zamanını ölç
    const startTime = Date.now();
    
    // Siteye git
    const page = await browser.page;
    
    // User agent ayarla
    if (userAgent) {
      await page.setUserAgent(userAgent);
    }
    
    logger.info(`${site} sitesine gidiliyor...`);
    
    // Siteye git ve yüklenmesini bekle
    await page.goto(site, { 
      waitUntil: 'networkidle2',
      timeout: config.siteTimeout || 60000 
    });
    
    // Sayfanın tam olarak yüklenmesi için kontrol
    const isFullyLoaded = await page.evaluate(() => {
      return new Promise(resolve => {
        // Tamamen yüklenmiş mi kontrol et
        if (document.readyState === 'complete') {
          // Spinner veya loading göstergeleri var mı kontrol et
          const loaders = document.querySelectorAll('.loading, .loader, .spinner, [class*="loading"]');
          let stillLoading = false;
          
          for (const loader of loaders) {
            const style = window.getComputedStyle(loader);
            if (style.display !== 'none' && style.visibility !== 'hidden') {
              stillLoading = true;
              break;
            }
          }
          
          if (!stillLoading) {
            resolve(true);
            return;
          }
        }
        
        // DOM'un tamamıyla yüklenmesini bekle (en fazla 5 saniye)
        let startCheckTime = Date.now();
        const maxWaitTime = 5000;
        
        const checkReady = () => {
          if (document.readyState === 'complete') {
            // Yine spinner kontrolü yap
            const loaders = document.querySelectorAll('.loading, .loader, .spinner, [class*="loading"]');
            let stillLoading = false;
            
            for (const loader of loaders) {
              const style = window.getComputedStyle(loader);
              if (style.display !== 'none' && style.visibility !== 'hidden') {
                stillLoading = true;
                break;
              }
            }
            
            if (!stillLoading) {
              resolve(true);
              return;
            }
          }
          
          // Zaman aşımı kontrolü
          if (Date.now() - startCheckTime > maxWaitTime) {
            resolve(false);
            return;
          }
          
          setTimeout(checkReady, 500);
        };
        
        setTimeout(checkReady, 500);
      });
    }).catch(error => {
      logger.warn(`Tam sayfa yükleme kontrolünde hata: ${error.message}`);
      return false; // Hata varsa yüklenme tamamlanmamış kabul et
    });
    
    // Eğer tam yüklenmediyse biraz daha bekle
    if (!isFullyLoaded) {
      logger.debug(`${site} henüz tam olarak yüklenmedi, ek süre bekleniyor...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      logger.debug(`${site} tam olarak yüklendi`);
    }
    
    // Yükleme süresini hesapla
    const loadTime = Date.now() - startTime;
    logger.info(`${site} sitesi ${loadTime/1000} saniyede yüklendi`);
    
    // İnsan davranışı simülasyonu (ayarlara göre)
    if (config.humanBehavior?.scroll || config.humanBehavior?.randomClicks || config.humanBehavior?.moveMouseRandomly) {
      try {
        // Ziyaret süresini artırıyoruz ve daha çeşitli insansı hareketler için ek parametreler ekliyoruz
        const siteVisitDuration = config.siteDuration || 30000; // Varsayılan 30 saniye
        logger.info(`${site} sitesinde insan davranışı simülasyonu başlatılıyor (${siteVisitDuration / 1000} saniye)...`);
        
        // waitForFullLoad: true ile sayfanın tam yüklenmesini beklemesini sağla
        await humanBehavior.simulateHumanBehaviorForDuration(
          page, 
          siteVisitDuration,
          {
            scroll: config.humanBehavior.scroll,
            randomClicks: config.humanBehavior.randomClicks,
            moveMouseRandomly: config.humanBehavior.moveMouseRandomly,
            waitForFullLoad: true,
            minActionDelay: 2000,  // Eylemler arası minimum bekleme (2 saniye)
            maxActionDelay: 6000   // Eylemler arası maksimum bekleme (6 saniye)
          }
        );
        
        logger.info(`${site} sitesinde insan davranışı simülasyonu tamamlandı`);
      } catch (behaviorError) {
        logger.warn(`İnsan davranışı simülasyonu hatası: ${behaviorError.message}`);
      }
    } else {
      // Sabit bekleme süresi (insan davranışı kapalıysa)
      const standardWait = config.siteDuration || 10000;
      logger.info(`${site} sitesinde ${standardWait / 1000} saniye bekleniyor...`);
      await new Promise(resolve => setTimeout(resolve, standardWait));
    }
    
    // Engelleme kontrolü
    const { checkPageBlocked } = applyBlockDetectionSettings(browser, page);
    
    // İlk başta URL ve başlık kontrolü yap
    const currentUrl = await page.url();
    const pageTitle = await page.title();
    const originalHostname = new URL(site).hostname.toLowerCase();
    const currentHostname = new URL(currentUrl).hostname.toLowerCase();
    
    // Popüler sitelerin beyaz listesi - bu siteler büyük olasılıkla engellenmeyecek
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
    
    // Site beyaz listede mi kontrol et
    const isWhitelisted = whitelistedDomains.some(domain => 
      originalHostname.includes(domain) || currentHostname.includes(domain)
    );
    
    // Yönlendirme ve engelleme belirtileri
    const isRedirected = currentUrl !== site && !currentUrl.includes(new URL(site).hostname);
    const suspiciousTitles = ['403', 'Forbidden', 'Access Denied', 'Blocked', 'Security Check'];
    const hasSuspiciousTitle = suspiciousTitles.some(title => pageTitle.includes(title));
    
    // Beyaz liste siteler için daha sıkı kontroller yap
    let isSiteBlocked = false;
    let blockReason = '';
    
    if (isWhitelisted) {
      // Beyaz listedeki siteler için, sadece kesin engelleme belirtileri varsa engellenmiş say
      // Captcha veya açık "engel" mesajları gibi
      const hasCaptcha = await page.evaluate(() => {
        const captchaElements = document.querySelectorAll(
          'iframe[src*="captcha"], iframe[src*="recaptcha"], div[class*="captcha"], div[id*="captcha"], #recaptcha'
        );
        return captchaElements.length > 0;
      });
      
      // Kesin engelleme metinleri kontrolü
      const hasBlockingText = await page.evaluate(() => {
        const visibleText = document.body.innerText.toLowerCase();
        const definitiveBlockPhrases = [
          'ip address has been blocked',
          'access to this site has been denied',
          'verify you are not a robot',
          'please complete the security check',
          'unusual traffic from your computer',
          'automated access to this site has been denied'
        ];
        
        for (const phrase of definitiveBlockPhrases) {
          if (visibleText.includes(phrase)) {
            return phrase;
          }
        }
        return false;
      });
      
      // Sadece kesin durumlarda engelleme olarak değerlendir
      if (hasCaptcha) {
        isSiteBlocked = true;
        blockReason = 'Captcha tespit edildi';
      } else if (hasBlockingText) {
        isSiteBlocked = true;
        blockReason = `Engelleme metni tespit edildi: "${hasBlockingText}"`;
      } else if (hasSuspiciousTitle && isRedirected) {
        // Şüpheli başlık VE yönlendirme varsa engellenmiş olarak işaretle
        isSiteBlocked = true;
        blockReason = `Şüpheli başlık ve yönlendirme: "${pageTitle}"`;
      } else {
        // Beyaz listedeki site için hiçbir kesin engel belirtisi yoksa ENGELLEME YOK
        isSiteBlocked = false;
      }
    } else {
      // Beyaz listede olmayan siteler için normal engelleme tespiti yap
      const isBlocked = await checkPageBlocked(site, loadTime);
      isSiteBlocked = isBlocked || (isRedirected && hasSuspiciousTitle);
      blockReason = isBlocked ? 'Block detector tespiti' : (isSiteBlocked ? 'Yönlendirme ve şüpheli başlık' : '');
    }
    
    // Ekran görüntüsü alma
    if (!isSiteBlocked) {
      try {
        const screenshotPath = await browser.screenshot(site);
        if (screenshotPath) {
          logger.info(`Ekran görüntüsü alındı: ${screenshotPath}`);
        }
      } catch (screenshotError) {
        logger.warn(`Ekran görüntüsü alınamadı: ${screenshotError.message}`);
      }
    }
    
    // Sonuç döndür
    return {
      success: !isSiteBlocked,
      isBlocked: isSiteBlocked,
      redirected: isRedirected,
      loadTime,
      reason: blockReason,
      message: isSiteBlocked ? `Site erişimi engellendi: ${blockReason}` : 'Başarılı'
    };
    
  } catch (error) {
    logger.error(`Sayfa yüklenirken hata oluştu (${error.message}): ${site}`);
    
    // Hata durumunda da engelleme olarak değerlendir
    return {
      success: false,
      isBlocked: true,
      message: error.message,
      loadTime: null
    };
  }
}

// Engelleme raporunu kaydetme
function saveBlockReport(report) {
  try {
    const blockReportsDir = path.join(config.logging?.logFilePath || 'logs', 'block_reports');
    
    // Dizin yoksa oluştur
    if (!fs.existsSync(blockReportsDir)) {
      fs.mkdirSync(blockReportsDir, { recursive: true });
    }
    
    // Tarih bazlı dosya adı
    const date = new Date();
    const fileName = `block_report_${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}.json`;
    const filePath = path.join(blockReportsDir, fileName);
    
    // Mevcut raporları oku veya yeni bir dizi oluştur
    let reports = [];
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      reports = JSON.parse(content);
    }
    
    // Yeni raporu ekle
    reports.push(report);
    
    // Dosyaya kaydet
    fs.writeFileSync(filePath, JSON.stringify(reports, null, 2), 'utf8');
    
    logger.debug(`Engelleme raporu kaydedildi: ${filePath}`);
  } catch (error) {
    logger.error(`Engelleme raporu kaydedilirken hata oluştu: ${error.message}`);
  }
}

// Site ziyaret işlemi
async function visitSites() {
  // Tarayıcı oturumunu başlat
  logger.debug(`Browser nesnesini oluşturuyor - headless: ${config.browser.headless ? 'true' : 'false'}`);
  
  const browser = new Browser({
    headless: config.browser.headless,
    slowMo: config.browser.slowMo,
    screenshotPath: config.logging.blockedScreenshotPath || './logs/screenshots',
    blockedScreenshotPath: config.logging.blockedScreenshotPath || './logs/blocked',
    httpsProxy: false,
    httpsProxyPort: 0
  });

  try {
    logger.debug('Tarayıcı başlatılıyor (launch fonksiyonu çağrılıyor)...');
    await browser.launch();
    const headlessStatus = await browser.isHeadless();
    logger.info(`Tarayıcı başlatıldı - Headless modu: ${headlessStatus ? 'Aktif (Gizli)' : 'Devre dışı (Görünür)'}`);
    
    // Kullanıcı ajanını al - Basitleştirilmiş versiyon
    let userAgent = null;
    if (config.browser.userAgentRotation) {
      userAgent = await browser.getRandomUserAgent();
      logger.info(`Kullanıcı ajanı ayarlandı: ${userAgent}`);
    }

    // Ziyaret istatistiklerini izlemek için sayaçlar
    let successCount = 0;
    let failedCount = 0;
    let blockedCount = 0;
    let skippedUrls = [];
    let blockedSites = [];
    let successfulSites = [];
    let failedSites = [];

    // Airbnb sitelerini filtreleme
    const filteredSites = config.sites.filter(site => {
      try {
        const url = new URL(site);
        const hostname = url.hostname.toLowerCase();
        
        // Airbnb sitelerini kontrol et ve filtrele
        if (hostname.includes('airbnb')) {
          logger.info(`Airbnb sitesi filtrelendi ve atlandı: ${site}`);
          skippedUrls.push({ url: site, reason: 'airbnb' });
          return false;
        }
        return true;
      } catch (error) {
        // Geçersiz URL'leri işle
        logger.error(`Geçersiz URL: ${site} - ${error.message}`);
        skippedUrls.push({ url: site, reason: 'invalid_url' });
        return false;
      }
    });

    logger.info(`Toplam ${config.sites.length} siteden ${filteredSites.length} tanesi ziyaret edilecek (${skippedUrls.length} site filtrelendi)`);

    // Her bir siteyi ziyaret et
    for (let i = 0; i < filteredSites.length; i++) {
      const site = filteredSites[i];
      logger.info(`[${i+1}/${filteredSites.length}] ${site} ziyaret ediliyor...`);

      // Tarayıcının durumunu kontrol et
      if (!browser.isBrowserOpen()) {
        logger.warn('Tarayıcı kapalı, yeniden başlatılıyor...');
        try {
          await browser.restart();
        } catch (restartError) {
          logger.error(`Tarayıcıyı yeniden başlatma hatası: ${restartError.message}`);
          // Kritik hata durumunda sonraki siteye geç
          continue;
        }
      }

      let siteWasBlocked = false;
      let visitResult = null;
      
      try {
        visitResult = await visitWebsite(browser, site, userAgent);
        
        if (visitResult.isBlocked) {
          logger.error(`${site} sitesinde engelleme tespit edildi. Neden: ${visitResult.reason || 'Bilinmeyen'}. Bu site atlaniyor ve sonraki siteye geçiliyor.`);
          blockedSites.push({
            url: site,
            reason: visitResult.reason || 'Bilinmeyen',
            timestamp: new Date().toISOString()
          });
          blockedCount++;
          siteWasBlocked = true;
        } else {
          successCount++;
          successfulSites.push(site);
        }
      } catch (error) {
        logger.error(`${site} sitesini ziyaret ederken hata oluştu: ${error.message}`);
        const screenshot = `error_${Date.now()}.png`;
        await takeErrorScreenshot(browser, screenshot);
        logger.debug(`Hata ekran görüntüsü kaydedildi: ${screenshot}`);
        
        // Hata durumunu kaydet
        failedCount++;
        failedSites.push(site);
        siteWasBlocked = true; // Hata durumunda da bloklama olarak kabul et
      }
      
      // Sonraki siteye geçmeden önce rastgele gecikme
      // Engellenen siteler için daha az, başarılı ziyaretler için daha çok bekleme süresi
      let waitTime;
      if (siteWasBlocked) {
        // Engellenen site için daha kısa bekleme süresi (5-10 saniye)
        waitTime = Math.floor(Math.random() * (10000 - 5000)) + 5000;
        logger.debug(`Engellenen siteden sonra kısa bekleme: ${waitTime / 1000} saniye`);
      } else {
        // Başarılı ziyaret için normal bekleme süresi
        waitTime = getRandomDelay(false);
        logger.debug(`Başarılı ziyaretten sonra normal bekleme: ${waitTime / 1000} saniye`);
      }
      
      logger.debug(`Bir sonraki siteye geçmeden önce ${waitTime / 1000} saniye bekleniyor...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // Ziyaret sonuçlarını logla
    logger.info('Site ziyaretleri tamamlandı:');
    logger.info(`✅ Başarılı: ${successCount}`);
    logger.info(`🚫 Engellenen: ${blockedCount}`);
    logger.info(`❌ Başarısız: ${failedCount}`);
    logger.info(`⏩ Filtrelenen: ${skippedUrls.length}`);
    
    if (skippedUrls.length > 0) {
      logger.info(`Filtrelenen siteler: ${skippedUrls.map(s => s.url).join(', ')}`);
    }
    
    // Tarayıcıyı kapat
    await browser.close();
    logger.info('Tarayıcı kapatıldı');
    
    return {
      success: successCount,
      blocked: blockedCount,
      failed: failedCount,
      skipped: skippedUrls.length,
      skippedUrls: skippedUrls.map(s => s.url),
      blockedSites: blockedSites,
      successfulSites: successfulSites,
      failedSites: failedSites
    };
    
  } catch (error) {
    logger.error(`Site ziyaretleri sırasında kritik hata: ${error.message}`);
    
    // Hata olsa bile tarayıcıyı kapatmaya çalış
    try {
      await browser.close();
      logger.info('Hata sonrası tarayıcı kapatıldı');
    } catch (closeError) {
      logger.error(`Tarayıcı kapatılamadı: ${closeError.message}`);
    }
    
    throw error;
  }
}

// config.json içindeki blockDetection ayarlarını kullan
const applyBlockDetectionSettings = (browser, page) => {
  // Engelleme tespiti kontrolü (blockDetection ayarları)
  if (config.blockDetection?.enabled === false) {
    logger.info('Engelleme tespiti devre dışı bırakıldı.');
    return { checkPageBlocked: async () => false };
  }
  
  // Ekran görüntüsü alma ayarı
  const takeScreenshot = config.blockDetection?.takeScreenshot !== false;
  
  // Yavaşlık eşiği ayarı
  const slowThreshold = config.blockDetection?.slowThreshold || 10000;
  
  logger.info(`Engelleme tespiti etkin. Ekran görüntüsü: ${takeScreenshot ? 'Etkin' : 'Devre dışı'}, Yavaşlık eşiği: ${slowThreshold}ms`);
  
  // Sayfa engelleme tespiti fonksiyonu
  const checkPageBlocked = async (url, loadTime) => {
    try {
      const slowPage = loadTime > slowThreshold;
      
      // Tarayıcının mevcut URL'sini al
      const currentUrl = await page.url();
      const expectedHostname = new URL(url).hostname.toLowerCase();
      const currentHostname = new URL(currentUrl).hostname.toLowerCase();
      
      // Sayfa başlığını al
      const title = await page.title();
      const lowerTitle = title.toLowerCase();
      
      // Sayfanın HTML içeriğini kontrol et
      const content = await page.content();
      const lowerContent = content.toLowerCase();
      
      // Bilinen popüler siteler için özel kurallar - bu siteler genellikle güvenli
      const popularSites = [
        'youtube.com', 'instagram.com', 'twitter.com', 'facebook.com', 
        'linkedin.com', 'reddit.com', 'netflix.com', 'twitch.tv', 
        'spotify.com', 'tiktok.com', 'pinterest.com'
      ];
      
      // Eğer popüler bir sitedeyiz ve başlık içeriği normal görünüyorsa, engelleme olarak işaretleme
      if (popularSites.some(site => currentHostname.includes(site))) {
        // Daha spesifik engelleme belirtileri kontrol et
        const definiteBlockSignals = [
          'access denied', 'forbidden', 'captcha required', 
          'security check', 'automated access', 'bot detected',
          'unusual traffic', 'ip address has been blocked'
        ];
        
        // Sadece açık ve net engelleme ifadeleri varsa engelleme olarak işaretle
        const isDefinitelyBlocked = definiteBlockSignals.some(signal => 
          lowerContent.includes(signal) && 
          lowerContent.indexOf(signal) < 5000 // Sadece sayfanın başında bu ifadeler geçiyorsa
        );
        
        // Instagram'da yanlış blok tespitini düzelt
        if (currentHostname.includes('instagram.com')) {
          // Instagram sayfası yüklendiyse ve normal içerik varsa (feed, login form vs.)
          if (lowerContent.includes('instagram') && 
              (lowerContent.includes('login') || 
               lowerContent.includes('sign up') || 
               lowerContent.includes('profile') || 
               lowerContent.includes('post') || 
               lowerContent.includes('feed'))) {
            logger.debug('Instagram sayfası normal yüklendi, engelleme yok.');
            return false;
          }
          
          // Sadece Instagram için çok belirgin engelleme durumlarında true döndür
          return isDefinitelyBlocked && (
            lowerContent.includes('challenge') || 
            lowerContent.includes('blocked for security') || 
            lowerContent.includes('confirm it\'s you')
          );
        }
        
        if (!isDefinitelyBlocked) {
          return false; // Popüler siteler için özel durumda engelleme yok kararı ver
        }
      }
      
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
      
      // Hostname eşleşiyor mu kontrol et
      const hostnameMatches = currentHostname.includes(expectedHostname) || 
                              expectedHostname.includes(currentHostname);
      
      // Eğer beklenen hostname ile mevcut hostname eşleşmiyorsa ve
      // yönlendirme içermeyen bir durumsa, bu bir engelleme olabilir
      let redirectBlock = false;
      if (!hostnameMatches &&
          !currentUrl.includes('redirect') && 
          !currentUrl.includes('login') && 
          !currentUrl.includes('auth')) {
        redirectBlock = true;
      }
      
      // Engel belirtilerini kontrol et
      let isBlocked = false;
      let blockReason = '';
      let blockScore = 0;
      
      for (const signal of blockSignals) {
        const checkValue = signal.type === 'title' ? lowerTitle : lowerContent;
        
        if (checkValue.includes(signal.value.toLowerCase())) {
          isBlocked = true;
          blockReason = signal.value;
          blockScore = signal.score;
          break;
        }
      }
      
      // Yavaş sayfayı da engelleme olarak işaretle ancak skorunu düşük tut
      // Popüler siteler için yavaşlama durumunu tamamen görmezden gel
      /* Yavaşlık tespiti devre dışı bırakıldı - yanlış pozitif tespitleri azaltmak için
      if (slowPage && !isBlocked && !popularSites.some(site => currentHostname.includes(site))) {
        isBlocked = true;
        blockReason = 'slow';
        blockScore = 0.4; // Yavaşlık daha düşük bir engelleme skoru
      }
      */
      
      // Yönlendirme durumunda engelleme tespit et (sadece eğer net bir durum ise)
      if (redirectBlock && !isBlocked) {
        isBlocked = true;
        blockReason = 'redirect';
        blockScore = 0.6;
      }
      
      // Engel tespit edildi
      if (isBlocked) {
        logger.warn(`${url} adresinde ${blockReason} tespit edildi. Neden: ${blockReason}`);
        
        // Ekran görüntüsü al (eğer etkinse)
        if (takeScreenshot) {
          await takeBlockedScreenshot(browser, url, blockReason, loadTime);
        }
        
        // Engel raporunu kaydet
        const blockReport = {
          url,
          timestamp: new Date().toISOString(),
          reason: blockReason,
          score: blockScore,
          loadTime,
          userAgent: await page.evaluate(() => navigator.userAgent)
        };
        
        saveBlockReport(blockReport);
        
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error(`Engel tespiti sırasında hata: ${error.message}`);
      return false;
    }
  };
  
  return { checkPageBlocked };
};

// Ana fonksiyon
const start = async () => {
  if (!config.schedule.enabled) {
    logger.info('Zamanlanmış çalışma kapalı, hemen başlatılıyor...');
    
    // Sonsuz mod kontrolü
    if (config.infiniteMode) {
      logger.info('Sonsuz mod etkin, sürekli çalışma modunda başlatılıyor...');
      
      // Sonsuz döngü oluştur
      const runInfiniteLoop = async () => {
        try {
          logger.info('Site ziyaretleri başlatılıyor...');
          const result = await visitSites();
          logger.info(`Döngü tamamlandı. Başarılı: ${result.success}, Engellenen: ${result.blocked}, Başarısız: ${result.failed}`);
          
          // Döngüler arasında bekleme süresi (2-5 dakika)
          const waitTime = Math.floor(Math.random() * (300000 - 120000)) + 120000;
          logger.info(`Bir sonraki döngü için ${Math.round(waitTime / 60000)} dakika bekleniyor...`);
          
          // Belirlenen süre sonra tekrar başlat
          setTimeout(runInfiniteLoop, waitTime);
        } catch (error) {
          logger.error(`Sonsuz döngüde hata: ${error.message}`);
          logger.info('5 dakika sonra tekrar deneniyor...');
          
          // Hata durumunda 5 dakika bekle ve tekrar dene
          setTimeout(runInfiniteLoop, 300000);
        }
      };
      
      // İlk çalıştırma
      runInfiniteLoop();
    } else {
      // Tek seferlik çalıştırma
      await visitSites();
    }
    return;
  }

  // Zamanlanmış çalışma
  const { startHour, startMinute, endHour, endMinute } = getScheduleTime();
  const days = config.schedule.days.map(day => day.slice(0, 3).toUpperCase()).join(',');
  
  // Her gün başlangıç saatinde çalıştır
  const startCron = new CronJob(`0 ${startMinute} ${startHour} * * ${days}`, async () => {
    logger.info('Zamanlanmış görev başlatılıyor...');
    
    // Sonsuz mod kontrolü
    if (config.infiniteMode) {
      logger.info('Sonsuz mod etkin. Çalışma saatleri boyunca düzenli aralıklarla çalışacak.');
      
      // İlk çalıştırma
      await visitSites();
      
      // Sonsuz mod için çalışma saatleri içinde düzenli çalışma
      const scheduleNext = async () => {
        try {
          // Şu anki saat çalışma saatleri içinde mi kontrol et
          const now = new Date();
          const currentHour = now.getHours();
          const currentMinute = now.getMinutes();
          
          // Saat dakika olarak şimdiki zaman ve bitiş zamanı
          const currentTimeMinutes = currentHour * 60 + currentMinute;
          const endTimeMinutes = endHour * 60 + endMinute;
          
          // Hala çalışma saatleri içindeyse
          if (currentTimeMinutes < endTimeMinutes) {
            // Bir sonraki döngü için bekleme süresi (15-30 dakika)
            const waitTime = Math.floor(Math.random() * (30 - 15 + 1) + 15) * 60000;
            logger.info(`Bir sonraki ziyaret için ${Math.round(waitTime / 60000)} dakika bekleniyor...`);
            
            // Belirlenen süre sonra tekrar başlat
            setTimeout(async () => {
              await visitSites();
              scheduleNext(); // Rekursif olarak tekrar planla
            }, waitTime);
          } else {
            logger.info('Çalışma saatleri dışına çıkıldı, sonsuz mod bugün için durduruldu.');
          }
        } catch (error) {
          logger.error(`Sonsuz döngüde hata: ${error.message}`);
          // Hata durumunda 5 dakika bekle ve tekrar dene
          setTimeout(scheduleNext, 300000);
        }
      };
      
      // İlk döngüden sonra sonraki döngüleri planla
      scheduleNext();
    } else {
      // Tek seferlik çalıştırma
      await visitSites();
    }
  });
  
  // Her gün bitiş saatinde durdur
  const endCron = new CronJob(`0 ${endMinute} ${endHour} * * ${days}`, () => {
    logger.info('Çalışma saatleri dışında, zamanlanmış görev durduruldu');
  });
  
  startCron.start();
  endCron.start();
  
  logger.info(`Bot başlatıldı. Çalışma saatleri: ${config.schedule.startTime} - ${config.schedule.endTime}, Günler: ${config.schedule.days.join(', ')}`);
  logger.info(`Sonsuz mod: ${config.infiniteMode ? 'Etkin (çalışma saatleri içinde düzenli aralıklarla çalışacak)' : 'Devre dışı (günde bir kez çalışacak)'}`);
};

// Uygulama başlangıcı
if (require.main === module) {
  start().catch(error => {
    logger.error('Uygulama çalışırken bir hata oluştu:', error);
    process.exit(1);
  });
}

module.exports = { start, visitSites };