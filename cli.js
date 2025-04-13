#!/usr/bin/env node

const { program } = require('commander');
const inquirer = require('inquirer');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const { spawn } = require('child_process');
const { start, visitSites } = require('./index');

// Config dosyasının yolunu belirleme
const configPath = path.join(__dirname, 'config.json');

// Helper fonksiyonlar
const readConfig = () => {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    console.error(chalk.red('Config dosyası okunamadı:'), error.message);
    process.exit(1);
  }
};

const writeConfig = (config) => {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(chalk.red('Config dosyası yazılamadı:'), error.message);
    return false;
  }
};

// Botun çalıştırılması için fonksiyonlar
const startBot = async (foreground = false) => {
  // Çalıştırmadan önce yeni config dosyasını oku
  const config = readConfig();
  
  console.log(chalk.blue('\nSite Ziyaretçi Bot başlatılıyor...'));
  console.log(chalk.blue('--------------------------------'));
  
  // Aktif özellikleri listele
  console.log(chalk.yellow('Etkin Özellikler:'));
  console.log(chalk.green('- Tarayıcı modu:'), config.browser.headless ? 'Gizli' : 'Görünür');
  console.log(chalk.green('- Ziyaret edilecek site sayısı:'), config.sites.length);
  console.log(chalk.green('- User-Agent rotasyonu:'), config.browser?.userAgentRotation ? `Etkin (${config.browser?.userAgentStrategy || 'random'})` : 'Devre dışı');
  console.log(chalk.green('- HTTPS Proxy:'), config.logging?.httpsProxy ? `Etkin (Port: ${config.logging?.httpsProxyPort || 8080})` : 'Devre dışı');
  console.log(chalk.green('- Sonsuz mod:'), config.infiniteMode ? 'Etkin' : 'Devre dışı');
  console.log(chalk.green('- Engellenmiş site tespiti:'), config.blockDetection?.enabled !== false ? 'Etkin' : 'Devre dışı');
  console.log(chalk.green('- Ekran görüntüsü alma:'), config.blockDetection?.takeScreenshot !== false ? 'Etkin' : 'Devre dışı');
  console.log(chalk.green('- Yavaşlık eşiği (ms):'), config.blockDetection?.slowThreshold || 10000);
  
  // İnsan davranışı özellikleri
  console.log(chalk.green('- Otomatik scroll:'), config.humanBehavior?.scroll ? 'Etkin' : 'Devre dışı');
  console.log(chalk.green('- Rastgele tıklama:'), config.humanBehavior?.randomClicks ? 'Etkin' : 'Devre dışı');
  console.log(chalk.green('- Rastgele fare hareketi:'), config.humanBehavior?.moveMouseRandomly ? 'Etkin' : 'Devre dışı');
  console.log(chalk.blue('--------------------------------'));
  
  // Kullanıcıya ayarları değiştirme seçeneği sun
  const { wantToChange } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'wantToChange',
      message: 'Etkin özellikleri değiştirmek istiyor musunuz?',
      default: false
    }
  ]);
  
  if (wantToChange) {
    // Hangi ayarları değiştirmek istediğini sor
    const { featuresToChange } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'featuresToChange',
        message: 'Değiştirmek istediğiniz özellikleri seçin:',
        choices: [
          { name: `Tarayıcı modu (${config.browser.headless ? 'Gizli' : 'Görünür'})`, value: 'browser' },
          { name: `User-Agent rotasyonu (${config.browser?.userAgentRotation ? 'Etkin' : 'Devre dışı'})`, value: 'userAgent' },
          { name: `HTTPS Proxy (${config.logging?.httpsProxy ? 'Etkin' : 'Devre dışı'})`, value: 'httpsProxy' },
          { name: `Sonsuz mod (${config.infiniteMode ? 'Etkin' : 'Devre dışı'})`, value: 'infiniteMode' },
          { name: `Engellenmiş site tespiti (${config.blockDetection?.enabled !== false ? 'Etkin' : 'Devre dışı'})`, value: 'blockDetection' },
          { name: `Ekran görüntüsü alma (${config.blockDetection?.takeScreenshot !== false ? 'Etkin' : 'Devre dışı'})`, value: 'takeScreenshot' },
          { name: `Yavaşlık eşiği (${config.blockDetection?.slowThreshold || 10000} ms)`, value: 'slowThreshold' },
          { name: `Otomatik scroll (${config.humanBehavior?.scroll ? 'Etkin' : 'Devre dışı'})`, value: 'scroll' },
          { name: `Rastgele tıklama (${config.humanBehavior?.randomClicks ? 'Etkin' : 'Devre dışı'})`, value: 'randomClicks' },
          { name: `Rastgele fare hareketi (${config.humanBehavior?.moveMouseRandomly ? 'Etkin' : 'Devre dışı'})`, value: 'moveMouseRandomly' }
        ]
      }
    ]);
    
    let configChanged = false;
    
    // Seçilen özellikleri değiştir
    for (const feature of featuresToChange) {
      if (feature === 'browser') {
        config.browser.headless = !config.browser.headless;
        console.log(chalk.green(`Tarayıcı modu değiştirildi: ${config.browser.headless ? 'Gizli' : 'Görünür'}`));
        configChanged = true;
      } else if (feature === 'userAgent') {
        config.browser = config.browser || {};
        config.browser.userAgentRotation = !config.browser.userAgentRotation;
        console.log(chalk.green(`User-Agent rotasyonu ${config.browser.userAgentRotation ? 'etkinleştirildi' : 'devre dışı bırakıldı'}`));
        configChanged = true;
      } else if (feature === 'httpsProxy') {
        config.logging = config.logging || {};
        config.logging.httpsProxy = !config.logging.httpsProxy;
        console.log(chalk.green(`HTTPS Proxy ${config.logging.httpsProxy ? 'etkinleştirildi' : 'devre dışı bırakıldı'}`));
        configChanged = true;
      } else if (feature === 'infiniteMode') {
        config.infiniteMode = !config.infiniteMode;
        console.log(chalk.green(`Sonsuz mod ${config.infiniteMode ? 'etkinleştirildi' : 'devre dışı bırakıldı'}`));
        configChanged = true;
      } else if (feature === 'blockDetection') {
        config.blockDetection = config.blockDetection || {};
        config.blockDetection.enabled = !config.blockDetection.enabled;
        console.log(chalk.green(`Engellenmiş site tespiti ${config.blockDetection.enabled ? 'etkinleştirildi' : 'devre dışı bırakıldı'}`));
        configChanged = true;
      } else if (feature === 'takeScreenshot') {
        config.blockDetection = config.blockDetection || {};
        config.blockDetection.takeScreenshot = !config.blockDetection.takeScreenshot;
        console.log(chalk.green(`Ekran görüntüsü alma ${config.blockDetection.takeScreenshot ? 'etkinleştirildi' : 'devre dışı bırakıldı'}`));
        configChanged = true;
      } else if (feature === 'slowThreshold') {
        config.blockDetection = config.blockDetection || {};
        const currentThreshold = config.blockDetection.slowThreshold || 10000;
        const { newThreshold } = await inquirer.prompt([
          {
            type: 'input',
            name: 'newThreshold',
            message: 'Yeni yavaşlık eşiği (milisaniye cinsinden):',
            default: currentThreshold,
            validate: (value) => {
              const num = parseInt(value, 10);
              if (isNaN(num) || num <= 0) {
                return 'Lütfen geçerli bir sayı girin (0\'dan büyük olmalı)';
              }
              return true;
            },
            filter: (value) => parseInt(value, 10)
          }
        ]);
        config.blockDetection.slowThreshold = newThreshold;
        console.log(chalk.green(`Yavaşlık eşiği ${newThreshold} ms olarak ayarlandı`));
        configChanged = true;
      } else if (feature === 'scroll') {
        config.humanBehavior = config.humanBehavior || {};
        config.humanBehavior.scroll = !config.humanBehavior.scroll;
        console.log(chalk.green(`Otomatik scroll ${config.humanBehavior.scroll ? 'etkinleştirildi' : 'devre dışı bırakıldı'}`));
        configChanged = true;
      } else if (feature === 'randomClicks') {
        config.humanBehavior = config.humanBehavior || {};
        config.humanBehavior.randomClicks = !config.humanBehavior.randomClicks;
        console.log(chalk.green(`Rastgele tıklama ${config.humanBehavior.randomClicks ? 'etkinleştirildi' : 'devre dışı bırakıldı'}`));
        configChanged = true;
      } else if (feature === 'moveMouseRandomly') {
        config.humanBehavior = config.humanBehavior || {};
        config.humanBehavior.moveMouseRandomly = !config.humanBehavior.moveMouseRandomly;
        console.log(chalk.green(`Rastgele fare hareketi ${config.humanBehavior.moveMouseRandomly ? 'etkinleştirildi' : 'devre dışı bırakıldı'}`));
        configChanged = true;
      }
    }
    
    // Değişiklikleri kaydet
    if (configChanged) {
      if (writeConfig(config)) {
        console.log(chalk.green('Ayarlar başarıyla güncellendi ve kaydedildi.'));
      } else {
        console.log(chalk.red('Ayarlar güncellenirken bir hata oluştu!'));
        return;
      }
      
      // Tekrar başlatmak isteyip istemediğini sor
      const { startNow } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'startNow',
          message: 'Bot yeni ayarlarla başlatılsın mı?',
          default: true
        }
      ]);
      
      if (!startNow) {
        console.log(chalk.yellow('Bot başlatma işlemi iptal edildi.'));
        return;
      }
      
      // Yeni ayarları göster
      console.log(chalk.blue('\nYeni Ayarlarla Bot Başlatılıyor:'));
      console.log(chalk.green('- Tarayıcı modu:'), config.browser.headless ? 'Gizli' : 'Görünür');
      console.log(chalk.green('- User-Agent rotasyonu:'), config.browser?.userAgentRotation ? `Etkin (${config.browser?.userAgentStrategy || 'random'})` : 'Devre dışı');
      console.log(chalk.green('- HTTPS Proxy:'), config.logging?.httpsProxy ? `Etkin (Port: ${config.logging?.httpsProxyPort || 8080})` : 'Devre dışı');
      console.log(chalk.green('- Sonsuz mod:'), config.infiniteMode ? 'Etkin' : 'Devre dışı');
      console.log(chalk.green('- Engellenmiş site tespiti:'), config.blockDetection?.enabled !== false ? 'Etkin' : 'Devre dışı');
      console.log(chalk.green('- Ekran görüntüsü alma:'), config.blockDetection?.takeScreenshot !== false ? 'Etkin' : 'Devre dışı');
      console.log(chalk.green('- Yavaşlık eşiği (ms):'), config.blockDetection?.slowThreshold || 10000);
    }
  }
  
  if (foreground) {
    // Ön planda çalıştır
    await start();
  } else {
    // Arka planda çalıştır
    const spinner = ora('Bot arka planda başlatılıyor...').start();
    
    // Log dizini oluştur
    const logDir = path.join(__dirname, config.logging.logFilePath || 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    // Arka plan çalışması için log dosyası oluştur
    const daemonLogPath = path.join(logDir, 'daemon.log');
    const out = fs.openSync(daemonLogPath, 'a');
    const err = fs.openSync(daemonLogPath, 'a');
    
    // Log dosyasına başlangıç bilgisi yaz
    fs.appendFileSync(daemonLogPath, 
      `\n\n============= DAEMON BAŞLATILDI (${new Date().toLocaleString()}) =============\n` +
      `Tarayıcı Modu: ${config.browser.headless ? 'Gizli' : 'Görünür'}\n` +
      `Sonsuz Mod: ${config.infiniteMode ? 'Etkin' : 'Devre Dışı'}\n` +
      `===================================================================\n\n`
    );
    
    // Ortam değişkenlerini ayarla - daha detaylı log için
    const env = Object.assign({}, process.env, {
      LOG_LEVEL: 'silly', // Log seviyesini en ayrıntılı seviyeye çıkar
      DETAILED_LOGS: 'true', // Özel detaylı log bayrağı
      DAEMON_MODE: 'true', // Daemon modunda çalıştığını bildir
      HEADLESS_MODE: config.browser.headless ? 'true' : 'false', // Gizli mod bilgisini aktar
      BROWSER_DEBUG: 'true', // Tarayıcı debug bilgilerini ekle
      SITE_VISITS_DEBUG: 'true' // Site ziyaretleri için ek debug bilgileri
    });
    
    // Node işlemini başlat ve çıktıları daemon.log'a yönlendir
    const child = spawn('node', ['index.js', '--daemon', '--verbose', '--debug'], {
      detached: true,
      stdio: ['ignore', out, err],
      env: env
    });
    
    child.unref();
    
    setTimeout(() => {
      spinner.succeed('Bot arka planda başlatıldı');
      console.log(chalk.green('Bot arka planda çalışıyor. Log dosyalarını kontrol edin.'));
      console.log(chalk.green(`Daemon logları: ${daemonLogPath}`));
      console.log(chalk.yellow('Not: Gizli modda çalışma durumunu daemon.log dosyasında görebilirsiniz.'));
      process.exit(0);
    }, 2000);
  }
};

