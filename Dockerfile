# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci

FROM dependencies AS source
COPY backend ./backend
COPY frontend ./frontend
RUN DATABASE_URL=postgresql://unused:unused@localhost:5432/unused npm run db:generate

FROM source AS api-build
RUN npm run build -w backend

FROM api-build AS api
ENV NODE_ENV=production
USER node
EXPOSE 4187
HEALTHCHECK --interval=20s --timeout=5s --start-period=40s --retries=3 CMD node -e "fetch('http://localhost:4187/api/health',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh","-c","npm run db:migrate -w backend && exec npm run start -w backend"]

FROM source AS web-build
ARG API_URL=http://api:4187
ARG NEXT_PUBLIC_SOCKET_URL=http://localhost:4187
ENV API_URL=$API_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w frontend
RUN chown -R node:node /app/frontend/.next

FROM web-build AS web
ENV NODE_ENV=production
USER node
EXPOSE 3187
HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://localhost:3187',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm","run","start","-w","frontend"]
