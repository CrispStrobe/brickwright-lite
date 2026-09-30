#!/usr/bin/env python3
# SPDX-License-Identifier: BSD-3-Clause
# Copyright (c) 2026 Brickwright contributors
"""Exhaustive uint8 mode tests against independently supplied timing tables."""
import ctypes
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent
BUILD = ROOT / "timing-test-build"
LOG = ROOT / "access-log.json"


def record(action, **details):
    log = json.loads(LOG.read_text())
    log["accesses"].append({"action": action, **details})
    LOG.write_text(json.dumps(log, indent=2) + "\n")


def main():
    record("run synthetic timing tests", tool="exec_command",
           inputs=["test_device_timing.py", "device_timing.c", "access-log.json"])
    (BUILD / "lego").mkdir(parents=True, exist_ok=True)
    names = ["COLOR_DIST_SENSOR", "SPIKE_COLOR_SENSOR", "SPIKE_ULTRASONIC_SENSOR",
             "EV3_COLOR_SENSOR", "EV3_IR_SENSOR", "NXT_LIGHT_SENSOR",
             "NXT_SOUND_SENSOR", "NXT_ENERGY_METER"]
    # Deliberately synthetic sparse IDs and distinct modes; no original header.
    identifiers = [11, 23, 37, 49, 61, 73, 89, 101]
    modes = {
        "LEGO_DEVICE_MODE_PUP_COLOR_DISTANCE_SENSOR__IR_TX": 5,
        "LEGO_DEVICE_MODE_PUP_COLOR_SENSOR__LIGHT": 13,
        "LEGO_DEVICE_MODE_PUP_ULTRASONIC_SENSOR__LIGHT": 29,
    }
    declarations = ["#include <stdint.h>", "typedef int lego_device_type_id_t;", "enum {"]
    declarations.extend(f"LEGO_DEVICE_TYPE_ID_{name} = {identifier},"
                        for name, identifier in zip(names, identifiers))
    declarations.extend(f"{name} = {value}," for name, value in modes.items())
    declarations.extend([
        "};",
        "uint32_t lego_device_stale_data_delay(lego_device_type_id_t, uint8_t);",
        "uint32_t lego_device_data_set_delay(lego_device_type_id_t, uint8_t);",
    ])
    header = BUILD / "lego" / "device.h"
    header.write_text("\n".join(declarations) + "\n")
    record("write independent synthetic header", output=str(header))
    # Dictionary lookup oracle, independent of the C switch implementation.
    defaults = dict(zip(identifiers, [30, 30, 50, 30, 1100, 20, 300, 200]))
    overrides = {(11, 5): 0, (23, 13): 0, (37, 29): 0}
    send_overrides = {(11, 5): 250}
    tested = 0
    for driver in ("clang", "gcc"):
        record("discover public compiler executable", driver=driver)
        compiler = shutil.which(driver)
        if not compiler:
            continue
        for optimization in ("-O0", "-O2"):
            output = BUILD / f"timing-{driver}-{optimization[1:]}.so"
            command = [compiler, "-std=c99", "-Wall", "-Wextra", "-Werror", "-pedantic",
                       optimization, "-shared", "-fPIC", "-I", str(BUILD),
                       str(ROOT / "device_timing.c"), "-o", str(output)]
            record("compile authored timing component", command=command)
            subprocess.run(command, cwd=ROOT, check=True)
            record("load generated native timing library", input=str(output))
            library = ctypes.CDLL(str(output))
            stale = library.lego_device_stale_data_delay
            send = library.lego_device_data_set_delay
            for function in (stale, send):
                function.argtypes = [ctypes.c_int, ctypes.c_uint8]
                function.restype = ctypes.c_uint32
            # All 256 uint8 modes for every known ID, plus unknown ID boundaries.
            ids = identifiers + [-2147483648, -1, 0, 12, 255, 2147483647]
            for identifier in ids:
                for mode in range(256):
                    expected_stale = overrides.get((identifier, mode), defaults.get(identifier, 0))
                    expected_send = send_overrides.get((identifier, mode), 10)
                    assert stale(identifier, mode) == expected_stale, (identifier, mode, "stale")
                    assert send(identifier, mode) == expected_send, (identifier, mode, "send")
            tested += 1
            print(f"{driver} {optimization}: {len(ids) * 256} ID/mode pairs, both timing functions passed")
    if not tested:
        raise RuntimeError("No compiler available")
    hashes = {}
    for path in [ROOT / "device-timing-contract.txt", ROOT / "device_timing.c",
                 ROOT / "test_device_timing.py", header]:
        hashes[str(path.relative_to(ROOT))] = hashlib.sha256(path.read_bytes()).hexdigest()
    record("record authorized timing input/output hashes and successful tests",
           sha256=hashes, builds=tested, id_mode_pairs_per_build=3584)


if __name__ == "__main__":
    main()
