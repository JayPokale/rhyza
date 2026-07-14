FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files and install dependencies
COPY package.json tsconfig.json ./
RUN npm install

# Copy source and compile TypeScript
COPY src/ ./src/
RUN npm run build

# ---

FROM node:20-alpine AS runner
WORKDIR /app

# Only copy the compiled output and production dependencies
COPY --from=builder /app/dist ./dist
COPY package.json ./
RUN npm install --omit=dev

# The operator does not expose an HTTP port by default.
# If you add a /healthz endpoint, expose it here.
EXPOSE 8080

USER node

CMD ["node", "dist/index.js"]