const runOnce = async () => {
  // Çalıştırmadan önce yeni config dosyasını oku
  const config = readConfig();
  
  console.log(chalk.blue('\nSiteler bir kez ziyaret ediliyor...'));
  console.log(chalk.blue('--------------------------------'));
  
  // Aktif özellikleri listele
  console.log(chalk.yellow('Etkin Özellikler:'));
  console.log(chalk.green('- Tarayıcı modu:'), config.browser.headless ? 'Gizli' : 'Görünür');
  console.log(chalk.green('- Ziyaret edilecek site sayısı:'), config.sites.length);
  console.log(chalk.green('- User-Agent rotasyonu:'), config.browser?.userAgentRotation ? `Etkin (${config.browser?.userAgentStrategy || 'random'})` : 'Devre dışı');
  console.log(chalk.green('- HTTPS Proxy:'), config.logging?.httpsProxy ? `Etkin (Port: ${config.logging?.httpsProxyPort || 8080})` : 'Devre dışı');
  console.log(chalk.green('- Engellenmiş site tespiti:'), config.blockDetection?.enabled !== false ? 'Etkin' : 'Devre dışı');
  console.log(chalk.green('- Ekran görüntüsü alma:'), config.blockDetection?.takeScreenshot !== false ? 'Etkin' : 'Devre dışı');
  console.log(chalk.green('- Yavaşlık eşiği (ms):'), config.blockDetection?.slowThreshold || 10000);
  
  // İnsan davranışı özellikleri
  console.log(chalk.green('- Otomatik scroll:'), config.humanBehavior?.scroll ? 'Etkin' : 'Devre dışı');
  console.log(chalk.green('- Rastgele tıklama:'), config.humanBehavior?.randomClicks ? 'Etkin' : 'Devre dışı');
  console.log(chalk.green('- Rastgele fare hareketi:'), config.humanBehavior?.moveMouseRandomly ? 'Etkin' : 'Devre dışı');
  console.log(chalk.blue('--------------------------------'));
  
  // Kullanıcıya ayarları değiştirme seçeneği sun
  const { wantToChange } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'wantToChange',
      message: 'Etkin özellikleri değiştirmek istiyor musunuz?',
      default: false
    }
  ]);
  
  if (wantToChange) {
    // Hangi ayarları değiştirmek istediğini sor
    const { featuresToChange } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'featuresToChange',
        message: 'Değiştirmek istediğiniz özellikleri seçin:',
        choices: [
          { name: `Tarayıcı modu (${config.browser.headless ? 'Gizli' : 'Görünür'})`, value: 'browser' },
          { name: `User-Agent rotasyonu (${config.browser?.userAgentRotation ? 'Etkin' : 'Devre dışı'})`, value: 'userAgent' },
          { name: `HTTPS Proxy (${config.logging?.httpsProxy ? 'Etkin' : 'Devre dışı'})`, value: 'httpsProxy' },
          { name: `Engellenmiş site tespiti (${config.blockDetection?.enabled !== false ? 'Etkin' : 'Devre dışı'})`, value: 'blockDetection' },
          { name: `Ekran görüntüsü alma (${config.blockDetection?.takeScreenshot !== false ? 'Etkin' : 'Devre dışı'})`, value: 'takeScreenshot' },
          { name: `Yavaşlık eşiği (${config.blockDetection?.slowThreshold || 10000} ms)`, value: 'slowThreshold' },
          { name: `Otomatik scroll (${config.humanBehavior?.scroll ? 'Etkin' : 'Devre dışı'})`, value: 'scroll' },
          { name: `Rastgele tıklama (${config.humanBehavior?.randomClicks ? 'Etkin' : 'Devre dışı'})`, value: 'randomClicks' },
          { name: `Rastgele fare hareketi (${config.humanBehavior?.moveMouseRandomly ? 'Etkin' : 'Devre dışı'})`, value: 'moveMouseRandomly' }
        ]
      }
    ]);
    
    let configChanged = false;
    
    // Seçilen özellikleri değiştir
    for (const feature of featuresToChange) {
      if (feature === 'browser') {
        config.browser.headless = !config.browser.headless;
        console.log(chalk.green(`Tarayıcı modu değiştirildi: ${config.browser.headless ? 'Gizli' : 'Görünür'}`));
        configChanged = true;
      } else if (feature === 'userAgent') {
        config.browser = config.browser || {};
        config.browser.userAgentRotation = !config.browser.userAgentRotation;
        console.log(chalk.green(`User-Agent rotasyonu ${config.browser.userAgentRotation ? 'etkinleştirildi' : 'devre dışı bırakıldı'}`));
        configChanged = true;
      } else if (feature === 'httpsProxy') {
        config.logging = config.logging || {};
        config.logging.httpsProxy = !config.logging.httpsProxy;
        console.log(chalk.green(`HTTPS Proxy ${config.logging.httpsProxy ? 'etkinleştirildi' : 'devre dışı bırakıldı'}`));
        configChanged = true;
      } else if (feature === 'blockDetection') {
        config.blockDetection = config.blockDetection || {};
        config.blockDetection.enabled = !config.blockDetection.enabled;
        console.log(chalk.green(`Engellenmiş site tespiti ${config.blockDetection.enabled ? 'etkinleştirildi' : 'devre dışı bırakıldı'}`));
        configChanged = true;
      } else if (feature === 'takeScreenshot') {
        config.blockDetection = config.blockDetection || {};
        config.blockDetection.takeScreenshot = !config.blockDetection.takeScreenshot;
        console.log(chalk.green(`Ekran görüntüsü alma ${config.blockDetection.takeScreenshot ? 'etkinleştirildi' : 'devre dışı bırakıldı'}`));
        configChanged = true;
      } else if (feature === 'slowThreshold') {
        config.blockDetection = config.blockDetection || {};
        const currentThreshold = config.blockDetection.slowThreshold || 10000;
        const { newThreshold } = await inquirer.prompt([
          {
            type: 'input',
            name: 'newThreshold',
            message: 'Yeni yavaşlık eşiği (milisaniye cinsinden):',
            default: currentThreshold,
            validate: (value) => {
              const num = parseInt(value, 10);
              if (isNaN(num) || num <= 0) {
                return 'Lütfen geçerli bir sayı girin (0\'dan büyük olmalı)';
              }
              return true;
            },
            filter: (value) => parseInt(value, 10)
          }
        ]);
        config.blockDetection.slowThreshold = newThreshold;
        console.log(chalk.green(`Yavaşlık eşiği ${newThreshold} ms olarak ayarlandı`));
        configChanged = true;
      } else if (feature === 'scroll') {
        config.humanBehavior = config.humanBehavior || {};
        config.humanBehavior.scroll = !config.humanBehavior.scroll;
        console.log(chalk.green(`Otomatik scroll ${config.humanBehavior.scroll ? 'etkinleştirildi' : 'devre dışı bırakıldı'}`));
        configChanged = true;
      } else if (feature === 'randomClicks') {
        config.humanBehavior = config.humanBehavior || {};
        config.humanBehavior.randomClicks = !config.humanBehavior.randomClicks;
        console.log(chalk.green(`Rastgele tıklama ${config.humanBehavior.randomClicks ? 'etkinleştirildi' : 'devre dışı bırakıldı'}`));
        configChanged = true;
      } else if (feature === 'moveMouseRandomly') {
        config.humanBehavior = config.humanBehavior || {};
        config.humanBehavior.moveMouseRandomly = !config.humanBehavior.moveMouseRandomly;
        console.log(chalk.green(`Rastgele fare hareketi ${config.humanBehavior.moveMouseRandomly ? 'etkinleştirildi' : 'devre dışı bırakıldı'}`));
        configChanged = true;
      }
    }
    
    // Değişiklikleri kaydet
    if (configChanged) {
      if (writeConfig(config)) {
        console.log(chalk.green('Ayarlar başarıyla güncellendi ve kaydedildi.'));
      } else {
        console.log(chalk.red('Ayarlar güncellenirken bir hata oluştu!'));
        return;
      }
      
      // Tekrar başlatmak isteyip istemediğini sor
      const { startNow } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'startNow',
          message: 'Bot yeni ayarlarla başlatılsın mı?',
          default: true
        }
      ]);
      
      if (!startNow) {
        console.log(chalk.yellow('Bot başlatma işlemi iptal edildi.'));
        return;
      }
      
      // Yeni ayarları göster
      console.log(chalk.blue('\nYeni Ayarlarla Bot Başlatılıyor:'));
      console.log(chalk.green('- Tarayıcı modu:'), config.browser.headless ? 'Gizli' : 'Görünür');
      console.log(chalk.green('- User-Agent rotasyonu:'), config.browser?.userAgentRotation ? `Etkin (${config.browser?.userAgentStrategy || 'random'})` : 'Devre dışı');
      console.log(chalk.green('- HTTPS Proxy:'), config.logging?.httpsProxy ? `Etkin (Port: ${config.logging?.httpsProxyPort || 8080})` : 'Devre dışı');
      console.log(chalk.green('- Sonsuz mod:'), config.infiniteMode ? 'Etkin' : 'Devre dışı');
      console.log(chalk.green('- Engellenmiş site tespiti:'), config.blockDetection?.enabled !== false ? 'Etkin' : 'Devre dışı');
      console.log(chalk.green('- Ekran görüntüsü alma:'), config.blockDetection?.takeScreenshot !== false ? 'Etkin' : 'Devre dışı');
      console.log(chalk.green('- Yavaşlık eşiği (ms):'), config.blockDetection?.slowThreshold || 10000);
    }
  }
  
  const spinner = ora('İşlem devam ediyor...').start();
  
  try {
    await visitSites();
    spinner.succeed('Tüm siteler başarıyla ziyaret edildi');
  } catch (error) {
    spinner.fail('Hata oluştu');
    console.error(chalk.red('Hata:'), error.message);
  }
};

const showLogs = (errorOnly = false, lineCount = 50) => {
  const config = readConfig();
  const logDir = path.join(__dirname, config.logging.logFilePath || 'logs');
  
  const logFile = errorOnly ? 'error.log' : 'site-visitor.log';
  const logPath = path.join(logDir, logFile);
  
  if (!fs.existsSync(logPath)) {
    console.log(chalk.yellow(`${logFile} dosyası bulunamadı.`));
    return;
  }
  
  const lines = parseInt(lineCount);
  
  // Unix tail komutunu çalıştır
  const tailProcess = spawn('tail', ['-n', lines.toString(), logPath]);
  
  tailProcess.stdout.on('data', (data) => {
    console.log(data.toString());
  });
  
  tailProcess.stderr.on('data', (data) => {
    console.error(chalk.red('Hata:'), data.toString());
  });
};

