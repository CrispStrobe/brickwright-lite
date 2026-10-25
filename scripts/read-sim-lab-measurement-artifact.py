#!/usr/bin/env python3
# SPDX-License-Identifier: BSD-3-Clause
"""Independently audit retained measurement bundle bytes. No producer or simulator imports."""
import argparse
import csv
import math
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import zipfile


def require(ok, message):
    if not ok:
        raise ValueError(message)


def decode(data):
    def pairs(items):
        out = {}
        for key, value in items:
            require(key not in out, 'duplicate JSON key')
            out[key] = value
        return out
    def constant(value):
        raise ValueError('nonfinite JSON number: ' + value)
    return json.loads(data, object_pairs_hook=pairs, parse_constant=constant)


def audit(sb3, report_bytes, checkout, tree, project_name='sim-lab-measurement-edit.sb3', return_record=False):
    require(re.fullmatch(r'[a-f0-9]{40}', checkout) and re.fullmatch(r'[a-f0-9]{40}', tree), 'expected source identity')
    require(0 < len(sb3) <= 8 * 1024 * 1024, 'project byte bound')
    require(0 < len(report_bytes) <= 65536, 'report byte bound')
    report = decode(report_bytes)
    require(report['source']['checkout'] == checkout and report['source']['tree'] == tree, 'source join mismatch')
    project = report['project']
    receipt = project['sb3']
    require(receipt['file'] == project_name, 'unexpected project name')
    require(type(receipt['bytes']) is int and receipt['bytes'] == len(sb3), 'project size mismatch')
    digest = hashlib.sha256(sb3).hexdigest()
    require(receipt['sha256'] == digest, 'project hash mismatch')
    with zipfile.ZipFile(io.BytesIO(sb3)) as archive:
        entries = archive.infolist()
        names = [entry.filename for entry in entries]
        require(0 < len(entries) <= 4096 and len(set(names)) == len(names), 'ZIP entry count or duplicates')
        require(sum(entry.file_size for entry in entries) <= 32 * 1024 * 1024, 'ZIP expanded bound')
        require('project.json' in names and 'brickwright/state.json' in names, 'missing saved project/sidecar')
        for entry in entries:
            path = PurePosixPath(entry.filename)
            require(not path.is_absolute() and '..' not in path.parts and '\\' not in entry.filename, 'unsafe ZIP entry')
            require(not (entry.flag_bits & 1), 'encrypted ZIP entry')
            require(entry.file_size <= 16 * 1024 * 1024, 'ZIP entry bound')
            # Reading every entry checks original CRCs without extracting any file.
            with archive.open(entry) as stream:
                count = 0
                while True:
                    chunk = stream.read(65536)
                    if not chunk:
                        break
                    count += len(chunk)
                    require(count <= entry.file_size, 'ZIP actual size bound')
                require(count == entry.file_size, 'ZIP actual size mismatch')
        require(archive.getinfo('brickwright/state.json').file_size <= 2 * 1024 * 1024, 'sidecar byte bound')
        bundle = decode(archive.read('brickwright/state.json'))
        scratch = decode(archive.read('project.json'))
    require(isinstance(scratch.get('targets'), list), 'Scratch project targets')
    saved = bundle['state']['simLab']
    model_hash = hashlib.sha256(saved['ldraw'].encode('utf-8')).hexdigest()
    require(model_hash == project['modelBeforeSha256'] == project['modelAfterSha256'], 'saved model join mismatch')
    definitions = saved['measurements']
    require(definitions == project['saved'] == project['before'] == project['after'], 'saved definition join mismatch')
    require(isinstance(definitions, list) and len(definitions) <= 64, 'definition count')
    target_counts = {'modelMass': 0, 'mass': 1, 'weight': 1, 'speed': 1, 'acceleration': 1,
                     'angularSpeed': 1, 'normalLoad': 1, 'pressure': 1, 'distance': 2, 'angle': 3,
                     'jointAngle': 0, 'jointSpeed': 0, 'motorTorque': 0, 'limitTorque': 0, 'motorPower': 0, 'travel': 0, 'tension': 0}
    def text(value, limit):
        return isinstance(value, str) and 0 < len(value) <= limit and not re.search(r'[\x00-\x1f\x7f]', value)
    ids = set()
    for definition in definitions:
        key, kind = definition.get('id'), definition.get('kind')
        require(text(key, 128) and key not in ids, 'definition identity')
        ids.add(key)
        require(kind in target_counts and text(definition.get('label'), 80), 'definition kind/label')
        require('visible' not in definition or type(definition['visible']) is bool, 'definition visibility')
        count = target_counts[kind]
        if count:
            targets = definition.get('targets')
            require(isinstance(targets, list) and len(targets) == count and all(text(t, 128) for t in targets), 'definition targets')
        if kind in ('jointAngle', 'jointSpeed', 'motorTorque', 'limitTorque', 'motorPower', 'travel', 'tension'):
            require(text(definition.get('rope' if kind == 'tension' else 'joint'), 128) and text(definition.get('binding'), 4096), 'definition binding')
    summary = {'result': 'PASS', 'checkout': checkout, 'tree': tree, 'sb3Sha256': digest,
            'reportSha256': hashlib.sha256(report_bytes).hexdigest(), 'modelSha256': model_hash,
            'definitions': len(definitions), 'zipEntries': len(entries)}
    return (summary, saved) if return_record else summary



