FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN addgroup -S codereview && adduser -S codereview -G codereview
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
RUN mkdir -p /root/.codereview-store && chown -R codereview:codereview /root/.codereview-store
USER codereview
EXPOSE 3001
CMD ["node", "dist/index.js"]
