# Project Source Of Truth

## Product Shape

Linear Algebra Lab is an interactive learning tool for linear algebra. The user
should feel like they are writing math in a notebook while the graph performs
that math as an animation.

The app has two main workflows:

- The current public lab exposes only System/notebook. The System/Transform tab
  switch is feature-gated out and even an older shared URL requesting Transform
  opens System/notebook instead. Transform code remains preserved for a later
  re-enable without duplicating its engine.

0. Flow Math entry
   - A plain root visit opens a Flow Math home screen first.
   - The home screen is the public acquisition and explanation page for the
     Linear Algebra lab. It introduces Flow Math with a product preview, explains
     the notebook-to-animation workflow, identifies its intended audience, and
     ends with visible FAQ and entry actions.
   - The first view ends in one large, centered product window rather than a
     moving card rail or static illustration. It renders the verified,
     localized examples `matrixTransform`, `rankDrop3d`, and `system-two-views`
     through the same read-only animation URL contract used for sharing, so the
     proof comes from the real scene renderer. In this autoplay-only preview
     variant, each authored checkpoint becomes a one-second pause before
     playback continues; the editable source examples retain their normal
     learner-owned checkpoints. A compact macOS-style tab strip beside the
     `Live Flow Math demo` title switches the one window between those examples
     in place; it
     does not add a carousel or move the page. The selected tab is preserved
     when the preview expands. During initial load and tab changes,
     the embedded app stays masked by a restrained dual-ring loader until its
     fonts, WebGL renderer, and initial notebook scene report ready. The loader
     uses two offset broken arcs at different tempos, a softly breathing center
     core, one quiet orbit marker, and the selected lesson's accent palette. It
     does not preview geometry, diagrams, labels, or progress storytelling. The
     embedded app's own transient spinner and scrollbars never appear through
     the landing frame.
     The window's width, height, typography, and spacing stay aligned with the
     original single-preview landing composition.
     At narrow mobile widths the live iframe is not mounted in the first view.
     The same three lesson tabs sit in a compact, simulation-like preview card;
     selecting a tab changes the chosen lesson, and selecting the card opens
     that lesson in the fixed full-viewport player. This keeps the hero readable,
     avoids loading WebGL before the learner asks for it, and never inserts the
     full-height renderer into the mobile document flow.
   - A hard refresh must never paint the differently spaced SEO fallback before
     the application styles arrive. An inline boot guard hides the root only
     when JavaScript is active. The React boot boundary waits for the production
     UI font (within a short bounded budget) and two layout frames before it
     reveals the complete styled application in one atomic paint. The landing
     shell must not visibly assemble through a fallback-font reflow, a late
     header effect, or an empty desktop Aurora layer; its CSS Aurora fallback is
     present from the first revealed frame while the live canvas initializes
     behind it. The guard times out to the fallback if application startup
     fails, and the fallback remains visible normally when JavaScript is
     unavailable.
   - Selecting the product window's `Open this scene` action expands that same
     lesson over the current viewport without changing the document scroll
     position. The fixed player keeps the
     learner-visible captions, object labels, matrix cards, operation HUD, and
     bottom playback dock, names the selected lesson in its chrome, and locks
     background scrolling. Its red, yellow, and green window controls close,
     minimize back to the inline preview, and maximize/restore the player; the same
     read-only scene can still open in a new tab. Opening the fixed player adds
     one same-URL browser-history entry, so the browser or Android system Back
     action closes the player before it can leave the Flow Math home; Forward
     may restore the same selected lesson. Reduced motion removes the
     preview-to-player expansion and shows the lesson's final state immediately.
   - The home screen is a vertically scrollable semantic document. Its compact
     header is fixed near the top of the viewport while the document scrolls and
     uses the official React Bits `GlassSurface-JS-CSS` registry component and
     its documented landing-page displacement parameters on desktop rather than
     a local visual approximation. At widths up to `760px`, `GlassSurface` is
     not mounted: the fixed header uses a neutral dark translucent backdrop with
     a visible blur, no teal, blue, or other chromatic fill, and no SVG
     displacement. Its light
     border and restrained shadow keep the controls legible without turning the
     header into a colored block. Its center navigation uses a readable cool-light
     tone against the shifting glass, while the language and primary-entry
     controls form one compact, softly rounded, low-contrast glass family
     instead of competing heavy blocks. The header itself stays low and only
     moderately rounded. On mobile, the language selector fits inside the fixed
     low header height instead of expanding the glass above or below it. The
     mobile hero uses a deliberately open vertical rhythm: the header, eyebrow,
     headline, supporting copy, stacked actions, assurance, and compact demo
     read as separate bands, with progressively wider gaps toward the proof
     window instead of forming one compressed block. The hero preserves
     breathing room around restrained
     headline and action sizes. The headline keeps the production font's compact
     variable-weight metrics in local development as well as production, so a
     fallback font never widens or thins its tight two-line lockup. It floats
     above a frameless first view;
     the hero has no enclosing card, border, or large rounded container. The
     value proposition follows one centered visual axis, with the large live
     example window attached to the lower part of that first view and the official
     React Bits `Aurora-JS-CSS`
     component, installed with its `ogl` dependency and configured with the
     site's teal-led mint, cyan-blue, and indigo three-stop palette, kept behind
     readable content. At widths up to `760px`, that component is not mounted:
     the hero uses a static CSS rendering of the same three-stop palette so no
     hidden WebGL canvas or animation frame loop survives on mobile. Desktop
     keeps the live Aurora motion. The home document uses restrained vertical section
     snapping so scrolling advances through coherent content panels without
     trapping a section taller than the viewport. The primary lab entry, inline
     compact mobile preview, and fixed expanded demo remain usable on a small viewport;
     later explanation sections stack into a single readable column on narrow
     screens.
   - The feature overview is one complete six-card system, not a loose masonry
     tail. Desktop fills two cards across the first row and four cards across
     the second row; every card carries a restrained, concept-specific micro
     visual so no final card is isolated or visually unfinished. Tablet uses
     two balanced columns and mobile stacks the same cards in reading order.
     On mobile, repeated section-introduction paragraphs are omitted and each
     feature card uses a concise localized summary, tighter spacing, and the
     same small proof visual instead of repeating the full desktop explanation.
   - Flow Math is installable as a progressive web app. Its manifest uses the
     Flow Math identity, standalone display, dark theme, and separate icon
     assets for launcher behavior: an `any` icon has transparent outer corners
     around the finished rounded-square mark, while the `maskable` icon uses a
     full-bleed dark background and keeps the F mark inside the central safe
     zone. A pre-rounded opaque icon must not also be declared `maskable`, since
     Android would mask and shrink the container twice. The manifest revalidates
     instead of remaining fresh in the HTTP cache so corrected install metadata
     and icon URLs can propagate promptly.
     The production service worker uses network-first navigation with an offline
     app-shell fallback and caches only same-origin GET assets; API, session,
     analytics, and advertisement requests remain outside its cache. Versioned
     worker caches discard earlier releases, and a CSS, JavaScript, font, image,
     or manifest response is cached only when its content type matches the
     requested asset. An HTML fallback returned temporarily for a hashed asset
     must never be stored, replayed, or returned to the page as that asset.
     Locale entry pages exist as real generated directories; production must
     not use a catch-all status-200 rewrite, and a missing hashed asset remains
     a true 404 through the top-level `404.html`. Built assets revalidate instead
     of receiving a blanket long-lived immutable policy. Worker installation
     completes only after its critical shell assets validate; a runtime asset
     with an invalid response is retried once with cache reload, then fails and
     notifies the client. Missing base styles or a failed built resource triggers
     one cache-busted stylesheet retry before at most one session-guarded page
     reload, whether the failure is observed during resource loading, page load,
     or `controllerchange`.
   - Android distribution uses a Trusted Web Activity for the production
     `https://flow-math.com/` PWA under the immutable application ID
     `com.madebyneed.mathflow`. The Android wrapper keeps the Flow Math name,
     icon family, dark system-bar colors, `any` orientation, and the web app's
     own navigation, authentication, and update path. It targets Android API 36,
     requests no notification or location permission, and ships as a signed
     Android App Bundle. Domain verification is owned by
     `public/.well-known/assetlinks.json`; it contains the local upload
     certificate and, after Play App Signing is enabled, must also contain the
     Play app-signing certificate.
   - The page leads with Flow Math as a mathematical scene-authoring tool, not
     an AI generator. Direct notebook syntax is the precise production path;
     copying the production prompt into an AI the visitor already uses is an
     optional fast-start path for lowering the syntax barrier. Both paths end in
     the same editable scene, timeline, and 2D/3D renderer. The hero eyebrow
     explicitly identifies the product as a `Linear algebra scene authoring
     tool`. The hero headline keeps the broader scene-authoring identity while
     its supporting body may
     explain the prompt-to-AI quick-start path directly: paste the Flow Math
     prompt into an AI and describe the wanted math scene, then start a new
     visual line before explaining that bringing the result back begins
     immediate animation playback. On mobile, that same supporting copy removes
     the repeated `Flow Math` product name before `prompt` and drops the
     intensifier equivalent to `immediately`, keeping the two lines compact
     without changing their meaning. The page must not imply that a
     built-in model generates the lesson inside Flow Math. Animation remains the
     visible result and proof of the workflow, and the product still
     differentiates itself from a result-only calculator without making
     unsupported learning-outcome claims.
   - Clicking a lab entry action opens a compact login dialog before opening the
     lab. Example cards stay on the public page and open their read-only expanded
     demo instead of starting authentication.
   - The authentication dialog offers explicit sign-in and create-account modes
     in one focused card. Google remains first, while the email flow uses visible
     field labels, one mode-specific primary submit action, password visibility,
     inline error/loading feedback, and keyboard-safe dialog focus. Create-account
     mode reveals an eight-character password rule and a client-side confirmation
     field before calling the existing email signup endpoint. Email signup checks
     duplicate emails and creates a normal user account with a password hash;
     email login validates the stored password hash before creating a session.
   - Successful Google, email login, and email signup flows identify the user
     and capture a login completion event in PostHog when PostHog is configured.
   - A valid existing session skips the home screen after `/me` resolves and
     enters the lab immediately. The API persists an opaque 30-day session only
     in an HTTP-only, Secure, SameSite cookie; browser storage never receives a
     refresh token or session credential.
   - An authenticated lab always exposes a compact `My account` control beside
     the scene-tools trigger. Its menu shows the current name and email plus
     localized `Replay introduction` and sign-out actions. Replaying the
     introduction keeps the session, returns to the public home through the
     reverse of the home-to-lab transition, and lets the authenticated learner
     reopen the lab without another login. Successful sign-out deletes the server
     session, clears the client analytics identity, suppresses an immediate One
     Tap prompt, removes lab-only URL parameters, and returns to the Flow Math
     home screen without deleting local notebooks.
   - Authentication responses are non-cacheable. State-changing email-auth and
     logout requests reject origins outside the configured frontend allowlist,
     and a successful login rotates the current browser session.
   - Google login starts OAuth through the Flow Math API. The login request
     carries the initiating frontend URL, and the API keeps it only when its
     origin is in the configured frontend allowlist. After the callback, the
     learner returns to that same allowed local or production frontend with the
     Google completion marker; an arbitrary external return URL is never
     accepted.
   - On an unauthenticated home visit, the app checks the existing Flow Math
     session first and then asks Google Identity Services to show the
     browser-mediated One Tap/FedCM confirmation once when that browser/account
     is eligible. One Tap must request explicit account confirmation instead of
     silently auto-selecting an account. Dismissing or suppressing One Tap
     leaves the normal Google and email login dialog available.
   - A One Tap credential is verified by the Flow Math API for Google signature,
     issuer, audience, expiry, and a per-attempt nonce before it enters the same
     user/session path as the redirect-based Google login.
   - After Google OAuth returns with `auth=google`, the app enters the lab
     directly instead of showing the home screen again.
   - Users with `admin` or `operator` roles can enter without the ad-block
     access wall blocking the lab.
   - The ad-block access wall is never rendered while the current session role
     is unresolved. Ad-block detection begins only after session resolution and
     only for a confirmed non-exempt user, so exempt users never see a transient
     access-wall flash.
   - Shared URLs with `s=`/`state=` or URLs marked with `app=linear` skip the
     home screen and enter the lab directly.
   - Once inside the lab, URL state can update normally without forcing the home
     screen back.
   - Entering the lab from the home screen must initialize the same 3D scene as
     a direct lab URL or browser refresh.

