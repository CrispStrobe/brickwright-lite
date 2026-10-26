#!/usr/bin/env python3
# SPDX-License-Identifier: BSD-3-Clause
"""Audit retained dynamics/coverage/SB3 bytes using only Python's standard library.

No producer imports, simulation, acquisition or replay. A foreign pair identity is
retained provenance; only the saved current model has its LDraw bytes joined here.
"""
import argparse
import hashlib
import io
import json
import math
from pathlib import Path, PurePosixPath
import re
import stat
import zipfile

PIN = '8ecbb4c116e4123fb9de18cdb71570c0dad2ceb9'
MANIFEST = 'faff63be7372783d05e079f18feeb3a09386c659b95e7caaab6d7fff21051290'
REPORT = 'sim-lab-measurement-dynamics.json'
PROJECT = 'sim-lab-dynamics-pair.sb3'
COVERAGE = 'sim-lab-role-persistence.json'
# SHA256 of compact JSON sorted [model ID, canonical LDraw SHA256] pairs from the admitted manifest.
MODEL_PROJECTION = '6aa22fdd550fee47d567f91f6fcf4a9283dd11ecc77a4160b6df88426398121e'
HISTORY_LIMIT = 512 * 1024
# kind: (unit, source, target count, joint/rope binding category)
KINDS = {
    'modelMass': ('g', 'configured-model-mass', 0, ''),
    'mass': ('g', 'configured-mass', 1, ''), 'weight': ('N', 'configured-weight', 1, ''),
    'speed': ('m/s', 'jolt-com-velocity', 1, ''),
    'acceleration': ('m/s²', 'sampled-jolt-com-acceleration', 1, ''),
    'angularSpeed': ('°/s', 'jolt-angular-velocity', 1, ''),
    'distance': ('mm', 'part-origins', 2, ''), 'angle': ('°', 'part-origins', 3, ''),
    'jointAngle': ('°', 'jolt-joint', 0, 'joint'), 'jointSpeed': ('°/s', 'jolt-joint', 0, 'joint'),
    'motorTorque': ('N·m', 'jolt-motor-impulse', 0, 'joint'),
    'limitTorque': ('N·m', 'jolt-limit-impulse', 0, 'joint'),
    'passiveTorque': ('N·m', 'jolt-passive-friction-impulse', 0, 'joint'),
    'motorPower': ('W', 'jolt-motor-power', 0, 'joint'),
    'motorForce': ('N', 'jolt-slider-motor-impulse', 0, 'joint'),
    'limitForce': ('N', 'jolt-slider-limit-impulse', 0, 'joint'),
    'sliderPower': ('W', 'jolt-slider-motor-power', 0, 'joint'),
    'screwSlips': ('count', 'screw-slip-count', 0, 'joint'),
    'screwLoad': ('N', 'screw-filtered-support-load', 0, 'joint'),
    'contact': ('0/1', 'jolt-contact-presence', 2, ''),
    'travel': ('mm', 'jolt-joint', 0, 'joint'), 'tension': ('N', 'rope-constraint', 0, 'rope'),
    'normalLoad': ('N', 'rolling-load-estimate', 1, ''),
    'pressure': ('kPa', 'jolt-air-network-gauge-pressure', 1, '')
}
REASONS = {'unavailable', 'missing-target', 'coincident-points', 'not-a-rolling-wheel'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def text(value, limit):
    return isinstance(value, str) and 0 < len(value) <= limit and not re.search(r'[\x00-\x1f\x7f]', value)


def sha(value, length=64):
    return isinstance(value, str) and re.fullmatch('[a-f0-9]{%d}' % length, value) is not None


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')


def decode(data):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'duplicate JSON key')
            result[key] = value
        return result
    def nonfinite(value):
        raise ValueError('nonfinite JSON constant: ' + value)
    def parsed_float(value):
        number = float(value)
        require(math.isfinite(number), 'nonfinite JSON exponent')
        return number
    return json.loads(data, object_pairs_hook=pairs, parse_constant=nonfinite, parse_float=parsed_float)


