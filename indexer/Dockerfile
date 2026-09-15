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

RUN pnpm envio codegen

COPY ./src ./src

# CONFIG_FILE selects config.yaml (HyperSync) or config.rpc.yaml (token-free RPC).
CMD ["pnpm", "envio", "start"]