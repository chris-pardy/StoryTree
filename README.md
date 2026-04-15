# Branchline

A branching, collaborative story-writing app built on the [AT Protocol](https://atproto.com/).

Branchline turns storytelling into a shared, exploratory activity. Anyone can read a story by walking a path through the tree of contributions; logged-in users can extend any branch by adding their own bud, or fork a new branch from any point in the story.

## How it works

- A **story** is a tree of **buds**. Each bud is at most 500 words and references a parent bud by strong ref. **Story roots ("seeds")** are themselves `ink.branchline.bud` records — the lexicon allows a missing parent, but the AppView rejects any parentless record that isn't on its curated allow-list of root AT-URIs. Seeds are intentionally rare and special: each one is hand-curated and authored either by a Branchline-controlled account or by an invited guest. The allow-list is hard-coded for now; how new seeds get added is a question for later.
- Every bud moves through three lifecycle stages tied purely to age, not to different record types:
  - **Bud** (`< 24h`) — freshly written, still growing. It can't be built on yet.
  - **Bloom** (`24h–48h`, or any age if it never gained a child) — in its follow window: other writers can extend it, and it appears in the active bloom listings.
  - **Branch** (`> 48h` with at least one child) — locked. No new direct children; the bloom has already split into successor branches.
- Reading a story means reading a single root-to-leaf path — the chain of buds that led to whatever bloom you picked. Many writers can extend the same bloom; when more than one does, the parent bloom becomes a branching point and each child begins its own line.
- Buds are stored as records in each contributor's **PDS** under the `ink.branchline.bud` lexicon. Authors own their contributions; Branchline aggregates them into navigable trees.

### Timing rules

Branchline's pacing comes from two simple rules tied to a bud's age:

- **24-hour growing window.** A bud cannot be built on until 24 hours after it was written. This gives readers and writers time to encounter a fresh bud before anyone else extends it.
- **A leaf is listed as a "bloom" when it is more than 24 hours old AND (less than 48 hours old OR has no children).** Every bud has a 24-hour window (between 24h and 48h of age) where the bloom listing surfaces it openly and anyone may extend it. After 48 hours, the bud only stays on the active bloom list if it never gained a child — but a childless leaf does *not* age out of being a bloom, it just relies on ranking decay to gracefully drop off the visible lists over time. Once it has children it is an interior node of the tree: a branch, not a bloom.
- **No direct self-replies.** You cannot write a bud whose immediate parent is one of your own buds. You *can* extend a story you've contributed to indirectly — two writers can ping-pong (A→B→A→B), but no single author can string together consecutive buds and write a whole novel under one handle.

A reader is shown all currently-available blooms and can pick any one to read. During a bud's first 24 hours (before it appears in the bloom list) the way to find it is to walk the story down to the leaf you intend to extend, write your own bud, and watch what others add alongside you.

### Experiences

- **Reading** (logged-in or logged-out): browse the ranked list of available blooms, pick one, and read the full root-to-bloom path. A bloom is labeled in the UI as **"*\<root title\>* and *\<bloom title\>*, by \<bloom author\>, \<root author\>, and NN others"**, where the bloom title is the leaf bud's title and "NN others" is the count of distinct intermediate contributors along the path. Each bud shows its author handle and its **raw lifetime pollen count** inline at the end of the body. (Ranking uses a depth- and recency-weighted version of that pollen; the displayed number is the simple count, which is more intuitive to readers.)
- **Writing** (logged-in): after reading a bloom, contribute a bud that extends it — subject to the timing and self-reply rules above.
- **Pollinating** (logged-in): leave a grain of pollen on a bud you appreciated. Pollen feeds the bloom ranking described below.

## Identity

Branchline uses **AT Protocol OAuth** with the new limited scopes — users sign in with their existing atproto handle (e.g. their Bluesky account). Branchline never holds passwords and only requests the scopes it needs to write `ink.branchline.*` records on the user's behalf.

## Aggregation

Branchline runs an **AppView-style indexer** that subscribes to the relay (firehose), watches for newly published `ink.branchline.*` records, validates them against the lexicon and the curated set of story roots, and stores them in a local index for fast tree traversal. The reading experience queries the indexer; writes go directly to the user's PDS and flow back through the relay.

## Data model

A bud record (`ink.branchline.bud`) carries:

- `title` — a short title for the bud. Every bud has its own title; the reader UI uses the root's title and the bloom's title together to label a reading (see below).
- `text` — the bud body, up to **500 words** as counted by `Intl.Segmenter` (`granularity: "word"`, word-like segments only). The limit is enforced both in the editor UI and in the indexer; records over the limit are rejected at index time.
- `parent` — a **strong ref** (AT-URI + CID) to the bud this one extends. The field is technically optional in the lexicon (so root records can omit it), but the AppView only accepts a missing `parent` for records whose AT-URI is on the curated story-root allow-list; every other parentless record is rejected at index time.
- `createdAt` — ISO-8601 timestamp. The indexer combines this with the firehose-observed time to enforce the 24h / 48h timing rules.
- `formatting` — an optional list of inline formatting spans, each with a `start` and `end` byte offset into `text` and a `type` from a literary-fiction-oriented set: `bold`, `italic`, `underline`, `strikethrough`. Spans may overlap; the renderer is responsible for resolving them.

### Edits and the strong-ref freeze window

Authors can update the underlying record on their PDS at any time, but Branchline only honors edits made within the first **24 hours** after `createdAt`. After that window:

- The 24h growing window expires and other writers may begin building children that strong-ref the bud's CID.
- Any subsequent edit on the PDS produces a new CID, which no longer matches the CID children have pinned. The indexer ignores those edits and continues to serve the frozen version.

This keeps the tree stable: once a bud has been built on, its content can't shift out from under its descendants.

**Deletes while growing** are honored — if an author tombstones their record within the first 24 hours (before anyone could have built on it) the indexer drops the bud entirely. After the growing window, deletes are ignored for the same reason edits are: the bud is anchored by CID from its descendants and must remain stable.

### Pollen

A separate `ink.branchline.pollen` record lets a logged-in reader leave a grain of pollen on a bud they appreciated. Pollen lives on the reader's PDS and is indexed alongside buds. It is intentionally lightweight — a single mark of "this was worth reading" — rather than a multi-axis vote.

Pollen rules:

- **One grain per (reader, bud).** A reader's PDS holds at most one pollen record per bud. The indexer enforces uniqueness on its side.
- **Un-pollinate by tombstone.** Removing a grain means tombstoning the underlying record; the indexer drops it on the next firehose event.
- **No self-pollination.** You cannot pollinate a bud you wrote.
- **You may pollinate anywhere, anytime** — including descendants of your own work. Leaving pollen on a leaf below one of your buds is in fact how authors lift their own contributions transitively (see ranking, below).

## Bloom ranking

The reader's bloom list is ordered by an aggregate score per bloom, recomputed when pollen counts on buds along its path change. The score is a sum over every grain of pollen on every bud in the bloom's root-to-leaf path, where each grain contributes:

```
weight(grain) = f_depth(leaf_depth - grain_depth) * f_recency(now - grain_createdAt)
```

- **`f_depth` — depth from the leaf.** Grains closer to the leaf weigh more than grains deep in the trunk. This is what gives the score its "strength of the bloom itself" character: a fresh leaf pulling in pollen climbs the list quickly. A grain on the trunk still counts, but less per-grain — that's the transitive lift mechanism that lets ancestors share in their descendants' success.
- **`f_recency` — recency of the grain, not of the bud.** A grain's weight decays from the moment it was placed, not from the moment the bud was posted. An old bud that's still pulling in new grains stays hot; a bud whose grains all landed last week cools off even if it was posted yesterday. This keeps ranking responsive to current reader attention rather than to publication freshness.

The exact shapes of `f_depth` and `f_recency` (and any cap on path length contributing to the sum) are tuning parameters and will evolve.

For now the bloom list is **mixed across all curated story roots**, with each bloom labeled by its root so readers can tell stories apart. A future bookmarking feature will let readers follow specific stories.

## Moderation

Text-only buds keep moderation needs light. A future **flagging** flow will let readers report buds, which the indexer will surface as **labels** rather than hard takedowns. Copyright claims on small buds are out of scope for the initial design.

## Status

Early development. The README will grow alongside the project.

## Tech stack

- [TanStack Start](https://tanstack.com/start) (React, file-based routing, server functions)
- [AT Protocol](https://atproto.com/) for identity, storage, and federation
- [Prisma](https://www.prisma.io/) for the aggregator/index database
- [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) for UI
- [Biome](https://biomejs.dev/) for linting and formatting
- [Vitest](https://vitest.dev/) for tests

## Development

```bash
pnpm install
pnpm dev
```

Other scripts:

```bash
pnpm build    # production build
pnpm test     # run vitest
pnpm check    # biome lint + format check
```
