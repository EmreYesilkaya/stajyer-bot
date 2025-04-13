.PHONY: install run run-once clean logs menu help

# Varsayılan komut
help:
	@echo "Site Ziyaretçi Botu - Makefile Komutları"
	@echo "--------------------------------------"
	@echo "make install        - Bağımlılıkları yükler"
	@echo "make run            - Botu normal modda çalıştırır"
	@echo "make run-headless   - Botu arka planda (gizli) çalıştırır"
	@echo "make run-once       - Botu tek sefer çalıştırır"
	@echo "make menu           - Etkileşimli menüyü açar"
	@echo "make logs           - Son logları gösterir"
	@echo "make error-logs     - Hata loglarını gösterir"
	@echo "make clean          - Tüm bağımlılıkları temizler"
	@echo "make update         - Bağımlılıkları günceller"

# Bağımlılıkları yükle
install:
	@echo "Bağımlılıklar yükleniyor..."
	npm install
	@echo "Chrome Puppeteer eklentisi yükleniyor..."
	npx puppeteer browsers install chrome
	@echo "Kurulum tamamlandı!"

# Botu normal modda çalıştır
run:
	@echo "Bot başlatılıyor..."
	node cli.js start -f

# Botu arka planda (headless) çalıştır
run-headless:
	@echo "Bot arka planda başlatılıyor..."
	node -e "const configPath = './config.json'; \
	const fs = require('fs'); \
	const config = JSON.parse(fs.readFileSync(configPath, 'utf8')); \
	config.browser.headless = true; \
	fs.writeFileSync(configPath, JSON.stringify(config, null, 2));"
	node cli.js start

# Botu tek seferlik çalıştır
run-once:
	@echo "Bot tek seferlik çalıştırılıyor..."
	node cli.js run-once

# Etkileşimli menüyü aç
menu:
	@echo "Etkileşimli menü açılıyor..."
	node cli.js menu

# Logları göster
logs:
	@echo "Son loglar gösteriliyor..."
	node cli.js logs -n 50

# Hata loglarını göster
error-logs:
	@echo "Hata logları gösteriliyor..."
	node cli.js logs -e

# Temizlik yap
clean:
	@echo "node_modules temizleniyor..."
	rm -rf node_modules
	@echo "Temizlik tamamlandı!"

# Bağımlılıkları güncelle
update:
	@echo "Bağımlılıklar güncelleniyor..."
	npm update
	@echo "Güncelleme tamamlandı!"