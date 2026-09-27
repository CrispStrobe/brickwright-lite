// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Brickwright contributors

// Emscripten's musl has no <sys/cdefs.h>. Pybricks' pbio/util.h includes it
// only for optional helpers (__containerof) that it falls back from when they
// are absent, so an empty header is all that is needed.

#ifndef BRICKWRIGHT_COMPAT_SYS_CDEFS_H
#define BRICKWRIGHT_COMPAT_SYS_CDEFS_H
#endif