// Logları temizleme fonksiyonu
const clearLogs = async () => {
  const config = readConfig();
  const logDir = path.join(__dirname, config.logging.logFilePath || 'logs');
  const trafficLogDir = path.join(__dirname, config.logging?.trafficLogPath || 'logs/traffic');
  const blockedLogDir = path.join(__dirname, config.logging?.blockedScreenshotPath || 'logs/blocked');
  const httpsLogDir = path.join(__dirname, config.logging?.httpsLogPath || 'logs/https');
  
  console.log(chalk.blue('\nLog Dosyalarını Temizleme:'));
  console.log(chalk.blue('-----------------------------------'));
  
  const { logTypes } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'logTypes',
      message: 'Hangi log türlerini temizlemek istiyorsunuz?',
      choices: [
        { name: 'Genel loglar (site-visitor.log, error.log)', value: 'general', checked: true },
        { name: 'Trafik logları', value: 'traffic', checked: false },
        { name: 'Engellenen site logları ve ekran görüntüleri', value: 'blocked', checked: false },
        { name: 'HTTPS Proxy logları', value: 'https', checked: false }
      ]
    }
  ]);
  
  if (logTypes.length === 0) {
    console.log(chalk.yellow('Temizlenecek log türü seçilmedi.'));
    return;
  }
  
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Seçilen log dosyalarını gerçekten temizlemek istiyor musunuz? Bu işlem geri alınamaz!',
      default: false
    }
  ]);
  
  if (!confirm) {
    console.log(chalk.yellow('İşlem iptal edildi.'));
    return;
  }
  
  let deletedFiles = 0;
  
  // Genel logları temizle
  if (logTypes.includes('general')) {
    try {
      const generalLogs = ['site-visitor.log', 'error.log', 'daemon.log'];
      
      for (const logFile of generalLogs) {
        const logPath = path.join(logDir, logFile);
        
        if (fs.existsSync(logPath)) {
          // Dosyayı sil değil, boşalt
          fs.writeFileSync(logPath, '', 'utf8');
          console.log(chalk.green(`Genel log dosyası temizlendi: ${logPath}`));
          deletedFiles++;
        }
      }
    } catch (error) {
      console.error(chalk.red(`Genel logları temizlerken hata: ${error.message}`));
    }
  }
  
  // Trafik loglarını temizle
  if (logTypes.includes('traffic') && fs.existsSync(trafficLogDir)) {
    try {
      const trafficFiles = fs.readdirSync(trafficLogDir)
        .filter(file => file.startsWith('traffic_log_') && file.endsWith('.json'));
      
      for (const file of trafficFiles) {
        fs.unlinkSync(path.join(trafficLogDir, file));
        console.log(chalk.green(`Trafik log dosyası silindi: ${file}`));
        deletedFiles++;
      }
    } catch (error) {
      console.error(chalk.red(`Trafik loglarını temizlerken hata: ${error.message}`));
    }
  }
  
  // Engellenen site loglarını temizle
  if (logTypes.includes('blocked') && fs.existsSync(blockedLogDir)) {
    try {
      // JSON raporları sil
      const reportFiles = fs.readdirSync(blockedLogDir)
        .filter(file => file.startsWith('block_report_') && file.endsWith('.json'));
      
      for (const file of reportFiles) {
        fs.unlinkSync(path.join(blockedLogDir, file));
        console.log(chalk.green(`Engelleme raporu silindi: ${file}`));
        deletedFiles++;
      }
      
      // Ekran görüntülerini sil
      const screenshotFiles = fs.readdirSync(blockedLogDir)
        .filter(file => file.endsWith('.png'));
      
      for (const file of screenshotFiles) {
        fs.unlinkSync(path.join(blockedLogDir, file));
        console.log(chalk.green(`Ekran görüntüsü silindi: ${file}`));
        deletedFiles++;
      }
    } catch (error) {
      console.error(chalk.red(`Engellenen site loglarını temizlerken hata: ${error.message}`));
    }
  }
  
  // HTTPS Proxy loglarını temizle
  if (logTypes.includes('https') && fs.existsSync(httpsLogDir)) {
    try {
      const httpsFiles = fs.readdirSync(httpsLogDir)
        .filter(file => (file.startsWith('https_') && file.endsWith('.json')));
      
      for (const file of httpsFiles) {
        fs.unlinkSync(path.join(httpsLogDir, file));
        console.log(chalk.green(`HTTPS log dosyası silindi: ${file}`));
        deletedFiles++;
      }
    } catch (error) {
      console.error(chalk.red(`HTTPS loglarını temizlerken hata: ${error.message}`));
    }
  }
  
  console.log(chalk.blue('\n-----------------------------------'));
  if (deletedFiles > 0) {
    console.log(chalk.green(`Toplam ${deletedFiles} adet log dosyası temizlendi.`));
  } else {
    console.log(chalk.yellow('Temizlenecek log dosyası bulunamadı.'));
  }
  console.log(chalk.blue('-----------------------------------\n'));
};

// Trafik loglarını görüntüleme fonksiyonu
const showTrafficLogs = async () => {
  const config = readConfig();
  const trafficLogDir = path.join(__dirname, config.logging?.trafficLogPath || 'logs/traffic');
  
  if (!fs.existsSync(trafficLogDir)) {
    console.log(chalk.yellow('Henüz kaydedilmiş trafik logu bulunmuyor.'));
    return;
  }
  
  try {
    // Trafik log dosyalarını bul
    const logFiles = fs.readdirSync(trafficLogDir)
      .filter(file => file.startsWith('traffic_log_') && file.endsWith('.json'))
      .map(file => {
        const stats = fs.statSync(path.join(trafficLogDir, file));
        return {
          name: file,
          size: (stats.size / 1024).toFixed(1) + ' KB',
          date: stats.mtime.toLocaleString(),
          path: path.join(trafficLogDir, file)
        };
      })
      .sort((a, b) => {
        // En son oluşturulana göre sırala
        return new Date(b.date) - new Date(a.date);
      });
    
    if (logFiles.length === 0) {
      console.log(chalk.yellow('Henüz kaydedilmiş trafik logu bulunmuyor.'));
      return;
    }
    
    // Kullanıcıya görüntülenecek log dosyasını seçtir
    const { selectedLog } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedLog',
        message: 'Görüntülemek istediğiniz trafik logunu seçin:',
        choices: logFiles.map(file => ({
          name: `${file.name} (${file.size}, ${file.date})`,
          value: file.path
        }))
      }
    ]);
    
    // Seçilen log dosyasının içeriğini oku
    const logContent = JSON.parse(fs.readFileSync(selectedLog, 'utf8'));
    
    // Özet bilgileri göster
    if (logContent.metadata) {
      console.log(chalk.blue('\nTrafik Logu Özeti:'));
      console.log(chalk.blue('-------------------------'));
      console.log(chalk.green('Ziyaret Edilen Site:'), logContent.metadata.site || 'Bilinmiyor');
      console.log(chalk.green('Tarih:'), logContent.metadata.timestamp);
      console.log(chalk.green('Toplam İstek Sayısı:'), logContent.metadata.totalRequests);
      console.log(chalk.green('Toplam Yanıt Sayısı:'), logContent.metadata.totalResponses);
      console.log(chalk.green('Toplam Hata Sayısı:'), logContent.metadata.totalErrors);
      console.log(chalk.blue('-------------------------\n'));
    }
    
    // İşlem seçenekleri sun
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Ne yapmak istiyorsunuz?',
        choices: [
          { name: 'İstekleri Görüntüle', value: 'requests' },
          { name: 'Yanıtları Görüntüle', value: 'responses' },
          { name: 'Hataları Görüntüle', value: 'errors' },
          { name: 'Logları Dosyaya Dışa Aktar', value: 'export' },
          { name: 'Ana Menüye Dön', value: 'back' }
        ]
      }
    ]);
    
    if (action === 'back') {
      return;
    }
    
    if (action === 'export') {
      const { exportPath } = await inquirer.prompt([
        {
          type: 'input',
          name: 'exportPath',
          message: 'Dışa aktarılacak dosya yolunu girin:',
          default: path.join(process.cwd(), 'exported_traffic.json')
        }
      ]);
      
      fs.copyFileSync(selectedLog, exportPath);
      console.log(chalk.green(`Trafik logu şu konuma dışa aktarıldı: ${exportPath}`));
      return;
    }
    
    // İstenen log tipini görüntüle
    const logs = logContent.logs || [];
    const filteredLogs = logs.filter(log => {
      if (action === 'requests') return log.type === 'request';
      if (action === 'responses') return log.type === 'response';
      if (action === 'errors') return log.type === 'error';
      return true;
    });
    
    if (filteredLogs.length === 0) {
      console.log(chalk.yellow(`Seçilen tipte log kaydı bulunamadı.`));
      return;
    }
    
    console.log(chalk.blue(`\n${filteredLogs.length} adet kayıt bulundu:\n`));
    
    // Log içeriğini göster (sayfa sayfa)
    const pageSize = 5;
    let currentPage = 0;
    
    const displayLogs = (page) => {
      const start = page * pageSize;
      const end = Math.min(start + pageSize, filteredLogs.length);
      
      for (let i = start; i < end; i++) {
        const log = filteredLogs[i];
        console.log(chalk.blue(`#${i+1} - ${log.timestamp}`));
        
        if (log.type === 'request') {
          console.log(chalk.green(`${log.method} ${log.url}`));
          console.log(chalk.yellow('Headers:'), JSON.stringify(log.headers, null, 2));
          if (log.postData) {
            console.log(chalk.yellow('Data:'), log.postData);
          }
        } else if (log.type === 'response') {
          console.log(chalk.green(`${log.status} ${log.statusText} - ${log.url}`));
          console.log(chalk.yellow('Headers:'), JSON.stringify(log.headers, null, 2));
          console.log(chalk.yellow('MIME Type:'), log.mimeType);
        } else if (log.type === 'error') {
          console.log(chalk.red(`Hata: ${log.errorText}`));
          if (log.blockedReason) {
            console.log(chalk.red(`Engellenme Nedeni: ${log.blockedReason}`));
          }
        }
        
        console.log(chalk.blue('-'.repeat(80)));
      }
      
      return end < filteredLogs.length;
    };
    
    let hasMore = displayLogs(currentPage);
    
    while (hasMore) {
      const { nextAction } = await inquirer.prompt([
        {
          type: 'list',
          name: 'nextAction',
          message: 'Daha fazla log görüntüle?',
          choices: [
            { name: 'Sonraki Sayfa', value: 'next' },
            { name: 'Çıkış', value: 'exit' }
          ]
        }
      ]);
      
      if (nextAction === 'exit') {
        break;
      }
      
      currentPage++;
      hasMore = displayLogs(currentPage);
      
      if (!hasMore) {
        console.log(chalk.yellow('Tüm kayıtlar görüntülendi.'));
      }
    }
  } catch (error) {
    console.error(chalk.red('Trafik logları görüntülenirken hata oluştu:'), error.message);
  }
};