1. Transform mode
   - Matrix input is the main control.
   - Presets fill or apply matrices.
   - History/current state explains determinant, rank, inverse, and matrix
     changes compactly.
   - Vectors, basis vectors, grids, relative grids, scalar constraints, dot
     products, areas, and volumes are visual overlays.

2. System/notebook mode
   - A single free-form notebook is the main input.
   - The existing cell editor remains the default while an explicit editor
     toggle can show a Monaco surface over the same notebook document and
     playback state.
   - Each line can declare an equation, vector, matrix, measurement, transform,
     caption, or panel-only note.
   - The vertical scrubber controls how much of the notebook has been executed.
   - As the scrubber moves, variables appear, equations draw, matrices transform,
     and captions appear in the scene.
   - Notebook stories can switch between a graph field for coordinate geometry
     and a centered algebra-board field for matrix cards and symbolic work.
   - The project-owned Flow Math course follows the eight-part visual curriculum
     defined in `docs/specs/visual-course.md`.

## UX Principles

- Dense, not decorative.
- The scene is the primary output.
- The right panel is an editor/control surface, not a marketing panel.
- On desktop, the right panel stays present as the authoring surface and has no
  manual hide control. Its scene-facing separator can be dragged or operated by
  keyboard to resize the panel within a usable 360–720 pixel range while
  retaining at least 360 pixels for the scene; the chosen width persists in the
  browser. While the pointer moves, a compositor-only boundary preview follows
  it without relaying out Monaco or resizing the WebGL renderer. The actual
  panel width, React state, and persistence commit together once on release;
  the complete app must not rerender for every pointer event. The notebook
  action header keeps AI/share/playback compact, while
  playback speed uses a low-height full-width utility row so the slider remains
  usable without consuming a full control band.
