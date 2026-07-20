# Runtime image for pal-api-service.
# Copies a pnpm-deploy bundle produced by rafiki-v2-workspace.
# Requires: pnpm docker:build:workspace

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=rafiki-v2-workspace /prod/pal-api-service/ ./
CMD ["node", "dist/index.js"]
