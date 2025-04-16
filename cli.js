#!/usr/bin/env node

const { program } = require('commander');
const inquirer = require('inquirer');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const { spawn } = require('child_process');
const { start, visitSites, runYoutubeShorts } = require('./index');

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
    
    // Config değiştiğinde bot çalışıyorsa, onu yeniden başlatmak gerekebilir
    // Config değişikliklerini logluyoruz
    console.log(chalk.green('Config dosyası güncellendi. Yeni ayarlar sonraki başlatmada aktif olacak.'));
    console.log(chalk.yellow('Aktif bir bot oturumu varsa, yeni ayarların uygulanması için botu yeniden başlatın.'));
    
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
  console.log(chalk.green('- Sonsuz mod:'), config.infiniteMode ? 'Etkin' : 'Devre dışı');
  console.log(chalk.green('- Engellenmiş site tespiti:'), config.blockDetection?.enabled !== false ? 'Etkin' : 'Devre dışı');
  console.log(chalk.green('- Ekran görüntüsü alma:'), config.blockDetection?.takeScreenshot !== false ? 'Etkin' : 'Devre dışı');
  console.log(chalk.green('- Yavaşlık eşiği (ms):'), config.blockDetection?.slowThreshold || 10000);
  
  // Zamanlama ayarlarını göster
  console.log(chalk.green('- Zamanlanmış çalışma:'), config.schedule?.enabled ? 'Etkin' : 'Devre dışı');
  if (config.schedule?.enabled) {
    console.log(chalk.green('  • Çalışma saatleri:'), `${config.schedule.startTime || '09:00'} - ${config.schedule.endTime || '17:00'}`);
    console.log(chalk.green('  • Çalışma günleri:'), config.schedule.days?.join(', ') || 'Tüm günler');
  }
  
  // Süre ayarlarını göster
  console.log(chalk.green('- Site ziyaret süresi (ms):'), config.siteDuration || 60000);
  console.log(chalk.green('- Maksimum site ziyaret süresi (ms):'), config.siteTimeout || 90000);
  console.log(chalk.green('- Toplam çalışma süresi (ms):'), config.visitDuration || 'Belirsiz');
  console.log(chalk.green('- Gecikmeler (ms):'), `Min: ${config.delay?.min || 3000}, Max: ${config.delay?.max || 8000}`);

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
        
        // Gizli/görünür mod değişimini özellikle vurgulayalım
        if (featuresToChange.includes('browser')) {
          console.log(chalk.yellow(
            `Tarayıcı modu ${config.browser.headless ? 'Gizli' : 'Görünür'} olarak ayarlandı. ` +
            'Bu ayar yalnızca bir sonraki bot başlatmada etkin olacaktır.'
          ));
        }
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
      console.log(chalk.green('- Ziyaret edilecek site sayısı:'), config.sites.length);
      console.log(chalk.green('- Sonsuz mod:'), config.infiniteMode ? 'Etkin' : 'Devre dışı');
      console.log(chalk.green('- Engellenmiş site tespiti:'), config.blockDetection?.enabled !== false ? 'Etkin' : 'Devre dışı');
      console.log(chalk.green('- Ekran görüntüsü alma:'), config.blockDetection?.takeScreenshot !== false ? 'Etkin' : 'Devre dışı');
      console.log(chalk.green('- Yavaşlık eşiği (ms):'), config.blockDetection?.slowThreshold || 10000);
      
      // Zamanlama ayarlarını göster
      console.log(chalk.green('- Zamanlanmış çalışma:'), config.schedule?.enabled ? 'Etkin' : 'Devre dışı');
      if (config.schedule?.enabled) {
        console.log(chalk.green('  • Çalışma saatleri:'), `${config.schedule.startTime || '09:00'} - ${config.schedule.endTime || '17:00'}`);
        console.log(chalk.green('  • Çalışma günleri:'), config.schedule.days?.join(', ') || 'Tüm günler');
      }
      
      // Süre ayarlarını göster
      console.log(chalk.green('- Site ziyaret süresi (ms):'), config.siteDuration || 60000);
      console.log(chalk.green('- Maksimum site ziyaret süresi (ms):'), config.siteTimeout || 90000);
      console.log(chalk.green('- Toplam çalışma süresi (ms):'), config.visitDuration || 'Belirsiz');
      console.log(chalk.green('- Gecikmeler (ms):'), `Min: ${config.delay?.min || 3000}, Max: ${config.delay?.max || 8000}`);
      
      // İnsan davranışı özellikleri
      console.log(chalk.green('- Otomatik scroll:'), config.humanBehavior?.scroll ? 'Etkin' : 'Devre dışı');
      console.log(chalk.green('- Rastgele tıklama:'), config.humanBehavior?.randomClicks ? 'Etkin' : 'Devre dışı');
      console.log(chalk.green('- Rastgele fare hareketi:'), config.humanBehavior?.moveMouseRandomly ? 'Etkin' : 'Devre dışı');
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
  console.log(chalk.green('- Tarayıcı modu:'), config.browser.headless ? chalk.yellow('Gizli (Headless)') : chalk.yellow('Görünür'));
  console.log(chalk.green('- Ziyaret edilecek site sayısı:'), config.sites.length);
  console.log(chalk.green('- Sonsuz mod:'), config.infiniteMode ? 'Etkin' : 'Devre dışı');
  console.log(chalk.green('- Engellenmiş site tespiti:'), config.blockDetection?.enabled !== false ? 'Etkin' : 'Devre dışı');
  console.log(chalk.green('- Ekran görüntüsü alma:'), config.blockDetection?.takeScreenshot !== false ? 'Etkin' : 'Devre dışı');
  console.log(chalk.green('- Yavaşlık eşiği (ms):'), config.blockDetection?.slowThreshold || 10000);
  
  // Zamanlama ayarlarını göster
  console.log(chalk.green('- Zamanlanmış çalışma:'), config.schedule?.enabled ? 'Etkin' : 'Devre dışı');
  if (config.schedule?.enabled) {
    console.log(chalk.green('  • Çalışma saatleri:'), `${config.schedule.startTime || '09:00'} - ${config.schedule.endTime || '17:00'}`);
    console.log(chalk.green('  • Çalışma günleri:'), config.schedule.days?.join(', ') || 'Tüm günler');
  }
  
  // Süre ayarlarını göster
  console.log(chalk.green('- Site ziyaret süresi (ms):'), config.siteDuration || 60000);
  console.log(chalk.green('- Maksimum site ziyaret süresi (ms):'), config.siteTimeout || 90000);
  console.log(chalk.green('- Toplam çalışma süresi (ms):'), config.visitDuration || 'Belirsiz');
  console.log(chalk.green('- Gecikmeler (ms):'), `Min: ${config.delay?.min || 3000}, Max: ${config.delay?.max || 8000}`);

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
        
        // Tarayıcı görünürlüğü değiştirildiyse özel bir uyarı göster
        if (featuresToChange.includes('browser')) {
          console.log(chalk.yellow(
            `Tarayıcı modu ${config.browser.headless ? 'Gizli' : 'Görünür'} olarak değiştirildi. ` +
            'DİKKAT: Bu değişiklik şu anki çalıştırmada etkili olmayabilir. ' +
            'Değişikliğin garantili uygulanması için botu tamamen kapatıp yeniden başlatmanız önerilir!'
          ));
        }
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
      console.log(chalk.green('- Ziyaret edilecek site sayısı:'), config.sites.length);
      console.log(chalk.green('- Sonsuz mod:'), config.infiniteMode ? 'Etkin' : 'Devre dışı');
      console.log(chalk.green('- Engellenmiş site tespiti:'), config.blockDetection?.enabled !== false ? 'Etkin' : 'Devre dışı');
      console.log(chalk.green('- Ekran görüntüsü alma:'), config.blockDetection?.takeScreenshot !== false ? 'Etkin' : 'Devre dışı');
      console.log(chalk.green('- Yavaşlık eşiği (ms):'), config.blockDetection?.slowThreshold || 10000);
      
      // Zamanlama ayarlarını göster
      console.log(chalk.green('- Zamanlanmış çalışma:'), config.schedule?.enabled ? 'Etkin' : 'Devre dışı');
      if (config.schedule?.enabled) {
        console.log(chalk.green('  • Çalışma saatleri:'), `${config.schedule.startTime || '09:00'} - ${config.schedule.endTime || '17:00'}`);
        console.log(chalk.green('  • Çalışma günleri:'), config.schedule.days?.join(', ') || 'Tüm günler');
      }
      
      // Süre ayarlarını göster
      console.log(chalk.green('- Site ziyaret süresi (ms):'), config.siteDuration || 60000);
      console.log(chalk.green('- Maksimum site ziyaret süresi (ms):'), config.siteTimeout || 90000);
      console.log(chalk.green('- Toplam çalışma süresi (ms):'), config.visitDuration || 'Belirsiz');
      console.log(chalk.green('- Gecikmeler (ms):'), `Min: ${config.delay?.min || 3000}, Max: ${config.delay?.max || 8000}`);
      
      // İnsan davranışı özellikleri
      console.log(chalk.green('- Otomatik scroll:'), config.humanBehavior?.scroll ? 'Etkin' : 'Devre dışı');
      console.log(chalk.green('- Rastgele tıklama:'), config.humanBehavior?.randomClicks ? 'Etkin' : 'Devre dışı');
      console.log(chalk.green('- Rastgele fare hareketi:'), config.humanBehavior?.moveMouseRandomly ? 'Etkin' : 'Devre dışı');
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
        { name: 'Engellenen site logları ve ekran görüntüleri', value: 'blocked', checked: false }
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
      const reportFiles = fs.readdirSync(blockedDir)
        .filter(file => file.startsWith('block_report_') && file.endsWith('.json'));
      
      for (const file of reportFiles) {
        fs.unlinkSync(path.join(blockedDir, file));
        console.log(chalk.green(`Engelleme raporu silindi: ${file}`));
        deletedFiles++;
      }
      
      // Ekran görüntülerini sil
      const screenshotFiles = fs.readdirSync(blockedDir)
        .filter(file => file.endsWith('.png'));
      
      for (const file of screenshotFiles) {
        fs.unlinkSync(path.join(blockedDir, file));
        console.log(chalk.green(`Ekran görüntüsü silindi: ${file}`));
        deletedFiles++;
      }
    } catch (error) {
      console.error(chalk.red(`Engellenen site loglarını temizlerken hata: ${error.message}`));
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

// Ekran görüntülerini temizleme fonksiyonu
const clearScreenshots = async () => {
  const config = readConfig();
  const screenshotsDir = path.join(__dirname, config.logging?.screenshotPath || 'logs/screenshots');
  
  // Klasör var mı ve içinde dosyalar var mı kontrol et
  if (!fs.existsSync(screenshotsDir) || fs.readdirSync(screenshotsDir).length === 0) {
    console.log(chalk.yellow('Henüz hiç ekran görüntüsü bulunmuyor.'));
    
    // Ana menüye dönüş seçeneği sun
    const { returnToMain } = await inquirer.prompt([
      {
        type: 'list',
        name: 'returnToMain',
        message: 'Ne yapmak istiyorsunuz?',
        choices: [
          { name: 'Ana Menüye Dön', value: 'main' }
        ]
      }
    ]);
    return;
  }
  
  // Klasördeki dosyaları listeleme
  const files = fs.readdirSync(screenshotsDir)
    .filter(file => file.endsWith('.png'));
  
  if (files.length === 0) {
    console.log(chalk.yellow('Temizlenecek ekran görüntüsü bulunamadı.'));
    
    // Ana menüye dönüş seçeneği sun
    const { returnToMain } = await inquirer.prompt([
      {
        type: 'list',
        name: 'returnToMain',
        message: 'Ne yapmak istiyorsunuz?',
        choices: [
          { name: 'Ana Menüye Dön', value: 'main' }
        ]
      }
    ]);
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
    
    // Ana menüye dönüş seçeneği sun
    const { returnToMain } = await inquirer.prompt([
      {
        type: 'list',
        name: 'returnToMain',
        message: 'Ne yapmak istiyorsunuz?',
        choices: [
          { name: 'Ana Menüye Dön', value: 'main' }
        ]
      }
    ]);
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
      
      // Ana menüye dönüş seçeneği sun
      const { returnToMain } = await inquirer.prompt([
        {
          type: 'list',
          name: 'returnToMain',
          message: 'Ne yapmak istiyorsunuz?',
          choices: [
            { name: 'Ana Menüye Dön', value: 'main' }
          ]
        }
      ]);
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
      
      // Ana menüye dönüş seçeneği sun
      const { returnToMain } = await inquirer.prompt([
        {
          type: 'list',
          name: 'returnToMain',
          message: 'Ne yapmak istiyorsunuz?',
          choices: [
            { name: 'Ana Menüye Dön', value: 'main' }
          ]
        }
      ]);
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
      
      // Ana menüye dönüş seçeneği sun
      const { returnToMain } = await inquirer.prompt([
        {
          type: 'list',
          name: 'returnToMain',
          message: 'Ne yapmak istiyorsunuz?',
          choices: [
            { name: 'Ana Menüye Dön', value: 'main' }
          ]
        }
      ]);
      return;
    }
    
    filesToDelete = files.filter(file => 
      selectedSites.some(site => file.startsWith(site))
    );
    
    console.log(chalk.yellow(`${filesToDelete.length} adet seçilen sitelere ait ekran görüntüsü bulundu.`));
  }
  
  if (filesToDelete.length === 0) {
    console.log(chalk.yellow('Temizlenecek ekran görüntüsü bulunamadı.'));
    
    // Ana menüye dönüş seçeneği sun
    const { returnToMain } = await inquirer.prompt([
      {
        type: 'list',
        name: 'returnToMain',
        message: 'Ne yapmak istiyorsunuz?',
        choices: [
          { name: 'Ana Menüye Dön', value: 'main' }
        ]
      }
    ]);
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
    
    // Ana menüye dönüş seçeneği sun
    const { returnToMain } = await inquirer.prompt([
      {
        type: 'list',
        name: 'returnToMain',
        message: 'Ne yapmak istiyorsunuz?',
        choices: [
          { name: 'Ana Menüye Dön', value: 'main' }
        ]
      }
    ]);
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
    
    // Ana menüye dönüş seçeneği sun
    const { returnToMain } = await inquirer.prompt([
      {
        type: 'list',
        name: 'returnToMain',
        message: 'Ne yapmak istiyorsunuz?',
        choices: [
          { name: 'Ana Menüye Dön', value: 'main' }
        ]
      }
    ]);
  } catch (error) {
    console.error(chalk.red(`Dosyalar silinirken hata oluştu: ${error.message}`));
    
    // Ana menüye dönüş seçeneği sun
    const { returnToMain } = await inquirer.prompt([
      {
        type: 'list',
        name: 'returnToMain',
        message: 'Ne yapmak istiyorsunuz?',
        choices: [
          { name: 'Ana Menüye Dön', value: 'main' }
        ]
      }
    ]);
  }
};

