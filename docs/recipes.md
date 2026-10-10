# Recipes: Gled says X → do Y

Always: `outline` first, make the change, `check`, (`voice` if narration changed), `stills` + look, `render`, log in brief.md.

| Gled says | Do |
|---|---|
| "Remove the watermark" | Already gone in every render. Adjust `project.json → brand` (hide pill: `chip:false`; custom end link/signoff). |
| "Keep everything, just re-render clean" | `voice.provider: "original"` → `render`. Nothing else. |
| "Change the narration of scene N" | Edit `narration` of its beats; keep every `at` cue word present (or change the cue). Provider can't be `original` any more: ask which voice if `project.json` still says original. |
| "Make it more about the science / less about code" | Shift words from movement 3 into 1–2: open on the ecological question, add a scene on what the estimates *mean* (management, monitoring). Drop the code-panel scene or reduce it to one line. Redesign with designs/. |
| "More technical / for modellers" | Keep the opening short (2 scenes), add a scene on the model structure: what's latent, what's observed, what links them (boxes: qPCR Ct → standard curve; reads → amplification efficiency; shared latent DNA concentration). One code panel from the `.stan` file (verbatim). |
| "Shorter (e.g. 45 s)" | Target ~120 words, 5–6 scenes: hook → project → one-path how → one clever bit → end. Merge scenes, delete beats. |
| "Open differently / start with X" | Rewrite scene 1 narration + design; make sure scene 2 still picks up the thread. |
| "Different ending" | Change `outro` (≤ 8 words) and the last beat's narration so they rhyme with the opening. |
| "Use my paper's figure" | Put the image in `projects/<repo>/assets/`, add to `plan.images` as `img1..img3` with path `/project/assets/<file>`, then an `image` element in a design. |
| "Slower / faster pace" | Voice providers: `say` → `rate`; expressive voices → `style` ("slower, deliberate"). Or cut/add words. |
| "Highlight X more" | `pulse` / `highlight` / `focus` action on X's cue word; make X the scene's one `accent` box. |
| "This box/label is wrong" | Edit the element's `label`/`text`/`sub` in plan.json. No re-voice needed. |
| "Vertical for LinkedIn/Instagram" | `render <repo> --vertical` (1080×1920; scene re-flows automatically). |
| "Lower file size / 720p" | `render <repo> --height 720`. |
| "Show me before rendering" | `stills` and Read `out/stills/sheet-*.jpg`, describe, wait for OK. |
| "Make it for a new repo" | Gled makes the GitDiagram video first (gitdiagram.com/owner/repo) → `fetch`. If impossible: `new` + write from scratch. |
| "Go back to GitDiagram's version" | `reset <repo>` (backs up current plan). |

## eDNA vocabulary that reads well aloud

"a bottle of seawater", "DNA shed by fish", "reads", "proportions, not amounts", "one species measured
exactly", "anchors the rest", "amplification efficiency" (say once, then "how strongly each species
copies"), "a joint model fits both at once, so uncertainty flows between them", "survey maps".
Avoid in narration: Ct, PCR cycle numbers, posterior draws, Rhat, file extensions.
