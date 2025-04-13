const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * User-Agent rotasyonu yönetim sınıfı
 * 
 * Farklı tarayıcı/cihaz/işletim sistemleri için User-Agent'ları yönetir
 * Rastgele veya belirli bir stratejiye göre User-Agent rotasyonu sağlar
 */
class UserAgentManager {
  constructor(options = {}) {
    this.enabled = options.enabled || false;
    this.rotationStrategy = options.rotationStrategy || 'random'; // 'random', 'sequential', 'smart'
    this.currentIndex = 0;
    this.userAgents = {
      // Masaüstü tarayıcıları
      desktop: {
        chrome: [
          // Chrome - Windows
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
          // Chrome - macOS
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Macintosh; Apple Mac OS X 14_0_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ],
        firefox: [
          // Firefox - Windows
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:119.0) Gecko/20100101 Firefox/119.0',
          // Firefox - macOS
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0',
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:119.0) Gecko/20100101 Firefox/119.0',
        ],
        safari: [
          // Safari - macOS
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
        ],
        edge: [
          // Edge - Windows
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
          // Edge - macOS
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        ]
      },
      // Mobil cihazlar
      mobile: {
        android: [
          // Android - Chrome
          'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
          'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
          'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
        ],
        ios: [
          // iOS - Safari
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
          'Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        ]
      },
      // Özel tarayıcılar
      special: {
        // Bot olmayan özel tarayıcılar
        other: [
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0',
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Vivaldi/6.5.3206.48',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Brave/119.0.0.0'
        ]
      }
    };
    
    // Özel User-Agent dosyası
    this.userAgentFile = options.userAgentFile || path.join(__dirname, '..', 'data', 'user-agents.json');
    
    // Özel dosya varsa, yükle
    this.loadCustomUserAgents();
    
    // Kullanılabilir tüm User-Agent'ları düzleştir
    this.allUserAgents = this.flattenUserAgents();
    
