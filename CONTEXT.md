# CONTEXT.md — AgentForLife (AFL)

> Drop this in the repo root. Read it before any strategic or architectural decision.
> Last updated: March 16, 2026

## What This Is

AgentForLife (AFL) is an AI-powered client lifecycle platform for independent life insurance agents. It manages retention, referrals, client relationships, and automated touchpoints — with a branded mobile app that clients use directly.

**Strategic context:** AFL is becoming the post-sale module within the Closr AI platform (see "Closr AI Integration" below). It will continue to function as a standalone product but its primary distribution will be as a paid add-on for agents using Closr AI's agency dashboard.

## Who It's For

Independent life insurance agents selling mortgage protection, final expense, and term life remotely. The agent who benefits most is one who closes deals regularly and wants to retain their book, generate referrals from existing clients, and automate relationship maintenance.

## What It Does Today

### Client Management
- Manual add, CSV import (up to 400 rows), PDF application parsing, book-of-business PDF parsing
- Each client gets a unique code (e.g., X7K9-M2P4-Q8R1) for mobile app access
- Client detail view: policies, beneficiaries, referrals, contact history

### AI Referral Pipeline
- Client shares app or sends group text → referral created
- AI assistant (NEPQ methodology) engages referral via iMessage/SMS through Linq
- Flow: group message → AI intro → 1-on-1 conversation → qualification → booking link
- AI gathers: DOB, health info, medications, smoker status, spouse, mortgage details
- Agents can view conversations, send manual messages, toggle AI per referral
- Automated 4-hour drip follow-ups

### Conservation (Retention)
- Detects at-risk policies from: forwarded carrier emails (AI-parsed), pasted text, manual flags
- Auto-matches to existing clients/policies
- AI outreach via SMS, push, or email with Day 2/5/7 drip
- Agent marks saved or lost

### Anniversary Rewrites
- Auto-flags policies approaching 1-year anniversary
- Two message styles: "check in" (relationship) or "lower price" (savings)
- AI-drafted outreach with drip follow-ups

### Automated Touchpoints (Cron-Driven)
- Birthday messages (daily 1 PM), holiday cards (daily 2 PM), policy anniversaries (daily 2 PM)
- Sent via push notifications to the client's mobile app

### Branded Client Mobile App
- White-labeled with agent's name, photo, logo
- Clients view policies, make one-tap referrals, receive push notifications, contact agent
- Live on iOS and Google Play at agentforlife.app

### Dashboard AI Assistant ("Patch")
- Claude-powered chatbot for platform questions and workflow guidance

### Stats & Gamification
- Tracks APV, policies saved, referrals won, touchpoints sent, appointment rate, save rate
- Badges for milestones

## Closr AI Integration (Critical — In Development)

AFL is being integrated as the post-sale module of Closr AI, an agency intelligence dashboard that captures call data automatically.

**The call-to-client pipeline:**
1. Agent closes a sale on a Closr AI-tracked call
2. AI has already extracted: client name, DOB, phone, health details, coverage, carrier, premium from the transcript
3. Agent confirms pre-populated data (10-second review)
4. AFL receives structured data via API → client record + policy record auto-created
5. Client app code generated, welcome SMS queued
6. Retention monitoring, referral eligibility, and touchpoint scheduling activate automatically

**This solves AFL's biggest adoption friction:** getting initial client data into the system. With the Closr AI pipeline, the data is there before the agent hangs up.

**Integration architecture:**
- Closr AI POSTs structured JSON to AFL's client creation endpoint
- Auth will unify under Clerk org model (Closr AI already uses Clerk)
- AFL subscription becomes a toggle within Closr AI's Stripe billing
- AFL retains standalone functionality for agents not using Closr AI

## Business Model

**As Closr AI add-on (primary distribution):** $29/agent/month. Available on automated seats only ($59/seat). Agency owner adds AFL to individual agents who are closing deals and need client lifecycle management. COGS: ~$3/agent (SMS, push, Claude). Margin: 90%.

