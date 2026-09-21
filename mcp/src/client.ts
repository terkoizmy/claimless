/**
 * Thin viem clients over the deployed Claimless + ERC-8004 contracts.
 *
 * Mirrors the read/write surface of sdk/src/registry.ts, sdk/src/risk.ts and
 * sdk/src/erc8004.ts without importing them: the sdk package resolves its
 * addresses from sdk/src/config.ts, which currently carries stale addresses,
 * while this server is required to resolve addresses at runtime from
 * contracts/deployments/monad-testnet.json. Calling the contracts directly
 * with viem and the same ABIs keeps the two decoupled and the data identical.
 *
 * Read paths work with zero configuration (public RPC default).
 * Write paths require MONAD_PRIVATE_KEY and fail with a clear message when it
 * is absent, rather than crashing the server.
 */

import {
  BaseError,
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  stringToHex,
  type Abi,
  type Account,
  type Address,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ERC8004_IDENTITY_ABI,
  ERC8004_REPUTATION_ABI,
  INCIDENT_REGISTRY_ABI,
  RISK_SCORE_ABI,
  statusFromIndex,
  type IncidentStatus,
} from "./abis.js";
import { formatMon, monadTestnet, type DeployedAddresses } from "./addresses.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/** viem 2.x renders ERC-721 nonexistent-token reverts this way; 0x7e273289 is ERC721NonexistentToken(). */
const ERC721_NONEXISTENT = "0x7e273289";

/** Human-readable message for a nonexistent agent id (ownerOf revert). */
function isNonexistentTokenError(err: unknown): boolean {
  if (!(err instanceof BaseError)) return false;
  return err.message.includes(ERC721_NONEXISTENT) || /ERC721NonexistentToken|nonexistent token/i.test(err.message);
}

function nonexistentTokenMessage(agentId: bigint, registry: string): Error {
  return new Error(
    `agentId ${agentId} is not registered in the canonical ERC-8004 IdentityRegistry ` +
      `(${registry}): ownerOf reverted with ERC721NonexistentToken. Check the agentId ` +
      "(ids start at 0; 0x-prefixed hex also accepted).",
  );
}

/** An incident as returned by IncidentRegistry.getIncidents, normalised. */
export interface OnChainIncident {
  id: string;
  agentId: string;
  kind: string;
  severity: number;
  evidenceHash: string;
  reporter: string;
  stake: string;
  reportedAt: number;
  challengeDeadline: number;
  challenger: string | null;
  challengeStake: string;
  status: IncidentStatus;
}

/** Full identity record from the canonical ERC-8004 IdentityRegistry. */
export interface AgentIdentityInfo {
  agentId: string;
  owner: string;
  agentWallet: string;
  tokenURI: string;
}

/** Risk bundle from RiskScore.getScoreBundle plus the constants it is computed from. */
export interface ScoreBundle {
  score: number;
  acceptedCount: number;
  severitySum: number;
  maxScore: number;
  freqWeight: number;
  sevWeight: number;
}

/** ERC-8004 reputation summary (signed fixed point). */
export interface AgentReputation {
  count: string;
  summaryValue: string;
  summaryValueDecimals: number;
}

/** Runtime context the tool handlers are bound to. */
export class ClaimlessClient {
  readonly addresses: DeployedAddresses;
  readonly publicClient: PublicClient;
  private readonly privateKey: string | undefined;

  constructor(opts: {
    addresses: DeployedAddresses;
    rpcUrl: string;
    privateKey: string | undefined;
  }) {
    this.addresses = opts.addresses;
    this.privateKey = opts.privateKey;
    this.publicClient = createPublicClient({
      chain: monadTestnet,
      transport: http(opts.rpcUrl, { retryCount: 2, timeout: 20_000 }),
    });
  }

  // ------------------------------------------------------------------
  // Signer handling for the write tool
  // ------------------------------------------------------------------

