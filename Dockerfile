FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# NEXT_PUBLIC_* values are compiled into the client bundle at build time (not read again
# at runtime) -- 'npm run build' calls scripts/validate-production-env.mjs, which hard-
# fails without real HTTPS origins and real Entra GUIDs here (see docs/PRODUCTION_DEPLOYMENT.md).
ARG NEXT_PUBLIC_APP_MODE
ARG NEXT_PUBLIC_AUTH_MODE
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_ENTRA_TENANT_ID
ARG NEXT_PUBLIC_ENTRA_CLIENT_ID
ARG NEXT_PUBLIC_ENTRA_API_SCOPE
ARG NEXT_PUBLIC_BUSINESS_TIME_ZONE
ARG SITE_ORIGIN
ENV NEXT_PUBLIC_APP_MODE=$NEXT_PUBLIC_APP_MODE \
    NEXT_PUBLIC_AUTH_MODE=$NEXT_PUBLIC_AUTH_MODE \
    NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_ENTRA_TENANT_ID=$NEXT_PUBLIC_ENTRA_TENANT_ID \
    NEXT_PUBLIC_ENTRA_CLIENT_ID=$NEXT_PUBLIC_ENTRA_CLIENT_ID \
    NEXT_PUBLIC_ENTRA_API_SCOPE=$NEXT_PUBLIC_ENTRA_API_SCOPE \
    NEXT_PUBLIC_BUSINESS_TIME_ZONE=$NEXT_PUBLIC_BUSINESS_TIME_ZONE \
    SITE_ORIGIN=$SITE_ORIGIN
RUN npm run build

FROM node:24-slim
WORKDIR /app
# 'vinext' is a devDependency (not a regular dependency), so a pruned production install
# would omit the 'vinext start' entrypoint itself -- copy the full node_modules from the
# build stage rather than re-running 'npm ci --omit=dev' here.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
CMD ["npm", "run", "start"]
