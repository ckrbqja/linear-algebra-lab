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
- Prefer the existing owner module and shared helpers. Add code to `src/App.jsx`
  only when it genuinely coordinates multiple domains or the Three.js scene.
- If a feature changes user-facing text, update `src/i18n.js`.
- If a feature changes notebook syntax or behavior, update
  `docs/specs/notebook-language.md`.
- If a feature changes scene interaction, update
  `docs/specs/visual-interaction.md`.

## Frontend File And Style Ownership

- `src/styles.css` is an import manifest and Tailwind theme bridge, not a place
  for feature selectors. Existing selector-based CSS is split by responsibility
  under `src/styles/`; keep every domain stylesheet below the repository
  architecture budget.
- Tailwind CSS utilities are the default for new component-local layout,
  spacing, typography, responsive behavior, and simple interaction states.
  Keep utility names statically discoverable in JSX; map variants to complete
  class strings instead of constructing partial class names dynamically.
- The Tailwind Vite integration intentionally imports theme and utilities
  without Preflight while legacy selector CSS remains. This prevents a global
  reset from changing the established canvas, editor, form, and overlay
  geometry during incremental migration.
- Keep dynamic renderer coordinates, colors, and measured geometry in inline
  styles or CSS custom properties. Tailwind utilities should express stable UI
  structure, not per-frame Three.js state.
- `src/App.jsx` is legacy coordination debt and must shrink, never grow.
  `src/AppRuntime.jsx` is the extracted compatibility boundary for the older
  parser, math, camera, and Three.js helpers; it must also shrink as those
  responsibilities move into `src/notebook/`, `src/matrix/`, `src/shared/`, and
  focused scene modules. Authentication UI, startup/service-worker behavior,
  layout helpers, notebook surfaces, and other reusable responsibilities belong
  in their existing domain folders. A new feature must not add a self-contained
  component, parser, formatter, or style block directly to either legacy file.
- `pnpm run validate:architecture` enforces the current shrinking budgets for
  `App.jsx` and `AppRuntime.jsx`, keeps `src/styles.css` as a small manifest,
  and prevents any split stylesheet from becoming the next monolith. The normal
  build runs this gate first.

## Notebook Module Ownership

- `src/App.jsx` is the application coordinator: it owns cross-feature state,
  Three.js scene wiring, and callback composition. It must not absorb reusable
  formatting, matrix analysis, clipboard behavior, or self-contained panel
  markup merely because App supplies the state.
- `src/shared/numberFormat.js` owns display-number and matrix-number formatting;
  `src/shared/clipboard.js` owns the browser clipboard compatibility path.
- `src/app/localization.js` composes managed translations with app-shell
  messages and owns locale detection/normalization. Feature code consumes its
  translator instead of rebuilding locale tables inside `App.jsx`.
- `src/app/seoRoutes.js` owns canonical public locale paths and is shared by
  runtime locale detection, home history, metadata, and the production HTML
  generator. `scripts/generate-localized-seo-pages.mjs` creates the localized
  `/en/`, `/ja/`, and `/zh/` entry documents after Vite builds; do not hand-edit
  generated `dist` copies.
- `src/auth/googleOneTap.js` owns Google Identity Services script loading and
  the browser One Tap prompt. `App.jsx` coordinates its result with app state;
  `backend/src/index.ts` owns credential verification and session issuance.
- `src/matrix/matrixAnalysis.js` owns dimension/rank-derived matrix view modes
  and per-step determinant, rank, and inverse calculations.
- `src/components/MatrixWidgets.jsx` owns reusable matrix display/input and copy
  controls. `src/components/TransformHistoryDetail.jsx` owns the transform
  history detail card, while `src/components/AdChrome.jsx` owns the advertising
  shell and ad-block gate.
- `src/notebook/playback/NotebookSceneDock.jsx` owns the scene-level segment
  selector, scrubber, marks, and focus toggle. It receives already computed
  playback data and never reparses notebook text.
- `src/notebook/editor/NotebookAuthoringToolbar.jsx` owns prompt/link copy,
  playback, and the dedicated speed row for the authoring chrome. App provides
  actions and state; the toolbar module owns their stable markup.
- `src/notebook/editor/NotebookAiGuideDialog.jsx` owns the localized onboarding
  flow between `Create with AI` and the actual production-prompt copy action.
  Its examples explain usage only and never duplicate prompt-policy rules.
- Do not add new notebook parsing, timing, or prompt-policy rules to
  `src/App.jsx`.
- `src/notebook/syntaxMetadata.js` owns notebook suffix metadata such as aliases,
  hidden declarations, execute markers, show/remove markers, and durations.
- `src/notebook/playbackEngine.js` owns default notebook timing and deterministic
  cursor/line mapping plus playback-segment construction.
- `src/notebook/operationPresentation.js` converts an already parsed active cell
  into the syntax-free current-operation presentation model. Components under
  `src/notebook/playback/` own its transient playback UI and must not reparse
  notebook source or duplicate the underlying mathematics.
