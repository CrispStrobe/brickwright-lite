# The hosted RISC-V C-compile service. A build box, not a REPL: it compiles
# untrusted C but never runs it, links no hosted libc, and the container is the
# isolation boundary — non-root, read-only root FS with a tmpfs /tmp, no network
# needed at request time (the toolchain is baked in).
FROM debian:bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc-riscv64-unknown-elf nodejs ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /srv
COPY server.mjs ./server.mjs
COPY runtime ./runtime

# Drop privileges; the app only needs to read /srv and write a tmpfs /tmp.
RUN useradd -r -u 10001 rvcc
USER 10001

ENV PORT=8080
EXPOSE 8080

# Recommended run flags (compose/k8s/fly equivalent):
#   --read-only --tmpfs /tmp:rw,size=64m --cap-drop=ALL --network=none-at-rest
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+ (process.env.PORT||8080) +'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
