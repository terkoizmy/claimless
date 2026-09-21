/** @type {import('next').NextConfig} */
const nextConfig = {
  // The dashboard is fully static: reads happen client-side against a public
  // RPC, so there is no server component and no server-side env needed.
  // NOTE: plain JS on purpose. Node 24's ESM loader does not strip
  // `import type { ... }` from .mjs files, so TS syntax here breaks next build.
  outputFileTracingRoot: import.meta.dirname,
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;