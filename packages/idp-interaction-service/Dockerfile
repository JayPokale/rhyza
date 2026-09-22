FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=true
RUN corepack enable
RUN corepack prepare pnpm@10.28.2 --activate

WORKDIR /workspace

RUN apk update && apk add --no-cache \
    libc6-compat \
    librdkafka-dev \
    cyrus-sasl-dev \
    openssl-dev \
    gcc \
    g++ \
    python3 \
    make \
    musl-dev

COPY pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch

FROM base AS prod-deps
COPY package.json pnpm-workspace.yaml ./
COPY packages/common-types-lib/package.json ./packages/common-types-lib/package.json
COPY packages/implementations-lib/package.json ./packages/implementations-lib/package.json
COPY packages/auth-public-types-lib/package.json ./packages/auth-public-types-lib/package.json
COPY packages/auth-client-lib/package.json ./packages/auth-client-lib/package.json
COPY packages/idp-interaction-service/package.json ./packages/idp-interaction-service/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store BUILD_LIBRDKAFKA=0 pnpm install --recursive --prefer-offline --frozen-lockfile --prod

FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store BUILD_LIBRDKAFKA=0 pnpm install --frozen-lockfile
RUN pnpm --filter common-types-lib build
RUN pnpm --filter implementations-lib build
RUN pnpm --filter auth-public-types-lib build
RUN pnpm --filter auth-client-lib build
RUN pnpm --filter idp-interaction-service build

FROM node:24-alpine AS runner
WORKDIR /workspace

# root + per-package node_modules from prod-deps
COPY --from=prod-deps /workspace/node_modules ./node_modules
COPY --from=prod-deps /workspace/packages/implementations-lib/node_modules ./packages/implementations-lib/node_modules
COPY --from=prod-deps /workspace/packages/auth-public-types-lib/node_modules ./packages/auth-public-types-lib/node_modules
COPY --from=prod-deps /workspace/packages/auth-client-lib/node_modules ./packages/auth-client-lib/node_modules
COPY --from=prod-deps /workspace/packages/idp-interaction-service/node_modules ./packages/idp-interaction-service/node_modules

# package.json for each workspace dep
COPY --from=prod-deps /workspace/packages/common-types-lib/package.json ./packages/common-types-lib/package.json
COPY --from=prod-deps /workspace/packages/implementations-lib/package.json ./packages/implementations-lib/package.json
COPY --from=prod-deps /workspace/packages/auth-public-types-lib/package.json ./packages/auth-public-types-lib/package.json
COPY --from=prod-deps /workspace/packages/auth-client-lib/package.json ./packages/auth-client-lib/package.json
COPY --from=prod-deps /workspace/packages/idp-interaction-service/package.json ./packages/idp-interaction-service/package.json

# built dist from each workspace dep
COPY --from=build /workspace/packages/common-types-lib/dist ./packages/common-types-lib/dist
COPY --from=build /workspace/packages/implementations-lib/dist ./packages/implementations-lib/dist
COPY --from=build /workspace/packages/auth-public-types-lib/dist ./packages/auth-public-types-lib/dist
COPY --from=build /workspace/packages/auth-client-lib/dist ./packages/auth-client-lib/dist
COPY --from=build /workspace/packages/idp-interaction-service/dist ./packages/idp-interaction-service/dist

CMD ["node", "packages/idp-interaction-service/dist/index.js"]