def audit_recording(csv_bytes, report_bytes, checkout, tree):
    require(0 < len(csv_bytes) <= 8 * 1024 * 1024 and 0 < len(report_bytes) <= 65536, 'recording byte bound')
    report = decode(report_bytes)
    require(report['source']['checkout'] == checkout and report['source']['tree'] == tree, 'recording source join mismatch')
    recording = report['recording']
    receipt = recording['csv']
    require(receipt['file'] == 'sim-lab-measurement-runs.csv' and receipt['bytes'] == len(csv_bytes) and
            receipt['sha256'] == hashlib.sha256(csv_bytes).hexdigest(), 'recording original join mismatch')
    require(recording['runCount'] == 2 and recording['compatible'] is True, 'recording two-run result')
    header = ['run_id', 'model_sha256', 'measurement_id', 'label', 'kind', 'definition_json', 'unit', 'source',
              'elapsed_ms', 'available', 'value', 'reason']
    rows = list(csv.reader(io.StringIO(csv_bytes.decode('utf-8'), newline=''), strict=True))
    require(rows and rows.pop(0) == header and 0 < len(rows) <= 4800 and len(rows) == receipt['rows'], 'CSV header/count')
    definitions = {d['id']: d for d in recording['definitions']}
    units = {'modelMass':'g','mass':'g','weight':'N','speed':'m/s','acceleration':'m/s²','angularSpeed':'°/s',
             'normalLoad':'N','pressure':'kPa','distance':'mm','angle':'°','jointAngle':'°','jointSpeed':'°/s','motorTorque':'N·m','limitTorque':'N·m','motorPower':'W','travel':'mm','tension':'N'}
    require(0 < len(definitions) <= 4, 'CSV measurement bound')
    times, previous, declared = {}, {}, {}
    for cells in rows:
        require(len(cells) == len(header), 'CSV column count')
        row = dict(zip(header, cells))
        require(row['run_id'] in ('run-1', 'run-2') and row['model_sha256'] == recording['modelSha256'], 'CSV run/model join')
        require(row['measurement_id'] in definitions, 'CSV measurement identity')
        identity = (row['run_id'], row['measurement_id'])
        if row['definition_json']:
            require(identity not in declared and decode(row['definition_json']) == definitions[row['measurement_id']], 'CSV definition join')
            declared[identity] = True
        else:
            require(identity in declared, 'CSV missing initial definition')
        require(row['kind'] == definitions[row['measurement_id']]['kind'] and row['kind'] in units, 'CSV quantity join')
        require(row['unit'] == units[row['kind']], 'CSV unit join')
        time = float(row['elapsed_ms'])
        require(math.isfinite(time) and 0 <= time < 60000, 'CSV simulated-time bound')
        key = (row['run_id'], row['measurement_id'])
        require(key not in previous or time > previous[key], 'CSV time order')
        previous[key] = time
        times.setdefault(row['run_id'], set()).add(time)
        require(row['available'] in ('true', 'false'), 'CSV availability')
        if row['available'] == 'true':
            require(math.isfinite(float(row['value'])) and row['unit'] and row['source'] and not row['reason'], 'CSV available observation')
        else:
            require(not row['value'] and row['reason'], 'CSV unavailable gap')
    require(set(times) == {'run-1', 'run-2'}, 'CSV two distinct runs')
    require([len(times[key]) for key in ('run-1', 'run-2')] == recording['sampleSets'] and
            all(0 < len(t) <= 600 for t in times.values()), 'CSV sample-set join')
    require(times['run-1'] & times['run-2'], 'CSV exact shared simulated time')
    return {'result': 'PASS', 'csvSha256': receipt['sha256'], 'rows': len(rows),
            'sampleSets': recording['sampleSets'], 'modelSha256': recording['modelSha256']}


