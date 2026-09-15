# Claimless — Deep Dive: Model Bisnis, Keunggulan, Risiko

> Dibuat: 2026-09-15 · Pelengkap `IDEAS_WITH_STACK.md`
> Sumber: 3 agent swarm riset (visible, model `deepseek-v4-flash:0731-cloud`) + riset primer coordinator
> Setiap klaim ditandai TERVERIFIKASI atau TIDAK YAKIN

---

## 0. Ringkasan eksekutif

**Verdict: pasar nyata, tapi ada satu temuan yang mengubah posisi kita.**

| Pertanyaan | Jawaban |
|---|---|
| Apakah ini pasar nyata? | **YA, terverifikasi.** Nexus Mutual sudah bayar $18.5M klaim. Armilla AI jual asuransi AI dengan backing Lloyd's, Chaucer, Swiss Re. |
| Apakah ada permintaan? | **YA.** Regulasi memaksa (EU AI Act, Colorado AI Act). 78% org pakai AI. |
| Apakah ada pesaing? | **YA, dan ini masalahnya.** Lihat §3. |
| Apakah modelnya sudah jelas? | **Ya.** Lihat §4. |
| Apakah moat-nya cukup? | **Ini titik terlemah.** Lihat §5. |

**Temuan paling penting:** riset kegagalan asuransi DeFi menunjukkan **seluruh kategori asuransi kripto bernilai hanya $122M TVL** dan **tidak ada pemenang besar** — InsurAce mati, Cover Protocol shutdown. Penyebabnya bukan teknologi, tapi **adjudikasi klaim yang discretionary**. Ini pelajaran langsung untuk desain kita.

---

## 1. Bukti pasar (TERVERIFIKASI)

### Kerugian nyata akibat AI/AI agent gagal
| Kasus | Kerugian | Sumber |
|---|---|---|
| **Air Canada chatbot** (Feb 2024) | Bayar C$650 + biaya; dalih "bot bertanggung jawab sendiri" ditolak hakim | `theguardian.com` |
| **Zillow Offers** (2021) | **$420 juta** rugi Q3, bisnis ditutup, 25% karyawan PHK | Wikipedia/Zillow |
| **AI Incident Database** | Ratusan insiden terdokumentasi | `incidentdatabase.ai` |

### Adopsi
- **78% organisasi** pakai AI (2024), naik dari 55% (Stanford AI Index 2025).
- **22% insurer** berencana punya agentic AI produksi akhir 2026 → **70% by 2028** (MarketsandMarkets).

### Ukuran pasar
- **Agentic AI dalam asuransi: $368,3 juta (2025) → $5.070,9 juta (2032), CAGR 44%.** (MarketsandMarkets)

### Regulasi yang memaksa
- **EU AI Act** (Reg 2024/1689): AI high-risk wajib conformity assessment, human oversight, logging, **dan lapor insiden serius**.
- **Colorado AI Act** (SB24-205): mulai Feb 2026, developer & deployer high-risk AI wajib risk management program + impact assessment + review tahunan.

**Catatan jujur:** angka adopsi dari McKinsey/Gartner/Deloitte **TIDAK DIDAPAT** (domain diblokir 403/404). Tidak ada data nominal denda EU AI Act di sumber yang diakses.

### Kapasitas pasar sudah terisi besar
- **Armilla AI**: Coverholder Lloyd's, backing **Chaucer, Axis Capital, Convex, Swiss Re**. Jual *affirmative AI liability insurance* + *AI Performance Warranty*.
- Klien nyata: WorkTango, SkyHive, Private AI, TELUS, MKIII.

---

## 2. Model bisnis yang sudah terbukti (TERVERIFIKASI)

Riset membandingkan 6 model nyata. Ini yang relevan:

| Model | Siapa bayar | Unit bayar | Harga | Moat |
|---|---|---|---|---|
| **Nexus Mutual** | Pembeli cover (protokol onchain) | Premi **% per tahun** dari nilai dicover | **2.5%–6.5% pa**, dinamis (+5bp per 1% kapasitas terpakai) | Capital pool bersama + pricing dinamis |
| **Sherlock Shield** | Protocol teams (developer DeFi) | Premi coverage; **besar payout dari skor audit** | 0 temuan → **$500k cover**; makin banyak temuan makin kecil ($250k → $1.000) | **Audit = gerbang wajib** untuk coverage |
| **Armilla AI** | Perusahaan pemakai AI | **Per-assessment** + premi terpisah | Tidak dipublikasi | **Assessment → coverage** (bundling) |
| **Chainalysis** | Penegak hukum, bank, exchange | **Enterprise subscription** | Enterprise | Data unik + 1.500+ pelanggan |
| **Dune/Nansen** | Trader, analis | Freemium → langganan | Nansen Pro **$49/bln** | Komunitas + query engine |

### Dua pola yang berulang dan sangat penting

1. **Assessment → Coverage.** Sherlock dan Armilla sama-sama menempatkan verifikasi sebagai **prasyarat** coverage. Ini bukan kebetulan; ini yang membuat underwriting mungkin.
2. **Payout parametrik.** Sherlock Shield menghitung besar cover dari **jumlah temuan** (Medium=1 poin, High=5 poin, dikali multiplier tipe audit). Ini **terukur, bukan discretionary**.

