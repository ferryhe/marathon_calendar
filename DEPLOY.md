# Deployment Guide — marathon_calendar

Last verified: 2026-06-11 · Image: `marathon_calendar-marathon:v11` (hash `7c4e05da1ef1`)

Production runs on this host via **manual `docker run`** (NOT `docker-compose` — the
master compose at `/data/disk/opt/docker-compose.yml` is stale and references a
non-existent `/opt/marathon_calendar` path).

| Component | Value |
|-----------|-------|
| Domain | `https://marathon.aiactuary.cn` |
| Caddy | `/etc/caddy/Caddyfile` (active) → `127.0.0.1:5100` |
| Host port | 5100 (NOT 5000 — the Dockerfile's `EXPOSE 5000` is just metadata) |
| Container | `marathon-app` (bind mount project + `uploads/` + `node_modules` volume) |
| Image base | `node:20-alpine`, runs as user `node` (uid=1000) |
| Cmd | `["node", "dist/index.cjs"]` (NOT `npm start` — see §3) |
| Env | injected via `docker run -e`, including `PORT=5100` and `NODE_ENV=production` |
| Data | `/data/disk/opt/marathon_calendar` on host (bind-mounted to `/app`) |
| PG | `marathon-postgres` (Docker bridge IP, see host `/etc/hosts`) — data dir on `/data/disk/marathon_pgdata` |
| Redis | `marathon-redis` (Docker bridge IP, see host `/etc/hosts`) |
| Old image (rollback) | `marathon_calendar-marathon:v1-pre-dockerfile` (hash `7c77d227bd17`) |

> **Secrets policy**: This file intentionally omits real `DATABASE_URL` /
> `SESSION_SECRET` / `ADMIN_API_TOKEN` values. Pull them from the host's
> `~/.docker-secrets/marathon.env` (or your secret manager) at deploy time.
> See `.env.example` for required variables and the template.

## 1. The 6-step deploy

Run from `/data/disk/opt/marathon_calendar`:

```bash
cd /data/disk/opt/marathon_calendar

# [0] Source the real secrets from your secret store. Do NOT commit them.
set -a; source ~/.docker-secrets/marathon.env; set +a

# [1] Re-tag the currently-running image as a rollback anchor.
#     Important: do this BEFORE building v(N+1) so the tag survives.
sudo docker tag marathon_calendar-marathon:latest marathon_calendar-marathon:v${N}-pre-deploy
# Example: v2-pre-deploy

# [2] Build dist/ on host via a throwaway container (host has no node_modules
#     and sharp's alpine-musl prebuilt only works inside node:20-alpine).
sudo docker run --rm \
  -v /data/disk/opt/marathon_calendar:/app \
  -w /app \
  --tmpfs /tmp \
  node:20-alpine \
  sh -c "npm ci --no-audit --no-fund && npm run build"

# [3] Build the new image using the project Dockerfile.
#     Dockerfile lives at /data/disk/opt/marathon_calendar/Dockerfile.
sudo docker build -t marathon_calendar-marathon:v$((N+1)) .

# [4] Stop + remove the old container.
#     The anonymous volume (cb3229f6...) auto-survives docker rm.
sudo docker stop marathon-app && sudo docker rm marathon-app

# [5] Start the new container. Reuse the existing node_modules anonymous volume
#     to skip `npm ci` (saves ~50s). If you bump deps, drop the volume mount
#     so the container reinstalls from the new lockfile.
sudo docker run -d \
  --name marathon-app \
  -p 5100:5100 \
  -v /data/disk/opt/marathon_calendar:/app \
  -v /data/disk/opt/marathon_calendar/uploads:/app/uploads \
  -v cb3229f698228127e6040d9e1e206088c05344c5c0eeec801f7eb484bd91087d:/app/node_modules \
  -e PORT=5100 \
  -e NODE_ENV=production \
  -e DATABASE_URL="$DATABASE_URL" \
  -e REDIS_URL="$REDIS_URL" \
  -e SESSION_SECRET="$SESSION_SECRET" \
  -e ADMIN_API_TOKEN="$ADMIN_API_TOKEN" \
  -e AI_MODEL='gpt-4.1-mini' \
  -e AI_BASE_URL='https://api.openai.com/v1' \
  -e AI_ENABLE_FALLBACK=false \
  -e AI_ENABLE_RULE_GEN=false \
  -e SYNC_SCHEDULER_ENABLED=false \
  --restart unless-stopped \
  marathon_calendar-marathon:v$((N+1))

# [6] Verify (see §4).
```

Total time: ~3 min on host (build 1m + image build 1m + verify 30s).

## 2. Rollback (< 30s)

If the new container fails or breaks behavior, roll back to the previous image:

```bash
cd /data/disk/opt/marathon_calendar
set -a; source ~/.docker-secrets/marathon.env; set +a

sudo docker stop marathon-app && sudo docker rm marathon-app
sudo docker run -d \
  --name marathon-app \
  -p 5100:5100 \
  -v /data/disk/opt/marathon_calendar:/app \
  -v /data/disk/opt/marathon_calendar/uploads:/app/uploads \
  -v cb3229f698228127e6040d9e1e206088c05344c5c0eeec801f7eb484bd91087d:/app/node_modules \
  -e PORT=5100 \
  -e NODE_ENV=production \
  -e DATABASE_URL="$DATABASE_URL" \
  -e REDIS_URL="$REDIS_URL" \
  -e SESSION_SECRET="$SESSION_SECRET" \
  -e ADMIN_API_TOKEN="$ADMIN_API_TOKEN" \
  --restart unless-stopped \
  marathon_calendar-marathon:v${N}-pre-deploy
```

**Tradeoff**: rollback reverts BOTH the image and the dist/ (since /app is bind-mounted).
If you changed dist/ between rollback and the next deploy, you may want to restore
the prior dist/ first: `git checkout HEAD@{1} -- dist/` or just `npm run build` from
the prior commit.

## 3. Why `node dist/index.cjs` and not `npm start`

`package.json` defines:
```json
"start": "cross-env NODE_ENV=production node dist/index.cjs"
```

But `cross-env` lives in `devDependencies`, and the Dockerfile installs with
`npm ci --omit=dev`. So `npm start` fails with `sh: cross-env: not found`.

`NODE_ENV` is already injected via `docker run -e`, so the cross-env shim is
redundant. Use `CMD ["node", "dist/index.cjs"]` directly.

## 4. Verification checklist

Run after every deploy:

```bash
# 1. Container is up, not in a restart loop
sudo docker ps | grep marathon-app                      # expect: "Up X seconds"

# 2. Process runs as node (uid=1000), not root
sudo docker exec marathon-app id                        # expect: uid=1000(node)

# 3. Express is listening
sudo docker logs marathon-app | tail -5                 # expect: "[express] serving on port 5100"

# 4. Direct localhost
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5100/    # expect: 200

# 5. Via Caddy (the user-facing check)
curl -sS -L -o /dev/null -w "%{http_code}\n" https://marathon.aiactuary.cn/    # expect: 200

# 6. Core API
curl -sS -o /dev/null -w "%{http_code}\n" https://marathon.aiactuary.cn/api/marathons    # expect: 200

# 7. USER node can write to /app/uploads (file uploads, avatars)
sudo docker exec -u node marathon-app touch /app/uploads/.t && \
  sudo docker exec -u node marathon-app rm /app/uploads/.t && \
  echo "✓ uploads writable"

# 8. USER node can write to /app/data (any data/ writes from app code)
sudo docker exec -u node marathon-app sh -c 'touch /app/data/.t && rm /app/data/.t && echo ✓'
```

## 5. Pitfalls

- **Marathon docker-compose at `/data/disk/opt/docker-compose.yml` is STALE.**
  It references `/opt/marathon_calendar` which doesn't exist on this host. Don't
  run `docker-compose up` on it — it will mount an empty directory. Use manual
  `docker run` per §1. (The committed `docker-compose.marathon.yml` is a
  redacted template — see its comment header.)
- **The anonymous volume `cb3229f6...` caches `node_modules` from the previous image.**
  When you change `package.json` or `package-lock.json`, the cached modules will be stale.
  Either delete the volume before redeploy (`sudo docker volume rm cb3229f6...`) or
  simply omit the `-v cb3229f6...:/app/node_modules` mount so the new image installs fresh.
- **`/etc/caddy/Caddyfile` is the active Caddy config**, not
  `/data/disk/opt/caddy/Caddyfile`. If you need to change routes, edit the one
  in `/etc/caddy/` and `sudo systemctl reload caddy` (or `docker exec ai-caddy caddy reload`).
- **Caddy routes `marathon.aiactuary.cn` → `127.0.0.1:5100`**, not 5000. The
  Dockerfile's `EXPOSE 5000` is documentation only.
- **Always re-tag the current `latest` BEFORE building the new version.**
  Otherwise the `latest` tag moves to the new image and you lose your rollback anchor.
  The deploy script in §1 uses `v${N}-pre-deploy` for clarity — pick whatever
  convention you like as long as it's pinned to a specific build.
- **Never commit real secrets.** Pull `DATABASE_URL` / `SESSION_SECRET` /
  `ADMIN_API_TOKEN` from your secret manager at deploy time. This repo's
  `.gitignore` excludes `.env`; this doc uses `$VAR` references.

## 6. When CI/CD is built

This file should become `scripts/deploy.sh` invoked from a GitHub Action on
`git push` of a semver tag. The body of the script is exactly §1, with the
secret-source step (`set -a; source ~/.docker-secrets/marathon.env; set +a`)
as the first action.