// CLI arayüzünün iki modda çalışmasını sağlayalım
// 1. Komut satırından parametre ile çalıştırma modu
// 2. Etkileşimli menü modu
const runInteractiveMenu = async () => {
  const choices = [
    { name: 'Botu Hemen Çalıştır (Tek Sefer)', value: 'run-once' },
    { name: 'Botu Başlat (Zamanlanmış Mod)', value: 'start' },
    { name: 'YouTube Shorts Modu', value: 'youtube-shorts' },
    { name: 'Bot Ayarlarını Düzenle', value: 'config' },
    { name: 'Logları Görüntüle', value: 'logs' },
    { name: 'Logları Temizle', value: 'clear-logs' },
    { name: 'Ekran Görüntülerini Temizle', value: 'clear-screenshots' },
    { name: 'Ekran Görüntüsü Ayarları', value: 'screenshot-settings' },
    { name: 'Çıkış', value: 'exit' }
  ];
  
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
        choices: choices
      }
    ]);
    
    if (action === 'exit') {
      console.log(chalk.green('Programdan çıkılıyor...'));
      break;
    }
    
    if (action === 'run-once') {
      await runOnce();
    } else if (action === 'youtube-shorts') {
      await runYoutubeShorts();
    } else if (action === 'start') {
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
        
        // Ana menüye dönüş seçeneği sun
        const { action } = await inquirer.prompt([
          {
            type: 'list',
            name: 'action',
            message: 'Ne yapmak istiyorsunuz?',
            choices: [
              { name: 'Ana Menüye Dön', value: 'back' }
            ]
          }
        ]);
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

        if (writeConfig(config)) {
          console.log(chalk.green('Log ayarları güncellendi'));
        }
        
        // Ana menüye dönüş seçeneği sun
        const { action } = await inquirer.prompt([
          {
            type: 'list',
            name: 'action',
            message: 'Ne yapmak istiyorsunuz?',
            choices: [
              { name: 'Ana Menüye Dön', value: 'back' }
            ]
          }
        ]);
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
            default: config.siteTimeout || (config.siteDuration * 3) || 1800000,
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
    } else if (action === 'logs') {
      // Logları görüntüleme
      const { logType } = await inquirer.prompt([
        {
          type: 'list',
          name: 'logType',
          message: 'Hangi logları görüntülemek istiyorsunuz?',
          choices: [
            { name: 'Genel loglar', value: 'general' },
            { name: 'Trafik logları', value: 'traffic' }
          ]
        }
      ]);
      
      if (logType === 'general') {
        showLogs(false, 50);
      } else if (logType === 'traffic') {
        await showTrafficLogs();
      }
    } else if (action === 'clear-logs') {
      await clearLogs();
    } else if (action === 'clear-screenshots') {
      await clearScreenshots();
    } else if (action === 'screenshot-settings') {
      await configureScreenshotSettings();
    }
  }
};

