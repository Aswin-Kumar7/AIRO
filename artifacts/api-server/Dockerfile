# ─── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /workspace

# Copy workspace manifests first (better layer caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY tsconfig.base.json tsconfig.json ./

# Copy lib packages (compiled as part of the build)
COPY lib/db/package.json            lib/db/
COPY lib/api-zod/package.json       lib/api-zod/
COPY lib/api-client-react/package.json lib/api-client-react/

# Copy api-server manifest
COPY artifacts/api-server/package.json artifacts/api-server/

# Install ALL deps (dev needed for tsc/esbuild)
RUN pnpm install --frozen-lockfile

# Copy source
COPY lib/db/             lib/db/
COPY lib/api-zod/        lib/api-zod/
COPY lib/api-client-react/ lib/api-client-react/
COPY artifacts/api-server/ artifacts/api-server/

# Build (transpile libs + esbuild bundle)
RUN pnpm --filter @workspace/api-server run build

# ─── Runtime stage ────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

RUN apk add --no-cache dumb-init

# Non-root user for security
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

# Only copy the self-contained esbuild bundle
COPY --from=builder --chown=app:app /workspace/artifacts/api-server/dist ./dist

USER app

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

# dumb-init: forwards SIGTERM so graceful shutdown works correctly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
