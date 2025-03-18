FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
# Pin pnpm version until fixed:
# https://github.com/pnpm/pnpm/issues/9029
RUN corepack prepare pnpm@10.0.0 --activate
WORKDIR /workspace
COPY . .

FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter telemetry build
RUN pnpm --filter payments-service build
RUN pnpm --filter api build

FROM base
COPY --from=prod-deps /workspace/node_modules /workspace/node_modules

COPY --from=build /workspace/packages/api/node_modules /workspace/packages/api/node_modules
COPY --from=build /workspace/packages/api/dist /workspace/packages/api/dist

COPY --from=build /workspace/packages/payments-service/node_modules /workspace/packages/payments-service/node_modules
COPY --from=build /workspace/packages/payments-service/dist /workspace/packages/payments-service/dist

COPY --from=prod-deps /workspace/packages/telemetry/node_modules /workspace/packages/telemetry/node_modules
COPY --from=build /workspace/packages/telemetry/dist /workspace/packages/telemetry/dist

CMD ["node", "/workspace/packages/api/dist/index.js"]