- Inside that panel, Monaco and the resource shelf form a stable vertical split.
  Notebook content never auto-resizes Monaco. A horizontal drag/keyboard
  separator owns editor height, the resource shelf consumes the remaining
  height, and only its selected tab panel scrolls; changing notebook lines or
  resource content must not shift the tab row.
- On mobile, the normal authoring lab is one stable vertical workspace: the
  scene occupies the upper pane and the notebook occupies the lower pane. The
  scene remains the largest single pane. The notebook title/actions and speed
  control use shallow mobile-only rows, Monaco fills all remaining space, and
  the resource tabs stay pinned to the lower edge. Examples, Course, and My
  notebooks remain visible as a compact tab row, but their content stays
  collapsed until the learner selects a tab. Selecting a tab opens its content
  as a gesture-driven bottom sheet over Monaco with a visible drag handle,
  multiple snap heights, internal scrolling, backdrop dismissal, and
  drag-down dismissal. Quick examples use a moderate snap, My notebooks uses a
  taller snap, and Course opens near full height with all chapters collapsed.
  The three tabs remain in the sheet footer; changing tabs swaps the content and
  animates to that resource's preferred height. The open footer uses the exact
  same tab metrics as the closed dock, and selection changes color only: it
  never adds a border, shadow, or height change that makes the footer jump.
  The drag handle stays a static horizontal bar while the sheet moves. The
  backdrop avoids blur over the live WebGL scene, and the sheet container,
  backdrop, and footer keep one explicit isolated stacking order. Opening a
  course chapter keeps the sheet at its tall snap. Applying a lesson or opening
  a saved notebook closes the sheet, and selecting the active tab again also
  collapses it.
  The mobile notebook surface is flat and edge-to-edge without card gutters.
  The visual viewport, rather than lingering editor focus, controls the
  keyboard-open split so dismissing the software keyboard always restores the
  normal scene/notebook ratio.
  Animation focus and student animation links keep the full-scene presentation.
