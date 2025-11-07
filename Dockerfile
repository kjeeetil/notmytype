# Combined Dockerfile for server + web
FROM node:20-alpine AS server-deps
WORKDIR /srv
COPY server/package*.json ./
RUN npm install --omit=dev
COPY server ./

FROM node:20-alpine AS web-builder
WORKDIR /web
COPY web/package*.json ./
RUN npm install
COPY web ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache bash tini

ENV NODE_ENV=production
ENV PORT=8080
ENV SERVER_PORT=8081
ENV NEXT_PUBLIC_SOCKET_URL=http://localhost:8081

COPY --from=server-deps /srv ./server
COPY --from=web-builder /web/.next/standalone ./web
COPY --from=web-builder /web/.next/static ./web/.next/static
COPY --from=web-builder /web/public ./web/public
COPY start.sh ./start.sh
RUN chmod +x start.sh

EXPOSE 8080 8081
ENTRYPOINT ["/sbin/tini","--"]
CMD ["./start.sh"]
