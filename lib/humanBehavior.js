const logger = require('./logger');

// Rastgele bekleme süresi oluştur
const randomWait = async (min, max) => {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  await new Promise(resolve => setTimeout(resolve, delay));
  return delay;
};

// Sayfanın hazır olup olmadığını kontrol et
const isPageReady = async (page) => {
  try {
    // 1. document.readyState kontrolü
    const readyState = await page.evaluate(() => {
      return document.readyState;
    });
    
    if (readyState !== 'complete') {
      logger.debug(`Sayfa henüz yüklenmedi: readyState = ${readyState}`);
      return false;
    }
    
    // 2. Sayfa yükleme işaretleri kontrolü
    const loadingIndicators = await page.evaluate(() => {
      // Yükleme göstergeleri olabilecek elementleri ara
      const loaders = Array.from(document.querySelectorAll(
        '.loading, .loader, .spinner, [class*="loading"], [class*="loader"], [class*="spinner"], [id*="loading"], [id*="loader"], [id*="spinner"]'
      ));
      
      // Görünür olan yükleme göstergeleri var mı?
      const visibleLoaders = loaders.filter(el => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && 
               rect.height > 0 && 
               style.display !== 'none' && 
               style.visibility !== 'hidden' && 
               parseFloat(style.opacity) > 0;
      });
      
      return visibleLoaders.length > 0;
    });
    
    if (loadingIndicators) {
      logger.debug('Sayfada hala yükleme göstergeleri aktif');
      return false;
    }
    
    // 3. Sayfa stabil mi (DOM mutasyonları son bulmuş mu) kontrolü
    // DOM'da hala değişiklik olup olmadığını kontrol etmek için setTimeout kullan
    await page.evaluate(() => {
      return new Promise(resolve => {
        // Bir süre bekleyip DOM'da değişiklik olup olmadığını kontrol et
        let lastHTMLSize = document.documentElement.innerHTML.length;
        let checkInterval;
        
        // 500ms aralıklarla DOM'u kontrol et (toplam 2 saniye)
        checkInterval = setInterval(() => {
          const currentHTMLSize = document.documentElement.innerHTML.length;
          
          // DOM stabil hale geldi mi?
          if (currentHTMLSize === lastHTMLSize) {
            clearInterval(checkInterval);
            resolve();
          }
          
          lastHTMLSize = currentHTMLSize;
        }, 500);
        
        // En fazla 2 saniye bekle
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve();
        }, 2000);
      });
    });
    
    logger.debug('Sayfa tam olarak yüklendi ve stabil');
    return true;
  } catch (error) {
    logger.warn('Sayfa hazırlık kontrolü yapılamadı:', error);
    return false;
  }
};