- The lab scene topbar does not repeat the product title or subtitle after entry.
  Its utility row keeps language, support, donation, scene tools, and account
  controls, but omits the generic URL-copy action; lesson sharing remains in the
  notebook authoring toolbar where its scope is clear. On mobile the collapsed
  scene-tools and account controls use the open right side of that same first
  utility row instead of consuming a second row.
- Transient app toasts use one compact neutral glass surface at bottom center.
  Status is communicated by the small leading icon rather than a saturated
  full-card fill or heavy colored edge. Typography, border, and shadow remain
  restrained so a short confirmation reads as feedback, not an alert banner.
- Labels should be useful but not noisy.
- If a value is visible in an input, avoid duplicating it elsewhere unless it
  teaches something new.
- If a control can be inferred from hover or context, keep the always-visible UI
  minimal.
- Layout should not shift when values grow, vectors are added, or dimensions
  change.
- Fractions are preferred when they communicate exactness better than decimals.
- Decimal output should avoid trailing `.00` unless precision is necessary.

## Animation Principles

- Animation is not polish; it is the teaching medium.
- Direct input changes, matrix application, dimension changes, and camera view
  changes should feel smooth.
- When the notebook executes, variables should appear progressively.
- A learner should not have to infer an important operation from motion alone.
  Once its operands are visible, an operation-specific caption announces the
  exact multiplication, matrix application, sum update, or measurement before
  that action animates.
