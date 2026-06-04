# AgentForLife — working rules for all Claude sessions

These apply to every session in every worktree of this repo. Read them
before shipping anything.

## Deployment — merge to `main`, NEVER deploy by hand

Production (`agentforlife.app`, Vercel project `web`) **auto-deploys on
every merge to `main`** via Vercel's Git integration. That is the ONLY
correct way to ship.

- **To ship:** merge the latest `main` into your branch, commit, push,
  open a PR into `main`, and merge it. Then do nothing — Vercel deploys.
- **Do NOT run `deploy.sh` or `vercel --prod` by hand.** Production is one
  shared alias and a manual `--prod` deploy promotes *your local tree*
  over the alias — so a deploy from a stale/feature worktree silently
  **rolls production back** and can ship unreviewed code. This already
  caused a prod regression (May 30, 2026). `deploy.sh` now has a guard
  that refuses unless `HEAD == origin/main` and the tree is clean; it's a
  backstop, not a license to hand-deploy.
- **Feature flags bake at build time.** If a feature is gated by a
  `NEXT_PUBLIC_*` env var, set it in Vercel Production **before** the
  merge/build; flipping it afterward needs a fresh deploy (new commit to
  main) to take effect.
- **After shipping, verify the live bundle**, not just an API/flag check:
  grep the served `/_next/static` chunks for a known new string.

## Parallel worktrees

Daniel runs several sessions at once in sibling worktrees
(`insurance-app`, `insurance-app-<branch>`, …). Don't switch branches in
a worktree you don't own, and don't commit another session's in-progress
work. Per-folder Claude memory is NOT shared between worktrees — durable,
repo-wide rules belong in this file, not in session memory.

**Do code work in a dedicated worktree, and commit early — never leave
uncommitted changes in the shared `insurance-app` checkout.** A parallel
session's git ops (reset/checkout/clean) can silently wipe uncommitted
work there with no warning; this destroyed a full feature's worth of WIP
on Jun 4, 2026 (recoverable only because it happened to be replayable
from the chat transcript). Create or enter your own worktree *before* the
first edit, and get changes onto your branch in a commit as soon as you
have anything worth keeping.
