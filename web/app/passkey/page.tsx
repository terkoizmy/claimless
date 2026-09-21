"use client";

/**
 * Passkey test page (Mera).
 *
 * This is the ~2-minute human step that closes the Mera bounty: confirm that a
 * REAL passkey ceremony returns a PRF output on this machine, and that the
 * derived account is reproducible. It uses the same derivation as
 * `sdk/src/mera.ts` (see web/lib/mera-browser.ts), pinned to the authoritative
 * BIP-39 wordlist.
 *
 * It is not a mock and not a demo of fake data: if the ceremony succeeds you
 * get a real address; if it fails you get the actionable PRF_UNAVAILABLE
 * remediation. The derived account is NOT stored anywhere — that is the point
 * of Mera: the address is recomputable from the passkey alone, forever.
 */

import { useEffect, useState } from "react";
import {
  MERA_PRF_REMEDIATION,
  MeraError,
  createPasskeyAccount,
  getPasskeyPrfOutput,
  isMeraAvailable,
  type PasskeyResult,
} from "@/lib/mera-browser";
import { explorerAddressUrl } from "@/lib/format";

type State =
  | { kind: "idle" }
  | { kind: "running"; what: string }
  | { kind: "ok"; result: PasskeyResult; mode: "create" | "signin" }
  | { kind: "error"; code: string; message: string };

export default function PasskeyPage() {
  const [state, setState] = useState<State>({ kind: "idle" });
  // Availability is a browser-only fact; compute it after mount so SSR and the
  // first client render agree (avoiding a hydration mismatch).
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    setAvailable(isMeraAvailable());
  }, []);

  async function run(mode: "create" | "signin") {
    setState({
      kind: "running",
      what: mode === "create" ? "creating a passkey" : "signing in with a passkey",
    });
    try {
      if (mode === "create") {
        const result = await createPasskeyAccount({ rpName: "Claimless", keyCount: 5 });
        setState({ kind: "ok", result, mode });
      } else {
        const handle = await getPasskeyPrfOutput({});
        setState({
          kind: "ok",
          mode,
          result: { ...handle, address: "", keys: [] },
        });
      }
    } catch (err) {
      if (err instanceof MeraError) {
        setState({ kind: "error", code: err.code, message: err.message });
      } else {
        setState({
          kind: "error",
          code: "UNKNOWN",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="font-mono text-sm font-semibold tracking-wider text-[#d7e2ea]">
        PASSKEY TEST · MERA
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[#a9bccb]">
        Claimless uses <span className="text-[#d7e2ea]">Mera</span> so a human underwriter can
        sign in with a passkey instead of a seed phrase. This page is the one human step that
        cannot be unit-tested: it runs a real WebAuthn ceremony and confirms the device returns
        a PRF output. Nothing is stored; the address is derived from your passkey and is
        recomputable forever.
      </p>

      <div className="mt-4 rounded border border-[#1e2a35] bg-[#0d1218] p-4 font-mono text-xs">
        <div className="text-[#6b8299]">
          secure context:{" "}
          <span className={available ? "text-emerald-300" : "text-amber-300"}>
            {available === null ? "checking…" : available ? "yes (WebAuthn available)" : "no"}
          </span>
        </div>
        {available === false ? (
          <div className="mt-2 text-amber-300">
            Open this page at <code>http://localhost:3000/passkey/</code> (or over HTTPS).
            WebAuthn requires a secure context.
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          onClick={() => run("create")}
          disabled={state.kind === "running"}
          className="rounded border border-emerald-700 bg-emerald-950/40 px-3 py-2 font-mono text-xs text-emerald-200 hover:bg-emerald-900/40 disabled:opacity-40"
        >
          {state.kind === "running" ? "working…" : "Create passkey + derive account"}
        </button>
        <button
          onClick={() => run("signin")}
          disabled={state.kind === "running"}
          className="rounded border border-[#1e2a35] px-3 py-2 font-mono text-xs text-[#8fa8bc] hover:bg-[#10161d] disabled:opacity-40"
        >
          Sign in with an existing passkey
        </button>
      </div>

      {state.kind === "running" ? (
        <div className="mt-4 rounded border border-[#1e2a35] bg-[#0d1218] p-3 font-mono text-xs text-[#8fa8bc]">
          {state.what}… complete the prompt in your browser.
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div className="mt-4 rounded border border-red-900 bg-red-950/30 p-4">
          <div className="font-mono text-xs text-red-300">[{state.code}]</div>
          <div className="mt-2 text-sm leading-6 text-[#e5d5d5]">{state.message}</div>
          {state.code === "PRF_UNAVAILABLE" ? (
            <div className="mt-3 rounded bg-[#0d1218] p-3 font-mono text-[11px] leading-5 text-[#a9bccb]">
              {MERA_PRF_REMEDIATION}
            </div>
          ) : null}
        </div>
      ) : null}

      {state.kind === "ok" ? (
        <div className="mt-4 rounded border border-emerald-900 bg-emerald-950/20 p-4">
          <div className="font-mono text-xs text-emerald-300">
            {state.mode === "create" ? "Passkey created, PRF returned." : "PRF assertion succeeded."}
          </div>
          <div className="mt-3 text-xs text-[#a9bccb]">
            credentialId:{" "}
            <code className="break-all text-[#d7e2ea]">{state.result.credential.credentialId}</code>
          </div>
          <div className="text-xs text-[#a9bccb]">
            rpId: <code className="text-[#d7e2ea]">{state.result.credential.rpId}</code>
          </div>
          <div className="mt-2 text-xs text-[#a9bccb]">
            PRF output:{" "}
            <code className="break-all text-[#d7e2ea]">
              {Array.from(state.result.prfOutput)
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("")}
            </code>
          </div>

          {state.result.keys.length > 0 ? (
            <div className="mt-4">
              <div className="font-mono text-[11px] uppercase tracking-widest text-[#6b8299]">
                One passkey, many keys
              </div>
              <table className="mt-2 w-full font-mono text-[11px]">
                <thead>
                  <tr className="text-left text-[#6b8299]">
                    <th className="pr-4">index</th>
                    <th className="pr-4">purpose</th>
                    <th>address</th>
                  </tr>
                </thead>
                <tbody>
                  {state.result.keys.map((k) => (
                    <tr key={k.index} className="text-[#d7e2ea]">
                      <td className="pr-4">{k.index}</td>
                      <td className="pr-4 text-[#8fa8bc]">{k.purpose}</td>
                      <td>
                        <a
                          href={explorerAddressUrl(k.address)}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-emerald-300"
                        >
                          {k.address}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs leading-5 text-[#a9bccb]">
                Sign in on any synced device and these addresses come back identically. Nothing
                is stored on a server, because there is none.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
