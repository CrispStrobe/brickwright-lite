#!/usr/bin/env python3
"""
Derive jimdos.c — Jim Tcl's single-file bootstrap amalgamation
(autosetup/jimsh0.c), configured for a 16-bit MS-DOS .EXE built with
ia16-elf-gcc -mcmodel=medium — from an unmodified jimtcl checkout.

    python3 mkdos.py <jimtcl>/autosetup/jimsh0.c jimdos.c

Every change is a numbered, asserted edit below, so a jimtcl update that
moves the code fails loudly instead of building something else. Why each
one exists is said at the edit. build.sh runs this and compiles.
"""
import re, sys
src, out = sys.argv[1], sys.argv[2]
s = open(src).read()
def once(a, b):
    global s
    assert s.count(a) == 1, a[:60]
    s = s.replace(a, b)
# 1. no exec/readdir/glob on DOS (no fork, no dirent in newlib-ia16)
for ext in ['jim_ext_exec', 'jim_ext_readdir', 'jim_ext_glob']:
    once('#define %s\n' % ext, '')
for init in ['Jim_readdirInit(interp);\n', 'Jim_globInit(interp);\n', 'Jim_execInit(interp);\n']:
    once(init, '')
# 2. a DOS platform branch
once('''#else
#define TCL_PLATFORM_OS "unknown"''', '''#elif defined(__ia16__)
#define TCL_PLATFORM_OS "dos"
#define TCL_PLATFORM_PLATFORM "dos"
#define TCL_PLATFORM_PATH_SEPARATOR ";"
#define HAVE_UNISTD_H
#else
#define TCL_PLATFORM_OS "unknown"''')
# 3. compile out the readdir command body
i = s.index('#ifdef HAVE_DIRENT_H\n#include <dirent.h>\n#endif\n\nint Jim_ReaddirCmd')
j = s.index('int Jim_readdirInit(Jim_Interp *interp)', i)
j = s.index('\n}\n', j) + 3
s = s[:i] + '#if 0 /* readdir: no dirent on DOS */\n' + s[i:j] + '#endif\n' + s[j:]
open(out, 'w').write(s)
# 4. the DOS bench runs the interpreter with no arguments and the program
#    mounted as PROG.TCL (the route's sourceName): default to that file.
s = open(out).read()
a = '''    char *const orig_argv0 = argv[0];
'''
assert s.count(a) == 1
s = s.replace(a, a + '''    static char *dos_argv[3];
    if (argc == 1) {
        dos_argv[0] = argv[0];
        dos_argv[1] = "PROG.TCL";
        dos_argv[2] = 0;
        argv = dos_argv;
        argc = 2;
    }
''')
open(out, 'w').write(s)
# 4b. jimsh declares main(int, char *const[]); argv is reassigned above.
s = open(out).read()
s = s.replace('int main(int argc, char *const argv[])', 'int main(int argc, char **argv)', 1)
open(out, 'w').write(s)
# 5. exec is not registered on DOS, but its no-fork body still names system().
s = open(out).read()
s += '\n#ifdef __ia16__\nint system(const char *cmd) { (void)cmd; return -1; }\n#endif\n'
open(out, 'w').write(s)
# 6. 16-bit int: constants and shifts that assume a 32-bit int.
s = open(out).read()
def fix(a, b, n=1):
    global s
    assert s.count(a) == n, (a, s.count(a))
    s = s.replace(a, b)
fix('''    if (size >= 2147483648U)
        return 2147483648U;''', '''    if (size >= UINT_MAX / 2 + 1)
        return UINT_MAX / 2 + 1;''')      # truncated to 0: every table got size 0
fix('    key ^= (key >> 16);\n    return key;', '    key ^= (key >> (sizeof(key) * 4));\n    return key;')
fix('''        if (count >= 16384 && af->rbuf_len < 65536) {

            af->rbuf_len = 65536;''', '''        if (count >= 16384 && af->rbuf_len < 16384) {

            af->rbuf_len = 16384;''')
