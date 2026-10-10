# repo-explainer-videos

Personal studio: take the explainer video [GitDiagram](https://gitdiagram.com) made for one of my repos, tell
Claude how the story should change, and get back a re-voiced, re-rendered MP4 with no watermark.

GitDiagram's films are JSON shot plans played by its open-source (MIT) engine, so instead of editing pixels
we edit the plan. The instructions for the LLM are in **[CLAUDE.md](CLAUDE.md)**; I just prompt, e.g.:

> Fetch my Air-eDNA-quant video. Keep the visuals but rewrite the opening around the river
> fieldwork, make the joint-model scene more technical, and end on detection limits.

## Setup (once per machine)

```bash
npm install
npm run vid -- setup      # downloads the pinned GitDiagram engine into vendor/ and patches out the watermark
```

Requires Node ≥ 20 and ffmpeg. Optional: `OPENROUTER_API_KEY` (GitDiagram's exact voice), `GEMINI_API_KEY`,
or `OPENAI_API_KEY` for voices and word timing; `pip install mlx-whisper` for free local timing.
Without keys, the macOS `say` voice works for drafts, and GitDiagram's original voice works for any
visual-only change.

## Layout

```
CLAUDE.md          operating manual for the LLM (AGENTS.md → same file)
house-style.md     my standing preferences
docs/              storytelling template, shot language, plan format, edit recipes
scripts/           CLI (npm run vid -- help)
projects/<repo>/   one folder per film: plan.json (the film), designs/, project.json, brief.md
vendor/            GitDiagram engine (git-ignored, installed by setup)
```

Engine © Ahmed Khaleel, MIT, from github.com/ahmedkhaleel2004/gitdiagram (pinned in `scripts/setup.mjs`).
