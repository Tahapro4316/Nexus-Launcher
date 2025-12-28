# 🚀 Nexus Launcher

Modern, özellik açısından zengin bir Minecraft Launcher. Java otomatik kurulum, mod yükleyiciler, modpack yönetimi ve daha fazlası!

## ✨ Özellikler

- 🎮 **Minecraft Sürüm Yönetimi**: Tüm sürümler desteklenir (Release, Snapshot, Beta/Alpha)
- ☕ **Otomatik Java Kurulumu**: Java bulunamazsa Adoptium JDK otomatik yüklenir
- 🧩 **Mod Yükleyici Desteği**: Vanilla, Forge, Fabric, Quilt, NeoForge
- 📦 **Modrinth Entegrasyonu**: Modpack, mod, resource pack ve shader tarayıp kurabilirsiniz
- 🎨 **Özelleştirilebilir Arayüz**: Renkler, temalar, arkaplan resimleri
- 🔐 **Microsoft & Offline Hesaplar**: İstediğiniz giriş yöntemini kullanın
- 🎯 **Performans Optimizasyonlar**: Otomatik JVM bayrakları ve RAM optimizasyonu
- 🔄 **Otomatik Güncellemeler**: Launcher her zaman güncel kalır
- 💻 **Çoklu Platform**: Windows, macOS, Linux desteği

## 📥 Kurulum

### Hazır Kurulum (Releases)

1. [Releases](https://github.com/Tahapro4316/Nexus-Launcher/releases) sayfasından en son sürümü indirin
2. `Nexus Launcher Setup.exe` dosyasını çalıştırın
3. Kurulum wizard'ını takip edin
4. Launcher otomatik olarak başlayacaktır!

### Geliştirici Kurulumu

```bash
# Repoyu klonlayın
git clone https://github.com/Tahapro4316/Nexus-Launcher.git
cd Nexus-Launcher

# Bağımlılıkları yükleyin
npm install

# Launcher'ı başlatın
npm start

# Kurulum paketi oluşturun
npm run dist
```

## 🎯 Kullanım

### İlk Başlatma

1. **Giriş Yap**: Microsoft hesabınızla veya offline bir kullanıcı adıyla giriş yapın
2. **Sürüm Seç**: Oynamak istediğiniz Minecraft sürümünü seçin
3. **Oyuna Başla**: "OYNA" butonuna tıklayın!

### Modpack Kurma

1. **Paketler** sekmesine gidin
2. Arama kutusuna modpack adını yazın veya "KEŞFET" ile popüler paketlere göz atın
3. Beğendiğiniz bir pakete tıklayın
4. "İndir & Kur" butonuna tıklayın
5. Kurulum tamamlandığında launcher ana ekranda modpack sürümünü seçin

### Java Ayarları

1. **Ayarlar** > **Java & RAM** bölümüne gidin
2. RAM miktarını ayarlayın (önerilen: 4096-8192 MB)
3. Java otomatik bulunamazsa "Java Kur" butonuna tıklayın

## 🛠️ Teknolojiler

- **Electron**: Masaüstü uygulama framework'ü
- **Minecraft Launcher Core**: Oyun başlatma motoru
- **Modrinth API**: Mod ve modpack entegrasyonu
- **MSMC**: Microsoft hesap girişi
- **Axios**: HTTP istekleri
- **AdmZip**: Arşiv yönetimi
- **Electron Updater**: Otomatik güncelleme sistemi

## 📁 Proje Yapısı

```
Nexus-Launcher/
├── main.js              # Electron ana (backend) süreci
├── renderer.js          # UI mantığı (frontend)
├── preload.js           # IPC köprüsü
├── index.html           # Ana UI yapısı
├── style.css            # Tasarım ve animasyonlar
├── services/            # Servis modülleri
│   ├── JavaManager.js   # Java algılama ve kurulum
│   ├── VersionManager.js
│   ├── InstanceManager.js
│   ├── PerformanceTweak.js
│   └── ...
└── package.json
```

## 🔧 Geliştirme

### Yeni Özellik Ekleme

1. Fork'layın ve branch oluşturun: `git checkout -b feature/yeni-ozellik`
2. Değişikliklerinizi yapın
3. Commit edin: `git commit -am 'Yeni özellik eklendi'`
4. Push edin: `git push origin feature/yeni-ozellik`
5. Pull Request açın

### Hata Bildirimi

Herhangi bir hata bulursanız lütfen [Issues](https://github.com/Tahapro4316/Nexus-Launcher/issues) sayfasından bildirin.

## 📜 Lisans

Bu proje MIT lisansı altında lisanslanmıştır. Detaylar için `LICENSE` dosyasına bakın.

## 🙏 Teşekkürler

- **Mojang** - Minecraft için
- **PrismarineJS** - minecraft-launcher-core için
- **Modrinth** - Harika mod platformu için
- **Electron** - Framework için
- **Adoptium** - Java runtime için

## 🌟 Yıldız Vermeden Unutmayın!

Eğer bu launcher'ı beğendiyseniz lütfen ⭐ vererek destek olun!

---

**Not**: Bu launcher resmi bir Mojang ürünü değildir ve Mojang AB tarafından onaylanmamıştır veya Majang AB ile bağlantılı değildir.Vibe coding projesidir.
