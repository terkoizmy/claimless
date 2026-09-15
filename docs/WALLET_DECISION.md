# Keputusan Arsitektur Wallet: Privy vs Dynamic

> Dibuat: 2026-09-15 · Pelengkap `AGENT_COVER_DEEPDIVE.md`
> Sumber: riset web via 2 agent swarm (visible, `deepseek-v4-flash:0731-cloud`) + verifikasi primer coordinator
> Semua klaim ditandai TERVERIFIKASI / TIDAK YAKIN

---

## 0. Jawaban singkat

**Rekomendasi: PRIVY.** Bukan karena lebih murah, tapi karena **model penagihannya cocok dengan kasus kita**.

| Aspek | Privy | Dynamic |
|---|---|---|
| Free tier | 0–499 MAU | **0–1.000 MAU** (lebih besar) |
| Yang dihitung | MAU (**butuh login**) + **50rb signature/bln gratis** | MAU, **termasuk wallet yang baru dibuat** |
| Agent wallets | ✅ Produk khusus | ✅ Server wallets + agentic use case |
| Policy engine | ✅ Termasuk semua plan | ✅ Ada |
| Monad | ✅ Terverifikasi | ✅ Terverifikasi |
| Harga lanjutan | $299/bln (500-2.499 MAU) | **$249/bln** (1.000-5.000 MAU) |

**Kenapa Privy menang untuk kita** — lihat §3. Ini temuan kuncinya.

---

## 1. Privy (TERVERIFIKASI)

### Harga
| Tier | MAU | Harga |
|---|---|---|
| **Free** | 0–499 | **$0** |
| Core | 500–2.499 | $299/bln |
| Scale | 2.500–9.999 | $499/bln |
| Enterprise | >10K | Custom |

**Yang paling penting:** semua plan Developer dapat **50.000 signature gratis/bulan** dan **$1 juta transaction volume gratis/bulan**.

Signature = **setiap** permintaan tanda tangan dari wallet Privy (termasuk `eth_sendTransaction`, `signMessage`, `signTypedAuth`, `raw_sign`, dll).

Di atas kuota: $0,01/signature, $0,05/MAU.

Sumber: `privy.io/pricing`

### Agent wallets
- Produk eksplisit "Agent wallets": *"provision wallets for AI agents"*.
- Dua model: **agent-owned** (agen kontrol wallet sendiri) dan **delegated signing** (agen bertindak atas nama user, bisa dicabut).
- Fitur: **policy engine** (batas per transaksi, cap per periode, allowlist), **x402 & MPP** bawaan, integrasi LangChain/Vercel AI SDK/OpenAI Agents SDK/AWS Bedrock AgentCore, MCP.
- **Kunci tidak pernah terekspos ke proses agen**: CLI pakai device authorization flow, lalu *"short-lived ephemeral signing keys without ever exposing the private key to the agent process"*.
- Sumber: `docs.privy.io/wallets/overview/solutions/agent-wallets.md`

### Monad
Terverifikasi: *"Privy is compatible with any EVM-compatible chain... Monad..."*. Perlu konfigurasi via `supportedChains`/`defaultChain`.
Sumber: `docs.privy.io/basics/react/advanced/configuring-evm-networks.md`

### Yang tidak terverifikasi
- Apakah free tier butuh kartu kredit saat daftar: **TIDAK YAKIN**.
- Program khusus hackathon: **TIDAK ADA** yang ditemukan.

---

## 2. Dynamic (TERVERIFIKASI)

### Harga
| Tier | MAU | Harga |
|---|---|---|
| **Self-Serve Free** | 0–1.000 | **$0** |
| Self-Serve | 1.000–5.000 | **$249/bln** |
| >5.000 | +$0,05/MAU | — |
| Enterprise | Custom | Custom |

Sumber: `dynamic.xyz/pricing`

### Agent & server wallets
- Punya **server wallets** dan halaman solusi **"Agentic"**.
- TSS-MPC key management, delegated access, policy engine, business accounts (multi-signer, quorum).
- Diakuisisi **Fireblocks** (Okt 2025).
- Monad terdaftar di daftar ecosystems mereka.

### Yang tidak terverifikasi
- Apakah server wallets dibatasi di free tier atau enterprise-only: **TIDAK YAKIN**.
- Butuh kartu kredit saat signup: **TIDAK YAKIN**.

---

## 3. Temuan yang menentukan: cara menghitung "user"

Ini bagian terpenting dari seluruh riset, dan mudah terlewat.

### Privy menghitung MAU dari **sesi login**
> "A monthly active user represents any Privy-authenticated user with **at least one active session** in the last 30 days."
> — `privy.io/pricing`

Wallet agen yang **dibuat tapi tidak pernah login** **tidak** dihitung sebagai MAU. Yang dihitung hanya **signature** (50rb gratis/bulan).

