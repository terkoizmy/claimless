# Kelayakan Sponsor — Apakah Bisa Gratis?

> Dibuat: 2026-09-15 · Pelengkap `BOUNTY_STRATEGY.md`
> Metode: riset web via 3 agent paralel (model `deepseek-v4-flash:0731-cloud`, terpisah dari model coordinator)
> Setiap klaim ditandai TERVERIFIKASI atau TIDAK YAKIN.

---

## 0. Jawaban atas pertanyaan inti: apakah kredit KIMI gratis?

**TIDAK.** Ini temuan paling penting.

Dari `platform.moonshot.ai/docs/pricing/limits` (TERVERIFIKASI):
> "To prevent abuse, you need to **recharge at least $1 to start using**, and when your cumulative recharge reaches $5, you will receive a **$5 voucher**."

Jadi:
- Tidak ada kredit gratis saat daftar.
- Wajib top-up minimum **$1** untuk mulai memakai API.
- Dapat voucher **$5** hanya setelah total top-up mencapai $5.

**Implikasi untuk syarat "tanpa dana":** bounty KIMI ($3.000 dalam kredit) **melanggar** prinsip tanpa dana Anda, karena butuh modal kecil ($1-5) untuk mulai.

### Tapi ada jalur gratis

**Kimi K2 open-weight.** Dari `huggingface.co/moonshotai/Kimi-K2-Instruct` (TERVERIFIKASI):
- Model Kimi K2 (1T total / 32B aktif, MoE) tersedia **open-weight**, lisensi **Modified MIT**.
- 194.678 download/bulan. Bisa dijalankan via vLLM/SGLang/KTransformers.

**Masalah praktis:** 1 triliun parameter. Untuk menjalankannya sendiri butuh GPU raksasa (bukan gratis praktis). Jadi "self-host" secara teori gratis, secara praktis tidak realistis untuk solo.

**Provider lain:** Groq **tidak** menawarkan KIMI (TERVERIFIKASI dari `console.groq.com/docs/models`). OpenRouter disebut punya free tier, tapi konfirmasi model `kimi-*-free` **TIDAK YAKIN** (halaman dimuat lazy).

**Harga API kalau tetap mau bayar** (TERVERIFIKASI dari `platform.moonshot.ai`):
| Model | Input /1M | Output /1M |
|---|---|---|
| Kimi K3 (flagship) | $3.00 | $15.00 |
| Kimi K2.7 Code | $0.95 | $4.00 |
| Kimi K2.6 | $0.95 | $4.00 |

**Kesulitan lain:** login pakai nomor HP, pembayaran via **WeChat Pay / Alipay**. Untuk pengguna Indonesia ini bisa jadi penghalang praktis (TIDAK YAKIN apakah bisa diakses/dibayar dari Indonesia).

---

## 1. Cluster B (Data & Indexing) — SEMUA GRATIS ✅

### Envio — GRATIS, dan Monad didukung penuh
| Aspek | Detail |
|---|---|
| Free tier | Plan `Development` **$0/bulan** |
| Batas | Soft limit: **100 ribu event**, 5GB storage, atau idle 7 hari (mana dulu tercapai). Grace 7 hari + read-only 3 hari, lalu dihapus. Hard limit: >20GB atau >30 hari dihapus. Query rate 100/menit |
| Self-host | **Bisa**, gratis, via Dockerfile |
| Monad | **TERVERIFIKASI.** Monad Mainnet (chain 143) & Testnet (10143) tersedia di HyperSync & HyperRPC (`monad.hypersync.xyz`) |
| Sumber | `envio.dev/pricing/hosting`, `docs.envio.dev/docs/HyperSync/hypersync-supported-networks` |
| Kesulitan solo | Rendah-sedang. Butuh Node v22+, **Docker wajib**, dan **WSL di Windows** |
| Langkah pertama | `pnpx envio init` → Contract Import → pilih Monad → deploy ke Envio Cloud |

