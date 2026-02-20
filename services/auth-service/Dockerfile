FROM node:20-alpine

# Install build deps for native modules (better-sqlite3, bcrypt)
RUN apk add --no-cache python3 make g++ gcc libc-dev

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (build from source for alpine)
RUN npm install --omit=dev

# Copy source
COPY . .

# Create data directory
RUN mkdir -p /data

EXPOSE 4000

ENV NODE_ENV=production
ENV PORT=4000
ENV DB_PATH=/data/auth.db

USER node
CMD ["node", "server.js"]
