/**
 * On-chain IncidentRegistry client for the Claimless SDK.
 *
 * Read paths work with zero configuration: defaults point at the deployed
 * IncidentRegistry on Monad testnet via the public RPC. Write paths require a
 * signer (`MONAD_PRIVATE_KEY`) and assert the chain id before submitting.
 *
 * Behaviour source of truth: contracts/src/IncidentRegistry.sol
 * Struct/enum source of truth: contracts/src/interfaces/ClaimlessTypes.sol
 *
 * On-chain `IncidentStatus` enum order — VERIFIED against ClaimlessTypes.sol:
 *   0 = PENDING, 1 = ACCEPTED, 2 = REJECTED, 3 = CHALLENGED
 * (Stored as uint8 on chain; mapped to the IncidentStatus string union below.)
 */

import {
  BaseError,
  ContractFunctionRevertedError,
  type Abi,
  type Account,
  type PublicClient,
  type WalletClient,
} from "viem";
import {
  assertChainId,
  createClients,
  monadTestnet,
  requireWallet,
  type Clients,
} from "./chain.js";
import { CLAIMLESS_TESTNET } from "./config.js";
import type { ClaimlessEnv } from "./env.js";
import { kindHash } from "./hash.js";
import incidentRegistryAbi from "./abis/IncidentRegistry.json" with { type: "json" };
import type { IncidentStatus, OnChainIncident } from "./types.js";

/** The real IncidentRegistry ABI (sdk/src/abis/IncidentRegistry.json). */
export const INCIDENT_REGISTRY_ABI = incidentRegistryAbi as unknown as Abi;

/** Default deployed IncidentRegistry on Monad testnet (see config.ts). */
export const INCIDENT_REGISTRY_ADDRESS = CLAIMLESS_TESTNET.incidentRegistry;

/** The address the contract uses for "no challenger" / "no resolver". */
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/**
 * On-chain IncidentStatus enum order — VERIFIED against
 * contracts/src/interfaces/ClaimlessTypes.sol:
 *   0 PENDING, 1 ACCEPTED, 2 REJECTED, 3 CHALLENGED
 */
const STATUS_BY_INDEX = [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "CHALLENGED",
] as const satisfies readonly IncidentStatus[];

/** Map a uint8 IncidentStatus from the contract onto the string union. */
export function statusFromIndex(index: number | bigint): IncidentStatus {
  const status = STATUS_BY_INDEX[Number(index)];
  if (status === undefined) {
    throw new Error(`Unknown IncidentStatus enum index ${index} from IncidentRegistry`);
  }
  return status;
}

/**
 * The Incident struct as viem decodes it. Numeric widths vary (uint8/uint40 come
 * back as number, uint256 as bigint), so every numeric field accepts both and is
 * normalised in toOnChainIncident.
 */
interface RawIncident {
  id: bigint | number;
  agentId: bigint | number;
  kind: `0x${string}`;
  severity: bigint | number;
  evidenceHash: `0x${string}`;
  reporter: `0x${string}`;
  stake: bigint | number;
  reportedAt: bigint | number;
  challengeDeadline: bigint | number;
  challenger: `0x${string}`;
  challengeStake: bigint | number;
  status: bigint | number;
}

/**
 * Contract's getIncidents returns a struct array with named components; viem
 * decodes those to objects keyed by component name. The positional-array branch
 * is defensive, in case a viem upgrade changes the decode shape.
 */