fix('#define AIO_DEFAULT_WBUF_LIMIT (64 * 1024)', '#define AIO_DEFAULT_WBUF_LIMIT (16 * 1024)')
fix('        us = 1000 * 1000;', '        us = 1000000L;')
fix('#define\tREG_MAGIC\t0xFADED00D', '#define\tREG_MAGIC\t0x7ADE')
fix('#define MAX_REP_COUNT 1000000', '#define MAX_REP_COUNT 30000')
# Tcl integers are 64-bit: without HAVE_LONG_LONG jim_wide falls back to a
# 32-bit long and [expr {2**40}] is 0. gettimeofday needs sys/time.h.
fix('''#define TCL_PLATFORM_PATH_SEPARATOR ";"
#define HAVE_UNISTD_H
#else''', '''#define TCL_PLATFORM_PATH_SEPARATOR ";"
#define HAVE_UNISTD_H
#define HAVE_SYS_TIME_H
#define HAVE_LONG_LONG
#else''')
open(out, 'w').write(s)
# 7. Fit one 64 KiB data segment (medium model: every literal is near data).
s = open(out).read()
import re as _re
# 7a. subcommand usage text ("?-nonewline|len?") -> NULL; errors still name
#     the command, just not its argument list.
s, n = _re.subn(r'(\{\s+"[^"]*",\n\s+)"(?:[^"\\]|\\.)*",', r'\1NULL,', s)
assert n > 50, n
# 7b. scripts DOS never runs: glob (not registered) and the interactive
#     shell's helpers (the bench runs PROG.TCL, never a prompt).
for name in ['glob.tcl', 'initjimsh.tcl']:
    i = s.index('Jim_EvalSource(interp, "%s", 1,\n' % name)
    j = s.index('\n);\n', i)
    s = s[:i] + 'Jim_EvalSource(interp, "%s", 1,\n""' % name + s[j:]
