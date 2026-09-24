# riscv-cc — the hosted RISC-V C compile service

The endpoint the lite Code tab's **C route** for the RISC-V console talks to.
riscv32 is already programmable from **assembly** in the browser (no service); C
needs a real cross-compiler, which is too heavy for the browser, so it runs
here. This is the reference server for the v1 `/compile` contract that
`overlay/scratch-gui/src/lib/bw-debug/riscv-compile.js` speaks — deploy it, point
the app at it, and C lights up **with no change to the browser code** (exactly
how the FPGA synthesis client waited for `synth.crispstro.be`).

## What it does

`POST /compile` takes C source and returns a loadable rv32 image:

```
{ "contract": 1, "source": "int main(){ return 0; }" }
   →
{ "contract": 1, "ok": true,
  "image": { "entry": 4096, "segments": [ { "addr": 4096, "bytes": "<base64>" } ] } }
```

It runs `riscv64-unknown-elf-gcc` in `rv32imac_zicsr`/`ilp32` mode over the
learner's C plus the freestanding runtime in `runtime/` (a `crt0.S`, a linker
script placing `.text` at `0x1000` / data at `0x8000`, and a tiny `printf`/`puts`
over the machine's ECALL console — `a7=64` write, `a7=93` exit). The result is
the same `{entry, segments}` image the local assembler and the shipped clang
fixtures boot. A compile error comes back as the program's, with `gcc`'s log.

`GET /health` reports the toolchain version.

## Security — a build box, not a REPL

It hands **untrusted C to a compiler**, which is a real attack surface, so:

- it **never runs** the compiled program — it only compiles and links;
- it links **no hosted libc** (only the tiny freestanding runtime here);
- each compile runs in a fresh temp dir, wall-clock-bounded (15 s) and
  output-size-bounded (256 KiB source, 4 MiB tool output);
- **the container is the isolation boundary** — non-root, read-only root FS with
  a tmpfs `/tmp`, and it needs no network at request time.

Run it with those flags enforced:

```
docker build -t riscv-cc services/riscv-cc
docker run --rm -p 8080:8080 \
  --read-only --tmpfs /tmp:rw,size=64m --cap-drop=ALL --pids-limit=256 \
  --memory=512m riscv-cc
```

Deploy the same image to any container host — **`DEPLOY.md` has one-command
recipes** for Fly.io (a `fly.toml` is included), Railway, Cloud Run, and a plain
VPS, plus how to wire and verify it. Put it behind TLS and, if it is public, a
rate limit — compilation is CPU-heavy.

## Wiring the app to it

The app reads the endpoint from a build-time value, the twin of the FPGA
`BW_SYNTHESIS_ENDPOINT`. Set it to your deployment's base URL (no trailing
`/compile` — the client appends that):

```
BW_RISCV_CC_ENDPOINT=https://your-riscv-cc.example.com  npm run build
```

Until it is set, the Code tab's C route **refuses by name** (`no-compile-service`)
rather than pretending — assembly still runs in the browser with no service.

## Self-test (needs the toolchain)

```
node services/riscv-cc/test.mjs     # compiles a few programs, checks the image
```

Skips cleanly if `riscv64-unknown-elf-gcc` is not installed.
