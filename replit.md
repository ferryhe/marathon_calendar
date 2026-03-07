# 马拉松日历 (Global Marathon Calendar)

## Overview
A React/TypeScript + Express web app displaying marathons in China and worldwide. Users can browse events, filter by region/month/status, manage favorites, write reviews, and maintain a profile.

## Architecture
- **Frontend**: React + Vite + TypeScript, Tailwind CSS, shadcn/ui components, wouter routing, framer-motion animations
- **Backend**: Express on port 5000, Drizzle ORM, PostgreSQL
- **Shared**: `shared/schema.ts` (Drizzle models), `shared/utils.ts` (helpers like `isChinaCountry`)

## Design System (Apple-style)
- **Font**: SF Pro Display (fallback: system fonts)
- **Typography**: 3 scales — `text-2xl` (page headings), `text-base` (card titles), `text-sm` (secondary)
- **Layout**: `max-w-2xl mx-auto` on all pages
- **Cards**: `rounded-2xl`, subtle border, hover lift
- **Header**: Sticky glass morphism (`glass-header` class) on every page via `PageShell` component
- **Colors**: Blue-500 primary, amber warnings/ratings. Status badges: blue=报名中, amber=即将开始, gray=已截止
- **Dark Mode**: Auto via `prefers-color-scheme` media query, toggling `.dark` class on `<html>`
- **Animations**: Framer Motion — fade+slide for list items, spring for segmented control

## Key Files
| File | Purpose |
|------|---------|
| `client/src/index.css` | Tailwind config, CSS variables for light/dark, glass effects |
| `client/src/main.tsx` | Entry point + dark mode auto-detection |
| `client/src/components/PageShell.tsx` | Shared layout with glass header, back nav, max-w-2xl container |
| `client/src/pages/Home.tsx` | Main list with region toggle, search, filters |
| `client/src/components/MarathonTable.tsx` | Month-grouped event cards |
| `client/src/components/EventDetails.tsx` | Quick-view dialog for an event |
| `client/src/pages/MarathonDetail.tsx` | Full detail page with editions & reviews |
| `client/src/pages/Profile.tsx` | Login/register & profile editing |
| `client/src/pages/MyFavorites.tsx` | Favorited marathons list |
| `client/src/pages/MyReviews.tsx` | User's reviews with stats |
| `shared/schema.ts` | Drizzle DB schema (marathons, editions, users, favorites, reviews) |
| `server/routes.ts` | Express API routes |
| `server/storage.ts` | IStorage interface + Drizzle implementation |

## Important Notes
- **React Hooks Rule**: In components with conditional early returns (e.g. `if (!event) return null`), ALL hooks must be called BEFORE the guard.
- **CSS**: Use `glass-header` / `glass-effect` classes. Avoid `@apply` with CSS variable utilities in Tailwind v4.
- **String Literals**: Never use Chinese curly quotes (`"` / `"`) inside JS string literals.
- **Database**: 15 seeded marathons (8 China + 7 overseas). Seed script in `server/seed.ts`.
