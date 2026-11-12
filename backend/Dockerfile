FROM node:24-bookworm-slim AS api
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN DATABASE_URL=postgresql://unused:unused@localhost:5432/unused npm run db:generate && npm run build
ENV NODE_ENV=production
USER node
EXPOSE 4187
HEALTHCHECK --interval=20s --timeout=5s --start-period=40s --retries=3 CMD node -e "fetch('http://localhost:4187/api/health',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh","-c","npm run db:migrate && exec npm start"]
