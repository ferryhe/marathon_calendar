FROM node:20-alpine

WORKDIR /app

# Pre-built artifacts (build on host with `npm run build` before `docker build`).
# `dist/` is intentionally not in .dockerignore — we need it in the build context.
COPY dist ./dist
COPY package.json package-lock.json ./

# Install production-only deps (uses cached layer when only dist/ changes).
RUN npm ci --omit=dev && npm cache clean --force

# Drop privileges: run as the unprivileged "node" user that ships with the base image.
USER node

EXPOSE 5000

# `npm start` runs `node dist/index.cjs` under NODE_ENV=production.
CMD ["npm", "start"]