def read_bounded(directory, name, limit):
    path = directory / name
    require(not path.is_symlink() and path.is_file(), 'missing or linked original: ' + name)
    require(0 < path.stat().st_size <= limit, 'original byte bound: ' + name)
    data = path.read_bytes()
    require(0 < len(data) <= limit, 'original read bound: ' + name)
    return data


def joined_bytes(directory, receipt, name, limit):
    require(isinstance(receipt, dict) and receipt.get('file') == name, 'unexpected original filename')
    data = read_bounded(directory, name, limit)
    require(type(receipt.get('bytes')) is int and receipt['bytes'] == len(data), 'original size join: ' + name)
    require(receipt.get('sha256') == hashlib.sha256(data).hexdigest(), 'original hash join: ' + name)
    return data


def definitions(value, limit):
    require(isinstance(value, list) and len(value) <= limit, 'definition count')
    found = {}
    for d in value:
        require(isinstance(d, dict) and text(d.get('id'), 128) and d['id'] not in found, 'definition identity')
        require(d.get('kind') in KINDS and text(d.get('label'), 80), 'definition kind/label')
        require('visible' not in d or type(d['visible']) is bool, 'definition visibility')
        unit, source, targets, category = KINDS[d['kind']]
        require(('unit' not in d or d['unit'] == unit) and ('source' not in d or d['source'] == source), 'definition unit/source mismatch')
        if targets:
            require(isinstance(d.get('targets'), list) and len(d['targets']) == targets and all(text(t, 128) for t in d['targets']), 'definition targets')
        if category:
            require(text(d.get(category), 128) and text(d.get('binding'), 4096), 'definition binding')
        found[d['id']] = d
    return found


def audit_role(packet):
    require(isinstance(packet, dict) and packet.get('schema') == 'bw.sim-lab.experiments.v1', 'nested role must be v1')
    require(len(encode(packet)) <= HISTORY_LIMIT and sha(packet.get('modelSha256')), 'role identity/byte cap')
    require(isinstance(packet.get('runs'), list) and len(packet['runs']) == 1, 'exactly one run per role')
    selection = packet.get('selection', [])
    require(isinstance(selection, list) and len(selection) <= 4 and all(text(x, 128) for x in selection) and len(set(selection)) == len(selection), 'plot selection')
    run = packet['runs'][0]
    require(isinstance(run, dict) and text(run.get('id'), 128) and sha(run.get('modelSha256')), 'run provenance')
    require('rawModelSha256' not in run or sha(run['rawModelSha256']), 'raw provenance')
    require('canonicalModelSha256' not in run or run['canonicalModelSha256'] == packet['modelSha256'], 'canonical role provenance')
    require('origin' not in run or run['origin'] in ('simulation', 'csv'), 'run origin')
    defs = definitions(run.get('definitions'), 4)
    require(1 <= len(defs) <= 4, 'recorded definitions')
    samples = run.get('samples')
    require(isinstance(samples, list) and 1 <= len(samples) <= 600, 'sample set cap')
    window = run.get('window')
    if window is not None:
        require(isinstance(window, dict) and window.get('schema') == 'bw.sim-lab.recording-window.v1' and finite(window.get('startTimeMs')) and window['startTimeMs'] >= 0 and finite(window.get('durationMs')) and 0 < window['durationMs'] <= 60000 and finite(window['startTimeMs'] + window['durationMs']), 'recording window')
    previous, origin = -1, None
    sources = {key: set() for key in defs}
    for sample in samples:
        require(isinstance(sample, list) and len(sample) == 3, 'sample tuple')
        elapsed, absolute, readings = sample
        require(finite(elapsed) and 0 <= elapsed and previous < elapsed < 60000, 'elapsed chronology/duration')
        previous = elapsed
        if absolute is not None:
            require(finite(absolute) and absolute >= elapsed, 'absolute timestamp')
            start = absolute - elapsed
            if origin is None:
                origin = start
            require(abs(start - origin) <= 1e-7 * max(1, start, origin), 'absolute origin changed')
        if window is not None:
            require(elapsed < window['durationMs'] and finite(absolute) and abs(absolute - window['startTimeMs'] - elapsed) <= 1e-7, 'window timestamp join')
        require(isinstance(readings, list) and len(readings) == len(defs), 'reading arity')
        for (key, d), row in zip(defs.items(), readings):
            require(isinstance(row, list) and len(row) == 3, 'reading tuple')
            value, source, reason = row
            require(source == KINDS[d['kind']][1] or (value is None and source == ''), 'reading source')
            require((value is None and reason in REASONS) or (finite(value) and reason == ''), 'reading value/gap')
            if source:
                sources[key].add(source)
    return {'packet': packet, 'run': run, 'definitions': defs, 'sources': sources}


