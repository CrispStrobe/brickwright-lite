#!/usr/bin/env python3
# SPDX-License-Identifier: BSD-3-Clause
# Copyright (c) 2026 Brickwright contributors
"""Copy a C source file with one top-level function definition removed.

usage: strip_function.py IN.c OUT.c FUNCTION MARKER

Removes the definition of FUNCTION together with the doc comment directly
above it: from the "/**" that opens the comment to the first line that is
exactly "}" after the signature. MARKER must occur in the removed range (so
the right text was removed) and nowhere in the output, and the output must
not mention FUNCTION being defined. Nothing from the removed range is
printed or written.
"""

import re
import sys


def main():
    src, dst, func, marker = sys.argv[1:5]
    lines = open(src, encoding="utf-8").read().split("\n")
    sig = re.compile(r"^[A-Za-z_][\w \*]*\b" + re.escape(func) + r"\s*\([^;]*\)\s*\{\s*$")
    starts = [i for i, ln in enumerate(lines) if sig.match(ln)]
    if len(starts) != 1:
        sys.exit(f"strip_function: expected one definition of {func}, found {len(starts)}")
    start = end = starts[0]
    if lines[start - 1].strip() == "*/":
        while not lines[start].lstrip().startswith("/**"):
            start -= 1
    while lines[end] != "}":
        end += 1
    removed = "\n".join(lines[start:end + 1])
    kept = lines[:start] + ["// " + func + "() removed here; see upstream-overlay/."] + lines[end + 1:]
    out = "\n".join(kept)
    if marker not in removed:
        sys.exit("strip_function: marker not found in the removed range")
    if marker in out:
        sys.exit("strip_function: marker still present after removal")
    if sig.search(out) or re.search(re.escape(func) + r"\s*\([^;]*\)\s*\{", out):
        sys.exit(f"strip_function: {func} still defined after removal")
    with open(dst, "w", encoding="utf-8") as f:
        f.write(out)
    print(f"strip_function: {src} -> {dst}: removed {func} ({end - start + 1} lines)")


if __name__ == "__main__":
    main()
