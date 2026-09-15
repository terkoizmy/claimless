/**
 * Thin launcher so `pnpm report` runs the agent from inside the SDK package,
 * where viem and the SDK source resolve normally.
 *
 * The agent itself lives at agents/reporter.ts so it reads as part of the
 * agents/ story rather than as an SDK script.
 */

import "../../agents/reporter.js";
