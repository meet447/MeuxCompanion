# Backend Character And Memory Architecture

This note turns the reference repos into a backend-first design for MeuxVtuber.

The goal is:

- backend is the source of truth
- any client can use it
- all persistence stays local on disk
- character depth improves without turning prompts into one giant blob

## What The Reference Repos Do

### Open-LLM-VTuber

What it does well:

- Character customization is mostly config driven.
- Persona is mostly a prompt block plus model/voice settings.
- It separates the idea of an "agent" from model providers.
- It has a simple `basic_memory_agent` and optional long-term memory through Letta.

What that means in practice:

- fast to add or switch characters
- easy to understand
- good for a single prompt-centric companion
- memory is either basic chat history or delegated to an external agent runtime

What I would not copy for your backend:

- putting too much character depth into one `persona_prompt`
- relying on Letta for your core design, because you want local file persistence and a reusable backend
- coupling character definition too tightly to runtime/provider config

References:

- [Open-LLM-VTuber README](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber)
- [Character Settings & Prompts](https://docs.llmvtuber.com/en/docs/user-guide/backend/character_settings/)
- [Agent docs](https://docs.llmvtuber.com/en/docs/user-guide/backend/agent/)

### AIRI

What it does well:

- treats character/personality as a richer system than one prompt
- supports character cards and lorebook-style thinking
- moves toward composable prompt templates with Velin
- thinks about memory as layered retrieval, scoring, reinforcement, and emotional salience

What that means in practice:

- better depth ceiling for roleplay and companion behavior
- better separation between stable identity and dynamic context
- stronger long-term path for memory quality

What I would not copy directly:

- the full search-engine-like memory stack is powerful but heavy for your current app
- vector DB plus reranking plus emotional decay is more than you need for v1
- AIRI is broader than a reusable companion backend, so some complexity comes from that scope

References:

- [AIRI README](https://github.com/moeru-ai/airi)
- [DevLog 2025-04-06](https://airi.moeru.ai/docs/en/blog/DevLog-2025.04.06/)
- [DevLog 2025-04-14](https://airi.moeru.ai/docs/en/blog/DevLog-2025.04.14/)
- [DevLog 2025-05-16](https://airi.moeru.ai/docs/en/blog/DevLog-2025.05.16/)
- [DevLog 2026-01-01](https://airi.moeru.ai/docs/en/blog/DevLog-2026.01.01/)

## Best Approach For Us

Take this mix:

- Open-LLM-VTuber's simplicity for runtime wiring
- AIRI's separation of character, lore, and memory
- but keep storage local and file-first

Do not build around one giant system prompt.

Instead, split the companion into 5 layers:

1. Soul
2. State
3. Lorebook
4. Memory
5. Session

## Recommended Model

### 1. Soul

The soul is the stable core identity of the character.

It should contain:

- name
- core worldview
- values
- attachment style
- speaking style
- boundaries
- do and do not rules
- relationship intent with the user

This should almost never change automatically.

### 2. State

State is the character's current live condition.

It should contain:

- mood
- energy
- trust level
- affection level
- current arc
- current goals
- recent unresolved feelings

This changes often and should be saved separately from the soul.

### 3. Lorebook

Lorebook is conditional world knowledge.

Examples:

- places
- shared events
- nicknames
- private jokes
- project facts
- user facts that only matter in certain contexts

Unlike the soul, lorebook entries should be activated only when relevant.

### 4. Memory

Memory should be user-specific and character-specific.

Split memory into:

- episodic memory: "we talked about X on date Y"
- semantic memory: "the user likes lo-fi music"
- relational memory: "the user feels encouraged when the companion is gentle"
- reflective memory: "our recent conversations have been more playful and trusting"

### 5. Session

Session is just the current working window:

- last N chat turns
- current tool outputs
- current frontend context

This is not long-term memory.

## Why This Fits Your Current Code

Right now your backend already has:

- file-based character loading from `characters/*.md`
- prompt assembly in `backend/services/character.py`
- in-memory session history in `backend/api/chat.py`

That is a good base, but today:

- character depth lives in one markdown body
- state is not modeled
- memory is only temporary process memory
- backend cannot yet provide persistent identity across clients

So the next step is not "make the prompt bigger".
It is "make the context model more structured".

## File-First Storage Design

Recommended layout:

```text
characters/
  rika/
    character.yaml
    soul.md
    style.md
    rules.md
    lorebook/
      projects.md
      relationships.md
      private-jokes.md
    examples/
      chat_examples.md

data/
  users/
    meet-sonawane/
      profile.json
      sessions/
        2026-03-27.jsonl
      memories/
        rika/
          episodic.jsonl
          semantic.jsonl
          reflections.jsonl
          state.json
          summary.md
```

This keeps everything local and portable.

## Character Schema

Recommended `character.yaml`:

```yaml
id: rika
name: Rika
voice: kr_003
avatar_model: haru
default_emotion: neutral

traits:
  warmth: 0.55
  playfulness: 0.35
  possessiveness: 0.25
  mystery: 0.85
  tenderness: 0.65

relationship_mode: companion
memory_policy: local_file_v1
```

And then keep the actual writing in separate markdown files:

- `soul.md` for identity
- `style.md` for speech patterns
- `rules.md` for safety and canon rules
- `lorebook/*.md` for expandable world/user lore

This is much better than one giant prompt field because:

- writers can edit specific layers cleanly
- backend can choose what to inject
- future clients do not need to understand prompt-writing details

## Prompt Assembly Strategy

At response time, assemble the prompt from layers:

1. system runtime rules
2. soul
3. style
4. rules
5. current state
6. activated lorebook entries
7. retrieved long-term memories
8. short session history
9. current user message

Important rule:

each layer should have a token budget.

Example budget:

- soul: 600 to 1000 tokens
- style and rules: 300 to 600
- state: 150 to 250
- lorebook: 300 to 800
- memory: 400 to 900
- recent chat: remaining budget

That keeps the backend consistent across clients and models.

## Memory System Design

Start simple, but not naive.

### Memory Write Pipeline

After each assistant response:

1. append raw turn to session log
2. run a memory extraction step
3. classify extracted facts
4. score them
5. persist accepted memories to disk
6. occasionally update summaries and relationship state

### Memory Extraction Rules

Only save memories when they are:

- durable
- personal
- preference-related
- emotionally meaningful
- repeated
- relationship-relevant
- likely to matter later

Do not save:

- trivial one-off filler
- easily derivable temporary details
- every single sentence from the chat

### Memory Record Format

`episodic.jsonl` example:

```json
{"id":"mem_001","ts":"2026-03-27T10:15:00Z","type":"episodic","summary":"Meet said they are building an AI companion app and want deeper lore and memory.","importance":0.9,"emotion":"curious","source_session":"2026-03-27","tags":["project","ai-companion","backend"]}
{"id":"mem_002","ts":"2026-03-27T10:18:00Z","type":"semantic","summary":"Meet wants the backend to stay reusable for any client and keep persistence local in files.","importance":0.95,"emotion":"serious","tags":["backend","architecture","local-first"]}
```

### Retrieval Strategy

For v1, use hybrid retrieval:

- exact tag or keyword match
- recency
- importance
- optional local embedding similarity

This is enough for a file-based system and keeps implementation small.

Do not start with a full vector DB.

For a local-first app, brute-force retrieval over a few thousand memories is acceptable.
If memory count grows, move to a file-backed SQLite index later.

### Memory Scoring

Use a simple score:

```text
score = semantic_similarity
      + importance_weight
      + recency_weight
      + relationship_weight
      + repetition_weight
```

Later you can add:

- decay
- reinforcement
- emotion modifiers
- contradiction detection

That is where AIRI's ideas become useful, but only after the basics work.

## Lorebook Design

Lorebook entries should be conditional blocks, not always-on prompt text.

Example entry shape:

```yaml
id: project_backend
title: User's backend philosophy
triggers:
  keywords: ["backend", "architecture", "client", "api"]
priority: 0.9
body: |
  The user wants the backend to be the core product surface.
  Client apps should be replaceable and thin.
  Persistence should remain local and file-based by default.
```

This gives you depth without bloating every response.

## The Best Practical Memory Stack For You

### V1

- session logs in JSONL
- extracted memories in JSONL
- state in JSON
- summaries in markdown
- retrieval by tags, keywords, recency, importance

This is the best first implementation for your app.

### V2

- local embeddings using a small embedding model
- store vectors on disk alongside memory entries
- brute-force cosine search in Python

Still file-first, still local.

### V3

- optional SQLite file for indexing
- optional FTS for keyword search
- optional vector extension later if needed

This still respects "everything local in files" because SQLite is a local file.

## Backend API Shape

Design the backend as client-agnostic services:

- `GET /api/characters`
- `GET /api/characters/{id}`
- `POST /api/chat/stream`
- `POST /api/memory/extract`
- `GET /api/memory/{character_id}/{user_id}`
- `POST /api/memory/search`
- `POST /api/state/{character_id}/{user_id}/update`
- `POST /api/session/{character_id}/{user_id}/clear`

The client should not decide memory logic.
The backend should.

## Recommended Internal Services

- `character_repository`
- `prompt_builder`
- `session_store`
- `memory_store`
- `memory_extractor`
- `memory_retriever`
- `state_store`
- `state_updater`
- `lorebook_matcher`

That separation will make the backend reusable for desktop, web, mobile, and future clients.

## Concrete Recommendation For MeuxVtuber

The best approach for your app is:

- keep local markdown and JSON files as the source of truth
- split character definition into soul, style, rules, lorebook, and examples
- add persistent user-specific memory storage in `data/users/...`
- keep session history separate from long-term memory
- use backend-side prompt assembly with budgets
- start with simple hybrid retrieval before vector DB complexity

In short:

do not copy Open-LLM-VTuber's prompt-only simplicity all the way,
and do not copy AIRI's full memory ambition all at once.

Build the middle path:

- structured character system
- lightweight but real memory
- backend-owned logic
- local-first persistence

## Suggested Implementation Phases

### Phase 1

- move each character from single markdown file to character folder
- add `state.json`
- persist sessions as JSONL
- keep current chat flow working

### Phase 2

- add memory extraction after each turn
- save episodic and semantic memories
- inject top memories into prompt

### Phase 3

- add lorebook trigger system
- add relationship summaries
- add periodic reflection generation

### Phase 4

- add embeddings and better retrieval
- add contradiction handling and memory decay

## If We Build This In Your Current Repo

The first code changes I would make next are:

1. replace `characters/*.md` with folder-based characters
2. replace in-memory `chat_histories` with file-backed sessions
3. add a `memory_store` service with JSONL persistence
4. add a `prompt_builder` that assembles soul, lore, state, and memory

That gives you a solid backend core without overengineering too early.

## Current Repo Status

The repo now has the first two phases partially implemented:

- folder-based characters with backward compatibility for legacy markdown characters
- file-backed session history
- local memory storage for episodic, semantic, and reflection memories
- lightweight retrieval-based memory prompt injection
- persistent character state with trust, affection, mood, and energy
- backend APIs to inspect memories and state

Current backend routes now include:

- `GET /api/memory/{character_id}`
- `GET /api/memory/{character_id}/search?q=...`
- `POST /api/memory/{character_id}/clear`
- `GET /api/state/{character_id}`
- `POST /api/state/{character_id}`
- `POST /api/state/{character_id}/reset`

The current memory extraction is heuristic-based to keep everything fast and local.
The next likely upgrade is embedding-backed retrieval or LLM-assisted memory extraction while keeping the same file-based storage model.
