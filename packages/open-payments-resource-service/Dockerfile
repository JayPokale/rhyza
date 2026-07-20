# Runtime image for open-payments-resource-service.
# Copies a pnpm-deploy bundle produced by rafiki-v2-workspace.
# Requires: pnpm docker:build:workspace

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=rafiki-v2-workspace /prod/open-payments-resource-service/ ./
# Loaded at runtime from dist via ../../../open-payments-specifications/...
# (/app/dist → three levels up resolves to /)
COPY --from=rafiki-v2-workspace /workspace/open-payments-specifications /open-payments-specifications
CMD ["node", "dist/index.js"]