- While that authored action is actually running, a compact current-operation
  HUD embedded in the active checkpoint/segment dock states what the engine is
  computing. It derives
  its formula from the active parsed cell, preserves variable identity colors,
  and fades away when the action ends; it supplements rather than replaces the
  cue caption that explains why the operation matters.
- The right-panel vertical scrubber owns whole-notebook navigation. The bottom
  scene dock owns one selected checkpoint, inspect, or final segment at a time:
  it restores that segment, presents local 0-to-100-percent progress, and
  replays only that segment without replacing the caption's forward Next action.
- The natural final scene is also a learner-controlled review stop even though
  notebook authors do not append `checkpoint`: its caption exposes Previous/Next
  review, final-segment Replay, authored-view restore, and Hide/Show controls,
  while the completion badge appears only at the true end.
- Caption dwell follows human reading length: short cues stay quick, dense
  explanations remain long enough to read, and checkpoint-owned captions get a
  short one-second introduction before the checkpoint becomes learner-controlled
  unlimited reading time.
- Consecutive camera framing and overlay setup lines form one scene transaction.
  `view`/`zoom` share one camera progress while axes/grid/basis/coordinate/vector
  toggles switch together at that transaction boundary; they never fire as a
  rapid row-by-row sequence. Before the next visual math reveal, a toggle-only
  transaction receives one short shared settle so setup and evidence do not
  flash in simultaneously. An explicit duration or a non-setup cell deliberately
  breaks the transaction.
- Matrix transformations should animate from the previous visible state to the
  next visible state.
