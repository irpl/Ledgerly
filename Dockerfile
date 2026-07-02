# Single-stage build kept intentionally simple for self-hosting: the prisma CLI
# and tsx stay in the image so migrations + seed run on boot.
FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Migrate, seed (idempotent: admin user + default categories), then serve.
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && npm start"]
