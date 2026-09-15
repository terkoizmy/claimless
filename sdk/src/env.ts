/**
 * Environment handling for the Claimless SDK.
 *
 * Nothing here throws at import time: the SDK is usable read-only with zero
 * configuration because the deployed addresses and public RPC are defaults.
 * Missing values only fail when a feature that needs them is actually called.
 */

const DEFAULT_RPC = "https://testnet-rpc.monad.xyz";
const DEFAULT_GRAPHQL = "http://localhost:8081/v1/graphql";
const DEFAULT_HASURA_SECRET = "testing";
const DEFAULT_INTENTS_BASE = "https://intents-api.aurora.dev";
const DEFAULT_1CLICK_BASE = "https://1click.chaindefuser.com";

export interface ClaimlessEnv {
  rpcUrl: string;
  graphqlUrl: string;
  hasuraSecret: string;
  privateKey: string | undefined;
  envioApiToken: string | undefined;
  nansenApiKey: string | undefined;
  auroraAppKey: string | undefined;
  intentsBaseUrl: string;
  oneClickBaseUrl: string;
  privyAppId: string | undefined;
  privyAppSecret: string | undefined;
  creApiKey: string | undefined;
}

export function readEnv(env: NodeJS.ProcessEnv = process.env): ClaimlessEnv {
  return {
    rpcUrl: env.MONAD_RPC_URL ?? DEFAULT_RPC,
    graphqlUrl: env.CLAIMLESS_GRAPHQL_URL ?? env.ENVIO_GRAPHQL_URL ?? DEFAULT_GRAPHQL,
    hasuraSecret: env.HASURA_GRAPHQL_ADMIN_SECRET ?? DEFAULT_HASURA_SECRET,
    privateKey: env.MONAD_PRIVATE_KEY,
    envioApiToken: env.ENVIO_API_TOKEN,
    nansenApiKey: env.NANSEN_API_KEY,
    auroraAppKey: env.AURORA_INTENTS_APP_KEY,
    intentsBaseUrl: env.AURORA_INTENTS_BASE_URL ?? DEFAULT_INTENTS_BASE,
    oneClickBaseUrl: env.ONECLICK_BASE_URL ?? DEFAULT_1CLICK_BASE,
    privyAppId: env.PRIVY_APP_ID,
    privyAppSecret: env.PRIVY_APP_SECRET,
    creApiKey: env.CRE_API_KEY,
  };
}

/** Thrown when a feature is used without the credentials it requires. */
export class MissingConfigError extends Error {
  constructor(
    public readonly variable: string,
    public readonly feature: string,
    hint?: string,
  ) {
    super(
      `Missing ${variable}, required for ${feature}.${hint ? ` ${hint}` : ""}`,
    );
    this.name = "MissingConfigError";
  }
}

export function requireEnv(value: string | undefined, variable: string, feature: string, hint?: string): string {
  if (!value) throw new MissingConfigError(variable, feature, hint);
  return value;
}
