# pascal-ack-compiler — hosted ACK compile endpoint

Turns **Pascal source** into an **8086 MS-DOS `.COM`** with
`ack -mmsdos86 -O`, over HTTP, for the brickwright-lite **code tab**.

## Why this exists (host cross-compiler, not compile-on-DOS)

ACK (the Amsterdam Compiler Kit, BSD-3) is a **host** cross-compiler: its
`msdos86` back end runs on a modern machine and *emits* 8086 programs — it does
**not** run on the 8086. So Pascal-via-ACK cannot compile on lite's in-browser
DOS bench (that path, `dos-compile.js`, is only for compilers that are
themselves DOS programs, e.g. GW-BASIC). It must compile on a **server** and
return a `.COM` the bench then runs. This service is that server.

It deliberately mirrors the existing hosted **assembler** (`stc-compiler
/assemble`) that lite already speaks to, so the client has one shape to learn.

## Contract

```
POST /compile      {"source": "<pascal>"}
  200 {"success": true,  "format": "com", "bytes": N, "base64": "<.COM>"}
  200 {"success": false, "errors": [{"line": 27, "message": "..."}], "error": "<stderr>"}
  500 {"success": false, "error": "<transport fault: no ack / timeout>"}

GET  /health       -> {"ok": true, "ack": "<path>"}
```

`success:false` with `errors[]` is the learner's Pascal being rejected (the
client shows `L27: ...`). A `500` is the *server's* problem (ACK missing or a
timeout) and is never shown as a syntax error. CORS is open (`*`) by default;
set `CORS_ORIGIN` to lock it down.

## Layout

| file | what |
|------|------|
| `lib/compile-pascal.js` | the core: source → `.COM`, and the response body. No HTTP. |
| `server.js`            | dependency-free `node:http` server (local + Docker). |
| `api/compile.js`       | Vercel serverless entry (same core). |
| `build-ack.sh`         | build ACK's `msdos86` platform → a staging tree. |
| `Dockerfile`           | two-stage: build ACK, then serve. Built + published on CI. |
| `DEPLOY.md`            | one-command deploys from the GHCR image + the two-line un-gate. |
| `test/`                | unit tests against a real ACK (skip if none built). |

The image itself is built and pushed to GHCR by
`.github/workflows/pascal-ack-image.yml`, which also smoke-tests the published
image (compiles a Pascal program and asserts a `.COM` comes back).

The service finds `ack` via the environment: **`ACKDIR`** (ACK's staging root;
`ACK_BIN` is derived as `$ACKDIR/bin/ack`) or **`ACK_BIN`** directly.

## Run it locally

```bash
# 1. Build ACK once (~1 GB build tree, a few minutes; needs
#    build-essential flex bison lua5.3 lua-posix python3):
ACK_WORK=/big/scratch bash build-ack.sh      # prints the ACKDIR to export

# 2. Serve:
ACKDIR=/big/scratch/ack/.obj/staging node server.js   # :8080

# 3. Compile a program:
curl -s localhost:8080/compile \
  -H 'content-type: application/json' \
  -d '{"source":"program h(output);begin writeln('\''hi'\'') end."}' \
  | node -e 'const b=JSON.parse(require("fs").readFileSync(0));require("fs").writeFileSync("h.com",Buffer.from(b.base64,"base64"))'
# h.com is an 8086 DOS .COM (runs on lite's bench, or run-dos.mjs --preset xt)
```

## Deploy

**The image is built and published for you, on CI.**
`.github/workflows/pascal-ack-image.yml` builds this `Dockerfile` (ACK from
source at the pinned commit) on GitHub Actions, pushes it to the GitHub
Container Registry, and a smoke-test job then pulls the pushed image and proves
it compiles Pascal. So you do **not** build ACK to deploy — pull the published
image:

```
ghcr.io/crispstrobe/pascal-ack-compiler:latest
ghcr.io/crispstrobe/pascal-ack-compiler:sha-<gitsha>   # immutable, per build
```

```bash
docker run -d -p 8080:8080 ghcr.io/crispstrobe/pascal-ack-compiler:latest
curl -fsS localhost:8080/health
```

**One command from live: see [DEPLOY.md](./DEPLOY.md)** — one-command deploys of
this GHCR image to Fly.io, Google Cloud Run, or a plain `docker run` VM, plus the
exact two-line un-gate that makes the lite code-tab Pascal button appear.

**Build it yourself (only if you must).** The same two-stage `Dockerfile` builds
locally — it needs a roomy build host (ACK is a ~1 GB from-source C build):

```bash
docker build -t pascal-ack-compiler .
docker run -p 8080:8080 pascal-ack-compiler
```

**Vercel.** `api/compile.js` + `vercel.json` are provided, but a stock Vercel
build **cannot compile ACK from source** in a serverless build step. To use
Vercel you must ship a prebuilt `ack` staging tree with the function (as
included files, with `ACKDIR` pointed at it) or deploy the container image to a
Vercel Function that supports OCI images. The GHCR image + DEPLOY.md route avoids
this and is the path this README recommends. **No production endpoint has been
stood up yet** — the URL does not exist until you run one of the DEPLOY.md
commands.

## Wiring into lite (once deployed)

The client route is already implemented and tested:
`overlay/scratch-gui/src/lib/bw-debug/dos-toolchain-routes.js` →
`runHostedToolchain('pascal-ack', source, {endpoint, fetch})`. Two steps flip
it on:

1. Set the endpoint. Either bake it into the table
   (`HOSTED_TOOLCHAINS['pascal-ack'].endpoint = 'https://<host>/compile'`) or
   inject it per call as `opts.endpoint`.
2. After a real end-to-end run against the deployed endpoint, set
   `verified: true` on that route. `hostedToolchainReady('pascal-ack')` then
   returns true and the **code-tab button un-gates itself** — until both an
   endpoint *and* `verified` hold, the button is intentionally hidden so there
   is no dead/broken option.

## Licensing

ACK is **BSD-3-Clause** (see the media-lab `projects/ack/COPYING.ACK`); its
`.COM` output carries the same permissive terms. This wrapper is MIT. No GPL.
