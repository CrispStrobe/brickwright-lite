# Pascal→.COM compile endpoint: builds ACK's msdos86 platform, then serves it.
#
# Two stages: the builder compiles ACK (heavy, ~1 GB of intermediate tree); the
# runtime carries only the staging tree + node server. The result is a small
# image that answers POST /compile with an 8086 MS-DOS .COM.
#
#   docker build -t pascal-ack-compiler .
#   docker run -p 8080:8080 pascal-ack-compiler
#   curl -s localhost:8080/health

# ---- build ACK ----
FROM debian:bookworm-slim AS ack
ARG ACK_COMMIT=7afa32a0a0f13e865fa2e8104e442689005cd627
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential flex bison lua5.3 lua-posix python3 git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build
RUN git clone https://github.com/davidgiven/ack.git ack \
    && git -C ack fetch --depth 1 origin "$ACK_COMMIT" \
    && git -C ack checkout -q "$ACK_COMMIT" \
    && sed -i 's/^DEFAULT_PLATFORM ?= .*/DEFAULT_PLATFORM ?= msdos86/' ack/Makefile \
    && sed -i 's/^PLATS = all/PLATS = msdos86/'                        ack/Makefile \
    && ( cd ack && make -j"$(nproc)" )

# ---- runtime ----
FROM node:20-bookworm-slim
# ACK's back ends are invoked by the driver; keep the staging tree intact.
COPY --from=ack /build/ack/.obj/staging /opt/ack
ENV ACKDIR=/opt/ack \
    ACK_BIN=/opt/ack/bin/ack \
    PORT=8080
WORKDIR /app
COPY package.json server.js ./
COPY lib ./lib
COPY api ./api
EXPOSE 8080
HEALTHCHECK CMD node -e "fetch('http://localhost:'+ (process.env.PORT||8080) +'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
