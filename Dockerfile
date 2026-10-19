# Whole workspace image: the app runs the TypeScript packages directly (transpilePackages),
# so we keep the full install instead of Next's standalone output.
FROM node:22-bookworm-slim AS build
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @inv/web build

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    DATABASE_URL=file:/app/data/invtracker.db
WORKDIR /app
COPY --from=build /app /app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/status').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
# Migrate, then serve. The in-process scheduler (instrumentation.ts) keeps prices fresh.
CMD ["sh", "-c", "cd packages/db && node_modules/.bin/tsx src/migrate.ts && cd ../../apps/web && exec node_modules/.bin/next start"]
