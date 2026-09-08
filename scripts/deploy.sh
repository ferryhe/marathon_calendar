#!/bin/bash
# ============================================================
# marathon_calendar 更新脚本（systemd 宿主机 node 部署）
#
# 部署方式（2026-09 起）：
#   systemd marathon.service → 宿主机 node dist/index.cjs
#   （不再是 docker 容器 marathon-app，DEPLOY.md 已同步更新）
#
# 流程：备份 → clone gitee → 构建 dist → 部署 dist+依赖 → 重启 → 健康检查
# 失败自动回滚（dist + node_modules + 锁）
#
# 运行：sudo scripts/deploy.sh   （在源码仓库根目录，或任意位置）
# ============================================================
set -euo pipefail

# 必须 root（node_modules/dist/.git 需要写权限，npm ci 需要）
if [ "$EUID" -ne 0 ]; then
    echo "请用 sudo 运行：sudo $0" >&2
    exit 1
fi

REPO_URL="https://gitee.com/jghe/marathon_calendar.git"
PROD_DIR="/data/disk/opt/marathon_calendar"
BUILD_DIR="/tmp/marathon-build"
SERVICE="marathon"
BACKUP_SCRIPT="/usr/local/bin/backup-ai-actuary.sh"

DIST_BAK=""
NODE_MODULES_BAK=""
LOCK_BAK=""

log() { echo "[$(date '+%F %T')] $*"; }
# die 只用于「部署前」的不可恢复步骤（preflight/backup/clone/build）
# 部署后的失败必须用 return 1 触发 rollback，不能 exit
die() { log "FATAL: $*"; exit 1; }
ok()  { log "OK: $*"; }

# ---------- 前置检查 ----------
preflight() {
    log "=== 前置检查 ==="
    command -v git  >/dev/null 2>&1 || die "git 不可用"
    command -v npm  >/dev/null 2>&1 || die "npm 不可用"
    command -v node >/dev/null 2>&1 || die "node 不可用"
    systemctl is-enabled "$SERVICE" >/dev/null 2>&1 || die "$SERVICE 未 enable 或不存在"
    [ -d "$PROD_DIR" ] || die "生产目录不存在: $PROD_DIR"
    [ -f "$BACKUP_SCRIPT" ] || die "备份脚本不存在: $BACKUP_SCRIPT"
    ok "前置检查通过（node $(node --version)）"
}

# ---------- 备份 postgres ----------
backup() {
    log "=== 备份 postgres ==="
    "$BACKUP_SCRIPT" || die "备份失败"
    ok "备份完成"
}

# ---------- clone + 构建 ----------
clone_and_build() {
    log "=== clone 源码 + 构建 dist ==="
    rm -rf "$BUILD_DIR"
    git clone --depth 1 "$REPO_URL" "$BUILD_DIR" || die "clone 失败"
    cd "$BUILD_DIR"
    npm ci --no-audit --no-fund || die "npm ci（构建依赖）失败"
    npm run build || die "npm run build 失败"
    [ -f "$BUILD_DIR/dist/index.cjs" ] || die "构建产物 dist/index.cjs 缺失"
    ok "构建完成：$(git -C "$BUILD_DIR" rev-parse --short HEAD)"
}