**As standalone (legacy):**
| Tier | Price |
|------|-------|
| Founding | Free for life (limited, closed) |
| Charter | $25/mo or $250/yr |
| Inner Circle | $35/mo or $350/yr |
| Standard | $49/mo or $490/yr |

Standalone pricing remains for agents who come directly. Founding member migration path TBD.

## Stack

| Layer | Tech |
|-------|------|
| Mobile App | React Native (iOS + Android) |
| Backend | Firebase |
| AI | Claude (referral conversations, conservation outreach, entity extraction, self-learning) |
| Messaging | Linq (iMessage/SMS delivery) |
| Billing | Stripe |
| Auth | Currently Firebase Auth — migrating to Clerk for Closr AI unification |

## AI Architecture

- Single-source `ai-voice.ts` using NEPQ framework for all AI conversations
- Self-learning loop: analyzes completed conversations, extracts patterns, builds client personas, runs A/B experiments on messaging strategies
- Message critic gates outbound AI messages for quality

## Current Status

**Live:** iOS App Store, Google Play. Agent dashboard functional. Referral pipeline, conservation, anniversary rewrites, touchpoints all operational.

**Known Challenge:** Low activation among signups. Agents who signed up are not consistently using the platform. Root cause unknown — likely onboarding friction and/or the effort required to get client data into the system (which the Closr AI integration solves).

**Recent fixes (March 2026, founding member feedback):**
- Fixed: Client app session was lost on network errors, forcing code re-entry. Now retries and falls back to cached profile data; session only clears when the code itself is revoked.
- Fixed: Mortgage Protection policies now prominently display coverage duration (e.g., "30 Years") as the hero metric in both the client app and dashboard, with dollar amounts secondary. The agent form now requires this field and explains it will appear in the client's app.
- In progress: Ingestion v2 rebuild for PDF/CSV uploads using async job-based parsing (`/api/ingestion/v2/jobs`) to eliminate long blocking upload waits. Added stage timing metrics, deterministic-first parsing for delimited BOB files with AI fallback only when confidence is low, quality gates on client + server import/write paths (including API-level policy creation checks for ingestion-derived writes), a small-file direct parse fast-path that bypasses Blob/job storage, an estimated stage-based progress bar in the application upload modal, adaptive large-PDF extraction (fast first pass with automatic deeper fallback when signals are weak), and a two-lane upload timeout policy (small/medium fail-fast retries, large-file reliability-first single attempt) to reduce hangs while still allowing large PDFs time to complete upload.

**Founding Member Program:** First 50 agents free for life. This commitment needs a migration path as AFL becomes a Closr AI module.

## Key Decisions Made

- AFL will become a Closr AI add-on module (not merged/rebranded — retains its identity)
- The call-to-client pipeline is the integration priority
- Auth migration from Firebase to Clerk is required for unification
- Standalone access remains available for agents not on Closr AI
- NEPQ methodology is the foundation for all AI-generated messaging
- Linq handles iMessage/SMS (migrated from SendBlue)

## Open Questions

- Is the mobile app essential at launch of the Closr AI integration, or can client lifecycle features work via SMS/email/web first?
- What's the right AFL add-on price point within Closr AI? ($25 vs $35 vs $49)
- How do founding members transition? (Free-for-life commitment + new platform structure)
- Should the referral pipeline be accessible from the Closr AI dashboard directly, or only through AFL?
- What drove low activation? Onboarding friction? Data entry burden? Unclear value prop? Need agent interviews.

## IP & Legal

- AgentForLife trademark filed with USPTO
- Provisional patent filing deadline: January 2, 2027 (covers self-learning system, call-to-client pipeline, AI referral methodology)
- Terms of Service, Privacy Policy, and EULA recently updated
- Apple Developer Program enrolled under Brainstorm Labs LLC
- Domain: brainstormlabs.co (primary), support@agentforlife.app (alias)

## Company Context

Brainstorm Labs LLC, founded by Daniel (CEO). Based in St. Louis. Daniel is also an active independent insurance agent under Symmetry Financial Group / Crosswinds Financial Group. He holds a JD from SLU. ARCH Grants 2026 application is active — AFL and Closr AI are the core of the pitch.
