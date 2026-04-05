---
name: para-memory-files
description: >
  File-based memory system using Tiago Forte's PARA method. Use this skill whenever
  you need to store, retrieve, update, or organize knowledge across sessions. Covers
  three memory layers: (1) Knowledge graph in PARA folders with atomic YAML facts,
  (2) Daily notes as raw timeline, (3) Tacit knowledge about user patterns. Also
  handles planning files, memory decay, weekly synthesis, and recall via qmd.
  Trigger on any memory operation: saving facts, writing daily notes, creating
  entities, running weekly synthesis, recalling past context, or managing plans.
---

# PARA Memory Files

Persistent, file-based memory organized by Tiago Forte's PARA method. Three layers: a knowledge graph, daily notes, and tacit knowledge. All paths are relative to `$AGENT_HOME`.

## Three Memory Layers

### Layer 1: Knowledge Graph (`$AGENT_HOME/life/` -- PARA)

Entity-based storage. Each entity gets a folder with two tiers:

1. `summary.md` -- quick context, load first.
2. `items.yaml` -- atomic facts, load on demand.

```text
$AGENT_HOME/life/
  projects/          # Active work with clear goals/deadlines
    <name>/
      summary.md
      items.yaml
  areas/             # Ongoing responsibilities, no end date
    people/<name>/
    companies/<name>/
  resources/         # Reference material, topics of interest
    <topic>/
  archives/          # Inactive items from the other three
  index.md
```

**PARA rules:**

- **Projects** -- active work with a goal or deadline. Move to archives when complete.
- **Areas** -- ongoing (people, companies, responsibilities). No end date.
- **Resources** -- reference material, topics of interest.
- **Archives** -- inactive items from any category.

**Fact rules:**

- Save durable facts immediately to `items.yaml`.
- Weekly: rewrite `summary.md` from active facts.
- Never delete facts. Supersede instead (`status: superseded`, add `superseded_by`).
- When an entity goes inactive, move its folder to `$AGENT_HOME/life/archives/`.

**When to create an entity:**

- Mentioned 3+ times, OR
- Direct relationship to the user (family, coworker, partner, client), OR
- Significant project or company in the user's life.
- Otherwise, note it in daily notes.

For the atomic fact YAML schema and memory decay rules, see [references/schemas.md](references/schemas.md).

### Layer 2: Daily Notes (`$AGENT_HOME/memory/YYYY-MM-DD.md`)

Raw timeline of events -- the "when" layer.

- Write continuously during conversations.
- Extract durable facts to Layer 1 during heartbeats.

### Layer 3: Tacit Knowledge (`$AGENT_HOME/MEMORY.md`)

How the user operates -- patterns, preferences, lessons learned.

- Not facts about the world; facts about the user.
- Update whenever you learn new operating patterns.

## Write It Down -- No Mental Notes

Memory does not survive session restarts. Files do.

- Want to remember something -> WRITE IT TO A FILE.
- "Remember this" -> update `$AGENT_HOME/memory/YYYY-MM-DD.md` or the relevant entity file.
- Learn a lesson -> update AGENTS.md, TOOLS.md, or the relevant skill file.
- Make a mistake -> document it so future-you does not repeat it.
- On-disk text files are always better than holding it in temporary context.

## Memory Recall -- Use qmd

Use `qmd` rather than grepping files:

```bash
qmd query "what happened at Christmas"   # Semantic search with reranking
qmd search "specific phrase"              # BM25 keyword search
qmd vsearch "conceptual question"         # Pure vector similarity
```

Index your personal folder: `qmd index $AGENT_HOME`

Vectors + BM25 + reranking finds things even when the wording differs.

## Shared Memory (Company & Project Knowledge)

In addition to your private memory files, there is a **shared memory pool** stored in the database. Shared memories are visible to other agents in the same company or project.

### When to save to shared memory vs local memory

Ask yourself: **"Is this fact about me, or about the world?"**

| Save to... | When... | Examples |
|------------|---------|----------|
| **Local** (MEMORY.md, daily notes, PARA) | The fact is about your preferences, operating patterns, or personal lessons | "I prefer concise responses", "My build process" |
| **Shared — project scope** | The fact is about a specific project's systems, conventions, or decisions | "This repo uses pnpm", "Staging URL is X", "API requires X-Auth header" |
| **Shared — company scope** | The fact applies across the whole company | "Michael reviews all PRs", "Never force-push to main" |

### How to save shared memories

```
POST /api/companies/{companyId}/memories
{
  "content": "The staging API requires X-Auth-Token header, not Authorization",
  "scope": "project",
  "projectId": "uuid-of-project",
  "category": "fact",
  "tags": ["api", "auth", "staging"],
  "confidence": 0.9
}
```

**Categories:** `fact`, `decision`, `procedure`, `preference`, `lesson_learned`, `context`

**When to share:**
- You learn a technical fact that isn't agent-specific (API behaviors, repo conventions)
- A decision is made that affects other agents ("we decided to use X approach")
- You discover a procedure or workaround that would save others time
- You learn a lesson from an error that others could hit

### How to search shared memories

```
GET /api/companies/{companyId}/memories/search?q=auth+headers&scope=project&projectId=uuid
```

Search shared memory **before starting unfamiliar work** — another agent may have already documented the answer.

### Shared memories are automatically injected

At wake time, your context includes:
- **Project Knowledge** — top memories from your current project (if working on a project issue)
- **Company Knowledge** — top company-wide memories

You don't need to query these manually — they appear in your context. Only search explicitly when you need something specific not in the injected set.

## Planning

Keep plans in timestamped files in `plans/` at the project root (outside personal memory so other agents can access them). Use `qmd` to search plans. Plans go stale -- if a newer plan exists, do not confuse yourself with an older version. If you notice staleness, update the file to note what it is supersededBy.
