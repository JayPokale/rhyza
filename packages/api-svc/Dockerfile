FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
# Pin pnpm version until fixed:
# https://github.com/pnpm/pnpm/issues/9029
RUN corepack prepare pnpm@10.0.0 --activate

WORKDIR /workspace

RUN apk update && apk add --no-cache \
    librdkafka-dev \
    cyrus-sasl-dev \
    openssl-dev \
    gcc \
    g++ \
    python3 \
    make \
    musl-dev

COPY . .

FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store BUILD_LIBRDKAFKA=0 pnpm install --prod --frozen-lockfile

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store BUILD_LIBRDKAFKA=0 pnpm install --frozen-lockfile

# build dependencies
RUN pnpm --filter common-types-lib build
RUN pnpm --filter liquidity-types-lib build
RUN pnpm --filter payments-domain-lib build
RUN pnpm --filter implementations-lib build


# build main app
RUN pnpm --filter api-svc build

FROM base
COPY --from=prod-deps /workspace/node_modules /workspace/node_modules

# common-types-lib
COPY --from=prod-deps /workspace/packages/common-types-lib/node_modules /workspace/packages/common-types-lib/node_modules
COPY --from=build /workspace/packages/common-types-lib/dist /workspace/packages/common-types-lib/dist
# liquidity-types-lib
COPY --from=prod-deps /workspace/packages/liquidity-types-lib/node_modules /workspace/packages/liquidity-types-lib/node_modules
COPY --from=build /workspace/packages/liquidity-types-lib/dist /workspace/packages/liquidity-types-lib/dist
# payments-domain-lib
COPY --from=prod-deps /workspace/packages/payments-domain-lib/node_modules /workspace/packages/payments-domain-lib/node_modules
COPY --from=build /workspace/packages/payments-domain-lib/dist /workspace/packages/payments-domain-lib/dist
# implementations-lib
COPY --from=prod-deps /workspace/packages/implementations-lib/node_modules /workspace/packages/implementations-lib/node_modules
COPY --from=build /workspace/packages/implementations-lib/dist /workspace/packages/implementations-lib/dist

# main app / api-svc
COPY --from=prod-deps /workspace/packages/api-svc/node_modules /workspace/packages/api-svc/node_modules
COPY --from=build /workspace/packages/api-svc/dist /workspace/packages/api-svc/dist

ENV NODE_ENV=production
CMD ["node", "packages/api-svc/dist/index.js"]
