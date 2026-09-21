import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Claimless — agent risk registry",
  description:
    "Live view of the Claimless on-chain risk registry for ERC-8004 AI agents, on Monad testnet. All numbers are read directly from deployed contracts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b border-[#1e2a35] bg-[#0d1218]">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <div className="flex items-baseline gap-3">
              <Link href="/" className="font-mono text-sm font-bold tracking-widest text-emerald-300">
                CLAIMLESS
              </Link>
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#6b8299]">
                risk registry + parametric coverage
              </span>
            </div>
            <nav className="flex items-center gap-4 font-mono text-xs">
              <Link href="/" className="text-[#8fa8bc] hover:text-emerald-300">
                agents
              </Link>
              <Link href="/coverage/" className="text-[#8fa8bc] hover:text-emerald-300">
                coverage
              </Link>
              <span className="rounded border border-[#1e2a35] px-2 py-0.5 text-[10px] text-[#6b8299]">
                monad testnet · 10143
              </span>
              <span className="rounded border border-emerald-900/60 bg-emerald-950/40 px-2 py-0.5 text-[10px] text-emerald-400">
                read-only
              </span>
            </nav>
          </div>
        </header>
        {children}
        <footer className="mx-auto max-w-6xl px-4 py-6 font-mono text-[10px] text-[#4d6273]">
          every value on this page is read live from deployed contracts on chain 10143 ·
          public RPC, no backend, no wallet, no mock data
        </footer>
      </body>
    </html>
  );
}