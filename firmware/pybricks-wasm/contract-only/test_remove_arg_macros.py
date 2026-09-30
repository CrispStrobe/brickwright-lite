# SPDX-License-Identifier: BSD-3-Clause
# Copyright (c) 2026 Brickwright contributors
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import remove_arg_macros as converter

MIT = '// SPDX-License-Identifier: MIT\n// Copyright synthetic author\n'
INC = '#include "pybricks/util_mp/pb_kwarg_helper.h"\n'
FUNCTION = '''void f(size_t n_args, const mp_obj_t *pos_args, mp_map_t *kw_args) {
    PB_PARSE_ARGS_FUNCTION((n_args), (pos_args), (kw_args),
        PB_ARG_REQUIRED(a), PB_ARG_DEFAULT_INT(b, (ENUM + CALL(1, 2))),
        PB_ARG_DEFAULT_OBJ(c, obj), PB_ARG_DEFAULT_QSTR(d, token),
        PB_ARG_DEFAULT_TRUE(e), PB_ARG_DEFAULT_FALSE(f), PB_ARG_DEFAULT_NONE(g));
    a_in = b_in;
    USE(a_in); USE(c_in); USE(d_in); USE(e_in); USE(f_in); USE(g_in);
    USE(allowed_args); USE(parsed_args);
    USE(PB_PARSE_ARGS_METHOD_ALL_NONE());
}
'''


class ConversionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.base = Path(self.tmp.name)
        self.source = self.base / 'src'
        self.output = self.base / 'out'
        self.source.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def put(self, name, text):
        path = self.source / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        return path

    def test_every_default_and_scoping(self):
        text = MIT + INC + FUNCTION
        out, counts, removed = converter.translate(text, 'synthetic.c')
        self.assertEqual(removed, 1)
        self.assertEqual(counts['PB_PARSE_ARGS_FUNCTION'], 1)
        self.assertEqual(counts['PB_PARSE_ARGS_METHOD_ALL_NONE'], 1)
        for value in ['MP_ARG_OBJ | MP_ARG_REQUIRED', 'MP_ROM_PTR(NULL)',
                      'MP_ROM_INT((ENUM + CALL(1, 2)))', 'MP_ROM_PTR(&obj)',
                      'MP_ROM_QSTR(MP_QSTR_token)', 'MP_ROM_TRUE',
                      'MP_ROM_FALSE', 'MP_ROM_NONE']:
            self.assertIn(value, out)
        self.assertIn('mp_obj_t a_in = parsed_args[0].u_obj;', out)
        self.assertIn('a_in = b_in;', out)
        self.assertIn('pb_obj_parsed_args_all_none(parsed_args, MP_ARRAY_SIZE(parsed_args))', out)
        self.assertTrue(out.startswith(MIT))
        self.assertEqual(converter.translate(out, 'synthetic.c')[0], out)

    def test_method_skip_constructor(self):
        methods = '''void method(void) {
    PB_PARSE_ARGS_METHOD(n, pos, kw, struct device_t, device, PB_ARG_DEFAULT_NONE(x));
    device->x = x_in;
}
void skip(void) {
    PB_PARSE_ARGS_METHOD_SKIP_SELF(n, pos, kw, PB_ARG_REQUIRED(x));
    x_in = 0;
}
void constructor(void) {
    PB_PARSE_ARGS_CLASS((n), (k), (objects), PB_ARG_REQUIRED(x));
    USE(kw_args); USE(allowed_args); USE(parsed_args); USE(x_in);
}
'''
        out, counts, _ = converter.translate(MIT + INC + methods, 'method.c')
        self.assertIn('struct device_t *device = MP_OBJ_TO_PTR((pos)[0]);', out)
        self.assertEqual(out.count('mp_arg_parse_all((n) - 1, (pos) + 1, (kw)'), 2)
        self.assertIn('mp_map_init_fixed_table(&kw_args, ((k)), ((objects)) + ((n)));', out)
        self.assertIn('mp_arg_parse_all(((n)), ((objects)), &kw_args', out)
        self.assertEqual(counts['PB_PARSE_ARGS_CLASS'], 1)

    def test_nested_comma_and_many_descriptors(self):
        descriptors = ['PB_ARG_DEFAULT_INT(a, ((int[]){1, 2})[CALL(0, 1)])']
        descriptors += [f'PB_ARG_DEFAULT_NONE(x{i})' for i in range(100)]
        source = MIT + 'void f(void) { PB_PARSE_ARGS_FUNCTION(n, p, k, ' + ', '.join(descriptors) + '); }\n'
        out, _, _ = converter.translate(source, 'many.c')
        self.assertIn('MP_ROM_INT(((int[]){1, 2})[CALL(0, 1)])', out)
        self.assertIn('mp_obj_t x99_in = parsed_args[100].u_obj;', out)

    def test_comments_strings_and_include_order(self):
        untouched = '''// PB_PARSE_ARGS_WRONG(thing); PB_ARG_UNKNOWN(x)
/* #include "pybricks/util_mp/pb_kwarg_helper.h"
PB_PARSE_ARGS_FUNCTION(n, p, k, PB_ARG_REQUIRED(x)); */
const char *example = "PB_ARG_REQUIRED(x), PB_PARSE_ARGS_FUNCTION()";
char quote = '\\'';
'''
        text = MIT + '#include "a.h"\n' + INC + '#include <b.h>\n' + untouched + FUNCTION
        out, _, _ = converter.translate(text, 'comments.c')
        self.assertIn(untouched, out)
        self.assertLess(out.index('#include "a.h"'), out.index('#include <b.h>'))
        self.assertIn('#include "py/runtime.h"', out)
        self.assertEqual(out.count('#include "pybricks/util_mp/pb_obj_helper.h"'), 1)
        # A header with only a removable include needs no runtime API include.
        out, _, _ = converter.translate(MIT + INC, 'header.h')
        self.assertEqual(out, MIT)

    def test_continued_include(self):
        continued = '#include ' + chr(92) + '\n "pybricks/util_mp/pb_kwarg_helper.h"\n'
        out, _, removed = converter.translate(MIT + continued + FUNCTION, 'continued.c')
        self.assertEqual(removed, 1)
        self.assertNotIn(converter.DEPENDENCY, out)
        self.assertIn('#include "py/runtime.h"', out)

    def test_comments_inside_invocations_and_on_include(self):
        comments = ["/* PB_ARG_WRONG(x) */", "/* name comment */", "// descriptor note",
                    "/* integer comment */", "/* removed include comment */"]
        text = MIT + INC.rstrip() + " " + comments[4] + "\n" +             "void f(void) {\n" +             " PB_PARSE_ARGS_FUNCTION " + comments[0] + " (n, p, k,\n" +             " PB_ARG_REQUIRED(" + comments[1] + "x), " + comments[2] + "\n" +             " PB_ARG_DEFAULT_INT(y, (1 " + comments[3] + " + 2)));\n}\n"
        out, _, _ = converter.translate(text, 'comments.c')
        for comment in comments:
            self.assertEqual(out.count(comment), 1)
        self.assertEqual(converter.translate(out, 'comments.c')[0], out)

    def test_errors_are_named_and_atomic(self):
        invalids = ['PB_ARG_UNKNOWN(x)', 'PB_ARG_DEFAULT_INT(x)',
                    'PB_ARG_DEFAULT_QSTR(x, "token")', 'PB_ARG_REQUIRED(a-b)',
                    'PB_ARG_DEFAULT_NONE(x), PB_ARG_REQUIRED(x)',
                    'PB_ARG_DEFAULT_INT(x, PB_ARG_REQUIRED(y))']
        for descriptor in invalids:
            with self.subTest(descriptor=descriptor):
                text = MIT + 'void f(void) {\n PB_PARSE_ARGS_FUNCTION(n, p, k, ' + descriptor + ');\n}\n'
                with self.assertRaisesRegex(converter.ConversionError, r'bad.c:4:'):
                    converter.translate(text, 'bad.c')
        for invocation in ['PB_PARSE_ARGS_UNKNOWN()', 'PB_ARG_REQUIRED(x)',
                           'PB_PARSE_ARGS_FUNCTION(n, p, k)',
                           'PB_PARSE_ARGS_METHOD_ALL_NONE(x)']:
            with self.assertRaises(converter.ConversionError):
                converter.translate(MIT + f'void f(void) {{ {invocation}; }}', 'bad.c')
        self.put('pybricks/a.c', MIT + INC + FUNCTION)
        self.put('pybricks/z.c', MIT + 'void f(void) { PB_ARG_WRONG(x); }')
        with self.assertRaises(converter.ConversionError):
            converter.convert(self.source, self.output)
        self.assertFalse(self.output.exists())
        self.output.mkdir()
        (self.output / 'existing').write_text('preserved')
        with self.assertRaises(converter.ConversionError):
            converter.convert(self.source, self.output)
        self.assertEqual(list(self.output.iterdir()), [self.output / 'existing'])

    def test_licences(self):
        for licence in ['', '// SPDX-License-Identifier: GPL-3.0-only\n',
                        '// SPDX-License-Identifier: MIT OR BSD-3-Clause\n',
                        MIT + '// SPDX-License-Identifier: BSD-3-Clause\n']:
            with self.assertRaisesRegex(converter.ConversionError, 'exact standalone MIT'):
                converter.translate(licence + INC + FUNCTION, 'licence.c')
        for licence in ['/* SPDX-License-Identifier: MIT */\n',
                        '/*\n * SPDX-License-Identifier: MIT\n */\n']:
            converter.translate(licence + INC + FUNCTION, 'licence.c')
        plain = '// SPDX-License-Identifier: GPL-3.0-only\nvoid f(void) {}\n'
        self.assertEqual(converter.translate(plain, 'untargeted.c')[0], plain)

    def test_exclusions_and_manifest(self):
        original = self.put('pybricks/a.c', MIT + INC + FUNCTION)
        self.put('pybricks/util_mp/pb_kwarg_helper.h', 'DO NOT OPEN')
        self.put('pybricks/other/pb_kwarg_helper.h', 'DO NOT OPEN')
        self.put('outside/x.c', 'DO NOT OPEN')
        self.put('pybricks/.git/x.c', 'DO NOT OPEN')
        self.put('pybricks/x.txt', 'DO NOT OPEN')
        self.put('pybricks/unchanged.h', MIT + 'void unchanged(void);\n')
        actual_read = Path.read_bytes
        reads = []
        def checked_read(path):
            reads.append(path.relative_to(self.source).as_posix())
            self.assertNotEqual(path.name, converter.FORBIDDEN)
            self.assertTrue(reads[-1].startswith('pybricks/'))
            self.assertNotIn('/.git/', reads[-1])
            return actual_read(path)
        manifest = self.output / 'manifest.json'
        before = original.read_bytes()
        with patch.object(Path, 'read_bytes', checked_read):
            first = converter.convert(self.source, self.output, manifest)
        self.assertEqual(original.read_bytes(), before)
        self.assertEqual(set(reads), {'pybricks/a.c', 'pybricks/unchanged.h'})
        self.assertFalse((self.output / 'pybricks/unchanged.h').exists())
        manifest_bytes = manifest.read_bytes()
        again = converter.convert(self.source, self.output, manifest)
        self.assertEqual(first, again)
        self.assertEqual(manifest.read_bytes(), manifest_bytes)
        record = first['files'][0]
        self.assertEqual(record['source_sha256'], converter.digest(before))
        self.assertEqual(record['output_sha256'], converter.digest((self.output / 'pybricks/a.c').read_bytes()))
        second = converter.convert(self.output, self.base / 'second')
        self.assertEqual(second['files'], [])
        self.assertEqual(list((self.base / 'second').iterdir()), [])

    def test_overlap_symlinks_and_unsafe_statements(self):
        self.put('pybricks/x.c', MIT + INC + FUNCTION)
        for output in [self.source, self.source / 'output', self.base]:
            with self.assertRaisesRegex(converter.ConversionError, 'overlap'):
                converter.convert(self.source, output)
        link = self.source / 'pybricks/link.c'
        link.symlink_to(self.source / 'pybricks/x.c')
        with self.assertRaisesRegex(converter.ConversionError, 'symlink'):
            converter.convert(self.source, self.output)
        self.assertFalse(self.output.exists())
        link.unlink()
        self.output.mkdir()
        (self.output / converter.FORBIDDEN).write_text('DO NOT OPEN')
        with self.assertRaisesRegex(converter.ConversionError, 'forbidden header'):
            converter.convert(self.source, self.output)
        self.assertEqual((self.output / converter.FORBIDDEN).stat().st_size, 11)
        with self.assertRaisesRegex(converter.ConversionError, 'standalone'):
            converter.translate(MIT + 'void f(void) { if (x) PB_PARSE_ARGS_FUNCTION(n, p, k, PB_ARG_REQUIRED(a)); }', 'bad.c')

    def test_directive_aware_statement_boundary(self):
        reproduction = MIT + "void f(void) {\n#if SYNTHETIC_FEATURE\n" +             "PB_PARSE_ARGS_FUNCTION(n, p, k, PB_ARG_REQUIRED(x));\n#endif\n}\n"
        out, counts, _ = converter.translate(reproduction, 'conditional.c')
        self.assertEqual(counts['PB_PARSE_ARGS_FUNCTION'], 1)
        self.assertIn('#if SYNTHETIC_FEATURE\nstatic const', out)
        self.assertIn('mp_obj_t x_in = parsed_args[0].u_obj;\n#endif\n}', out)
        self.assertEqual(converter.translate(out, 'conditional.c')[0], out)
        directives = '#if FEATURE\n#define EXAMPLE } ' + chr(92) + '\n continued\n'
        text = MIT + 'void f(void) {\n' + directives +             'PB_PARSE_ARGS_FUNCTION(n, p, k, PB_ARG_REQUIRED(x));\n#else\n' +             'PB_PARSE_ARGS_FUNCTION(n, p, k, PB_ARG_REQUIRED(y));\n#endif\n}\n'
        out, counts, _ = converter.translate(text, 'branches.c')
        self.assertEqual(counts['PB_PARSE_ARGS_FUNCTION'], 2)
        self.assertIn(directives, out)
        self.assertIn('#else\n', out)
        self.assertIn('#endif\n', out)

    def test_directives_do_not_hide_unbraced_control_bodies(self):
        prefixes = ['if (condition)', 'for (int i = 0; i < 1; i++)',
                    'while (condition)', 'switch (condition)',
                    'if (condition) {} else', 'do']
        for prefix in prefixes:
            with self.subTest(prefix=prefix):
                text = MIT + 'void f(void) {\n' + prefix +                     '\n#if SYNTHETIC_FEATURE\n' +                     'PB_PARSE_ARGS_FUNCTION(n, p, k, PB_ARG_REQUIRED(x));\n#endif\n}\n'
                with self.assertRaisesRegex(converter.ConversionError, 'standalone'):
                    converter.translate(text, 'unbraced.c')
        # Directive content cannot smuggle a new statement boundary.
        text = MIT + 'void f(void) { if (condition)\n#define EXAMPLE }\n' +             'PB_PARSE_ARGS_FUNCTION(n, p, k, PB_ARG_REQUIRED(x));\n}\n'
        with self.assertRaisesRegex(converter.ConversionError, 'standalone'):
            converter.translate(text, 'unbraced.c')
        with self.assertRaisesRegex(converter.ConversionError, 'preprocessor directive'):
            converter.translate(MIT + '#define PARSE() PB_PARSE_ARGS_FUNCTION(n, p, k, PB_ARG_REQUIRED(x));\n', 'define.c')

    def test_conditional_descriptor_groups(self):
        source = MIT + '''void f(void) {
PB_PARSE_ARGS_CLASS(n, k, p, PB_ARG_DEFAULT_NONE(first)
#if OPTION == 1
, PB_ARG_DEFAULT_NONE(one)
#elif OPTION == 2
, PB_ARG_DEFAULT_NONE(two)
#else
, PB_ARG_DEFAULT_NONE(other)
#endif
#ifdef EXTRA
#ifndef OMIT
, PB_ARG_DEFAULT_NONE(extra)
#endif
#endif
, PB_ARG_DEFAULT_NONE(after));
}
'''
        out, counts, _ = converter.translate(source, 'groups.c')
        self.assertEqual(counts['PB_PARSE_ARGS_CLASS'], 1)
        for directive in ['#if OPTION == 1', '#elif OPTION == 2', '#else',
                          '#ifdef EXTRA', '#ifndef OMIT']:
            self.assertEqual(out.count(directive), 3)
        self.assertIn('mp_obj_t after_in = parsed_args[pb_arg_index_after].u_obj;', out)
        self.assertEqual(converter.translate(out, 'groups.c')[0], out)

    def test_unsupported_conditional_descriptor_shapes(self):
        bad_lists = [
            'PB_ARG_DEFAULT_NONE(first)\n#if OPTION\n, PB_ARG_DEFAULT_NONE(extra)',
            'PB_ARG_DEFAULT_NONE(first)\n#endif',
            'PB_ARG_DEFAULT_NONE(first)\n#if OPTION\n#else\n#elif OTHER\n#endif',
            'PB_ARG_DEFAULT_NONE(first)\n#define EXTRA 1',
            'PB_ARG_DEFAULT_NONE(first)\n#if OPTION\n,\n#endif',
            'PB_ARG_DEFAULT_NONE(first)\n#if OPTION\nPB_ARG_DEFAULT_NONE(extra)\n#endif',
            '\n#if OPTION\nPB_ARG_DEFAULT_NONE(first)\n#endif',
            'PB_ARG_DEFAULT_NONE(first)\n#if OPTION\n, PB_ARG_DEFAULT_NONE(first)\n#endif',
        ]
        for descriptors in bad_lists:
            with self.subTest(descriptors=descriptors):
                source = MIT + 'void f(void) { PB_PARSE_ARGS_CLASS(n,k,p,' + descriptors + '\n); }'
                with self.assertRaises(converter.ConversionError):
                    converter.translate(source, 'bad-conditional.c')

    def test_conditional_descriptor_compile_and_run_both_options(self):
        cc = shutil.which('cc')
        if not cc:
            self.skipTest('C compiler unavailable')
        runtime = self.base / 'include/py/runtime.h'
        runtime.parent.mkdir(parents=True)
        runtime.write_text('''typedef unsigned long size_t;
typedef unsigned long mp_obj_t;
typedef unsigned long mp_uint_t;
typedef unsigned int qstr;
typedef struct { unsigned long payload; unsigned long tag; } mp_rom_obj_t;
typedef union { mp_obj_t u_obj; mp_rom_obj_t u_rom_obj; } mp_arg_val_t;
typedef struct { qstr qst; mp_uint_t flags; mp_arg_val_t defval; } mp_arg_t;
typedef struct { size_t used; const mp_obj_t *table; } mp_map_t;
#define MP_ARRAY_SIZE(x) (sizeof(x) / sizeof((x)[0]))
#define MP_ARG_OBJ 1
#define MP_ROM_NONE { 0, 5 }
#define MP_QSTR_first 1
#define MP_QSTR_second 2
#define MP_QSTR_extra 3
#define MP_QSTR_last 4
#define MP_QSTR_after 5
static int parse_error;
static void mp_map_init_fixed_table(mp_map_t *map, size_t n, const mp_obj_t *pairs) {
 map->used = n; map->table = pairs;
}
static void mp_arg_parse_all(size_t n, const mp_obj_t *p, mp_map_t *kw, size_t count, const mp_arg_t *allowed, mp_arg_val_t *out) {
 if (n != 0 || kw->used != 0 || kw->table != p || count != (SYNTHETIC_OPTION ? 5 : 3)) parse_error = 1;
 if (allowed[count - 1].qst != MP_QSTR_after) parse_error = 1;
 for (size_t i = 0; i < count; i++) out[i].u_obj = 100 + i;
}
''')
        source = MIT + '''int f(size_t n, size_t k, const mp_obj_t *p) {
PB_PARSE_ARGS_CLASS(n, k, p,
 PB_ARG_DEFAULT_NONE(first),
 PB_ARG_DEFAULT_NONE(second)
 #if SYNTHETIC_OPTION
 , PB_ARG_DEFAULT_NONE(extra)
 , PB_ARG_DEFAULT_NONE(last)
 #endif
 , PB_ARG_DEFAULT_NONE(after)
 );
 if (first_in != 100 || second_in != 101) return 1;
 #if SYNTHETIC_OPTION
 if (extra_in != 102 || last_in != 103) return 2;
 _Static_assert(pb_arg_index_after == 4, "enabled trailing index");
 #else
 _Static_assert(pb_arg_index_after == 2, "disabled trailing index");
 #endif
 if (after_in != (SYNTHETIC_OPTION ? 104 : 102)) return 3;
 after_in = 7;
 return after_in != 7 || parse_error;
}
int main(void) { mp_obj_t p[1] = {0}; return f(0, 0, p); }
'''
        out, _, _ = converter.translate(source, 'conditional.c')
        generated = self.base / 'conditional.c'
        generated.write_text(out)
        for option in (0, 1):
            with self.subTest(option=option):
                binary = self.base / f'conditional-{option}'
                command = [cc, '-std=c11', '-Wall', '-Wextra', '-Werror',
                           f'-DSYNTHETIC_OPTION={option}', '-I', str(self.base / 'include'),
                           str(generated), '-o', str(binary)]
                compiled = subprocess.run(command, capture_output=True, text=True, cwd=Path(__file__).parent)
                self.assertEqual(compiled.returncode, 0, compiled.stderr)
                run = subprocess.run([str(binary)], capture_output=True, text=True, cwd=Path(__file__).parent)
                self.assertEqual(run.returncode, 0, run.stderr)

    def test_publish_failure_restores_previous_output(self):
        self.put('pybricks/a.c', MIT + INC + FUNCTION)
        self.output.mkdir()
        (self.output / 'existing').write_text('preserved')
        manifest = self.base / 'manifest.json'
        manifest.write_text('previous manifest')
        with patch.object(converter.os, 'replace', side_effect=OSError('synthetic publication failure')):
            with self.assertRaisesRegex(OSError, 'publication failure'):
                converter.convert(self.source, self.output, manifest)
        self.assertEqual(list(self.output.iterdir()), [self.output / 'existing'])
        self.assertEqual((self.output / 'existing').read_text(), 'preserved')
        self.assertEqual(manifest.read_text(), 'previous manifest')
        self.assertFalse(list(self.base.glob('.arg-*')))

    def test_cli(self):
        self.put('pybricks/a.c', MIT + INC + FUNCTION)
        command = [shutil.which('python3'), str(Path(converter.__file__)), str(self.source), str(self.output), '--manifest', str(self.base / 'manifest.json')]
        run = subprocess.run(command, capture_output=True, text=True, cwd=Path(__file__).parent)
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(json.loads(run.stdout), json.loads((self.base / 'manifest.json').read_text()))

    def test_compile_with_braced_rom_initializers(self):
        cc = shutil.which('cc')
        if not cc:
            self.skipTest('C compiler unavailable')
        runtime = self.base / 'include/py/runtime.h'
        runtime.parent.mkdir(parents=True)
        runtime.write_text('''typedef unsigned long size_t;
typedef unsigned long mp_uint_t;
typedef unsigned long mp_obj_t;
typedef unsigned int qstr;
typedef struct { unsigned long payload; unsigned long tag; } mp_rom_obj_t;
typedef union { mp_obj_t u_obj; mp_rom_obj_t u_rom_obj; } mp_arg_val_t;
typedef struct { qstr qst; mp_uint_t flags; mp_arg_val_t defval; } mp_arg_t;
typedef struct { size_t used; const mp_obj_t *table; } mp_map_t;
#define MP_ARRAY_SIZE(x) (sizeof(x) / sizeof((x)[0]))
#define MP_ARG_OBJ 1
#define MP_ARG_REQUIRED 2
#define MP_ROM_INT(x) { (unsigned long)(x), 1 }
#define MP_ROM_PTR(x) { (unsigned long)(x), 2 }
#define MP_ROM_QSTR(x) { (unsigned long)(x), 3 }
#define MP_ROM_TRUE { 1, 4 }
#define MP_ROM_FALSE { 0, 4 }
#define MP_ROM_NONE { 0, 5 }
#define MP_OBJ_TO_PTR(x) ((void *)(x))
#define NULL ((void *)0)
#define MP_QSTR_a 1
#define MP_QSTR_b 2
#define MP_QSTR_c 3
#define MP_QSTR_d 4
#define MP_QSTR_e 5
#define MP_QSTR_f 6
#define MP_QSTR_g 7
#define MP_QSTR_token 8
void mp_arg_parse_all(size_t, const mp_obj_t *, mp_map_t *, size_t, const mp_arg_t *, mp_arg_val_t *);
void mp_map_init_fixed_table(mp_map_t *, size_t, const mp_obj_t *);
''')
        helper = self.base / 'include/pybricks/util_mp/pb_obj_helper.h'
        helper.parent.mkdir(parents=True)
        helper.write_text('int pb_obj_parsed_args_all_none(mp_arg_val_t *, size_t);\n')
        preamble = '#define USE(x) ((void)(x))\n#define ENUM 7\n#define CALL(a,b) ((a) + (b))\nstatic int obj;\n'
        methods = '''struct device_t { mp_obj_t a; };
void method(size_t n, const mp_obj_t *pos, mp_map_t *kw) {
 PB_PARSE_ARGS_METHOD(n, pos, kw, struct device_t, device, PB_ARG_DEFAULT_NONE(a));
 device->a = a_in;
}
void skip(size_t n, const mp_obj_t *pos, mp_map_t *kw) {
 PB_PARSE_ARGS_METHOD_SKIP_SELF(n, pos, kw, PB_ARG_REQUIRED(a));
 a_in = 0; USE(a_in);
}
void constructor(size_t n, size_t k, const mp_obj_t *args) {
 PB_PARSE_ARGS_CLASS(n, k, args, PB_ARG_DEFAULT_NONE(a));
 USE(allowed_args); USE(parsed_args); USE(kw_args); a_in = 0; USE(a_in);
}
'''
        text, _, _ = converter.translate(MIT + INC + preamble + '#define SYNTHETIC_FEATURE 1\n#if SYNTHETIC_FEATURE\n' + FUNCTION + '#endif\n' + methods, 'compiled.c')
        generated = self.base / 'generated.c'
        generated.write_text(text)
        command = [cc, '-std=c11', '-Wall', '-Wextra', '-Werror', '-fsyntax-only', '-I', str(self.base / 'include'), str(generated)]
        result = subprocess.run(command, capture_output=True, text=True, cwd=Path(__file__).parent)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__':
    unittest.main()
