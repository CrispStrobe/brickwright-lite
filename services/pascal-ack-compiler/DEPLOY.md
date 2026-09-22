# Deploy the Pascal-via-ACK compile endpoint

The image is built and published by CI — `.github/workflows/pascal-ack-image.yml`
builds `Dockerfile` (which compiles ACK from source at the pinned commit) on
GitHub Actions and pushes it to the GitHub Container Registry, then a smoke-test
job pulls the pushed image and proves it compiles Pascal. So there is nothing to
build to deploy: **pick a host, run one command against the published image, and
you have a live `/compile` endpoint.**

The published image:

```
ghcr.io/crispstrobe/pascal-ack-compiler:latest      # newest build on main
ghcr.io/crispstrobe/pascal-ack-compiler:sha-<gitsha> # a specific build, immutable
```

It listens on `$PORT` (default `8080`), answers `GET /health` and
`POST /compile {"source":"<pascal>"}` → `{success, format:"com", bytes, base64}`
(the contract is in `README.md`). CORS is open by default; set `CORS_ORIGIN` to
lock it to the lite origin.

> GHCR note: images pushed by the repo's `GITHUB_TOKEN` are **private** by
> default. Either make the package public once (GitHub → your profile →
> Packages → `pascal-ack-compiler` → Package settings → *Change visibility* →
> Public — then every host below can pull anonymously), or give each host a
> read token (`docker login ghcr.io -u <user> -p <PAT-with-read:packages>`, or
> the host's registry-credentials feature). Public is simplest for a stateless
> compile endpoint that ships no secrets.

---

## One command per host

### Fly.io

```bash
fly launch --now --image ghcr.io/crispstrobe/pascal-ack-compiler:latest \
  --name pascal-ack --internal-port 8080
```

`--now` builds nothing and deploys the pulled image immediately; Fly assigns a
public `https://pascal-ack.fly.dev`, so your endpoint is
`https://pascal-ack.fly.dev/compile`. This assumes the GHCR package is public
(see the GHCR note above) — the simplest setup for a stateless compile endpoint.
To pull a *private* GHCR image instead, log Fly's builder in first
(`flyctl auth docker` uses your local Docker creds, so `docker login ghcr.io -u <user> -p <PAT>` beforehand),
or mirror the image into Fly's own registry (`registry.fly.io`).

### Google Cloud Run

```bash
gcloud run deploy pascal-ack \
  --image ghcr.io/crispstrobe/pascal-ack-compiler:latest \
  --port 8080 --allow-unauthenticated --region us-central1
```

Cloud Run prints a `https://pascal-ack-<hash>-uc.a.run.app` URL; your endpoint is
that URL + `/compile`. (Cloud Run pulls from GHCR directly for a public package;
for a private one, mirror it to Artifact Registry first or attach a pull secret.)

### Plain `docker run` (any VM)

```bash
docker run -d --restart=unless-stopped -p 8080:8080 \
  --name pascal-ack ghcr.io/crispstrobe/pascal-ack-compiler:latest
```

Your endpoint is `http://<vm-host>:8080/compile` (put it behind a TLS reverse
proxy for a browser client). Confirm it:

```bash
curl -fsS http://localhost:8080/health
curl -fsS -X POST http://localhost:8080/compile \
  -H 'content-type: application/json' \
  -d '{"source":"program h(output);begin writeln(1+1) end."}' | head -c 200
```

A `{"success":true,"format":"com",...}` back means the endpoint is live — this is
exactly what the CI smoke test asserts against the same image.

---

## Un-gate the code-tab Pascal button (after the endpoint is live)

The lite client route is already implemented and tested
(`overlay/scratch-gui/src/lib/bw-debug/dos-toolchain-routes.js`,
`runHostedToolchain('pascal-ack', …)`); it is deliberately hidden until both an
endpoint URL **and** a verified live run exist, so there is never a dead button.
Once your deploy above answers `/compile`, edit **two lines** in
`HOSTED_TOOLCHAINS['pascal-ack']`:

```js
export const HOSTED_TOOLCHAINS = Object.freeze({
    'pascal-ack': {
        id: 'pascal-ack', label: 'Pascal (ACK)', language: 'pascal', kind: 'hosted',
        source: 'ack',                         // media-lab ACK project (BSD-3), built on the host
        endpoint: 'https://<your-host>/compile',   // ← 1. the deployed /compile URL (was null)
        outputFormat: 'com', verified: true        // ← 2. set true AFTER a real end-to-end run
    }
});
```

- **Line 1 — `endpoint`:** set it to the exact `/compile` URL your host printed
  (e.g. `https://pascal-ack.fly.dev/compile`). It was `null`.
- **Line 2 — `verified`:** set `true` **only after** you have compiled and run a
  real Pascal program end-to-end against that deployed endpoint (send a program
  through the code tab, run the returned `.COM` on the bench). `verified` is a
  claim about a live run, not about the code — do not flip it on the strength of
  this doc.

`hostedToolchainReady('pascal-ack')` then returns true and the **code-tab Pascal
button un-gates itself**. Because `overlay/scratch-gui/…` is a twinned tree,
mirror the edit to `packages/` and `git add -f` it (see the repo's twinning
rules) in the same commit.

That is the whole remaining path: **deploy (one command) → set the two lines →
Pascal appears in the code tab.**
