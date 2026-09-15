# Claimless — session handoff for coding

> Read this FIRST, in the order below. Everything needed is in this folder; do not re-research.

## 1. Orientation (5 minutes)

1. **`PLAN.md`** — the full 28-day execution plan, repo structure, contract specs, bounty map, and research context. Read section 0 (summary) and section 9 (research context) at minimum.
2. **`IDEA.md`** — the final idea, one-liner, tech stack, wallet architecture.
3. **`docs/AURORA_INTENTS_IMPLEMENTATION.md`** — everything about the Aurora Intents integration, including verified facts about testnet, minimums, gas, and funding. Read sections 12-15 before writing any Intents code.
4. **`docs/`** — supporting research: `BOUNTY_STRATEGY.md`, `SPONSOR_FEASIBILITY.md`, `CLAIMLESS_DEEPDIVE.md`, `WALLET_DECISION.md`.

## 2. Current state

| Item | Status |
|---|---|
| Repo | `C:\Users\terkoiz\Documents\hackathon\claimless` |
| Git | Initialized, one commit (`Initial commit`), only `README.md` tracked |
| Branch | default |
| Deadline | **Oct 14, 2026, 03:59 UTC** |
| Bounty target | **$24,000** (Aurora Intents, Privy, Nansen, Mera ×2, CRE, Envio) |

## 3. Environment status (verified 2026-09-15)

| Tool | Version | Status |
|---|---|---|
| git | 2.54.0.windows.1 | ✅ ready |
| node | v24.16.0 | ✅ ready (Envio needs v22+) |
| docker | 29.5.2 | ✅ ready |
| **Foundry** | **1.8.3** | ✅ **installed** at `%USERPROFILE%\.foundry\bin` (added to user PATH) |

Foundry was installed from the official Windows release (`foundry_v1.8.3_win32_amd64.zip`, sha256 verified). `forge`, `cast`, `anvil`, `chisel` all work. A smoke test (`forge init` + `forge build`) compiled successfully.

Toolchain choice: **Foundry for contracts** (Solidity tests + built-in fuzzing, needed for insurance invariants), Node/TypeScript for `sdk/` and `web/`. Both are officially documented by Monad (`docs.monad.xyz/tooling-and-infra/toolkits/foundry` and `.../hardhat`).

## 4. Non-negotiable rules

- **Commit every day.** A single commit on the final day means automatic disqualification.
- **Live data, not mocks.** Every bounty requires a real integration.
- **No money spent** unless justified. Prefer free tiers. Aurora Intents demo uses `dry: true` (zero cost).
- **Do not try to testnet Aurora Intents.** It has no testnet and never will ("no plans for one"). This is verified and settled — do not re-research it.
- **Do not try to use Circle faucet USDC with Aurora.** Testnet assets are absent from the Intents registry by design. Also settled.

## 5. Confirmed free rails

| Layer | Rail | Cost |
|---|---|---|
| Contracts, pool, triggers | Monad testnet (chain 10143) | Free |
| Testnet USDC for pool flows | Circle testnet USDC `0x534b2f3A21130d7a60830c2Df862319e593943A3` | Free via `faucet.circle.com` |
| Gas on Monad testnet | `faucet.monad.xyz` | Free |
| Aurora Intents demo | `dry: true` quote via `1click.chaindefuser.com/v0/quote` | Free, no API key |
| Optional Aurora live proof | $0.50 USDC on **Base** (not Ethereum mainnet) | ~$0.50 one-time |

## 6. First actions of a new session

1. Confirm `forge --version` works (install if not).
2. Create the folder skeleton from `PLAN.md` §1.
3. Commit the skeleton (Day 1 deliverable).
4. Move to `PLAN.md` §2 Week 1 day by day.

## 7. Working with swarm

See `PLAN.md` §11 for the full guide. Summary:

- Spawn mode is `visible` with a Windows Terminal vertical split (already configured in `~/.jcode/config.toml`).
- Worker model: `deepseek-v4-flash:0731-cloud` (note: `deepseek-v4-flash:cloud` does **not** exist).
- Always pass `label` when spawning.
- Use swarm for parallel research/verification, not for sequential coding.
