// Tcl on a board: Jim Tcl's single-file build (autosetup/jimsh0.c at
// msteveb/jimtcl 5bac7c99, the file static/roms/jim.provenance.json pins, served
// unmodified as static/roms/jimsh0.c) plus the program and a main(), as one C
// file for targets whose compile route takes a single file (RISC-V riscv32-gcc).
//
// The edits are asserted like tools/jim-dos/mkdos.py's, and the first ones are
// its edits 1, 3 and 13: no exec/readdir/glob (no fork or dirent here), and
// `puts` as a channel-aware core command. Also: jimsh's main is renamed so
// ours evaluates the embedded program; tclcompat's puts proc, whose aio path
// loses console output on this target, is replaced by that core command; and
// POSIX calls the target lacks are stubs (console write, EOF read, zero time,
// ENOSYS for files and processes). Jim Tcl is BSD-2-Clause (see its notice).
import {cStringLiteral} from './fe-target-c.js';

export const JIMSH0_SHA256 = 'd6ca32738df8d690b74c103d770661c689184333ea4ab21df03cf15bc2cc186d';
export const JIMSH0_URL = 'static/roms/jimsh0.c';

const sha256Hex = async text => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
};

export const tclProgramToC = (jimsh0, program) => {
    let j = String(jimsh0);
    // The edits stay flush-left: their multi-line anchors are exact text.
const once = (a, b) => { if (j.split(a).length !== 2) throw new Error(`edit anchor: ${a.slice(0, 50)}`); j = j.replace(a, b); };
for (const ext of ['jim_ext_exec', 'jim_ext_readdir', 'jim_ext_glob']) once(`#define ${ext}\n`, '');
for (const init of ['Jim_readdirInit(interp);\n', 'Jim_globInit(interp);\n', 'Jim_execInit(interp);\n']) once(init, '');
once(`static int Jim_PutsCoreCommand(Jim_Interp *interp, int argc, Jim_Obj *const *argv)
{
    if (argc == 3) {`, `static int Jim_PutsCoreCommand(Jim_Interp *interp, int argc, Jim_Obj *const *argv)
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
            if (!nonl) fputc('\\\\n', stdout);
            return JIM_OK;
        }
        return Jim_EvalObjVector(interp, n, objv);
    }
    if (argc == 3) {`);
once('{"puts", Jim_PutsCoreCommand, 1, 2, "?-nonewline? string" },', '{"puts", Jim_PutsCoreCommand, 1, 3, "?-nonewline? ?channel? string" },');
{
  const i = j.indexOf('#ifdef HAVE_DIRENT_H\n#include <dirent.h>\n#endif\n\nint Jim_ReaddirCmd');
  let k = j.indexOf('int Jim_readdirInit(Jim_Interp *interp)', i); k = j.indexOf('\n}\n', k) + 3;
  if (i < 0 || k < 3) throw new Error('readdir block');
  j = j.slice(0, i) + '#if 0 /* readdir: no dirent */\n' + j.slice(i, k) + '#endif\n' + j.slice(k);
}
    return `#define BW_BOARD_STUBS 1
#define main bw_jimsh_main
${j}
#undef main
#ifdef BW_BOARD_STUBS

/* The board has no filesystem, processes or clock. picolibc declares these
   POSIX calls but this target does not provide them: file and process
   commands fail with ENOSYS, stdout and stderr go to the console. */
#include <errno.h>
#define BW_NOSYS(r) do { errno = ENOSYS; return (r); } while (0)
ssize_t write(int fd, const void *buf, size_t n) {
  size_t i;
  if (fd != 1 && fd != 2) BW_NOSYS(-1);
  for (i = 0; i < n; i++) putchar(((const unsigned char *)buf)[i]);
  return (ssize_t)n;
}
ssize_t read(int fd, void *buf, size_t n) { (void)fd; (void)buf; (void)n; return 0; }
int access(const char *p, int m) { (void)p; (void)m; BW_NOSYS(-1); }
int chdir(const char *p) { (void)p; BW_NOSYS(-1); }
int close(int fd) { (void)fd; BW_NOSYS(-1); }
int fcntl(int fd, int cmd, ...) { (void)fd; (void)cmd; BW_NOSYS(-1); }
char *getcwd(char *b, size_t n) { (void)b; (void)n; BW_NOSYS((char *)0); }
pid_t getpid(void) { return 1; }
int gettimeofday(struct timeval *restrict tv, void *restrict tz) {
  (void)tz; if (tv) { tv->tv_sec = 0; tv->tv_usec = 0; } return 0;
}
int isatty(int fd) { (void)fd; return 0; }
int kill(pid_t pid, int sig) { (void)pid; (void)sig; BW_NOSYS(-1); }
off_t lseek(int fd, off_t o, int w) { (void)fd; (void)o; (void)w; BW_NOSYS((off_t)-1); }
int mkdir(const char *p, mode_t m) { (void)p; (void)m; BW_NOSYS(-1); }
int mkstemp(char *t) { (void)t; BW_NOSYS(-1); }
int open(const char *p, int f, ...) { (void)p; (void)f; BW_NOSYS(-1); }
int pipe(int fds[2]) { (void)fds; BW_NOSYS(-1); }
int remove(const char *p) { (void)p; BW_NOSYS(-1); }
int rename(const char *a, const char *b) { (void)a; (void)b; BW_NOSYS(-1); }
int rmdir(const char *p) { (void)p; BW_NOSYS(-1); }
int stat(const char *restrict p, struct stat *restrict st) { (void)p; (void)st; BW_NOSYS(-1); }
clock_t times(struct tms *t) { (void)t; return 0; }
mode_t umask(mode_t m) { (void)m; return 0; }
int unlink(const char *p) { (void)p; BW_NOSYS(-1); }
#endif
static const char bw_program[] = ${cStringLiteral(program)};
int main(void) {
  Jim_Interp *interp = Jim_CreateInterp();
  int rc;
  Jim_RegisterCoreCommands(interp);
  if (Jim_InitStaticExtensions(interp) != JIM_OK) Jim_MakeErrorMessage(interp);
  /* tclcompat.tcl redefines puts as a proc over the aio channel layer, whose
     console output this target loses; the core command prints through stdio. */
  Jim_CreateCommand(interp, "puts", Jim_PutsCoreCommand, NULL, NULL);
  rc = Jim_Eval(interp, bw_program);
  if (rc == JIM_ERR) {
    Jim_MakeErrorMessage(interp);
    printf("%s\\n", Jim_String(Jim_GetResult(interp)));
  }
  fflush(stdout);
  Jim_FreeInterp(interp);
  return rc == JIM_ERR ? 1 : 0;
}
`;
};

/** Fetch the pinned jimsh0.c, refuse any other bytes, and build the C file. */
export const fetchTclProgramC = async (program, fetchImpl = fetch) => {
    const response = await fetchImpl(JIMSH0_URL);
    if (!response.ok) throw new Error(`${JIMSH0_URL}: HTTP ${response.status}`);
    const text = await response.text();
    const got = await sha256Hex(text);
    if (got !== JIMSH0_SHA256) throw new Error(`${JIMSH0_URL} is ${got}, expected ${JIMSH0_SHA256}`);
    return tclProgramToC(text, program);
};