// Sayfa üzerinde rastgele scroll yapma
const randomScroll = async (page) => {
  try {
    // Sayfanın hazır olup olmadığını kontrol et
    if (!await isPageReady(page)) {
      logger.debug('Sayfa hazır değil, scroll işlemi atlanıyor');
      return false;
    }
    
    // Sayfanın güvenli olup olmadığını kontrol et
    if (await isPageSafe(page) === false) {
      logger.debug('Sayfa güvenli değil, scroll işlemi atlanıyor');
      return false;
    }
    
    logger.debug('Sayfa üzerinde rastgele scroll yapılıyor...');
    
    // Sayfanın yüksekliğini al
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    
    // Rastgele scroll pozisyonları
    const scrollCount = Math.floor(Math.random() * 4) + 2; // 2-5 arası scroll
    
    for (let i = 0; i < scrollCount; i++) {
      // Rastgele bir pozisyona scroll yap
      const position = Math.floor(Math.random() * bodyHeight);
      await page.evaluate((pos) => {
        window.scrollTo({
          top: pos,
          behavior: 'smooth'
        });
      }, position);
      
      // Rastgele bir süre bekle (500ms - 2000ms arası)
      await randomWait(500, 2000);
    }
    
    // Sayfa başına dön
    await page.evaluate(() => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
    
    logger.debug('Scroll işlemi tamamlandı');
    return true;
  } catch (error) {
    logger.error('Scroll işlemi sırasında hata oluştu:', error);
    return false;
  }
};

// Fare imlecini rastgele hareket ettirme
const moveMouseRandomly = async (page) => {
  try {
    // Sayfanın hazır olup olmadığını kontrol et
    if (!await isPageReady(page)) {
      logger.debug('Sayfa hazır değil, fare hareketi atlanıyor');
      return false;
    }
    
    // Sayfanın güvenli olup olmadığını kontrol et
    if (await isPageSafe(page) === false) {
      logger.debug('Sayfa güvenli değil, fare hareketi atlanıyor');
      return false;
    }
    
    logger.debug('Fare imleci rastgele hareket ettiriliyor...');
    
    // Sayfanın boyutlarını al
    const dimensions = await page.evaluate(() => {
      return {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight
      };
    });
    
    // Rastgele hareket sayısı (3-8 arası)
    const moveCount = Math.floor(Math.random() * 6) + 3;
    
    for (let i = 0; i < moveCount; i++) {
      // Rastgele bir pozisyona hareket et
      const x = Math.floor(Math.random() * dimensions.width);
      const y = Math.floor(Math.random() * dimensions.height);
      
      await page.mouse.move(x, y);
      
      // Rastgele bir süre bekle (300ms - 1000ms arası)
      await randomWait(300, 1000);
    }
    
    logger.debug('Fare hareketi tamamlandı');
    return true;
  } catch (error) {
    logger.error('Fare hareketi sırasında hata oluştu:', error);
    return false;
  }
};

// Sayfada rastgele tıklamalar yapma (güvenli alanlara)
const randomClicks = async (page) => {
  try {
    // Sayfanın hazır olup olmadığını kontrol et
    if (!await isPageReady(page)) {
      logger.debug('Sayfa hazır değil, tıklama işlemi atlanıyor');
      return false;
    }
    
    // Sayfanın güvenli olup olmadığını kontrol et
    if (await isPageSafe(page) === false) {
      logger.debug('Sayfa güvenli değil, tıklama işlemi atlanıyor');
      return false;
    }
    
    logger.debug('Rastgele tıklama işlemi başlatılıyor...');
    
    // Tıklanabilir ve güvenli elementleri bul
    const clickableElements = await page.evaluate(() => {
      // Güvenli elementler (formlar, input alanları ve submit düğmeleri hariç)
      const elements = Array.from(document.querySelectorAll('a, button, div, span, li'))
        .filter(el => {
          // Form elementlerini ve tehlikeli elementleri filtrele
          const isFormElement = el.closest('form') !== null;
          const isInputOrButton = el.tagName === 'INPUT' || (el.tagName === 'BUTTON' && el.getAttribute('type') === 'submit');
          const hasHref = el.tagName === 'A' && el.getAttribute('href') && !el.getAttribute('href').startsWith('#') && !el.getAttribute('href').startsWith('javascript');
          const isNavigationLink = el.tagName === 'A' && (el.getAttribute('href') && (el.getAttribute('href').includes('http') || el.getAttribute('href').startsWith('/')));
          
          // Yalnızca görünür elementleri al
          const rect = el.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0;
          
          // Güvenli bölgede mi (vücudun ana alanı)?
          const isSafeArea = rect.top > 0 && rect.left > 0 && rect.top < window.innerHeight * 0.8 && rect.left < window.innerWidth * 0.8;
          
          // Tehlikeli metin içeriyor mu?
          const text = el.innerText.toLowerCase();
          const dangerousWords = ['login', 'logout', 'sign in', 'sign out', 'delete', 'remove', 'register', 'signup', 'submit', 'subscribe', 'cancel', 'payment', 'checkout', 'buy', 'purchase'];
          const isNotDangerous = !dangerousWords.some(word => text.includes(word));
          
          return !isFormElement && !isInputOrButton && !hasHref && !isNavigationLink && isVisible && isSafeArea && isNotDangerous;
        });
      
      // Her element için konum ve boyutlarını dön
      return elements.map(el => {
        const rect = el.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          width: rect.width,
          height: rect.height,
          tag: el.tagName.toLowerCase()
        };
      });
    });
    
    if (clickableElements.length === 0) {
      logger.debug('Tıklanabilir güvenli element bulunamadı');
      return false;
    }
    
    // Rastgele 1-2 element seç (daha az tıklama yapalım)
    const clickCount = Math.min(Math.floor(Math.random() * 2) + 1, clickableElements.length);
    
    for (let i = 0; i < clickCount; i++) {
      // Rastgele bir element seç
      const randomIndex = Math.floor(Math.random() * clickableElements.length);
      const element = clickableElements[randomIndex];
      
      // Elementin merkezine tıkla
      await page.mouse.click(element.x, element.y);
      logger.debug(`Tıklama yapıldı: ${element.tag} elementi [${element.x},${element.y}]`);
      
      // Rastgele bir süre bekle (1000ms - 2500ms arası)
      await randomWait(1000, 2500);
      
      // Sayfa hala mevcut mu kontrol et
      try {
        const isActive = await page.evaluate(() => true);
        if (!isActive) {
          logger.debug('Tıklama sonrası sayfa değişti, işlem sona eriyor');
          return true;
        }
        
        // Sayfa hala güvenli mi kontrol et
        if (await isPageSafe(page) === false) {
          logger.debug('Tıklama sonrası sayfa güvenli değil, işlem sona eriyor');
          return false;
        }
      } catch (e) {
        logger.debug('Tıklama sonrası sayfa durumu kontrol edilemiyor');
        return false;
      }
    }
    
    logger.debug('Rastgele tıklama işlemi tamamlandı');
    return true;
  } catch (error) {
    logger.error('Rastgele tıklama işlemi sırasında hata oluştu:', error);
    return false;
  }
};

