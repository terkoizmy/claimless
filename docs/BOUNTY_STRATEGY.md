# Strategi Bounty Sponsor — Analisis Keputusan

> Dibuat: 2026-09-15 · Pelengkap `IDE_HACKATHON_METROPOLIS.md`
> Sumber: halaman resmi Tracks & Bounties Metropolis (dibaca ulang 2026-09-15, tidak ada perubahan dari 2026-09-14)
> Fokus: **hadiah sponsor**, bukan hadiah utama track.

---

## 0. Temuan strategis utama

Setelah membaca ulang data bounty dengan fokus sponsor, ada satu temuan yang mengubah segalanya:

> **Total pool bounty "All tracks" (~$43.000) LEBIH BESAR daripada cluster bounty track mana pun.**

Padahal hampir semua orang berebut hadiah track utama ($30k, dibagi 3) dan Grand Champion ($25k).

Artinya: **memilih primary track bukan keputusan paling penting. Yang penting adalah berapa banyak bounty "All tracks" yang bisa kamu tumpuk.**

| Kategori | Nilai total | Catatan |
|---|---|---|
| Bounty **All tracks** (12 bounty) | **~$43.000** | Bisa diklaim apa pun primary track-mu |
| Cluster Track 01 (yang terbesar) | ~$25.500 | Terbesar di antara 4 track |
| Cluster Track 02 | $10.000 | Agora cross-border saja |
| Cluster Track 04 | $7.000 | Qwen + Cleanverse |
| Cluster Track 03 | $2.000 | Hunyuan saja |
| Hadiah track utama | $30.000 × 4 | Dibagi 3 pemenang = $10k/orang |
| Grand Champion | $25.000 | Judges' discretion |

**Kesimpulan:** bidik **All tracks** dulu, pilih track utama terakhir (cari yang paling natural cocok dengan proyek, bukan yang hadiahnya terbesar).

---

## 1. Rincian 12 bounty "All tracks"

Ini yang harus jadi fokus. Diurutkan dari yang paling mudah ditumpuk.

| # | Bounty | Sponsor | Nilai | Kebutuhan inti | Kompetisi |
|---|---|---|---|---|---|
| 1 | Best Use of Envio | Envio | $1.000 | Pakai HyperIndex/HyperSync/HyperRPC sebagai sumber data fitur inti | Sedang (nilai kecil, tapi murah dilakukan) |
| 2 | Best Projects using Alchemy | Alchemy | $1.000 kredit | Integrasi minimal 1 layanan Alchemy, deploy di Monad | Rendah (nilai kredit, sedikit pesaing) |
| 3 | Best Mera-Powered UX | Monad Foundation | $2.500 | Mera jadi **seluruh** account layer (tanpa seed phrase/extension/custody) | **Rendah** (spesifik) |
| 4 | Mera: One Passkey, Many Keys | Monad Foundation | $2.500 | Pemakaian **non-wallet** paling kreatif dari key material PRF Mera | **Sangat rendah** (paling obscure) |
| 5 | Best Builds Powered by KIMI | Kimi/Moonshot | $3.000 kredit | Proyek yang benar-benar ditenagai KIMI, open scope | Sedang |
| 6 | Best workflow with CRE | Chainlink | $3.000 | CRE Workflow sebagai orchestration layer | Sedang (teknis) |
| 7 | Best Use of Dynamic | Dynamic | $5.000 | SDK Dynamic untuk auth, embedded/agent wallet, atau signing, app ter-deploy | **Tinggi** (populer) |
| 8 | Privy! | Privy | $5.000 | Integrasi Privy **beyond auth** (login-only tidak dihitung) | **Tinggi** (populer) |
| 9 | Best use of Nansen | Nansen AI | $5.000 | Produk berbasis data/API/MCP/CLI Nansen, **beyond expose data mentah** | Sedang-tinggi |
| 10 | Bring Any-Chain Liquidity | Aurora Intents | $5.000 | Integrasi Aurora Intents untuk deposit/swap/deposit-and-execute lintas chain | Sedang |
| 11 | Best use of Perpl's API | Perpl | $5.000 | Bot trading/otomasi production-ready di Perpl | Sedang |
| 12 | Best Community Team Project | Monad Foundation | $5.000 | Proyek terbaik dari "team from Metropolis community supporters" | **Perlu verifikasi** kelayakan |