  /** Throw a clear, actionable error when no usable signer is configured. */
  requireWallet(): { walletClient: WalletClient; account: Account } {
    const raw = this.privateKey;
    if (!raw || raw.trim().length === 0) {
      throw new Error(
        "report_incident spends funds: it needs a signer. Set the MONAD_PRIVATE_KEY " +
          "environment variable (a Monad testnet key funded with MON for the stake) and " +
          "restart the MCP server. The read tools work without any configuration.",
      );
    }
    const key = (raw.startsWith("0x") ? raw : `0x${raw}`).trim();
    const account = privateKeyToAccount(key as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: monadTestnet,
      transport: http(process.env.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz", {
        retryCount: 2,
        timeout: 20_000,
      }),
    });
    return { walletClient, account };
  }

  /** Assert the RPC is Monad testnet before doing anything stateful. */
  async assertChainId(client: PublicClient = this.publicClient): Promise<void> {
    const id = await client.getChainId();
    if (id !== 10143) {
      throw new Error(`Connected to chain ${id}, expected 10143 (Monad testnet). Check MONAD_RPC_URL.`);
    }
  }

  // ------------------------------------------------------------------
  // Reads - ERC-8004 identity (canonical registry)
  // ------------------------------------------------------------------

  async getAgentIdentity(agentId: bigint): Promise<AgentIdentityInfo> {
    let owner: Address;
    let agentWallet: Address;
    let tokenURI: string;
    try {
      [owner, agentWallet, tokenURI] = await Promise.all([
        this.publicClient.readContract({
          address: this.addresses.erc8004Identity,
          abi: ERC8004_IDENTITY_ABI,
          functionName: "ownerOf",
          args: [agentId],
        }) as Promise<Address>,
        this.publicClient.readContract({
          address: this.addresses.erc8004Identity,
          abi: ERC8004_IDENTITY_ABI,
          functionName: "getAgentWallet",
          args: [agentId],
        }) as Promise<Address>,
        this.publicClient.readContract({
          address: this.addresses.erc8004Identity,
          abi: ERC8004_IDENTITY_ABI,
          functionName: "tokenURI",
          args: [agentId],
        }) as Promise<string>,
      ]);
    } catch (err) {
      if (isNonexistentTokenError(err)) {
        throw nonexistentTokenMessage(agentId, this.addresses.erc8004Identity);
      }
      throw err;
    }
    return { agentId: agentId.toString(), owner, agentWallet, tokenURI };
  }

  /** ERC-8004 reputation summary via the canonical ReputationRegistry. */
  async getReputationSummary(
    agentId: bigint,
    clients: readonly Address[],
    tag1: string,
  ): Promise<AgentReputation> {
    const raw = (await this.publicClient.readContract({
      address: this.addresses.erc8004Reputation,
      abi: ERC8004_REPUTATION_ABI,
      functionName: "getSummary",
      args: [agentId, [...clients], tag1, ""],
    })) as unknown as [bigint, bigint, number];
    const [count, summaryValue, summaryValueDecimals] = raw;
    const negative = summaryValue < 0n;
    const abs = negative ? -summaryValue : summaryValue;
    const scale = 10n ** BigInt(summaryValueDecimals);
    const whole = abs / scale;
    const frac = (abs % scale).toString().padStart(summaryValueDecimals, "0");
    return {
      count: count.toString(),
      summaryValue: `${negative ? "-" : ""}${whole}.${frac}`,
      summaryValueDecimals,
    };
  }

  // ------------------------------------------------------------------
  // Reads - RiskScore
  // ------------------------------------------------------------------

  async getScoreBundle(agentId: bigint): Promise<ScoreBundle> {
    const [bundle, freq, sev, max] = (await Promise.all([
      this.publicClient.readContract({
        address: this.addresses.riskScore,
        abi: RISK_SCORE_ABI,
        functionName: "getScoreBundle",
        args: [agentId],
      }),
      this.publicClient.readContract({
        address: this.addresses.riskScore,
        abi: RISK_SCORE_ABI,
        functionName: "FREQ_WEIGHT",
      }),
      this.publicClient.readContract({
        address: this.addresses.riskScore,
        abi: RISK_SCORE_ABI,
        functionName: "SEV_WEIGHT",
      }),
      this.publicClient.readContract({
        address: this.addresses.riskScore,
        abi: RISK_SCORE_ABI,
        functionName: "MAX_SCORE",
      }),
    ])) as unknown as [readonly [bigint, bigint, bigint], bigint, bigint, bigint];

    const [score, acceptedCount, severitySum] = bundle;
    return {
      score: Number(score),
      acceptedCount: Number(acceptedCount),
      severitySum: Number(severitySum),
      maxScore: Number(max),
      freqWeight: Number(freq),
      sevWeight: Number(sev),
    };
  }

  // ------------------------------------------------------------------
  // Reads - IncidentRegistry
  // ------------------------------------------------------------------

  private decodeIncident(raw: unknown): OnChainIncident {
    const v = Array.isArray(raw)
      ? (raw as unknown[])
      : Object.values(raw as Record<string, unknown>);
    const statusIdx = Number(v[11]);
    return {
      id: BigInt(v[0] as bigint | number).toString(),
      agentId: BigInt(v[1] as bigint | number).toString(),
      kind: String(v[2]),
      severity: Number(v[3]),
      evidenceHash: String(v[4]),
      reporter: String(v[5]),
      stake: BigInt(v[6] as bigint | number).toString(),
      reportedAt: Number(v[7]),
      challengeDeadline: Number(v[8]),
      challenger: String(v[9] ?? ZERO_ADDRESS) === ZERO_ADDRESS ? null : String(v[9]),
      challengeStake: BigInt(v[10] as bigint | number).toString(),
      status: statusFromIndex(statusIdx),
    };
  }

  async getIncidents(agentId: bigint): Promise<OnChainIncident[]> {
    const raw = (await this.publicClient.readContract({
      address: this.addresses.incidentRegistry,
      abi: INCIDENT_REGISTRY_ABI,
      functionName: "getIncidents",
      args: [agentId],
    })) as readonly unknown[];
    return raw.map((r) => this.decodeIncident(r));
  }

  async getIncidentCount(agentId: bigint): Promise<number> {
    const raw = (await this.publicClient.readContract({
      address: this.addresses.incidentRegistry,
      abi: INCIDENT_REGISTRY_ABI,
      functionName: "getIncidentCount",
      args: [agentId],
    })) as bigint;
    return Number(raw);
  }

  async getAcceptedCount(agentId: bigint): Promise<number> {
    const raw = (await this.publicClient.readContract({
      address: this.addresses.incidentRegistry,
      abi: INCIDENT_REGISTRY_ABI,
      functionName: "getAcceptedCount",
      args: [agentId],
    })) as bigint;
    return Number(raw);
  }

  async totalIncidents(): Promise<number> {
    const raw = (await this.publicClient.readContract({
      address: this.addresses.incidentRegistry,
      abi: INCIDENT_REGISTRY_ABI,
      functionName: "totalIncidents",
    })) as bigint;
    return Number(raw);
  }

  async minStake(): Promise<bigint> {
    const raw = (await this.publicClient.readContract({
      address: this.addresses.incidentRegistry,
      abi: INCIDENT_REGISTRY_ABI,
      functionName: "minStake",
    })) as bigint;
    return raw;
  }

  async challengeWindow(): Promise<bigint> {
    const raw = (await this.publicClient.readContract({
      address: this.addresses.incidentRegistry,
      abi: INCIDENT_REGISTRY_ABI,
      functionName: "CHALLENGE_WINDOW",
    })) as bigint;
    return raw;
  }

  // ------------------------------------------------------------------
  // Write - reportIncident (spends funds)
  // ------------------------------------------------------------------

  async reportIncident(input: {
    agentId: bigint;
    kind: string;
    severity: number;
    evidenceHash: `0x${string}`;
    stakeWei?: bigint;
    dryRun: boolean;
  }): Promise<{
    dryRun: boolean;
    txHash?: string;
    incidentId?: string;
    agentId: string;
    kind: string;
    kindHash: string;
    severity: number;
    evidenceHash: string;
    stakeWei: string;
    stakeMon: string;
    minStakeWei: string;
    reporter?: string;
    explorerUrl?: string;
    blockNumber?: number;
  }> {
    const kindBytes = keccak256(stringToHex(input.kind)) as `0x${string}`;
    const minStake = await this.minStake();
    const stakeWei = input.stakeWei ?? minStake;

    if (!Number.isInteger(input.severity) || input.severity < 1 || input.severity > 5) {
      throw new Error(
        `Invalid severity ${String(input.severity)}: must be an integer 1..5 ` +
          "(the contract would revert with IncidentRegistry__InvalidSeverity).",
      );
    }
    if (stakeWei < minStake) {
      throw new Error(
        `Stake ${stakeWei} wei is below minStake ${minStake} wei ` +
          "(the contract would revert with IncidentRegistry__InsufficientStake).",
      );
    }

    const base = {
      dryRun: input.dryRun,
      agentId: input.agentId.toString(),
      kind: input.kind,
      kindHash: kindBytes,
      severity: input.severity,
      evidenceHash: input.evidenceHash,
      stakeWei: stakeWei.toString(),
      stakeMon: formatMon(stakeWei),
      minStakeWei: minStake.toString(),
    };

    if (input.dryRun) {
      return base;
    }

    const { walletClient, account } = this.requireWallet();
    await this.assertChainId(walletClient as unknown as PublicClient);

    // Optional preflight so reverts read clearly instead of raw RPC errors.
    await this.publicClient.simulateContract({
      address: this.addresses.incidentRegistry,
      abi: INCIDENT_REGISTRY_ABI as Abi,
      functionName: "reportIncident",
      args: [input.agentId, kindBytes, input.severity, input.evidenceHash],
      value: stakeWei,
      account,
    });

    const hash = await walletClient.writeContract({
      address: this.addresses.incidentRegistry,
      abi: INCIDENT_REGISTRY_ABI as Abi,
      functionName: "reportIncident",
      args: [input.agentId, kindBytes, input.severity, input.evidenceHash],
      value: stakeWei,
      chain: monadTestnet,
      account,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    // Read the incident id back from the receipt - never assume it.
    let incidentId: string | undefined;
    for (const log of receipt.logs) {
      try {
        const { decodeEventLog } = await import("viem");
        const decoded = decodeEventLog({
          abi: INCIDENT_REGISTRY_ABI as unknown as readonly [],
          data: log.data,
          topics: log.topics,
        } as never) as { eventName: string; args: { incidentId?: bigint } };
        if (decoded.eventName === "IncidentReported" && decoded.args.incidentId !== undefined) {
          incidentId = decoded.args.incidentId.toString();
        }
      } catch {
        // log from another contract in the same receipt; ignore
      }
    }

    return {
      ...base,
      txHash: hash,
      incidentId,
      reporter: account.address,
      explorerUrl: `https://testnet.monadvision.com/tx/${hash}`,
      blockNumber: Number(receipt.blockNumber),
    };
  }
}

export { ZERO_ADDRESS };