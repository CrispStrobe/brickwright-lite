// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import { createHash } from 'node:crypto';
const hashes = {
  "bit-keeper": "b2bfb18d2c91fda719f3d7c5d310629e9f0727c25bd1a69180ba1ace6a7286d5",
  "crossline": "66be1c3afe47d7d2e8d696a4829a506e9ecb213aef85161f5c2801ff395ef650",
  "linger": "0ef813840b5a8d2a057b59528322df4f41a46bdb5dd2f14e07433de5f4e50ec0",
  "echo-bridge": "10b014401e1f52491dea92b3099970c6a741067ff87fc00b266d2ba62294f434",
  "ellipsa": "af68940a8ad94a8c3f35c64bc99761a1954b0d5ad84d45c698e1dadf7d1cf919",
  "offset-orbit": "a416aa577c43bbd971a30bc1490b8312c9bacb87d414bccf6cac519af4db8005",
  "momentum-twins": "15a1b23a23371050407d3c9aa7ed075d4d406fbfebb83dbb07528ed391f965dd",
  "bloom-gate": "8d57b5c5d9622a6b8ea170493b15f041b5791b07bf9479599f8c430303af9e1d",
  "amplify": "32dbbaccec6dd376fdbb3c4e0f1d12c4ba0b49b33409a62862db652a56c82bcf",
  "pantograph-doubler": "4e35bee121d3211554e1fe9e9f8cb53da273981b498e807e03a1eff9871721d4",
  "scale-studio": "ab399b62b86dd5f4a2cd36acf90635b3786a60832f70573d10de9fa1155e8e2c",
  "ripple-relay": "f79758aba0befd929c744d9382f40ff0d1f71bcd28f64c64caa49b1dc5021389",
  "crossglide": "7c8e80638933eb216c8258560a68b461c25b4ea7f60fa15b209f8c7200e1d059"
};
export function adaptAddonProgram(id, bytes) {
  if (createHash('sha256').update(bytes).digest('hex') !== hashes[id]) throw Error('Program differs from reviewed source');
  let text = bytes.toString('utf8');
  if (id === 'scale-studio' || id === 'bloom-gate' || id === 'echo-bridge' || id === 'bit-keeper') {
    // Gallery selection already reconstructs the saved model. Keep the real datum guard.
    if (text.split('  lab reset\n').length !== 2) throw Error('Expected one redundant reset');
    text = text.replace('  lab reset\n', '').replace('# Reset restores the closed saved pose and its zero encoder datum.', '# Gallery selection loads the closed saved pose. Use Reset before another run.').replace('# The reset restores the saved pose; encoder zero is the right-pointing crank.', '# Gallery selection loads the saved pose; use Reset before rerunning after manual motion.');
  }
  return text;
}