def audit_pair(packet, model_hash):
    require(isinstance(packet, dict) and packet.get('schema') == 'bw.sim-lab.experiments.v2' and len(encode(packet)) <= HISTORY_LIMIT, 'pair schema/aggregate bytes')
    require(packet.get('modelSha256') == model_hash and packet.get('alignment') == 'elapsed-exact', 'pair anchor/alignment')
    require('label' not in packet or text(packet['label'], 80), 'pair label')
    roles = [audit_role(packet.get(role)) for role in ('baseline', 'control')]
    hashes = [r['packet']['modelSha256'] for r in roles]
    require(hashes[0] != hashes[1] and model_hash in hashes, 'pair distinct canonical identities/current anchor')
    mappings = packet.get('mappings')
    require(isinstance(mappings, list) and 1 <= len(mappings) <= 4, 'pair mapping cap')
    seen = [set(), set()]
    for mapping in mappings:
        require(isinstance(mapping, dict), 'mapping shape')
        ids = [mapping.get('baselineId'), mapping.get('controlId')]
        for side, key in enumerate(ids):
            require(text(key, 128) and key in roles[side]['definitions'] and key not in seen[side], 'mapping unique endpoint')
            seen[side].add(key)
        ds = [roles[i]['definitions'][key] for i, key in enumerate(ids)]
        require(ds[0]['kind'] == ds[1]['kind'], 'mapped kind mismatch')
        require(KINDS[ds[0]['kind']][:2] == KINDS[ds[1]['kind']][:2], 'mapped unit/source mismatch')
        require(len(roles[0]['sources'][ids[0]] | roles[1]['sources'][ids[1]]) <= 1, 'mapped observed sources differ')
    return {'baselineCanonicalSha256': hashes[0], 'controlCanonicalSha256': hashes[1], 'mappings': len(mappings), 'sampleSets': [len(r['run']['samples']) for r in roles]}


def canonical_hash(record):
    require(isinstance(record, dict) and isinstance(record.get('ldraw'), str) and '\x00' not in record['ldraw'] and re.search(r'^[ \t]*1[ \t]', record['ldraw'], re.M), 'saved model text')
    require(text(record.get('name'), 128), 'saved model name')
    require(len(encode(record)) <= 1024 * 1024, 'Sim Lab section byte cap')
    lines = record['ldraw'].splitlines()
    offset = int(bool(lines and lines[0].startswith('0 FILE ')))
    require(len(lines) > offset + 3 and lines[offset].startswith('0 ') and lines[offset + 1] == '0 Name: ' + record['name'] and lines[offset + 2].startswith('0 Author: '), 'saved canonical root headers')
    if offset:
        require(lines[0] == '0 FILE ' + record['name'], 'MPD root filename')
        lines[0] = '0 FILE measurement-model.ldr'
    lines[offset:offset + 3] = ['0 measurement-model', '0 Name: measurement-model.ldr', '0 Author: Brickwright']
    return hashlib.sha256(('\r\n'.join(lines) + '\r\n').encode('utf-8')).hexdigest()


