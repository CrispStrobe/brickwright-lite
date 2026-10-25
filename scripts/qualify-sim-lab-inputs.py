#!/usr/bin/env python3
"""Bind the explicitly reviewed own-firmware graph; never choose a newer pin."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

lite, firmware, runtime, output = map(Path, sys.argv[1:5])

def git(root, *args):
    return subprocess.check_output(['git', '-c', 'gc.auto=0', '-C', str(root), *args], text=True).strip()

expected = {
    'firmware': (firmware, '91cf0c07784441ac114b85a1705737327db2d9f8'),
    'nuttx': (firmware / 'nuttx', 'a67efb31cf4f236e456882589b91862f04594528'),
    'apps': (firmware / 'nuttx-apps', '55f0bc216565ccab8dee600a88f4485c7693bf8b'),
    'runtime': (runtime, '0ff9e15d5fdd0ba755e4cb1773ebc3d3e79e3b3f'),
    'infrastructure': (runtime / 'src/Infrastructure', '181d9d45567d9afc66a47b57255d34aa51b5ffdd'),
    'resources': (runtime / 'lib/resources', '14b80cde0a136b684f316eb7f6a31aeaae0684bf'),
}
heads = {name: git(root, 'rev-parse', 'HEAD') for name, (root, _) in expected.items()}
for name, (_, sha) in expected.items():
    if heads[name] != sha:
        raise SystemExit(f'{name}: source identity refused')
for root, child, sha in [(firmware, 'nuttx', heads['nuttx']), (firmware, 'nuttx-apps', heads['apps']), (runtime, 'src/Infrastructure', heads['infrastructure'])]:
    if git(root, 'ls-tree', 'HEAD', child).split()[2] != sha:
        raise SystemExit(f'{child}: gitlink identity refused')
fingerprint = firmware / 'policy/ti-service-pack-fingerprint.json'
if hashlib.sha256(fingerprint.read_bytes()).hexdigest() != '9bca70061b8c8e6ca6475fe7daa15285bf46990ed85ddf0cf1daaa40b8544099':
    raise SystemExit('offline fingerprint identity refused')
# A bounded, independently readable receipt, without source or binary payloads.
files = [
    'overlay/scratch-gui/src/lib/bw-sim/routes/renode-lockstep/program.js',
    'overlay/scratch-gui/src/lib/bw-sim/routes/renode-lockstep/route.js',
    'scripts/verify-sim-lab-renode-lockstep.mjs',
    'scripts/verify-sim-lab-python-guest.mjs',
    'scripts/lib/sim-lab-renode-guest.mjs',
    'scripts/lib/sim-lab-dotnet-launcher.mjs',
    'scripts/prepare-spike-nuttx-package.mjs',
    'scripts/lib/spike-package-model-loading.mjs',
    'scripts/qualify-sim-lab-inputs.py',
    '.github/workflows/robot-lab-own-firmware.yml',
]
receipt = {'schema': 'robot-lab-own-inputs/v1', 'lite': git(lite, 'rev-parse', 'HEAD'), 'heads': heads, 'modelMode': 'compiled',
           'sourceSha256': {name: hashlib.sha256((lite / name).read_bytes()).hexdigest() for name in files}}
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(receipt, indent=2) + '\n')
print('Exact own-firmware graph and offline fingerprint: PASS')
