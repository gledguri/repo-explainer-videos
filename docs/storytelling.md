# Storytelling template (GitDiagram's director rules, adapted for research repos)

GitDiagram's films work because they follow a strict narrative shape. Keep the shape unless
Gled asks otherwise; change the *angle* freely.

## Shape: three movements, ~85 s

1. **What it's for** (first 4–5 scenes, ~half the words).
   Open on a *moment or problem* the audience recognises, not a definition
   ("One bottle of seawater holds DNA from dozens of fish, but sequencing only tells you proportions").
   The project then arrives as the answer: who uses it, what goes in, what comes out.
   Show it in use: the figure it produces, the map, the command that reproduces the paper.
   Plain words, no file names yet.
2. **How it works** (next 2–3 scenes). Follow ONE thread end to end through the main parts in plain
   words ("the joint model", "the spatial smooths"). Just enough to trust it.
3. **Under the hood** (last 1–2 scenes). ONE design decision that makes it good (e.g. the qPCR anchor
   turning relative reads into absolute concentrations, caching stages so model fitting runs once),
   shown with one real piece of code/structure/value, said in terms of what it buys the user.

End on a line that **closes the opening thread** in a way only this project could
("One qPCR anchor, thirteen species mapped." / "Fish counted in the river, measured in the air.").
Not a summary, not a slogan.

## Voice of the narration

- One story, not a list. Sentences grow from the previous one: "so", "but", "which means",
  "that's where", "and the moment it…". Never "Then it does X. It also does Y."
- A scene ends by raising the question the next scene answers.
- Spoken English: complete sentences, varied length, present tense, commas where you'd breathe.
  Ellipsis or dash before a reveal ("Feed both into one model… and the shares become concentrations.").
  A short question can set up its answer ("Can that air tell you which fish are there?").
- No "let's", "in this video", "you'll learn", recaps, or advice on where to start reading.
- At most one number per scene; numbers spelled as words. Names said the way people say them;
  paths/symbols only on screen.
- Every technical term earns its place. The viewer is smart but not in your sub-field.

## Structure

- 195–220 words, 20–26 beats, 8–10 scenes, 2–4 beats per scene.
- A **beat** = the stretch of narration that one on-screen change belongs to (a sentence or clause, 4–16 words).
- Write the story as one paragraph first, then cut it into beats word-for-word (the voice reads one continuous take).
- `title`: 2–4 words, ≤ 26 chars. `outro`: ≤ 8 words, specific to this project.
  Wrap one or two words in `*asterisks*` to set them in italic accent colour.

## Visual rhythm (designer)

- One subject per scene (a terminal, a code panel, a path of 3–4 boxes, one big number, a heading),
  plus ≤ 4 supports. 3–6 elements by the scene's last beat, never > 7.
- Vary composition scene to scene: heading → chips/bars → path of boxes → terminal → file tree → code → end card.
  Never two scenes in a row built from the same kind of thing.
- Opening scenes show the science/product in use, never source code. Code appears only under the hood
  (≤ 3 short panels per film, 3–8 lines, verbatim).
- Things appear on the word that mentions them (`at`). Every beat changes the picture; nothing is rebuilt.
- Not a slide deck: no title + bullets, no grid of identical boxes, no label that just repeats the caption.
- Camera: `focus` to push into a detail, `reset` to pull back; at most once or twice a scene.

## Reference: the GitDiagram film for quantitative-multispecies-edna (85 s)

1. "One bottle of *seawater*" heading → chips Hake / Species 2 / Dozens more → bars of shares + stamp NO AMOUNTS.
2. "Quantitative *Multispecies* eDNA" heading → qPCR box, Metabarcoding box → chip "hake: absolute".
3. qPCR + Metabarcoding → arrows → accent box "Joint model, fitted in Stan".
4. Log_D_est.rds → sdmTMB smooths → Survey maps (path of three).
5. Terminal: `git clone …`, `Rscript code/0_Download_data.R`.
6. Zenodo → data/ ; NCBI SRA → SRA/fastq/ (two short paths).
7. File-tree of three notebooks; chips Joint_model.stan / Mock_model.stan; rows highlight as named.
8. "Joint model, run once" struck through: caching lets you skip the expensive fit.
9. Code panel of the SRA downloader, lines highlighted → chip "retries failed runs only".
10. "Hake, measured exactly" → end card "One qPCR anchor, thirteen species mapped."