/**
 * Sayfanın insan davranışları için uygun olup olmadığını kontrol eder
 * @param {Object} page - Puppeteer Page nesnesi
 * @returns {Promise<boolean>} Sayfa uygun mu
 */
async function isPageSafe(page) {
  try {
    // Sayfanın yüklenip yüklenmediğini kontrol et
    const isLoaded = await isPageReady(page);
    
    if (!isLoaded) {
      logger.debug('Sayfa tam olarak yüklenmedi, güvenli kabul edilmiyor');
      return false;
    }
    
    // Sayfa başlığının engelleme içermediğini kontrol et
    const title = await page.title();
    // Kesin engellenme belirten başlıklar
    const definiteBlockedTitles = ['Access Denied', 'Forbidden', '403', 'Access blocked'];
    // Şüpheli olabilecek başlıklar
    const suspiciousTitles = ['Security Check', 'Captcha', 'Robot'];
    
    // Kesin engellenme durumu
    const isDefinitelyBlocked = definiteBlockedTitles.some(blockedTitle => 
      title.toLowerCase().includes(blockedTitle.toLowerCase())
    );
    
    if (isDefinitelyBlocked) {
      logger.debug(`Engellenme tespit edildi, başlık: "${title}"`);
      return false;
    }
    
    // Şüpheli başlık varsa, içeriği daha detaylı kontrol et
    const hasSuspiciousTitle = suspiciousTitles.some(blockedTitle => 
      title.toLowerCase().includes(blockedTitle.toLowerCase())
    );
    
    // Kesin engelleme belirtileri içerikte kontrol et
    const hasDefiniteBlockingContent = await page.evaluate(() => {
      // Sadece sayfanın görünür metnini kontrol et, gizli elementleri alma
      const visibleTextNodes = Array.from(document.querySelectorAll('body *'))
        .filter(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && 
                 style.visibility !== 'hidden' && 
                 parseFloat(style.opacity) > 0;
        })
        .map(el => el.innerText)
        .join(' ')
        .toLowerCase();
      
      // Kesin engelleme belirtileri
      const definiteBlockingTerms = [
        'ip address has been blocked',
        'access to this site has been denied',
        'automated access to this site has been denied',
        'please verify you are human',
        'we have detected unusual activity',
        'we need to verify that you are not a robot'
      ];
      
      return definiteBlockingTerms.some(term => visibleTextNodes.includes(term));
    });
    
    if (hasDefiniteBlockingContent) {
      logger.debug('Sayfa içeriğinde kesin engelleme belirtileri bulundu');
      return false;
    }
    
    // Eğer şüpheli başlığımız varsa daha detaylı içerik kontrolü yapalım
    if (hasSuspiciousTitle) {
      // Sayfada captcha elementi var mı kontrol et
      const hasCaptcha = await page.evaluate(() => {
        // Captcha olabilecek elementleri kontrol et
        const captchaElements = document.querySelectorAll(
          'iframe[src*="captcha"], iframe[src*="recaptcha"], div[class*="captcha"], div[id*="captcha"], #recaptcha, .recaptcha, .g-recaptcha'
        );
        return captchaElements.length > 0;
      });
      
      if (hasCaptcha) {
        logger.debug('Sayfada captcha elementi tespit edildi');
        return false;
      }
    }
    
    // Tüm kontrollerden geçti, sayfa güvenli kabul edilebilir
    return true;
  } catch (error) {
    logger.error(`Sayfa güvenliği kontrol edilemedi: ${error.message}`);
    return false;
  }
}

