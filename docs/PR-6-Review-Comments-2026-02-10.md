# PR #6 Review/Comments 导出 (2026-02-10)

## PR 信息
- 标题: Phase 1 finish
- 作者: ferryhe
- 状态: open
- 创建: 2026-02-10T02:46:24Z
- 更新: 2026-02-10T03:40:21Z
- Base -> Head: main <- step_2_delelopment
- URL: https://github.com/ferryhe/marathon_calendar/pull/6

## 统计
- Conversation comments (issue comments): 2
- Reviews: 1
- Inline review comments: 17

## Conversation comments

### ferryhe @ 2026-02-10T02:58:07Z
https://github.com/ferryhe/marathon_calendar/pull/6#issuecomment-3875042210

```
@copilot open a new pull request to apply changes based on the comments in [this thread](https://github.com/ferryhe/marathon_calendar/pull/6#pullrequestreview-3776459930)
```

### Copilot @ 2026-02-10T02:58:15Z
https://github.com/ferryhe/marathon_calendar/pull/6#issuecomment-3875042587

```
@ferryhe I've opened a new pull request, #7, to work on those changes. Once the pull request is ready, I'll request review from you.
```

## Reviews

### copilot-pull-request-reviewer[bot] - COMMENTED @ 2026-02-10T02:53:09Z
https://github.com/ferryhe/marathon_calendar/pull/6#pullrequestreview-3776459930

```
## Pull request overview

This PR completes “Phase 1” by introducing session-based authentication plus user-centric features (profile, avatar upload, favorites, and review management) across the shared schema, server routes, and new client pages/components.

**Changes:**
- Add user profile fields, WeChat binding fields, favorites table, and review metadata (likes/reports) to the shared DB schema.
- Implement auth + profile + favorites + review CRUD/like/report endpoints on the server, including avatar upload to Tencent COS or local storage.
- Add new client pages (Profile/My Favorites/My Reviews/Marathon Detail) and enhance Home/MarathonTable/EventDetails to support filtering, favorites, and detail navigation.

### Reviewed changes

Copilot reviewed 25 out of 28 changed files in this pull request and generated 17 comments.

<details>
<summary>Show a summary per file</summary>

| File | Description |
| ---- | ----------- |
| shared/schema.ts | Extends user/review schema and adds user favorites table + insert schemas/types. |
| server/routes.ts | Adds auth/profile/avatar/WeChat/favorites/review endpoints; enhances marathon listing with edition-based filtering/sorting. |
| server/index.ts | Adds session middleware and serves `/uploads` statics for local avatar storage. |
| server/auth.ts | Introduces scrypt-based password hashing/verification utilities. |
| package.json | Adds Tencent COS SDK dependency. |
| package-lock.json | Locks COS SDK and transitive deps (including deprecated `request`). |
| client/src/pages/Profile.tsx | Adds profile editor with avatar upload + WeChat bind/unbind simulation. |
| client/src/pages/MyReviews.tsx | Adds “my reviews” page backed by `/users/me/reviews`. |
| client/src/pages/MyFavorites.tsx | Adds “my favorites” page backed by `/users/me/favorites`. |
| client/src/pages/MarathonDetail.tsx | Adds marathon detail page with reviews CRUD + like/report + favorite toggle. |
| client/src/pages/Home.tsx | Adds navigation + list filters + “mine” mode (favorites). |
| client/src/lib/apiClient.ts | Adds DTOs and API methods for auth/profile/favorites/review actions. |
| client/src/hooks/useMarathons.ts | Adds mutations for update/delete/like/report reviews. |
| client/src/hooks/useAuth.ts | Adds react-query hooks for auth/profile/favorites/WeChat flows. |
| client/src/components/MarathonTable.tsx | Adds filtering props + mine-only view + edition-aware date/status rendering. |
| client/src/components/EventDetails.tsx | Adds favorite toggle + link to full detail page and uses edition fields for display. |
| client/src/App.tsx | Registers routes for new pages. |
| client/public/favicon.svg | Adds SVG favicon. |
| client/index.html | Switches favicon to SVG. |
| README.md | Documents COS avatar upload configuration. |
| .gitignore | Ignores local `uploads/` directory. |
| .env.example | Adds example env vars for DB/session/COS configuration. |
</details>






---

💡 <a href="/ferryhe/marathon_calendar/new/main/.github/instructions?filename=*.instructions.md" class="Link--inTextBlock" target="_blank" rel="noopener noreferrer">Add Copilot custom instructions</a> for smarter, more guided reviews. <a href="https://docs.github.com/en/copilot/customizing-copilot/adding-repository-custom-instructions-for-github-copilot" class="Link--inTextBlock" target="_blank" rel="noopener noreferrer">Learn how to get started</a>.
```