- On the algebra board, a named product whose left operand is an elementary
  matrix is an authored row-operation animation, not three unrelated cards.
  The engine derives the row operation from the matrix, moves the left operand
  into multiplication order, and walks through the affected row cell by cell.
  Each calculation, genuine cancellation strike, and changed result entry uses
  the same deterministic sequence instead of appearing all at once.
- A separate algebra-board mark can direct attention to one visible row, cell,
  pivot, struck entry, or upper-triangular staircase. These marks are teaching
  pointers rather than mathematical state and never change matrix layout.
- A field change is a presentation transition, not a mathematical reset. Matrix
  algebra may move onto the board and return to the graph without losing either
  environment state or the underlying coordinate scene.
- Scrubbing should be deterministic: the same scrub position produces the same
  visible state.
- Notebook playback without an opening scene block starts from the documented
  true-3D base scene. A leading scene-only setup block is document
  initialization: its explicit dimension and view are applied before the first
  visible frame, so a lesson beginning with bare `2d` opens directly in 2D
  instead of exposing a synthetic 3D-to-2D transition. Dimension/view commands
  after the first teaching cell remain authored animations. Mathematical
  dimension and camera direction remain separate, and the engine never infers
  either from visible content.
- The first lab view should open zoomed out enough to understand the whole
  working space at a glance.
- Automatic camera movement is disabled in every mode. Content changes, matrix
  transforms, rank changes, playback, and releasing a manual orbit never
  reframe the scene. Camera movement comes only from manual controls, view
  buttons, explicit notebook `view`/`zoom`/full-circle `orbit` cells, or the
  learner explicitly pressing Next to leave a learner stop and restore that
  stop's authored camera snapshot.
- AI-authored stories still make a deliberate rank-aware camera decision. When
  a 3D transform finishes in the XY plane and the following claim reads that
  planar output, the script normally synchronizes the action with
  `A with view 2d`; it keeps the 3D view when disappearing depth, an oblique
  surviving subspace, or free orbit is the evidence. A rank drop never justifies
  a bare dimension command that would reset the transformed scene.
- A learner checkpoint freezes the complete teaching claim: its caption,
  referenced objects, conclusion geometry, and optional focus remain visible
  until the learner advances. Its review controls may restore the previous
  checkpoint, replay only the current checkpoint segment, hide or restore the
  explanation, or continue to the next segment. Cleanup starts only after
  resume. The learner may orbit or zoom while stopped; pressing Next first
  returns smoothly to the camera position and target captured when the stop
  opened, then resumes the authored sequence.
- On mobile, the local playback dock stays in the graph's lowest safe-area-aware
  overlay slot. Checkpoint and final-scene review actions occupy one compact
  overlay immediately above that dock, and the caption remains in its upper
  scene slot. Both lower controls float over the graph instead of becoming a
  viewport footer, so entering or leaving a learner stop never reflows the
  caption or shifts the mathematical canvas.
- An implicit caption for the checkpoint's claim gets a short one-second
  introduction before Next appears. The checkpoint then supplies unlimited
  reading time, so authors do not add a redundant manual duration for that beat.
- A lighter `inspect` stop is reserved for 3D viewing ambiguity rather than
  conceptual review. It preserves the scene for free orbit and offers only Next,
  while a deliberate full-circle `orbit` cell may resolve ambiguity through
  authored motion before any learner stop.
- The last scene does not need a synthetic checkpoint or an `end` caption.
  Normal playback finishes on the mathematical conclusion and the player shows
  a separate completion state with a replay action.
- A rank drop is taught as disappearing extent: stage a live area/volume before
  the matrix action and keep it attached while the space collapses. A static
  equation for the surviving plane is optional conclusion geometry, not a
  substitute for the deformation.

## AI-Authored Notebook Policy