// Engellenen siteleri görüntüleme fonksiyonu
const showBlockedSites = async () => {
  const config = readConfig();
  const blockedDir = path.join(__dirname, config.logging?.blockedScreenshotPath || 'logs/blocked');
  
  if (!fs.existsSync(blockedDir)) {
    console.log(chalk.yellow('Henüz engellenen site kaydı bulunmuyor.'));
    return;
  }
  
  try {
    // Engel rapor dosyalarını bul
    const reportFiles = fs.readdirSync(blockedDir)
      .filter(file => file.startsWith('block_report_') && file.endsWith('.json'))
      .map(file => {
        const stats = fs.statSync(path.join(blockedDir, file));
        return {
          name: file,
          size: (stats.size / 1024).toFixed(1) + ' KB',
          date: stats.mtime.toLocaleString(),
          path: path.join(blockedDir, file)
        };
      })
      .sort((a, b) => {
        // En son oluşturulana göre sırala
        return new Date(b.date) - new Date(a.date);
      });
    
    // Ekran görüntülerini bul
    const screenshotFiles = fs.readdirSync(blockedDir)
      .filter(file => file.endsWith('.png'))
      .map(file => {
        const stats = fs.statSync(path.join(blockedDir, file));
        return {
          name: file,
          size: (stats.size / 1024).toFixed(1) + ' KB',
          date: stats.mtime.toLocaleString(),
          path: path.join(blockedDir, file)
        };
      })
      .sort((a, b) => {
        // En son oluşturulana göre sırala
        return new Date(b.date) - new Date(a.date);
      });
    
    if (reportFiles.length === 0 && screenshotFiles.length === 0) {
      console.log(chalk.yellow('Henüz engellenen site kaydı bulunmuyor.'));
      return;
    }
    
    // Görüntülenecek veri tipini seç
    const { viewType } = await inquirer.prompt([
      {
        type: 'list',
        name: 'viewType',
        message: 'Neyi görüntülemek istiyorsunuz?',
        choices: [
          { 
            name: `Engel Raporları (${reportFiles.length} adet)`, 
            value: 'reports',
            disabled: reportFiles.length === 0 
          },
          { 
            name: `Ekran Görüntüleri (${screenshotFiles.length} adet)`, 
            value: 'screenshots',
            disabled: screenshotFiles.length === 0
          },
          {
            name: 'Engellenen Site Kayıtlarını Temizle',
            value: 'clear'
          }
        ]
      }
    ]);
    
    if (viewType === 'clear') {
      await clearBlockedRecords();
      return;
    }
    
    // ... existing code ...

    if (viewType === 'reports') {
      // Rapor görüntüleme
      if (reportFiles.length === 0) {
        console.log(chalk.yellow('Henüz engel raporu bulunmuyor.'));
        return;
      }
      
      const { selectedReport } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedReport',
          message: 'Görüntülemek istediğiniz raporu seçin:',
          choices: reportFiles.map(file => ({
            name: `${file.name} (${file.size}, ${file.date})`,
            value: file.path
          }))
        }
      ]);
      
      // Rapor içeriğini oku ve göster
      const reportContent = JSON.parse(fs.readFileSync(selectedReport, 'utf8'));
      
      console.log(chalk.blue('\nEngelleme Raporu:'));
      console.log(chalk.blue('-------------------------'));
      console.log(chalk.green('Tarih:'), reportContent.timestamp);
      console.log(chalk.green('Engellenen Site Sayısı:'), reportContent.totalBlocked);
      console.log(chalk.green('Yavaşlayan Site Sayısı:'), reportContent.totalSlow);
      console.log(chalk.blue('-------------------------\n'));
      
      // Detaylı bilgi gösterme seçeneği sun
      const { detailType } = await inquirer.prompt([
        {
          type: 'list',
          name: 'detailType',
          message: 'Hangi detayları görmek istiyorsunuz?',
          choices: [
            { 
              name: 'Engellenen Siteler', 
              value: 'blocked',
              disabled: reportContent.blockedSites.length === 0 
            },
            { 
              name: 'Yavaşlayan Siteler', 
              value: 'slow',
              disabled: reportContent.slowSites.length === 0
            },
            { name: 'Ana Menüye Dön', value: 'back' }
          ]
        }
      ]);
      
      if (detailType === 'back') {
        return;
      }
      
      // Seçilen detayları göster
      const sites = detailType === 'blocked' ? reportContent.blockedSites : reportContent.slowSites;
      console.log(chalk.blue(`\n${sites.length} adet ${detailType === 'blocked' ? 'engellenen' : 'yavaşlayan'} site:\n`));
      
      sites.forEach((site, index) => {
        console.log(chalk.blue(`#${index+1}`));
        console.log(chalk.green('URL:'), site.url);
        console.log(chalk.green('Tarih:'), site.timestamp);
        
        if (site.reason) {
          console.log(chalk.green('Neden:'), site.reason);
        }
        
        if (site.loadTime) {
          console.log(chalk.green('Yükleme Süresi:'), `${site.loadTime}ms`);
        }
        
        console.log(chalk.blue('-'.repeat(80)));
      });
      
    } else if (viewType === 'screenshots') {
      // Ekran görüntüsü görüntüleme
      if (screenshotFiles.length === 0) {
        console.log(chalk.yellow('Henüz ekran görüntüsü bulunmuyor.'));
        return;
      }
      
      // Ekran görüntülerini say
      const blockedCount = screenshotFiles.filter(file => file.name.includes('blocked_')).length;
      const slowCount = screenshotFiles.filter(file => file.name.includes('slow_')).length;
      const errorCount = screenshotFiles.filter(file => file.name.includes('error_')).length;
      
      console.log(chalk.blue('\nEkran Görüntüsü İstatistikleri:'));
      console.log(chalk.blue('-------------------------'));
      console.log(chalk.green('Engellenen Site Görüntüsü:'), blockedCount);
      console.log(chalk.green('Yavaşlayan Site Görüntüsü:'), slowCount);
      console.log(chalk.green('Hata Görüntüsü:'), errorCount);
      console.log(chalk.blue('-------------------------\n'));
      
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'Ne yapmak istiyorsunuz?',
          choices: [
            { name: 'Ekran Görüntülerini Listele', value: 'list' },
            { name: 'Ana Menüye Dön', value: 'back' }
          ]
        }
      ]);
      
      if (action === 'back') {
        return;
      }
      
      // Ekran görüntülerini filtrele
      const { filterType } = await inquirer.prompt([
        {
          type: 'list',
          name: 'filterType',
          message: 'Hangi ekran görüntülerini listelemek istiyorsunuz?',
          choices: [
            { name: 'Tümü', value: 'all' },
            { name: 'Sadece Engellenen Siteler', value: 'blocked' },
            { name: 'Sadece Yavaşlayan Siteler', value: 'slow' },
            { name: 'Sadece Hatalar', value: 'error' }
          ]
        }
      ]);
      
      // Filtreleme
      let filteredScreenshots = screenshotFiles;
      if (filterType !== 'all') {
        filteredScreenshots = screenshotFiles.filter(file => 
          file.name.includes(`${filterType}_`)
        );
      }
      
      if (filteredScreenshots.length === 0) {
        console.log(chalk.yellow(`Seçilen türde ekran görüntüsü bulunamadı.`));
        return;
      }
      
      // Ekran görüntüsünü seç
      const { selectedScreenshot } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedScreenshot',
          message: 'Görüntülemek istediğiniz ekran görüntüsünü seçin:',
          choices: filteredScreenshots.map(file => ({
            name: `${file.name} (${file.size}, ${file.date})`,
            value: file.path
          }))
        }
      ]);
      
      // Ekran görüntüsünü görüntüle (sistemle)
      console.log(chalk.green(`Ekran görüntüsü açılıyor: ${selectedScreenshot}`));
      
      try {
        // Platformlar arası açma komutu
        let openCommand;
        switch (process.platform) {
          case 'darwin':
            openCommand = ['open', selectedScreenshot];
            break;
          case 'win32':
            openCommand = ['start', '""', selectedScreenshot];
            break;
          default:
            openCommand = ['xdg-open', selectedScreenshot];
        }
        
        spawn(openCommand[0], openCommand.slice(1), {
          detached: true,
          stdio: 'ignore'
        }).unref();
        
      } catch (error) {
        console.error(chalk.red('Görüntü açılamadı:'), error.message);
      }
    }
  } catch (error) {
    console.error(chalk.red('Engellenen siteler görüntülenirken hata oluştu:'), error.message);
  }
};

// HTTPS oturumlarını görüntüleme fonksiyonu
const showHttpsSessions = async () => {
  const config = readConfig();
  const httpsDir = path.join(__dirname, config.logging?.httpsLogPath || 'logs/https');
  
  if (!fs.existsSync(httpsDir)) {
    console.log(chalk.yellow('Henüz HTTPS oturum kaydı bulunmuyor.'));
    return;
  }
  
  try {
    // HTTPS dosyalarını bul
    const sessionFiles = fs.readdirSync(httpsDir)
      .filter(file => file.startsWith('https_') && file.endsWith('.json'))
      .map(file => {
        const stats = fs.statSync(path.join(httpsDir, file));
        return {
          name: file,
          size: (stats.size / 1024).toFixed(1) + ' KB',
          date: stats.mtime.toLocaleString(),
          path: path.join(httpsDir, file)
        };
      })
      .sort((a, b) => {
        // En son oluşturulana göre sırala
        return new Date(b.date) - new Date(a.date);
      });
    
    const reportFiles = sessionFiles.filter(file => file.name.startsWith('https_report_'));
    const sessionOnlyFiles = sessionFiles.filter(file => !file.name.startsWith('https_report_'));
    
    if (sessionFiles.length === 0) {
      console.log(chalk.yellow('Henüz HTTPS oturum kaydı bulunmuyor.'));
      return;
    }
    
    // Görüntülenecek veri tipini seç
    const { viewType } = await inquirer.prompt([
      {
        type: 'list',
        name: 'viewType',
        message: 'Neyi görüntülemek istiyorsunuz?',
        choices: [
          { 
            name: `HTTPS Raporları (${reportFiles.length} adet)`, 
            value: 'reports',
            disabled: reportFiles.length === 0 
          },
          { 
            name: `HTTPS Oturumları (${sessionOnlyFiles.length} adet)`, 
            value: 'sessions',
            disabled: sessionOnlyFiles.length === 0
          },
          {
            name: 'HTTPS Proxy Kurulum Bilgisi', 
            value: 'setup'
          }
        ]
      }
    ]);
    
    if (viewType === 'setup') {
      // HTTPS Proxy kurulum bilgisi
      console.log(chalk.blue('\nHTTPS Proxy Kurulum Bilgileri:'));
      console.log(chalk.blue('---------------------------'));
      console.log(chalk.green('Proxy Port:'), config.logging?.httpsProxyPort || 8080);
      console.log(chalk.green('Aktif:'), config.logging?.httpsProxy ? 'Evet' : 'Hayır');
      console.log(chalk.blue('---------------------------\n'));
      
      console.log(chalk.yellow('Kurulum Talimatları:'));
      console.log(chalk.cyan('1. Gerekli paket: npm install http-mitm-proxy'));
      console.log(chalk.cyan('2. Sertifika: certs/ca.crt dosyasını sisteminize güvenilir olarak ekleyin'));
      console.log(chalk.cyan('3. Bot başlatıldığında proxy otomatik olarak başlatılacaktır'));
      console.log(chalk.cyan('4. Proxy ayarlarını değiştirmek için config.json dosyasını düzenleyin'));
      console.log(chalk.cyan('5. Bu özellik SSL şifrelemeyi çözümleyerek HTTPS içeriğini incelemenizi sağlar'));
      
      return;
    }
    
    const targetFiles = viewType === 'reports' ? reportFiles : sessionOnlyFiles;
    
    if (targetFiles.length === 0) {
      console.log(chalk.yellow(`Seçilen türde HTTPS kaydı bulunamadı.`));
      return;
    }
    
    // Dosya seç
    const { selectedFile } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedFile',
        message: 'Görüntülemek istediğiniz dosyayı seçin:',
        choices: targetFiles.map(file => ({
          name: `${file.name} (${file.size}, ${file.date})`,
          value: file.path
        }))
      }
    ]);
    
    // Dosya içeriğini oku ve göster
    const fileContent = JSON.parse(fs.readFileSync(selectedFile, 'utf8'));
    
    if (viewType === 'reports') {
      // Rapor içeriğini göster
      console.log(chalk.blue('\nHTTPS Raporu:'));
      console.log(chalk.blue('-------------------------'));
      console.log(chalk.green('Tarih:'), fileContent.timestamp);
      console.log(chalk.green('Site:'), fileContent.targetSite || 'Tüm siteler');
      console.log(chalk.green('Toplam Oturum Sayısı:'), fileContent.totalSessions);
      console.log(chalk.blue('-------------------------\n'));
      
      // Detaylı bilgi gösterme seçeneği sun
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'Ne yapmak istiyorsunuz?',
          choices: [
            { name: 'Özet Bilgileri Göster', value: 'summary' },
            { name: 'Detaylı Oturum Listesi', value: 'details' },
            { name: 'Ana Menüye Dön', value: 'back' }
          ]
        }
      ]);
      
      if (action === 'back') {
        return;
      }
      
      if (action === 'summary') {
        const sessions = fileContent.sessions || [];
        
        // Özet istatistikler
        const domains = new Set();
        const statusCodes = {};
        const contentTypes = {};
        let totalRequests = 0;
        let totalResponses = 0;
        
        sessions.forEach(session => {
          if (session.host) domains.add(session.host);
          
          if (session.responseStatus) {
            statusCodes[session.responseStatus] = (statusCodes[session.responseStatus] || 0) + 1;
          }
          
          if (session.responseHeaders && session.responseHeaders['content-type']) {
            const contentType = session.responseHeaders['content-type'].split(';')[0];
            contentTypes[contentType] = (contentTypes[contentType] || 0) + 1;
          }
          
          if (session.method) totalRequests++;
          if (session.responseStatus) totalResponses++;
        });
        
        console.log(chalk.blue('\nÖzet İstatistikler:'));
        console.log(chalk.blue('-------------------------'));
        console.log(chalk.green('Toplam Farklı Domain:'), domains.size);
        console.log(chalk.green('Toplam İstek:'), totalRequests);
        console.log(chalk.green('Toplam Yanıt:'), totalResponses);
        
        console.log(chalk.blue('\nHTTP Durum Kodları:'));
        Object.keys(statusCodes).sort().forEach(code => {
          console.log(chalk.green(`  HTTP ${code}:`), statusCodes[code]);
        });
        
        console.log(chalk.blue('\nİçerik Tipleri:'));
        Object.keys(contentTypes).sort().forEach(type => {
          console.log(chalk.green(`  ${type}:`), contentTypes[type]);
        });
      } else if (action === 'details') {
        const sessions = fileContent.sessions || [];
        
        console.log(chalk.blue(`\n${sessions.length} adet HTTPS oturumu bulundu:\n`));
        
        // Oturumları sayfa sayfa göster
        const pageSize = 3;
        let currentPage = 0;
        
        const displaySessions = (page) => {
          const start = page * pageSize;
          const end = Math.min(start + pageSize, sessions.length);
          
          for (let i = start; i < end; i++) {
            const session = sessions[i];
            console.log(chalk.blue(`#${i+1} - ${session.timestamp || 'Tarih yok'}`));
            console.log(chalk.green('URL:'), `${session.protocol || 'https'}://${session.host || ''}${session.path || ''}`);
            
            if (session.method) {
              console.log(chalk.green('Metot:'), session.method);
            }
            
            if (session.responseStatus) {
              console.log(chalk.green('Durum:'), `HTTP ${session.responseStatus}`);
            }
            
            if (session.responseHeaders && session.responseHeaders['content-type']) {
              console.log(chalk.green('İçerik Tipi:'), session.responseHeaders['content-type']);
            }
            
            // İçerik uzunluğunu kontrol et
            let responsePreview = '';
            if (session.responseBody) {
              responsePreview = session.responseBody.length > 150 
                ? session.responseBody.substring(0, 150) + '...' 
                : session.responseBody;
              console.log(chalk.green('Yanıt Önizleme:'), responsePreview);
            }
            
            console.log(chalk.blue('-'.repeat(80)));
          }
          
          return end < sessions.length;
        };
        
        let hasMore = displaySessions(currentPage);
        
        while (hasMore) {
          const { nextAction } = await inquirer.prompt([
            {
              type: 'list',
              name: 'nextAction',
              message: 'Daha fazla oturum görüntüle?',
              choices: [
                { name: 'Sonraki Sayfa', value: 'next' },
                { name: 'Çıkış', value: 'exit' }
              ]
            }
          ]);
          
          if (nextAction === 'exit') {
            break;
          }
          
          currentPage++;
          hasMore = displaySessions(currentPage);
          
          if (!hasMore) {
            console.log(chalk.yellow('Tüm oturumlar görüntülendi.'));
          }
        }
      }
    } else {
      // Tekil oturum içeriğini göster
      console.log(chalk.blue('\nHTTPS Oturumu:'));
      console.log(chalk.blue('-------------------------'));
      console.log(chalk.green('URL:'), `${fileContent.protocol || 'https'}://${fileContent.host || ''}${fileContent.path || ''}`);
      console.log(chalk.green('Tarih:'), fileContent.timestamp);
      console.log(chalk.green('Metot:'), fileContent.method);
      console.log(chalk.green('Durum Kodu:'), fileContent.responseStatus);
      console.log(chalk.blue('-------------------------\n'));
      
      // Detaylı bilgi gösterme seçeneği sun
      const { detailType } = await inquirer.prompt([
        {
          type: 'list',
          name: 'detailType',
          message: 'Hangi detayları görmek istiyorsunuz?',
          choices: [
            { name: 'İstek Başlıkları', value: 'requestHeaders' },
            { name: 'İstek Gövdesi', value: 'requestBody', disabled: !fileContent.requestBody },
            { name: 'Yanıt Başlıkları', value: 'responseHeaders' },
            { name: 'Yanıt Gövdesi', value: 'responseBody', disabled: !fileContent.responseBody },
            { name: 'Ana Menüye Dön', value: 'back' }
          ]
        }
      ]);
      
      if (detailType === 'back') {
        return;
      }
      
      if (detailType === 'requestHeaders') {
        console.log(chalk.blue('\nİstek Başlıkları:'));
        console.log(JSON.stringify(fileContent.headers, null, 2));
      } else if (detailType === 'requestBody') {
        console.log(chalk.blue('\nİstek Gövdesi:'));
        console.log(fileContent.requestBody);
      } else if (detailType === 'responseHeaders') {
        console.log(chalk.blue('\nYanıt Başlıkları:'));
        console.log(JSON.stringify(fileContent.responseHeaders, null, 2));
      } else if (detailType === 'responseBody') {
        console.log(chalk.blue('\nYanıt Gövdesi:'));
        
        const responseBody = fileContent.responseBody;
        
        // İçerik tipine göre biçimlendir
        const contentType = fileContent.responseHeaders && fileContent.responseHeaders['content-type'];
        if (contentType && contentType.includes('json')) {
          try {
            const jsonBody = JSON.parse(responseBody);
            console.log(JSON.stringify(jsonBody, null, 2));
          } catch (e) {
            console.log(responseBody);
          }
        } else if (contentType && contentType.includes('html')) {
          console.log(chalk.yellow('HTML içerik (ilk 500 karakter):'));
          console.log(responseBody.substring(0, 500) + (responseBody.length > 500 ? '...' : ''));
        } else {
          console.log(responseBody);
        }
      }
    }
  } catch (error) {
    console.error(chalk.red('HTTPS oturumları görüntülenirken hata oluştu:'), error.message);
  }
};

