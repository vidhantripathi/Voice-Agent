# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app

# Install dependencies (only realtime_agent/ — that's the deployable app)
COPY realtime_agent/package.json realtime_agent/package-lock.json ./
RUN npm ci --omit=dev

# Copy the server + static files
COPY realtime_agent/server.js ./
COPY realtime_agent/public ./public

# Persistent data dir (mounted as a Fly volume in production)
RUN mkdir -p /app/data

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
