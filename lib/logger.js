const winston = require('winston');
const fs = require('fs');
const path = require('path');
const { format } = winston;

// Log dizinini oluştur
const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Ortam değişkenlerinden gelen ayarları kontrol et
const isDaemonMode = process.env.DAEMON_MODE === 'true';
const isHeadlessMode = process.env.HEADLESS_MODE === 'true';
const isDetailedLogs = process.env.DETAILED_LOGS === 'true';
const isBrowserDebug = process.env.BROWSER_DEBUG === 'true';
const isSiteVisitsDebug = process.env.SITE_VISITS_DEBUG === 'true';

// Ortam değişkenine göre varsayılan log seviyesini belirle
let defaultLogLevel = 'info';
if (process.env.LOG_LEVEL) {
  defaultLogLevel = process.env.LOG_LEVEL;
} else if (isDaemonMode || isDetailedLogs) {
  defaultLogLevel = 'debug';
}

// Log formatı - daemon mod için ekstra bilgiler ekle
const logFormat = format.printf(({ level, message, timestamp, ...meta }) => {
  let metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
  let prefix = '';
  
  // Daemon modunda ve/veya headless modda özel ön ek ekle
  if (isDaemonMode) {
    prefix += '[DAEMON] ';
    
    // Tarayıcı modu bilgisini ekle
    if (isHeadlessMode !== undefined) {
      prefix += isHeadlessMode ? '[GIZLI] ' : '[GORUNUR] ';
    }
  }
  
  return `${timestamp} [${level.toUpperCase()}]: ${prefix}${message} ${metaStr}`;
});

// Winston logger yapılandırması
const logger = winston.createLogger({
  level: defaultLogLevel,
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    logFormat
  ),
  defaultMeta: { service: 'site-visitor-bot' },
  transports: [
    // Konsol çıktısı
    new winston.transports.Console({
      format: format.combine(
        format.colorize(),
        logFormat
      )
    }),
    // Dosya çıktısı - günlük loglar
    new winston.transports.File({ 
      filename: path.join(logDir, 'site-visitor.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),
    // Dosya çıktısı - sadece hatalar
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    })
  ]
});

// Daemon modunda çalışıyorsa özel bir transport ekle
if (isDaemonMode) {
  // Daemon log dosyasını aktif olarak güncelleyen bir transport ekle
  logger.add(new winston.transports.File({
    filename: path.join(logDir, 'daemon.log'),
    level: defaultLogLevel, // Ortam değişkeninden gelen seviyeyi kullan
    maxsize: 10485760, // 10MB
    maxFiles: 3,
    tailable: true
  }));
  
  // İlk log kaydını ekle
  logger.silly('------------------------');
  logger.silly('Daemon modu başlatıldı');
  logger.silly(`Tarayıcı modu: ${isHeadlessMode ? 'Gizli' : 'Görünür'}`);
  logger.silly(`Log seviyesi: ${defaultLogLevel}`);
  logger.silly(`Detaylı loglar: ${isDetailedLogs ? 'Aktif' : 'Pasif'}`);
  logger.silly(`Tarayıcı debug: ${isBrowserDebug ? 'Aktif' : 'Pasif'}`);
  logger.silly(`Site ziyaretleri debug: ${isSiteVisitsDebug ? 'Aktif' : 'Pasif'}`);
  logger.silly('------------------------');
}

// Ortam değişkenleri loglanıyor
if (isDaemonMode) {
  const logEnvVars = {
    DAEMON_MODE: process.env.DAEMON_MODE,
    HEADLESS_MODE: process.env.HEADLESS_MODE,
    DETAILED_LOGS: process.env.DETAILED_LOGS,
    LOG_LEVEL: process.env.LOG_LEVEL,
    BROWSER_DEBUG: process.env.BROWSER_DEBUG,
    SITE_VISITS_DEBUG: process.env.SITE_VISITS_DEBUG
  };
  
  logger.silly('Ortam değişkenleri:', logEnvVars);
}

// Config.json'dan log seviyesini güncelleme fonksiyonu
const updateLogLevel = (level) => {
  if (level && ['error', 'warn', 'info', 'debug', 'silly'].includes(level)) {
    // Ortam değişkeni varsa onu öncelikle kullan
    if (process.env.LOG_LEVEL) {
      logger.debug(`Ortam değişkeninden log seviyesi kullanılıyor: ${process.env.LOG_LEVEL}`);
      logger.level = process.env.LOG_LEVEL;
    } else {
      logger.level = level;
      logger.debug(`Log seviyesi güncellendi: ${level}`);
    }
  }
};

// Config.json'dan log ayarlarını yükleme
try {
  const configPath = path.join(__dirname, '..', 'config.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    if (config.logging) {
      // Log seviyesini ayarla
      if (config.logging.level) {
        updateLogLevel(config.logging.level);
      }
      
      // Log dosya yolunu ayarla
      if (config.logging.logFilePath) {
        const customLogDir = path.join(__dirname, '..', config.logging.logFilePath);
        if (!fs.existsSync(customLogDir)) {
          fs.mkdirSync(customLogDir, { recursive: true });
        }
        
        // Transport'ları güncelle
        logger.transports.forEach(t => {
          if (t instanceof winston.transports.File) {
            const basename = path.basename(t.filename);
            t.filename = path.join(customLogDir, basename);
          }
        });
      }
    }
  }
} catch (error) {
  logger.error('Logger yapılandırması yüklenirken hata oluştu:', error);
}

module.exports = logger;