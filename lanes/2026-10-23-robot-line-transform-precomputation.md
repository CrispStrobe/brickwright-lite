# Precompute invariant Robot Lab line transforms

DONE (source candidate; browser qualification pending) — Codex Robot Lab
integration, owner-authorized continuation, 2026-10-23.
Base `7c40d9cb8a47e9ccea435dee75098424495faa5e`; isolated branch
`lane/robot-line-transform-source-20261023` (claim merged in PR1310).

Own only regular/conditional line shader transforms and per-draw uniform
preparation in `overlay/scratch-gui/src/lib/bw-sim/view/instanced-parts.js`,
its generated package mirror when integration materializes it,
`test/bw-sim-instancing.test.mjs`, `test/bw-sim-line-transform.test.mjs` if
needed, and this claim. Extend the existing float32-upload lane while preserving
its cache repair. Other renderer, measurement, transport, model, API and native
owners retain their scopes.

Retained comparison PR1306 passed runtime preflight and complete Sine save/reopen;
Quartermaster failed the unchanged 324-second deadline before 100 simulated
seconds. High browser CPU and repeated source matrix products motivate this
investigation; neither establishes a measured cause or speed gain.

Lift projection/model-view products invariant within a draw out of line vertex
shaders. Bind the current camera and refreshed model-view matrix in the actual
material draw callback, including successive objects sharing one ShaderMaterial;
request a fresh uniform upload for every draw. Preserve regular projection and
conditional-edge visibility, geometry, material appearance, resolution, camera
navigation, float32 instance/cache bytes and genuine movement/color/visibility.
No dependency/pin, scene/model, solver, VM/clock, viewport, launch, quality,
resource, physical oracle, deadline, baseline or threshold change.

Merge this claim before implementation. Retire failed qualification-only PR1306
as unqualified after terminal originals are retained and independently classified;
preserve its branch and commits. Normally compose the existing model parent and
this merged claim before repair. Keep consumed producer sources immutable while
their consumers are active.

Require noncommuting camera/projection/model/instance controls, conditional
visible/hidden edges, camera/model changes, shared-material draws and stale or
missing-uniform mutations. Preserve existing instancing controls. Then bind a
fresh official frontend and complete actual Sine/Quartermaster mechanics, manual
interaction, save and fresh-context reopen using the original viewport, rendering,
physical assertions, deadlines and outer budget. Every enabled exact-head check
must pass before normal matched-head integration; verify reviewed/predicted/landed
tree and parents. No FPS, environment-causation, physical-accuracy or hardware
claim follows from this source optimization.

The candidate computes projection/model-view once in the material draw callback,
reuses its Matrix4 storage and requests a fresh shared-material uniform upload.
Five focused actual-Three 0.186.1 controls pass without skips; the unfixed parent
and five actual-source mutations are rejected (missing upload, stale first draw,
reversed matrices and omitted regular/conditional instance transforms). Source
bytes were restored exactly before the passing final run. These are isolated
source controls; current whole-GUI CI and full fresh browser qualification remain
required. The earlier Quartermaster failure remains retained and unqualified; no
measured speed gain or resolution is inferred from this source change.

The new controls are included in the existing registered instancing suite; no
GUI import allowlist or dependency permission is broadened.