# 7c. newlib's iswspace pulls in a 13.5 KB JIS table (jp2uc); DOS text is ASCII.
s += '\n#ifdef __ia16__\n#include <wctype.h>\nint iswspace(wint_t c) { return c == 32 || (c >= 9 && c <= 13); }\n#endif\n'
# 7d. stack and heap share the data segment, and the stock sbrk checks SP
#     only at the moment the heap grows, so a deep evaluation later runs the
#     stack into the heap. This sbrk keeps JIM_DOS_STACK bytes below the stack
#     top main() starts at for the stack alone; past that malloc fails cleanly.
s += '''
#ifdef __ia16__
#include <reent.h>
#include <errno.h>
extern char __heap_end_minimum;
static char *jim_dos_brk;
static char *jim_dos_limit;
void jim_dos_reserve_stack(void)
{
    char here;
    jim_dos_limit = &here - JIM_DOS_STACK;
}
void *_sbrk_r(struct _reent *r, ptrdiff_t incr)
{
    char here;
    char *old;
    char *limit = jim_dos_limit ? jim_dos_limit : &here - 512;
    if (!jim_dos_brk) jim_dos_brk = &__heap_end_minimum;
    if (incr > 0 && (unsigned)(limit - jim_dos_brk) < (unsigned)incr) {
        r->_errno = ENOMEM;
        return (void *)-1;
    }
    old = jim_dos_brk;
    jim_dos_brk += incr;
    return old;
}
#endif
'''
a2 = '    static char *dos_argv[3];\n'
assert s.count(a2) == 1
s = s.replace(a2, '#ifdef __ia16__\n    { extern void jim_dos_reserve_stack(void); jim_dos_reserve_stack(); }\n#endif\n' + a2)
open(out, 'w').write(s)
# 8. stdlib.tcl / tclcompat.tcl: their commands are defined on first call, from
#    JIMLIB.TCL on the DOS disk (doslib.tcl here; the route mounts it beside
#    PROG.TCL), through a native `unknown`. Parsed at startup they used every
#    byte of a 16-bit heap; as string literals they cost 3.8 KB of the 64 KB
#    data segment. A `#@ name …` line starts each command's definition.
s = open(out).read()
handler = r"""
static int jim_dos_header_has(char *h, const char *name)
{
    char *e = h + strlen(h);
    while (e > h && (e[-1] == '\n' || e[-1] == '\r' || e[-1] == ' ')) *--e = '\0';
    if (strncmp(h, "dict ", 5) == 0 || strncmp(h, "namespace ", 10) == 0) return strcmp(h, name) == 0;
    while (*h) {
        size_t n = strcspn(h, " ");
        if (n == strlen(name) && strncmp(h, name, n) == 0) return 1;
        h += n;
        while (*h == ' ') h++;
    }
    return 0;
}

static int JimDosUnknownCmd(Jim_Interp *interp, int argc, Jim_Obj *const *argv)
{
    if (argc >= 2 && !Jim_GetCommand(interp, argv[1], JIM_NONE)) {
        const char *name = Jim_String(argv[1]);
        FILE *f = fopen("JIMLIB.TCL", "r");
        Jim_Obj *script = NULL;
        if (f) {
            char line[160];
            int on = 0;
            while (fgets(line, sizeof line, f)) {
                if (line[0] == '#' && line[1] == '@' && line[2] == ' ') {
                    if (on) break;
                    on = jim_dos_header_has(line + 3, name);
                    if (on) {
                        script = Jim_NewStringObj(interp, "", 0);
                        Jim_IncrRefCount(script);
                    }
                    continue;
                }
                if (on) Jim_AppendString(interp, script, line, -1);
            }
            fclose(f);
        }
        if (script) {
            int rc = Jim_EvalObj(interp, script);
            Jim_DecrRefCount(interp, script);
            if (rc != JIM_OK) return rc;
            return Jim_EvalObjVector(interp, argc - 1, argv + 1);
        }
    }
    Jim_SetResultFormatted(interp, "invalid command name \"%#s\"", argc >= 2 ? argv[1] : argv[0]);
    return JIM_ERR;
}
"""
for name in ['stdlib.tcl', 'tclcompat.tcl']:
    i = s.index('Jim_EvalSource(interp, "%s", 1,\n' % name)
    j = s.index('\n);\n', i) + len('\n);\n')
    repl = ('Jim_CreateCommand(interp, "unknown", JimDosUnknownCmd, NULL, NULL);\n' if name == 'stdlib.tcl'
            else 'JIM_OK;\n')
    s = s[:i] + repl + s[j:]
fn = s.index('int Jim_stdlibInit(Jim_Interp *interp)')
s = s[:fn] + handler + s[fn:]
open(out, 'w').write(s)
# 9. Recursion is bounded by the stack, not by Jim's 1000-frame limit: about
#    45 Tcl call levels fit in 12 KB. Every command invocation checks the stack
#    pointer and fails with a Tcl error while JIM_DOS_STACK_MARGIN bytes are
#    still free, so deep recursion is a catchable error instead of a stack
#    that runs into the heap and a CPU that executes garbage.
s = open(out).read()
s = s.replace('static char *jim_dos_limit;\n', '''static char *jim_dos_limit;
int jim_dos_stack_low(void)
{
    char here;
    return jim_dos_limit && &here < jim_dos_limit + JIM_DOS_STACK_MARGIN;
}
''', 1)
a = '''    if (interp->evalDepth == interp->maxEvalDepth) {
        Jim_SetResultString(interp, "Infinite eval recursion", -1);'''
