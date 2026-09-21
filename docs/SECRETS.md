# Secrets Handling — Claimless

> **One rule:** real credentials live in `.env` files, which are git-ignored. Everything committed is a placeholder.

This file exists because we nearly shipped real API keys inside a tracked file. Read it before adding any new variable.

## 1. The two kinds of env file

| File | Contains | Tracked by git? | Safe to share? |
|---|---|---|---|
| `.env.example` | Key **names** and empty values, plus comments | ✅ **Yes** | ✅ Yes — it is public |
| `.env` | Real **values** | ❌ No (ignored) | ❌ **Never** |

The same split applies in every subfolder: `sdk/`, `cre/`, `indexer/`, `web/` each have their own `.gitignore` entry for `.env`.

## 2. The incident that produced this file (2026-09-21)

While preparing credentials, real values were pasted into the **root `.env.example`**:

| Variable | What leaked into the tracked file |
|---|---|
| `NANSEN_API_KEY` | real key (36 chars) |
| `PRIVY_APP_ID` | real app id (25 chars) |
| `PRIVY_APP_SECRET` | real secret (105 chars) |
| `PRIVY_JWKS_ENDPOINT` | real URL (69 chars) |
| `AURORA_INTENTS_APP_KEY` | real key (36 chars) |

**Impact: none shipped.** At the time, `git status` showed `.env.example` as modified but uncommitted, and `HEAD` still held the empty placeholders. The values were migrated into the ignored `.env` and the tracked file was blanked before any commit.

This is worth recording because it will happen again to someone, and the detection habit is the useful part: **compare a proposed `git add -A` against `HEAD` before committing.** The commands are in §5.

## 3. What counts as a secret here

| Variable | Secret? | Notes |
|---|---|---|
| `MONAD_PRIVATE_KEY` | 🔴 **Yes** | Deployer key. Controls funds. |
| `PRIVY_APP_SECRET` | 🔴 **Yes** | Can act as your Privy app. |
| `PRIVY_APP_ID` | 🟠 Yes | Not a key on its own, but treat as sensitive |
| `PRIVY_JWKS_ENDPOINT` | 🟠 Yes | Leaks your Privy tenant |
| `PRIVY_AUTHORIZATION_PRIVATE_KEY` | 🔴 **Yes** | (Currently unused in code) |
| `NANSEN_API_KEY` | 🔴 **Yes** | Billable credits |
| `ENVIO_API_TOKEN` | 🔴 **Yes** | Indexer access |
| `AURORA_INTENTS_APP_KEY` | 🟠 Yes | Rate-limit identity |
| `CRE_API_KEY` | 🔴 **Yes** | (Note: CRE normally uses `cre login`, not a key) |
| `CRE_ETH_PRIVATE_KEY` | 🔴 **Yes** | Signs on-chain writes |
| RPC URLs | ✅ No | Public endpoints |
| ERC-8004 registry addresses | ✅ No | Deterministic, same on every chain |
| `MONAD_TESTNET_USDC` | ✅ No | Public token address |
| Deployed Claimless addresses | ✅ No | Public contracts |
| `HASURA_GRAPHQL_ADMIN_SECRET=testing` | ✅ No | Local Docker only, not exposed |

## 4. Correct workflow for a new variable

1. Add the **name** with an empty value to `.env.example`, with a comment explaining what it is and where to get it.
2. Add the **real value** to `.env` only.
3. If a *subfolder* tool needs it (e.g. `indexer/`), also add it to that subfolder's `.env`.
4. Never copy `.env` into a commit, a screenshot, a chat, or a video recording.

## 5. How to check before committing

Run these. They print **names and lengths, never values**:

```powershell
# 1. What would actually be staged?
git add -A --dry-run

# 2. Are any env or backup files about to be staged?
git add -A --dry-run | findstr /i ".env .bak"

# 3. Does the tracked copy still hold empty placeholders for secrets?
git show HEAD:.env.example
```

The only `.env*` path that should ever appear in step 2 is `.env.example`. A `.bak-*` file appearing there is a **stop-everything** signal — backup files contain real values by design, which is why `.gitignore` now covers `.env.bak-*` and `*.env.bak-*`.

## 6. If a secret does get committed

Treat it as compromised the moment it is pushed, even if you delete the commit afterwards.

1. **Rotate first, investigate second.** Generate a new key in the provider's dashboard and revoke the old one.
2. Update `.env` locally.
3. Then clean history (`git filter-repo` or BFG) — but the rotation is what actually protects you.
4. Providers that scrape GitHub (Privy, Nansen, Chainlink) may have already auto-revoked the key. Check the dashboard before assuming it still works.

Deleting a commit is not enough: GitHub keeps unreachable objects reachable via the API for a period, and forks or scrapers may already have it.

## 7. Current state (verified 2026-09-21)

| Check | Result |
|---|---|
| Secrets in any tracked `.env.example` | ✅ None |
| `.env` git-ignored | ✅ `.gitignore:7` |
| Subfolder `.env` ignored | ✅ `sdk/`, `cre/`, `indexer/` each ignore their own |
| Migration backups ignored | ✅ `.env.bak-*`, `*.env.bak-*` |
| Real values present in root `.env` | ✅ `MONAD_PRIVATE_KEY`, `NANSEN_API_KEY`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `PRIVY_JWKS_ENDPOINT`, `AURORA_INTENTS_APP_KEY`, `ENVIO_API_TOKEN` |

Backup files created during the migration (`.env.bak-<stamp>`, `.env.example.bak-<stamp>`) still exist on disk and **contain real values**. They are ignored by git. Delete them once you are satisfied the migration is correct.
