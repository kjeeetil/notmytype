# syntax=docker/dockerfile:1.6
# Server Dockerfile
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json ./
# Install only production dependencies
RUN npm ci --omit=dev
COPY index.js ./
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["npm","start"]