assert s.count(a) == 1
s = s.replace(a, '''#ifdef __ia16__
    {
        extern int jim_dos_stack_low(void);
        if (jim_dos_stack_low()) {
            Jim_SetResultString(interp, "too many nested evaluations (out of stack: DOS gives Tcl one 64 KB segment)", -1);
            retcode = JIM_ERR;
            goto out;
        }
    }
#endif
''' + a)
open(out, 'w').write(s)
# 10. An uncaught error prints "file:line: Error: msg" natively. The stock
#     printer evaluates the Tcl-coded errorInfo/stackdump, which costs ~11 KB of
#     heap at the one moment the heap is most likely to be full.
s = open(out).read()
a = """static void JimPrintErrorMessage(Jim_Interp *interp)
{
    Jim_MakeErrorMessage(interp);
    fprintf(stderr, "%s\\n", Jim_String(Jim_GetResult(interp)));
}"""
assert s.count(a) == 1
s = s.replace(a, """static void JimPrintErrorMessage(Jim_Interp *interp)
{
    Jim_Obj *st = interp->stackTrace;
    const char *msg = Jim_String(Jim_GetResult(interp));
    if (st && Jim_ListLength(interp, st) >= 3 && *Jim_String(Jim_ListGetIndex(interp, st, 1))) {
        fprintf(stderr, "%s:%s: Error: %s\\n", Jim_String(Jim_ListGetIndex(interp, st, 1)),
            Jim_String(Jim_ListGetIndex(interp, st, 2)), msg);
    } else {
        fprintf(stderr, "Error: %s\\n", msg);
    }
}""")
open(out, 'w').write(s)
# 11. Out of memory is a clean exit. Jim stores realloc's result unchecked, so a
#     full heap used to become a NULL string and a call through garbage.
s = open(out).read()
a = """    else if (ptr) {
        return realloc(ptr, size);
    }
    else {
        return malloc(size);
    }"""
assert s.count(a) == 1
s = s.replace(a, """    else {
        void *p = ptr ? realloc(ptr, size) : malloc(size);
        if (!p) {
            fputs("Error: out of memory (DOS gives Tcl one 64 KB segment)\\n", stderr);
            exit(1);
        }
        return p;
    }""")
open(out, 'w').write(s)
# 12. Namespaces: jimtcl's jim-namespace.c (the `namespace` command) is not in
#     the bootstrap amalgamation; build.sh passes it as the third argument and
#     it is appended here. Its Tcl half (nshelper.tcl) is in JIMLIB.TCL.
if len(sys.argv) > 3:
    s = open(out).read()
    ns = open(sys.argv[3]).read()
    ns = '\n'.join(l for l in ns.split('\n') if not l.startswith('#include "'))
    # Jim_EvalEnsemble is already in the amalgamation (the same body, for dict).
    i = ns.index('static int Jim_EvalEnsemble(')
    ns = ns[:i] + ns[ns.index('\n}\n', i) + 3:]
    s = s.replace('#define jim_ext_bootstrap\n', '#define jim_ext_bootstrap\n#define jim_ext_namespace\n', 1)
    s = s.replace('Jim_bootstrapInit(interp);\n', 'Jim_bootstrapInit(interp);\n{ extern int Jim_namespaceInit(Jim_Interp *); Jim_namespaceInit(interp); }\n', 1)
    s += '\n/* ---- jimtcl jim-namespace.c ---- */\n' + ns
    open(out, 'w').write(s)
# 13. `puts ?-nonewline? ?channel? string`, as in Tcl. The core command takes no
#     channel (jimsh replaces it with a Tcl proc from tclcompat.tcl, which would
#     cost heap here); a channel argument hands the write to that channel.
s = open(out).read()
a = """static int Jim_PutsCoreCommand(Jim_Interp *interp, int argc, Jim_Obj *const *argv)
{
    if (argc == 3) {"""
