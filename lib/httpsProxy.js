const mitmproxy = require('http-mitm-proxy');
const fs = require('fs');
const path = require('path');
const tls = require('tls');
const logger = require('./logger');

/**
 * HTTPS Proxy yönetim sınıfı
 * 
 * HTTPS trafiğini yakalayıp içeriğe erişmeyi sağlar,
 * Man-in-the-Middle (MITM) proxy oluşturur
 */
class HttpsProxy {
  constructor(options = {}) {
    this.enabled = options.enabled || false;
    this.port = options.port || 8080;
    this.logPath = options.logPath || './logs/https';
    this.serverRunning = false;
    this.proxy = null;
    this.capturedSessions = [];
    this.certsPath = path.join(__dirname, '..', 'certs');
    
    // Proxy yapılandırması
    this.proxyOptions = {
      port: this.port,
      host: '127.0.0.1',
      keepAlive: true,
      timeout: 60000,
      sslCaDir: this.certsPath
    };
    
    // Log dizini oluştur
    this.ensureDirectories();
  }
  
  ensureDirectories() {
    try {
      if (!fs.existsSync(this.certsPath)) {
        fs.mkdirSync(this.certsPath, { recursive: true });
        logger.debug(`Sertifika dizini oluşturuldu: ${this.certsPath}`);
      }
      
      if (!fs.existsSync(this.logPath)) {
        fs.mkdirSync(this.logPath, { recursive: true });
        logger.debug(`HTTPS log dizini oluşturuldu: ${this.logPath}`);
      }
    } catch (error) {
      logger.error(`Dizin oluşturulurken hata: ${error.message}`);
    }
  }
  
  /**
   * Proxy sunucusunu başlatır
   * @returns {Promise<boolean>} Başarı durumu
   */
  async start() {
    if (!this.enabled) {
      logger.info('HTTPS proxy etkin değil, başlatılmadı');
      return false;
    }
    
    if (this.serverRunning) {
      logger.info('HTTPS proxy zaten çalışıyor');
      return true;
    }
    
    try {
      logger.info(`HTTPS proxy başlatılıyor (port: ${this.port})...`);
      
      // Sertifika dizini oluştur
      this.ensureDirectories();
      
      // Proxy sunucusunu oluştur
      this.proxy = mitmproxy();
      
      // Proxy olaylarını dinle ve logla
      this.setupProxyListeners();
      
      // Proxy'yi başlat
      await new Promise((resolve, reject) => {
        try {
          this.proxy.listen(this.proxyOptions, (err) => {
            if (err) {
              logger.error(`HTTPS proxy başlatılamadı: ${err.message}`);
              reject(err);
            } else {
              logger.info(`HTTPS proxy başlatıldı (port: ${this.port})`);
              this.serverRunning = true;
              resolve();
            }
          });
        } catch (error) {
          reject(error);
        }
      });
      
      return true;
    } catch (error) {
      logger.error(`HTTPS proxy başlatma hatası: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Proxy olaylarını dinler ve loglar
   */
  setupProxyListeners() {
    // HTTP İsteği
    this.proxy.onRequest((ctx, callback) => {
      const session = {
        id: Date.now().toString(36) + Math.random().toString(36).substring(2),
        timestamp: new Date().toISOString(),
        url: ctx.clientToProxyRequest.url,
        method: ctx.clientToProxyRequest.method,
        headers: ctx.clientToProxyRequest.headers,
        protocol: ctx.isSSL ? 'https' : 'http',
        host: ctx.clientToProxyRequest.headers.host,
        path: ctx.clientToProxyRequest.url,
        requestBody: null,
        responseHeaders: null,
        responseBody: null,
        responseStatus: null
      };
      
      this.capturedSessions.push(session);
      
      logger.debug(`[HTTPS PROXY] İstek: ${session.method} ${session.protocol}://${session.host}${session.path}`);
      
      // İstek tamamlandığında
      ctx.onRequestData((ctx, chunk, callback) => {
        if (!session.requestBody) session.requestBody = '';
        session.requestBody += chunk.toString('utf8');
        return callback(null, chunk);
      });
      
      // Yanıt alındığında
      ctx.onResponse((ctx, callback) => {
        session.responseHeaders = ctx.serverToProxyResponse.headers;
        session.responseStatus = ctx.serverToProxyResponse.statusCode;
        
        logger.debug(`[HTTPS PROXY] Yanıt: ${session.responseStatus} ${session.protocol}://${session.host}${session.path}`);
        return callback();
      });
      
      // Yanıt verisi alındığında
      ctx.onResponseData((ctx, chunk, callback) => {
        if (!session.responseBody) session.responseBody = '';
        
        try {
          session.responseBody += chunk.toString('utf8');
        } catch (e) {
          session.responseBody += '[Binary data]';
        }
        
        return callback(null, chunk);
      });
      
      // Yanıt tamamlandığında
      ctx.onResponseEnd((ctx, callback) => {
        this.saveSession(session);
        return callback();
      });
      
      return callback();
    });
    
    // Proxy hatası 
    this.proxy.onError((ctx, err) => {
      logger.error(`[HTTPS PROXY] Hata: ${err.message}`);
    });
    
    // Connect isteği
    this.proxy.onConnect((req, socket, head, callback) => {
      logger.debug(`[HTTPS PROXY] Connect: ${req.url}`);
      return callback();
    });
  }
  
