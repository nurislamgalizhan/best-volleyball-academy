FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY sql ./sql
COPY src ./src

EXPOSE 4100

CMD ["node", "src/server.js"]
