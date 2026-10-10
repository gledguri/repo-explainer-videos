# How to use this (for me, the human)

You don't run any commands yourself. You talk to Claude in this folder; Claude does the rest.

---

## The workflow at a glance

```
1. Make the video on gitdiagram.com      (you, once per repo)
2. Open Claude in this folder            (you)
3. Say which repo + what to change       (you, plain words)
4. Approve the script & still frames     (you look, Claude shows)
5. Give feedback, repeat                 (as many rounds as you like)
6. Get the final MP4                     (Claude renders and sends it)
```

---

## Step by step, with an example

Example repo: **gledguri/Air-eDNA-quant**

### 1. Make the video on GitDiagram

Go to **gitdiagram.com/gledguri/Air-eDNA-quant** and let it create the video.
Watch it and write down what you'd like changed.

> You do **not** need to download the MP4. Claude pulls GitDiagram's editable version
> straight from their website. The repo name is all it needs.

### 2. Open Claude in this folder

In the Claude app: new session → folder **`Local › GitHub › repo-explainer-videos`**.

### 3. Tell Claude which repo and what to change

Just write it like you'd tell a colleague. For example:

> Get my video for gledguri/Air-eDNA-quant.
> Open with the river fieldwork instead of the title.
> Explain the joint model a bit more for scientists.
> End on detection limits instead of "Salmon in the river, DNA in the air."

Or, if you only want the watermark gone:

> Get my video for gledguri/Air-eDNA-quant and render it clean.

### 4. Approve before anything is rendered

- **If you changed the story/wording:** Claude first shows you the new script (the narration) in chat.
  Read it, say "yes" or say what to change.
- **Then Claude shows you still frames**: one picture per moment of the video, so you can check the
  boxes, labels and layout before waiting for the full render.

### 5. Give feedback, repeat

Short comments are enough:

> Scene 3 is too busy, keep only the three main boxes.
> Say "salmon", not "fish".
> The ending is too long, make it punchier.
> Make the qPCR box the highlighted one.

Each round takes a minute or two.

### 6. Get the final video

> Looks good, render it.

Claude renders the MP4 (about 2 minutes) and sends it to you. It's also saved in:

```
projects/air-edna-quant/out/Air-eDNA-quant.mp4
```

Other formats, if you need them:

> Make a vertical version for Instagram/LinkedIn.
> Make a smaller 720p version for email.

---

## Things worth knowing

**The voice**
- Change only visuals (labels, layout, colours, highlights) → keeps **GitDiagram's original voice**.
- Change any spoken words → the narration is re-recorded. Without an API key that's the
  **robotic built-in Mac voice** (fine for drafts).
- For a good voice, add one key once (ask Claude to help set it up):
  - `OPENROUTER_API_KEY`: the exact same voice GitDiagram uses
  - or `GEMINI_API_KEY` (has a free tier) / `OPENAI_API_KEY`
- You can also record yourself: *"I recorded the narration in my-take.mp3, use that."*

**The watermark**
Always removed. The top-left shows `gledguri/<repo>` and the end shows the GitHub link.
You can change that:

> Hide the repo name in the top-left corner.
> Add "Guri et al. 2026, Environmental DNA" at the end.

**Your preferences are remembered**
Say something general and Claude saves it in `house-style.md`, so every future video follows it:

> From now on, always explain the science before showing any code.
> Never use the word "pipeline".

**Going back**
> Undo everything and go back to GitDiagram's original version.

**A brand-new repo with no GitDiagram video**
Make the video on gitdiagram.com first (step 1); it gives a much better starting point.
If that's not possible: *"Write a video from scratch for gledguri/<repo>."*

---

## Example prompts to copy

| I want… | Say |
|---|---|
| Just remove the watermark | `Get my video for gledguri/<repo> and render it clean.` |
| A different angle | `Retell the <repo> video from a fisheries-management angle, for managers not modellers.` |
| More technical | `Make the <repo> video more technical: show how the qPCR and metabarcoding parts of the model connect.` |
| Shorter | `Cut the <repo> video to about 45 seconds.` |
| Fix one thing | `In the <repo> video, the box "river water" should say "Skagit River".` |
| Use a figure from my paper | `Use Plots/Figure_1.png from the repo in the results scene.` |
| See before rendering | `Show me the frames first.` |

---

## Where things are (only if you're curious)

| Folder / file | What it is |
|---|---|
| `projects/<repo>/` | one folder per video |
| `projects/<repo>/out/` | the finished MP4s and preview pictures |
| `projects/<repo>/brief.md` | your requests for that video + a log of what changed |
| `house-style.md` | your standing preferences (applies to every video) |
| `CLAUDE.md` | the instructions Claude follows (you don't need to read it) |