- The authoring toolbar names this workflow by its outcome (`Create with AI`
  and localized equivalents), not by the implementation detail `Copy prompt`.
  Opening it first shows a localized three-step guide, concrete request
  examples, and the normal draft/revision expectation; copying the production
  prompt is the guide's final explicit action rather than an unexplained
  toolbar side effect.
- The guide reads as a restrained notebook workflow rather than a generic AI
  promotion: it uses neutral surfaces and typography, a plain notebook icon,
  unboxed numbered steps, and request examples without decorative quotation
  marks, purple gradients, or competing tinted callouts.
- The copied prompt establishes a collaborative visual-lesson producer rather
  than a one-shot code generator. With no concrete request it introduces that
  role and asks for any available concept, problem, equation, or rough scene
  direction; with enough information it drafts immediately.
- The first generated notebook is explicitly a draft. Each draft or revision
  returns one complete paste-ready script plus one short invitation for changes,
  and later feedback preserves correct work while revising the requested math,
  staging, camera, timing, or emphasis. Iteration is the normal production flow.
- The copied AI prompt preserves the project's accumulated teaching cases, but
  organizes them as one rule-ID policy instead of repeating the same behavior
  across directing, camera, examples, and final QA.
- Mathematical and engine invariants outrank evidence, clarity, readability,
  polish, and brevity in that order. Directing defaults may bend for an explicit
  user request; correctness rules may not.
- A precedent is kept only when it captures a distinct renderer or teaching
  failure. It references its governing rule, demonstrates the smallest useful
  case, and tells the author to copy the principle rather than the numbers.
- The generated story is as short as the requested proof allows. There is no
  fixed scene count: different concepts receive separate beats when their
  visible evidence would otherwise compete.

## Scene Display Rules

- Basic grid and relative grid are separate toggles.
- Axes and basis vectors are separate concepts:
  - axes: coordinate frame orientation/reference;
  - basis vectors: editable vectors that can transform the grid.
- In system mode, display toggles should still apply. Basic grid, relative grid,
  axes, coordinates, vectors, and snapping must not silently stop working.
- Solver-owned intersection geometry has its own system-mode display toggle.
  It defaults off, so declaring equations shows only their lines or planes;
  an explicit notebook `solution(...)` cell still reveals its authored result.
- Colors assigned to variables should avoid axis colors when possible so lines,
  vectors, and axes remain distinguishable.
- Measurement colors are shared semantic colors, not vector colors:
  - dot/length: gold/yellow family;
  - area: magenta family;
  - volume/determinant: warm orange/red family.

## URL And Share State

- User state that affects the visible scene should be shareable through the URL.
- Camera position/target should be included when the user manually changes view.
- URL state should not break if older links omit newer fields.
- Keep encoded state compact enough to copy and share.
- URL share-state read/write is owned by `src/urlState.js` and must stay behind
  feature flags so it can be disabled when deployed camera state causes bad
  first-load zoom. While disabled, lab URLs keep `app=linear`/`lang` but do not
  read, write, or copy the encoded `s=` scene state.
- A notebook author can copy a dedicated student animation URL. It uses the
  independent `view=animation`/`lesson=` contract owned by `src/urlState.js`,
  carries only the notebook document, playback speed, locale, and payload
  version, clears unrelated query/hash state, and does not re-enable the
  disabled general `s=` scene-share path.
- Opening a valid student animation URL enters System/notebook mode directly in
  animation focus. The editor, transform panel, notebook library, and authoring
  controls are not rendered; the scene, captions, learner stops, local segment
  picker, scrubber, playback, and manual camera inspection remain available.
- A malformed or empty animation payload never opens a blank viewer. It falls
  back to the normal lab entry behavior without reading browser-local notebooks.

## Internationalization

- User-facing text should go through the i18n dictionary.
- Supported locales: Korean, English, Japanese, Chinese.
- Public search entry routes are deterministic: `/` is Korean and the
  `x-default`, while `/en/`, `/ja/`, and `/zh/` are English, Japanese, and
  Chinese. The legacy URL `lang` parameter remains readable for old lab and
  share links; otherwise an explicit locale path wins before saved/browser
  preference.