# ---------- 部署（失败返回 1，触发 rollback）----------
deploy() {
    log "=== 部署 ==="
    local ts
    ts=$(date +%Y%m%d%H%M%S)

    # 备份旧 dist
    if [ -d "$PROD_DIR/dist" ]; then
        DIST_BAK="$PROD_DIR/dist.bak.$ts"
        cp -r "$PROD_DIR/dist" "$DIST_BAK" || { log "备份 dist 失败"; return 1; }
        log "旧 dist 已备份: $DIST_BAK"
    fi

    # 备份旧 node_modules + 旧锁（npm ci 会 rm -rf node_modules，必须先备份）
    if [ -d "$PROD_DIR/node_modules" ]; then
        NODE_MODULES_BAK="$PROD_DIR/node_modules.bak.$ts"
        mv "$PROD_DIR/node_modules" "$NODE_MODULES_BAK" || { log "备份 node_modules 失败"; return 1; }
        log "旧 node_modules 已备份"
    fi
    if [ -f "$PROD_DIR/package-lock.json" ]; then
        LOCK_BAK="$PROD_DIR/package-lock.json.bak.$ts"
        cp "$PROD_DIR/package-lock.json" "$LOCK_BAK" || { log "备份旧锁失败"; return 1; }
    fi

    # 更新 dist
    rm -rf "$PROD_DIR/dist"
    cp -r "$BUILD_DIR/dist" "$PROD_DIR/dist" || { log "部署 dist 失败"; return 1; }
    log "新 dist 已部署"

    # 更新 package 记录；package-lock 变化时才重装生产依赖
    local need_install=false
    if [ ! -f "$LOCK_BAK" ] \
       || ! cmp -s "$BUILD_DIR/package-lock.json" "$LOCK_BAK"; then
        need_install=true
    fi
    cp "$BUILD_DIR/package.json" "$BUILD_DIR/package-lock.json" "$PROD_DIR/" || { log "复制 package 记录失败"; return 1; }

    if [ "$need_install" = "true" ]; then
        log "package-lock 有变化，重装生产依赖（npm ci --omit=dev）"
        cd "$PROD_DIR"
        npm ci --omit=dev --no-audit --no-fund || { log "npm ci --omit=dev 失败"; return 1; }
        # 恢复所有权，确保 ubuntu 用户能读写（systemd User=ubuntu）
        chown -R ubuntu:ubuntu "$PROD_DIR/node_modules" 2>/dev/null || true
    else
        log "依赖无变化，跳过重装"
        # 没重装就把备份的 node_modules 放回原位
        if [ -n "$NODE_MODULES_BAK" ] && [ -d "$NODE_MODULES_BAK" ]; then
            mv "$NODE_MODULES_BAK" "$PROD_DIR/node_modules" || { log "恢复 node_modules 失败"; return 1; }
            NODE_MODULES_BAK=""
        fi
    fi

    systemctl restart "$SERVICE" || { log "systemctl restart 失败"; return 1; }
    # restart 成功，现在安全清理 node_modules 备份
    if [ -n "$NODE_MODULES_BAK" ] && [ -d "$NODE_MODULES_BAK" ]; then
        rm -rf "$NODE_MODULES_BAK" 2>/dev/null || true
        NODE_MODULES_BAK=""
    fi
    ok "$SERVICE 已重启"
}

# ---------- 健康检查（直连 loopback，带重试）----------
healthcheck() {
    log "=== 健康检查 ==="
    local code="000"
    local i
    for i in 1 2 3 4 5 6; do
        code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:5100/" 2>/dev/null || echo "000")
        [ "$code" = "200" ] && break
        sleep 3
    done
    log "127.0.0.1:5100 -> HTTP $code"
    [ "$code" = "200" ] || { log "健康检查失败 (HTTP $code)"; return 1; }
    ok "健康检查通过"
}

# ---------- 回滚（恢复 dist + node_modules + 锁）----------
rollback() {
    log "=== 回滚 ==="

    if [ -n "$DIST_BAK" ] && [ -d "$DIST_BAK" ]; then
        rm -rf "$PROD_DIR/dist"
        mv "$DIST_BAK" "$PROD_DIR/dist"
        log "dist 已回滚"
    fi

    if [ -n "$NODE_MODULES_BAK" ] && [ -d "$NODE_MODULES_BAK" ]; then
        rm -rf "$PROD_DIR/node_modules"
        mv "$NODE_MODULES_BAK" "$PROD_DIR/node_modules"
        log "node_modules 已回滚"
    fi

    if [ -n "$LOCK_BAK" ] && [ -f "$LOCK_BAK" ]; then
        mv "$LOCK_BAK" "$PROD_DIR/package-lock.json" 2>/dev/null || true
        log "package-lock 已回滚"
    fi

    systemctl restart "$SERVICE" 2>/dev/null || true
    log "回滚完成"
}

# ---------- 主流程 ----------
main() {
    log "======== marathon 更新开始 ========"
    preflight
    backup
    clone_and_build

    if ! deploy; then
        log "部署失败，回滚"
        rollback
        exit 1
    fi
    if ! healthcheck; then
        log "健康检查失败，回滚"
        rollback
        exit 1
    fi
    log "======== 更新成功 ========"
}

main "$@"
