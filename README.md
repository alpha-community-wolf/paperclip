> **NOTICE:** Active development has moved to [`Community-Wolf-Limited/outpost`](https://github.com/Community-Wolf-Limited/outpost). This repository is read-only and will be archived after the migration completes. No new PRs should target this repo.

<!--
  =============================================================================
  README HEADER — Outpost branding scaffold
  When the marketing site and brand kit exist:
  - Point the hero <img> at outpost artwork (e.g. doc/assets/outpost-header.png)
  - Set “Website” in the nav to the public landing URL (and/or the hero link)
  - Refresh alt text and the short tagline below
  =============================================================================
-->

<p align="center">
  <!-- Hero: swap src when Outpost header asset is ready -->
  <img src="doc/assets/header.png" alt="Outpost — placeholder hero (legacy banner until Outpost artwork ships)" width="720" />
</p>

<p align="center">
  <strong>Outpost</strong> — control plane for companies made of AI agents<br />
  <sub>Maintained for open source by <a href="https://communitywolf.com">Community Wolf</a>. Product site: <a href="#outpost-brand-placeholders">coming soon</a>.</sub>
</p>

<p align="center">
  <a href="#quickstart"><strong>Quickstart</strong></a> &middot;
  <a href="#outpost-brand-placeholders"><strong>Website</strong></a> &middot;
  <a href="https://paperclip.ing/docs"><strong>Docs</strong></a> &middot;
  <a href="https://github.com/alpha-community-wolf/paperclip"><strong>Repository</strong></a> &middot;
  <a href="https://github.com/paperclipai/paperclip"><strong>Upstream</strong></a> &middot;
  <a href="https://discord.gg/m4HZY7xNG3"><strong>Discord</strong></a>
</p>

<p align="center">
  <a href="https://github.com/paperclipai/paperclip/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License" /></a>
  <a href="https://github.com/alpha-community-wolf/paperclip/stargazers"><img src="https://img.shields.io/github/stars/alpha-community-wolf/paperclip?style=flat" alt="GitHub stars" /></a>
  <a href="https://discord.gg/m4HZY7xNG3"><img src="https://img.shields.io/discord/000000000?label=discord" alt="Discord" /></a>
</p>

<br/>

<a id="database-safety-read-first"></a>

## Database safety — read first

> [!CAUTION]
> **This repository is a development fork (Community Wolf / Outpost).** It is **not** a drop-in replacement for [upstream Paperclip](https://github.com/paperclipai/paperclip). We ship **database schema and migration changes** that are **not compatible** with databases created by the official project.
>
> **Default data location:** unless you configure otherwise, the embedded database lives under **`~/.paperclip/instances/default/db`**. If you already use Paperclip from upstream and that directory has data you care about, **do not start this codebase against it** — migrations may alter tables in ways that **break or lose** your existing instance.
>
> **Safer approaches:** run only [upstream Paperclip](https://github.com/paperclipai/paperclip) to protect an existing install; use a **fresh** data directory or empty `DATABASE_URL`; or use an **isolated instance** (for example the worktree flow in [`doc/DEVELOPING.md`](doc/DEVELOPING.md) / `paperclipai worktree:make`) so this fork never touches your main `~/.paperclip` database.

### Outpost — independence from upstream

The **goal of this fork** is to grow into a **standalone product named Outpost**: same general idea (orchestration for agent companies), but **detached from the original Paperclip project** — its own naming, packaging, docs, and data story over time, without implying compatibility or shared releases with [paperclipai/paperclip](https://github.com/paperclipai/paperclip). Until that work is complete, you will still see **Paperclip** in the UI, CLI, paths like `~/.paperclip`, and much of this README; treat that as legacy surface area, not a promise of interchangeability with upstream.

For a factual comparison, see **[How Outpost differs from upstream Paperclip](#how-outpost-differs-from-upstream-paperclip)**.

<br/>

## Why we built Outpost (and open-sourced it)

Running many agents at once — engineering, ops, marketing, research — without a shared control plane is fragile. Work gets lost, context fragments, and spend can drift before anyone notices.

**Outpost** is what [Community Wolf](https://communitywolf.com) uses internally to orchestrate that work: companies, org charts, tasks, heartbeats, budgets, governance, and operator UX in one place. We invested until the system was **worth generalizing**, then open-sourced this fork so contributors can help harden it and so the project does not drift alone in private.

Outpost inherits strong DNA from [Paperclip](https://github.com/paperclipai/paperclip); our schema and roadmap have **diverged** — see the caution above and the comparison section below.

<br/>

<a id="outpost-brand-placeholders"></a>

## Brand and marketing site (scaffold)

Reserved slots for **Outpost** public branding and a future **marketing landing page**. No design work lives in this repo yet — update this table and the header/footer when assets and URLs exist.

| Slot | Location in this README | What to add later |
| ---- | ------------------------ | ----------------- |
| **Marketing / landing URL** | Header tagline (“coming soon”), nav **Website**, footer link row | Replace `#outpost-brand-placeholders` links with the real site (or remove the anchor and link out). |
| **Header hero image** | Top `<img src="doc/assets/header.png" …>` | Outpost wordmark or hero art (e.g. new file under `doc/assets/`). |
| **Footer artwork** | Bottom `<img src="doc/assets/footer.jpg" …>` | Matching footer strip or illustration. |
| **Social preview** | GitHub repo **Settings → General → Social preview** | Upload when you have a 1280×640 (or guideline-sized) card. |

Landing-page and full visual identity work can stay outside this repository; keep **one canonical URL** here so the GitHub view stays the honest front door for developers.

Full landing strategy: [`doc/plans/2026-04-12-outpost-readme-landing-plan.md`](doc/plans/2026-04-12-outpost-readme-landing-plan.md).

<br/>

## See it in action

<div align="center">
  <video src="https://github.com/user-attachments/assets/773bdfb2-6d1e-4e30-8c5f-3487d5b70c8f" width="600" controls></video>
</div>

<br/>

## What is Outpost?

**Open-source orchestration for zero-human companies.**

If OpenClaw is an _employee_, Outpost is the _company_ — a Node.js server and React UI that coordinates a team of AI agents: assign goals, run heartbeats, enforce budgets, and watch work from one dashboard. Under the hood you get org structure, governance, goal alignment, and audit-friendly activity — not just a task list.

**Manage business goals, not pull requests.**

| | Step            | Example                                                            |
| ------ | --------------- | ------------------------------------------------------------------ |
| **01** | Define the goal | _"Ship the next release and keep infra stable."_                    |
| **02** | Hire the team   | Engineers, operators, marketers — any bot or runtime you plug in.   |
| **03** | Approve and run | Set budgets, review strategy, hit go, monitor from the board.       |

<br/>

<div align="center">
<table>
  <tr>
    <td align="center"><strong>Works<br/>with</strong></td>
    <td align="center"><img src="doc/assets/logos/openclaw.svg" width="32" alt="OpenClaw" /><br/><sub>OpenClaw</sub></td>
    <td align="center"><img src="doc/assets/logos/claude.svg" width="32" alt="Claude" /><br/><sub>Claude Code</sub></td>
    <td align="center"><img src="doc/assets/logos/codex.svg" width="32" alt="Codex" /><br/><sub>Codex</sub></td>
    <td align="center"><img src="doc/assets/logos/cursor.svg" width="32" alt="Cursor" /><br/><sub>Cursor</sub></td>
    <td align="center"><img src="doc/assets/logos/bash.svg" width="32" alt="Bash" /><br/><sub>Bash</sub></td>
    <td align="center"><img src="doc/assets/logos/http.svg" width="32" alt="HTTP" /><br/><sub>HTTP</sub></td>
  </tr>
</table>

<em>If it can receive a heartbeat, it can work here.</em>

</div>

<br/>

## Who Outpost is for

- You run **autonomous AI companies** (or serious multi-agent teams) and want one control plane.
- You **coordinate different agents** (OpenClaw, Codex, Claude, Cursor, scripts) toward shared goals.
- You juggle **many terminals or runtimes** and need checkout, sessions, and history you can trust.
- You want **24/7 autonomy** with room to audit, intervene, and approve.
- You need **cost visibility and budgets** that actually stop runaway spend.
- You want operations that **feel like a serious task system**, not ad-hoc chat.
- You want to **monitor and steer** from desktop or mobile surfaces you already use.

<br/>

## Features

### Core platform

<table>
<tr>
<td align="center" width="33%">
<h3>Bring your own agent</h3>
Any runtime, one org chart. Heartbeats call into adapters you configure.
</td>
<td align="center" width="33%">
<h3>Goal alignment</h3>
Work traces to company mission — agents see <em>what</em> and <em>why</em>.
</td>
<td align="center" width="33%">
<h3>Heartbeats</h3>
Scheduled and event-driven runs; delegation up and down the org tree.
</td>
</tr>
<tr>
<td align="center">
<h3>Cost control</h3>
Budgets per agent and company; hard stops when limits hit.
</td>
<td align="center">
<h3>Multi-company</h3>
One deployment, isolated companies — one portfolio control plane.
</td>
<td align="center">
<h3>Tickets &amp; audit</h3>
Issues, comments, runs, and activity built for review and traceability.
</td>
</tr>
<tr>
<td align="center">
<h3>Governance</h3>
Approvals, pauses, overrides — the board stays in charge.
</td>
<td align="center">
<h3>Org chart</h3>
Roles, reporting lines, and clear ownership.
</td>
<td align="center">
<h3>Operator UI</h3>
Dashboard, inbox, timeline, projects, goals, costs, knowledge graph, and more.
</td>
</tr>
</table>

### Outpost highlights (fork)

These capabilities are central to how Community Wolf runs Outpost day to day; availability on your branch may vary — track releases in [this repository](https://github.com/alpha-community-wolf/paperclip).

| Area | Highlights |
| ---- | ---------- |
| **Agents & chat** | Board-facing **chat** with agents; **sessioned** conversations and streaming; context tuned for resumable CLI sessions. |
| **Workspace** | **File browser** on the agent workspace; **clickable paths** in markdown (issues, approvals, chat) with deep links. |
| **Skills** | **Three-tier skills** (core, optional built-ins, company-installed, agent-local discovery) and CLI install flows. |
| **Automation** | **Task-linked cron**, **recurring issues**, **webhooks** and event routing (e.g. GitHub-oriented scaffolding). |
| **Quality & reviews** | **Review bundles** with project defaults and per-issue overrides; completion gates when reviews are required. |
| **Knowledge** | **Wikilinks** and **file index** with ignore patterns; **knowledge graph** UI. |
| **Workflows** | **Workflow templates** for structured multi-step work. |
| **Templates** | **Agent templates** (e.g. operations, content, engineering, research) with scaffolded workspaces on hire. |
| **Execution quality** | **`AGENT_HOME`** and global env layering; **self-context** injected for runs; safer UTF-8 handling for run logs. |

Telegram Mini App and related messaging flows exist in development; treat as **experimental** until documented in-repo.

<br/>

## Problems Outpost helps with

| Without a control plane | With Outpost |
| ------------------------ | ------------ |
| Many agent sessions and no single source of truth for who owns what. | Ticket model, assignee, checkout, and run history stay coherent across reboots. |
| Context scattered across tools; every wake repeats discovery. | Goals, projects, and tasks carry purpose; optional self-context reduces redundant setup. |
| Ad-hoc scripts for coordination between agents. | Org chart, inbox, approvals, and delegation primitives match how companies actually run. |
| Token spend surprises. | Cost rollups and budgets with enforcement. |
| Recurring work depends on someone remembering to start it. | Heartbeats, schedules, and recurring issues automate the drumbeat. |
| “Kick off Claude again and hope.” | Assign work in the board; agents execute against governed tasks. |

<br/>

## Design principles (why this architecture)

| | |
| - | - |
| **Atomic execution** | Checkout and budget checks are designed to avoid double work and runaway spend. |
| **Persistent runs** | Agents resume task context across heartbeats instead of starting cold every time. |
| **Runtime skills** | Skills inject at run time so workflows stay teachable without retraining models. |
| **Governance** | Approval gates and activity logging support oversight and rollback stories. |
| **Goal-aware work** | Tasks retain ancestry so “why” stays visible. |
| **Multi-company isolation** | Everything is company-scoped for portfolio use. |

Deeper product context: [`doc/PRODUCT.md`](doc/PRODUCT.md), V1 contract: [`doc/SPEC-implementation.md`](doc/SPEC-implementation.md).

<br/>

## What Outpost is not

| | |
| - | - |
| **Not a chatbot product** | Agents have jobs and tickets; chat supports execution, not casual Q&amp;A as the core model. |
| **Not an agent framework** | We orchestrate runtimes you provide; we don’t prescribe how you build the model loop. |
| **Not a drag-and-drop workflow studio** | We model companies: org, goals, budgets, governance — not generic DAG builders. |
| **Not a prompt CMS** | Agents bring prompts and tools; Outpost brings structure and policy. |
| **Not only for one agent** | Built for teams of agents; a single bot may be overkill. |
| **Not a code review product** | Bring your own PR process; Outpost coordinates the work around it. |

<br/>

<a id="how-outpost-differs-from-upstream-paperclip"></a>

## How Outpost differs from upstream Paperclip

This section is for **migration and expectations**, not marketing.

### Lineage

Outpost began as a fork of [paperclipai/paperclip](https://github.com/paperclipai/paperclip). It is a **product fork** (Community Wolf / Outpost), not a mirror. Releases and database state are **not** interchangeable without a deliberate migration story.

### Database and migrations

Schemas and SQL migrations **diverge**. Do not point Outpost at a database you rely on for upstream Paperclip, or vice versa, without understanding the risk. Default embedded data still lives under **`~/.paperclip/instances/default/db`** until a full rebrand of paths and tooling lands.

### Capabilities

Outpost emphasizes **operator workflows** Community Wolf needed: richer **skills** layering, **chat** and **sessions**, **cron / webhooks**, **review bundles**, **workspace file UX**, **workflow templates**, **agent templates**, and related hardening. Upstream may ship different adapters and features first (for example adapter additions land there on their own schedule). **Sync periodically** if you need specific upstream commits.

### Branding and packaging

Roadmap: Outpost-branded **CLI**, **npm** scope, default **data directories**, and docs. Today many strings and packages still say **Paperclip**; treat that as transitional.

### Support

**Community Wolf** maintains this repository for open collaboration. It is **not** official support from the upstream Paperclip team. For upstream behavior and releases, use [paperclipai/paperclip](https://github.com/paperclipai/paperclip).

<br/>

<a id="quickstart"></a>

## Quickstart

Self-hosted. No vendor account required for the open-source core.

**Before you run anything:** if you use this fork, read **[Database safety — read first](#database-safety-read-first)**. Prefer an **isolated** database or worktree instance when evaluating Outpost.

### From npm (upstream-aligned CLI)

The published `paperclipai` CLI on npm tracks the **upstream** release cadence. It is useful for onboarding, but it may **not** match this fork’s schema until packaging is unified under Outpost.

```bash
npx paperclipai onboard --yes
```

### From source (this repository)

```bash
git clone https://github.com/alpha-community-wolf/paperclip.git
cd paperclip
pnpm install
pnpm dev
```

This starts the API and UI at **`http://localhost:3100`** (default dev port). An embedded PostgreSQL instance is created under **`~/.paperclip/instances/default/db`** unless you set `DATABASE_URL`. For a second checkout without sharing that directory, use the worktree flow in [`doc/DEVELOPING.md`](doc/DEVELOPING.md).

> **Requirements:** Node.js 20+, pnpm 9.15+

<br/>

## FAQ

**What does a typical setup look like?**  
One Node process can run embedded Postgres and local storage. For production, point at your own Postgres and deploy as you would any Node service. Configure companies, projects, agents, and goals — agents execute against assigned work.

**Can I run multiple companies?**  
Yes. Companies are isolated in the data model.

**How is this different from OpenClaw or Claude Code alone?**  
Outpost **coordinates** those runtimes (and others) under one org, budget, and ticket model.

**Why not just use a generic ticket tool?**  
Checkout semantics, heartbeat scheduling, agent identity, cost rollups, and governance are first-class here — that’s the product.

**Do agents run continuously?**  
By default they run on heartbeats and triggers (assignment, mentions, webhooks where configured). Continuous agents can still plug in via adapters.

<br/>

## Development

```bash
pnpm dev              # Full dev (API + UI, watch mode)
pnpm dev:once         # Full dev without file watching
pnpm dev:server       # Server only
pnpm build            # Build all
pnpm typecheck        # Type checking
pnpm test:run         # Run tests
pnpm db:generate      # Generate DB migration
pnpm db:migrate       # Apply migrations
```

See [`doc/DEVELOPING.md`](doc/DEVELOPING.md) for the full guide (worktrees, file index, deployment notes).

<br/>

## Roadmap (high level)

Outpost inherits upstream roadmap themes and adds its own emphasis on **operator UX**, **automation**, and **Outpost-branded packaging**. Non-exhaustive:

- Smoother onboarding for diverse adapters and cloud runtimes.
- Continued investment in **skills**, **workflows**, and **integrations** (webhooks, providers).
- **ClipMart-style** company templates (upstream heritage — see upstream docs for status).
- Clearer agent configuration surfaces and harness documentation.
- Plugin and extensibility direction (longer horizon).
- Stronger first-run and production docs under the **Outpost** name.

Watch [Issues](https://github.com/alpha-community-wolf/paperclip/issues) for concrete work.

<br/>

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md).

<br/>

## Community

- [Discord](https://discord.gg/m4HZY7xNG3) — community chat.
- [GitHub Issues (Outpost)](https://github.com/alpha-community-wolf/paperclip/issues) — this fork.
- [GitHub Issues (upstream Paperclip)](https://github.com/paperclipai/paperclip/issues) — upstream project.
- [GitHub Discussions (upstream)](https://github.com/paperclipai/paperclip/discussions) — broader RFC-style conversation.

<br/>

## License

MIT — see [LICENSE](LICENSE). Outpost is a fork of [Paperclip](https://github.com/paperclipai/paperclip); upstream remains MIT by its authors.

## Star History

[![Star History Chart](https://api.star-history.com/image?repos=alpha-community-wolf/paperclip&type=date&legend=top-left)](https://www.star-history.com/?repos=alpha-community-wolf%2Fpaperclip&type=date&legend=top-left)

<br/>

---

<!--
  =============================================================================
  README FOOTER — Outpost branding scaffold
  - Swap footer <img> when Outpost footer asset exists
  - Mirror header: Website URL, Community Wolf, tagline
  =============================================================================
-->

<p align="center">
  <img src="doc/assets/footer.jpg" alt="Outpost — placeholder footer (legacy artwork until Outpost branding ships)" width="720" />
</p>

<p align="center">
  <strong>Outpost</strong> &middot;
  <a href="#outpost-brand-placeholders">Website</a> (coming soon) &middot;
  <a href="https://communitywolf.com">Community Wolf</a> &middot;
  <a href="#quickstart">Quickstart</a> &middot;
  <a href="https://github.com/alpha-community-wolf/paperclip">Repository</a>
</p>

<p align="center">
  <sub>Open source under MIT. Built for people who want to run companies, not babysit agents.</sub>
</p>