function toOnChainIncident(raw: unknown): OnChainIncident {
  let inc: RawIncident;
  if (Array.isArray(raw)) {
    const v = raw as unknown[];
    inc = {
      id: v[0] as number,
      agentId: v[1] as number,
      kind: v[2] as `0x${string}`,
      severity: v[3] as number,
      evidenceHash: v[4] as `0x${string}`,
      reporter: v[5] as `0x${string}`,
      stake: v[6] as bigint,
      reportedAt: v[7] as number,
      challengeDeadline: v[8] as number,
      challenger: v[9] as `0x${string}`,
      challengeStake: v[10] as bigint,
      status: v[11] as number,
    };
  } else {
    inc = raw as RawIncident;
  }

  return {
    id: BigInt(inc.id),
    agentId: BigInt(inc.agentId),
    kind: inc.kind,
    severity: Number(inc.severity),
    evidenceHash: inc.evidenceHash,
    reporter: inc.reporter,
    stake: BigInt(inc.stake),
    reportedAt: Number(inc.reportedAt),
    challengeDeadline: Number(inc.challengeDeadline),
    challenger: (inc.challenger ?? ZERO_ADDRESS) as `0x${string}`,
    challengeStake: BigInt(inc.challengeStake ?? 0n),
    status: statusFromIndex(inc.status),
  };
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Build a readable error for a failed call, keeping the contract error name
 * (e.g. IncidentRegistry__InsufficientStake) when the revert carried one.
 */
function describeViemError(cause: unknown): { errorName?: string; detail: string } {
  if (cause instanceof BaseError) {
    const reverted = cause.walk((err) => err instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      // viem 2.5x moved the decoded custom error to `.data.errorName`; older
      // builds exposed it directly on the error. Support both.
      const name = readErrorName(reverted);
      return {
        errorName: name,
        detail: name ? `reverted with ${name}` : (reverted.shortMessage ?? reverted.message),
      };
    }
    return { detail: cause.shortMessage ?? cause.message };
  }
  return { detail: cause instanceof Error ? cause.message : String(cause) };
}

/** Read the custom error name from a viem revert across versions. */
function readErrorName(err: ContractFunctionRevertedError): string | undefined {
  const direct = (err as unknown as { errorName?: string }).errorName;
  if (direct) return direct;
  const data = (err as unknown as { data?: { errorName?: string } }).data;
  return data?.errorName;
}

/** Error wrapping a failed registry call; carries the contract error name if known. */
export class RegistryContractError extends Error {
  /** Which call failed, e.g. "IncidentRegistry.reportIncident". */
  readonly context: string;
  /** Contract error name from the revert, e.g. "IncidentRegistry__InsufficientStake". */
  readonly contractErrorName: string | undefined;

  constructor(context: string, cause: unknown) {
    const { errorName, detail } = describeViemError(cause);
    super(`${context} failed: ${detail}`, { cause });
    this.name = "RegistryContractError";
    this.context = context;
    this.contractErrorName = errorName;
  }
}

/** Input for reportIncident. `kind` is the human-readable string, hashed on the way in. */
export interface ReportIncidentInput {
  /** ERC-8004 agent id (token id of the canonical identity registry). */
  agentId: bigint;
  /** Human-readable kind, e.g. "SLA_BREACH"; hashed with kindHash before submission. */
  kind: string;
  /** 1 (minor) .. 5 (catastrophic). Validated client-side with a clear error. */
  severity: number;
  /** bytes32 evidence commitment (see hash.ts#evidenceHash). The payload stays off-chain. */
  evidenceHash: `0x${string}`;
  /** Stake in wei. Defaults to the contract's minStake(); must be >= minStake(). */
  stakeWei?: bigint;
}

/** Typed facade over the deployed IncidentRegistry. */
export interface RegistryClient {
  /** Deployed IncidentRegistry address this client is bound to. */
  readonly address: `0x${string}`;
  /** Read-only viem client (Monad testnet). */
  readonly publicClient: PublicClient;

  // ---- reads (no signer needed) ----
  getIncidents(agentId: bigint): Promise<OnChainIncident[]>;
  getIncidentCount(agentId: bigint): Promise<number>;
  getIncident(incidentId: bigint): Promise<OnChainIncident>;
  totalIncidents(): Promise<number>;
  getAcceptedCount(agentId: bigint): Promise<number>;
  getAcceptedSeveritySum(agentId: bigint): Promise<number>;
  /** Minimum bond to report an incident, in wei. */
  minStake(): Promise<bigint>;
  /** How long a fresh report stays challengeable, in seconds. */
  CHALLENGE_WINDOW(): Promise<bigint>;
  /** Configured resolver address, or the zero address when permissionless. */
  resolver(): Promise<`0x${string}`>;

  // ---- writes (require a signer; return the tx hash) ----
  reportIncident(input: ReportIncidentInput): Promise<`0x${string}`>;
  challenge(incidentId: bigint, stakeWei: bigint): Promise<`0x${string}`>;
  resolveChallenge(incidentId: bigint, reportStands: boolean): Promise<`0x${string}`>;
  finalize(incidentId: bigint): Promise<`0x${string}`>;
}

/** Interface for the wallet bundle handed to a write call. */
interface Wallet {
  walletClient: WalletClient;
  account: Account;
  publicClient: PublicClient;
}

class RegistryClientImpl implements RegistryClient {
  readonly address: `0x${string}`;
  readonly publicClient: PublicClient;
  private readonly clients: Clients;

  constructor(clients: Clients, address: `0x${string}` = CLAIMLESS_TESTNET.incidentRegistry) {
    this.clients = clients;
    this.publicClient = clients.publicClient;
    this.address = address;
  }

  /** Run a read, wrapping any revert in a RegistryContractError. */
  private async read<T>(label: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (cause) {
      throw new RegistryContractError(label, cause);
    }
  }

  /**
   * Require a wallet, assert the RPC is Monad testnet, run the write, and wrap
   * any revert in a RegistryContractError. Returns the tx hash.
   */
  private async submit(
    label: string,
    send: (wallet: Wallet) => Promise<`0x${string}`>,
  ): Promise<`0x${string}`> {
    const wallet = requireWallet(this.clients.env);
    await assertChainId(wallet.publicClient);
    try {
      return await send(wallet);
    } catch (cause) {
      throw new RegistryContractError(label, cause);
    }
  }

  // ------------------------------------------------------------------
  // Reads
  // ------------------------------------------------------------------

  getIncidents(agentId: bigint): Promise<OnChainIncident[]> {
    return this.read("IncidentRegistry.getIncidents", async () => {
      const raw = (await this.publicClient.readContract({
        address: this.address,
        abi: INCIDENT_REGISTRY_ABI,
        functionName: "getIncidents",
        args: [agentId],
      })) as readonly unknown[];
      return raw.map(toOnChainIncident);
    });
  }

  getIncidentCount(agentId: bigint): Promise<number> {
    return this.read("IncidentRegistry.getIncidentCount", () =>
      this.publicClient
        .readContract({
          address: this.address,
          abi: INCIDENT_REGISTRY_ABI,
          functionName: "getIncidentCount",
          args: [agentId],
        })
        .then(Number),
    );
  }

  getIncident(incidentId: bigint): Promise<OnChainIncident> {
    return this.read("IncidentRegistry.getIncident", async () =>
      toOnChainIncident(
        await this.publicClient.readContract({
          address: this.address,
          abi: INCIDENT_REGISTRY_ABI,
          functionName: "getIncident",
          args: [incidentId],
        }),
      ),
    );
  }

  totalIncidents(): Promise<number> {
    return this.read("IncidentRegistry.totalIncidents", () =>
      this.publicClient
        .readContract({
          address: this.address,
          abi: INCIDENT_REGISTRY_ABI,
          functionName: "totalIncidents",
        })
        .then(Number),
    );
  }

  getAcceptedCount(agentId: bigint): Promise<number> {
    return this.read("IncidentRegistry.getAcceptedCount", () =>
      this.publicClient
        .readContract({
          address: this.address,
          abi: INCIDENT_REGISTRY_ABI,
          functionName: "getAcceptedCount",
          args: [agentId],
        })
        .then(Number),
    );
  }

  getAcceptedSeveritySum(agentId: bigint): Promise<number> {
    return this.read("IncidentRegistry.getAcceptedSeveritySum", () =>
      this.publicClient
        .readContract({
          address: this.address,
          abi: INCIDENT_REGISTRY_ABI,
          functionName: "getAcceptedSeveritySum",
          args: [agentId],
        })
        .then(Number),
    );
  }

  minStake(): Promise<bigint> {
    return this.read("IncidentRegistry.minStake", () =>
      this.publicClient
        .readContract({
          address: this.address,
          abi: INCIDENT_REGISTRY_ABI,
          functionName: "minStake",
        })
        .then((v) => BigInt(v as bigint | string | number)),
    );
  }

  CHALLENGE_WINDOW(): Promise<bigint> {
    return this.read("IncidentRegistry.CHALLENGE_WINDOW", () =>
      this.publicClient
        .readContract({
          address: this.address,
          abi: INCIDENT_REGISTRY_ABI,
          functionName: "CHALLENGE_WINDOW",
        })
        .then((v) => BigInt(v as bigint | string | number)),
    );
  }

  resolver(): Promise<`0x${string}`> {
    return this.read("IncidentRegistry.resolver", () =>
      this.publicClient
        .readContract({
          address: this.address,
          abi: INCIDENT_REGISTRY_ABI,
          functionName: "resolver",
        })
        .then((value) => value as `0x${string}`),
    );
  }

  // ------------------------------------------------------------------
  // Writes
  // ------------------------------------------------------------------

  reportIncident(input: ReportIncidentInput): Promise<`0x${string}`> {
    const severity = Number(input.severity);
    if (!Number.isInteger(severity) || severity < 1 || severity > 5) {
      throw new Error(
        `Invalid severity ${String(input.severity)}: must be an integer 1..5 ` +
          `(the contract would revert with IncidentRegistry__InvalidSeverity).`,
      );
    }

    return this.submit("IncidentRegistry.reportIncident", async (wallet) => {
      const minStakeWei = await this.minStake();
      const stakeWei = input.stakeWei ?? minStakeWei;
      if (stakeWei < minStakeWei) {
        throw new Error(
          `Stake ${stakeWei} wei is below minStake ${minStakeWei} wei ` +
            `(the contract would revert with IncidentRegistry__InsufficientStake).`,
        );
      }
      return wallet.walletClient.writeContract({
        address: this.address,
        abi: INCIDENT_REGISTRY_ABI,
        functionName: "reportIncident",
        args: [input.agentId, kindHash(input.kind), severity, input.evidenceHash],
        chain: monadTestnet,
        value: stakeWei,
        account: wallet.account,
      });
    });
  }

  challenge(incidentId: bigint, stakeWei: bigint): Promise<`0x${string}`> {
    return this.submit("IncidentRegistry.challenge", async (wallet) => {
      // Pre-validate against the live incident so failures read clearly.
      const incident = await this.getIncident(incidentId);
      if (incident.status !== "PENDING") {
        throw new Error(
          `Incident ${incidentId} is ${incident.status}, not PENDING; cannot challenge ` +
            `(the contract would revert with IncidentRegistry__NotChallengeable).`,
        );
      }
      if (Math.floor(Date.now() / 1000) >= incident.challengeDeadline) {
        throw new Error(
          `Challenge window closed at ${incident.challengeDeadline} for incident ${incidentId} ` +
            `(the contract would revert with IncidentRegistry__ChallengeWindowClosed).`,
        );
      }
      if (stakeWei !== incident.stake) {
        throw new Error(
          `Challenge stake ${stakeWei} wei must exactly match the reporter's stake ` +
            `${incident.stake} wei (the contract would revert with IncidentRegistry__StakeMismatch).`,
        );
      }
      return wallet.walletClient.writeContract({
        address: this.address,
        abi: INCIDENT_REGISTRY_ABI,
        functionName: "challenge",
        chain: monadTestnet,
        args: [incidentId],
        value: stakeWei,
        account: wallet.account,
      });
    });
  }

  resolveChallenge(incidentId: bigint, reportStands: boolean): Promise<`0x${string}`> {
    return this.submit("IncidentRegistry.resolveChallenge", async (wallet) => {
      const resolverAddress = await this.resolver();
      if (resolverAddress !== ZERO_ADDRESS && !sameAddress(resolverAddress, wallet.account.address)) {
        throw new Error(
          `Only the configured resolver (${resolverAddress}) may resolve challenges; ` +
            `caller is ${wallet.account.address} ` +
            `(the contract would revert with IncidentRegistry__NotResolver).`,
        );
      }
      return wallet.walletClient.writeContract({
        address: this.address,
        abi: INCIDENT_REGISTRY_ABI,
        functionName: "resolveChallenge",
        chain: monadTestnet,
        args: [incidentId, reportStands],
        account: wallet.account,
      });
    });
  }

  finalize(incidentId: bigint): Promise<`0x${string}`> {
    return this.submit("IncidentRegistry.finalize", (wallet) =>
      wallet.walletClient.writeContract({
        address: this.address,
        abi: INCIDENT_REGISTRY_ABI,
        functionName: "finalize",
        chain: monadTestnet,
        args: [incidentId],
        account: wallet.account,
      }),
    );
  }
}

/**
 * Build a registry client. Read-only unless the environment carries a private
 * key; see chain.ts#createClients.
 */
export function createRegistryClient(
  env?: ClaimlessEnv,
  address: `0x${string}` = CLAIMLESS_TESTNET.incidentRegistry,
): RegistryClient {
  return new RegistryClientImpl(createClients(env), address);
}

// ----------------------------------------------------------------------
// Convenience wrappers bound to the default environment/address.
// ----------------------------------------------------------------------

let sharedDefaultClient: RegistryClient | undefined;

function defaultClient(): RegistryClient {
  if (!sharedDefaultClient) sharedDefaultClient = createRegistryClient();
  return sharedDefaultClient;
}

function clientFor(env?: ClaimlessEnv): RegistryClient {
  return env ? createRegistryClient(env) : defaultClient();
}

export function getIncidents(agentId: bigint, env?: ClaimlessEnv): Promise<OnChainIncident[]> {
  return clientFor(env).getIncidents(agentId);
}

export function getIncidentCount(agentId: bigint, env?: ClaimlessEnv): Promise<number> {
  return clientFor(env).getIncidentCount(agentId);
}

export function getIncident(incidentId: bigint, env?: ClaimlessEnv): Promise<OnChainIncident> {
  return clientFor(env).getIncident(incidentId);
}

export function totalIncidents(env?: ClaimlessEnv): Promise<number> {
  return clientFor(env).totalIncidents();
}

export function getAcceptedCount(agentId: bigint, env?: ClaimlessEnv): Promise<number> {
  return clientFor(env).getAcceptedCount(agentId);
}

export function getAcceptedSeveritySum(agentId: bigint, env?: ClaimlessEnv): Promise<number> {
  return clientFor(env).getAcceptedSeveritySum(agentId);
}

export function minStake(env?: ClaimlessEnv): Promise<bigint> {
  return clientFor(env).minStake();
}

export function CHALLENGE_WINDOW(env?: ClaimlessEnv): Promise<bigint> {
  return clientFor(env).CHALLENGE_WINDOW();
}

export function reportIncident(
  input: ReportIncidentInput,
  env?: ClaimlessEnv,
): Promise<`0x${string}`> {
  return clientFor(env).reportIncident(input);
}

export function challenge(incidentId: bigint, stakeWei: bigint, env?: ClaimlessEnv): Promise<`0x${string}`> {
  return clientFor(env).challenge(incidentId, stakeWei);
}

export function resolveChallenge(
  incidentId: bigint,
  reportStands: boolean,
  env?: ClaimlessEnv,
): Promise<`0x${string}`> {
  return clientFor(env).resolveChallenge(incidentId, reportStands);
}

export function finalize(incidentId: bigint, env?: ClaimlessEnv): Promise<`0x${string}`> {
  return clientFor(env).finalize(incidentId);
}