assert s.count(a) == 1
s = s.replace(a, """static int Jim_PutsCoreCommand(Jim_Interp *interp, int argc, Jim_Obj *const *argv)
{
    int nonl = argc > 2 && Jim_CompareStringImmediate(interp, argv[1], "-nonewline");
    if (argc - nonl == 3) {
        Jim_Obj *objv[4];
        int n = 0;
        objv[n++] = argv[1 + nonl];
        objv[n++] = Jim_NewStringObj(interp, "puts", -1);
        if (nonl) objv[n++] = argv[1];
        objv[n++] = argv[2 + nonl];
        if (Jim_CompareStringImmediate(interp, argv[1 + nonl], "stdout")) {
            fputs(Jim_String(argv[2 + nonl]), stdout);
            if (!nonl) fputc('\\n', stdout);
            return JIM_OK;
        }
        return Jim_EvalObjVector(interp, n, objv);
    }
    if (argc == 3) {""")
a = '{"puts", Jim_PutsCoreCommand, 1, 2, "?-nonewline? string" },'
assert s.count(a) == 1
s = s.replace(a, '{"puts", Jim_PutsCoreCommand, 1, 3, "?-nonewline? ?channel? string" },')
# 14. Doubles print as Tcl 8.5+ prints them: the shortest form that reads
#     back as the same double (0.1, 3.5, 2.7182818284590455), not %.12g.
a = '        int len = sprintf(buf, "%.12g", value);'
assert s.count(a) == 1
s = s.replace(a, '''        int len, prec;
        for (prec = 1; prec <= 17; prec++) {
            len = sprintf(buf, "%.*g", prec, value);
            if (strtod(buf, NULL) == value) break;
        }''')
# 15. Tcl's wording for a zero divisor, which programs print and compare.
assert s.count('"Division by zero"') == 3
s = s.replace('"Division by zero"', '"divide by zero"')
# 16. Tcl 8.5 expr functions Jim lacks: entier() (int() of any size, which a
#     64-bit jim_wide already is) and max()/min() of two arguments (Tcl's
#     take any number; two covers what programs write). build.sh defines
#     JIM_MATH_FUNCTIONS, so the table entries sit in that block.
def edit(a, b, n=1):
    global s
    assert s.count(a) == n, a[:60]
    s = s.replace(a, b)
edit("""    JIM_EXPROP_FUNC_FMOD,
};""", """    JIM_EXPROP_FUNC_FMOD,
    JIM_EXPROP_FUNC_ENTIER,
    JIM_EXPROP_FUNC_MAX,
    JIM_EXPROP_FUNC_MIN,
};""")
edit("""    OPRINIT_ATTR("fmod", 200, 2, JimExprOpBin, OP_FUNC),
#endif""", """    OPRINIT_ATTR("fmod", 200, 2, JimExprOpBin, OP_FUNC),
    OPRINIT_ATTR("entier", 200, 1, JimExprOpNumUnary, OP_FUNC),
    OPRINIT_ATTR("max", 200, 2, JimExprOpBin, OP_FUNC),
    OPRINIT_ATTR("min", 200, 2, JimExprOpBin, OP_FUNC),
#endif""")
edit("""            case JIM_EXPROP_FUNC_INT:
            case JIM_EXPROP_FUNC_WIDE:""", """            case JIM_EXPROP_FUNC_INT:
            case JIM_EXPROP_FUNC_ENTIER:
            case JIM_EXPROP_FUNC_WIDE:""", 2)
edit("""                wC = JimPowWide(wA, wB);
                goto intresult;""", """                wC = JimPowWide(wA, wB);
                goto intresult;
            case JIM_EXPROP_FUNC_MAX:
                wC = wA > wB ? wA : wB;
                goto intresult;
            case JIM_EXPROP_FUNC_MIN:
                wC = wA < wB ? wA : wB;
                goto intresult;""")
edit("""            case JIM_EXPROP_FUNC_FMOD:
                dC = fmod(dA, dB);
                goto doubleresult;""", """            case JIM_EXPROP_FUNC_FMOD:
                dC = fmod(dA, dB);
                goto doubleresult;
            case JIM_EXPROP_FUNC_MAX:
                dC = dA > dB ? dA : dB;
                goto doubleresult;
            case JIM_EXPROP_FUNC_MIN:
                dC = dA < dB ? dA : dB;
                goto doubleresult;""")
open(out, 'w').write(s)