// Ekran görüntülerini temizleme fonksiyonu
const clearScreenshots = async () => {
  const config = readConfig();
  const screenshotsDir = path.join(__dirname, config.logging?.screenshotPath || 'logs/screenshots');
  
  // Klasör var mı ve içinde dosyalar var mı kontrol et
  if (!fs.existsSync(screenshotsDir) || fs.readdirSync(screenshotsDir).length === 0) {
    console.log(chalk.yellow('Henüz hiç ekran görüntüsü bulunmuyor.'));
    return;
  }
  
  // Klasördeki dosyaları listeleme
  const files = fs.readdirSync(screenshotsDir)
    .filter(file => file.endsWith('.png'));
  
  if (files.length === 0) {
    console.log(chalk.yellow('Temizlenecek ekran görüntüsü bulunamadı.'));
    return;
  }
  
  console.log(chalk.blue('\nEkran Görüntülerini Temizleme:'));
  console.log(chalk.blue('-----------------------------------'));
  console.log(chalk.yellow(`Toplam ${files.length} adet ekran görüntüsü bulundu.`));
  
  // Temizleme seçenekleri
  const { cleanOption } = await inquirer.prompt([
    {
      type: 'list',
      name: 'cleanOption',
      message: 'Ekran görüntülerini nasıl temizlemek istiyorsunuz?',
      choices: [
        { name: 'Tümünü temizle', value: 'all' },
        { name: 'Belirli bir tarihten önceki görüntüleri temizle', value: 'before_date' },
        { name: 'Belirli sitelere ait görüntüleri temizle', value: 'by_site' },
        { name: 'İşlemi iptal et', value: 'cancel' }
      ]
    }
  ]);
  
  if (cleanOption === 'cancel') {
    console.log(chalk.yellow('İşlem iptal edildi.'));
    return;
  }
  
  let filesToDelete = [];
  
  if (cleanOption === 'all') {
    filesToDelete = files;
  } else if (cleanOption === 'before_date') {
    const { days } = await inquirer.prompt([
      {
        type: 'input',
        name: 'days',
        message: 'Kaç günden eski ekran görüntülerini silmek istiyorsunuz?',
        default: '7',
        validate: (input) => !isNaN(input) || 'Geçerli bir sayı girin'
      }
    ]);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));
    
    filesToDelete = files.filter(file => {
      const filePath = path.join(screenshotsDir, file);
      const stats = fs.statSync(filePath);
      return stats.mtime < cutoffDate;
    });
    
    if (filesToDelete.length === 0) {
      console.log(chalk.yellow(`${days} günden eski ekran görüntüsü bulunamadı.`));
      return;
    }
    
    console.log(chalk.yellow(`${filesToDelete.length} adet ${days} günden eski ekran görüntüsü bulundu.`));
  } else if (cleanOption === 'by_site') {
    // Mevcut site adlarını topla
    const siteNames = new Set();
    files.forEach(file => {
      const siteName = file.split('_')[0]; // Dosya adlarının genelde site_timestamp.png formatında olduğunu varsayıyoruz
      siteNames.add(siteName);
    });
    
    if (siteNames.size === 0) {
      console.log(chalk.yellow('Site bilgisi çıkarılamadı.'));
      return;
    }
    
    const { selectedSites } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedSites',
        message: 'Hangi sitelere ait ekran görüntülerini temizlemek istiyorsunuz?',
        choices: Array.from(siteNames).map(site => ({ name: site, value: site }))
      }
    ]);
    
    if (selectedSites.length === 0) {
      console.log(chalk.yellow('Hiçbir site seçilmedi, işlem iptal edildi.'));
      return;
    }
    
    filesToDelete = files.filter(file => 
      selectedSites.some(site => file.startsWith(site))
    );
    
    console.log(chalk.yellow(`${filesToDelete.length} adet seçilen sitelere ait ekran görüntüsü bulundu.`));
  }
  
  if (filesToDelete.length === 0) {
    console.log(chalk.yellow('Temizlenecek ekran görüntüsü bulunamadı.'));
    return;
  }
  
  // Onay al
  const { confirmDelete } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmDelete',
      message: `${filesToDelete.length} adet ekran görüntüsünü silmek istediğinize emin misiniz?`,
      default: false
    }
  ]);
  
  if (!confirmDelete) {
    console.log(chalk.yellow('İşlem iptal edildi.'));
    return;
  }
  
  // Dosyaları sil
  let deletedCount = 0;
  try {
    filesToDelete.forEach(file => {
      const filePath = path.join(screenshotsDir, file);
      fs.unlinkSync(filePath);
      deletedCount++;
    });
    
    console.log(chalk.green(`${deletedCount} adet ekran görüntüsü başarıyla silindi.`));
  } catch (error) {
    console.error(chalk.red(`Dosyalar silinirken hata oluştu: ${error.message}`));
  }
};