**Ini memvalidasi desain kita:** registry insiden (assessment) → coverage parametrik (payout terukur). Persis pola yang sudah terbukti.

---

## 3. Pesaing & kegagalan model (temuan paling penting) ⚠️

### Kategori asuransi DeFi itu kecil dan penuh kematian

| Protokol | Status |
|---|---|
| **InsurAce** | **Efektif mati.** TVL **$143K**, staked **$0** (DefiLlama) |
| **Cover Protocol** | **Shutdown Des 2021** pasca kegagalan akuisisi Ruler |
| **Cozy Finance** | Masih hidup, tapi rebrand jadi "DeFi Safety Stack" |
| **Nexus Mutual** | Hidup, sudah bayar **$18.5M** |
| **Seluruh kategori asuransi di DefiLlama** | **Hanya ~$122M total.** Tidak ada pemenang besar |

### Kegagalan Nexus Mutual yang harus dipelajari

Dari ledger klaim langsung (TERVERIFIKASI): **103+ klaim**, dan **mayoritas klaim 2020-2021 DITOLAK**:
- Seluruh klaim **MakerDAO "Black Thursday"** ditolak.
- Penolakan besar: **Bancor $1M**, **Anchor**.
- Yang dibayar: FTX $5.2M, Rari $5.1M, Euler, Yearn.

**Akar masalahnya: adjudikasi discretionary.** Bahkan Nexus Mutual, pemain terbesar, awalnya pakai voting token (V1/V2) lalu pindah ke **3 ahli manusia** (Nov 2025). Artinya model "biarkan pemegang token memutuskan klaim" **gagal dua kali**.

### Tiga penyebab utama kegagalan asuransi DeFi

1. **Adjudikasi klaim tidak bisa dipercaya.** Kalau klaim diputuskan discretionary (voting/komite), peserta merasa dirugikan saat ditolak. Nexus Mutual menolak klaim besar dan kehilangan kepercayaan.
2. **Basis risk pada parametric.** Pemicu terukur sering tidak mencocokkan kerugian nyata. Kalau pemicu tidak jalan saat orang rugi, produk dianggap tidak berguna.
3. **Sisi permintaan lemah.** Orang beli asuransi setelah rugi, bukan sebelum. Dalam kripto, ini diperparah karena yield dari staking modal sebagai underwriter lebih menarik.

### Implikasi langsung untuk Claimless

| Masalah lama | Bagaimana kita hindari |
|---|---|
| Adjudikasi discretionary | **Jangan voting, jangan komite.** Payout sepenuhnya parametrik dari data terukur (pola Sherlock Shield). |
| Basis risk | Pemicu harus **spesifik dan sempit** (SLA latency, completion rate), bukan "AI gagal secara umum". |
| Permintaan lemah | **Ini risiko nyata yang belum terselesaikan.** Lihat §6. |

---

## 4. Model bisnis Claimless (rekomendasi)

Berdasarkan 6 model yang terbukti, tiga opsi konkret:

### Opsi 1 — Risk Data Subscription (paling mirip Chainalysis/Nansen)
- **Siapa bayar:** tim AI, marketplace agen, underwriter yang butuh data risiko.
- **Unit:** langganan bulanan.
  - Free: 100 query/bulan, skor publik.
  - Pro: **$99/bulan**, API akses, skor historis.
  - Enterprise: **$999+/bulan**, feed real-time, SLA.
- **Kenapa masuk akal:** pola persis Chainalysis (data risiko = enterprise subscription) dan Nansen ($49/bln Pro).
- **Keunggulan:** pendapatan berulang, tidak butuh modal.

### Opsi 2 — Coverage Fee (paling mirip Nexus/Sherlock)
- **Siapa bayar:** pemilik agen/layanan yang mau proteksi.
- **Unit:** premi **2-5% per periode** dari nilai coverage (mengikuti Nexus 2.5-6.5% pa).
- **Kita ambil:** platform fee 10-20% dari premi, sisanya ke pool underwriter.
- **Kenapa masuk akal:** sudah terbukti di Nexus & Sherlock.
- **Kelemahan:** butuh pool modal → sulit solo; risiko yang sama dengan Nexus.

### Opsi 3 — Assessment + Warranty (paling mirip Armilla)
- **Siapa bayar:** developer agen yang mau menjual ke enterprise.
- **Unit:** **per-assessment** (kita audit/uji agennya) + badge + warranty.
- **Kita ambil:** fee assessment (mis. **$500-2000 per agen**) + % warranty.
- **Kenapa masuk akal:** Armilla membuktikan permintaan ini nyata ("warranty membantu mempercepat sales cycle").
- **Keunggulan:** **tidak butuh modal** (jasa, bukan underwriting).
- **Kelemahan:** tidak scalable (jasa manual).

