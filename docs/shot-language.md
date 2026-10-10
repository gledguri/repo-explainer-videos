# Shot language (for `designs/*.json`)

This is the layout language GitDiagram's designer model writes. You never give coordinates: you say
**what** each element is and **how the scene is arranged**, and `npm run vid -- compile <repo>` runs
GitDiagram's own layout solver to place everything on the 16 × 9 canvas.

## Design file

```jsonc
// projects/<repo>/designs/04-pipeline.json
{
  "scene": "4 Pipeline",          // scene name (unique). Same name as an existing scene ⇒ that scene is REPLACED
  "replace": "6 Pipeline",        // optional: replace a scene with a different name
  "after": "3 Run it",            // optional, for NEW scenes: insert after this scene (or "before")
  "transition": "push",           // slide | push | zoom | cut
  "layout": { "row": ["raw", "clean", "model", { "col": ["post", "figs"] }] },
  "beats": [
    { "narration": "The R scripts load and clean them,",
      "brief": "raw data box, then the cleaning step",          // optional note to self
      "elements": [
        { "id": "raw", "kind": "box", "label": "Raw data", "sub": "data/raw/", "icon": "folder", "at": "load" },
        { "id": "clean", "kind": "box", "label": "Clean", "icon": "gear", "at": "clean" },
        { "id": "a1", "kind": "arrow", "from": "raw", "to": "clean", "at": "clean" }
      ],
      "actions": [] },
    { "narration": "then hand them to a single Stan joint model.",
      "elements": [
        { "id": "model", "kind": "box", "label": "Joint model", "sub": "Stan", "icon": "cpu", "tone": "accent", "at": "model" },
        { "id": "a2", "kind": "arrow", "from": "clean", "to": "model", "flow": true, "at": "hand" }
      ],
      "actions": [ { "do": "pulse", "at": "single", "target": "model" } ] }
  ]
}
```

Elements added in a beat stay for the rest of the scene. Later beats only add elements and actions.
Every `at` must be a word from **that beat's** narration (optional: without it, the element appears as the beat starts).

## Layout

- `{"row":[…]}` left→right, `{"col":[…]}` top→bottom; children are element ids or nested rows/cols (≤ 3 deep).
- `{"id":"win","in":{…}}`: a `browser` element drawn as a window around the inner layout.
- `{"slot":["a","b"]}`: same place, one after another (each leaves when the next arrives). Use for
  problem → fix, request → response.
- Every element appears in the layout exactly once, **arrows excepted** (they're routed).
- Frame ≈ 13 × 6 units usable. Box ≈ 3.5 × 1.3; chip 2.5 × 0.6; code/terminal ≈ 0.4/line + 0.7 tall, 6–9 wide;
  heading line 1.2; picture ≤ 5.4 tall. Rows wider than 13 or columns taller than 6 shrink the whole scene.
- ≤ 4 children across a row or down a column. A path of parts is one row, in story order; 5+ parts ⇒ split scenes.
- Asymmetry: subject on one side (or top), supports in a column beside it (or a row beneath).
- Arrows only between **neighbours** in the same row/col (otherwise they cross things). Every box in a path is joined.

## Element kinds (limits are hard; longer text is cut)

| kind | fields |
|---|---|
| `heading` | `text` (≤ 60, best < 30). Big serif. `*word*` → italic accent. |
| `text` | `text` (≤ 120), `size` s/m/l, `tone` ink/muted/accent, `mono` bool. A caption, never the subject. |
| `code` | `title` (file path), `lines` (≤ 12 × 72 chars, **verbatim from the repo**), `focus` [1-based lines]. Types in. |
| `terminal` | `title` (≤ 40), `lines` (≤ 9). `"$ …"` lines are typed commands; others are output. Never empty. |
| `box` | `label` (≤ 28, best < 18), `sub` (≤ 36), `icon`, `tone`. ≤ 1 `accent` box per scene (the subject). |
| `chip` | `text` (≤ 28), `tone`. Small pill. |
| `file` | `path` (≤ 60), a real file. |
| `tree` | `paths` (≤ 8 real paths), `focus` [rows]. |
| `table` | `columns` (≤ 4), `rows` (≤ 5 × ≤ 4 cells, ≤ 24 chars). |
| `bars` | `items` [{label ≤ 20, value}] (≤ 6), `unit` (≤ 6). Horizontal bars. |
| `number` | `value`, `prefix` (≤ 3), `suffix` (≤ 6), `label` (≤ 32). Rolls up. |
| `stamp` | `text` (≤ 14), `tone`. Slams in at an angle. |
| `browser` | `url` (≤ 60); content via `"in"` in the layout, brought in on the same beat. |
| `request` | `method`, `url`, `status` (number/null), `lines` (≤ 5). |
| `list` | `items` (≤ 4 × 48 chars). Sparingly. |
| `image` | `src` = `img1`…`img3` (README pictures stored with the film), `fit` contain/cover. |
| `arrow` | `from`, `to` (ids), `label` (≤ 14), `dashed`, `flow` (packets run along it). Not in layout. |

Icons: server database user file folder globe lock bolt clock queue cpu cloud key gear package browser terminal shield cache none.
Tones: plain accent soft ok bad ghost.

## Actions `{ "do", "at", "target" (id or [ids]), …extra }`

`highlight` (+`lines` for code, `rows` for tree/table) · `dim` · `restore` · `exit` · `strike` · `pulse` · `shake` ·
`check` · `cross` · `replace` (+`text`) · `count` (+`value`) · `type` (+`line`, terminal/code) ·
`flow` (target an arrow) · `scan` · `focus` (camera push, one or more ids) · `reset` (camera back).

## Checks the compiler applies (warnings printed)

Code lines not found verbatim in the repo are dropped; paths not in the tree are flagged; cue words not in
the narration fall back to the beat start; extra elements/actions past per-beat limits are dropped.