/**
 * Belirli bir süre boyunca sayfada insan davranışlarını simüle eder
 * @param {Object} page - Puppeteer sayfa nesnesi
 * @param {number} duration - Simülasyon süresi (ms cinsinden)
 * @param {Object} options - Davranış seçenekleri
 * @returns {Promise<boolean>} İşlem başarılı oldu mu?
 */
const simulateHumanBehaviorForDuration = async (page, duration, options = {}) => {
  const startTime = Date.now();
  const endTime = startTime + duration;
  
  // Varsayılan seçenekler
  const settings = {
    scroll: options.scroll !== false,
    randomClicks: options.randomClicks !== false,
    moveMouseRandomly: options.moveMouseRandomly !== false,
    minActionDelay: options.minActionDelay || 3000,
    maxActionDelay: options.maxActionDelay || 8000,
    waitForFullLoad: options.waitForFullLoad !== false
  };
  
  logger.info(`İnsan davranışı simülasyonu başlatılıyor (${duration / 1000} saniye)`);
  
  try {
    // Sayfa tam olarak yüklensin mi bekleyelim
    if (settings.waitForFullLoad) {
      logger.debug('Sayfanın tam olarak yüklenmesi bekleniyor...');
      
      // Sayfa yüklenene kadar bekle (maksimum 10 saniye)
      let isReady = false;
      let retryCount = 0;
      const maxRetries = 20; // 20 * 500ms = 10 saniye
      
      while (!isReady && retryCount < maxRetries) {
        isReady = await isPageReady(page);
        if (!isReady) {
          retryCount++;
          await randomWait(400, 600); // 500ms civarında bekle
        }
      }
      
      if (isReady) {
        logger.debug(`Sayfa ${retryCount * 500}ms sonra tam olarak yüklendi`);
      } else {
        logger.warn('Sayfa 10 saniye içinde tam olarak yüklenemedi, sınırlı davranış uygulanacak');
      }
    }
    
    // Sayfanın güvenli olup olmadığını kontrol et
    const isSafe = await isPageSafe(page);
    if (!isSafe) {
      logger.warn('Sayfa güvenli değil, insan davranışları atlanıyor');
      return false;
    }
    
    while (Date.now() < endTime) {
      // Rastgele bir davranış seç
      const behaviors = [];
      
      if (settings.scroll) behaviors.push('scroll');
      if (settings.randomClicks) behaviors.push('click');
      if (settings.moveMouseRandomly) behaviors.push('mouse');
      
      if (behaviors.length === 0) {
        logger.debug('Etkin davranış seçeneği yok, sadece bekleniyor');
        await randomWait(1000, 2000);
        continue;
      }
      
      // Rastgele bir davranış seç
      const randomBehavior = behaviors[Math.floor(Math.random() * behaviors.length)];
      
      // Seçilen davranışı uygula
      switch (randomBehavior) {
        case 'scroll':
          await randomScroll(page);
          break;
        case 'click':
          await randomClicks(page);
          break;
        case 'mouse':
          await moveMouseRandomly(page);
          break;
      }
      
      // Her işlem arasında rastgele bekle
      const timeLeft = endTime - Date.now();
      if (timeLeft <= 0) break;
      
      // Kalan süre, maksimum bekleme süresinden azsa ona göre ayarla
      const maxDelay = Math.min(settings.maxActionDelay, timeLeft);
      if (maxDelay < settings.minActionDelay) break;
      
      const delay = await randomWait(settings.minActionDelay, maxDelay);
      logger.debug(`Bir sonraki işlem için ${delay / 1000} saniye bekleniyor...`);
    }
    
    logger.info(`İnsan davranışı simülasyonu tamamlandı (${(Date.now() - startTime) / 1000} saniye)`);
    return true;
  } catch (error) {
    logger.error(`İnsan davranışı simülasyonu sırasında hata: ${error.message}`);
    return false;
  }
};

module.exports = {
  randomWait,
  randomScroll,
  moveMouseRandomly,
  randomClicks,
  simulateHumanBehaviorForDuration,
  isPageSafe
};