**Catatan #12:** kalimatnya "built by a team from Metropolis community supporters" — ini kemungkinan mensyaratkan keterlibatan komunitas Metropolis (Discord/event). Perlu dicek langsung; jangan diandalkan.

---

## 2. Yang paling sepi pesaing (peluang terbaik)

Tiga bounty ini punya kriteria paling spesifik, dan spesifik biasanya berarti **sedikit** yang mengerjakan:

### 🥇 Mera: One Passkey, Many Keys ($2.500)
"Most creative **non-wallet** use of Mera's **PRF-derived key material**"

Kenapa sepi: butuh memahami apa itu PRF (pseudo-random function) dan bagaimana menurunkan key material dari passkey. Mayoritas peserta tidak akan repot. Yang paham konsep ini sedikit.

Ide: pakai key material Mera untuk sesuatu yang **bukan wallet** — misalnya enkripsi data pribadi, signing dokumen, derivasi identitas anonim, atau kunci enkripsi file yang bisa dipulihkan dengan passkey.

### 🥈 Best Mera-Powered UX ($2.500)
"Mera is the **entire** account layer — no seed phrase, no extension, no custody backend"

Kenapa sepi: "entire account layer" itu syarat keras. Banyak yang akan pakai Mera sebagai tambahan, bukan pengganti penuh.

### 🥉 Best Integration of Cleanverse ($2.000, Track 04)
"gates CVA asset movement behind on-chain CVI identity verification"

Kenapa sepi: butuh memahami produk Cleanverse (CVA/CVI) yang tidak umum. Tapi rewardnya kecil dan terikat Track 04.

**Pola yang saya lihat:** bounty Monad Foundation cenderung **spesifik dan kurang diperebutkan**, sementara bounty yang populer (Privy, Dynamic) ramai.

---

## 3. Yang paling mahal tapi ramai

| Bounty | Nilai | Kenapa ramai |
|---|---|---|
| Agora Cross-Border | $10.000 | Nilai terbesar, tapi butuh mobile app + AUSD + Mera |
| Agora Mobile Trading | $10.000 | Sama, plus integrasi Perpl |
| Privy! | $5.000 | Setiap proyek butuh auth; banyak yang pakai Privy |
| Dynamic | $5.000 | Sama seperti Privy |

**Catatan penting soal Agora:** dua bounty $10k ini **terikat track berbeda** (Cross-Border → Track 02, Mobile Trading → Track 01). Karena kamu hanya boleh pilih satu primary track, **tidak bisa klaim keduanya**. Ini jebakan yang mudah terlewat.

---

## 4. Cluster: mana yang bisa ditumpuk bersamaan

Kunci stacking adalah memilih sponsor yang **saling melengkapi**, bukan saling menggantikan.

### Cluster A — Identity & Onboarding: **$15.000**
Dynamic ($5k) + Privy ($5k) + Mera ×2 ($5k)
- Semua soal auth/wallet/onboarding. Bisa dipakai bersama.
- Kelemahan: Dynamic dan Privy itu pesaing langsung; memakai keduanya terasa aneh kecuali punya alasan.

### Cluster B — Data & Indexing: **$7.000**
Envio ($1k) + Alchemy ($1k) + Nansen ($5k)
- Sangat kompatibel. Envio untuk indexing, Alchemy untuk RPC, Nansen untuk data pasar.
- **Paling mudah ditumpuk** karena semuanya infrastruktur, bukan fitur yang bersaing.

### Cluster C — Automation: **$8.000**
Chainlink CRE ($3k) + Aurora Intents ($5k)
- CRE untuk orkestrasi, Aurora untuk likuiditas lintas chain.
- Cocok untuk proyek yang butuh otomasi + jembatan.

### Cluster D — AI Model: **$3.000**
KIMI ($3k kredit)
- Open scope, jadi mudah ditambahkan ke proyek apa pun selama KIMI benar-benar dipakai.

### Cluster E — Track 01 (Trading): **$25.500** (terbesar)
Agora Mobile Trading ($10k) + Kuru ×2 ($10k) + Perpl Analytics ($3k) + MetaMask ($2.5k)
- Terbesar, tapi butuh membangun produk trading serius.
- Semua terikat Track 01.

---

## 5. Rekomendasi: tiga strategi realistis

### Strategi 1 — "Tumpuk infrastruktur" (paling aman) ⭐
**Target: ~$12.000 - $18.000**

