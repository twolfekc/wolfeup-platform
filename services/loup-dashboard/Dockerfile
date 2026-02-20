FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY server/ ./server/
COPY public/ ./public/

# Install openclaw globally so the dashboard can call it
RUN npm install -g openclaw

ENV PORT=5050
ENV OPENCLAW_BIN=/usr/local/bin/openclaw
ENV GATEWAY_URL=ws://localhost:18789
# GATEWAY_TOKEN must be passed at runtime via -e

EXPOSE 5050
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s CMD wget -q --spider http://127.0.0.1:5050/health || exit 1
CMD ["node", "server/index.js"]