## Inline review comments (按文件分组)

### client/src/components/MarathonTable.tsx (1)

- Copilot @ 2026-02-10T02:53:07Z L92 RIGHT
  https://github.com/ferryhe/marathon_calendar/pull/6#discussion_r2785528825
  `filters.sortBy` is passed to the API, but the client-side list is always sorted by `displayDate` (`.sort((a,b) => a.displayDate... )`). This makes the "按名称" sort option ineffective (and can reorder already-sorted/paginated results). Either remove this client-side sort or make it conditional on `filters.sortBy` to preserve the intended ordering.

### client/src/pages/MarathonDetail.tsx (2)

- Copilot @ 2026-02-10T02:53:05Z RIGHT
  https://github.com/ferryhe/marathon_calendar/pull/6#discussion_r2785528750
  `submitAuth` awaits `mutateAsync(...)` without try/catch. If the API call fails, this becomes an unhandled promise rejection and the UI provides no feedback. Handle errors explicitly and present them to the user (toast/message).
  ```suggestion
      try {
        if (isRegisterMode) {
          await registerMutation.mutateAsync({
            username: authUsername,
            password: authPassword,
          });
        } else {
          await loginMutation.mutateAsync({
            username: authUsername,
            password: authPassword,
          });
        }
        setAuthPassword("");
      } catch (error) {
        // Log the error for debugging and show feedback to the user
        console.error("Authentication failed:", error);
        alert("认证失败，请稍后重试。");
      }
  ```

- Copilot @ 2026-02-10T02:53:07Z RIGHT
  https://github.com/ferryhe/marathon_calendar/pull/6#discussion_r2785528854
  `submitReview` bails out when `!comment.trim()`, which prevents users from submitting a rating-only review and also prevents clearing an existing comment when editing. Since the API accepts `comment` as optional/nullable, consider allowing empty comments (send `null` when empty) and only validate the fields you truly require.
  ```suggestion
      const trimmedComment = comment.trim();
      const commentPayload = trimmedComment === "" ? null : trimmedComment;
  
      if (editingReviewId) {
        await updateReviewMutation.mutateAsync({
          reviewId: editingReviewId,
          payload: { rating, comment: commentPayload },
        });
        setEditingReviewId(null);
      } else {
        await createReviewMutation.mutateAsync({
          rating,
          comment: commentPayload,
  ```

### client/src/pages/MyFavorites.tsx (1)

- Copilot @ 2026-02-10T02:53:08Z L60 RIGHT
  https://github.com/ferryhe/marathon_calendar/pull/6#discussion_r2785528875
  `submitAuth` awaits `mutateAsync(...)` without error handling. If login/register fails, this will result in an unhandled promise rejection and no user-facing feedback. Add try/catch and report the error (toast) so the user understands what happened.

### client/src/pages/MyReviews.tsx (1)

- Copilot @ 2026-02-10T02:53:06Z RIGHT
  https://github.com/ferryhe/marathon_calendar/pull/6#discussion_r2785528791
  `submitAuth` awaits `mutateAsync(...)` without handling failures. A rejected promise from the click handler will be unhandled and users won't see an error message. Add try/catch and show a toast (and optionally reset/disable inputs on failure).
  ```suggestion
      try {
        if (isRegisterMode) {
          await registerMutation.mutateAsync({
            username: authUsername,
            password: authPassword,
          });
        } else {
          await loginMutation.mutateAsync({
            username: authUsername,
            password: authPassword,
          });
        }
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? `操作失败：${error.message}`
            : "操作失败，请稍后重试。";
        window.alert(message);
      } finally {
        setAuthPassword("");
      }
  ```

