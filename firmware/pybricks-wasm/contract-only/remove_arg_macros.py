#!/usr/bin/env python3
# SPDX-License-Identifier: BSD-3-Clause
# Copyright (c) 2026 Brickwright contributors
"""Replace caller argument convenience macros with explicit public C API calls.

No C preprocessing is performed. Candidate C/H files must be read to establish
whether they are callers and to inspect their licence; only MIT callers are
translated. All translations are validated before output is published.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile

FORBIDDEN = 'pb_kwarg_helper.h'
DEPENDENCY = 'pybricks/util_mp/' + FORBIDDEN
FAMILIES = ('PB_PARSE_ARGS_FUNCTION', 'PB_PARSE_ARGS_METHOD',
            'PB_PARSE_ARGS_METHOD_SKIP_SELF', 'PB_PARSE_ARGS_CLASS',
            'PB_PARSE_ARGS_METHOD_ALL_NONE')
IDENT = re.compile(r'[A-Za-z_][A-Za-z_0-9]*')
INCLUDE_SPACE = r'(?:[ \t]|\\\r?\n)*'
INCLUDE_PREFIX = r'[ \t]*#' + INCLUDE_SPACE + r'include\b' + INCLUDE_SPACE
INCLUDE_LITERAL = INCLUDE_PREFIX + r'[<"]([^>"\r\n]+)[>"]'
TARGET = re.compile(r'\b(?:PB_PARSE_ARGS_[A-Za-z_0-9]*|PB_ARG_[A-Za-z_0-9]*|pb_kwarg_helper)\b')


class ConversionError(ValueError):
    pass


def error(path, text, at, message):
    raise ConversionError(f'{path}:{text.count(chr(10), 0, at) + 1}: {message}')


def mask_c(text, path='<source>'):
    """Mask comments/literals, preserving offsets, newlines, and live tokens."""
    chars = list(text)
    i = 0
    while i < len(text):
        start = i
        if text.startswith('//', i):
            i += 2
            while i < len(text):
                if text[i] == '\n' and (i == 0 or text[i - 1] != '\\'):
                    break
                i += 1
        elif text.startswith('/*', i):
            end = text.find('*/', i + 2)
            if end < 0:
                error(path, text, i, 'unterminated comment')
            i = end + 2
        elif text[i] in '\"\'':
            quote = text[i]
            i += 1
            while i < len(text):
                if text[i] == '\\':
                    i += 2
                elif text[i] == quote:
                    i += 1
                    break
                else:
                    i += 1
            else:
                error(path, text, start, 'unterminated literal')
        else:
            i += 1
            continue
        for j in range(start, min(i, len(chars))):
            if chars[j] not in '\r\n':
                chars[j] = ' '
    return ''.join(chars)


def mask_directives(masked):
    """Ignore logical preprocessor lines when identifying C statement context.

    This does not evaluate conditionals or alter source text. Continuation lines
    belong to the directive and therefore cannot establish a C statement edge.
    """
    chars = list(masked)
    spans = []
    pattern = r'(?m)^[ \t]*#(?:[^\r\n]*\\\r?\n)*[^\r\n]*'
    for match in re.finditer(pattern, masked):
        spans.append(match.span())
        for i in range(*match.span()):
            if chars[i] not in '\r\n':
                chars[i] = ' '
    return ''.join(chars), spans


def split_args(text, masked, opening, path):
    """Return argument slices and closing offset with all delimiters balanced."""
    stack = ['(']
    begin = opening + 1
    args = []
    matches = {')': '(', ']': '[', '}': '{'}
    for i in range(begin, len(masked)):
        ch = masked[i]
        if ch in '([{':
            stack.append(ch)
        elif ch in ')]}':
            if not stack or stack[-1] != matches[ch]:
                error(path, text, i, 'unbalanced argument delimiters')
            stack.pop()
            if not stack:
                tail = text[begin:i].strip()
                if tail or args:
                    args.append((begin, i))
                return args, i
        elif ch == ',' and len(stack) == 1:
            args.append((begin, i))
            begin = i + 1
    error(path, text, opening, 'unterminated invocation')


def clean_arg(text, masked, span):
    a, b = span
    # Retain comments inside expressions; trim only surrounding whitespace.
    return text[a:b].strip()


def descriptor(text, masked, span, path):
    a, b = span
    live = masked[a:b]
    if '#' in live:
        error(path, text, a, 'conditional directives inside a descriptor are unsupported')
    match = re.match(r'\s*(PB_ARG_[A-Za-z_0-9]+)\s*\(', live)
    if not match:
        error(path, text, a, 'unsupported argument descriptor')
    family = match.group(1)
    opening = a + match.end() - 1
    pieces, close = split_args(text, masked, opening, path)
    if masked[close + 1:b].strip():
        error(path, text, close + 1, 'trailing descriptor tokens')
    vals = [clean_arg(text, masked, p) for p in pieces]
    arities = {'PB_ARG_REQUIRED': 1, 'PB_ARG_DEFAULT_INT': 2,
               'PB_ARG_DEFAULT_OBJ': 2, 'PB_ARG_DEFAULT_QSTR': 2,
               'PB_ARG_DEFAULT_TRUE': 1, 'PB_ARG_DEFAULT_FALSE': 1,
               'PB_ARG_DEFAULT_NONE': 1}
    if family not in arities or len(vals) != arities[family]:
        error(path, text, a, f'unsupported descriptor or arity: {family}')
    name = masked[pieces[0][0]:pieces[0][1]].strip()
    if not IDENT.fullmatch(name):
        error(path, text, a, 'argument name must be an identifier')
    flags = 'MP_ARG_OBJ'
    if family == 'PB_ARG_REQUIRED':
        flags += ' | MP_ARG_REQUIRED'
        default = 'MP_ROM_PTR(NULL)'
    elif family == 'PB_ARG_DEFAULT_INT':
        if not masked[pieces[1][0]:pieces[1][1]].strip():
            error(path, text, a, 'empty integer expression')
        default = f'MP_ROM_INT({vals[1]})'
    elif family in ('PB_ARG_DEFAULT_OBJ', 'PB_ARG_DEFAULT_QSTR'):
        value = masked[pieces[1][0]:pieces[1][1]].strip()
        if not IDENT.fullmatch(value):
            error(path, text, a, 'object symbol/qstr token must be an identifier')
        default = (f'MP_ROM_PTR(&{value})' if family.endswith('OBJ')
                   else f'MP_ROM_QSTR(MP_QSTR_{value})')
    else:
        default = 'MP_ROM_' + family.removeprefix('PB_ARG_DEFAULT_')
    # Descriptor expressions cannot smuggle a removed dependency invocation.
    for p in pieces[1:]:
        if TARGET.search(masked[p[0]:p[1]]):
            error(path, text, p[0], 'nested dependency invocation in descriptor')
    return name, flags, default


def descriptor_events(text, masked, begin, end, path):
    """Parse descriptors plus balanced conditional directives without evaluation.

    Validate comma grammar across every possible branch. Enumerated states are
    only (expecting_descriptor, has_descriptor), so nesting is not exponential.
    """
    _, directive_spans = mask_directives(masked)
    events = []
    states = {(True, False)}
    groups = []
    cursor = begin
    while cursor < end:
        if masked[cursor].isspace():
            cursor += 1
            continue
        directive_span = next(((a, b) for a, b in directive_spans if a <= cursor < b), None)
        if directive_span:
            a, b = directive_span
            if b > end:
                error(path, text, cursor, 'conditional directive crosses invocation boundary')
            directive = masked[cursor:b]
            match = re.match(r'#[ \t]*(if|ifdef|ifndef|elif|else|endif)\b', directive)
            if not match:
                error(path, text, cursor, 'unsupported directive in descriptor list')
            kind = match.group(1)
            tail = directive[match.end():].strip()
            if kind in ('if', 'ifdef', 'ifndef', 'elif') and not tail:
                error(path, text, cursor, 'empty conditional directive')
            if kind in ('else', 'endif') and tail:
                error(path, text, cursor, 'trailing tokens on conditional directive')
            if kind in ('ifdef', 'ifndef') and not IDENT.fullmatch(tail):
                error(path, text, cursor, 'invalid conditional symbol')
            if kind in ('if', 'ifdef', 'ifndef'):
                groups.append({'incoming': states.copy(), 'branches': set(), 'else': False})
            else:
                if not groups:
                    error(path, text, cursor, 'unmatched conditional directive')
                group = groups[-1]
                if kind in ('elif', 'else'):
                    if group['else']:
                        error(path, text, cursor, 'conditional branch after else')
                    group['branches'].update(states)
                    states = group['incoming'].copy()
                    group['else'] = kind == 'else'
                else:
                    group['branches'].update(states)
                    if not group['else']:
                        group['branches'].update(group['incoming'])
                    states = group['branches']
                    groups.pop()
            events.append(('directive', text[a:b]))
            cursor = b
            continue
        if masked[cursor] == ',':
            if any(expecting for expecting, _ in states):
                error(path, text, cursor, 'comma without preceding descriptor in a conditional branch')
            states = {(True, has) for _, has in states}
            cursor += 1
            continue
        match = re.match(r'PB_ARG_[A-Za-z_0-9]+\s*\(', masked[cursor:end])
        if not match:
            error(path, text, cursor, 'unsupported argument descriptor or conditional shape')
        if any(not expecting for expecting, _ in states):
            error(path, text, cursor, 'missing descriptor comma in a conditional branch')
        _, close = split_args(text, masked, cursor + match.end() - 1, path)
        if close >= end:
            error(path, text, cursor, 'descriptor crosses invocation boundary')
        events.append(('descriptor', descriptor(text, masked, (cursor, close + 1), path)))
        states = {(False, True)}
        cursor = close + 1
    if groups:
        error(path, text, begin, 'unclosed conditional descriptor group')
    if any(expecting or not has for expecting, has in states):
        error(path, text, begin, 'empty descriptor list or trailing comma in a conditional branch')
    return events


def expand(text, masked, family, spans, path, start, indent, newline):
    if family == 'PB_PARSE_ARGS_METHOD_ALL_NONE':
        if spans:
            error(path, text, start, 'ALL_NONE takes no arguments')
        return 'pb_obj_parsed_args_all_none(parsed_args, MP_ARRAY_SIZE(parsed_args))'
    prefix = 5 if family == 'PB_PARSE_ARGS_METHOD' else 3
    if len(spans) <= prefix:
        error(path, text, start, 'at least one descriptor is required')
    vals = [clean_arg(text, masked, p) for p in spans[:prefix]]
    if any(not masked[a:b].strip() for a, b in spans[:prefix]):
        error(path, text, start, 'empty parser parameter')
    if any(TARGET.search(masked[a:b]) for a, b in spans[:prefix]):
        error(path, text, start, 'nested dependency invocation in parser parameter')
    if any('#' in masked[a:b] for a, b in spans[:prefix]):
        error(path, text, start, 'conditional parser parameters are unsupported')
    events = descriptor_events(text, masked, spans[prefix][0], spans[-1][1], path)
    descs = [value for kind, value in events if kind == 'descriptor']
    conditional = any(kind == 'directive' for kind, _ in events)
    names = [d[0] for d in descs]
    if len(set(names)) != len(names):
        error(path, text, start, 'duplicate descriptor names')
    lines = []
    if conditional:
        # The C preprocessor selects matching enum/table/local branches. Enum
        # auto-numbering gives later entries correct indices under every option.
        lines.append('enum {')
        for kind, value in events:
            lines.append(value if kind == 'directive' else f'    pb_arg_index_{value[0]},')
        lines.append('};')
    lines.append('static const mp_arg_t allowed_args[] = {')
    for kind, value in events:
        if kind == 'directive':
            lines.append(value)
        else:
            name, flags, default = value
            lines.append(f'    {{ .qst = MP_QSTR_{name}, .flags = {flags}, .defval = {{ .u_rom_obj = {default} }} }},')
    lines.extend(['};', 'mp_arg_val_t parsed_args[MP_ARRAY_SIZE(allowed_args)];'])
    n, pos, kw = vals[:3]
    if family == 'PB_PARSE_ARGS_CLASS':
        lines += ['mp_map_t kw_args;',
                  f'mp_map_init_fixed_table(&kw_args, ({pos}), ({kw}) + ({n}));',
                  f'mp_arg_parse_all(({n}), ({kw}), &kw_args, MP_ARRAY_SIZE(allowed_args), allowed_args, parsed_args);']
    else:
        if family in ('PB_PARSE_ARGS_METHOD', 'PB_PARSE_ARGS_METHOD_SKIP_SELF'):
            if family == 'PB_PARSE_ARGS_METHOD':
                ctype, instance = vals[3:5]
                instance = masked[spans[4][0]:spans[4][1]].strip()
                if not IDENT.fullmatch(instance):
                    error(path, text, spans[4][0], 'instance name must be an identifier')
                if not re.fullmatch(r'(?:[A-Za-z_][A-Za-z_0-9]*\s*|\*\s*)+', ctype):
                    error(path, text, spans[3][0], 'unsupported C type spelling')
                lines.append(f'{ctype} *{instance} = MP_OBJ_TO_PTR(({pos})[0]);')
            count, positions = f'({n}) - 1', f'({pos}) + 1'
        else:
            count, positions = f'({n})', f'({pos})'
        lines.append(f'mp_arg_parse_all({count}, {positions}, ({kw}), MP_ARRAY_SIZE(allowed_args), allowed_args, parsed_args);')
    if conditional:
        for kind, value in events:
            lines.append(value if kind == 'directive' else
                         f'mp_obj_t {value[0]}_in = parsed_args[pb_arg_index_{value[0]}].u_obj;')
    else:
        lines += [f'mp_obj_t {name}_in = parsed_args[{i}].u_obj;' for i, name in enumerate(names)]
    return (newline + indent).join(lines)


def includes(text, masked):
    found = []
    # Mask establishes that #include is live; original line provides its literal.
    for match in re.finditer(r'(?m)^' + INCLUDE_PREFIX + r'(?:[^\r\n]*\\\r?\n)*[^\r\n]*', masked):
        a, b = match.span()
        original = text[a:b]
        inc = re.match(INCLUDE_LITERAL, original)
        if inc:
            end = b
            if text[end:end + 2] == '\r\n':
                end += 2
            elif text[end:end + 1] == '\n':
                end += 1
            found.append((inc.group(1), a, end))
    return found


def check_licence(text, path):
    markers = re.findall(r'SPDX-License-Identifier:\s*([^\r\n]*)', text)
    exact = re.search(r'(?m)^[ \t]*(?://|/\*|\*)?[ \t]*SPDX-License-Identifier: MIT[ \t]*(?:\*/)?[ \t]*\r?$', text)
    if len(markers) != 1 or not exact:
        error(path, text, 0, 'target caller must carry only an exact standalone MIT SPDX line')


def translate(text, path):
    masked = mask_c(text, path)
    statement_mask, directive_spans = mask_directives(masked)
    incs = includes(text, masked)
    removed = [inc for inc in incs if inc[0] == DEPENDENCY]
    tokens = list(TARGET.finditer(masked))
    if not removed and not tokens:
        return text, {name: 0 for name in FAMILIES}, 0
    check_licence(text, path)
    replacements = []
    for _, a, b in removed:
        directive = re.match(INCLUDE_LITERAL, text[a:b])
        tail = text[a + directive.end():b]
        # A trailing comment is unrelated source and must survive removal.
        replacement = tail if tail.strip() else ''
        replacements.append((a, b, replacement))
    counts = {name: 0 for name in FAMILIES}
    covered = -1
    newline = '\r\n' if '\r\n' in text else '\n'
    for match in tokens:
        start, end = match.span()
        if start < covered:
            continue
        if any(a <= start < b for _, a, b in removed):
            continue
        family = match.group()
        if any(a <= start < b for a, b in directive_spans):
            error(path, text, start, 'dependency invocation within preprocessor directive')
        if family not in FAMILIES:
            error(path, text, start, f'unsupported dependency identifier: {family}')
        opening = end
        while opening < len(masked) and masked[opening].isspace():
            opening += 1
        if opening >= len(masked) or masked[opening] != '(':
            error(path, text, start, f'expected invocation: {family}')
        spans, close = split_args(text, masked, opening, path)
        after = close + 1
        if family != 'PB_PARSE_ARGS_METHOD_ALL_NONE':
            while after < len(masked) and masked[after].isspace():
                after += 1
            if after >= len(masked) or masked[after] != ';':
                error(path, text, start, 'parser invocation must end with a semicolon')
            after += 1
            # A multi-declaration expansion cannot preserve an unbraced control
            # body or expression context. Require a statement boundary.
            before = statement_mask[:start].rstrip()
            if before and before[-1] not in '{;}':
                error(path, text, start, 'parser requires a standalone compound-scope statement')
        line_start = text.rfind('\n', 0, start) + 1
        indentation = text[line_start:start]
        indent = indentation if not indentation.strip() else '    '
        value = expand(text, masked, family, spans, path, start, indent, newline)
        # Retain comments attached to macro/descriptor syntax as well as those
        # already retained inside expressions. The lexical scanner prevents
        # string contents from being mistaken for comments here.
        comments = []
        scan = start
        while scan < after:
            if text.startswith('//', scan) or text.startswith('/*', scan):
                if text.startswith('//', scan):
                    end_comment = scan + 2
                    while end_comment < after:
                        if text[end_comment] == '\n' and text[end_comment - 1] != '\\':
                            break
                        end_comment += 1
                else:
                    end_comment = text.index('*/', scan + 2) + 2
                comment = text[scan:end_comment]
                if comment not in value:
                    comments.append(comment)
                scan = end_comment
            elif text[scan] in '"\'':
                quote = text[scan]
                scan += 1
                while scan < after:
                    if text[scan] == '\\':
                        scan += 2
                    elif text[scan] == quote:
                        scan += 1
                        break
                    else:
                        scan += 1
            else:
                scan += 1
        if comments:
            value = (newline + indent).join(comments + [value])
        replacements.append((start, after, value))
        covered = after
        counts[family] += 1
    for a, b, value in sorted(replacements, reverse=True):
        text = text[:a] + value + text[b:]
    residual = TARGET.search(mask_c(text, path))
    if residual:
        error(path, text, residual.start(), 'untranslated dependency identifier')
    needed = []
    remaining = includes(text, mask_c(text, path))
    existing = {item[0] for item in remaining}
    if sum(counts.values()) and 'py/runtime.h' not in existing:
        needed.append('py/runtime.h')
    if counts['PB_PARSE_ARGS_METHOD_ALL_NONE'] and 'pybricks/util_mp/pb_obj_helper.h' not in existing:
        needed.append('pybricks/util_mp/pb_obj_helper.h')
    if needed:
        addition = ''.join(f'#include "{name}"{newline}' for name in needed)
        # Add alongside includes while preserving all existing comments/order.
        point = remaining[0][1] if remaining else None
        if point is None:
            # Keep a leading copyright/licence comment prefix intact.
            live = mask_c(text, path)
            point = next((i for i, ch in enumerate(live) if not ch.isspace()), len(text))
            point = text.rfind('\n', 0, point) + 1
        text = text[:point] + addition + text[point:]
    return text, counts, len(removed)


def within(child, parent):
    return child == parent or parent in child.parents


def reject_symlinks(path):
    for candidate in [path, *path.parents]:
        if candidate.is_symlink():
            raise ConversionError(f'symlink path is forbidden: {candidate}')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def convert(source, output, manifest=None):
    source, output = Path(source).absolute(), Path(output).absolute()
    reject_symlinks(source)
    reject_symlinks(output)
    source, output = source.resolve(), output.resolve()
    if within(source, output) or within(output, source):
        raise ConversionError('source and output roots overlap')
    if not source.is_dir():
        raise ConversionError(f'source root is not a directory: {source}')
    if output.exists() and not output.is_dir():
        raise ConversionError(f'output root is not a directory: {output}')
    if manifest is not None:
        manifest = Path(manifest).absolute()
        reject_symlinks(manifest)
        manifest = manifest.resolve()
        if manifest.name == FORBIDDEN or within(manifest, source):
            raise ConversionError('manifest must not overwrite source or forbidden header')
        if manifest == output or within(output, manifest):
            raise ConversionError('manifest path conflicts with output root')
    plan = []
    records = []
    root = source / 'pybricks'
    if root.is_symlink():
        raise ConversionError(f'symlink path is forbidden: {root}')
    if root.exists():
        for base, directories, filenames in os.walk(root, followlinks=False):
            directories[:] = sorted(d for d in directories if d != '.git')
            for directory in directories:
                if (Path(base) / directory).is_symlink():
                    raise ConversionError(f'symlink directory is forbidden: {Path(base) / directory}')
            for name in sorted(filenames):
                if name == FORBIDDEN or Path(name).suffix not in ('.c', '.h'):
                    continue
                path = Path(base) / name
                reject_symlinks(path)
                rel = path.relative_to(source)
                raw = path.read_bytes()
                try:
                    text = raw.decode('utf-8')
                except UnicodeDecodeError as exc:
                    raise ConversionError(f'{rel}: source is not UTF-8') from exc
                changed, counts, removed = translate(text, rel.as_posix())
                if changed == text:
                    continue
                data = changed.encode('utf-8')
                plan.append((rel, data))
                records.append({'path': rel.as_posix(), 'source_sha256': digest(raw),
                                'output_sha256': digest(data), 'rewritten_calls': counts,
                                'removed_includes': removed})
    records.sort(key=lambda item: item['path'])
    result = {'format_version': 1, 'files': records,
              'rewritten_calls': {name: sum(r['rewritten_calls'][name] for r in records) for name in FAMILIES},
              'removed_includes': sum(r['removed_includes'] for r in records)}
    manifest_data = (json.dumps(result, indent=2, sort_keys=True) + '\n').encode()
    # Build the entire output in a sibling temporary directory, then swap it.
    # Preserve existing output files, validating every destination beforehand.
    output.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix='.arg-converter-', dir=output.parent))
    backup = None
    manifest_temp = None
    try:
        if output.exists():
            for base, directories, filenames in os.walk(output, followlinks=False):
                for name in directories + filenames:
                    if name == FORBIDDEN:
                        raise ConversionError('existing output contains forbidden header')
                    reject_symlinks(Path(base) / name)
            shutil.copytree(output, stage, dirs_exist_ok=True)
        for rel, data in plan:
            dest = stage / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
        if manifest is not None and within(manifest, output):
            dest = stage / manifest.relative_to(output)
            if any(rel == manifest.relative_to(output) for rel, _ in plan):
                raise ConversionError('manifest conflicts with a generated source')
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(manifest_data)
        elif manifest is not None:
            manifest.parent.mkdir(parents=True, exist_ok=True)
            fd, name = tempfile.mkstemp(prefix='.arg-manifest-', dir=manifest.parent)
            manifest_temp = Path(name)
            with os.fdopen(fd, 'wb') as stream:
                stream.write(manifest_data)
        if output.exists():
            backup = Path(tempfile.mkdtemp(prefix='.arg-backup-', dir=output.parent))
            backup.rmdir()
            output.rename(backup)
        try:
            stage.rename(output)
            if manifest_temp is not None:
                os.replace(manifest_temp, manifest)
                manifest_temp = None
        except BaseException:
            if output.exists():
                shutil.rmtree(output)
            if backup is not None:
                backup.rename(output)
                backup = None
            raise
        if backup is not None:
            shutil.rmtree(backup)
            backup = None
    finally:
        if stage.exists():
            shutil.rmtree(stage)
        if manifest_temp is not None:
            manifest_temp.unlink(missing_ok=True)
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source_root')
    parser.add_argument('output_root')
    parser.add_argument('--manifest')
    args = parser.parse_args(argv)
    try:
        result = convert(args.source_root, args.output_root, args.manifest)
    except (ConversionError, OSError) as exc:
        print(f'error: {exc}', file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == '__main__':
    sys.exit(main())