def project_record(data):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        names = [e.filename for e in entries]
        require(0 < len(entries) <= 4096 and len(names) == len(set(names)), 'ZIP entry count/duplicates')
        require(sum(e.file_size for e in entries) <= 32 * 1024 * 1024, 'ZIP expanded size cap')
        require('project.json' in names and 'brickwright/state.json' in names, 'ZIP project/sidecar missing')
        for entry in entries:
            path = PurePosixPath(entry.filename)
            require(entry.orig_filename == entry.filename and path.as_posix() == entry.filename.rstrip('/') and entry.filename and not path.is_absolute() and '..' not in path.parts and '\\' not in entry.filename and '\x00' not in entry.filename and not re.match(r'^[A-Za-z]:', entry.filename), 'unsafe ZIP path')
            require(not (entry.flag_bits & 1) and not stat.S_ISLNK(entry.external_attr >> 16), 'encrypted/link ZIP entry')
            require(entry.file_size <= 16 * 1024 * 1024, 'ZIP per-entry cap')
            with archive.open(entry) as stream:
                count = 0
                while True:
                    chunk = stream.read(65536)
                    if not chunk:
                        break
                    count += len(chunk)
                    require(count <= entry.file_size, 'ZIP actual entry size')
                require(count == entry.file_size, 'ZIP size mismatch')
        require(archive.getinfo('brickwright/state.json').file_size <= 2 * 1024 * 1024, 'bundle byte cap')
        bundle = decode(archive.read('brickwright/state.json'))
        require(bundle.get('format') == 'brickwright-state' and type(bundle.get('version')) is int and bundle['version'] == 2 and isinstance(bundle.get('state'), dict), 'bundle format/version')
        scratch = decode(archive.read('project.json'))
        require(isinstance(scratch.get('targets'), list), 'Scratch targets')
        return bundle['state']['simLab'], len(entries)


def audit_coverage(value, checkout, tree):
    require(isinstance(value, dict) and type(value.get('schema')) is int and value['schema'] == 1 and value.get('status') == 'PASS', 'coverage schema/status')
    require(value.get('sourceRef') == PIN and value.get('manifestSha256') == MANIFEST and value.get('manifestEntryCount') == 60, 'coverage pin/count')
    require(value.get('candidateHead') == checkout and value.get('candidateTree') == tree, 'coverage candidate join')
    require(value.get('allowedUnmetRoles') == [], 'coverage exceptions are not admitted')
    require(value.get('manifestPath') == 'docs/data/robot-lab-experimental-checkpoint.json', 'coverage manifest path')
    models = value.get('models')
    require(isinstance(models, list) and len(models) == 60, 'coverage model count')
    seen, total = set(), 0
    for model in models:
        key = model.get('id')
        require(text(key, 128) and re.fullmatch('[a-z0-9][a-z0-9-]{0,127}', key) and key not in seen, 'coverage model identity')
        seen.add(key)
        require(sha(model.get('actualCanonicalLdrawSha256')) and sha(model.get('modelSourceSHA'), 40), 'coverage model hashes')
        require(model.get('canonicalHashMatchesManifest') is True and model.get('compileStatus') == 'PASS', 'coverage source/compile failure')
        count = model.get('packCount')
        require(type(count) is int and 0 < count <= 256 and type(model.get('verifiedPackCount')) is int and model['verifiedPackCount'] == count, 'coverage pack count')
        p = model.get('persistence')
        require(isinstance(p, dict) and type(p.get('checkedPackCount')) is int and p['checkedPackCount'] == count and type(p.get('passedPackCount')) is int and p['passedPackCount'] == count and type(p.get('failedPackCount')) is int and p['failedPackCount'] == 0, 'coverage persistence counts')
        require(model.get('failures') == [] and model.get('unmetRoles') == [], 'coverage unresolved failure')
        require(isinstance(model.get('roles'), list) and model['roles'] and len(set(model['roles'])) == len(model['roles']) and all(role in KINDS for role in model['roles']), 'coverage role kinds')
        total += count
    require(isinstance(value.get('summary'), dict) and all(type(n) is int for n in value['summary'].values()), 'coverage summary integer counts')
    projection = sorted([[m['id'], m['actualCanonicalLdrawSha256']] for m in models])
    require(hashlib.sha256(encode(projection)).hexdigest() == MODEL_PROJECTION, 'coverage model/hash set differs from admitted manifest')
    require(value.get('summary') == {'models': 60, 'modelsWithVerifiedPacks': 60, 'totalPacks': total, 'verifiedPacks': total, 'failedPacks': 0, 'modelsWithUnmetRoles': 0}, 'coverage summary counts')
    return total


