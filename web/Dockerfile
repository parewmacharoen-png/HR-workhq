# ============================================================================
# WorkHQ Web — production static assets (nginx)
# ============================================================================

FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./

ARG VITE_API_BASE=/api/v1
ENV VITE_API_BASE=$VITE_API_BASE

RUN npm run build

FROM nginx:1.27-alpine AS runner

# nginx renders templates/*.template into conf.d with envsubst at startup.
# Defaults match docker-compose; a host such as Railway overrides PORT and API_UPSTREAM.
COPY web/nginx.conf.template /etc/nginx/templates/default.conf.template
ENV PORT=80
ENV API_UPSTREAM=http://api:3000
ENV NGINX_ENVSUBST_FILTER=^(PORT|API_UPSTREAM)$
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK \
  --interval=30s \
  --timeout=3s \
  --start-period=10s \
  --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
