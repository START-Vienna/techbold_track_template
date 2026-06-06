FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN pnpm install --frozen-lockfile
COPY backend/src ./backend/src
EXPOSE 8000
CMD ["pnpm", "--filter", "backend", "tsx", "src/index.ts"]
