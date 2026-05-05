FROM node:20-alpine

WORKDIR /app

# Install OpenSSL and other dependencies for Prisma
RUN apk add --no-cache openssl

# Install dependencies (including devDeps — prisma CLI needed for migrate & generate)
COPY package*.json ./
RUN npm ci && npm cache clean --force

# Generate Prisma client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy application source
COPY src ./src/
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["./entrypoint.sh"]
