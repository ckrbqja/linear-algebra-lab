# Development Workflow

## Before Editing

1. Read `AGENTS.md`.
2. Read the spec file that matches the request.
3. Inspect the current implementation before assuming behavior.
4. Check `git status --short` so existing user changes are visible.

## Editing Rules

- Use `apply_patch` for manual edits.
- Keep changes scoped to the request.
- Do not rewrite the app structure unless the request explicitly requires it.
- Do not revert user changes.
- Prefer exact helpers and existing patterns in `src/App.jsx`.
- If a feature changes user-facing text, update `src/i18n.js`.
- If a feature changes notebook syntax or behavior, update
  `docs/specs/notebook-language.md`.
- If a feature changes scene interaction, update
  `docs/specs/visual-interaction.md`.

## Verification

Default quick check:

```bash
pnpm run build
```

Use browser verification when:

- the user explicitly asks for screenshots or strong verification;
- the change touches camera, layout, hit testing, drag behavior, or visual
  geometry in a way the build cannot catch;
- a previous browser-visible bug was reproduced and needs confirmation.

If the user says not to spend time on heavy verification, do not do repeated
screenshots. Build once unless the change is purely documentation.

## Local Server

Run the dev server only when needed:

```bash
pnpm run dev -- --host 127.0.0.1
```

Use an alternate port if the default is busy.

## Cloudflare Pages

Production is intended to deploy on Cloudflare Pages for `flow-math.com`.

Repository settings:

- Build command: `pnpm run build`
- Build output directory: `dist`
- Wrangler Pages project name: `flow-math`

The repo keeps `wrangler.toml` with `pages_build_output_dir = "./dist"` so a
Pages project or CLI deploy can infer the output directory. Vite copies
`public/_redirects` and `public/_headers` into `dist` during build; keep those
files when changing deployment behavior.

Manual deploy from an authenticated machine:

```bash
pnpm run deploy:pages
```

## Browser Testing Notes

- Prefer the in-app browser for local visual checks.
- Verify both desktop and mobile only when the request is responsive/layout
  related or the user asks.
- For Three.js changes, check that the canvas is nonblank and the object is
  visible from the intended camera.

## Common Risk Areas

- Notebook parser order: changing one parser can steal lines from another.
- Matrix parsing: avoid treating a single number as a matrix.
- Vector parsing: comma-separated lines should create vectors.
- URL state: new fields need safe defaults for old URLs.
- Labels: DOM overlays can overlap even when Three.js geometry is correct.
- Camera auto mode: manual drag, auto settle, lock modes, and zoom lock interact.
- System mode display toggles: axes, basis, grid, relative grid, and coordinates
  should keep working.

## Documentation Discipline

When behavior changes, update docs in the same change:

- Product/UX intent: `docs/specs/project-sot.md`
- Notebook syntax: `docs/specs/notebook-language.md`
- Scene/interaction behavior: `docs/specs/visual-interaction.md`
- Build/test/process: `docs/specs/development-workflow.md`

The goal is spec-driven development: future agents should be able to understand
what "correct" means before opening `src/App.jsx`.
