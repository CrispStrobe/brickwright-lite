/* SPDX-License-Identifier: BSD-3-Clause
 * Copyright (c) 2026 Brickwright contributors
 */
#include <stdint.h>
#include <pbio/int_math.h>

/* Documented domain: c != 0, |a*b| <= 2^47, |c| <= 2^16,
 * and the quotient fits int32_t. Widen before multiplication so that
 * intermediate arithmetic is exact. C99 division truncates toward zero.
 */
int32_t pbio_int_math_mult_then_div(int32_t a, int32_t b, int32_t c) {
    return (int32_t)(((int64_t)a * (int64_t)b) / (int64_t)c);
}
