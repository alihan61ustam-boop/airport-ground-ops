# 🛫 Airport Ground Operations & ATC Simulation Platform
### İstanbul Havalimanı (LTFM) & Sabiha Gökçen Havalimanı (LTFJ)

Havalimanı yer operasyonları, kapı/stand yönetimi, taksi yolu yönlendirmesi ve canlı ATC zemin trafiğini simüle eden, modern web tabanlı taktik operasyon platformu.

---

## 🌟 Öne Çıkan Özellikler

1. **%100 Taksi Yolu Sadakati (Zero Air-Cutting):**
   - Uçak rotaları asla harita üzerinde havadan veya düz çizgilerle kestirme yapmaz.
   - Açık kaynak GeoJSON havalimanı harita verisindeki tüm taksi yolu merkez hatları (`aeroway=taxiway`) üzerinden otomatik Dijkstra graf algoritması ile hesaplanır.
   - *Örnek Rota:* LTFM 16R/34L pistine inen bir uçak `A6A ➔ A ➔ A4 ➔ B4A ➔ B4B ➔ C5A ➔ E ➔ N1 ➔ T7 ➔ NE ➔ T11` koridorunu takip ederek F13 nolu körüğe yanaşır.

2. **Otomatik Alternatif Rota ve Trafik Dağıtımı:**
   - Manuel taksi yolu girişi yapılmasına gerek yoktur.
   - Motor, taksi yollarındaki anlık uçak yoğunluğunu (`edgeUsageMap`) analiz eder ve sıkışıklık oluşmaması için uçaklara otomatik alternatif taksi yolları atar.

3. **ATC Ayrım ve Pist Güvenliği Protokolleri:**
   - Taksi yapan uçaklar arasında minimum 80 metre takip mesafesi uygulanır.
   - Öndeki uçak durduğunda arkadaki uçak otomatik olarak yavaşlar ve bekler.
   - Piste iniş ve kalkış yapan uçaklar için pist ihlali koruması (Runway Incursion Prevention) ve bekleme noktaları (Holding Points) aktiftir.

4. **Canlı Uçak Telemetri Paneli (Glassmorphism HUD):**
   - Haritadaki herhangi bir uçağın üzerine tıklandığında:
     - Gideceği güzergah **parlayan neon mavi çizgi** olarak vurgulanır.
     - Alt panelde anlık yer hızı (knot), irtifa (feet), pusula yönü (heading) ve aktif taksi yolu kodu canlı olarak akar.
     - "Kamerayı Kilitle" modu ile uçak hareket ettikçe harita uçağı merkezde takip eder.

5. **Gerçek Zamanlı Stand / Kapı Eşzamanlılığı:**
   - Uçaklar kapıya yanaştığında sağ paneldeki stand listesi ve doluluk sayaçları otomatik güncellenir.
   - Boş, Dolu, Bakımda, Yatılı Park gibi durum filtreleri tek tıkla incelenebilir.

6. **Zaman Çizelgesi & Simülasyon Kontrolleri:**
   - Alt çubuk üzerinden zaman ileri/geri sarılabilir.
   - Simülasyon hızı 1x, 5x, 15x veya 60x olarak ayarlanabilir.

---

## 🚀 Ekip Arkadaşlarıyla Paylaşma (GitHub Pages Kurulumu)

Bu proje saf **HTML5 / CSS3 / Vanilla JavaScript** ile geliştirilmiştir; sunucu veya veritabanı kurulumu gerektirmez. GitHub Pages üzerinden tamamen ücretsiz ve canlı olarak ekiple paylaşılabilir:

### Adım 1: GitHub'da Yeni Bir Depo (Repository) Açın
1. [GitHub](https://github.com/new) adresine gidin.
2. Depo adına örneğin `airport-ground-ops` yazın.
3. Depoyu **Public** seçin ve **Create repository** butonuna basın.

### Adım 2: Projeyi GitHub'a Yükleyin
Proje klasörünüzde terminal açarak şu komutları çalıştırın (kendi GitHub kullanıcı adınızı yazın):

```bash
# Git deposunu başlatın (zaten başlatılmışsa bu adımı atlayabilirsiniz)
git init
git add .
git commit -m "feat: complete airport ground ops platform with dynamic taxiway routing"

# GitHub reponuzu bağlayın (Kendi kullanıcı adınızı ve repo adınızı girin)
git branch -M main
git remote add origin https://github.com/<KULLANICI_ADINIZ>/airport-ground-ops.git

# Dosyaları GitHub'a gönderin
git push -u origin main
```

### Adım 3: Canlı Yayını (GitHub Pages) Aktif Edin
1. GitHub reponuzda **Settings** (Ayarlar) sekmesine tıklayın.
2. Sol menüden **Pages** seçeneğine girin.
3. **Build and deployment** başlığı altında:
   - **Source:** `Deploy from a branch`
   - **Branch:** `main` / `/(root)` seçin.
4. **Save** butonuna basın.
5. Yaklaşık 1-2 dakika içinde sayfanın üstünde canlı bağlantınız oluşacaktır:
   👉 `https://<KULLANICI_ADINIZ>.github.io/airport-ground-ops/`

Bu linki ekibinizdeki herkes tarayıcısından açarak bilgisayar veya tabletten aynı anda inceleyebilir.

---

## 💻 Yerel Bilgisayarda Çalıştırma

Projeyi bilgisayarınızda yerel olarak çalıştırmak isterseniz:

```bash
# Python ile yerel sunucu başlatın:
python -m http.server 8080
```
Ardından tarayıcınızda açın:
👉 `http://localhost:8080`

---

## 📁 Proje Dizin Yapısı

```
airport-ground-ops/
├── index.html                 # Ana ekran arayüzü, kontrol panelleri ve HUD
├── css/
│   └── style.css              # ATC karanlık tema, neon HUD ve radar stilleri
├── js/
│   ├── app.js                 # Ana uygulama kontrolcüsü, katmanlar ve etkileşimler
│   ├── taxiway-router.js      # Dijkstra graf algoritması & alternatif rota motoru
│   ├── traffic-simulator.js   # 12/24 saatlik trafik akışı & çarpışma/ayrım önleme
│   ├── aircraft-marker.js     # Vektörel dönebilen uçak ikonları ve havayolu boyamaları
│   └── overpass.js            # Yerel veri önbelleği ve GeoJSON yükleyici
├── data/
│   ├── ltfm.geojson           # İstanbul Havalimanı (IST) pist, taksi ve stand verisi
│   └── ltfj.geojson           # Sabiha Gökçen (SAW) pist, taksi ve stand verisi
├── .gitignore                 # Git hariç tutma kuralları
└── README.md                  # Proje dökümantasyonu
```

---

## 🛠️ Gelecek Yol Haritası (12 Saatlik Dispatch Entegrasyonu)

- [x] Taksi yolları üzerinden %100 sadakatli graf tabanlı otonom yönlendirme.
- [x] Alternatif rota seçimi ve zemin trafik ayrım protokolü.
- [x] Canlı uçak HUD'ı (hız, irtifa, taksi sekansı gösterimi).
- [ ] Önümüzdeki 12 saatin uçuş planlama (dispatch) tablosunu Excel/CSV olarak yükleme ve otomatik kapı/stand ataması.
- [ ] Stand çakışma (conflict) erken uyarı alarm sistemi.
