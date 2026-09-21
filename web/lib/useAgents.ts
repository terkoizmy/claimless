"use client";

/**
 * Live on-chain reads for the agents page. All data comes from real contract
 * calls on Monad testnet via the public RPC. There are no mocks and no
 * fallbacks: if the RPC fails, the error is rendered.
 */

import { useCallback, useEffect, useState } from "react";
import { formatEther } from "./format";
import { getPublicClient } from "./chain";
import {
  coverPoolAbi,
  erc8004IdentityAbi,
  incidentRegistryAbi,
  riskScoreAbi,
} from "./abi";
import {
  ADDRESSES,
  KNOWN_AGENT_IDS,
  QUOTE_AMOUNT,
  QUOTE_DURATION_SECONDS,
} from "./deployments";

export interface AgentRow {
  agentId: bigint;
  hasRecord: boolean;
  score: number;
  acceptedCount: number;
  severitySum: number;
  incidentCount: number;
  premium: string;
  maxCoverage: string;
  riskMultiplier: string;
  poolNormalCap: string;
  counterfactualMultiplier: string;
  erc8004Status: "owner" | "not_registered" | "unknown";
  erc8004Owner?: string;
  firstIncident?: {
    kind: string;
    severity: number;
    status: string;
    stake: string;
    reportedAt: number;
    evidenceHash: string;
  };
}

const STATUS_NAMES = ["PENDING", "ACCEPTED", "REJECTED", "CHALLENGED"] as const;

/** viem ContractFunctionExecutionError message -> short label. */
function shortError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/ERC721NonexistentToken|nonexistent/i.test(msg)) return "not registered on ERC-8004";
  return msg.length > 220 ? `${msg.slice(0, 217)}…` : msg;
}

export function useAgents() {
  const [rows, setRows] = useState<AgentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    try {
      const client = getPublicClient();

      // First a probe read to fail fast with a clear RPC error.
      await client.readContract({
        address: ADDRESSES.incidentRegistry,
        abi: incidentRegistryAbi,
        functionName: "getAcceptedCount",
        args: [KNOWN_AGENT_IDS[0]],
      });

      const built: AgentRow[] = [];
      for (const agentId of KNOWN_AGENT_IDS) {
        // RiskScore.getScoreBundle = live score + raw registry inputs (one call).
        const bundle = (await client.readContract({
          address: ADDRESSES.riskScore,
          abi: riskScoreAbi,
          functionName: "getScoreBundle",
          args: [agentId],
        })) as unknown as [bigint, bigint, bigint];
        const [score, acceptedCount, severitySum] = bundle;

        const incidentCount = (await client.readContract({
          address: ADDRESSES.incidentRegistry,
          abi: incidentRegistryAbi,
          functionName: "getIncidentCount",
          args: [agentId],
        })) as unknown as bigint;

        const quote = (await client.readContract({
          address: ADDRESSES.coverPool,
          abi: coverPoolAbi,
          functionName: "quotePremium",
          args: [agentId, QUOTE_AMOUNT, QUOTE_DURATION_SECONDS],
        })) as unknown as [bigint, bigint, boolean, bigint];
        const [premium, maxCoverage, hadRecord, riskMultiplier] = quote;

        // Caps, from the pool's own constants: a silent agent gets
        // NO_RECORD_MAX_BPS (10%) of the normal per-policy cap
        // (capacity * NORMAL_MAX_CAPACITY_BPS). Displayed for contrast.
        const poolNormalCapRaw = (await client.readContract({
          address: ADDRESSES.coverPool,
          abi: coverPoolAbi,
          functionName: "getCapacity",
        })) as unknown as bigint;
        const normalCapacityBps = (await client.readContract({
          address: ADDRESSES.coverPool,
          abi: coverPoolAbi,
          functionName: "NORMAL_MAX_CAPACITY_BPS",
        })) as unknown as bigint;
        const poolNormalCap = (poolNormalCapRaw * normalCapacityBps) / 10_000n;

        // Counterfactual terms if this agent DID have a record with the same
        // score: the multiplier comes from the pool's own multiplierForScore
        // (an on-chain pure function), the cap is the pool's normal cap. This
        // is labeled "if recorded" in the UI; both inputs are real reads.
        const counterfactualMultiplierFp = (await client.readContract({
          address: ADDRESSES.coverPool,
          abi: coverPoolAbi,
          functionName: "multiplierForScore",
          args: [score],
        })) as unknown as bigint;

        let erc8004Status: AgentRow["erc8004Status"] = "unknown";
        let erc8004Owner: string | undefined;
        try {
          const owner = (await client.readContract({
            address: ADDRESSES.erc8004Identity,
            abi: erc8004IdentityAbi,
            functionName: "ownerOf",
            args: [agentId],
          })) as unknown as string;
          erc8004Status = "owner";
          erc8004Owner = owner;
        } catch (err) {
          const msg =
            err instanceof Error
              ? err.message
              : typeof err === "object" && err !== null
                ? JSON.stringify(err)
                : String(err);
          erc8004Status = /ERC721NonexistentToken|nonexistent/i.test(msg)
            ? "not_registered"
            : "unknown";
        }

        let firstIncident: AgentRow["firstIncident"];
        if (incidentCount > 0n) {
          try {
            // viem decodes an unnamed tuple as a plain array; field order is
            // the Incident struct order from ClaimlessTypes.sol:
            // (id, agentId, kind, severity, evidenceHash, reporter, stake,
            //  reportedAt, challengeDeadline, challenger, challengeStake, status)
            const inc = (await client.readContract({
              address: ADDRESSES.incidentRegistry,
              abi: incidentRegistryAbi,
              functionName: "getIncident",
              args: [0n],
            })) as unknown as [
              bigint,
              bigint,
              string,
              number,
              string,
              string,
              bigint,
              bigint,
              bigint,
              string,
              bigint,
              number,
            ];
            const [id, incAgentId, kind, severity, evidenceHash, , stake, reportedAt, , , , status] = inc;
            if (incAgentId === agentId) {
              firstIncident = {
                kind,
                severity,
                status: STATUS_NAMES[status] ?? `STATUS_${status}`,
                stake: formatEther(stake),
                reportedAt: Number(reportedAt) * 1000,
                evidenceHash,
              };
            }
            void id;
          } catch {
            // The incident read is best-effort; the primary numbers above are
            // the evidence. A failed incident read must not blank the page.
          }
        }

        built.push({
          agentId,
          hasRecord: hadRecord,
          score: Number(score),
          acceptedCount: Number(acceptedCount),
          severitySum: Number(severitySum),
          incidentCount: Number(incidentCount),
          premium: formatEther(premium),
          maxCoverage: formatEther(maxCoverage),
          riskMultiplier: `${Number(riskMultiplier) / 10_000}x`,
          poolNormalCap: formatEther(poolNormalCap),
          counterfactualMultiplier: `${Number(counterfactualMultiplierFp) / 10_000}x`,
          erc8004Status,
          erc8004Owner,
          firstIncident,
        });
      }
      setRows(built);
      setError(null);
    } catch (err) {
      setError(shortError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  return { rows, error, loading, refreshing, reload: () => load(true) };
}