// CLI arayüzünün iki modda çalışmasını sağlayalım
// 1. Komut satırından parametre ile çalıştırma modu
// 2. Etkileşimli menü modu
const runInteractiveMenu = async () => {
  const config = readConfig();
  
  while (true) {
    console.log(chalk.blue('\nSite Ziyaretçi Bot - Ana Menü'));
    
    // Tarayıcı görünürlük durumunu kontrol et
    const browserConfig = config.browser || {};
    const isHeadless = browserConfig.headless !== false;
    
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Ne yapmak istiyorsunuz?',
        choices: [
          { name: 'Botu Başlat (Zamanlanmış Mod)', value: 'start' },
          { name: 'Botu Hemen Çalıştır (Tek Sefer)', value: 'run-once' },
          { name: isHeadless ? 'Tarayıcıyı Görünür Yap (şu an gizli)' : 'Tarayıcıyı Gizle (şu an görünür)', value: 'toggle-headless' },
          { name: 'Ayarları Düzenle', value: 'config' },
          { name: 'Logları Görüntüle', value: 'logs' },
          { name: 'Logları Temizle', value: 'clear-logs' },
          { name: 'Ekran Görüntülerini Temizle', value: 'clear-screenshots' },
          { name: 'Engellenen Siteleri Görüntüle', value: 'blocked' },
          { name: 'Engellenen Site Kayıtlarını Temizle', value: 'clear-blocked' },
          { name: 'HTTPS Oturumları', value: 'https' },
          { name: 'HTTPS Proxy Ayarları', value: 'proxy-settings' },
          { name: 'User-Agent Ayarları', value: 'user-agent' },
          { name: 'Yardım', value: 'help' },
          { name: 'Çıkış', value: 'exit' }
        ]
      }
    ]);
    
    if (action === 'exit') {
      console.log(chalk.green('Programdan çıkılıyor...'));
      break;
    }
    
    if (action === 'toggle-headless') {
      // Tarayıcı görünürlüğünü değiştir
      config.browser = config.browser || {};
      config.browser.headless = !config.browser.headless;
      
      if (writeConfig(config)) {
        console.log(chalk.green(
          config.browser.headless 
            ? 'Tarayıcı artık gizli modda çalışacak.' 
            : 'Tarayıcı artık görünür modda çalışacak.'
        ));
      }
      continue;
    }
    
    if (action === 'start') {
      const { mode } = await inquirer.prompt([
        {
          type: 'list',
          name: 'mode',
          message: 'Botu nasıl başlatmak istiyorsunuz?',
          choices: [
            { name: 'Arka Planda (daemon)', value: 'background' },
            { name: 'Ön Planda (konsolu meşgul eder)', value: 'foreground' }
          ]
        }
      ]);
      
      await startBot(mode === 'foreground');
      if (mode === 'foreground') {
        // Foreground modunda çalıştırıldıysa, program bu noktada sonlanır
        break;
      }
    } else if (action === 'run-once') {
      await runOnce();
    } else if (action === 'logs') {
      const { logType, lineCount } = await inquirer.prompt([
        {
          type: 'list',
          name: 'logType',
          message: 'Hangi logları görüntülemek istiyorsunuz?',
          choices: [
            { name: 'Tüm Loglar', value: 'all' },
            { name: 'Sadece Hatalar', value: 'errors' },
            { name: 'Trafik Logları', value: 'traffic' }
          ]
        },
        {
          type: 'input',
          name: 'lineCount',
          message: 'Kaç satır log görüntülemek istiyorsunuz?',
          default: '50',
          when: (answers) => answers.logType !== 'traffic'
        }
      ]);
      
      if (logType === 'traffic') {
        await showTrafficLogs();
      } else {
        showLogs(logType === 'errors', lineCount);
      }
    } else if (action === 'clear-logs') {
      // Logları temizleme işlemi
      await clearLogs();
    } else if (action === 'clear-screenshots') {
      // Ekran görüntülerini temizleme işlemi
      await clearScreenshots();
    } else if (action === 'blocked') {
      await showBlockedSites();
    } else if (action === 'clear-blocked') {
      await clearBlockedRecords();
    } else if (action === 'https') {
      await showHttpsSessions();
    } else if (action === 'proxy-settings') {
      // HTTPS Proxy ayarları
      const { httpsProxyEnabled } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'httpsProxyEnabled',
          message: 'HTTPS Proxy (Man-in-the-Middle) etkinleştirilsin mi?',
          default: config.logging.httpsProxy === true
        }
      ]);
      
      config.logging.httpsProxy = httpsProxyEnabled;
      
      if (httpsProxyEnabled) {
        const { httpsProxyPort } = await inquirer.prompt([
          {
            type: 'input',
            name: 'httpsProxyPort',
            message: 'HTTPS Proxy port numarası:',
            default: config.logging.httpsProxyPort || 8080,
            validate: (input) => {
              const port = parseInt(input);
              return (!isNaN(port) && port > 0 && port < 65536) || 'Geçerli bir port numarası girin (1-65535)';
            }
          }
        ]);
        
        config.logging.httpsProxyPort = parseInt(httpsProxyPort);
        
        console.log(chalk.yellow('\nHTTPS Proxy (Man-in-the-Middle) Hakkında Bilgi:'));
        console.log(chalk.cyan('- Bu özellik, şifreli HTTPS trafiğini çözümleyip incelemenizi sağlar'));
        console.log(chalk.cyan('- HTTPS içeriğini görmek için sisteminize özel oluşturulan sertifikayı yüklemeniz gerekebilir'));
        console.log(chalk.cyan('- Proxy, certs/ dizininde bir sertifika oluşturur ve kullanır'));
        console.log(chalk.cyan('- http-mitm-proxy paketi gereklidir (npm install http-mitm-proxy)\n'));
      }
      
      if (writeConfig(config)) {
        console.log(chalk.green('HTTPS Proxy ayarları güncellendi'));
        console.log(chalk.green(`HTTPS Proxy: ${httpsProxyEnabled ? 'Etkin (Port: ' + config.logging.httpsProxyPort + ')' : 'Devre dışı'}`));
      }
    } else if (action === 'user-agent') {
      // User-Agent yönetimi komutu
      const { rotationEnabled } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'rotationEnabled',
          message: 'User-Agent rotasyonunu etkinleştirmek istiyor musunuz?',
          default: config.browser?.userAgentRotation === true
        }
      ]);
      
      config.browser = config.browser || {};
      config.browser.userAgentRotation = rotationEnabled;
      
      if (writeConfig(config)) {
        console.log(chalk.green(`User-Agent rotasyonu ${rotationEnabled ? 'etkinleştirildi' : 'devre dışı bırakıldı'}.`));
      }
    } else if (action === 'help') {
      console.log(chalk.yellow('\nSite Ziyaretçi Bot - Yardım'));
      console.log(chalk.cyan('Bu bot verilen siteleri otomatik olarak ziyaret eder ve her sitede belirtilen süre kadar kalır.'));
      console.log(chalk.cyan('Bot, config.json dosyasında belirtilen ayarlara göre çalışır.'));
      console.log(chalk.cyan('Ayarları düzenlemek için "Ayarları Düzenle" seçeneğini kullanabilirsiniz.'));
      console.log(chalk.cyan('Botu başlatmak için "Botu Başlat" veya "Botu Hemen Çalıştır" seçeneklerini kullanabilirsiniz.'));
      console.log(chalk.cyan('Logları görüntülemek için "Logları Görüntüle" seçeneğini kullanabilirsiniz.'));
    } else if (action === 'config') {
      // Ayarları düzenleme menüsü
      const { configAction } = await inquirer.prompt([
        {
          type: 'list',
          name: 'configAction',
          message: 'Hangi ayarları düzenlemek istiyorsunuz?',
          choices: [
            { name: 'Site listesini düzenle', value: 'sites' },
            { name: 'Site ziyaret süresini ayarla', value: 'siteDuration' },
            { name: 'Maksimum site ziyaret süresini ayarla', value: 'siteTimeout' },
            { name: 'Sonsuz modu ayarla', value: 'infiniteMode' },
            { name: 'Zamanlama ayarlarını düzenle', value: 'schedule' },
            { name: 'Tarayıcı ayarlarını düzenle', value: 'browser' },
            { name: 'İnsan davranışı ayarlarını düzenle', value: 'humanBehavior' },
            { name: 'Log ayarlarını düzenle', value: 'logging' },
            { name: 'HTTPS Proxy ayarlarını düzenle', value: 'httpsProxy' },
            { name: 'Tüm yapılandırmayı göster', value: 'show' },
            { name: 'Ana menüye dön', value: 'back' }
          ]
        }
      ]);
      
      if (configAction === 'back') {
        continue;
      }
      
      if (configAction === 'sites') {
        // Site listesi düzenleme
        const { option } = await inquirer.prompt([
          {
            type: 'list',
            name: 'option',
            message: 'Site listesi için:',
            choices: [
              { name: 'Mevcut siteleri göster', value: 'show' },
              { name: 'Yeni site ekle', value: 'add' },
              { name: 'Site sil', value: 'remove' },
              { name: 'Siteleri sıfırla', value: 'reset' },
              { name: 'Site ziyaret süresini ayarla', value: 'duration' }
            ]
          }
        ]);
        
        if (option === 'show') {
          console.log(chalk.yellow('Mevcut Siteler:'));
          config.sites.forEach((site, index) => {
            console.log(`${index + 1}. ${site}`);
          });
        } else if (option === 'add') {
          const { url } = await inquirer.prompt([
            {
              type: 'input',
              name: 'url',
              message: 'Eklenecek site URL\'sini girin:',
              validate: (input) => {
                try {
                  new URL(input);
                  return true;
                } catch (error) {
                  return 'Geçerli bir URL girin (http:// veya https:// ile başlamalı)';
                }
              }
            }
          ]);
          
          config.sites.push(url);
          if (writeConfig(config)) {
            console.log(chalk.green(`${url} başarıyla eklendi`));
          }
        } else if (option === 'remove') {
          const choices = config.sites.map((site, index) => ({
            name: site,
            value: index
          }));
          
          if (choices.length === 0) {
            console.log(chalk.yellow('Silinecek site yok'));
            continue;
          }
          
          const { siteIndex } = await inquirer.prompt([
            {
              type: 'list',
              name: 'siteIndex',
              message: 'Silinecek siteyi seçin:',
              choices
            }
          ]);
          
          const removedSite = config.sites.splice(siteIndex, 1)[0];
          if (writeConfig(config)) {
            console.log(chalk.green(`${removedSite} başarıyla silindi`));
          }
        } else if (option === 'reset') {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: 'Tüm site listesini sıfırlamak istediğinizden emin misiniz?',
              default: false
            }
          ]);
          
          if (confirm) {
            config.sites = [];
            if (writeConfig(config)) {
              console.log(chalk.green('Site listesi başarıyla sıfırlandı'));
            }
          }
        } else if (option === 'duration') {
          const { siteDuration } = await inquirer.prompt([
            {
              type: 'input',
              name: 'siteDuration',
              message: 'Her site için ziyaret süresini (milisaniye cinsinden) girin:',
              default: config.siteDuration || 60000,
              validate: (input) => !isNaN(input) || 'Geçerli bir sayı girin'
            }
          ]);
          
          config.siteDuration = parseInt(siteDuration);
          
          if (writeConfig(config)) {
            console.log(chalk.green(`Site ziyaret süresi ${siteDuration} milisaniye olarak ayarlandı (${siteDuration/1000} saniye)`));
          }
        }
      } else if (configAction === 'schedule') {
        // Zamanlama ayarları
        const { scheduleEnabled } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'scheduleEnabled',
            message: 'Zamanlanmış çalışmayı etkinleştirmek istiyor musunuz?',
            default: config.schedule.enabled
          }
        ]);
        
        config.schedule.enabled = scheduleEnabled;
        
        if (scheduleEnabled) {
          const { startTime, endTime } = await inquirer.prompt([
            {
              type: 'input',
              name: 'startTime',
              message: 'Başlangıç saati (ÖR: 09:00):',
              default: config.schedule.startTime,
              validate: (input) => {
                return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(input) || 'Geçerli bir saat girin (SS:DD)';
              }
            },
            {
              type: 'input',
              name: 'endTime',
              message: 'Bitiş saati (ÖR: 17:00):',
              default: config.schedule.endTime,
              validate: (input) => {
                return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(input) || 'Geçerli bir saat girin (SS:DD)';
              }
            }
          ]);
          
          config.schedule.startTime = startTime;
          config.schedule.endTime = endTime;
          
          const dayChoices = [
            { name: 'Pazartesi', value: 'monday' },
            { name: 'Salı', value: 'tuesday' },
            { name: 'Çarşamba', value: 'wednesday' },
            { name: 'Perşembe', value: 'thursday' },
            { name: 'Cuma', value: 'friday' },
            { name: 'Cumartesi', value: 'saturday' },
            { name: 'Pazar', value: 'sunday' }
          ];
          
          const { days } = await inquirer.prompt([
            {
              type: 'checkbox',
              name: 'days',
              message: 'Çalışacağı günleri seçin:',
              choices: dayChoices,
              default: config.schedule.days
            }
          ]);
          
          config.schedule.days = days;
        }
        
        if (writeConfig(config)) {
          console.log(chalk.green('Zamanlama ayarları güncellendi'));
        }
      } else if (configAction === 'browser') {
        // Tarayıcı ayarları
        const { headless } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'headless',
            message: 'Tarayıcı arka planda mı çalışsın (headless mod)?',
            default: config.browser.headless
          }
        ]);
        
        config.browser.headless = headless;
        
        const { width, height } = await inquirer.prompt([
          {
            type: 'input',
            name: 'width',
            message: 'Tarayıcı pencere genişliği:',
            default: config.browser.windowSize.width,
            validate: (input) => !isNaN(input) || 'Sayısal bir değer girin'
          },
          {
            type: 'input',
            name: 'height',
            message: 'Tarayıcı pencere yüksekliği:',
            default: config.browser.windowSize.height,
            validate: (input) => !isNaN(input) || 'Sayısal bir değer girin'
          }
        ]);
        
        config.browser.windowSize.width = parseInt(width);
        config.browser.windowSize.height = parseInt(height);
        
        // User-Agent ayarları
        const { userAgentRotation } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'userAgentRotation',
            message: 'User-Agent rotasyonunu etkinleştirmek istiyor musunuz?',
            default: config.browser.userAgentRotation !== false
          }
        ]);
        
        config.browser.userAgentRotation = userAgentRotation;
        
        if (userAgentRotation) {
          const { userAgentStrategy } = await inquirer.prompt([
            {
              type: 'list',
              name: 'userAgentStrategy',
              message: 'User-Agent rotasyon stratejisini seçin:',
              choices: [
                { name: 'Rastgele - Her seferinde tamamen rastgele User-Agent', value: 'random' },
                { name: 'Sıralı - User-Agent listesini sırayla kullan', value: 'sequential' },
                { name: 'Akıllı - Ziyaret edilen siteye göre uygun User-Agent seç', value: 'smart' }
              ],
              default: config.browser.userAgentStrategy || 'random'
            }
          ]);
          
          config.browser.userAgentStrategy = userAgentStrategy;
          
          console.log(chalk.yellow('\nUser-Agent Rotasyonu Hakkında Bilgi:'));
          console.log(chalk.cyan('- Daha detaylı ayarlar için ana menüden "User-Agent Ayarları" seçeneğini kullanabilirsiniz'));
          console.log(chalk.cyan('- Özel User-Agent\'lar eklemek veya mevcut listeyi görmek için bu seçeneği kullanın'));
        }
        
        if (writeConfig(config)) {
          console.log(chalk.green('Tarayıcı ayarları güncellendi'));
        }
      } else if (configAction === 'humanBehavior') {
        // İnsan davranışları ayarları
        const { scroll, randomClicks, moveMouseRandomly } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'scroll',
            message: 'Otomatik scroll özelliği aktif olsun mu?',
            default: config.humanBehavior.scroll
          },
          {
            type: 'confirm',
            name: 'randomClicks',
            message: 'Rastgele tıklama özelliği aktif olsun mu?',
            default: config.humanBehavior.randomClicks
          },
          {
            type: 'confirm',
            name: 'moveMouseRandomly',
            message: 'Rastgele fare hareketi özelliği aktif olsun mu?',
            default: config.humanBehavior.moveMouseRandomly
          }
        ]);
        
        config.humanBehavior.scroll = scroll;
        config.humanBehavior.randomClicks = randomClicks;
        config.humanBehavior.moveMouseRandomly = moveMouseRandomly;
        
        if (writeConfig(config)) {
          console.log(chalk.green('İnsan davranışı ayarları güncellendi'));
        }
      } else if (configAction === 'logging') {
        // Log ayarları
        const logLevels = ['error', 'warn', 'info', 'debug', 'silly'];
        
        const { level, saveToFile } = await inquirer.prompt([
          {
            type: 'list',
            name: 'level',
            message: 'Log seviyesini seçin:',
            choices: logLevels,
            default: logLevels.indexOf(config.logging.level)
          },
          {
            type: 'confirm',
            name: 'saveToFile',
            message: 'Logları dosyaya kaydetmek istiyor musunuz?',
            default: config.logging.saveToFile
          }
        ]);
        
        config.logging.level = level;
        config.logging.saveToFile = saveToFile;
        
        if (saveToFile) {
          const { logFilePath } = await inquirer.prompt([
            {
              type: 'input',
              name: 'logFilePath',
              message: 'Log dosyalarının kaydedileceği dizin:',
              default: config.logging.logFilePath
            }
          ]);
          
          config.logging.logFilePath = logFilePath;
        }

        // HTTPS Proxy ayarlarını ekle
        const { httpsProxyEnabled } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'httpsProxyEnabled',
            message: 'HTTPS Proxy (Man-in-the-Middle) etkinleştirilsin mi?',
            default: config.logging.httpsProxy === true
          }
        ]);
        
        config.logging.httpsProxy = httpsProxyEnabled;
        
        if (httpsProxyEnabled) {
          const { httpsProxyPort } = await inquirer.prompt([
            {
              type: 'input',
              name: 'httpsProxyPort',
              message: 'HTTPS Proxy port numarası:',
              default: config.logging.httpsProxyPort || 8080,
              validate: (input) => {
                const port = parseInt(input);
                return (!isNaN(port) && port > 0 && port < 65536) || 'Geçerli bir port numarası girin (1-65535)';
              }
            }
          ]);
          
          config.logging.httpsProxyPort = parseInt(httpsProxyPort);
          
          console.log(chalk.yellow('\nHTTPS Proxy (Man-in-the-Middle) Hakkında Bilgi:'));
          console.log(chalk.cyan('- Bu özellik, şifreli HTTPS trafiğini çözümleyip incelemenizi sağlar'));
          console.log(chalk.cyan('- HTTPS içeriğini görmek için sisteminize özel oluşturulan sertifikayı yüklemeniz gerekebilir'));
          console.log(chalk.cyan('- Proxy, certs/ dizininde bir sertifika oluşturur ve kullanır'));
          console.log(chalk.cyan('- http-mitm-proxy paketi gereklidir (npm install http-mitm-proxy)\n'));
        }
        
        if (writeConfig(config)) {
          console.log(chalk.green('Log ve HTTPS Proxy ayarları güncellendi'));
          console.log(chalk.green(`HTTPS Proxy: ${httpsProxyEnabled ? 'Etkin (Port: ' + config.logging.httpsProxyPort + ')' : 'Devre dışı'}`));
        }
      } else if (configAction === 'httpsProxy') {
        // HTTPS Proxy ayarlarını düzenle
        const { httpsProxyEnabled } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'httpsProxyEnabled',
            message: 'HTTPS Proxy (Man-in-the-Middle) etkinleştirilsin mi?',
            default: config.logging.httpsProxy === true
          }
        ]);
        
        config.logging.httpsProxy = httpsProxyEnabled;
        
        if (httpsProxyEnabled) {
          const { httpsProxyPort } = await inquirer.prompt([
            {
              type: 'input',
              name: 'httpsProxyPort',
              message: 'HTTPS Proxy port numarası:',
              default: config.logging.httpsProxyPort || 8080,
              validate: (input) => {
                const port = parseInt(input);
                return (!isNaN(port) && port > 0 && port < 65536) || 'Geçerli bir port numarası girin (1-65535)';
              }
            }
          ]);
          
          config.logging.httpsProxyPort = parseInt(httpsProxyPort);
          
          console.log(chalk.yellow('\nHTTPS Proxy (Man-in-the-Middle) Hakkında Bilgi:'));
          console.log(chalk.cyan('- Bu özellik, şifreli HTTPS trafiğini çözümleyip incelemenizi sağlar'));
          console.log(chalk.cyan('- HTTPS içeriğini görmek için sisteminize özel oluşturulan sertifikayı yüklemeniz gerekebilir'));
          console.log(chalk.cyan('- Proxy, certs/ dizininde bir sertifika oluşturur ve kullanır'));
          console.log(chalk.cyan('- http-mitm-proxy paketi gereklidir (npm install http-mitm-proxy)\n'));
        }
        
        if (writeConfig(config)) {
          console.log(chalk.green('HTTPS Proxy ayarları güncellendi'));
          console.log(chalk.green(`HTTPS Proxy: ${httpsProxyEnabled ? 'Etkin (Port: ' + config.logging.httpsProxyPort + ')' : 'Devre dışı'}`));
        }
      } else if (configAction === 'show') {
        // Tüm yapılandırmayı göster
        console.log(chalk.yellow('Mevcut Yapılandırma:'));
        console.log(JSON.stringify(config, null, 2));
      } else if (configAction === 'siteDuration') {
        // Site ziyaret süresi ayarı
        const { siteDuration } = await inquirer.prompt([
          {
            type: 'input',
            name: 'siteDuration',
            message: 'Her site için ziyaret süresini (milisaniye cinsinden) girin:',
            default: config.siteDuration || 60000,
            validate: (input) => !isNaN(input) || 'Geçerli bir sayı girin'
          }
        ]);
        
        config.siteDuration = parseInt(siteDuration);
        
        if (writeConfig(config)) {
          console.log(chalk.green(`Site ziyaret süresi ${siteDuration} milisaniye olarak ayarlandı (${siteDuration/1000} saniye)`));
        }
      } else if (configAction === 'siteTimeout') {
        // Maksimum site ziyaret süresi ayarı
        const { siteTimeout } = await inquirer.prompt([
          {
            type: 'input',
            name: 'siteTimeout',
            message: 'Her site için maksimum ziyaret süresini (milisaniye cinsinden) girin:',
            default: config.siteTimeout || (config.siteDuration * 3) || 180000,
            validate: (input) => !isNaN(input) || 'Geçerli bir sayı girin'
          }
        ]);
        
        config.siteTimeout = parseInt(siteTimeout);
        
        if (writeConfig(config)) {
          console.log(chalk.green(`Maksimum site ziyaret süresi ${siteTimeout} milisaniye olarak ayarlandı (${siteTimeout/1000} saniye)`));
          
          // Süre kontrolü yap ve uyarı ver
          if (config.siteTimeout < config.siteDuration) {
            console.log(chalk.yellow(`UYARI: Maksimum süre (${siteTimeout}ms), normal ziyaret süresinden (${config.siteDuration}ms) daha kısa!`));
            console.log(chalk.yellow('Bu, sitelerin her zaman zaman aşımına uğramasına neden olabilir.'));
          }
        }
      } else if (configAction === 'infiniteMode') {
        // Sonsuz mod ayarı
        const { infiniteMode } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'infiniteMode',
            message: 'Sonsuz modu etkinleştirmek istiyor musunuz? (Bot durdurulana kadar siteleri ziyaret etmeye devam eder)',
            default: config.infiniteMode || false
          }
        ]);
        
        config.infiniteMode = infiniteMode;
        
        if (writeConfig(config)) {
          console.log(chalk.green(`Sonsuz mod ${infiniteMode ? 'etkinleştirildi' : 'devre dışı bırakıldı'}`));
        }
      }
    }
  }
};

