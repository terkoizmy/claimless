# Claimless indexer container (follows Envio's official local-docker-example).
FROM node:24.3.0-slim

# psql is needed for dumping/restoring the initial effects cache.
RUN apt-get update && \
    apt-get install -y --no-install-recommends postgresql-client && \
    rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@9.7.1

WORKDIR /envio-indexer

COPY ./package.json ./package.json
# pnpm-lock.yaml is committed after the first local `pnpm install`.
COPY ./pnpm-lock.yaml* ./
RUN pnpm install

COPY ./config.yaml ./config.yaml
COPY ./config.rpc.yaml ./config.rpc.yaml
COPY ./schema.graphql ./schema.graphql
COPY ./tsconfig.json ./tsconfig.json
COPY ./abis ./abis

# `envio codegen` interpolates ${...} in config.yaml, so the contract addresses
# must exist at build time. They are baked into the generated types only; the
# running indexer still reads the real values from the environment at start.
ARG INCIDENT_REGISTRY_ADDRESS=0x0000000000000000000000000000000000000000
ARG RISK_SCORE_ADDRESS=0x0000000000000000000000000000000000000000
ENV INCIDENT_REGISTRY_ADDRESS=$INCIDENT_REGISTRY_ADDRESS
ENV RISK_SCORE_ADDRESS=$RISK_SCORE_ADDRESS
RUN pnpm envio codegen

COPY ./envio-env.d.ts ./envio-env.d.ts
COPY ./src ./src

# CONFIG_FILE selects config.yaml (HyperSync) or config.rpc.yaml (token-free RPC).
CMD ["pnpm", "envio", "start"]
