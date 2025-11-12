# syntax=docker/dockerfile:1.6
# Root Dockerfile proxies to the Next.js build in ./web for convenience
FROM node:20-alpine AS deps
WORKDIR /app
COPY web/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY web ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=cache,target=/app/.next/cache npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 8080
CMD ["node","server.js"]