- `src/notebook/measurementEngine.js` owns measurement geometry calculations.
- `src/notebook/rowOperationEngine.js` owns elementary-matrix inference,
  product verification, affected/eliminated cell data, and per-cell arithmetic.
  `src/notebook/board/boardAnnotation.js` owns board-mark syntax and deterministic
  cell staging; other components under `src/notebook/board/` own algebra-board
  card choreography and never reimplement that mathematics or parser.
- `src/notebook/languageCore.js` owns shared language defaults and scene-command
  aliases.
- `src/notebook/notebookLibrary.js` owns normalization and browser-local
  persistence for saved notebook documents; React owns only the library UI and
  active selection state.
- `src/notebook/editor/` owns notebook editor adapters. Classic and Monaco
  surfaces consume the same App-owned document/playback callbacks;
  `monacoLanguage.js` owns Monaco tokens, completion, hover, and decorations,
  `monacoFolding.js` owns scene-setup range classification and auto-fold timing,
  while `monacoGutterWidgets.js` owns Monaco-native notebook mark widgets and
  their line-run/rename interactions.
- `src/notebook/promptPolicy.js` is only the prompt-policy assembler. Rule text is
  grouped by responsibility under `src/notebook/prompt/`: `coreRules.js`,
  `scenePatterns.js`, `cameraRules.js`, and `referenceRules.js`.
- `src/notebook/prompt/buildPrompt.js` owns locale-specific request framing and
  final prompt-document assembly. `App.jsx` passes runtime camera/timing metrics
  through a thin wrapper and does not contain prompt prose.
- Rule strength (`MUST`, `SHOULD`, `DEFAULT`, `MAY`) is metadata inside a domain
  rule. Do not create separate files by strength; keep each rule beside the
  engine or teaching concept it governs.

## Verification

Default quick check:

```bash
pnpm run build
```

Visual lesson/course changes first run the repository-owned static gate:

```bash
pnpm run validate:row-ops
pnpm run validate:lessons
pnpm run build
```

The agent process for those changes is defined in
`docs/agent/visual-lesson-quality-loop.md`. Its critic pass is based on actual
execution evidence, not private model memory or another copy of the user-facing
AI prompt. Reusable execution failures are recorded minimally in
`docs/agent/visual-lesson-cases.md`.

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

For authenticated local testing, run the API and frontend together:

```bash
pnpm run backend:dev
pnpm run dev -- --host localhost --port 4177
```

When no explicit `VITE_FLOW_MATH_API_URL` is configured, a Vite development
page on a loopback host uses `http://localhost:8787`; production builds still
default to `https://api.flow-math.com`. Google OAuth carries an allowlisted
return URL through the callback, so a login that starts on a local port returns
to that port. Keep the local frontend origin in `backend/.dev.vars`
`ALLOWED_ORIGINS`, and use `localhost` for the browser URL so the API's strict
session cookie remains same-site.

## Cloudflare Pages

Production is intended to deploy on Cloudflare Pages for `flow-math.com`.

The static PWA files live in `public/`: `manifest.webmanifest`, `sw.js`, and the
Flow Math install icons. `src/main.jsx` registers the worker only in production.
Navigation remains network-first and API/auth/ad traffic must never be added to
the worker cache. Keep `/sw.js` non-cacheable in `public/_headers` so a release
can activate its newest worker promptly. Every service-worker cache revision
must use a new cache version, remove older Flow Math caches on activation, and
validate asset content types before precaching or runtime caching. In
particular, a temporary HTML fallback at a hashed CSS or JavaScript URL must be
rejected rather than preserved by the offline cache or returned to the page.
Worker installation must fail instead of activating an incomplete critical app
shell. Runtime asset retrieval retries one invalid response with
`cache: 'reload'`, then reports the failure to open clients. The production client may
perform one session-guarded cache-busting reload when a built resource fails or
the app's CSS sentinel is absent at load or `controllerchange`. A failed
stylesheet first retries its own URL with a one-time query cache buster so an
already poisoned bare CDN cache entry does not require a full page reload.

Locale entry pages are generated as real `/en/`, `/ja/`, and `/zh/` directories.
Do not add a catch-all status-200 rewrite to `public/_redirects`: it turns missing
hashed assets into HTML responses. Keep a top-level `public/404.html`, and keep
`/assets/*` on `max-age=0, must-revalidate` so temporary invalid edge responses
cannot become long-lived immutable assets.

Repository settings:

- Build command: `pnpm run build`
- Build output directory: `dist`
- Wrangler Pages project name: `linear-algebra-lab`
- Primary custom domain: `flow-math.com`
- Deploy the API worker through `pnpm run backend:deploy`; the root script uses
  `pnpm --dir backend run deploy` explicitly so pnpm does not mistake the
  backend package script for its unrelated built-in deploy command.

Branch policy:

- `main` is the production branch.
- `dev` is the development/preview branch.
- GitHub Actions deploys automatically when either branch receives a push.
- The workflow must pass the pushed branch name to `wrangler pages deploy`
  with `--branch`, so Cloudflare Pages can route `main` and `dev` consistently.