### Dynamic menghitung MAU termasuk **pembuatan wallet**
> "A user is counted if they log in at least once a month **or when an embedded wallet (including pre-generated wallets) is created for them**."
> — `dynamic.xyz/pricing`

**Setiap wallet agen yang kita buat langsung dihitung sebagai 1 user.**

### Dampaknya untuk Claimless

Kasus kita: **banyak wallet agen, sedikit manusia.**

| Skenario | Privy | Dynamic |
|---|---|---|
| 100 wallet agen dibuat, 0 login | **0 MAU** (aman) | **100 MAU** (terpakai) |
| 1.000 wallet agen | 0 MAU, 50rb signature gratis | **1.000 MAU → tepat di batas free tier** |
| 1.500 wallet agen | 0 MAU (aman) | **Keluar free tier → $249/bln** |
| 5.000 signature agen | Gratis | Tergantung MAU |

**Kesimpulan: Dynamic bisa keluar dari free tier hanya karena jumlah wallet agen yang dibuat, bahkan sebelum ada aktivitas nyata.**

Untuk proyek yang intinya adalah **membuat wallet untuk banyak agen**, ini pembeda yang menentukan. Privy tidak menghukum kita karena membuat banyak wallet.

---

## 4. Catatan tentang larangan "kartu kredit"

Ini penting untuk syarat "tanpa dana" Anda.

- Kedua platform: **free tier = $0**, jadi wajar tidak butuh kartu.
- Tapi **keduanya TIDAK YAKIN** soal apakah signup memerlukan kartu.
- **Risiko:** kalau salah satu minta kartu, syarat "tanpa dana" Anda bisa terganggu (walau tidak tertagih).
- **Mitigasi:** daftar dan cek sebelum commit. Kalau minta kartu, pakai yang lain.

---

## 5. Arsitektur final yang saya rekomendasikan

```
┌─────────────────────────────────────────────────────────┐
│ MANUSIA (underwriter, pemilik layanan)                   │
│   Login: Mera passkey                                    │
│   ── gratis, tanpa server, tanpa API key                 │
│   ── bounty: Mera-Powered UX + One Passkey Many Keys     │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│ AGEN OTONOM (pelapor insiden, eksekutor pemicu)          │
│   Wallet: Privy agent wallets                            │
│   ── kunci di TEE, tidak pernah terekspos ke agen        │
│   ── policy engine: batas + allowlist                    │
│   ── x402 untuk bayar API                                │
│   ── 50rb signature gratis/bln                           │
│   ── bounty: Privy!                                      │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│ MONAD (kontrak)                                          │
│   IncidentRegistry · RiskScore · CoverPool · Trigger     │
│   ── diindeks oleh Envio (Docker, Postgres+Hasura)       │
│   ── diperkaya data Nansen (smart money)                 │
│   ── pemicu otomatis oleh Chainlink CRE                  │
└─────────────────────────────────────────────────────────┘
```

### Kenapa pemisahan ini penting
- **Mera untuk manusia** karena passkey butuh kehadiran user dan terikat device. Tidak bisa headless.
- **Privy untuk agen** karena agen harus bisa transaksi **tanpa** user hadir. Passkey tidak bisa melakukan ini.
- Keduanya **bukan pesaing**; mereka menyelesaikan dua masalah berbeda.

---

## 6. Dampak ke strategi bounty

| Stack | Nilai |
|---|---|
| Envio + Nansen + CRE + Mera ×2 | $14.000 |
| **+ Privy (agent wallets)** | **$19.000** |

**Jangan pakai Privy + Dynamic bersamaan.** Mereka pesaing langsung, dan memakai keduanya akan terlihat dipaksakan (juri melihat itu sebagai red flag, bukan nilai tambah).

**Rekomendasi: Privy saja.** Alasan: model MAU lebih cocok untuk banyak wallet agen, agent wallet paling matang (dokumentasi khusus, x402 bawaan, integrasi framework), dan kunci di TEE dengan ephemeral signing.

---

## 7. Langkah berikutnya

1. **Daftar Privy** dan cek apakah butuh kartu kredit (di dashboard).
2. Verifikasi Monad bisa dikonfigurasi sebagai chain (`supportedChains`).
3. Konfirmasi policy engine bisa membatasi wallet agen (cap + allowlist).
4. Kalau Privy minta kartu atau Monad bermasalah, **fallback ke Dynamic** (dengan catatan MAU).

---

## 8. Yang masih perlu diverifikasi

| Pertanyaan | Status |
|---|---|
| Privy butuh kartu kredit? | TIDAK YAKIN — cek di dashboard |
| Dynamic butuh kartu kredit? | TIDAK YAKIN |
| Server wallets Dynamic dibatasi free tier? | TIDAK YAKIN |
| Privy monad network config konkret | Terverifikasi bisa, tapi contoh kode belum |
| Apakah 50rb signature Privy cukup untuk demo | Perlu diestimasi setelah ada desain demo |
| Program hackathon/grant dari kedua pihak | Tidak ditemukan |
