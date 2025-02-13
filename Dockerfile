FROM node:20-alpine3.19 AS base
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
RUN pnpm run build

FROM base
COPY --from=prod-deps /workspace/node_modules /workspace/node_modules
COPY --from=build /workspace/dist /workspace/dist

CMD ["node", "dist/index.js"]