Pilih **All tracks** sebagai basis, tambah track utama yang paling natural.

Proyek: satu aplikasi yang pakai Envio + Alchemy + Nansen + Mera + KIMI.
- Envio ($1k) + Alchemy ($1k) + Nansen ($5k) + Mera ×2 ($5k) + KIMI ($3k kredit) = **$15k**
- Tidak perlu memenangkan track utama sama sekali.
- Risiko: rendah. Effort: sedang. Semua integrasi infrastruktur, tidak ada fitur yang saling bertabrakan.

### Strategi 2 — "Serang yang sepi" (paling efisien per jam kerja)
**Target: ~$7.500**

Fokus hanya bounty spesifik yang sedikit pesaing:
- Mera: One Passkey Many Keys ($2.5k) + Mera-Powered UX ($2.5k) + Cleanverse ($2k) + Envio ($1k) = **$8k**
- Effort lebih kecil karena hanya menyentuh 3 sponsor.
- Cocok kalau waktu terbatas.

### Strategi 3 — "Serius di Track 01" (plafon tertinggi, risiko tertinggi)
**Target: ~$18.000 - $30.000**

Bangun produk trading lengkap, klaim cluster Track 01 + tumpuk All tracks.
- Agora ($10k) + Kuru ($5k) + Perpl ($3k) + Envio ($1k) + Nansen ($5k) = **$24k**
- Butuh kerja paling berat (produk trading + mobile).
- Cocok hanya kalau kamu siap kerja penuh 30 hari.

---

## 6. Jawaban langsung atas pertanyaanmu

**"Fokus ke hadiah sponsor, bagaimana menurutmu?"**

**Setuju, dan ini keputusan yang lebih tepat** daripada mengejar hadiah track. Alasannya:

1. **Pool-nya lebih besar dari yang terlihat.** Bounty All tracks saja ~$43k, dan bisa ditumpuk. Ini bukan hadiah hiburan; ini jalur utama yang lebih realistis.
2. **Saingan lebih sedikit.** Hadiah track utama diperebutkan semua orang dan hanya 3 pemenang per track. Bounty sponsor punya 12-20 pemenang total.
3. **Sesuai tujuanmu (portofolio).** Menumpuk 5 sponsor dalam satu proyek menunjukkan **breadth** integrasi — itu yang dilihat perekrut, bukan satu kemenangan track.
4. **Risiko lebih rendah.** Kalau gagal menang track, bounty tetap bisa didapat.

**Yang harus dihindari:**
- Mengejar Agora $10k sebagai solo tanpa pengalaman mobile — risikonya tinggi.
- Memakai Privy **dan** Dynamic bersamaan tanpa alasan kuat (terlihat dipaksakan).
- Menganggap "Best Community Team Project" mudah tanpa verifikasi syaratnya.

**Rekomendasi final saya: Strategi 1** — tumpuk infrastruktur (Envio + Alchemy + Nansen + Mera + KIMI), karena paling aman, paling mudah ditumpuk, dan paling cocok untuk portofolio.

---

## 7. Yang perlu diverifikasi

1. **Syarat "Best Community Team Project"** — apakah butuh keanggotaan komunitas Metropolis? Baca detail di halaman bounty (butuh login).
2. **Apakah bounty track-spesifik benar-benar mensyaratkan primary track tersebut.** Frasa "Each bounty lists what it needs" mengindikasikan ya, tapi konfirmasi lebih baik.
3. **Detail lengkap tiap bounty** di balik login — kemungkinan ada syarat tambahan (form feedback, video, dsb).
4. **Apakah boleh integrasi 2 sponsor auth sekaligus** (Privy + Dynamic) tanpa dianggap aneh oleh juri.

---

## 8. Langkah berikutnya

Kalau setuju dengan Strategi 1, langkah konkretnya:

1. Verifikasi syarat bounty (login ke situs, baca detail masing-masing).
2. Tentukan primary track yang paling natural untuk proyek infrastruktur (kemungkinan **Track 04** karena banyak bounty data/AI di sana, atau track apa pun karena tidak terlalu berpengaruh).
3. Pilih proyeknya: kembali ke kandidat dari dokumen ide (Claimless atau Owned Memory) lalu sesuaikan agar memuat 5 sponsor target.
4. Scaffold repo.

Mau saya lanjut ke langkah mana?
