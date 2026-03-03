# Landing pages for agentforlife.app

**Canonical setup:** These are the only two landing pages we maintain for the marketing site.

| Audience   | URL visitors see     | Actual route (rewrite) | Source |
|-----------|----------------------|-------------------------|--------|
| **Mobile**  | `https://agentforlife.app/` | `/m`   | [web/app/m/page.tsx](app/m/page.tsx) |
| **Desktop** | `https://agentforlife.app/` | `/v5`  | [web/app/v5/page.tsx](app/v5/page.tsx) |

Routing is done in [proxy.ts](proxy.ts): root path `/` is rewritten to `/m` or `/v5` based on user-agent. Other routes (e.g. `/page.tsx` at app root) are not used for the live homepage.

- **Work on mobile landing:** edit `app/m/page.tsx` and `app/m/*` (e.g. `app/m/rewrites/page.tsx`).
- **Work on desktop landing:** edit `app/v5/page.tsx` and `app/v5/*`.

Keep nav/footer, CTAs, and copy in sync between `/m` and `/v5` where it matters (e.g. Agent Login, Get Started, founding member links).
