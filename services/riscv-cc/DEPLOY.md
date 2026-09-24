# Deploying riscv-cc

`riscv-cc` is the hosted RISC-V C-compile service (see `README.md`). Deploy the
container anywhere, then point the app at it with **one** build-time value:

```
BW_RISCV_CC_ENDPOINT=https://YOUR-DEPLOYMENT/   npm run build
```

(No trailing `/compile` — the client appends it.) Until that value is set, the
Code tab's **▶ Run C on RISC-V** button refuses by name; assembly keeps running
in the browser with no service. There is no other code change.

The image is small and stateless, so any container host works. Pick one.

---

## 0. Build the image (all recipes start here)

```
cd services/riscv-cc
docker build -t riscv-cc .
```

Smoke-test it locally before you ship it:

```
docker run --rm -p 8080:8080 \
  --read-only --tmpfs /tmp:rw,size=64m --cap-drop=ALL --pids-limit=256 --memory=512m \
  riscv-cc &
curl -s localhost:8080/health
curl -s -XPOST localhost:8080/compile -H 'content-type: application/json' \
  -d '{"contract":1,"source":"int printf(const char*,...);int main(){printf(\"hi %d\\n\",42);return 0;}"}' \
  | head -c 120 ; echo
```

`/health` returns the gcc version; `/compile` returns `"ok":true` with a base64
image. The hardening flags above are not optional — this compiles untrusted C,
so keep the container non-root, read-only, capability-dropped, and bounded.

---

## 1. Fly.io — `fly deploy` (recommended: cheap, scales to zero)

A `fly.toml` is included. From `services/riscv-cc/`:

```
fly launch --no-deploy --copy-config --name YOUR-APP     # first time only
fly deploy
```

`fly.toml` already sets `auto_stop_machines`/`min_machines_running = 0` (scale to
zero when idle — you pay for compile seconds, not idle time), 512 MB, and the
`/health` check. Your endpoint is `https://YOUR-APP.fly.dev`. Then:

```
BW_RISCV_CC_ENDPOINT=https://YOUR-APP.fly.dev  npm run build   # in the app repo
```

## 2. Railway — from the Dockerfile

```
railway init                       # or use the dashboard: New → Deploy from repo
railway up --detach                # builds services/riscv-cc/Dockerfile
railway domain                     # prints the public URL
```

Set the app build with the printed URL as `BW_RISCV_CC_ENDPOINT`. Railway sleeps
idle services on the hobby plan, which suits a compile box.

## 3. Google Cloud Run — one command, scales to zero

```
gcloud run deploy riscv-cc \
  --source services/riscv-cc \
  --region europe-west1 \
  --memory 512Mi --cpu 1 --concurrency 4 --max-instances 3 \
  --allow-unauthenticated --port 8080
```

Cloud Run prints `Service URL: https://riscv-cc-….run.app` — that is your
`BW_RISCV_CC_ENDPOINT`. It scales to zero between compiles. (Cloud Run runs the
container as a non-root sandbox already; the Dockerfile's `USER 10001` and the
in-process bounds still apply.)

## 4. A VPS / anything with Docker

```
docker run -d --name riscv-cc --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  --read-only --tmpfs /tmp:rw,size=64m --cap-drop=ALL --pids-limit=256 --memory=512m \
  riscv-cc
```

Put it behind your reverse proxy with TLS (Caddy/nginx) and, since it is a
compile box, a rate limit — e.g. Caddy:

```
riscv-cc.example.com {
    reverse_proxy 127.0.0.1:8080
    rate_limit { zone cc { key {remote_host} events 30 window 1m } }
}
```

`BW_RISCV_CC_ENDPOINT=https://riscv-cc.example.com`.

---

## Wiring the app, and verifying it end to end

1. Rebuild the app with the endpoint set (see any recipe above). On the
   deployable/Pages build this is one env var beside `BW_SYNTHESIS_ENDPOINT`.
2. Open the app, pick **RISC-V (RV32IMA)**, switch the Code tab to **C**, write
   a program, and press **▶ Run C on RISC-V**. The RV32IMA console shows its
   output. A compile error appears in the status line naming the line; an
   unreachable service says so — neither is a silent failure.
3. If the button still refuses with `no-compile-service`, the build did not pick
   up `BW_RISCV_CC_ENDPOINT` — it is read at build time, not runtime.

## Operating notes

- **CORS** is already `*` on the service, so the browser can call it directly.
  If you'd rather not expose it publicly, proxy `/compile` and `/health` under
  the app's own origin instead and set the endpoint to that path.
- **Cost** is compile-seconds only on scale-to-zero hosts; a cold start adds a
  second or two to the first compile after idle.
- **Upgrades**: rebuild the image (it pins nothing but the base distro's
  toolchain); the v1 `/compile` contract is stable, so the app needs no change.
- **It never runs user code** — it only compiles and links. Keep it that way:
  do not add an execution endpoint.
