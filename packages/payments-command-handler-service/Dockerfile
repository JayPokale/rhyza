FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
RUN corepack prepare pnpm@10.28.2 --activate

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
RUN pnpm --filter implementations-lib build
RUN pnpm --filter payments-domain-lib build

# build main app
RUN pnpm --filter payments-command-handler-service build

FROM base
WORKDIR /workspace

COPY --from=prod-deps /workspace/node_modules /workspace/node_modules

COPY --from=build /workspace/packages/common-types-lib/dist /workspace/packages/common-types-lib/dist
COPY --from=build /workspace/packages/implementations-lib/dist /workspace/packages/implementations-lib/dist
COPY --from=build /workspace/packages/payments-domain-lib/dist /workspace/packages/payments-domain-lib/dist

COPY --from=build /workspace/packages/payments-command-handler-service/dist /workspace/packages/payments-command-handler-service/dist
COPY --from=build /workspace/packages/payments-command-handler-service/package.json /workspace/packages/payments-command-handler-service/package.json

CMD ["node", "packages/payments-command-handler-service/dist/index.js"]
