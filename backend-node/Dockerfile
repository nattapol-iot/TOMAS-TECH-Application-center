FROM node:24-bookworm-slim AS build
WORKDIR /app
# Copy only backend-node sources (build context is the repo root; see docker-compose)
COPY backend-node/package.json backend-node/package-lock.json ./
RUN npm ci
COPY backend-node/ .
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
# SQL migration files — bundled so the Node migration runner can apply them on startup
COPY database/migrations/ ./migrations/
ENV HOST=0.0.0.0 PORT=5106
ENV MIGRATIONS_DIR=/app/migrations
EXPOSE 5106
CMD ["node", "dist/src/server.js"]
