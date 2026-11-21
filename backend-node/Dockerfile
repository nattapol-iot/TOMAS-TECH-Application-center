FROM oven/bun:1.4.5-slim AS build
WORKDIR /app
# Copy only backend-node sources (build context is the repo root; see docker-compose)
COPY backend-node/package.json backend-node/bun.lock ./
RUN bun install --frozen-lockfile
COPY backend-node/ .
RUN bun run build && rm -rf node_modules && bun install --frozen-lockfile --production

FROM oven/bun:1.4.5-slim
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
# SQL migration files — bundled so the Node migration runner can apply them on startup
COPY database/migrations/ ./migrations/
# One-shot operational scripts (e.g. storage path migration)
COPY scripts/ ./scripts/
COPY skill-hub/ ./skill-hub/
ENV HOST=0.0.0.0 PORT=5106
ENV MIGRATIONS_DIR=/app/migrations
EXPOSE 5106
CMD ["bun", "dist/src/server.js"]