def audit_precision(value):
    selection, packets, result = value['selection'], value['packets'], value['result']
    ids = selection.get('joints')
    require(type(selection.get('revision')) is int and selection['revision'] > 0 and isinstance(ids, list) and 1 <= len(ids) <= 4 and all(text(i, 128) for i in ids) and len(set(ids)) == len(ids), 'precision selection')
    mode, degrees = selection.get('mode'), selection.get('thresholdDegrees')
    require(mode in ('oscillation', 'rotation') and finite(degrees) and abs(degrees) <= 1e9, 'precision mode/threshold')
    require(result.get('revision') == selection['revision'] and result.get('gap') is False and result.get('mode') == mode and result.get('thresholdDegrees') == degrees, 'precision result revision/gap/mode')
    method = 'completed-fixed-step; successive full-turn crossings; signed sum(power × step)' if mode == 'rotation' else 'completed-fixed-step; rising threshold crossings; signed sum(power × step)'
    require(result.get('method') == method, 'precision method declaration')
    require(isinstance(packets, list) and 0 < len(packets) <= 4096, 'precision packet count')
    rows = result.get('rows')
    require(isinstance(rows, list) and len(rows) == len(ids) and {r.get('joint') for r in rows} == set(ids), 'precision result joints')
    states = {key: {'type': None, 'work': [], 'previous': None, 'direction': None, 'crossings': []} for key in ids}
    last, fixed, count = None, None, 0
    threshold = degrees * math.pi / 180
    for packet in packets:
        require(packet.get('revision') == selection['revision'] and packet.get('overflow') is False and packet.get('unavailable', False) is False and isinstance(packet.get('samples'), list), 'precision packet revision/availability')
        count += len(packet['samples'])
        require(count <= 600, 'precision total raw sample cap')
        for sample in packet['samples']:
            t, dt = sample.get('t'), sample.get('stepSeconds')
            require(finite(t) and t >= 0 and finite(dt) and dt > 0, 'precision fixed-step numbers')
            if fixed is None:
                fixed = dt
            require(abs(dt - fixed) <= 1e-12 and (last is None or abs(t - last - dt) <= 1e-8), 'precision fixed-step chronology')
            last = t
            observed = sample.get('joints')
            require(isinstance(observed, list) and len(observed) == len(ids) and {j.get('id') for j in observed} == set(ids), 'precision observed joints')
            for joint in observed:
                state = states[joint['id']]
                coordinate, power, kind = joint.get('coordinate'), joint.get('powerW'), joint.get('type')
                require(kind in ('hinge', 'slider') and finite(coordinate) and finite(power), 'precision observed coordinate/power')
                require(state['type'] is None or state['type'] == kind, 'precision joint type changed')
                state['type'] = kind
                product = power * dt
                require(math.isfinite(product), 'precision work overflow')
                state['work'].append(product)
                previous = state['previous']
                if kind == 'hinge' and previous is not None:
                    old_t, old_coordinate = previous
                    delta = coordinate - old_coordinate
                    crossing = None
                    if mode == 'oscillation':
                        if old_coordinate < threshold <= coordinate:
                            crossing = threshold
                    elif delta:
                        direction = 1 if delta > 0 else -1
                        if state['direction'] is not None and state['direction'] != direction:
                            state['crossings'] = []
                        state['direction'] = direction
                        require(abs(delta) <= 2 * math.pi, 'precision skipped full rotation')
                        offset = (old_coordinate - threshold) / (2 * math.pi)
                        turn = math.floor(offset) + 1 if direction > 0 else math.ceil(offset) - 1
                        candidate = threshold + turn * 2 * math.pi
                        if (direction > 0 and coordinate >= candidate) or (direction < 0 and coordinate <= candidate):
                            crossing = candidate
                    if crossing is not None:
                        fraction = (crossing - old_coordinate) / delta
                        state['crossings'].append(old_t + (t - old_t) * fraction)
                state['previous'] = (t, coordinate)
    require(count > 0, 'precision has no raw observations')
    reference = next((key for key in ids if states[key]['type'] == 'hinge'), None)
    require(reference == ids[0] == result.get('referenceJoint'), 'precision input/reference joint')
    reference_crossings = states[reference]['crossings']
    require(len(reference_crossings) >= 2, 'precision input needs two localized crossings')
    reference_period = reference_crossings[-1] - reference_crossings[-2]
    require(reference_period > 0, 'precision reference period')
    nonzero = False
    for row in rows:
        state = states[row['joint']]
        require(row.get('type') == state['type'], 'precision reported type')
        work = math.fsum(state['work'])
        require(finite(row.get('workJ')) and math.isfinite(work) and abs(row['workJ'] - work) <= 1e-9, 'signed work sum mismatch')
        nonzero |= work != 0
        crossings = state['crossings']
        period = row.get('periodSeconds')
        if period is not None:
            require(finite(period) and period > 0 and len(crossings) >= 2 and abs(period - (crossings[-1] - crossings[-2])) <= 1e-9, 'period crossing mismatch')
        if row['joint'] == reference:
            require(period is not None, 'input period missing')
        phase = row.get('phaseDegrees')
        if phase is not None:
            require(finite(phase) and crossings and (mode != 'rotation' or state['direction'] == states[reference]['direction']), 'phase provenance')
            expected = ((crossings[-1] - reference_crossings[-1]) / reference_period * 360 + 180) % 360 - 180
            require(abs(phase - expected) <= 1e-9, 'phase crossing mismatch')
    require(nonzero, 'precision has no nonzero signed work')
    return {'samples': count, 'stepSeconds': fixed, 'inputCrossings': len(reference_crossings), 'inputPeriodSeconds': reference_period}