### client/src/pages/Profile.tsx (2)

- Copilot @ 2026-02-10T02:53:07Z RIGHT
  https://github.com/ferryhe/marathon_calendar/pull/6#discussion_r2785528813
  `saveProfile` always sends `avatarSource: "manual"` regardless of whether the user is using an uploaded avatar or WeChat avatar. This can desync the server’s `avatarSource` from reality and can overwrite the source set by the upload/bind flows. Only send `avatarSource` when the user explicitly changes it (or set it correctly based on which control the user used).
  ```suggestion
  
  ```

- Copilot @ 2026-02-10T02:53:08Z RIGHT
  https://github.com/ferryhe/marathon_calendar/pull/6#discussion_r2785528864
  `submitAuth` awaits `mutateAsync(...)` without a try/catch. When the request fails (401/409/network), the promise rejection will be unhandled from the click handler, leading to console errors and no user feedback. Wrap the call in try/catch and surface the error via a toast (and consider disabling the form while pending).
  ```suggestion
      try {
        if (isRegisterMode) {
          await registerMutation.mutateAsync({ username: authUsername, password: authPassword });
        } else {
          await loginMutation.mutateAsync({ username: authUsername, password: authPassword });
        }
        setAuthPassword("");
      } catch (error: any) {
        toast({
          title: "操作失败",
          description: error?.message || "登录或注册失败，请稍后重试。",
          variant: "destructive",
        });
      }
  ```

### package.json (1)

- Copilot @ 2026-02-10T02:53:09Z L50 RIGHT
  https://github.com/ferryhe/marathon_calendar/pull/6#discussion_r2785528925
  Adding `cos-nodejs-sdk-v5` pulls in the deprecated `request` package (visible in the lockfile). This increases long-term security/maintenance risk. If possible, prefer an SDK version/alternative that does not depend on `request`, or isolate the dependency and document the rationale/mitigations.
  ```suggestion
      "tencentcloud-sdk-nodejs": "^4.0.0",
  ```

### server/index.ts (2)

- Copilot @ 2026-02-10T02:53:06Z L34 RIGHT
  https://github.com/ferryhe/marathon_calendar/pull/6#discussion_r2785528772
  `SESSION_SECRET` falls back to a hard-coded default. If this ever runs with `NODE_ENV=production` and the env var is missing, sessions become forgeable. Consider failing fast in production when `process.env.SESSION_SECRET` is not set (or at least log a loud warning and refuse to start).
  ```suggestion
  const isProduction = process.env.NODE_ENV === "production";
  const sessionSecretEnv = process.env.SESSION_SECRET;
  
  if (!sessionSecretEnv && isProduction) {
    throw new Error(
      "SESSION_SECRET environment variable must be set when NODE_ENV=production",
    );
  }
  
  const sessionSecret =
    sessionSecretEnv ?? "marathon-dev-session-secret-change-me";
  
  if (!sessionSecretEnv && !isProduction) {
    console.warn(
      'Using default development SESSION_SECRET. Do not use this value in production.',
    );
  }
  ```

