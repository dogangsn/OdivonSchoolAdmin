# Odivon School · Admin Console

Odivon School'un sahibi için ayrı yönetim paneli. Ana uygulamayla **aynı Firebase
projesini** (`odivonschool`) kullanır; ayrı bir backend yoktur. Tüm okuma/yazma
yetkisi ana repodaki `firestore.rules` ile korunur: yalnızca `users/{uid}.role == 'admin'`
olan hesaplar giriş yapabilir ve veri görebilir.

Angular 20 (standalone + signals) · Tailwind CSS 4 · @angular/fire · Odivon tasarım sistemi.

## Ekranlar

| Sayfa | İçerik |
| --- | --- |
| Genel Bakış | Kullanıcı, aktif kullanıcı, MRR, 30 günlük tahsilat; büyüme grafiği, plan/rol dağılımı, kullanım, uyarılar (deneme bitiyor, süresi geçmiş, onay bekleyen öğretmen), son kayıt/ödeme/işlemler |
| Aktivite ve Kullanım | 7/30/90 gün: günlük aktif öğrenen, test ve oyun grafikleri, derse göre başarı, kademe, oyun türleri, gün × saat ısı haritası, en aktif kullanıcılar, kaybedilme riski |
| Kullanıcılar | Arama, rol/durum/plan/kademe/aktivite filtreleri, sıralama, sayfalama, CSV |
| Kullanıcı detayı | Profil, test/oyun/ödeme/geçmiş sekmeleri, derse göre başarı, abonelik yönetimi (plan, uzatma, deneme, iptal), rol, öğretmen onayı, askıya alma, yönetici notu |
| Okullar ve Sınıflar | Öğretmen okullarına göre gruplama, öğretmen onayı, sınıflar ve üye sayıları, sınıf üyeleri |
| Abonelikler | MRR/ARR, ARPU, kayıp oranı, plan/dönem/kaynak dağılımı, yenileme takvimi |
| Ödemeler | PayTR siparişleri, günlük/aylık tahsilat, başarı oranı, paket ve durum dağılımı, CSV |
| Soru Havuzu | Kademe bazında kapsam, konu başına onaylı/taslak sayısı (hedef 10), konudaki soruları yönetme |
| Soru Onayı | Taslakları onaylama/reddetme/düzenleme, toplu onay (öğrencilere "yeni soru" bildirimi yazılır) |
| İşlem Kayıtları | `subscriptionEvents` akışı, filtre ve CSV |

## Geliştirme

```bash
npm install
npm start          # http://localhost:4200
npm run build      # dist/OdivonSchoolAdmin/browser
```

`localhost` Firebase Auth'ta varsayılan olarak izinlidir; yönetici hesabınızla giriş yapın.

## Yayına alma (tek seferlik kurulum)

1. **Hosting sitesi oluştur** (aynı projede ikinci site):
   ```bash
   npx firebase-tools hosting:sites:create odivonschool-admin --project odivonschool
   ```
2. **İlk deploy** (kendi bilgisayarınızdan):
   ```bash
   npm run build
   npx firebase-tools deploy --only hosting --project odivonschool
   ```
   Panel `https://odivonschool-admin.web.app` adresinde açılır.
3. **Auth alan adı:** Firebase Console → Authentication → Settings → Authorized domains:
   `odivonschool-admin.web.app` (ve özel alan adı kullanacaksanız örn. `admin.school.odivon.com`).
4. **Özel alan adı (isteğe bağlı):** Hosting → `odivonschool-admin` sitesi → Add custom domain.
5. **Otomatik deploy (isteğe bağlı):** GitHub OIDC havuzu (`github-actions`) şu an ana repoya
   izin veriyor. Bu repoyu da ekleyin (provider'ın attribute condition'ına
   `dogangsn/OdivonSchoolAdmin`, servis hesabına `roles/iam.workloadIdentityUser`), sonra
   repo ayarlarında **Variables → `DEPLOY_ENABLED` = `true`**. Her `main` push'u otomatik yayınlanır.

## Notlar

- Kurallar ana repoda (`OdivonSchool/firestore.rules`) yaşar; bu repo kural deploy etmez.
- Yapay zekâ ile soru üretme şimdilik ana uygulamanın eski `/yonetim` ekranında; bu panel
  üretilen taslakları onaylar.
- Aktivite metrikleri `testAttempts` ve `gameResults` koleksiyonlarından, "son görülme"
  metrikleri `users.lastSeenAt` alanından hesaplanır (2026-10-29'dan itibaren tutuluyor).