def audit_history(directory, csv_bytes, checkout, tree):
    project_path = directory / 'sim-lab-experiment-history.sb3'
    report_path = directory / 'sim-lab-experiment-history.json'
    require(project_path.stat().st_size <= 8 * 1024 * 1024 and report_path.stat().st_size <= 65536, 'history original bounds')
    report_bytes = report_path.read_bytes()
    report = decode(report_bytes)
    summary, saved = audit(project_path.read_bytes(), report_bytes, checkout, tree,
                           project_name='sim-lab-experiment-history.sb3', return_record=True)
    packet = saved['experiments']
    require(packet == report['history']['before'] == report['history']['saved'] ==
            report['history']['after'] == report['history']['remounted'], 'saved history and remount join')
    packet_bytes = json.dumps(packet, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    require(packet['schema'] == 'bw.sim-lab.experiments.v1' and len(packet_bytes) <= 512 * 1024, 'history schema/bound')
    # This is the saved serializer output: independently normalize only its
    # root headers, without loading the producer's parser or model serializer.
    lines = saved['ldraw'].splitlines()
    offset = 1 if lines and lines[0].startswith('0 FILE ') else 0
    require(len(lines) > offset + 3 and lines[offset].startswith('0 ') and
            lines[offset + 1] == '0 Name: ' + saved['name'] and lines[offset + 2].startswith('0 Author: '), 'saved canonical header shape')
    if offset:
        lines[0] = '0 FILE measurement-model.ldr'
    lines[offset:offset + 3] = ['0 measurement-model', '0 Name: measurement-model.ldr', '0 Author: Brickwright']
    canonical = '\r\n'.join(lines) + '\r\n'
    model_hash = hashlib.sha256(canonical.encode()).hexdigest()
    require(packet['modelSha256'] == model_hash, 'independent canonical authored-model join')
    require(len(packet['runs']) == 2 and {r['id'] for r in packet['runs']} == {'run-1', 'run-2'}, 'saved history run identities')
    selection = packet.get('selection', [])
    require(isinstance(selection, list) and len(selection) <= 4 and len(set(selection)) == len(selection) and
            all(key in {d['id'] for d in saved['measurements']} for key in selection), 'saved plot selection')
    receipt = report['history']['csv']
    require(receipt['file'] == 'sim-lab-measurement-runs.csv' and receipt['bytes'] == len(csv_bytes) and
            receipt['sha256'] == hashlib.sha256(csv_bytes).hexdigest(), 'history original CSV join')
    rows = list(csv.DictReader(io.StringIO(csv_bytes.decode(), newline=''), strict=True))
    indexed = {}
    declarations = {}
    for row in rows:
        key = (row['run_id'], row['measurement_id'], float(row['elapsed_ms']))
        require(key not in indexed and row['model_sha256'] == model_hash, 'history CSV row identity')
        indexed[key] = row
        if row['definition_json']:
            declarations[(row['run_id'], row['measurement_id'])] = decode(row['definition_json'])
    used = set()
    for run in packet['runs']:
        require(run.get('origin') == 'csv' and run['modelSha256'] == model_hash and 0 < len(run['definitions']) <= 4 and 0 < len(run['samples']) <= 600, 'history model/trace/sample bounds')
        for definition in run['definitions']:
            require(definition == declarations[(run['id'], definition['id'])], 'history definition and CSV join')
        previous = -1
        for sample in run['samples']:
            require(isinstance(sample, list) and len(sample) == 3 and type(sample[0]) in (int, float) and
                    math.isfinite(sample[0]) and previous < sample[0] < 60000, 'history elapsed time order')
            previous = sample[0]
            require(sample[1] is None, 'CSV import must not invent absolute capture time')
            require(isinstance(sample[2], list) and len(sample[2]) == len(run['definitions']), 'history complete reading set')
            for definition, reading in zip(run['definitions'], sample[2]):
                require(isinstance(reading, list) and len(reading) == 3, 'history reading tuple')
                key = (run['id'], definition['id'], sample[0])
                require(key in indexed, 'history sample has no original CSV row')
                row = indexed[key]
                require(reading[1] == row['source'] and reading[2] == row['reason'], 'history source/reason join')
                if row['available'] == 'true':
                    require(type(reading[0]) in (int, float) and math.isfinite(reading[0]) and reading[0] == float(row['value']), 'history captured numeric value')
                else:
                    require(row['available'] == 'false' and reading[0] is None and row['value'] == '', 'history unavailable gap')
                used.add(key)
    require(used == set(indexed), 'unjoined or omitted CSV observations')
    effort = report['effort']
    sample = effort['sample']
    require(sample['t'] == effort['coreTime'] and math.isfinite(sample['t']) and math.isfinite(sample['stepSeconds']) and sample['stepSeconds'] > 0, 'effort completed step join')
    require(all(type(sample[k]) in (int, float) and math.isfinite(sample[k]) for k in
                ('motorTorqueNm', 'passiveTorqueNm', 'limitTorqueNm', 'angularVelocityRadS', 'motorPowerW')), 'finite signed effort')
    require(abs(sample['motorPowerW'] - sample['motorTorqueNm'] * sample['angularVelocityRadS']) <= 1e-10, 'matching torque/rate power')
    fields = {'motorTorque': ('motorTorqueNm', 'N·m', 'jolt-motor-impulse'),
              'limitTorque': ('limitTorqueNm', 'N·m', 'jolt-limit-impulse'), 'motorPower': ('motorPowerW', 'W', 'jolt-motor-power')}
    require(len(effort['rows']) == 3 and {r['kind'] for r in effort['rows']} == set(fields), 'effort reading identities')
    for row in effort['rows']:
        field, unit, source = fields[row['kind']]
        require(row['available'] is True and type(row['value']) in (int, float) and math.isfinite(row['value']) and row['unit'] == unit and row['source'] == source and
                abs(row['value'] - sample[field]) <= 1e-10, 'effort observation field join')
    body = report['inspector']
    require(body['massAdjusted'] is True and 0 < body['configuredMassKg'] < body['solverMassKg'] and
            all(math.isfinite(v) for v in body['centerOfMassWorld']) and len(body['centerOfMassWorld']) == 3, 'solver mass and COM distinction')
    require(len(body['inertiaKgM2']) == 3 and all(len(row) == 3 and all(math.isfinite(v) for v in row) for row in body['inertiaKgM2']), 'solver tensor shape')
    require(report['isolation'] == {'differentModelEmpty': True, 'paneRemountRestored': True}, 'finite isolation result')
    return {**summary, 'canonicalModelSha256': model_hash, 'runCount': 2, 'joinedCsvRows': len(used),
            'historyBytes': len(packet_bytes), 'effortAndInspector': 'PASS'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--checkout', required=True)
    parser.add_argument('--tree', required=True)
    parser.add_argument('--require-history', action='store_true', help='require and independently audit the additional saved-history originals')
    args = parser.parse_args()
    sb3 = args.directory / 'sim-lab-measurement-edit.sb3'
    report = args.directory / 'sim-lab-measurement-edit.json'
    require(sb3.stat().st_size <= 8 * 1024 * 1024 and report.stat().st_size <= 65536, 'input file bound')
    result = audit(sb3.read_bytes(), report.read_bytes(), args.checkout, args.tree)
    csv_path = args.directory / 'sim-lab-measurement-runs.csv'
    experiments = args.directory / 'sim-lab-measurement-experiments.json'
    require(csv_path.stat().st_size <= 8 * 1024 * 1024 and experiments.stat().st_size <= 65536, 'recording input bound')
    result['recording'] = audit_recording(csv_path.read_bytes(), experiments.read_bytes(), args.checkout, args.tree)
    if args.require_history:
        result['history'] = audit_history(args.directory, csv_path.read_bytes(), args.checkout, args.tree)
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    main()