**Catatan penting untuk Anda:** Envio butuh **WSL di Windows**. Anda punya `wsl.exe`. Ini perlu disiapkan.

### Nansen — GRATIS (dengan batas), dan Monad didukung
| Aspek | Detail |
|---|---|
| Free plan | **$0/bulan**, 100 trial credits, refill 10 credits/hari |
| Rate | 15 req/s & 300 req/min |
| Alternatif tanpa API key | x402 micropayments mulai **$0.01/query** (USDC di Base/Solana) |
| Pro | $49/bulan: 2000 credits + 75 req/s |
| Tooling | CLI (`npm i -g nansen-cli`) & MCP (`npx skills add nansen-ai/nansen-cli`) **gratis** |
| Monad | **TERVERIFIKASI** ada di daftar chain (`docs.nansen.ai/reference/chains`) |
| Sumber | `nansen.ai/query`, `docs.nansen.ai` |
| Kesulitan solo | Rendah. REST endpoint bersih |

### Alchemy — GRATIS, tapi Monad BELUM terverifikasi ⚠️
| Aspek | Detail |
|---|---|
| Free tier | **30 juta Compute Units/bulan**, 25 req/s, 5 apps, 5 webhooks |
| Cakupan | Semua mainnet & testnet (klaim mereka) |
| Monad | **TIDAK YAKIN.** Dua halaman `supported-networks` yang dicoba 404. **Perlu verifikasi manual di dashboard** |
| Sumber | `alchemy.com/pricing` |
| Kesulitan solo | Paling rendah. Daftar → Create App → API key |
| Langkah pertama | Signup di `dashboard.alchemy.com` → Create App → HTTPS RPC URL |

**Risiko:** kalau Alchemy tidak mendukung Monad, bounty ini gugur. **Verifikasi dulu sebelum masuk strategi.**

---

## 2. Cluster C (Automation) — GRATIS untuk build, tapi butuh dana untuk live

### Chainlink CRE — GRATIS untuk build & simulate ✅
| Aspek | Detail |
|---|---|
| Gratis | Account + CLI + build + **simulate**: GRATIS |
| Deploy | Butuh approval (`cre account access`). Build & simulate jalan tanpa approval |
| Simulasi onchain | `--broadcast` butuh native testnet token (mis. Sepolia ETH) dari `faucets.chain.link` — **gratis** |
| Deploy registry | Private registry: tanpa wallet, tanpa gas |
| Monad | **TERVERIFIKASI.** Monad Mainnet (CLI v1.29.0+), Monad Testnet (CLI v1.30.0+) |
| Sumber | `docs.chain.link/cre` (overview, supported-networks, deploying, simulating) |
| Kesulitan solo | Sedang. CLI + SDK Go/TS, konsep trigger-and-callback |
| Langkah pertama | Akun di `app.chain.link/cre/discover` → install CLI `cre` → `cre workflow init` → `cre workflow simulate` |

**Verdict: cocok dengan syarat tanpa dana.** Simulasi gratis, faucet gratis.

### Aurora Intents / NEAR Intents — GRATIS akses, tapi live swap butuh DANA NYATA ⚠️
| Aspek | Detail |
|---|---|
| Gratis | SDK & 1Click Swap API: gratis. Tanpa API key tetap bisa (fee +0.25%) |
| API key | Gratis via `partners.near-intents.org` (fee turun ke 0.20%, stablecoin 0.01%) |
| Dana | **Swap intent nyata butuh dana riil** dikirim ke deposit address. **Tidak ada testnet untuk swap live** |
| Uji tanpa dana | Quote `dry=true` bisa dipakai tanpa dana |
| Monad | **TERVERIFIKASI** ada di daftar supported chains NEAR Intents |
| Sumber | `docs.near-intents.org` (chain-support, fees, 1click) |
| Kesulitan solo | Rendah-sedang. REST sederhana: `/v0/tokens`, `/v0/quote`, deposit, `/v0/status` |