// Ekran görüntüsü ayarlarını yapılandırma fonksiyonu
const configureScreenshotSettings = async () => {
  const config = readConfig();
  
  // Ekran görüntüsü ayarlarını başlat (yoksa)
  config.blockDetection = config.blockDetection || {};
  config.logging = config.logging || {};
  config.logging.screenshots = config.logging.screenshots || {};
  
  console.log(chalk.blue('\nEkran Görüntüsü Ayarları:'));
  console.log(chalk.blue('-----------------------------------'));
  console.log(chalk.green('Durum:'), config.blockDetection?.takeScreenshot !== false ? chalk.green('Etkin') : chalk.red('Devre dışı'));
  
  // Mevcut maksimum ekran görüntüsü sayısı ve otomatik silme ayarını göster
  const maxScreenshots = config.logging.screenshots.maxCount || 100;
  const autoCleanup = config.logging.screenshots.autoCleanup !== false;
  
  console.log(chalk.green('Maksimum Ekran Görüntüsü Sayısı:'), maxScreenshots);
  console.log(chalk.green('Otomatik Temizleme:'), autoCleanup ? chalk.green('Etkin') : chalk.red('Devre dışı'));
  console.log(chalk.blue('-----------------------------------\n'));
  
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Ne yapmak istiyorsunuz?',
      choices: [
        { name: `Ekran görüntüsü almayı ${config.blockDetection?.takeScreenshot !== false ? 'devre dışı bırak' : 'etkinleştir'}`, value: 'toggle' },
        { name: 'Maksimum ekran görüntüsü sayısını ayarla', value: 'max-count' },
        { name: `Otomatik temizlemeyi ${autoCleanup ? 'devre dışı bırak' : 'etkinleştir'}`, value: 'auto-cleanup' },
        { name: 'Ana Menüye Dön', value: 'back' }
      ]
    }
  ]);
  
  if (action === 'back') {
    return;
  }
  
  if (action === 'toggle') {
    // Ekran görüntüsü alma durumunu değiştir
    config.blockDetection.takeScreenshot = !(config.blockDetection?.takeScreenshot !== false);
    
    if (writeConfig(config)) {
      console.log(chalk.green(`Ekran görüntüsü alma ${config.blockDetection.takeScreenshot ? 'etkinleştirildi' : 'devre dışı bırakıldı'}`));
    }
  } else if (action === 'max-count') {
    // Maksimum ekran görüntüsü sayısını ayarla
    const { count } = await inquirer.prompt([
      {
        type: 'input',
        name: 'count',
        message: 'Maksimum kaç adet ekran görüntüsü saklanacak?',
        default: maxScreenshots,
        validate: (input) => {
          const num = parseInt(input);
          return !isNaN(num) && num > 0 ? true : 'Lütfen geçerli bir sayı girin (0\'dan büyük)';
        }
      }
    ]);
    
    config.logging.screenshots.maxCount = parseInt(count);
    
    if (writeConfig(config)) {
      console.log(chalk.green(`Maksimum ekran görüntüsü sayısı ${count} olarak ayarlandı`));
    }
  } else if (action === 'auto-cleanup') {
    // Otomatik temizleme durumunu değiştir
    config.logging.screenshots.autoCleanup = !autoCleanup;
    
    if (writeConfig(config)) {
      console.log(chalk.green(`Otomatik temizleme ${config.logging.screenshots.autoCleanup ? 'etkinleştirildi' : 'devre dışı bırakıldı'}`));
    }
  }
  
  // Ana menüye dönüş seçeneği sun
  const { nextAction } = await inquirer.prompt([
    {
      type: 'list',
      name: 'nextAction',
      message: 'Başka bir ayar değiştirmek istiyor musunuz?',
      choices: [
        { name: 'Evet, ekran görüntüsü ayarlarına devam et', value: 'continue' },
        { name: 'Hayır, ana menüye dön', value: 'back' }
      ]
    }
  ]);
  
  if (nextAction === 'continue') {
    await configureScreenshotSettings();
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
                         fs.readdirSync(blockedDir).some(file => file.startsWith('block_report_') && file.endsWith('.json'));
  
  const hasBlockReportFiles = fs.existsSync(blockReportsDir) && 
                             fs.readdirSync(blockReportsDir).some(file => file.startsWith('block_report_') && file.endsWith('.json'));
  
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

// Bot çalışma süresini ayarlama fonksiyonu
const setRunDuration = async () => {
  const config = readConfig();
  
  console.log(chalk.blue('--------------------------------'));
  
  // Kullanıcıdan süre seçimini al
  const { duration } = await inquirer.prompt([
    {
      type: 'list',
      name: 'duration',
      choices: [
        { name: '30 Dakika', value: 1800000 },
        { name: '1 Saat', value: 3600000 },
        { name: '2 Saat', value: 7200000 },
        { name: '3 Saat', value: 10800000 },
        { name: 'Özel Süre', value: 'custom' }
      ]
    }
  ]);

  // Eğer özel süre seçildiyse
  let finalDuration = duration;
  if (duration === 'custom') {
    const { customDuration } = await inquirer.prompt([
      {
        type: 'input',
        name: 'customDuration',
        message: 'Süreyi dakika cinsinden girin:',
        validate: (value) => {
          const num = parseInt(value);
          return !isNaN(num) && num > 0 ? true : 'Lütfen geçerli bir süre girin';
        },
        filter: (value) => parseInt(value) * 60000 // Dakikayı milisaniyeye çevir
      }
    ]);
    finalDuration = customDuration;
  }

  // Config'i güncelle
  config.duration = finalDuration;
  writeConfig(config);

  try {
    console.log(chalk.green(`Bot çalışma süresi ${finalDuration / 60000} dakika olarak ayarlandı.`));
    
    // Ana menüye dönüş seçeneği ekle
    const { nextAction } = await inquirer.prompt([
      {
        type: 'list',
        name: 'nextAction',
        message: 'Şimdi ne yapmak istiyorsunuz?',
        choices: [
          { name: 'Ana Menüye Dön', value: 'main_menu' }
        ]
      }
    ]);
    
    // Seçime göre işlem yap - şimdilik sadece ana menüye dönüş var
    if (nextAction === 'main_menu') {
      return;
    }
  } catch (error) {
    console.error(chalk.red(`Süre ayarlanırken hata oluştu: ${error.message}`));
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

// Yardım menüsü
program
  .command('help')
  .description('Yardım menüsünü göster')
  .action(() => {
    console.log(chalk.blue('\nSite Ziyaretçi Bot - Yardım Menüsü'));
    console.log(chalk.blue('----------------------------------'));
    console.log(chalk.cyan('Komutlar:'));
    console.log(chalk.green('menu                ') + 'Etkileşimli menü arayüzünü başlat');
    console.log(chalk.green('start               ') + 'Botu başlat');
    console.log(chalk.green('run-once            ') + 'Siteleri bir kez ziyaret et ve kapat');
    console.log(chalk.green('config              ') + 'Bot ayarlarını düzenle');
    console.log(chalk.green('logs                ') + 'Bot loglarını görüntüle');
    console.log(chalk.green('clear-logs          ') + 'Log dosyalarını temizle');
    console.log(chalk.green('clear-screenshots   ') + 'Ekran görüntülerini temizle');
    
    console.log(chalk.blue('\nÖrnekler:'));
    console.log(chalk.green('node cli.js menu                    ') + 'Etkileşimli menüyü başlat');
    console.log(chalk.green('node cli.js start                   ') + 'Botu arka planda başlat');
    console.log(chalk.green('node cli.js start --foreground      ') + 'Botu ön planda başlat');
    console.log(chalk.green('node cli.js run-once                ') + 'Botu bir kez çalıştır ve kapat');
    console.log(chalk.green('node cli.js logs --last 10          ') + 'Son 10 log kaydını göster');
    console.log(chalk.green('node cli.js logs --grep "error"     ') + 'Hata içeren logları göster');
    console.log(chalk.green('node cli.js clear-logs              ') + 'Tüm log dosyalarını temizle');
    
    console.log(chalk.blue('\nDaha fazla bilgi için:'));
    console.log('https://github.com/yourusername/site-visitor-bot');
  });

program.parse(process.argv);

// Hiçbir komut verilmezse etkileşimli menüyü başlat
if (!process.argv.slice(2).length) {
  runInteractiveMenu();
}
