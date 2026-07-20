# Runtime image for ilp-event-handler-service.
# Copies a pnpm-deploy bundle produced by rafiki-v2-workspace.
# Requires: pnpm docker:build:workspace

FROM node:24-alpine AS runner
RUN apk update && apk add --no-cache librdkafka
WORKDIR /app
ENV NODE_ENV=production
COPY --from=rafiki-v2-workspace /prod/ilp-event-handler-service/ ./
CMD ["node", "dist/index.js"]