- When either the public landing page or the lab opens, its language selector
  lists that entry locale first and follows it with the remaining supported
  locales in their stable default order. Selecting another language changes the
  locale without reordering the already-open selector.
- If a new label, button, status, toast, or instruction appears in UI, add it to
  all locale dictionaries.
- Math notation itself should stay compact and language-neutral where possible.

## SEO / GEO

- Static `index.html` metadata, crawlable fallback content, and runtime metadata
  should describe the project consistently. The rendered page supports Korean,
  English, Japanese, and Chinese; the Korean document is the static default.
- Core discoverability terms include `Flow Math`, `linear algebra`, `linear
  algebra visualization`, `matrix transformation`, `systems of equations`,
  `matrix transformation visualizer`, `3D vector visualizer`, `Gaussian
  elimination`, `rank`, `null space`, `선형대수`, `선형대수 시각화`, `행렬
  변환 시각화`, `3D 벡터 시각화`, `가우스 소거법`, `행렬 랭크`, `영공간`,
  and `연립방정식 그래프`.
- Search copy should answer the product-selection intent ("why use this instead
  of a calculator?") and state the supported topic coverage for matrix
  transformations, determinant, rank/null space, and systems of equations.
  Keywords belong in natural headings, feature copy, and FAQ, never in hidden or
  repetitive blocks.
- Important product claims must be available as visible text, not only inside a
  canvas, animation, or metadata. Search and AI answer features receive the same
  people-first content as visitors.
- Each public locale route has a self-referencing canonical and the same
  reciprocal `hreflang` cluster. The sitemap contains one `<url>` entry per
  canonical locale route; Korean and `x-default` both point to the root.
- Production builds generate localized static entry HTML for `/en/`, `/ja/`,
  and `/zh/` so title, description, language, Open Graph data, structured data,
  and visible fallback copy are correct before JavaScript executes. The root
  remains the Korean source entry.
- Structured data should identify the site, free educational web application,
  learning resource, publishing organization, support contact, and visible FAQ.
  Every structured FAQ answer and feature must match content that visitors can
  read on the page.
- The root exposes `robots.txt`, `sitemap.xml`, and a share image. These are
  ordinary discovery assets; do not claim that a special AI schema or AI-only
  text file is required for generative search visibility.

## Monetization Slots

- Ads should live outside the main interaction surface.
- Do not place ad boxes inside the scene overlay cluster or inside the notebook
  body.
- The Flow Math home keeps one bottom banner outside the hero content. The lab
  keeps its banner slots outside the workspace, and animation-focus viewing hides
  them so ads never cover lesson playback controls. Desktop may show the lab's
  separate top and bottom units. At widths up to `760px`, the lab omits the top
  unit and limits the remaining bottom unit to a compact 50-pixel banner. A
  mobile unit remains collapsed while fill is pending, expands only after
  AdSense reports it filled, and smoothly collapses if it later reports
  unfilled instead of flashing an empty reservation or abruptly shifting the
  workspace.
- The AdSense bootstrap script is injected once by the first configured banner
  that approaches the viewport. Offscreen landing and lab banners do not load
  advertising JavaScript during initial rendering, and later banners reuse the
  existing script.
- The document head publishes the AdSense account meta tag, and the site root
  exposes the matching authorized-seller record at `/ads.txt`.
- The lab top banner and the shared home/lab bottom banner use separate AdSense
  display-unit slot IDs. Desktop configured units reserve a responsive
  horizontal-banner region and keep a small advertising disclosure visible
  while fill resolves; the mobile lab uses the collapsed-until-filled behavior
  above.
- Donation UI should be visible but not obstruct math interaction.

## Support And Reports

- Bug/report links should open an email to `privacy@flow-math.com`.
- Report emails should include the current URL when possible so shared scene
  state can be reproduced.