def audit(directory, checkout, tree):
    require(sha(checkout, 40) and sha(tree, 40), 'expected candidate identities')
    data = read_bounded(directory, REPORT, 4 * 1024 * 1024)
    report = decode(data)
    require(report.get('schema') == 'bw.robot.measurements.dynamics.v1', 'dynamics report schema')
    require(report.get('source') == {'checkout': checkout, 'tree': tree}, 'dynamics candidate join')
    require(report.get('pinnedModelSource') == {'commit': PIN, 'manifestSha256': MANIFEST}, 'dynamics pinned model source')
    coverage = decode(joined_bytes(directory, report['coverage'], COVERAGE, 512 * 1024))
    total_packs = audit_coverage(coverage, checkout, tree)
    project = report['project']
    sb3 = joined_bytes(directory, project, PROJECT, 8 * 1024 * 1024)
    saved, entries = project_record(sb3)
    require(saved == project['before'] == project['saved'] == project['after'], 'project before/saved/after sidecar joins')
    definitions(saved.get('measurements', []), 64)
    model_hash = canonical_hash(saved)
    pair = audit_pair(saved.get('experiments'), model_hash)
    precision = audit_precision(report['precision'])
    return {'result': 'PASS', 'checkout': checkout, 'tree': tree, 'reportSha256': hashlib.sha256(data).hexdigest(),
            'sb3Sha256': hashlib.sha256(sb3).hexdigest(), 'coverageModels': 60, 'coveragePacks': total_packs,
            'zipEntries': entries, 'currentCanonicalSha256': model_hash, 'pair': pair, 'precision': precision,
            'scope': 'Original byte, source, role/pair persistence and completed-step arithmetic joins; no replay or physical qualification. Optional force narrative is not audited.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--checkout', required=True)
    parser.add_argument('--tree', required=True)
    args = parser.parse_args()
    try:
        result = audit(args.directory, args.checkout, args.tree)
    except (ValueError, KeyError, TypeError, OverflowError, OSError, zipfile.BadZipFile, RuntimeError) as error:
        parser.exit(1, 'REFUSED: ' + str(error)[:512] + '\n')
    print(json.dumps(result, sort_keys=True, allow_nan=False))


if __name__ == '__main__':
    main()
