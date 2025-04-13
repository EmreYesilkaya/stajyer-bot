const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * HTTP/HTTPS trafik izleme ve kaydetme sınıfı
 * 
 * Web trafiğini izler, kaydeder ve JSON formatında saklar
 */
class TrafficLogger {
  constructor(options = {}) {
    this.enabled = options.enabled || false;
    this.logPath = options.logPath || './logs/traffic';
    this.networkLogs = [];
    this.client = null;
    this.sessionId = new Date().getTime();
    this.currentSite = 'unknown';
    
    // Log dizinini oluştur
    this.ensureLogDirectory();
  }
  
  ensureLogDirectory() {
    try {
      if (!fs.existsSync(this.logPath)) {
        fs.mkdirSync(this.logPath, { recursive: true });
        logger.debug(`Trafik log dizini oluşturuldu: ${this.logPath}`);
      }
    } catch (error) {
      logger.error(`Trafik log dizini oluşturulurken hata: ${error.message}`);
    }
  }
  
  async startLogging(page) {
    if (!this.enabled || !page) {
      logger.debug('Trafik kaydedici etkin değil veya geçerli sayfa yok');
      return false;
    }
    
    try {
      // CDP bağlantısı kur
      this.client = await page.target().createCDPSession();
      await this.client.send('Network.enable');
      
      // İstek yakalandığında
      this.client.on('Network.requestWillBeSent', request => {
        const logEntry = {
          timestamp: new Date().toISOString(),
          type: 'request',
          site: this.currentSite,
          url: request.request.url,
          method: request.request.method,
          headers: request.request.headers,
          postData: request.request.postData,
          requestId: request.requestId
        };
        
        this.networkLogs.push(logEntry);
        
        // Konsola özet bilgi
        logger.debug(`İstek: ${request.request.method} ${request.request.url}`);
      });
      
      // Yanıt yakalandığında
      this.client.on('Network.responseReceived', response => {
        const logEntry = {
          timestamp: new Date().toISOString(),
          type: 'response',
          site: this.currentSite,
          url: response.response.url,
          status: response.response.status,
          statusText: response.response.statusText,
          headers: response.response.headers,
          mimeType: response.response.mimeType,
          requestId: response.requestId
        };
        
        this.networkLogs.push(logEntry);
        
        // Konsola özet bilgi
        logger.debug(`Yanıt: ${response.response.status} ${response.response.url}`);
      });
      
      // Ağ hatası yakalandığında
      this.client.on('Network.loadingFailed', error => {
        const logEntry = {
          timestamp: new Date().toISOString(),
          type: 'error',
          site: this.currentSite,
          errorText: error.errorText,
          blockedReason: error.blockedReason,
          requestId: error.requestId
        };
        
        this.networkLogs.push(logEntry);
        
        // Konsola özet bilgi
        logger.warn(`Ağ Hatası: ${error.errorText} (${error.blockedReason || 'sebep belirtilmedi'})`);
      });
      
      logger.info('HTTP/HTTPS trafik kaydedici başlatıldı');
      return true;
    } catch (error) {
      logger.error(`Trafik kaydedici başlatılırken hata: ${error.message}`);
      return false;
    }
  }
  
  setSite(siteName) {
    this.currentSite = siteName || 'unknown';
  }
  
  async saveCurrentLogs(customFilename = null) {
    if (!this.enabled || this.networkLogs.length === 0) {
      logger.debug('Kaydedilecek trafik verisi bulunamadı');
      return false;
    }
    
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const siteSuffix = this.currentSite !== 'unknown' ? `_${this.currentSite.replace(/[^a-zA-Z0-9]/g, '_')}` : '';
      const filename = customFilename || `traffic_log_${timestamp}${siteSuffix}.json`;
      const filePath = path.join(this.logPath, filename);
      
      const logData = {
        metadata: {
          timestamp: new Date().toISOString(),
          site: this.currentSite,
          sessionId: this.sessionId,
          totalRequests: this.networkLogs.filter(log => log.type === 'request').length,
          totalResponses: this.networkLogs.filter(log => log.type === 'response').length,
          totalErrors: this.networkLogs.filter(log => log.type === 'error').length
        },
        logs: this.networkLogs
      };
      
      fs.writeFileSync(filePath, JSON.stringify(logData, null, 2));
      logger.info(`Trafik logu kaydedildi: ${filePath}`);
      
      // Logları temizle
      this.networkLogs = [];
      return filePath;
    } catch (error) {
      logger.error(`Trafik logları kaydedilirken hata oluştu: ${error.message}`);
      return false;
    }
  }
  
  clearLogs() {
    this.networkLogs = [];
    logger.debug('Trafik logları temizlendi');
  }
  
  async getLogsList() {
    try {
      this.ensureLogDirectory();
      
      const files = fs.readdirSync(this.logPath)
        .filter(file => file.startsWith('traffic_log_') && file.endsWith('.json'))
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
      logger.error(`Trafik log listesi alınırken hata: ${error.message}`);
      return [];
    }
  }
  
  async getLogContent(logFileName) {
    try {
      const filePath = path.join(this.logPath, logFileName);
      
      if (!fs.existsSync(filePath)) {
        logger.warn(`Log dosyası bulunamadı: ${filePath}`);
        return null;
      }
      
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      logger.error(`Log içeriği alınırken hata: ${error.message}`);
      return null;
    }
  }
  
  async deleteLog(logFileName) {
    try {
      const filePath = path.join(this.logPath, logFileName);
      
      if (!fs.existsSync(filePath)) {
        logger.warn(`Silinecek log dosyası bulunamadı: ${filePath}`);
        return false;
      }
      
      fs.unlinkSync(filePath);
      logger.info(`Log dosyası silindi: ${logFileName}`);
      return true;
    } catch (error) {
      logger.error(`Log dosyası silinirken hata: ${error.message}`);
      return false;
    }
  }
  
  getStatistics() {
    return {
      totalLogs: this.networkLogs.length,
      requests: this.networkLogs.filter(log => log.type === 'request').length,
      responses: this.networkLogs.filter(log => log.type === 'response').length,
      errors: this.networkLogs.filter(log => log.type === 'error').length,
      currentSite: this.currentSite,
      sessionId: this.sessionId
    };
  }
}

module.exports = TrafficLogger;