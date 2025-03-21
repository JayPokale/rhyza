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

RUN BUILD_LIBRDKAFKA=0 pnpm i
RUN pnpm run build
RUN pnpm --filter api build

CMD ["node", "/workspace/packages/api/dist/index.js"]
