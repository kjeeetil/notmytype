# syntax=docker/dockerfile:1.6
# Web Dockerfile (Next.js standalone)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
# Install all deps to build Next.js
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build Next.js standalone output
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 8080
CMD ["node", "server.js"]
