FROM node:22-bookworm

RUN apt-get update && \
    apt-get install -y libreoffice fonts-nanum fonts-noto-cjk && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV PORT=10000
EXPOSE 10000

CMD ["node", "server.js"]