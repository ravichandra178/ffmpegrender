FROM node:20-slim

# Install ffmpeg and ca-certificates
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# copy package files first for better caching
COPY package.json package-lock.json* ./

RUN npm ci --only=production || npm install --only=production

# copy source
COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