// Engellenen site kayıtlarını temizleme fonksiyonu
const clearBlockedRecords = async () => {
  const config = readConfig();
  const blockedDir = path.join(__dirname, config.logging?.blockedScreenshotPath || 'logs/blocked');
  const blockReportsDir = path.join(__dirname, 'logs/block_reports');
  
  const hasPngFiles = fs.existsSync(blockedDir) && 
                     fs.readdirSync(blockedDir).some(file => file.endsWith('.png'));
  
  const hasReportFiles = fs.existsSync(blockedDir) && 
                         fs.readdirSync(blockedDir).some(file => file.startsWith('block_report_'));
  
  const hasBlockReportFiles = fs.existsSync(blockReportsDir) && 
                             fs.readdirSync(blockReportsDir).some(file => file.startsWith('block_report_'));
  
  if (!hasPngFiles && !hasReportFiles && !hasBlockReportFiles) {
    console.log(chalk.yellow('Henüz engellenen site kaydı bulunmuyor.'));
    return;
  }
  
  console.log(chalk.blue('\nEngellenen Site Kayıtlarını Temizleme:'));
  console.log(chalk.blue('-----------------------------------'));
  
  // Kullanıcıya hangi dosya türlerini silmek istediğini sor
  const { recordTypes } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'recordTypes',
      message: 'Hangi kayıt türlerini temizlemek istiyorsunuz?',
      choices: [
        { name: 'Ekran görüntüleri (PNG dosyaları)', value: 'screenshots', checked: hasPngFiles },
        { name: 'Eski engel raporları (logs/blocked içindeki JSON dosyaları)', value: 'old_reports', checked: hasReportFiles },
        { name: 'Yeni engel raporları (logs/block_reports içindeki JSON dosyaları)', value: 'new_reports', checked: hasBlockReportFiles }
      ].filter(choice => choice.checked) // Sadece dosyaları olanları göster
    }
  ]);
  
  if (recordTypes.length === 0) {
    console.log(chalk.yellow('Temizlenecek kayıt türü seçilmedi.'));
    return;
  }
  
  // Ekstra onay iste
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Seçilen kayıtları gerçekten silmek istiyor musunuz? Bu işlem geri alınamaz!',
      default: false
    }
  ]);
  
  if (!confirm) {
    console.log(chalk.yellow('İşlem iptal edildi.'));
    return;
  }
  
  let deletedFiles = 0;
  
  try {
    // Ekran görüntülerini temizle
    if (recordTypes.includes('screenshots') && fs.existsSync(blockedDir)) {
      const screenshots = fs.readdirSync(blockedDir)
        .filter(file => file.endsWith('.png'));
      
      for (const file of screenshots) {
        fs.unlinkSync(path.join(blockedDir, file));
        console.log(chalk.green(`Ekran görüntüsü silindi: ${file}`));
        deletedFiles++;
      }
    }
    
    // Eski rapor dosyalarını temizle (blocked dizinindekiler)
    if (recordTypes.includes('old_reports') && fs.existsSync(blockedDir)) {
      const reports = fs.readdirSync(blockedDir)
        .filter(file => file.startsWith('block_report_') && file.endsWith('.json'));
      
      for (const file of reports) {
        fs.unlinkSync(path.join(blockedDir, file));
        console.log(chalk.green(`Eski engel raporu silindi: ${file}`));
        deletedFiles++;
      }
    }
    
    // Yeni rapor dosyalarını temizle (block_reports dizinindekiler)
    if (recordTypes.includes('new_reports') && fs.existsSync(blockReportsDir)) {
      const reports = fs.readdirSync(blockReportsDir)
        .filter(file => file.startsWith('block_report_') && file.endsWith('.json'));
      
      for (const file of reports) {
        fs.unlinkSync(path.join(blockReportsDir, file));
        console.log(chalk.green(`Yeni engel raporu silindi: ${file}`));
        deletedFiles++;
      }
    }
    
    console.log(chalk.blue('\n-----------------------------------'));
    console.log(chalk.green(`Toplam ${deletedFiles} adet engellenen site kaydı silindi.`));
    console.log(chalk.blue('-----------------------------------\n'));
    
  } catch (error) {
    console.error(chalk.red(`Kayıtları temizlerken hata oluştu: ${error.message}`));
  }
};

// CLI giriş noktası
program
  .name('site-visitor-bot')
  .description('Otomatik site ziyaret botu için CLI arayüzü')
  .version('1.0.0');

// Etkileşimli menü modu
program
  .command('menu')
  .description('Etkileşimli menü arayüzünü başlat')
  .action(runInteractiveMenu);

// Botu başlat
program
  .command('start')
  .description('Botu başlat')
  .option('-f, --foreground', 'Ön planda çalıştır (daemon değil)')
  .action(async (options) => {
    await startBot(options.foreground);
  });

// Hemen bir kez çalıştır
program
  .command('run-once')
  .description('Siteleri bir kez ziyaret et ve kapat')
  .action(runOnce);

// Config dosyasını düzenle
program
  .command('config')
  .description('Bot ayarlarını düzenle')
  .action(async () => {
    // Eski config komutu yerine etkileşimli menüyü başlat
    await runInteractiveMenu();
  });

// Logları göster
program
  .command('logs')
  .description('Bot loglarını görüntüle')
  .option('-e, --errors', 'Sadece hataları göster')
  .option('-n, --lines <number>', 'Gösterilecek satır sayısı', '50')
  .action((options) => {
    showLogs(options.errors, options.lines);
  });

