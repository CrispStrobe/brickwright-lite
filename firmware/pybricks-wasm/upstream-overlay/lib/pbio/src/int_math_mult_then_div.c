// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors

// Stand-in for pbio_int_math_mult_then_div() from Pybricks'
// lib/pbio/src/int_math.c, whose upstream body is adapted from a Stack
// Overflow answer under a share-alike licence. The build compiles a copy of
// int_math.c with that one function removed (strip_function.py) and this file
// in its place. Written from the documented contract and Pybricks' own test
// (lib/pbio/test/src/test_math.c compares against the 64-bit a * b / c), not
// from the upstream body.
//
// Upstream avoids a 64-bit division for speed on Cortex-M0/M4 hubs. In
// WebAssembly 64-bit integer arithmetic is native, so the direct form is used.

#include <stdint.h>

#include <pbio/int_math.h>

/**
 * Multiplies two numbers and scales down the result.
 *
 * The result is @p a * @p b / @p c, truncated toward zero like integer
 * division. Upstream's documented domain: |a * b| <= 2**47, |c| <= 2**16 and
 * a result that fits in 32 bits.
 */
int32_t pbio_int_math_mult_then_div(int32_t a, int32_t b, int32_t c) {
    return (int32_t)((int64_t)a * b / c);
}