### Rekomendasi: kombinasi Opsi 1 + Opsi 3
- **Opsi 1** (data subscription) = pendapatan berulang, scalable, tanpa modal.
- **Opsi 3** (assessment) = pendapatan awal, membangun kredibilitas data.
- **Opsi 2** (coverage fee) ditunda sampai data cukup untuk memberi harga.

**Untuk hackathon, demo Opsi 1 + prototipe pemicu parametrik** (membuktikan Opsi 2 mungkin tanpa menjalankannya).

---

## 5. Keunggulan (dan kejujuran soal moat)

### Keunggulan nyata ✅
1. **Ini prasyarat, bukan produk sampingan.** Semua pemain (Armilla, Nexus) butuh data kerugian untuk memberi harga. Kita membangun lapisan yang mereka semua butuhkan.
2. **Pola sudah tervalidasi.** Assessment → Coverage (Sherlock, Armilla). Payout parametrik (Sherlock Shield). Kita memakai pola yang menang, bukan bereksperimen.
3. **Data menumpuk.** Moat nyata: riwayat insiden tidak bisa dibeli atau di-copy.
4. **Menghindari kesalahan fatal.** Tidak pakai voting/komite (pelajaran dari Nexus V1→V2→V3 dan kegagalan InsurAce).
5. **Semua stack gratis** (Envio, Nansen, CRE, Mera) → tanpa modal.

### Kejujuran soal moat ⚠️
**Kelemahan paling serius: cold start.** Kategori asuransi DeFi bernilai hanya $122M total, dan itu setelah bertahun-tahun. Kalau kita ulang model yang sama, hasilnya bisa sama.

**Dan satu pertanyaan yang belum terjawab:** kenapa orang mau *melaporkan* insiden agennya? Registry kosong = produk tidak berguna. Mitigasi kita (badge keandalan + stake anti-spam) belum terbukti.

**Bandingkan dengan kekuatan sebenarnya:** moat kita bukan "asuransi", tapi **dataset insiden agen yang pertama**. Kalau dataset itu berguna untuk pihak lain (underwriter, regulator, marketplace agen), nilainya jauh lebih besar dari produk asuransinya sendiri.

---

## 6. Risiko & mitigasi

| Risiko | Tingkat | Mitigasi |
|---|---|---|
| **Cold start** (tidak ada yang lapor) | 🔴 Tinggi | Badge keandalan (lapor = alat marketing), stake anti-spam. **Belum terbukti.** |
| **Pasar kecil** (kategori DeFi insurance cuma $122M) | 🟠 Sedang-tinggi | Jangan jual asuransi; jual data. Pasar data risiko jauh lebih besar (Chainalysis enterprise). |
| **Basis risk** (pemicu ≠ kerugian nyata) | 🟠 Sedang | Pemicu sempit & spesifik (SLA latency, completion rate), bukan "AI gagal" |
| **Laporan palsu** | 🟠 Sedang | Stake + verifikasi ber-stake + hash bukti. **Jangan voting massa.** |
| **Pemain besar masuk** (Armilla punya Lloyd's) | 🟠 Sedang | Bekerja **dengan** mereka, bukan melawan. Jual data ke mereka. |
| **Regulasi** (menjual asuransi tanpa lisensi ilegal) | 🔴 Tinggi | **Jangan sebut "asuransi".** Sebut "risk registry + parametric coverage prototype di testnet". |
| **Pemicu bisa di-game** | 🟠 Sedang | Validator ber-stake dengan slashing |

---

## 7. Positioning final

**Jangan bilang:** "kami membuat asuransi untuk AI agent"
**Bilang:** "kami membuat **registry risiko agen + prototipe coverage parametrik** — prasyarat data yang membuat asuransi agen mungkin, dengan payout yang tidak perlu dipercayakan ke siapa pun"

**One-liner portofolio:**
> "Armilla butuh verifikasi manual per model. Nexus memakai komite manusia. Claimless membangun dataset insiden agen on-chain dan pemicu parametrik yang membuat payout bisa dieksekusi tanpa adjudikasi manusia."

**Kenapa ini benar:**
1. Menghindari kesalahan yang membunuh InsurAce & Cover Protocol (adjudikasi discretionary).
2. Memakai pola yang sudah menang (Sherlock Shield: skor → payout terukur).
3. Pasar data risiko lebih besar & lebih terbukti daripada pasar asuransi DeFi.
4. Semua stack gratis → bisa dieksekusi solo 30 hari.

---

## 8. Yang masih perlu diverifikasi

1. **Angka adopsi McKinsey/Gartner** — domain diblokir; cari versi mirror kalau mau dipakai di pitch.
2. **Detail dokumentasi Aurora Intents** — 404; hanya terverifikasi bahwa Aurora ada di daftar chain NEAR Intents.
3. **Harga Nexus per polis aktual** — dokumen menyebut 2.5-6.5% pa, tapi tidak ada contoh transaksi nyata.
4. **Apakah "Best Community Team Project" butuh keanggotaan komunitas Metropolis** — masih belum dicek.
5. **Cold start** — ini bukan pertanyaan yang bisa dijawab riset; ini yang harus diuji dengan demo.
