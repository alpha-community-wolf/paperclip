# Plan: Outpost GitHub landing (README + positioning)

**Status:** Plan — README P0 landing implemented in `README.md` (2026-04-12); P1 screenshots / further polish optional.  
**Date:** 2026-04-12  
**Audience:** Maintainers (Community Wolf) and future contributors  

## 1. Purpose

Ship a **GitHub landing** that does three jobs at once:

1. **Instantly communicates what Outpost is** — orchestration for teams of autonomous agents (coding, ops, marketing, research, etc.), not “yet another chat UI.”
2. **Protects visitors** — same warnings as today: **not** interchangeable with upstream Paperclip’s database; safe install paths.
3. **Tells an honest origin story** — built to run [Community Wolf](https://communitywolf.com)’s internal agent fleet; open-sourced so the ecosystem can grow it together.

This document inventories **features** (so nothing important is forgotten), proposes **README information architecture** aligned with common open-source README best practices, and reserves space for **“How we differ from upstream Paperclip.”**

---

## 2. Origin narrative (for the landing — short form)

Use a dedicated subsection (not the whole README) with roughly this arc:

- **Problem:** Running many agents (engineering, ops, marketing) in parallel without a shared control plane is fragile — work gets lost, context fragments, spend runs away.
- **What we built:** Outpost (this repo) as Community Wolf’s **internal** orchestration layer: companies, org chart, tasks, heartbeats, budgets, governance, and operator UX.
- **Why open source:** The team hit a quality bar where the project is **worth generalizing** — opening it invites contributors, hardens the product, and avoids a private fork drifting alone.
- **Relationship to Paperclip:** Honest fork lineage; **Outpost** is the product direction; **schema and migrations have diverged** — see divergence section and database caution.

Tone: confident, not defensive. No need to oversell “better than upstream”; focus on **what Outpost offers** and **who it’s for**.

---

## 3. README best practices (checklist)

Use this as a quality bar when rewriting the landing.

| Practice | Notes |
|----------|--------|
| **Hero in 10 seconds** | One sentence + one paragraph: what it is, who it’s for. |
| **Screenshot or short demo** | Above the fold when possible; optional GIF/video for board + agent flow. |
| **Quickstart** | Copy-paste commands; link to fuller docs; **isolate DB** callout for this fork. |
| **Features** | Scannable bullets or grid; outcome-oriented, not internal jargon. |
| **Differentiation** | Clear “vs upstream” / “why this fork” without flaming. |
| **Safety & compatibility** | Database path, migrations, “do not point at production Paperclip DB.” |
| **Roadmap (light)** | 3–7 bullets; link to Issues/Discussions for detail. |
| **Contributing** | `CONTRIBUTING.md`, code of conduct if applicable, how to run tests. |
| **License** | Visible near bottom. |
| **Badges (sparingly)** | CI, license, Discord/community — avoid noise. |
| **Avoid** | Huge upstream marketing clone with no fork context; broken clone URLs; implying npm `paperclipai` == this repo without clarification. |

References: GitHub’s own guides emphasize clear description, installation, usage, and contribution paths; many successful OSS READMEs use a **problem → solution → quickstart → features → deeper links** flow.

---

## 4. Feature inventory

Below: **(A)** core platform capabilities (inherited baseline + `doc/SPEC-implementation.md` / `doc/PRODUCT.md` style product), **(B)** surfaces visible in the app (from routes), **(C)** notable **Outpost / fork** enhancements (from internal progress tracking and code). Use (A)+(B) for “what the product does”; use (C) for “why Outpost” and divergence content.

### 4.1 Core control plane (baseline narrative)

- **Multi-company tenancy** — one deployment; many isolated companies; company-scoped data and APIs.
- **Goals & hierarchy** — mission and goal tree; work traces upward to “why.”
- **Org chart** — reporting structure; roles; agent roster.
- **Issues / tasks** — lifecycle, priorities, labels, projects; single assignee; atomic checkout for `in_progress`.
- **Projects** — grouping, configuration, runs scoped to project where applicable.
- **Heartbeats** — scheduled and event-driven agent invocations; run history and cancellation.
- **Approvals & governance** — board gates (e.g. hires, strategy); activity log for mutations.
- **Costs & budgets** — token/spend tracking; monthly windows; hard-stop / pause behavior.
- **Agent adapters** — pluggable runtimes (local CLIs, HTTP/OpenClaw-style, etc.); adapter config defines identity and execution.
- **Board UI** — dashboard, agents, issues, goals, timeline, costs, activity, approvals, runs.
- **Agent API** — bearer keys; company-bound operations for agents.
- **Skills injection** — runtime injection of skill docs for agent runs (baseline + fork extensions below).
- **Embedded Postgres default** — local instance without external DB; paths under `~/.paperclip/...` until rebrand completes.

### 4.2 Major UI routes (product surface area)

From `ui/src/App.tsx` board routes (representative, not every redirect):

| Area | Routes / notes |
|------|----------------|
| **Dashboard & work** | `dashboard`, `my-work` |
| **Companies & settings** | `companies`, `company/settings`, `system-network` |
| **Org** | `org` |
| **Agents** | `agents/*` (filters, detail tabs: dashboard, configuration, runs, **chat**, **workspace** files, etc.) |
| **Projects** | `projects/:id/*` (overview, issues, runs, configuration) |
| **Issues** | `issues`, `issues/:issueId`; **reviews** (`/reviews`) |
| **Goals** | `goals`, `goals/:goalId` |
| **Execution** | `runs`, run deep links from agents |
| **Timeline** | `timeline` |
| **Schedules** | `schedules` (cron / recurring task scheduling) |
| **Approvals** | `approvals/*` |
| **Costs** | `costs` |
| **Activity** | `activity` |
| **Inbox** | `inbox/*` |
| **Knowledge** | `knowledge`, `knowledge/graph` (file index, wikilinks, graph) |
| **Workflows** | `workflow-templates`, `workflow-templates/:templateId` |
| **Skills & commands** | `skills`, `commands` (company slash commands) |
| **Webhooks** | `webhooks` |
| **System** | `system-chores`, `design-guide` (internal design reference) |
| **Auth / onboarding** | `auth`, `board-claim`, `invite` flows |

**Mini app / mobile-adjacent:** Telegram Mini App and related JWT/board flows exist in the fork (operator access from messaging context). Mention on the landing only when stable and documented; otherwise “coming soon” or link to docs.

### 4.3 Outpost / fork capabilities (enhancements to highlight)

Synthesized from fork progress and implementation (some items may be local-only until pushed — verify before publishing).

**Operator UX & board**

- Inbox with **dismissals** synced server-side; sidebar badge consistency for alerts.
- **Reviews** page and **review bundles** (project defaults, per-issue overrides, completion gate when required).
- **Issue flow** UX: Build / Plan / Explore (and workflow-aware labeling); workflow container badges.
- **Slash commands** in markdown editors: picker, deferred expansion, modal-safe portals, company commands.
- **My Work**, **Timeline**, **Schedules** views for operational awareness.

**Agents & execution**

- **Direct agent chat** and **sessioned chat** (streaming, session list, archive/search, run links in bubbles).
- **Chat context optimization** — avoid double-injecting history when a resumable CLI session already holds it.
- **Agent self-context** block injected into runs — identity, company, team, current task (fewer discovery tool calls).
- **AGENT_HOME** injection for portable paths across adapters.
- **Global env file** + adapter env merging; `configure --section env`.
- **Workspace file browser** tab; **clickable file paths** in markdown (issues, approvals, chat) with `?file=` deep links.
- **Agent templates** at hire time (base, operations, content, engineering, research) with scaffolded workspaces.
- **UTF-8 safe** subprocess stream handling for run logs; defensive handling of corrupted legacy rows.

**Skills & extensibility**

- **Three-tier skills**: built-in core / built-in optional toggles / company-installed / agent-local discovery (`.agents/skills`, `.claude/skills`).
- Company **Skills** page; CLI `paperclipai skills install`.

**Automation**

- **Task-linked cron** and **recurring issues** (create_new vs carryover behaviors, provenance to parent, presets, list badges).
- **Webhooks** and **event routing** (e.g. GitHub provider scaffolding); rules for dispatch.

**Knowledge**

- **Wikilinks** and **file index** with ignore patterns (`.fileindex-ignore`, workspace vs agent-home cwd layouts); knowledge graph UI.

**Workflows**

- **Workflow templates** UI and backend for structured multi-step work (issue types interact with workflow metadata).

**Quality / governance**

- **Design guide** page and skills for consistent UI work.
- Cursor/rules and migration notes for contributors.

When the README ships, **verify** which of the above are on `origin/master` vs local-only so the landing doesn’t over-promise.

---

## 5. Proposed README outline (information architecture)

Order tuned for GitHub skimming:

1. **Banner / logo** — Outpost branding (when assets exist); alt text accessible.
2. **Badges** — license, CI (if public), community link.
3. **One-liner + subhead** — e.g. “Outpost is the control plane for companies made of AI agents.”
4. **Safety callout** — `[!CAUTION]` database + non-interchangeability (keep prominent).
5. **Outpost & upstream** — short “independence” paragraph + link to **Divergence** anchor.
6. **Why we built it / open source** — Community Wolf paragraph (§2).
7. **Screenshot or demo** — board + agent chat or issue flow.
8. **Features** — compact grid or grouped lists (§4.1 + §4.2 + curated §4.3).
9. **Who it’s for** — teams running many agents across eng/ops/marketing; internal operators; OSS contributors.
10. **Quickstart** — isolated instance / worktree; **do not** reuse upstream DB path.
11. **How we differ from [Paperclip](https://github.com/paperclipai/paperclip)** — dedicated section (§6).
12. **Docs & links** — `doc/DEVELOPING.md`, deployment modes, API overview.
13. **Contributing & community** — Discord, issues, contributing guide.
14. **License**

Optional second file: **`OUTPOST.md` or `docs/landing.md`** if the README grows too long — README stays a thin router to deep content.

**Scaffold status (2026-04-12):** `README.md` already reserves **Outpost** space without shipping design: HTML comment blocks at the **header** and **footer** (checklist for swapping hero/footer art and wiring the public **Website** URL), a **Brand and marketing site (scaffold)** section at `#outpost-brand-placeholders` (table for landing URL, image paths, GitHub social preview), and **Website** nav items that jump to that anchor until a real marketing domain replaces them. The actual landing page and brand system can live elsewhere; the README stays the canonical place to paste **one** public URL and asset paths.

---

## 6. Section draft: “How we differ from upstream Paperclip”

**Goal:** Factual, respectful, useful for migration decisions.

Suggested subsections:

| Subsection | Content |
|------------|---------|
| **Lineage** | Forked from `paperclipai/paperclip` at a known base commit; Outpost is a **product fork**, not a mirror. |
| **Database & migrations** | Divergent schema; **do not** apply Outpost migrations to upstream databases (and vice versa). Default paths still under `~/.paperclip/...` until renamed. |
| **Features ahead of upstream** | Bullet list from §4.3 (only shipped items): skills tiers, chat sessions, cron/webhooks, review bundles, agent templates, workspace browser, self-context, etc. |
| **Upstream features not yet merged** | Optional honest list (e.g. periodic `git fetch upstream` — Hermes adapter and other upstream PRs may exist). Update at release time. |
| **Branding & packaging** | Roadmap: rename CLI/npm scope, paths, env vars, and docs to **Outpost**; today some strings still say Paperclip. |
| **Support model** | Community Wolf maintains this fork; contributions welcome; no claim of official Paperclip support. |

Avoid comparative marketing (“we’re better”); prefer **“Outpost optimizes for X; upstream optimizes for Y”** only when documented.

---

## 7. Implementation phases (later work)

| Phase | Deliverable |
|-------|-------------|
| **P0** | Rewrite README using §5; confirm §4.3 against `origin/master`; keep caution blocks. **Done:** fork `README.md` reordered per §5; origin story; divergence section (§6); Outpost feature highlights table; Quickstart uses fork clone + npm caveat. |
| **P1** | Add 2–4 screenshots or a short loop video; optimize alt text and file size. |
| **P2** | Optional `OUTPOST.md` deep dive; comparison table Outpost vs upstream (features + maturity). |
| **P3** | Rebrand pass: repo description, social preview image, package names, default data dir (`~/.outpost/...`), CLI binary name — coordinated release. |
| **P4** | “Built with Outpost” / Community Wolf callout badge; case study link when ready. |

---

## 8. Open questions

- **npm / CLI naming:** When Outpost publishes to npm, is the package renamed or scoped (`@outpost/...`)? README quickstart must match reality.
- **Docs site:** Will `paperclip.ing` docs remain linked, or will Outpost host its own docs? Broken links erode trust.
- **Telegram Mini App:** Publicly document or keep internal until stable?
- **License footer:** Still MIT; copyright line may need “Outpost contributors” + upstream attribution if required by license history.

---

## 9. References (in-repo)

- `README.md` — current landing (caution + Outpost independence stub).
- `doc/PRODUCT.md`, `doc/SPEC-implementation.md` — baseline product and V1 contract.
- `doc/DEVELOPING.md` — worktree / isolated instances (critical for safe try-outs).
- Community Wolf tracking: `community-wolf-paperclip/.developer/paperclip-fork-progress.md` — detailed fork changelog for divergence bullets.

---

*Next step when you’re ready: turn §5 into a PR against `README.md`, pull §6 bullets from a diff of `origin/master` vs upstream at merge-base, and attach screenshots in §7 P1.*