    logger.debug(`User-Agent Manager başlatıldı, ${this.allUserAgents.length} adet User-Agent mevcut`);
  }
  
  /**
   * Özel User-Agent dosyasını yükler
   */
  loadCustomUserAgents() {
    try {
      // data klasörünü kontrol et ve oluştur
      const dataDir = path.dirname(this.userAgentFile);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      // Dosya varsa yükle
      if (fs.existsSync(this.userAgentFile)) {
        const customUserAgents = JSON.parse(fs.readFileSync(this.userAgentFile, 'utf8'));
        
        // Özel User-Agent'ları ekle
        if (customUserAgents.desktop) {
          Object.keys(customUserAgents.desktop).forEach(browser => {
            if (!this.userAgents.desktop[browser]) {
              this.userAgents.desktop[browser] = [];
            }
            this.userAgents.desktop[browser].push(...customUserAgents.desktop[browser]);
          });
        }
        
        if (customUserAgents.mobile) {
          Object.keys(customUserAgents.mobile).forEach(platform => {
            if (!this.userAgents.mobile[platform]) {
              this.userAgents.mobile[platform] = [];
            }
            this.userAgents.mobile[platform].push(...customUserAgents.mobile[platform]);
          });
        }
        
        if (customUserAgents.special) {
          Object.keys(customUserAgents.special).forEach(category => {
            if (!this.userAgents.special[category]) {
              this.userAgents.special[category] = [];
            }
            this.userAgents.special[category].push(...customUserAgents.special[category]);
          });
        }
        
        logger.info(`Özel User-Agent dosyası başarıyla yüklendi: ${this.userAgentFile}`);
      } else {
        // İlk çalıştırmada örnek bir dosya oluştur
        this.saveCustomUserAgents({
          desktop: {
            custom: [
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 (Özel User-Agent)',
            ]
          },
          mobile: {
            custom: [
              'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 (Özel User-Agent)',
            ]
          }
        });
      }
    } catch (error) {
      logger.error(`Özel User-Agent dosyası yüklenirken hata oluştu: ${error.message}`);
    }
  }
  
  /**
   * Özel User-Agent'ları dosyaya kaydeder
   */
  saveCustomUserAgents(customAgents) {
    try {
      fs.writeFileSync(this.userAgentFile, JSON.stringify(customAgents, null, 2), 'utf8');
      logger.info(`Özel User-Agent dosyası kaydedildi: ${this.userAgentFile}`);
      return true;
    } catch (error) {
      logger.error(`Özel User-Agent dosyası kaydedilirken hata oluştu: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Tüm User-Agent'ları tek bir düz liste haline getirir
   */
  flattenUserAgents() {
    const allAgents = [];
    
    // Masaüstü
    Object.values(this.userAgents.desktop).forEach(browserAgents => {
      allAgents.push(...browserAgents);
    });
    
    // Mobil
    Object.values(this.userAgents.mobile).forEach(platformAgents => {
      allAgents.push(...platformAgents);
    });
    
    // Özel
    Object.values(this.userAgents.special).forEach(categoryAgents => {
      allAgents.push(...categoryAgents);
    });
    
    return allAgents;
  }
  
  /**
   * Bir sonraki User-Agent'ı seçer
   * @param {string} type - Cihaz türü: 'desktop', 'mobile', 'any'
   * @param {string} specific - Belirli bir tarayıcı/platform: 'chrome', 'android' vb.
   * @returns {string} Seçilen User-Agent
   */
  getNext(type = 'any', specific = null) {
    if (!this.enabled) {
      return null; // Devre dışıysa null döner
    }
    
    let candidates = [];
    
    // Cihaz tipine göre adayları belirle
    if (type === 'desktop' && specific) {
      // Belirli bir masaüstü tarayıcısı istendiyse
      candidates = this.userAgents.desktop[specific] || [];
    } else if (type === 'desktop') {
      // Herhangi bir masaüstü tarayıcısı
      Object.values(this.userAgents.desktop).forEach(agents => {
        candidates.push(...agents);
      });
    } else if (type === 'mobile' && specific) {
      // Belirli bir mobil platform
      candidates = this.userAgents.mobile[specific] || [];
    } else if (type === 'mobile') {
      // Herhangi bir mobil platform
      Object.values(this.userAgents.mobile).forEach(agents => {
        candidates.push(...agents);
      });
    } else {
      // Herhangi bir User-Agent
      candidates = this.allUserAgents;
    }
    
    if (candidates.length === 0) {
      logger.warn(`Uygun User-Agent bulunamadı (tip: ${type}, spesifik: ${specific})`);
      return null;
    }
    
    let selectedAgent;
    
    // Rotasyon stratejisine göre seç
    if (this.rotationStrategy === 'random') {
      // Rastgele seçim
      const randomIndex = Math.floor(Math.random() * candidates.length);
      selectedAgent = candidates[randomIndex];
    } else if (this.rotationStrategy === 'sequential') {
      // Sıralı seçim
      this.currentIndex = (this.currentIndex + 1) % candidates.length;
      selectedAgent = candidates[this.currentIndex];
    } else if (this.rotationStrategy === 'smart') {
      // Akıllı seçim: Siteye göre uygun bir User-Agent seç
      // Şimdilik sadece rastgele seçim yapıyor, ileride geliştirilebilir
      const randomIndex = Math.floor(Math.random() * candidates.length);
      selectedAgent = candidates[randomIndex];
    }
    
    logger.debug(`Seçilen User-Agent: ${selectedAgent}`);
    return selectedAgent;
  }
  
  /**
   * User-Agent'ı siteye uygun şekilde akıllıca seçer
   * @param {string} url - Ziyaret edilecek URL
   * @returns {string} Seçilen User-Agent
   */
  getSmartUserAgent(url) {
    if (!this.enabled || !url) {
      return null;
    }
    
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      
      // Siteye göre platform tahmini yap
      let deviceType = 'desktop';
      let specific = null;
      
      // Mobil sitelere mobil User-Agent gönder
      if (hostname.includes('m.') || hostname.startsWith('mobile.')) {
        deviceType = 'mobile';
      }
      
      // Tarayıcıya özgü sitelere uygun User-Agent gönder
      if (hostname.includes('chrome')) {
        specific = 'chrome';
      } else if (hostname.includes('firefox') || hostname.includes('mozilla')) {
        specific = 'firefox';
      } else if (hostname.includes('safari') || hostname.includes('apple')) {
        if (deviceType === 'mobile') {
          specific = 'ios';
        } else {
          specific = 'safari';
        }
      }
      
      // Mobil-desktop arası karışık seçim yapma olasılığı
      // Mobil cihazlara bazen masaüstü User-Agent göndererek daha zengin içerik al
      if (Math.random() > 0.8) {
        deviceType = deviceType === 'mobile' ? 'desktop' : 'mobile';
      }
      
      return this.getNext(deviceType, specific);
    } catch (error) {
      logger.error(`Akıllı User-Agent seçiminde hata: ${error.message}`);
      return this.getNext(); // Hata durumunda herhangi bir User-Agent döndür
    }
  }
  
  /**
   * User-Agent listesi ekler/günceller
   * @param {Object} newAgents - Eklenecek yeni User-Agent'lar
   * @returns {boolean} Başarı durumu
   */
  addUserAgents(newAgents) {
    try {
      let customAgents = {};
      
      // Mevcut dosyayı yükle
      if (fs.existsSync(this.userAgentFile)) {
        customAgents = JSON.parse(fs.readFileSync(this.userAgentFile, 'utf8'));
      }
      
      // Yeni User-Agent'ları ekle
      Object.keys(newAgents).forEach(category => {
        if (!customAgents[category]) {
          customAgents[category] = {};
        }
        
        Object.keys(newAgents[category]).forEach(subcategory => {
          if (!customAgents[category][subcategory]) {
            customAgents[category][subcategory] = [];
          }
          
          // Yeni User-Agent'lar ekle (tekrarı önle)
          newAgents[category][subcategory].forEach(agent => {
            if (!customAgents[category][subcategory].includes(agent)) {
              customAgents[category][subcategory].push(agent);
            }
          });
        });
      });
      
      // Kaydet ve yeniden yükle
      if (this.saveCustomUserAgents(customAgents)) {
        this.loadCustomUserAgents();
        this.allUserAgents = this.flattenUserAgents();
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error(`User-Agent eklenirken hata: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Tüm User-Agent'ların sayısını döndürür
   */
  getStats() {
    const desktopCount = Object.values(this.userAgents.desktop).reduce((sum, agents) => sum + agents.length, 0);
    const mobileCount = Object.values(this.userAgents.mobile).reduce((sum, agents) => sum + agents.length, 0);
    const specialCount = Object.values(this.userAgents.special).reduce((sum, agents) => sum + agents.length, 0);
    
    return {
      total: this.allUserAgents.length,
      desktop: desktopCount,
      mobile: mobileCount,
      special: specialCount,
      enabled: this.enabled,
      strategy: this.rotationStrategy
    };
  }
  
  /**
   * User-Agent kategorilerini ve sayılarını detaylı olarak döndürür
   */
  getDetailedStats() {
    const stats = {
      desktop: {},
      mobile: {},
      special: {}
    };
    
    // Masaüstü istatistikleri
    Object.keys(this.userAgents.desktop).forEach(browser => {
      stats.desktop[browser] = this.userAgents.desktop[browser].length;
    });
    
    // Mobil istatistikleri
    Object.keys(this.userAgents.mobile).forEach(platform => {
      stats.mobile[platform] = this.userAgents.mobile[platform].length;
    });
    
    // Özel istatistikleri
    Object.keys(this.userAgents.special).forEach(category => {
      stats.special[category] = this.userAgents.special[category].length;
    });
    
    return stats;
  }
  
  /**
   * Rotasyon stratejisini değiştirir
   * @param {string} strategy - Yeni strateji: 'random', 'sequential', 'smart'
   */
  setRotationStrategy(strategy) {
    const validStrategies = ['random', 'sequential', 'smart'];
    
    if (validStrategies.includes(strategy)) {
      this.rotationStrategy = strategy;
      logger.info(`User-Agent rotasyon stratejisi değiştirildi: ${strategy}`);
      return true;
    }
    
    logger.warn(`Geçersiz rotasyon stratejisi: ${strategy}`);
    return false;
  }
  
  /**
   * User-Agent rotasyonu etkin mi kontrolü
   * @returns {boolean} Etkinlik durumu
   */
  isEnabled() {
    return this.enabled === true;
  }
  
  /**
   * User-Agent rotasyonunu etkinleştirir/devre dışı bırakır
   * @param {boolean} status - Etkinleştirme durumu
   */
  setEnabled(status) {
    this.enabled = status === true;
    logger.info(`User-Agent rotasyonu ${this.enabled ? 'etkinleştirildi' : 'devre dışı bırakıldı'}`);
    return this.enabled;
  }
}

module.exports = UserAgentManager;