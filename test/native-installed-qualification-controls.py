"""Admission controls: no app, compiler, guest or network is substituted."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import zipfile

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('qualification', Path(__file__).parents[1] / 'scripts/native-installed-qualification.py')
q = importlib.util.module_from_spec(spec)
spec.loader.exec_module(q)
HEAD = 'a' * 40


def pins():
    return {**q.ROOT_PINS, **{key: 'b' * 64 for key in q.HASH_PINS}}


def metadata():
    run = {'id': 42, 'head_sha': HEAD, 'repository': {'full_name': q.REPO},
           'path': '.github/workflows/build.yml', 'event': 'pull_request'}
    job = {'id': 43, 'name': 'build', 'conclusion': 'success', 'head_sha': HEAD, 'run_id': 42}
    artifact = {'id': 44, 'name': 'github-pages', 'expired': False,
                'workflow_run': {'id': 42, 'head_sha': HEAD}, 'size_in_bytes': 100,
                'digest': 'sha256:' + 'c' * 64}
    return run, [job], [artifact]


class Request(unittest.TestCase):
    def defaults(self):
        return {'consumer': HEAD, 'frontend_run': 42, 'compile_pins': pins()}

    def test_reviewed_default_and_complete_manual_request(self):
        self.assertEqual(q.build_request(self.defaults(), {}), self.defaults())
        override = {'consumer': 'd' * 40, 'frontend_run': '43', 'compile_pins': json.dumps(pins())}
        self.assertEqual(q.build_request(self.defaults(), override),
                         {'consumer': 'd' * 40, 'frontend_run': 43, 'compile_pins': pins()})

    def test_partial_overrides_invalid_identity_and_extra_fields_refuse(self):
        for override in [{'consumer': HEAD}, {'frontend_run': '42'}, {'compile_pins': json.dumps(pins())}]:
            with self.subTest(override=override), self.assertRaises(ValueError):
                q.build_request(self.defaults(), override)
        for key, value in [('consumer', 'a' * 7), ('frontend_run', True), ('frontend_run', 2**53)]:
            defaults = self.defaults(); defaults[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError): q.build_request(defaults, {})
        with self.assertRaises(ValueError): q.build_request({**self.defaults(), 'shell': 'command'}, {})

    def test_cli_emits_only_validated_single_line_step_outputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); defaults = root / 'request.json'; defaults.write_text(json.dumps(self.defaults()))
            output = root / 'step-output'
            env = {**os.environ, 'GITHUB_OUTPUT': str(output), 'NATIVE_CONSUMER': '',
                   'NATIVE_FRONTEND_RUN': '', 'BW_NATIVE_PROFILE_PINS': ''}
            result = subprocess.run([sys.executable, str(Path(q.__file__)), 'request', '--defaults', str(defaults)],
                                    env=env, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            rows = dict(line.split('=', 1) for line in output.read_text().splitlines())
            self.assertEqual(set(rows), {'consumer', 'frontend_run', 'compile_pins'})
            self.assertEqual(rows['consumer'], HEAD); self.assertEqual(rows['frontend_run'], '42')
            self.assertEqual(json.loads(rows['compile_pins']), pins())
            output.unlink()
            env.update({'NATIVE_CONSUMER': HEAD + '\nATTACK=1', 'NATIVE_FRONTEND_RUN': '42',
                        'BW_NATIVE_PROFILE_PINS': json.dumps(pins())})
            result = subprocess.run([sys.executable, str(Path(q.__file__)), 'request', '--defaults', str(defaults)],
                                    env=env, text=True, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(output.exists())

    def test_native_build_cannot_start_from_local_or_unrelated_workflow(self):
        for override in [{'GITHUB_ACTIONS': 'false'}, {'GITHUB_REPOSITORY': 'foreign/repo'},
                         {'GITHUB_JOB': 'other'}, {'GITHUB_WORKFLOW_REF': q.REPO + '/.github/workflows/release.yml@refs/heads/main'}]:
            env = {**os.environ, 'GITHUB_ACTIONS': 'true', 'GITHUB_REPOSITORY': q.REPO,
                   'GITHUB_JOB': 'executable',
                   'GITHUB_WORKFLOW_REF': q.REPO + '/.github/workflows/native-installed-qualification.yml@refs/heads/main',
                   **override}
            with self.subTest(override=override), tempfile.TemporaryDirectory() as tmp:
                result = subprocess.run([sys.executable, str(Path(q.__file__)), 'build', '--output', str(Path(tmp) / 'absent')],
                                        env=env, text=True, capture_output=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('declared hosted qualification job', result.stderr)
                self.assertNotIn('FileNotFoundError', result.stderr)


class Profile(unittest.TestCase):
    def test_closed_profile_accepts_exact_relative_layout_and_complete_hashes(self):
        self.assertEqual(q.profile(json.dumps(pins())), pins())

    def test_missing_extra_or_environment_injection_keys_refuse(self):
        for key in pins():
            broken = pins(); del broken[key]
            with self.subTest(missing=key), self.assertRaises(ValueError):
                q.profile(json.dumps(broken))
        for key in ['PATH', 'TAURI_CONFIG', 'BW_RENODE_EXECUTABLE', 'GH_TOKEN']:
            with self.subTest(extra=key), self.assertRaises(ValueError):
                q.profile(json.dumps({**pins(), key: '/private/input'}))

    def test_optional_compiled_model_profile_pin_is_admitted_only_as_a_complete_hash(self):
        compiled = {**pins(), 'BW_RENODE_MICROPYTHON_PROFILE_SHA256': 'c' * 64}
        self.assertEqual(q.profile(json.dumps(compiled)), compiled)
        for value in ['', 'C' * 64, 'c' * 63, '../profile.json', 'c' * 64 + '\n']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                q.profile(json.dumps({**pins(), 'BW_RENODE_MICROPYTHON_PROFILE_SHA256': value}))

    def test_unknown_environment_key_refuses_before_it_can_reach_compiler(self):
        with self.assertRaises(ValueError):
            q.profile(json.dumps({**pins(), 'TAURI_CONFIG': '{}'}))

    def test_absolute_traversal_alternate_and_multiline_roots_refuse(self):
        for key in q.ROOT_PINS:
            for value in ['/private/runtime', '../runtime', 'nuttx\nPATH=bad', 'other', None]:
                broken = pins(); broken[key] = value
                with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                    q.profile(json.dumps(broken))

    def test_partial_uppercase_nonnumeric_and_multiline_hashes_refuse(self):
        for key in q.HASH_PINS:
            for value in ['a' * 63, 'A' * 64, 'g' * 64, 'a' * 64 + '\nPATH=x', 1, None]:
                broken = pins(); broken[key] = value
                with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                    q.profile(json.dumps(broken))

    def test_duplicate_json_keys_and_oversized_declarations_refuse(self):
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            q.profile(json.dumps(pins())[:-1] + ',"BW_RENODE_SHA256":"' + 'd' * 64 + '"}')
        with self.assertRaises(ValueError): q.profile(' ' * 16385)
        with self.assertRaises(ValueError): q.profile('[]')


class Metadata(unittest.TestCase):
    def test_same_source_official_successful_build_is_admitted_while_other_jobs_can_run(self):
        run, jobs, artifacts = metadata()
        jobs.append({'name': 'browser (heavy)', 'conclusion': None})
        self.assertEqual(q.admit_metadata(run, jobs, artifacts, HEAD, 42), (jobs[0], artifacts[0]))

    def test_foreign_source_run_repo_workflow_and_event_refuse(self):
        for key, value in [('id', 41), ('head_sha', 'd' * 40), ('repository', {'full_name': 'other/repo'}),
                           ('path', '.github/workflows/release.yml'), ('event', 'workflow_dispatch')]:
            run, jobs, artifacts = metadata(); run[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                q.admit_metadata(run, jobs, artifacts, HEAD, 42)
        for head in ['a' * 7, 'a' * 39, 'G' * 40]:
            with self.subTest(head=head), self.assertRaises(ValueError):
                q.admit_metadata(*metadata(), head, 42)
        for run_id in [True, 0, -1, '42']:
            with self.subTest(run=run_id), self.assertRaises(ValueError):
                q.admit_metadata(*metadata(), HEAD, run_id)

    def test_failed_pending_missing_duplicated_or_other_source_build_refuses(self):
        for key, value in [('conclusion', 'failure'), ('conclusion', None), ('head_sha', 'd' * 40), ('run_id', 41)]:
            run, jobs, artifacts = metadata(); jobs[0][key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                q.admit_metadata(run, jobs, artifacts, HEAD, 42)
        for jobs in [[], metadata()[1] * 2]:
            with self.subTest(jobs=jobs), self.assertRaises(ValueError):
                q.admit_metadata(metadata()[0], jobs, metadata()[2], HEAD, 42)

    def test_foreign_expired_duplicate_missing_or_unhashed_artifact_refuses(self):
        mutations = [('workflow_run', {'id': 41, 'head_sha': HEAD}),
                     ('workflow_run', {'id': 42, 'head_sha': 'd' * 40}),
                     ('expired', True), ('digest', ''), ('digest', 'sha256:' + 'x' * 64),
                     ('size_in_bytes', 0), ('size_in_bytes', q.LIMIT), ('id', True)]
        for key, value in mutations:
            run, jobs, artifacts = metadata(); artifacts[0][key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                q.admit_metadata(run, jobs, artifacts, HEAD, 42)
        for artifacts in [[], metadata()[2] * 2]:
            with self.subTest(artifacts=artifacts), self.assertRaises(ValueError):
                q.admit_metadata(metadata()[0], metadata()[1], artifacts, HEAD, 42)


def fixture_archive(root, members):
    data = io.BytesIO()
    with tarfile.open(fileobj=data, mode='w') as tar:
        for name, body, kind in members:
            member = tarfile.TarInfo(name); member.size = len(body)
            if kind == 'link': member.type = tarfile.SYMTYPE; member.linkname = '/private/input'
            tar.addfile(member, io.BytesIO(body))
    archive = root / 'frontend.zip'
    with zipfile.ZipFile(archive, 'w') as z: z.writestr('artifact.tar', data.getvalue())
    artifact = {'size_in_bytes': archive.stat().st_size,
                'digest': 'sha256:' + hashlib.sha256(archive.read_bytes()).hexdigest()}
    return archive, artifact


class Frontend(unittest.TestCase):
    def test_complete_frontend_extracts_and_hashes_every_real_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            members = [(name, b'actual fixture bytes', 'file') for name in
                       ['index.html', 'capability-broker.html', 'brickwright-build.json', 'static/gui.js']]
            archive, artifact = fixture_archive(root, members)
            inventory = q.extract_frontend(archive, artifact, root / 'frontend')
            self.assertEqual(set(inventory), {m[0] for m in members})
            for name, digest in inventory.items():
                self.assertEqual(hashlib.sha256((root / 'frontend' / name).read_bytes()).hexdigest(), digest)

    def test_unsafe_roster_refuses_before_any_extraction(self):
        for members in [[('/absolute', b'x', 'file')], [('../escape', b'x', 'file')],
                        [('a\\b', b'x', 'file')], [('link', b'', 'link')],
                        [('same', b'x', 'file'), ('./same', b'y', 'file')]]:
            with self.subTest(members=members), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp); archive, artifact = fixture_archive(root, members)
                with self.assertRaises(ValueError): q.extract_frontend(archive, artifact, root / 'frontend')
                self.assertFalse((root / 'frontend').exists())

    def test_changed_archive_or_publisher_size_refuses(self):
        for key, value in [('digest', 'sha256:' + 'a' * 64), ('size_in_bytes', 1)]:
            with self.subTest(key=key), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                members = [(n, b'x', 'file') for n in ['index.html', 'capability-broker.html', 'brickwright-build.json']]
                archive, artifact = fixture_archive(root, members)
                artifact[key] = value
                with self.assertRaisesRegex(ValueError, 'integrity'): q.extract_frontend(archive, artifact, root / 'frontend')
                self.assertFalse((root / 'frontend').exists())

    def test_stub_frontend_cannot_supply_editor_broker_or_source_stamp(self):
        for missing in ['index.html', 'capability-broker.html', 'brickwright-build.json']:
            with self.subTest(missing=missing), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                members = [(n, b'x', 'file') for n in ['index.html', 'capability-broker.html', 'brickwright-build.json'] if n != missing]
                archive, artifact = fixture_archive(root, members)
                with self.assertRaisesRegex(ValueError, 'Complete real'): q.extract_frontend(archive, artifact, root / 'frontend')


class SourceBinding(unittest.TestCase):
    def test_whole_input_tree_rejects_added_missing_changed_and_linked_files(self):
        for change in ['none', 'added', 'missing', 'changed', 'link']:
            with self.subTest(change=change), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp); (root / 'input').write_bytes(b'original')
                expected = {'input': hashlib.sha256(b'original').hexdigest()}
                if change == 'added': (root / 'extra').write_bytes(b'extra')
                if change == 'missing': (root / 'input').unlink()
                if change == 'changed': (root / 'input').write_bytes(b'changed')
                if change == 'link': (root / 'link').symlink_to(root / 'input')
                if change == 'none': q.verify_tree(root, expected)
                else:
                    with self.assertRaises(ValueError): q.verify_tree(root, expected)

    def test_primary_checkout_has_one_full_identity(self):
        log = '\n'.join(['Syncing repository: ' + q.REPO, 'git log -1 --format=%H', HEAD,
                         '##[group]Run actions/setup-node@pinned', 'git log -1 --format=%H', 'b' * 40])
        self.assertEqual(q.checkout_from_log(log), HEAD)

    def test_missing_ambiguous_partial_or_foreign_checkout_refuses(self):
        logs = ['', 'Syncing repository: other/repo\ngit log -1 --format=%H\n' + HEAD,
                'Syncing repository: ' + q.REPO + '\ngit log -1 --format=%H\nabcdefg\n##[group]Run actions/setup-node@x',
                'Syncing repository: ' + q.REPO + '\ngit log -1 --format=%H\n' + HEAD +
                '\ngit log -1 --format=%H\n' + HEAD + '\n##[group]Run actions/setup-node@x']
        for log in logs:
            with self.subTest(log=log), self.assertRaises(ValueError): q.checkout_from_log(log)

    def test_only_declared_documentation_can_commute_with_actual_checkout(self):
        self.assertTrue(q.prose_only([]))
        self.assertTrue(q.prose_only(['docs/guide.md', 'lanes/claim.md']))
        for path in ['apps/tauri/src-tauri/src/lib.rs', 'overlay/app.js', '.github/workflows/build.yml',
                     'package-lock.json', 'docs/runtime.js', 'LANES.md']:
            self.assertFalse(q.prose_only([path]), path)



class RawJobLogTransport(unittest.TestCase):
    def test_exact_log_endpoint_preserves_authored_ansi_bytes(self):
        raw = b'checkout\n\x1b[33mauthored warning\x1b[0m\n'.decode('unicode_escape').encode('latin1')
        expected = ['gh', 'api', 'repos/' + q.REPO + '/actions/jobs/43/logs', '--allow-escape-sequences']
        with patch.object(q.subprocess, 'check_output', return_value=raw) as call:
            self.assertEqual(q.api('actions/jobs/43/logs'), raw)
        call.assert_called_once_with(expected, timeout=120)

    def test_json_metadata_keeps_default_cli_handling(self):
        raw = b'{"head_sha":"reviewed"}\n'
        with patch.object(q.subprocess, 'check_output', return_value=raw) as call:
            self.assertEqual(q.api('actions/runs/42'), raw)
        call.assert_called_once_with(['gh', 'api', 'repos/' + q.REPO + '/actions/runs/42'], timeout=120)

    def test_raw_option_is_not_enabled_for_other_or_near_match_endpoints(self):
        for endpoint in ['actions/runs/42/logs', 'actions/jobs/0/logs', 'actions/jobs/-1/logs',
                         'actions/jobs/43/logs/extra', 'actions/jobs/43/logs?raw=1',
                         'actions/jobs/43/logs\n', 'actions/jobs/43', 'actions/jobs/43/logs.json']:
            with self.subTest(endpoint=endpoint), patch.object(q.subprocess, 'check_output', return_value=b'raw') as call:
                self.assertEqual(q.api(endpoint), b'raw')
                call.assert_called_once_with(['gh', 'api', 'repos/' + q.REPO + '/' + endpoint], timeout=120)

    def test_transport_failure_is_preserved_without_retry(self):
        error = subprocess.CalledProcessError(1, ['gh', 'api'], output=b'original failure')
        with patch.object(q.subprocess, 'check_output', side_effect=error) as call:
            with self.assertRaises(subprocess.CalledProcessError) as caught:
                q.api('actions/jobs/43/logs')
        self.assertIs(caught.exception, error)
        self.assertEqual(call.call_count, 1)


if __name__ == '__main__':
    unittest.main()
