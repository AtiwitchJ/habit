# Build from the repository root: docker build -f apps/web/Dockerfile .
FROM node:22-alpine AS build

ARG VITE_PB_URL=""
ENV VITE_PB_URL=${VITE_PB_URL}

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile && pnpm -F web build

FROM nginx:1.27-alpine

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html

EXPOSE 80