  /**
   * Yakalanan oturumu disk'e kaydeder
   * @param {Object} session Yakalanan HTTPS oturumu
   */
  saveSession(session) {
    try {
      // Sadece başarılı oturumları kaydet
      if (!session.responseStatus) return;
      
      const hostname = session.host.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `https_${hostname}_${session.id}.json`;
      const filePath = path.join(this.logPath, filename);
      
      fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
      logger.debug(`HTTPS oturumu kaydedildi: ${filePath}`);
    } catch (error) {
      logger.error(`HTTPS oturumu kaydedilemedi: ${error.message}`);
    }
  }
  
  /**
   * Proxy sunucusunu durdurur
   */
  stop() {
    if (!this.serverRunning || !this.proxy) {
      logger.debug('HTTPS proxy zaten durdurulmuş veya çalışmıyor');
      return true;
    }
    
    try {
      this.proxy.close();
      logger.info('HTTPS proxy durduruldu');
      this.serverRunning = false;
      return true;
    } catch (error) {
      logger.error(`HTTPS proxy durdurulurken hata: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Puppeteer için proxy ayarlarını döndürür
   * @returns {Object} Proxy ayarları
   */
  getPuppeteerArgs() {
    if (!this.enabled) return [];
    
    return [
      `--proxy-server=127.0.0.1:${this.port}`,
      '--ignore-certificate-errors'
    ];
  }
  
  /**
   * Tüm yakalanan oturumları listeler
   * @returns {Array} Oturum listesi
   */
  async getSessionsList() {
    try {
      this.ensureDirectories();
      
      const files = fs.readdirSync(this.logPath)
        .filter(file => file.startsWith('https_') && file.endsWith('.json'))
        .map(file => {
          const filePath = path.join(this.logPath, file);
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
      logger.error(`HTTPS oturum listesi alınırken hata: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Belirli bir oturumun içeriğini döndürür
   * @param {string} sessionFile Oturum dosya adı
   * @returns {Object|null} Oturum içeriği
   */
  getSessionContent(sessionFile) {
    try {
      const filePath = path.join(this.logPath, sessionFile);
      
      if (!fs.existsSync(filePath)) {
        logger.warn(`HTTPS oturumu bulunamadı: ${filePath}`);
        return null;
      }
      
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      logger.error(`HTTPS oturumu okunurken hata: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Belirli bir oturumu siler
   * @param {string} sessionFile Oturum dosya adı
   * @returns {boolean} Başarı durumu
   */
  deleteSession(sessionFile) {
    try {
      const filePath = path.join(this.logPath, sessionFile);
      
      if (!fs.existsSync(filePath)) {
        logger.warn(`Silinecek HTTPS oturumu bulunamadı: ${filePath}`);
        return false;
      }
      
      fs.unlinkSync(filePath);
      logger.info(`HTTPS oturumu silindi: ${sessionFile}`);
      return true;
    } catch (error) {
      logger.error(`HTTPS oturumu silinirken hata: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Yakalanan oturumları rapor olarak kaydeder
   * @param {string} targetSite Belirli bir site için rapor (opsiyonel)
   * @returns {string|null} Rapor dosya yolu
   */
  async generateReport(targetSite = null) {
    try {
      const sessions = await this.getSessionsList();
      
      if (sessions.length === 0) {
        logger.warn('Rapor oluşturmak için HTTPS oturumu bulunamadı');
        return null;
      }
      
      let filteredSessions = sessions;
      if (targetSite) {
        const siteEncoded = targetSite.replace(/[^a-zA-Z0-9]/g, '_');
        filteredSessions = sessions.filter(session => session.name.includes(siteEncoded));
      }
      
      if (filteredSessions.length === 0) {
        logger.warn(`"${targetSite}" için HTTPS oturumu bulunamadı`);
        return null;
      }
      
      // Tüm oturumları oku
      const sessionsData = filteredSessions.map(session => {
        try {
          return JSON.parse(fs.readFileSync(session.path, 'utf8'));
        } catch (e) {
          return null;
        }
      }).filter(Boolean);
      
      // Rapor oluştur
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const siteSuffix = targetSite ? `_${targetSite.replace(/[^a-zA-Z0-9]/g, '_')}` : '';
      const filename = `https_report_${timestamp}${siteSuffix}.json`;
      const filePath = path.join(this.logPath, filename);
      
      const report = {
        timestamp: new Date().toISOString(),
        targetSite: targetSite,
        totalSessions: sessionsData.length,
        sessions: sessionsData
      };
      
      fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
      logger.info(`HTTPS raporu oluşturuldu: ${filePath}`);
      
      return filePath;
    } catch (error) {
      logger.error(`HTTPS raporu oluşturulurken hata: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Kurulum talimatları gösterir
   * @returns {string} Kurulum talimatları
   */
  getSetupInstructions() {
    return `
HTTPS Proxy Kurulum Talimatları:
--------------------------------
1. Öncelikle gerekli paketi yükleyin:
   npm install http-mitm-proxy

2. Sertifika güvenini yapılandırın:
   - Sertifika dizini: ${this.certsPath}
   - Bu dizinde oluşturulan CA.crt dosyasını sisteminize güvenilir olarak ekleyin.
   
3. Chrome'a özel argümanlar:
   ${this.getPuppeteerArgs().join('\n   ')}

NOT: HTTPS proxy yerel ağda çalışır (127.0.0.1:${this.port}).
     Bu proxy sadece test amaçlıdır, güvenlik duvarı yapılandırmanızı kontrol edin.
`;
  }
}

module.exports = HttpsProxy;