- GitHub repository secrets required by the workflow:
  `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.
- PostHog is initialized from Vite client environment variables:
  `VITE_POSTHOG_PROJECT_TOKEN` and `VITE_POSTHOG_HOST`.
- The web SDK uses `person_profiles: 'always'` so anonymous visitors also get
  Person profiles instead of remaining profile-less anonymous events.
- Node.js PostHog log verification uses OpenTelemetry in `scripts/` and can be
  tested with `pnpm run posthog:log`. This sends one OTLP log to PostHog but is
  not part of the static Cloudflare Pages runtime.

The repo keeps `wrangler.toml` with `pages_build_output_dir = "./dist"` so a
Pages project or CLI deploy can infer the output directory. Vite copies
`public/_redirects` and `public/_headers` into `dist` during build; keep those
files when changing deployment behavior.

Manual production deploy from an authenticated machine:

```bash
pnpm run deploy
```

`pnpm run deploy` is the repository shorthand for building the current working
tree and deploying it to project `linear-algebra-lab` with `--branch main`.
Uncommitted work is allowed because the release artifact is the freshly built
`dist`, but the command never commits or pushes source changes. The build checks
that locale entry pages reference real files, missing paths cannot be rewritten
with status 200, the 404 page exists, and production cache headers remain safe.
After deployment, the release command also verifies the custom-domain entry,
its built CSS and JavaScript content types, the service-worker cache header, and
two true-404 responses for a fresh missing asset path. It probes each new asset
with a unique query before touching its bare URL, so routing propagation cannot
poison a newly generated filename during verification.

Cloudflare Pages production deploy command for an already-built `dist`:

```bash
pnpm run deploy:production:dist
```

Do not use `npx wrangler deploy` for this project. That command is for Workers
and fails on Pages with a missing Worker entry point or assets directory.

Do not add a Worker `[assets]` block to `wrangler.toml` while using
`wrangler pages deploy`; Pages configuration validation rejects Worker-only
keys. If the Cloudflare dashboard shows Workers Git settings, prefer switching
the project to Pages or keep the deploy command as `pnpm run deploy:pages:dist`
so the Pages deploy path is explicit.

## Android Packaging

The Google Play package is the Trusted Web Activity project under `android/`.
Its immutable application ID is `com.madebyneed.mathflow`, and both compile and
target SDK are API 36. It opens the production `https://flow-math.com/` PWA so
the web app remains the source of truth for UI, authentication, and content.

Create signed release artifacts from the repository root with:

```powershell
.\android\package-release.ps1
```

This produces the ignored `android/app-release-bundle.aab` for Play Console and
`android/app-release-signed.apk` for device testing. The ignored
`android/android.keystore` and `android/signing-credentials.properties` are
release secrets and must be backed up outside the repository before the first
store upload. Every new upload increments `appVersionCode` in both
`android/twa-manifest.json` and `android/app/build.gradle`.

Trusted Web Activity verification is served from
`public/.well-known/assetlinks.json`. Before local APK testing, deploy the upload
certificate fingerprint with the frontend. After Play App Signing is enabled,
add the Play app-signing SHA-256 certificate fingerprint to both that public
file and `android/twa-manifest.json`; do not replace the upload fingerprint.

## Cloudflare Worker Backend

The API backend lives in a separate Hono project under `backend/`.

- Worker name: `flow-math-api`
- Production API domain: `https://api.flow-math.com`
- D1 database name: `flow-math`
- D1 database ID: `7e843133-aad2-47ad-b302-2ef54f96581a`
- D1 binding name in Worker code: `DB`
- Google OAuth production callback:
  `https://api.flow-math.com/auth/google/callback`
- Google OAuth local callback:
  `http://localhost:8787/auth/google/callback`
- The API also exposes temporary email auth endpoints:
  `POST /auth/email/signup` and `POST /auth/email/login`.
- Email auth requests send `email` and `password`. The Worker stores only a
  PBKDF2-SHA256 password hash in D1; plaintext passwords must never be logged
  or stored.
- `ADMIN_EMAILS` is a comma-separated Worker variable for users that should
  receive the `admin` role and bypass the frontend ad-block gate.
- Frontend ad-block detection must remain disabled until the `/me` session
  request resolves. After resolution it stays disabled for `admin` and
  `operator` users and runs only for confirmed non-exempt users; an unresolved
  role must never render the access wall as a temporary default.
- The Google OAuth client secret must be stored in `backend/.dev.vars` for
  local development and in the Worker secret `GOOGLE_OAUTH_CLIENT_SECRET` for
  production. Do not put that secret in tracked example files.

Backend commands:

```bash
pnpm run backend:dev
pnpm run backend:typecheck
pnpm run backend:d1:migrate:local
pnpm run backend:d1:migrate:remote
pnpm run backend:deploy
```

The production frontend should start Google login by navigating to
`https://api.flow-math.com/auth/google/login` with its current allowlisted
frontend URL as `return_to`. After successful login, the API sets an HTTP-only
session cookie and redirects to that validated return URL with `auth=google`;
without a valid return target it falls back to `https://flow-math.com/`.
The frontend identifies the authenticated user in PostHog and captures
`flow_math_auth_completed` after Google login, email login, or email signup.

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