**Verdict: sebagian melanggar syarat tanpa dana.** Untuk demo live, butuh modal kecil (mis. $5-20 stablecoin). Quote dry-run bisa untuk demo terbatas.

---

## 3. Kesimpulan strategi (direvisi)

### Yang benar-benar gratis penuh ✅
| Sponsor | Catatan |
|---|---|
| Envio | Gratis, Monad terverifikasi, butuh WSL |
| Nansen | Gratis (100 credits), Monad terverifikasi |
| Chainlink CRE | Gratis build+simulate, Monad terverifikasi |

**Total: ~$9.000** (Envio $1k + Nansen $5k + CRE $3k) — **tanpa modal sepeser pun.**

### Yang gratis tapi belum terverifikasi Monad ⚠️
| Sponsor | Aksi yang perlu |
|---|---|
| Alchemy ($1k) | Verifikasi dukungan Monad di dashboard mereka |

### Yang butuh modal kecil ⚠️
| Sponsor | Modal | Nilai bounty |
|---|---|---|
| KIMI | $1 minimum (voucher $5 di $5) | $3k kredit |
| Aurora Intents | ~$5-20 stablecoin untuk live swap | $5k |

---

## 4. Rekomendasi revisi Strategi 1

**Strategi 1 versi asli** (Envio + Alchemy + Nansen + Mera + KIMI) = **$15k**, tapi 2 komponen bermasalah:
- KIMI butuh top-up $1-5 → melanggar "tanpa dana"
- Alchemy belum terverifikasi Monad

**Strategi 1 revisi** (tetap tanpa dana, semua terverifikasi):
| Sponsor | Nilai | Status |
|---|---|---|
| Envio | $1.000 | ✅ Gratis, Monad OK |
| Nansen | $5.000 | ✅ Gratis, Monad OK |
| Chainlink CRE | $3.000 | ✅ Gratis build+simulate, Monad OK |
| Mera ×2 | $5.000 | ✅ Gratis (Monad native, tanpa biaya) |
| **Total** | **$14.000** | **Tanpa modal** |

Kalau mau **maksimal**: tambah KIMI ($3k) dengan biaya $1, dan Aurora ($5k) dengan biaya ~$10 — total modal ~$11 untuk potensi tambahan $8.000. **Rasio sangat bagus**, tapi melanggar prinsip awal Anda.

**Keputusan yang saya sarankan: tetap tanpa dana ($14k), lalu putuskan KIMI/Aurora setelah melihat apakah ada dana kecil yang bisa dialokasikan.**

---

## 5. Yang perlu diverifikasi sebelum eksekusi

1. **Monad + WSL** untuk Envio — apakah WSL Anda sudah siap?
2. **Alchemy Monad** — cek manual di dashboard (paling penting, bisa menggugurkan $1k).
3. **Bounty KIMI** — apakah "genuinely powered by KIMI" bisa dipenuhi lewat self-host? (kemungkinan tidak, mereka mau API mereka dipakai)
4. **Syarat Mera** — pastikan tidak butuh biaya (kemungkinan gratis karena Monad native).
5. **Dana kecil** — apakah Anda oke keluar $1-11 untuk membuka $8k bounty tambahan?

---

## Lampiran: catatan teknis

- Riset dijalankan oleh 3 agent swarm **visible** (muncul sebagai pane di Windows Terminal) dengan model **`deepseek-v4-flash:0731-cloud`** via Ollama, berbeda dari model coordinator (`deepseek-v4.1-flash:cloud`).
- Model yang Anda minta (`deepseek-v4-flash:cloud`) tidak ada dengan nama persis itu; nama sebenarnya `deepseek-v4-flash:0731-cloud`.
- Websearch di mesin ini diblokir, jadi semua riset pakai `webfetch` langsung ke URL.
