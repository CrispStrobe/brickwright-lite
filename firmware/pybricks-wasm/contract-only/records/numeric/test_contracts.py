#!/usr/bin/env python3
# SPDX-License-Identifier: BSD-3-Clause
# Copyright (c) 2026 Brickwright contributors
"""Synthetic contract tests; no upstream headers or implementations needed."""
import ctypes
import json
from pathlib import Path
import random
import shutil
import subprocess


ROOT = Path(__file__).resolve().parent
BUILD = ROOT / "test-build"
LOG = ROOT / "access-log.json"


def record(action, details):
    data = json.loads(LOG.read_text())
    data["accesses"].append({"action": action, "details": details})
    LOG.write_text(json.dumps(data, indent=2) + "\n")


def run(command):
    record("compiler invocation", command)
    subprocess.run(command, cwd=ROOT, check=True)


def exact_quotient(a, b, c):
    # Python integers are arbitrary precision; divide magnitudes then set sign.
    product = a * b
    magnitude = abs(product) // abs(c)
    return -magnitude if (product < 0) != (c < 0) else magnitude


def cases():
    result = []
    # Exact domain product boundary and int32 quotient boundaries, all signs.
    for a, b, c in [
        (1 << 30, 1 << 17, 1 << 16),
        (1 << 30, (1 << 17) - 1, 1 << 16),
        ((1 << 31) - 1, 65536, 65536),
        (7, 5, 3), (1, 1, 65536), (0, (1 << 31) - 1, 1),
    ]:
        for sa in (-1, 1):
            for sb in (-1, 1):
                for sc in (-1, 1):
                    candidate = (sa * a, sb * b, sc * c)
                    q = exact_quotient(*candidate)
                    if -(1 << 31) <= q < (1 << 31):
                        result.append(candidate)
    result.extend([(-(1 << 31), 65536, 65536),
                   (-(1 << 31), 1, 1), (0, -(1 << 31), -65536)])
    rng = random.Random(20260930)
    while len(result) < 20000:
        a = rng.randint(-(1 << 31), (1 << 31) - 1)
        b = rng.randint(-65536, 65536)
        c = rng.choice((-1, 1)) * rng.randint(1, 65536)
        if abs(a * b) <= (1 << 47):
            q = exact_quotient(a, b, c)
            if -(1 << 31) <= q < (1 << 31):
                result.append((a, b, c))
    return result


def main():
    record("test runner inputs", ["test_contracts.py", "access-log.json"])
    BUILD.mkdir(exist_ok=True)
    stub = BUILD / "pbio"
    stub.mkdir(exist_ok=True)
    # Independently authored declaration matching the contract, not upstream.
    (stub / "int_math.h").write_text(
        "#include <stdint.h>\n"
        "int32_t pbio_int_math_mult_then_div(int32_t, int32_t, int32_t);\n"
    )
    record("generated synthetic fixture", "test-build/pbio/int_math.h")
    assertions = ['#include "integer_width.h"']
    for k in range(65):
        value = f"UINT64_C({(1 << k) - 1})"
        assertions.append(f"enum {{ width_{k} = MP_IMAX_BITS({value}) }};")
        assertions.append(f"typedef char check_{k}[(width_{k} == {k}) ? 1 : -1];")
    for k in (0, 1, 8, 15, 31, 32, 47, 63):
        value = f"INT64_C({(1 << k) - 1})"
        assertions.append(
            f"typedef char signed_{k}[(MP_IMAX_BITS({value}) == {k}) ? 1 : -1];"
        )
    assertions.extend([
        "typedef char full_width[(MP_IMAX_BITS(UINT64_MAX) == 64) ? 1 : -1];",
        "static int zero_width = MP_IMAX_BITS(0);",
        "static int full_width_value = MP_IMAX_BITS(UINT64_MAX);",
        "int main(void) { return zero_width != 0 || full_width_value != 64; }",
    ])
    (BUILD / "width_test.c").write_text("\n".join(assertions) + "\n")
    record("generated synthetic fixture", "test-build/width_test.c")
    compilers = []
    for name in ("clang", "gcc"):
        record("public compiler executable discovery", name)
        compiler = shutil.which(name)
        if compiler:
            compilers.append((name, compiler))
    if not compilers:
        raise RuntimeError("No GCC/Clang compiler found")
    samples = cases()
    for name, compiler in compilers:
        flags = [compiler, "-std=c99", "-Wall", "-Wextra", "-Werror", "-pedantic"]
        width_exe = BUILD / f"width-{name}"
        run(flags + ["-I", str(ROOT), str(BUILD / "width_test.c"), "-o", str(width_exe)])
        record("generated test executable invocation", str(width_exe))
        subprocess.run([str(width_exe)], cwd=ROOT, check=True)
        for optimization in ("-O0", "-O2"):
            lib_path = BUILD / f"numeric-{name}-{optimization[1:]}.so"
            run(flags + [optimization, "-shared", "-fPIC", "-I", str(BUILD),
                         str(ROOT / "numeric_scale.c"), "-o", str(lib_path)])
            record("ctypes load of generated synthetic library", str(lib_path))
            library = ctypes.CDLL(str(lib_path))
            function = library.pbio_int_math_mult_then_div
            function.argtypes = [ctypes.c_int32] * 3
            function.restype = ctypes.c_int32
            for a, b, c in samples:
                actual = function(a, b, c)
                expected = exact_quotient(a, b, c)
                assert actual == expected, (a, b, c, actual, expected)
            print(f"{name} {optimization}: {len(samples)} exact quotient checks passed")
        print(f"{name}: all 65 unsigned widths, signed widths, enums and static initializers passed")
    record("test completion", {"numeric_cases_per_build": len(samples),
                                "unsigned_widths": 65,
                                "compilers": [name for name, _ in compilers]})


if __name__ == "__main__":
    main()
