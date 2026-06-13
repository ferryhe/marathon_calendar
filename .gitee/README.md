# CI / Build pipeline

The file in this directory (`.gitee/pull_request.yml`) is a Gitee Go pipeline —
Gitee's CI equivalent of GitHub Actions. Syntax is intentionally compatible
with GitHub Actions, so the same YAML works if the project ever moves to GH.

## What it does

On every PR to `main` and every push to `main`:
1. Checks out source.
2. Sets up Node.js 20.
3. `npm ci` (cached).
4. `npm run build` (vite + esbuild, no DB needed).
5. `tsc --noEmit --skipLibCheck` — informational; fails only on errors in
   our own source (`server/`, `client/`, `shared/`, `script/`). Upstream
   noise from `node_modules/drizzle-orm` is tolerated.
6. Uploads `dist/` as a 7-day artifact.

## How to enable

1. Repo admin: Gitee → https://gitee.com/jghe/marathon_calendar/settings
2. Find **Gitee Go** (流水线 / Pipelines) — must be enabled for the repo.
3. The YAML in this directory will be picked up automatically. No
   per-branch config required for the default path.
4. After enabling, the next PR will see a "Build & Type-check" check appear
   in the PR conversation. Once that check is ✅ (green), the repo's
   "PR must pass test" setting is satisfied and the PR becomes mergeable
   via the API (no more `未通过设置的测试` 405).

## Required repo setting for the gate to fire

In the same settings page:
- **Pull Request** → "开启 PR 必须通过的测试" (toggle ON) — this is what
  the pipeline check satisfies. The exact toggle label in the Gitee UI
  is **"Pull Request 状态检查"** under "Pull Request 设置".
- The pipeline check name to enforce: `Build & Type-check / Build & Type-check` —
  Gitee auto-detects this from the job ID; no manual list to maintain.

## Local parity

The same build runs locally inside a throwaway Alpine container, per
`DEPLOY.md` §1 [2]:

```bash
sudo docker run --rm \
  -v /data/disk/opt/marathon_calendar:/app \
  -w /app --tmpfs /tmp node:20-alpine \
  sh -c "npm ci --no-audit --no-fund && npm run build"
```

The CI is the glibc/ubuntu version of the same thing — it tests the build
without touching the host's Alpine + musl prebuilt `sharp` binding.

## Why not GitHub Actions

The project's primary mirror is Gitee (https://gitee.com/jghe/marathon_calendar).
Until a GitHub mirror is set up, all CI runs on Gitee Go to keep the
status checks co-located with the code review.