- Copilot @ 2026-02-10T02:53:08Z L50 RIGHT
  https://github.com/ferryhe/marathon_calendar/pull/6#discussion_r2785528893
  Session storage is configured with an in-memory store (`memorystore`). This is not suitable for production (sessions are lost on restart and it won't work across multiple instances). Consider switching to a persistent shared store (e.g., the existing Postgres/Redis option used elsewhere in the repo) when `NODE_ENV=production`.

### server/routes.ts (7)

- Copilot @ 2026-02-10T02:53:06Z L1244 RIGHT
  https://github.com/ferryhe/marathon_calendar/pull/6#discussion_r2785528803
  `/api/reviews/:id/report` increments `reportCount` without any auth, uniqueness guard, or throttling. This can be abused to mass-report content. Consider requiring authentication and/or tracking unique reports per user/session with rate limiting, returning 409 when already reported.

- Copilot @ 2026-02-10T02:53:06Z L581 RIGHT
  https://github.com/ferryhe/marathon_calendar/pull/6#discussion_r2785528784
  WeChat bind writes `wechatOpenId`/`wechatUnionId` directly onto the current user. Because those columns are `unique()`, binding an ID already used by another account will throw a DB error and likely return a 500. Consider pre-checking for existing bindings (and returning 409), and/or catching unique-constraint violations and mapping them to a clear client error.

- Copilot @ 2026-02-10T02:53:07Z L951 RIGHT
  https://github.com/ferryhe/marathon_calendar/pull/6#discussion_r2785528837
  `limit` is read via `parseInt(req.query.limit as string)`. Express query values can be `string | string[] | undefined`, so this can produce `NaN` or unexpected behavior when `limit` is repeated. Prefer validating/coercing via a Zod schema (similar to other query parsing in this file) and rejecting invalid values with a 400.

- Copilot @ 2026-02-10T02:53:07Z L390 RIGHT
  https://github.com/ferryhe/marathon_calendar/pull/6#discussion_r2785528806
  The login/register handlers set `req.session.userId` on the existing session without regenerating it. To mitigate session fixation, regenerate the session ID upon successful login/registration before storing authentication data.

- Copilot @ 2026-02-10T02:53:08Z L503 RIGHT
  https://github.com/ferryhe/marathon_calendar/pull/6#discussion_r2785528884
  `/api/users/me` updates `avatarUrl` and `avatarSource` unconditionally (`payload.avatarUrl ?? null` and `payload.avatarSource ?? "manual"`). If the client only wants to change `displayName` and omits these fields, this will clear the stored avatar URL and reset the source, unintentionally overwriting existing upload/WeChat avatars. Update the handler to only set `avatarUrl`/`avatarSource` when the corresponding fields are present in the request body (e.g., build the `.set()` object conditionally).
  ```suggestion
        // Build update object conditionally to avoid unintentionally clearing avatar fields
        const updateData: {
          displayName?: (typeof users.$inferInsert)["displayName"];
          avatarUrl?: (typeof users.$inferInsert)["avatarUrl"];
          avatarSource?: (typeof users.$inferInsert)["avatarSource"];
          updatedAt: Date;
        } = {
          displayName: payload.displayName,
          updatedAt: new Date(),
        };
  
        const body = req.body as Record<string, unknown>;
  
        if (Object.prototype.hasOwnProperty.call(body, "avatarUrl")) {
          updateData.avatarUrl = payload.avatarUrl ?? null;
        }
  
        if (Object.prototype.hasOwnProperty.call(body, "avatarSource")) {
          updateData.avatarSource = payload.avatarSource ?? "manual";
        }
  
        const [updated] = await database
          .update(users)
          .set(updateData)
  ```

- Copilot @ 2026-02-10T02:53:09Z L1223 RIGHT
  https://github.com/ferryhe/marathon_calendar/pull/6#discussion_r2785528916
  `/api/reviews/:id/like` increments `likesCount` without any auth, uniqueness guard, or rate limiting. This makes it trivial to inflate likes via repeated requests. Consider requiring authentication and/or tracking per-user (or per-session/IP) likes in a separate table to enforce one-like-per-user, and add rate limiting for anonymous traffic if you intend to allow it.

- Copilot @ 2026-02-10T02:53:09Z L788 RIGHT
  https://github.com/ferryhe/marathon_calendar/pull/6#discussion_r2785528907
  `/api/marathons` now loads *all* matching marathons and editions into memory, then sorts and paginates in JS. This defeats DB-level pagination and can become a major CPU/memory bottleneck as the dataset grows. Consider pushing sorting/pagination into SQL (e.g., join/select nextEdition in a subquery/CTE, compute total with `count(*)`, and apply `limit/offset` on the final sorted result).