// Logları temizle
program
  .command('clear-logs')
  .description('Log dosyalarını temizle')
  .action(async () => {
    await clearLogs();
  });

// Ekran görüntülerini temizle
program
  .command('clear-screenshots')
  .description('Ekran görüntülerini temizle')
  .action(async () => {
    await clearScreenshots();
  });

// HTTPS Proxy durumunu göster ve düzenle
program
  .command('proxy-status')
  .description('HTTPS Proxy (Man-in-the-Middle) durumunu görüntüle ve ayarla')
  .action(async () => {
    const config = readConfig();
    const proxyEnabled = config.logging?.httpsProxy === true;
    const proxyPort = config.logging?.httpsProxyPort || 8080;
    
    console.log(chalk.blue('\nHTTPS Proxy (Man-in-the-Middle) Durumu:'));
    console.log(chalk.blue('-----------------------------------'));
    console.log(chalk.green('Durum:'), proxyEnabled ? chalk.green('Etkin') : chalk.red('Devre dışı'));
    console.log(chalk.green('Port:'), proxyPort);
    console.log(chalk.green('Log Dizini:'), config.logging?.httpsLogPath || 'logs/https');
    console.log(chalk.blue('-----------------------------------\n'));
    
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Ne yapmak istiyorsunuz?',
        choices: [
          { name: proxyEnabled ? 'Proxy\'yi devre dışı bırak' : 'Proxy\'yi etkinleştir', value: 'toggle' },
          { name: 'Port numarasını değiştir', value: 'port' },
          { name: 'Kurulum bilgilerini göster', value: 'info' },
          { name: 'Ana menüye dön', value: 'back' }
        ]
      }
    ]);
    
    if (action === 'back') {
      return;
    }
    
    if (action === 'toggle') {
      // Proxy durumunu değiştir
      config.logging = config.logging || {};
      config.logging.httpsProxy = !proxyEnabled;
      
      if (writeConfig(config)) {
        console.log(chalk.green(`HTTPS Proxy ${proxyEnabled ? 'devre dışı bırakıldı' : 'etkinleştirildi'}.`));
        
        if (!proxyEnabled) {
          console.log(chalk.yellow('\nÖnemli Not:'));
          console.log(chalk.cyan('- HTTPS Proxy\'nin çalışması için http-mitm-proxy paketinin kurulu olması gerekiyor'));
          console.log(chalk.cyan('- Kurulu değilse şu komutu çalıştırın: npm install http-mitm-proxy'));
          console.log(chalk.cyan('- Bot bir sonraki çalıştırılışında proxy otomatik olarak başlayacaktır\n'));
        }
      }
    } else if (action === 'port') {
      // Port değiştir
      const { newPort } = await inquirer.prompt([
        {
          type: 'input',
          name: 'newPort',
          message: 'Yeni port numarasını girin:',
          default: proxyPort,
          validate: (input) => {
            const port = parseInt(input);
            return (!isNaN(port) && port > 0 && port < 65536) || 'Geçerli bir port numarası girin (1-65535)';
          }
        }
      ]);
      
      config.logging = config.logging || {};
      config.logging.httpsProxyPort = parseInt(newPort);
      
      if (writeConfig(config)) {
        console.log(chalk.green(`HTTPS Proxy portu ${newPort} olarak güncellendi.`));
      }
    } else if (action === 'info') {
      // Kurulum bilgilerini göster
      console.log(chalk.yellow('\nHTTPS Proxy Kurulum ve Kullanım Bilgileri:'));
      console.log(chalk.cyan('- Bu özellik, şifreli HTTPS trafiğini çözümleyip incelemenizi sağlar'));
      console.log(chalk.cyan('- HTTPS içeriğini görmek için sisteminize özel oluşturulan sertifikayı yüklemeniz gerekebilir'));
      console.log(chalk.cyan('- Sertifikalar certs/ dizininde oluşturulur'));
      console.log(chalk.cyan('- Gerekli paket: npm install http-mitm-proxy'));
      console.log(chalk.cyan('- Proxy ayarları, Chrome başlatılırken otomatik olarak uygulanır'));
      console.log(chalk.cyan('- HTTPS trafiği, yakalandıktan sonra logs/https dizinine kaydedilir'));
      console.log(chalk.cyan('- Bu özelliği sadece test ve analiz amaçlı kullanın\n'));
    }
  });

// User-Agent yönetimi komutu
program
  .command('user-agent')
  .description('User-Agent rotasyonu ve yönetimini ayarla')
  .action(async () => {
    const config = readConfig();
    const rotationEnabled = config.browser?.userAgentRotation === true;
    const strategy = config.browser?.userAgentStrategy || 'random';
    
    // data dizinini ve user-agent.json dosyasını kontrol et
    const dataDir = path.join(__dirname, 'data');
    const userAgentFile = path.join(dataDir, 'user-agents.json');
    
    // Data dizini yoksa oluştur
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    console.log(chalk.blue('\nUser-Agent Rotasyonu Durumu:'));
    console.log(chalk.blue('-----------------------------------'));
    console.log(chalk.green('Durum:'), rotationEnabled ? chalk.green('Etkin') : chalk.red('Devre dışı'));
    console.log(chalk.green('Strateji:'), strategy);
    
    // UserAgentManager'ı oluştur ve istatistikleri al
    const userAgentManager = new (require('./lib/userAgentManager'))({
      enabled: rotationEnabled,
      rotationStrategy: strategy,
      userAgentFile: userAgentFile
    });
    
    const stats = userAgentManager.getStats();
    console.log(chalk.green('Toplam User-Agent:'), stats.total);
    console.log(chalk.green('Masaüstü:'), stats.desktop);
    console.log(chalk.green('Mobil:'), stats.mobile);
    console.log(chalk.blue('-----------------------------------\n'));
    
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Ne yapmak istiyorsunuz?',
        choices: [
          { name: rotationEnabled ? 'User-Agent rotasyonunu devre dışı bırak' : 'User-Agent rotasyonunu etkinleştir', value: 'toggle' },
          { name: 'Rotasyon stratejisini değiştir', value: 'strategy' },
          { name: 'User-Agent listesini görüntüle', value: 'list' },
          { name: 'Özel User-Agent ekle', value: 'add' },
          { name: 'Bilgileri göster', value: 'info' },
          { name: 'Ana menüye dön', value: 'back' }
        ]
      }
    ]);
    
    if (action === 'back') {
      return;
    }
    
    if (action === 'toggle') {
      // User-Agent rotasyonu durumunu değiştir
      config.browser = config.browser || {};
      config.browser.userAgentRotation = !rotationEnabled;
      
      if (writeConfig(config)) {
        console.log(chalk.green(`User-Agent rotasyonu ${rotationEnabled ? 'devre dışı bırakıldı' : 'etkinleştirildi'}.`));
      }
    } else if (action === 'strategy') {
      // Strateji değiştir
      const { newStrategy } = await inquirer.prompt([
        {
          type: 'list',
          name: 'newStrategy',
          message: 'User-Agent rotasyon stratejisini seçin:',
          choices: [
            { name: 'Rastgele - Her seferinde tamamen rastgele User-Agent', value: 'random' },
            { name: 'Sıralı - User-Agent listesini sırayla kullan', value: 'sequential' },
            { name: 'Akıllı - Ziyaret edilen siteye göre uygun User-Agent seç', value: 'smart' }
          ],
          default: strategy
        }
      ]);
      
      config.browser = config.browser || {};
      config.browser.userAgentStrategy = newStrategy;
      
      if (writeConfig(config)) {
        console.log(chalk.green(`User-Agent rotasyon stratejisi "${newStrategy}" olarak güncellendi.`));
      }
    } else if (action === 'list') {
      // User-Agent listesini görüntüle
      const detailedStats = userAgentManager.getDetailedStats();
      
      console.log(chalk.blue('\nUser-Agent Kategorileri:'));
      console.log(chalk.blue('-----------------------------------'));
      
      // Masaüstü tarayıcılar
      console.log(chalk.yellow('\nMasaüstü Tarayıcılar:'));
      for (const browser in detailedStats.desktop) {
        console.log(chalk.green(`  ${browser}:`), detailedStats.desktop[browser]);
      }
      
      // Mobil tarayıcılar
      console.log(chalk.yellow('\nMobil Platformlar:'));
      for (const platform in detailedStats.mobile) {
        console.log(chalk.green(`  ${platform}:`), detailedStats.mobile[platform]);
      }
      
      // Özel tarayıcılar
      console.log(chalk.yellow('\nÖzel User-Agents:'));
      for (const category in detailedStats.special) {
        console.log(chalk.green(`  ${category}:`), detailedStats.special[category]);
      }
      
      // Örnekleri göster
      console.log(chalk.blue('\n-----------------------------------'));
      const { showExamples } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'showExamples',
          message: 'Bazı User-Agent örneklerini görmek ister misiniz?',
          default: true
        }
      ]);
      
      if (showExamples) {
        // Her kategoriden 1 örnek göster
        console.log(chalk.yellow('\nBazı User-Agent Örnekleri:'));
        
        // Masaüstü örnekleri
        console.log(chalk.blue('\nMasaüstü:'));
        for (const browser in userAgentManager.userAgents.desktop) {
          const agents = userAgentManager.userAgents.desktop[browser];
          if (agents && agents.length > 0) {
            console.log(chalk.green(`${browser}:`), agents[0]);
          }
        }
        
        // Mobil örnekleri
        console.log(chalk.blue('\nMobil:'));
        for (const platform in userAgentManager.userAgents.mobile) {
          const agents = userAgentManager.userAgents.mobile[platform];
          if (agents && agents.length > 0) {
            console.log(chalk.green(`${platform}:`), agents[0]);
          }
        }
      }
    } else if (action === 'add') {
      // Özel User-Agent ekle
      const { deviceType, browser, userAgentString } = await inquirer.prompt([
        {
          type: 'list',
          name: 'deviceType',
          message: 'Hangi cihaz kategorisi için User-Agent eklemek istiyorsunuz?',
          choices: [
            { name: 'Masaüstü Tarayıcı', value: 'desktop' },
            { name: 'Mobil Cihaz', value: 'mobile' },
            { name: 'Özel', value: 'special' }
          ]
        },
        {
          type: 'input',
          name: 'browser',
          message: ({ deviceType }) => {
            if (deviceType === 'desktop') return 'Tarayıcı adı (chrome, firefox, safari, edge veya özel bir ad):';
            if (deviceType === 'mobile') return 'Platform adı (android, ios veya özel bir ad):';
            return 'Kategori adı:';
          }
        },
        {
          type: 'input',
          name: 'userAgentString',
          message: 'User-Agent değerini girin:',
          validate: (input) => input.trim() !== '' || 'User-Agent boş olamaz'
        }
      ]);
      
      // User-Agent'ı ekle
      const newUserAgents = {
        [deviceType]: {
          [browser]: [userAgentString]
        }
      };
      
      if (userAgentManager.addUserAgents(newUserAgents)) {
        console.log(chalk.green('User-Agent başarıyla eklendi.'));
      } else {
        console.log(chalk.red('User-Agent eklenirken bir hata oluştu.'));
      }
    } else if (action === 'info') {
      // Bilgileri göster
      console.log(chalk.yellow('\nUser-Agent Rotasyonu Hakkında Bilgi:'));
      console.log(chalk.cyan('- Bu özellik, her site ziyaretinde farklı bir tarayıcı/işletim sistemi kimliği kullanılmasını sağlar'));
      console.log(chalk.cyan('- Engelleme tespitini zorlaştırır ve bot algılama sistemlerini atlatmaya yardımcı olur'));
      console.log(chalk.cyan('- Üç farklı strateji kullanılabilir:'));
      console.log(chalk.cyan('  * Rastgele: Her ziyaret için tamamen rastgele bir User-Agent seçer'));
      console.log(chalk.cyan('  * Sıralı: User-Agent listesini sırayla kullanır'));
      console.log(chalk.cyan('  * Akıllı: Ziyaret edilen siteye göre en uygun User-Agent\'ı seçer'));
      console.log(chalk.cyan('- Özel User-Agent\'lar data/user-agents.json dosyasında saklanır'));
      console.log(chalk.cyan('- Her site ziyaretinde değişiklik yapılır, böylece tüm ziyaretlerin izlenmesi zorlaşır\n'));
    }
  });

// Yardım menüsü
program
  .command('help')
  .description('Yardım menüsünü göster')
  .action(() => {
    program.outputHelp();
  });

program.parse(process.argv);

// Hiçbir komut verilmezse etkileşimli menüyü başlat
if (!process.argv.slice(2).length) {
  runInteractiveMenu();
}