"use strict";
(self["webpackChunkGUI"] = self["webpackChunkGUI"] || []).push([["sb3-creator"],{

/***/ "./src/lib/cubeDirections.js":
/*!***********************************!*\
  !*** ./src/lib/cubeDirections.js ***!
  \***********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   CUBE_DIRECTIONS: () => (/* binding */ CUBE_DIRECTIONS),
/* harmony export */   cubeDirectionIndex: () => (/* binding */ cubeDirectionIndex),
/* harmony export */   cubeDirectionWord: () => (/* binding */ cubeDirectionWord)
/* harmony export */ });
// The LED cube's shift directions, in wire order.
//
// One list, imported by both sides, because there were two and they disagreed.
// The emitter had `{ up: 0, down: 1, left: 2, right: 3, forward: 4, back: 5 }`
// inline; the reader had the array, with a comment reading "must agree with the
// emitter's ...". A comment is not a constraint. `shift cube up` emitted
// `bw_cube_shift(0)`, came back as `shift cube 0`, and was then dropped as an
// unrecognised statement — the round trip lost the block entirely.
//
// The index IS the wire value, so the order of this array is a compatibility
// promise: appending is safe, reordering silently changes what already-compiled
// firmware means. Add to the end.
const CUBE_DIRECTIONS = ['up', 'down', 'left', 'right', 'forward', 'back'];

/** Wire value for a direction word, or -1 if it is not one. */
function cubeDirectionIndex(word) {
  return CUBE_DIRECTIONS.indexOf(String(word).trim().toLowerCase());
}

/** Direction word for a wire value, or null if it is out of range. */
function cubeDirectionWord(index) {
  const i = Number(index);
  return Number.isInteger(i) && i >= 0 && i < CUBE_DIRECTIONS.length ? CUBE_DIRECTIONS[i] : null;
}

/***/ }),

/***/ "./src/lib/sb3-creator-chostruntime.js":
/*!*********************************************!*\
  !*** ./src/lib/sb3-creator-chostruntime.js ***!
  \*********************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   C_HOST_INCLUDES: () => (/* binding */ C_HOST_INCLUDES),
/* harmony export */   STRUCT_SHIMS: () => (/* binding */ STRUCT_SHIMS),
/* harmony export */   cHostRuntime: () => (/* binding */ cHostRuntime),
/* harmony export */   cShimName: () => (/* binding */ cShimName),
/* harmony export */   shimSignatures: () => (/* binding */ shimSignatures)
/* harmony export */ });
/* harmony import */ var _sb3_creator_scratchruntime_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./sb3-creator-scratchruntime.js */ "./src/lib/sb3-creator-scratchruntime.js");
// The C runtime that host-target programs are emitted against.
//
// There are two C targets, and they have nothing in common but the language:
//
//   device C  — bare metal for the STC12/8051. 16-bit ints, no heap, no strings,
//               no sprites. A `move 10 steps` block is meaningless there and is
//               reported as such. `generateC` has always done this.
//   host C    — a portable C99 program that runs the project the way
//               `generatePython` does: sprites, lists, strings, dynamic values,
//               against a shim you can swap for a real renderer.
//
// Python gets its totality for free from `__getattr__`: any Scratch method the
// emitter invents resolves to a no-op returning 0, so `generatePython` never has
// to know the full block surface. C has no such escape, so the shim has to
// DECLARE every method — and that is exactly why it is generated here from
// `OP_TO_SCRATCH`, the same table that drives the Python and JavaScript targets.
// Coverage is then total by construction: a block that has a `scratch.<method>()`
// spelling in one target cannot fail to have a `scratch_<method>()` in this one.
//
// Values are a tagged union rather than a C type per block, because Scratch's are:
// `join`, `letter of` and `=` all have to accept a number where a string is meant
// and vice versa, with Scratch's own coercion rules (§ bw_cmp below).



// say/think exist at two arities (with and without a duration). C has no
// overloading, so the two-argument forms get their own names, and the emitter
// picks by argument count.
const ARITY_SUFFIX = {
  say: 'say_for',
  think: 'think_for'
};

/** `scratch.<method>` as a C identifier, disambiguated by arity where needed. */
function cShimName(method, argc) {
  if (argc >= 2 && ARITY_SUFFIX[method]) return 'scratch_' + ARITY_SUFFIX[method];
  return 'scratch_' + method;
}

/** Every shim signature the table implies: [{name, argc}], de-duplicated. */
function shimSignatures() {
  const seen = new Map();
  for (const e of Object.values(_sb3_creator_scratchruntime_js__WEBPACK_IMPORTED_MODULE_0__.OP_TO_SCRATCH)) {
    const argc = (e.gen || []).length;
    const name = cShimName(e.m, argc);
    // Keep the widest arity seen for a given C name; `say`/`say_for` are
    // already separated, so this only guards against table edits.
    if (!seen.has(name) || seen.get(name) < argc) seen.set(name, argc);
  }
  return [...seen].sort((a, b) => a[0] < b[0] ? -1 : 1).map(_ref => {
    let [name, argc] = _ref;
    return {
      name,
      argc
    };
  });
}

// The fixed part: values, coercion, lists. Kept as one string so the generated
// program is self-contained — the same choice generatePython makes with its
// `_Scratch` class, and the reason either can be pasted into a compiler and run.
const TYPE = "/* ---- values ---------------------------------------------------------------\n * A Scratch value is a number or a string, and blocks coerce freely between\n * them. Strings come out of a bump arena that is never freed: generated\n * programs are short-lived, and a refcount would be a lie about how carefully\n * this is managed. Swap the arena for a real allocator if that stops being true.\n */\n#define BW_NUM  0\n#define BW_STR  1\n#define BW_LIST 2                     /* reverse/sort/slice/... return one */\n\nstruct bw_list_s;\ntypedef struct { int kind; double n; const char *s; struct bw_list_s *l; } bw_val;\n\n/* Scratch lists are 1-based and silently ignore out-of-range writes; both are\n * modelled rather than corrected, because a project may rely on either. */\ntypedef struct bw_list_s { bw_val *v; int n, cap; } bw_list;\n\n/* Mutually recursive: a list prints its elements and an element may be a list. */\nstatic inline const char *bw_s(bw_val v);\nstatic const char *bw_list_text(bw_list *l, int json);\n";
const ARENA = "static char bw_arena[1 << 16];\nstatic size_t bw_arena_used = 0;\n\nstatic inline const char *bw_intern(const char *src, size_t len) {\n    if (bw_arena_used + len + 1 > sizeof bw_arena) return \"\";   /* out of arena */\n    char *dst = bw_arena + bw_arena_used;\n    memcpy(dst, src, len);\n    dst[len] = 0;\n    bw_arena_used += len + 1;\n    return dst;\n}\n";
const NUM = "static inline bw_val bw_num(double n) { bw_val v; v.kind = BW_NUM; v.n = n; v.s = 0; v.l = 0; return v; }\n";
const STR = "static inline bw_val bw_str(const char *s) { bw_val v; v.kind = BW_STR; v.n = 0; v.s = s; v.l = 0; return v; }\n";
const BOOL = "static inline bw_val bw_bool(int b) { return bw_num(b ? 1 : 0); }\n";
const N = "/* Number coercion: a non-numeric string is 0, which is Scratch's rule. */\nstatic inline double bw_n(bw_val v) {\n    if (v.kind == BW_NUM) return v.n;\n    if (v.kind == BW_LIST) return 0;\n    if (!v.s || !*v.s) return 0;\n    char *end;\n    double d = strtod(v.s, &end);\n    while (*end == ' ') end++;\n    return *end ? 0 : d;\n}\n";
const S = "/* String coercion. Integers print without a decimal point, as Scratch shows them. */\nstatic inline const char *bw_s(bw_val v) {\n    if (v.kind == BW_LIST) return bw_list_text(v.l, 0);   /* Python's str(list) */\n    if (v.kind == BW_STR) return v.s ? v.s : \"\";\n    char buf[40];\n    if (v.n == (double)(long long)v.n) snprintf(buf, sizeof buf, \"%lld\", (long long)v.n);\n    else snprintf(buf, sizeof buf, \"%g\", v.n);\n    return bw_intern(buf, strlen(buf));\n}\n";
const CHANGE = "/* `change x by n`. A helper rather than inline arithmetic so that the\n * way back can tell it from `set x to x + n`, which is a different block. */\nstatic inline void bw_change(bw_val *v, bw_val d) { *v = bw_num(bw_n(*v) + bw_n(d)); }\n";
const NUMERIC = "/* Does this value look like a number? Decides whether = compares numerically. */\nstatic inline int bw_numeric(bw_val v) {\n    if (v.kind == BW_NUM) return 1;\n    if (v.kind == BW_LIST) return 0;\n    if (!v.s || !*v.s) return 0;\n    char *end;\n    strtod(v.s, &end);\n    while (*end == ' ') end++;\n    return !*end;\n}\n";
const CMP = "/* Scratch comparison: numeric when both sides look numeric, else\n * case-insensitive string order. Returns <0, 0 or >0. */\nstatic inline int bw_cmp(bw_val a, bw_val b) {\n    if (bw_numeric(a) && bw_numeric(b)) {\n        double x = bw_n(a), y = bw_n(b);\n        return x < y ? -1 : (x > y ? 1 : 0);\n    }\n    const char *p = bw_s(a), *q = bw_s(b);\n    while (*p && *q) {\n        int c = tolower((unsigned char)*p) - tolower((unsigned char)*q);\n        if (c) return c;\n        p++; q++;\n    }\n    return (int)((unsigned char)*p) - (int)((unsigned char)*q);\n}\n";
const JOIN = "static inline bw_val bw_join(bw_val a, bw_val b) {\n    const char *p = bw_s(a), *q = bw_s(b);\n    size_t la = strlen(p), lb = strlen(q);\n    if (bw_arena_used + la + lb + 1 > sizeof bw_arena) return bw_str(\"\");\n    char *dst = bw_arena + bw_arena_used;\n    memcpy(dst, p, la); memcpy(dst + la, q, lb); dst[la + lb] = 0;\n    bw_arena_used += la + lb + 1;\n    return bw_str(dst);\n}\n";
const LETTER = "static inline bw_val bw_letter(bw_val s, bw_val i) {\n    const char *p = bw_s(s);\n    long k = (long)bw_n(i);\n    if (k < 1 || (size_t)k > strlen(p)) return bw_str(\"\");\n    return bw_str(bw_intern(p + k - 1, 1));\n}\n";
const LENGTH = "static inline bw_val bw_length(bw_val s) { return bw_num((double)strlen(bw_s(s))); }\n";
const CONTAINS = "static inline bw_val bw_contains(bw_val hay, bw_val needle) {\n    const char *h = bw_s(hay), *n = bw_s(needle);\n    size_t ln = strlen(n);\n    if (!ln) return bw_bool(1);\n    for (; *h; h++) {\n        size_t i = 0;\n        while (i < ln && h[i] && tolower((unsigned char)h[i]) == tolower((unsigned char)n[i])) i++;\n        if (i == ln) return bw_bool(1);\n    }\n    return bw_bool(0);\n}\n";
const MOD = "/* Scratch's mod follows the sign of the divisor, unlike C's fmod. */\nstatic inline bw_val bw_mod(bw_val a, bw_val b) {\n    double x = bw_n(a), y = bw_n(b);\n    if (y == 0) return bw_num(0);\n    double r = fmod(x, y);\n    if (r != 0 && ((r < 0) != (y < 0))) r += y;\n    return bw_num(r);\n}\n";
const RANDOM = "static inline bw_val bw_random(bw_val a, bw_val b) {\n    double lo = bw_n(a), hi = bw_n(b);\n    if (lo > hi) { double t = lo; lo = hi; hi = t; }\n    /* Integer range unless either bound was written with a fraction, as in Scratch. */\n    if (lo == (long)lo && hi == (long)hi)\n        return bw_num(lo + (double)(rand() % (long)(hi - lo + 1)));\n    return bw_num(lo + (hi - lo) * ((double)rand() / (double)RAND_MAX));\n}\n";
const MULTIPLE = "static inline int bw_multiple(bw_val a, bw_val b) {\n    return bw_n(bw_mod(a, b)) == 0;\n}\n";
const PI = "/* pi and e are blocks in their own right; as bare literals the way back\n * could not tell them from a number someone typed. */\nstatic inline bw_val bw_pi(void) { return bw_num(3.14159265358979323846); }\n";
const E = "static inline bw_val bw_e(void) { return bw_num(2.71828182845904523536); }\n";
const SUMDIGITS = "/* Planete Maths' `sum of digits`: digits only, sign and dot ignored. */\nstatic inline bw_val bw_sumdigits(bw_val x) {\n    const char *p = bw_s(x);\n    long total = 0;\n    for (; *p; p++) if (*p >= '0' && *p <= '9') total += *p - '0';\n    return bw_num((double)total);\n}\n";
const ARRAYS = "/* ---- Arrays & Vectors extension -------------------------------------------\n * A named-array registry, the C counterpart of the _Arrays class the Python\n * target emits. The 1-D surface is implemented; the 2-D and functional blocks\n * (map/filter/reduce/reshape/transpose) are declared so a program using them\n * still compiles, and the emitter warns when one is actually reached, because\n * a stub that silently returns 0 is how a simulator starts lying.\n */\n#define BW_ARRAYS_MAX 32\nstatic struct { const char *name; bw_list v; } bw_arr[BW_ARRAYS_MAX];\nstatic int bw_arr_n = 0;\n\nstatic inline bw_list *bw_array(bw_val name) {\n    const char *n = bw_s(name);\n    for (int i = 0; i < bw_arr_n; i++) if (!strcmp(bw_arr[i].name, n)) return &bw_arr[i].v;\n    if (bw_arr_n >= BW_ARRAYS_MAX) return &bw_arr[0].v;\n    bw_arr[bw_arr_n].name = bw_intern(n, strlen(n));\n    bw_arr[bw_arr_n].v.v = 0; bw_arr[bw_arr_n].v.n = 0; bw_arr[bw_arr_n].v.cap = 0;\n    return &bw_arr[bw_arr_n++].v;\n}\n\n/* `new array \"x\" = [1, 2, \"three\"]` \u2014 the literal arrives as text, as it does\n * on the Python side, so it is parsed here rather than at emit time. */\nstatic inline void bw_array_load(bw_list *l, bw_val text) {\n    const char *p = bw_s(text);\n    l->n = 0;\n    while (*p && *p != '[') p++;\n    if (*p == '[') p++;\n    while (*p) {\n        while (*p == ' ' || *p == ',') p++;\n        if (*p == ']' || !*p) break;\n        if (*p == '\"') {\n            const char *start = ++p;\n            while (*p && *p != '\"') p++;\n            bw_list_add(l, bw_str(bw_intern(start, (size_t)(p - start))));\n            if (*p == '\"') p++;\n        } else {\n            char *end;\n            double d = strtod(p, &end);\n            if (end == p) break;\n            bw_list_add(l, bw_num(d));\n            p = end;\n        }\n    }\n}\n\nstatic inline bw_val arrays_create1d(bw_val n, bw_val j) { bw_array_load(bw_array(n), j); return bw_num(0); }\nstatic inline bw_val arrays_create(bw_val n) { bw_array(n)->n = 0; return bw_num(0); }\nstatic inline bw_val arrays_create_range(bw_val n, bw_val s, bw_val e) {\n    bw_list *l = bw_array(n); l->n = 0;\n    for (long i = (long)bw_n(s); i <= (long)bw_n(e); i++) bw_list_add(l, bw_num((double)i));\n    return bw_num(0);\n}\nstatic inline bw_val arrays_push(bw_val n, bw_val v) { bw_list_add(bw_array(n), v); return bw_num(0); }\nstatic inline bw_val arrays_set(bw_val n, bw_val i, bw_val v) {\n    bw_list *l = bw_array(n); long k = (long)bw_n(i);\n    if (k >= 0 && k < l->n) l->v[k] = v;            /* 0-based, as the extension is */\n    return bw_num(0);\n}\nstatic inline bw_val arrays_insert(bw_val n, bw_val i, bw_val v) {\n    bw_list_insert(bw_array(n), (int)bw_n(i) + 1, v); return bw_num(0);\n}\nstatic inline bw_val arrays_remove(bw_val n, bw_val i) {\n    bw_list_delete(bw_array(n), (int)bw_n(i) + 1); return bw_num(0);\n}\nstatic inline bw_val arrays_drop(bw_val n) { bw_array(n)->n = 0; return bw_num(0); }\nstatic inline bw_val arrays_get(bw_val n, bw_val i) {\n    bw_list *l = bw_array(n); long k = (long)bw_n(i);\n    return (k >= 0 && k < l->n) ? l->v[k] : bw_str(\"\");\n}\nstatic inline bw_val arrays_pop(bw_val n) {\n    bw_list *l = bw_array(n);\n    return l->n ? l->v[--l->n] : bw_str(\"\");\n}\nstatic inline bw_val arrays_length(bw_val n) { return bw_num((double)bw_array(n)->n); }\nstatic inline bw_val arrays_sum(bw_val n) {\n    bw_list *l = bw_array(n); double t = 0;\n    for (int i = 0; i < l->n; i++) t += bw_n(l->v[i]);\n    return bw_num(t);\n}\nstatic inline bw_val arrays_mean(bw_val n) {\n    bw_list *l = bw_array(n);\n    return l->n ? bw_num(bw_n(arrays_sum(n)) / l->n) : bw_num(0);\n}\nstatic inline bw_val arrays_min(bw_val n) {\n    bw_list *l = bw_array(n); if (!l->n) return bw_num(0);\n    double m = bw_n(l->v[0]);\n    for (int i = 1; i < l->n; i++) if (bw_n(l->v[i]) < m) m = bw_n(l->v[i]);\n    return bw_num(m);\n}\nstatic inline bw_val arrays_max(bw_val n) {\n    bw_list *l = bw_array(n); if (!l->n) return bw_num(0);\n    double m = bw_n(l->v[0]);\n    for (int i = 1; i < l->n; i++) if (bw_n(l->v[i]) > m) m = bw_n(l->v[i]);\n    return bw_num(m);\n}\nstatic inline bw_val arrays_index_of(bw_val n, bw_val v) {\n    bw_list *l = bw_array(n);\n    for (int i = 0; i < l->n; i++) if (bw_cmp(l->v[i], v) == 0) return bw_num(i);\n    return bw_num(-1);\n}\nstatic inline bw_val arrays_contains(bw_val n, bw_val v) {\n    return bw_bool(bw_n(arrays_index_of(n, v)) >= 0);\n}\n/* Matches json.dumps on the Python side, separators and all, so the two\n * targets print the same thing. */\nstatic inline bw_val arrays_to_text(bw_val n) { return bw_str(bw_list_text(bw_array(n), 1)); }\n\n/* The list-valued operations. Each hands back a fresh list rather than mutating\n * the named one, which is what the Python side does and what `say (reverse of\n * array \"v\")` therefore has to print. */\nstatic inline bw_val arrays_reverse(bw_val n) {\n    bw_list *src = bw_array(n), *out = bw_new_list();\n    for (int i = src->n - 1; i >= 0; i--) bw_list_add(out, src->v[i]);\n    return bw_listval(out);\n}\n\nstatic inline bw_val arrays_sort(bw_val n, bw_val order) {\n    bw_list *src = bw_array(n), *out = bw_new_list();\n    for (int i = 0; i < src->n; i++) bw_list_add(out, src->v[i]);\n    int desc = strcmp(bw_s(order), \"ascending\") != 0;\n    for (int i = 1; i < out->n; i++) {            /* insertion sort: lists are small */\n        bw_val key = out->v[i];\n        int j = i - 1;\n        while (j >= 0 && (desc ? bw_cmp(out->v[j], key) < 0 : bw_cmp(out->v[j], key) > 0)) {\n            out->v[j + 1] = out->v[j]; j--;\n        }\n        out->v[j + 1] = key;\n    }\n    return bw_listval(out);\n}\n\nstatic inline bw_val arrays_slice(bw_val n, bw_val from, bw_val to) {\n    bw_list *src = bw_array(n), *out = bw_new_list();\n    long a = (long)bw_n(from), b = (long)bw_n(to);\n    if (a < 0) a = 0;\n    if (b > src->n) b = src->n;\n    for (long i = a; i < b; i++) bw_list_add(out, src->v[i]);\n    return bw_listval(out);\n}\n\nstatic inline bw_val arrays_flatten(bw_val n) {\n    bw_list *src = bw_array(n), *out = bw_new_list();\n    for (int i = 0; i < src->n; i++) {\n        if (src->v[i].kind == BW_LIST) {\n            bw_list *row = src->v[i].l;\n            for (int j = 0; j < row->n; j++) bw_list_add(out, row->v[j]);\n        } else bw_list_add(out, src->v[i]);\n    }\n    return bw_listval(out);\n}\n\n/* `[[1, 2], [3, 4]]` \u2014 the same text parser as the 1-D case, one level deeper. */\nstatic const char *bw_array_load2d(bw_list *l, const char *p) {\n    l->n = 0;\n    while (*p && *p != '[') p++;\n    if (*p == '[') p++;\n    while (*p) {\n        while (*p == ' ' || *p == ',') p++;\n        if (*p == ']' || !*p) break;\n        if (*p == '[') {\n            bw_list *row = bw_new_list();\n            p = bw_array_load2d(row, p);\n            bw_list_add(l, bw_listval(row));\n            continue;\n        }\n        if (*p == '\"') {\n            const char *start = ++p;\n            while (*p && *p != '\"') p++;\n            bw_list_add(l, bw_str(bw_intern(start, (size_t)(p - start))));\n            if (*p == '\"') p++;\n        } else {\n            char *end;\n            double d = strtod(p, &end);\n            if (end == p) break;\n            bw_list_add(l, bw_num(d));\n            p = end;\n        }\n    }\n    return *p == ']' ? p + 1 : p;\n}\n\nstatic inline bw_val arrays_create2d(bw_val n, bw_val j) {\n    bw_array_load2d(bw_array(n), bw_s(j));\n    return bw_num(0);\n}\n\nstatic inline bw_val arrays_get2d(bw_val n, bw_val r, bw_val c) {\n    bw_list *l = bw_array(n);\n    long i = (long)bw_n(r), k = (long)bw_n(c);\n    if (i < 0 || i >= l->n || l->v[i].kind != BW_LIST) return bw_str(\"\");\n    bw_list *row = l->v[i].l;\n    return (k >= 0 && k < row->n) ? row->v[k] : bw_str(\"\");\n}\n\nstatic inline bw_val arrays_set2d(bw_val n, bw_val r, bw_val c, bw_val v) {\n    bw_list *l = bw_array(n);\n    long i = (long)bw_n(r), k = (long)bw_n(c);\n    while (l->n <= i) bw_list_add(l, bw_listval(bw_new_list()));\n    if (l->v[i].kind != BW_LIST) l->v[i] = bw_listval(bw_new_list());\n    bw_list *row = l->v[i].l;\n    while (row->n <= k) bw_list_add(row, bw_num(0));\n    row->v[k] = v;\n    return bw_num(0);\n}\n\nstatic inline bw_val arrays_transpose(bw_val n) {\n    bw_list *l = bw_array(n), *out = bw_new_list();\n    int cols = 0;\n    for (int i = 0; i < l->n; i++)\n        if (l->v[i].kind == BW_LIST && l->v[i].l->n > cols) cols = l->v[i].l->n;\n    for (int c = 0; c < cols; c++) {\n        bw_list *row = bw_new_list();\n        for (int i = 0; i < l->n; i++) {\n            if (l->v[i].kind != BW_LIST || c >= l->v[i].l->n) break;   /* zip() stops short */\n            bw_list_add(row, l->v[i].l->v[c]);\n        }\n        if (row->n == l->n) bw_list_add(out, bw_listval(row));\n    }\n    return bw_listval(out);\n}\n\nstatic bw_list *bw_reshape(bw_list *flat, int *taken, bw_list *dims, int d) {\n    bw_list *out = bw_new_list();\n    long count = (long)bw_n(dims->v[d]);\n    for (long i = 0; i < count; i++) {\n        if (d == dims->n - 1) {\n            bw_list_add(out, *taken < flat->n ? flat->v[(*taken)++] : bw_num(0));\n        } else {\n            bw_list_add(out, bw_listval(bw_reshape(flat, taken, dims, d + 1)));\n        }\n    }\n    return out;\n}\n\nstatic void bw_flat_into(bw_list *src, bw_list *dst) {\n    for (int i = 0; i < src->n; i++) {\n        if (src->v[i].kind == BW_LIST) bw_flat_into(src->v[i].l, dst);\n        else bw_list_add(dst, src->v[i]);\n    }\n}\n\nstatic inline bw_val arrays_reshape(bw_val n, bw_val shape) {\n    bw_list dims = {0, 0, 0};\n    bw_array_load(&dims, shape);\n    if (!dims.n) return bw_listval(bw_new_list());\n    bw_list *flat = bw_new_list();\n    bw_flat_into(bw_array(n), flat);\n    int taken = 0;\n    return bw_listval(bw_reshape(flat, &taken, &dims, 0));\n}\n\n/* ---- the lambda subset -----------------------------------------------------\n * map/filter/reduce take their function as text -- \"(x) => x * 2\" -- and the\n * Python target eval()s it. C cannot, so this is a small recursive-descent\n * evaluator over the subset those blocks actually contain: numbers, string\n * literals, the parameters, ( ), unary -, * / %, + -, comparisons, and && ||.\n * Anything outside that yields 0 and is reported by the emitter rather than\n * guessed at, because a lambda that silently evaluates to 0 would make the C\n * disagree with Python without saying so.\n */\ntypedef struct {\n    const char *p;\n    const char *names[2];\n    bw_val args[2];\n    int argc;\n    int failed;\n} bw_lam;\n\nstatic bw_val bw_lam_or(bw_lam *L);\n\nstatic void bw_lam_ws(bw_lam *L) { while (*L->p == ' ' || *L->p == '\t') L->p++; }\n\nstatic int bw_lam_eat(bw_lam *L, const char *tok) {\n    bw_lam_ws(L);\n    size_t n = strlen(tok);\n    if (strncmp(L->p, tok, n)) return 0;\n    /* `<` must not swallow the `<` of `<=` */\n    if ((tok[0] == '<' || tok[0] == '>') && n == 1 && L->p[1] == '=') return 0;\n    L->p += n;\n    return 1;\n}\n\nstatic bw_val bw_lam_atom(bw_lam *L) {\n    bw_lam_ws(L);\n    if (*L->p == '(') {\n        L->p++;\n        bw_val v = bw_lam_or(L);\n        bw_lam_ws(L);\n        if (*L->p == ')') L->p++; else L->failed = 1;\n        return v;\n    }\n    if (*L->p == '-') { L->p++; return bw_num(-bw_n(bw_lam_atom(L))); }\n    if (*L->p == '\"' || *L->p == 0x27) {\n        char q = *L->p++;\n        const char *start = L->p;\n        while (*L->p && *L->p != q) L->p++;\n        bw_val v = bw_str(bw_intern(start, (size_t)(L->p - start)));\n        if (*L->p == q) L->p++;\n        return v;\n    }\n    if ((*L->p >= '0' && *L->p <= '9') || *L->p == '.') {\n        char *end;\n        double d = strtod(L->p, &end);\n        L->p = end;\n        return bw_num(d);\n    }\n    const char *start = L->p;\n    while ((*L->p >= 'a' && *L->p <= 'z') || (*L->p >= 'A' && *L->p <= 'Z')\n           || (*L->p >= '0' && *L->p <= '9') || *L->p == '_') L->p++;\n    size_t len = (size_t)(L->p - start);\n    for (int i = 0; i < L->argc; i++)\n        if (strlen(L->names[i]) == len && !strncmp(L->names[i], start, len)) return L->args[i];\n    L->failed = 1;\n    return bw_num(0);\n}\n\nstatic bw_val bw_lam_mul(bw_lam *L) {\n    bw_val v = bw_lam_atom(L);\n    for (;;) {\n        bw_lam_ws(L);\n        if (bw_lam_eat(L, \"*\")) v = bw_num(bw_n(v) * bw_n(bw_lam_atom(L)));\n        else if (bw_lam_eat(L, \"/\")) { double d = bw_n(bw_lam_atom(L)); v = bw_num(d ? bw_n(v) / d : 0); }\n        else if (bw_lam_eat(L, \"%\")) v = bw_mod(v, bw_lam_atom(L));\n        else return v;\n    }\n}\n\nstatic bw_val bw_lam_add(bw_lam *L) {\n    bw_val v = bw_lam_mul(L);\n    for (;;) {\n        bw_lam_ws(L);\n        if (bw_lam_eat(L, \"+\")) {\n            bw_val r = bw_lam_mul(L);\n            /* Python's + is concatenation when either side is a string. */\n            v = (v.kind == BW_STR || r.kind == BW_STR) ? bw_join(v, r) : bw_num(bw_n(v) + bw_n(r));\n        } else if (bw_lam_eat(L, \"-\")) v = bw_num(bw_n(v) - bw_n(bw_lam_mul(L)));\n        else return v;\n    }\n}\n\nstatic bw_val bw_lam_cmp(bw_lam *L) {\n    bw_val v = bw_lam_add(L);\n    bw_lam_ws(L);\n    if (bw_lam_eat(L, \"==\")) return bw_bool(bw_cmp(v, bw_lam_add(L)) == 0);\n    if (bw_lam_eat(L, \"!=\")) return bw_bool(bw_cmp(v, bw_lam_add(L)) != 0);\n    if (bw_lam_eat(L, \"<=\")) return bw_bool(bw_cmp(v, bw_lam_add(L)) <= 0);\n    if (bw_lam_eat(L, \">=\")) return bw_bool(bw_cmp(v, bw_lam_add(L)) >= 0);\n    if (bw_lam_eat(L, \"<\")) return bw_bool(bw_cmp(v, bw_lam_add(L)) < 0);\n    if (bw_lam_eat(L, \">\")) return bw_bool(bw_cmp(v, bw_lam_add(L)) > 0);\n    return v;\n}\n\nstatic bw_val bw_lam_and(bw_lam *L) {\n    bw_val v = bw_lam_cmp(L);\n    while (bw_lam_eat(L, \"&&\") || bw_lam_eat(L, \"and\")) {\n        bw_val r = bw_lam_cmp(L);\n        v = bw_bool(bw_n(v) != 0 && bw_n(r) != 0);\n    }\n    return v;\n}\n\nstatic bw_val bw_lam_or(bw_lam *L) {\n    bw_val v = bw_lam_and(L);\n    while (bw_lam_eat(L, \"||\") || bw_lam_eat(L, \"or\")) {\n        bw_val r = bw_lam_and(L);\n        v = bw_bool(bw_n(v) != 0 || bw_n(r) != 0);\n    }\n    return v;\n}\n\n/* Apply \"(a, b) => body\" to up to two arguments. */\nstatic bw_val bw_lam_call(bw_val fn, bw_val a0, bw_val a1, int argc) {\n    const char *text = bw_s(fn);\n    const char *arrow = strstr(text, \"=>\");\n    if (!arrow) return bw_num(0);\n    bw_lam L;\n    L.argc = 0; L.failed = 0;\n    /* parameter list, with or without its parentheses */\n    const char *q = text;\n    while (q < arrow && L.argc < 2) {\n        while (q < arrow && (*q == ' ' || *q == '(' || *q == ',')) q++;\n        const char *start = q;\n        while (q < arrow && *q != ' ' && *q != ',' && *q != ')') q++;\n        if (q > start) {\n            L.names[L.argc] = bw_intern(start, (size_t)(q - start));\n            L.argc++;\n        }\n        while (q < arrow && (*q == ')' || *q == ' ')) q++;\n    }\n    L.args[0] = a0; L.args[1] = a1;\n    if (argc < L.argc) L.argc = argc;\n    L.p = arrow + 2;\n    bw_val v = bw_lam_or(&L);\n    return L.failed ? bw_num(0) : v;\n}\n\nstatic inline bw_val arrays_map(bw_val n, bw_val fn) {\n    bw_list *src = bw_array(n), *out = bw_new_list();\n    for (int i = 0; i < src->n; i++) bw_list_add(out, bw_lam_call(fn, src->v[i], bw_num(0), 1));\n    return bw_listval(out);\n}\n\nstatic inline bw_val arrays_filter(bw_val n, bw_val fn) {\n    bw_list *src = bw_array(n), *out = bw_new_list();\n    for (int i = 0; i < src->n; i++)\n        if (bw_n(bw_lam_call(fn, src->v[i], bw_num(0), 1)) != 0) bw_list_add(out, src->v[i]);\n    return bw_listval(out);\n}\n\nstatic inline bw_val arrays_reduce(bw_val n, bw_val fn, bw_val init) {\n    bw_list *src = bw_array(n);\n    bw_val acc = init;\n    for (int i = 0; i < src->n; i++) acc = bw_lam_call(fn, acc, src->v[i], 2);\n    return acc;\n}\n\n";
const LISTTEXT = "/* A list as text. `json` picks the extension's `as text` form, which is\n * json.dumps on the Python side (\"a\"); everything else is Python's str(list),\n * which quotes strings with apostrophes ('a'). Two spellings, one function,\n * because the two targets have to print the same bytes. */\nstatic const char *bw_list_text(bw_list *l, int json) {\n    char buf[4096];\n    size_t k = 0;\n    buf[k++] = '[';\n    for (int i = 0; i < l->n && k < sizeof buf - 80; i++) {\n        if (i) { buf[k++] = ','; buf[k++] = ' '; }\n        bw_val e = l->v[i];\n        if (e.kind == BW_LIST) {\n            const char *inner = bw_list_text(e.l, json);\n            size_t n = strlen(inner);\n            if (k + n >= sizeof buf - 8) break;\n            memcpy(buf + k, inner, n); k += n;\n        } else if (e.kind == BW_STR) {\n            const char *t = e.s ? e.s : \"\";\n            size_t n = strlen(t);\n            if (k + n >= sizeof buf - 8) break;\n            buf[k++] = json ? '\"' : 0x27;\n            memcpy(buf + k, t, n); k += n;\n            buf[k++] = json ? '\"' : 0x27;\n        } else {\n            const char *t = bw_s(e);\n            size_t n = strlen(t);\n            if (k + n >= sizeof buf - 8) break;\n            memcpy(buf + k, t, n); k += n;\n        }\n    }\n    buf[k++] = ']';\n    buf[k] = 0;\n    return bw_intern(buf, k);\n}\n\n";
const NEWLIST = "static inline bw_list *bw_new_list(void) {\n    bw_list *l = (bw_list *)calloc(1, sizeof(bw_list));\n    return l;\n}\n\nstatic inline bw_val bw_listval(bw_list *l) {\n    bw_val v; v.kind = BW_LIST; v.n = 0; v.s = 0; v.l = l; return v;\n}\n";
const WAIT = "/* A wait is real time, not a busy loop, so a generated program behaves like\n * the project rather than pinning a core. POSIX; swap for Sleep() on Windows. */\nstatic inline void bw_wait(bw_val secs) {\n    double d = bw_n(secs);\n    if (d <= 0) return;\n    struct timespec ts;\n    ts.tv_sec = (time_t)d;\n    ts.tv_nsec = (long)((d - (double)ts.tv_sec) * 1e9);\n    nanosleep(&ts, 0);\n}\n";
const ASK = "/* `ask and wait` reads a line; `answer` then holds it, as in Scratch. */\nstatic inline bw_val bw_ask(bw_val question) {\n    static char line[512];\n    printf(\"%s \", bw_s(question));\n    fflush(stdout);\n    if (!fgets(line, sizeof line, stdin)) return bw_str(\"\");\n    size_t n = strlen(line);\n    while (n && (line[n - 1] == '\\n' || line[n - 1] == '\\r')) line[--n] = 0;\n    return bw_str(bw_intern(line, n));\n}\n";
const MATHOP = "/* Scratch's [abs v] of () menu. Trig is in degrees, as the blocks are. */\nstatic inline bw_val bw_mathop(const char *op, bw_val x) {\n    double d = bw_n(x);\n    if (!strcmp(op, \"abs\")) return bw_num(fabs(d));\n    if (!strcmp(op, \"floor\")) return bw_num(floor(d));\n    if (!strcmp(op, \"ceiling\")) return bw_num(ceil(d));\n    if (!strcmp(op, \"sqrt\")) return bw_num(sqrt(d));\n    if (!strcmp(op, \"sin\")) return bw_num(sin(d * 3.14159265358979323846 / 180.0));\n    if (!strcmp(op, \"cos\")) return bw_num(cos(d * 3.14159265358979323846 / 180.0));\n    if (!strcmp(op, \"tan\")) return bw_num(tan(d * 3.14159265358979323846 / 180.0));\n    if (!strcmp(op, \"asin\")) return bw_num(asin(d) * 180.0 / 3.14159265358979323846);\n    if (!strcmp(op, \"acos\")) return bw_num(acos(d) * 180.0 / 3.14159265358979323846);\n    if (!strcmp(op, \"atan\")) return bw_num(atan(d) * 180.0 / 3.14159265358979323846);\n    if (!strcmp(op, \"ln\")) return bw_num(log(d));\n    if (!strcmp(op, \"log\")) return bw_num(log10(d));\n    if (!strcmp(op, \"e ^\")) return bw_num(exp(d));\n    if (!strcmp(op, \"10 ^\")) return bw_num(pow(10.0, d));\n    return bw_num(fabs(d));\n}\n";
const LIST = "static inline void bw_list_grow(bw_list *l, int need) {\n    if (need <= l->cap) return;\n    int cap = l->cap ? l->cap * 2 : 8;\n    while (cap < need) cap *= 2;\n    l->v = (bw_val *)realloc(l->v, (size_t)cap * sizeof(bw_val));\n    l->cap = cap;\n}\nstatic inline void bw_list_add(bw_list *l, bw_val x) { bw_list_grow(l, l->n + 1); l->v[l->n++] = x; }\nstatic inline void bw_list_delete(bw_list *l, int i) {\n    if (i < 1 || i > l->n) return;\n    memmove(l->v + i - 1, l->v + i, (size_t)(l->n - i) * sizeof(bw_val));\n    l->n--;\n}\nstatic inline void bw_list_delete_all(bw_list *l) { l->n = 0; }\nstatic inline void bw_list_insert(bw_list *l, int i, bw_val x) {\n    if (i < 1 || i > l->n + 1) return;\n    bw_list_grow(l, l->n + 1);\n    memmove(l->v + i, l->v + i - 1, (size_t)(l->n - i + 1) * sizeof(bw_val));\n    l->v[i - 1] = x; l->n++;\n}\nstatic inline void bw_list_replace(bw_list *l, int i, bw_val x) { if (i >= 1 && i <= l->n) l->v[i - 1] = x; }\nstatic inline bw_val bw_list_item(bw_list *l, int i) { return (i >= 1 && i <= l->n) ? l->v[i - 1] : bw_str(\"\"); }\nstatic inline bw_val bw_list_length(bw_list *l) { return bw_num((double)l->n); }\nstatic inline bw_val bw_list_contains(bw_list *l, bw_val x) {\n    for (int i = 0; i < l->n; i++) if (bw_cmp(l->v[i], x) == 0) return bw_bool(1);\n    return bw_bool(0);\n}\nstatic inline bw_val bw_list_index(bw_list *l, bw_val x) {\n    for (int i = 0; i < l->n; i++) if (bw_cmp(l->v[i], x) == 0) return bw_num(i + 1);\n    return bw_num(0);\n}\n";

// The runtime is split into chunks so a program carries only what it calls:
// clang treats an unused `static inline` in a .c file as a warning, so shipping
// all of it would make -Werror unusable for a two-block project. `deps` is the
// transitive part -- bw_cmp needs bw_numeric, the list needs bw_cmp.
const CHUNKS = [{
  name: '#type',
  always: true,
  code: TYPE
}, {
  name: 'bw_intern',
  code: ARENA
}, {
  name: 'bw_num',
  code: NUM
}, {
  name: 'bw_str',
  code: STR
}, {
  name: 'bw_bool',
  code: BOOL
}, {
  name: 'bw_n',
  code: N
}, {
  name: 'bw_s',
  code: S
}, {
  name: 'bw_change',
  code: CHANGE
}, {
  name: 'bw_numeric',
  code: NUMERIC
}, {
  name: 'bw_cmp',
  code: CMP
}, {
  name: 'bw_join',
  code: JOIN
}, {
  name: 'bw_letter',
  code: LETTER
}, {
  name: 'bw_length',
  code: LENGTH
}, {
  name: 'bw_contains',
  code: CONTAINS
}, {
  name: 'bw_mod',
  code: MOD
}, {
  name: 'bw_random',
  code: RANDOM
}, {
  name: 'bw_multiple',
  code: MULTIPLE
}, {
  name: 'bw_pi',
  code: PI
}, {
  name: 'bw_e',
  code: E
}, {
  name: 'bw_sumdigits',
  code: SUMDIGITS
}, {
  name: 'bw_wait',
  code: WAIT
}, {
  name: 'bw_ask',
  code: ASK
}, {
  name: 'bw_mathop',
  code: MATHOP
}, ...listChunks(),
// after the list chunks: the registry is built on bw_list. Split per
// function for the same reason the list is — a project that only pushes
// must not carry `mean` and `index of`.
{
  name: 'bw_list_text',
  code: LISTTEXT
}, {
  name: 'bw_new_list',
  code: NEWLIST
}, ...arrayChunks()];

/** ARRAYS, cut into the registry base plus one chunk per operation. */
function arrayChunks() {
  const first = ARRAYS.indexOf('static inline bw_val arrays_create1d');
  const base = ARRAYS.slice(0, first);
  const rest = ARRAYS.slice(first);
  const out = [{
    name: 'bw_array',
    code: base
  }];
  let prefix = '';
  for (const piece of rest.split(/\n(?=static inline |static \w|\/\* )/).filter(Boolean)) {
    // Name a piece by the first function it defines, whatever that is: the
    // registry has private helpers (bw_array_load2d, bw_reshape) as well as
    // arrays_* entry points, and dropping the ones that did not match an
    // arrays_ name is how create2d ended up calling something undeclared.
    const name = (piece.match(/^(?:static\s+(?:inline\s+)?[\w *]+?)\b(\w+)\s*\(/m) || [])[1];
    // A piece with no function of its own is a preamble -- a typedef, a
    // forward declaration -- and belongs to what comes NEXT, not to what
    // came before, which may well be pruned away from under it.
    if (name) {
      out.push({
        name,
        code: prefix + piece.trimEnd() + '\n'
      });
      prefix = '';
    } else prefix += piece;
  }
  return out;
}

// Cut a block of C into one entry per `static inline ... bw_foo(` definition,
// keeping each function's own leading comment with it.
function listChunks() {
  const head = LIST.slice(0, LIST.indexOf('static inline void bw_list_grow'));
  const rest = LIST.slice(LIST.indexOf('static inline void bw_list_grow'));
  const pieces = rest.split(/\n(?=static inline )/).filter(Boolean);
  const out = [{
    name: 'bw_list_grow',
    code: head + pieces[0] + '\n'
  }]; // typedef + grow
  for (const piece of pieces.slice(1)) {
    const name = (piece.match(/\b(bw_list_\w+)\(/) || [])[1];
    if (!name) continue;
    out.push({
      name,
      code: piece.trimEnd() + '\n'
    });
  }
  return out;
}

/**
 * The chunks this program needs, by fixed point rather than a dependency list.
 * Start with everything, then repeatedly drop any chunk whose function nobody
 * calls -- not the body, not another surviving chunk. A hand-written `deps`
 * table would be a second copy of the truth, and would go stale the first time
 * a helper stopped calling another. clang counts an unused `static inline` in a
 * .c file as a warning, so this is what lets a two-block project build cleanly
 * under -Werror.
 */
function neededChunks(body) {
  let keep = CHUNKS.slice();
  for (;;) {
    const dropped = [];
    const survivors = keep.filter(c => {
      if (c.always) return true;
      const others = keep.filter(o => o !== c).map(o => o.code).join('\n');
      // One chunk holds the whole arrays registry, so any arrays_* call
      // keeps it; every other chunk is one function and answers to its
      // own name.
      const probe = c.name === 'bw_array' ? /\barrays_\w+\s*\(/ : new RegExp('\\b' + c.name + '\\s*\\(');
      if (probe.test(body) || probe.test(others)) return true;
      dropped.push(c);
      return false;
    });
    if (!dropped.length) return keep;
    keep = survivors;
  }
}

/**
 * The whole runtime for one generated program: values, lists, and the shim.
 * `used` is the set of shim names the program actually calls; passing it emits
 * only those (plus the handful the runtime itself needs), so a two-line project
 * does not carry 59 stubs. Pass null for all of them.
 */
function cHostRuntime() {
  let body = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '';
  let used = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
  // Build the shim first: `scratch_say` calls bw_s, so the pruning below has to
  // see the shim text as well as the program, or a project whose only string
  // coercion happens inside a shim loses the helper it needs.
  const shim = [];
  for (const {
    name,
    argc
  } of [...shimSignatures(), ...STRUCT_SHIMS]) {
    if (used ? !used.has(name) : !new RegExp('\\b' + name + '\\s*\\(').test(body)) continue;
    const params = argc === 0 ? 'void' : Array.from({
      length: argc
    }, (_, i) => "bw_val a".concat(i)).join(', ');
    const say = name === 'scratch_say' || name === 'scratch_think';
    const sayFor = name === 'scratch_say_for' || name === 'scratch_think_for';
    const inner = say ? ' printf("%s\\n", bw_s(a0));' : sayFor ? ' printf("%s\\n", bw_s(a0)); (void)a1;' : Array.from({
      length: argc
    }, (_, i) => " (void)a".concat(i, ";")).join('');
    shim.push("static inline bw_val ".concat(name, "(").concat(params, ") {").concat(inner, " return bw_num(0); }"));
  }
  const out = [];
  for (const chunk of neededChunks(body + '\n' + shim.join('\n'))) out.push(chunk.code);
  if (shim.length) {
    out.push('/* ---- Scratch stage shim ---------------------------------------------------');
    out.push(' * No-ops that report what they were asked to do, so a generated program runs');
    out.push(' * and prints something without a renderer. Replace the bodies to drive one.');
    out.push(' * Generated from the same OP_TO_SCRATCH table as the Python and JS targets,');
    out.push(' * so this list cannot fall behind them.');
    out.push(' */');
    out.push(...shim);
  }
  out.push('');
  return out.join('\n');
}

// Structural markers (sprite/stage/local/costume/defblock) are not blocks, so they
// are not in OP_TO_SCRATCH -- but Python emits them into the program so the project
// structure round-trips, and `__getattr__` makes them exist for free there. Here they
// have to be declared like everything else.
const STRUCT_SHIMS = [{
  name: 'scratch_stage',
  argc: 0
}, {
  name: 'scratch_sprite',
  argc: 1
}, {
  name: 'scratch_sprite_shape',
  argc: 2
}, {
  name: 'scratch_local',
  argc: 1
}, {
  name: 'scratch_local_list',
  argc: 1
}, {
  name: 'scratch_costume',
  argc: 1
}, {
  name: 'scratch_sound',
  argc: 1
}, {
  name: 'scratch_defblock',
  argc: 2
}, {
  name: 'scratch_global_var',
  argc: 1
}, {
  name: 'scratch_global_list',
  argc: 1
}];

/** The headers the runtime above needs. */
const C_HOST_INCLUDES = ['stdio.h', 'stdlib.h', 'string.h', 'math.h', 'ctype.h', 'time.h'];

/***/ }),

/***/ "./src/lib/sb3-creator-runtime.js":
/*!****************************************!*\
  !*** ./src/lib/sb3-creator-runtime.js ***!
  \****************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   RUNTIME_EXTENSIONS: () => (/* binding */ RUNTIME_EXTENSIONS),
/* harmony export */   RUNTIME_EXTENSION_URLS: () => (/* binding */ RUNTIME_EXTENSION_URLS)
/* harmony export */ });
// GENERATED by scripts/gen-runtime-registry.mjs — do not edit by hand.
// Runtime/hardware extension block surface (source: github.com/CrispStrobe/extensions),
// consumed by the pluggable-driver convention in sb3Creator.js. See reference/runtime-drivers.md.
const RUNTIME_EXTENSIONS = {
  "universalgamepad": {
    "runtime": "universalgamepad",
    "ops": {
      "isConnected": {
        "kind": "boolean",
        "method": "isConnected",
        "args": []
      },
      "getControllerInfo": {
        "kind": "reporter",
        "method": "getControllerInfo",
        "args": []
      },
      "getControllerCount": {
        "kind": "reporter",
        "method": "getControllerCount",
        "args": []
      },
      "whenButtonPressed": {
        "kind": "hat",
        "method": "whenButtonPressed",
        "args": ["BUTTON"]
      },
      "isButtonPressed": {
        "kind": "boolean",
        "method": "isButtonPressed",
        "args": ["BUTTON"]
      },
      "isAnyButtonPressed": {
        "kind": "boolean",
        "method": "isAnyButtonPressed",
        "args": []
      },
      "getStickValue": {
        "kind": "reporter",
        "method": "getStickValue",
        "args": ["STICK", "AXIS"]
      },
      "getStickDirection": {
        "kind": "reporter",
        "method": "getStickDirection",
        "args": ["STICK"]
      },
      "getStickMagnitude": {
        "kind": "reporter",
        "method": "getStickMagnitude",
        "args": ["STICK"]
      },
      "getCursorX": {
        "kind": "reporter",
        "method": "getCursorX",
        "args": []
      },
      "getCursorY": {
        "kind": "reporter",
        "method": "getCursorY",
        "args": []
      },
      "setCursorPosition": {
        "kind": "command",
        "method": "setCursorPosition",
        "args": ["X", "Y"]
      },
      "resetCursor": {
        "kind": "command",
        "method": "resetCursor",
        "args": []
      },
      "setCursorSensitivity": {
        "kind": "command",
        "method": "setCursorSensitivity",
        "args": ["SENSITIVITY"]
      },
      "vibrate": {
        "kind": "command",
        "method": "vibrate",
        "args": ["DURATION", "INTENSITY"]
      },
      "vibratePattern": {
        "kind": "command",
        "method": "vibratePattern",
        "args": ["WEAK", "STRONG", "DURATION"]
      },
      "stopVibration": {
        "kind": "command",
        "method": "stopVibration",
        "args": []
      },
      "setDeadzone": {
        "kind": "command",
        "method": "setDeadzone",
        "args": ["DEADZONE"]
      },
      "showDebugInfo": {
        "kind": "command",
        "method": "showDebugInfo",
        "args": []
      },
      "getDebugStats": {
        "kind": "reporter",
        "method": "getDebugStats",
        "args": ["STAT"]
      }
    }
  },
  "legoboostunified": {
    "runtime": "legoboostunified",
    "ops": {
      "setConnectionType": {
        "kind": "command",
        "method": "setConnectionType",
        "args": ["TYPE"]
      },
      "setBridgeURL": {
        "kind": "command",
        "method": "setBridgeURL",
        "args": ["URL"]
      },
      "connect": {
        "kind": "command",
        "method": "connect",
        "args": []
      },
      "disconnect": {
        "kind": "command",
        "method": "disconnect",
        "args": []
      },
      "isConnected": {
        "kind": "boolean",
        "method": "isConnected",
        "args": []
      },
      "setDebugLevel": {
        "kind": "command",
        "method": "setDebugLevel",
        "args": ["LEVEL"]
      },
      "enableDebug": {
        "kind": "command",
        "method": "enableDebug",
        "args": ["ENABLED"]
      },
      "motorOn": {
        "kind": "command",
        "method": "motorOn",
        "args": ["MOTOR_ID"]
      },
      "motorOff": {
        "kind": "command",
        "method": "motorOff",
        "args": ["MOTOR_ID"]
      },
      "motorOnFor": {
        "kind": "command",
        "method": "motorOnFor",
        "args": ["MOTOR_ID", "TIME"]
      },
      "motorOnForDegrees": {
        "kind": "command",
        "method": "motorOnForDegrees",
        "args": ["MOTOR_ID", "DEGREES"]
      },
      "setMotorPower": {
        "kind": "command",
        "method": "setMotorPower",
        "args": ["MOTOR_ID", "POWER"]
      },
      "setMotorDirection": {
        "kind": "command",
        "method": "setMotorDirection",
        "args": ["MOTOR_ID", "MOTOR_DIRECTION"]
      },
      "setMotorStopAction": {
        "kind": "command",
        "method": "setMotorStopAction",
        "args": ["MOTOR_ID", "ACTION"]
      },
      "setMotorAcceleration": {
        "kind": "command",
        "method": "setMotorAcceleration",
        "args": ["MOTOR_ID", "TIME"]
      },
      "setMotorDeceleration": {
        "kind": "command",
        "method": "setMotorDeceleration",
        "args": ["MOTOR_ID", "TIME"]
      },
      "resetMotorPosition": {
        "kind": "command",
        "method": "resetMotorPosition",
        "args": ["MOTOR_ID", "POSITION"]
      },
      "getMotorPosition": {
        "kind": "reporter",
        "method": "getMotorPosition",
        "args": ["MOTOR_ID"]
      },
      "whenColor": {
        "kind": "hat",
        "method": "whenColor",
        "args": ["PORT", "COLOR"]
      },
      "seeingColor": {
        "kind": "boolean",
        "method": "seeingColor",
        "args": ["PORT", "COLOR"]
      },
      "getDistance": {
        "kind": "reporter",
        "method": "getDistance",
        "args": ["PORT"]
      },
      "getReflection": {
        "kind": "reporter",
        "method": "getReflection",
        "args": ["PORT"]
      },
      "getForce": {
        "kind": "reporter",
        "method": "getForce",
        "args": ["PORT"]
      },
      "whenForceSensorPressed": {
        "kind": "hat",
        "method": "whenForceSensorPressed",
        "args": ["PORT"]
      },
      "isForceSensorPressed": {
        "kind": "boolean",
        "method": "isForceSensorPressed",
        "args": ["PORT"]
      },
      "whenTilted": {
        "kind": "hat",
        "method": "whenTilted",
        "args": ["TILT_DIRECTION_ANY"]
      },
      "isTilted": {
        "kind": "boolean",
        "method": "isTilted",
        "args": ["TILT_DIRECTION_ANY"]
      },
      "getTiltAngle": {
        "kind": "reporter",
        "method": "getTiltAngle",
        "args": ["TILT_DIRECTION"]
      },
      "setLightHue": {
        "kind": "command",
        "method": "setLightHue",
        "args": ["HUE"]
      },
      "shutdown": {
        "kind": "command",
        "method": "shutdown",
        "args": []
      },
      "whenButtonPressed": {
        "kind": "hat",
        "method": "whenButtonPressed",
        "args": []
      },
      "isButtonPressed": {
        "kind": "boolean",
        "method": "isButtonPressed",
        "args": []
      },
      "getBatteryLevel": {
        "kind": "reporter",
        "method": "getBatteryLevel",
        "args": []
      },
      "getFirmwareVersion": {
        "kind": "reporter",
        "method": "getFirmwareVersion",
        "args": []
      },
      "getRSSI": {
        "kind": "reporter",
        "method": "getRSSI",
        "args": []
      },
      "whenBatteryLow": {
        "kind": "hat",
        "method": "whenBatteryLow",
        "args": []
      },
      "whenMotorOverloaded": {
        "kind": "hat",
        "method": "whenMotorOverloaded",
        "args": []
      }
    }
  },
  "legopoweredup": {
    "runtime": "legopoweredup",
    "ops": {
      "setConnectionType": {
        "kind": "command",
        "method": "setConnectionType",
        "args": ["TYPE"]
      },
      "setBridgeURL": {
        "kind": "command",
        "method": "setBridgeURL",
        "args": ["URL"]
      },
      "connect": {
        "kind": "command",
        "method": "connect",
        "args": []
      },
      "disconnect": {
        "kind": "command",
        "method": "disconnect",
        "args": []
      },
      "isConnected": {
        "kind": "boolean",
        "method": "isConnected",
        "args": []
      },
      "getHubType": {
        "kind": "reporter",
        "method": "getHubType",
        "args": []
      },
      "getConnectedDevices": {
        "kind": "reporter",
        "method": "getConnectedDevices",
        "args": []
      },
      "getDeviceOnPort": {
        "kind": "reporter",
        "method": "getDeviceOnPort",
        "args": ["PORT"]
      },
      "setDebugLevel": {
        "kind": "command",
        "method": "setDebugLevel",
        "args": ["LEVEL"]
      },
      "enableDebug": {
        "kind": "command",
        "method": "enableDebug",
        "args": ["ENABLED"]
      },
      "motorOn": {
        "kind": "command",
        "method": "motorOn",
        "args": ["PORT"]
      },
      "motorOff": {
        "kind": "command",
        "method": "motorOff",
        "args": ["PORT"]
      },
      "motorOnFor": {
        "kind": "command",
        "method": "motorOnFor",
        "args": ["PORT", "TIME"]
      },
      "motorOnForDegrees": {
        "kind": "command",
        "method": "motorOnForDegrees",
        "args": ["PORT", "DEGREES"]
      },
      "setMotorPower": {
        "kind": "command",
        "method": "setMotorPower",
        "args": ["PORT", "POWER"]
      },
      "setMotorDirection": {
        "kind": "command",
        "method": "setMotorDirection",
        "args": ["PORT", "DIRECTION"]
      },
      "setMotorStopAction": {
        "kind": "command",
        "method": "setMotorStopAction",
        "args": ["PORT", "ACTION"]
      },
      "setMotorAcceleration": {
        "kind": "command",
        "method": "setMotorAcceleration",
        "args": ["PORT", "TIME"]
      },
      "setMotorDeceleration": {
        "kind": "command",
        "method": "setMotorDeceleration",
        "args": ["PORT", "TIME"]
      },
      "resetMotorPosition": {
        "kind": "command",
        "method": "resetMotorPosition",
        "args": ["PORT", "POSITION"]
      },
      "getMotorPosition": {
        "kind": "reporter",
        "method": "getMotorPosition",
        "args": ["PORT"]
      },
      "whenColor": {
        "kind": "hat",
        "method": "whenColor",
        "args": ["PORT", "COLOR"]
      },
      "seeingColor": {
        "kind": "boolean",
        "method": "seeingColor",
        "args": ["PORT", "COLOR"]
      },
      "getColor": {
        "kind": "reporter",
        "method": "getColor",
        "args": ["PORT"]
      },
      "getDistance": {
        "kind": "reporter",
        "method": "getDistance",
        "args": ["PORT"]
      },
      "getReflection": {
        "kind": "reporter",
        "method": "getReflection",
        "args": ["PORT"]
      },
      "getForce": {
        "kind": "reporter",
        "method": "getForce",
        "args": ["PORT"]
      },
      "whenForceSensorPressed": {
        "kind": "hat",
        "method": "whenForceSensorPressed",
        "args": ["PORT"]
      },
      "isForceSensorPressed": {
        "kind": "boolean",
        "method": "isForceSensorPressed",
        "args": ["PORT"]
      },
      "whenTilted": {
        "kind": "hat",
        "method": "whenTilted",
        "args": ["DIRECTION"]
      },
      "isTilted": {
        "kind": "boolean",
        "method": "isTilted",
        "args": ["DIRECTION"]
      },
      "getTiltAngle": {
        "kind": "reporter",
        "method": "getTiltAngle",
        "args": ["DIRECTION"]
      },
      "setHubLED": {
        "kind": "command",
        "method": "setHubLED",
        "args": ["HUE"]
      },
      "setLEDBrightness": {
        "kind": "command",
        "method": "setLEDBrightness",
        "args": ["PORT", "BRIGHTNESS"]
      },
      "setMatrixPixel": {
        "kind": "command",
        "method": "setMatrixPixel",
        "args": ["PORT", "INDEX", "COLOR"]
      },
      "setMatrixAll": {
        "kind": "command",
        "method": "setMatrixAll",
        "args": ["PORT", "COLOR"]
      },
      "clearMatrix": {
        "kind": "command",
        "method": "clearMatrix",
        "args": ["PORT"]
      },
      "shutdown": {
        "kind": "command",
        "method": "shutdown",
        "args": []
      },
      "whenButtonPressed": {
        "kind": "hat",
        "method": "whenButtonPressed",
        "args": []
      },
      "isButtonPressed": {
        "kind": "boolean",
        "method": "isButtonPressed",
        "args": []
      },
      "getBatteryLevel": {
        "kind": "reporter",
        "method": "getBatteryLevel",
        "args": []
      },
      "getFirmwareVersion": {
        "kind": "reporter",
        "method": "getFirmwareVersion",
        "args": []
      },
      "getRSSI": {
        "kind": "reporter",
        "method": "getRSSI",
        "args": []
      },
      "whenBatteryLow": {
        "kind": "hat",
        "method": "whenBatteryLow",
        "args": []
      },
      "whenMotorOverloaded": {
        "kind": "hat",
        "method": "whenMotorOverloaded",
        "args": []
      }
    }
  },
  "wedo2unified": {
    "runtime": "wedo2unified",
    "ops": {
      "setConnectionType": {
        "kind": "command",
        "method": "setConnectionType",
        "args": ["TYPE"]
      },
      "connect": {
        "kind": "command",
        "method": "connect",
        "args": []
      },
      "disconnect": {
        "kind": "command",
        "method": "disconnect",
        "args": []
      },
      "isConnected": {
        "kind": "boolean",
        "method": "isConnected",
        "args": []
      },
      "setDebugLevel": {
        "kind": "command",
        "method": "setDebugLevel",
        "args": ["LEVEL"]
      },
      "motorOn": {
        "kind": "command",
        "method": "motorOn",
        "args": ["PORT"]
      },
      "motorOff": {
        "kind": "command",
        "method": "motorOff",
        "args": ["PORT"]
      },
      "setMotorPower": {
        "kind": "command",
        "method": "setMotorPower",
        "args": ["PORT", "POWER"]
      },
      "setMotorDirection": {
        "kind": "command",
        "method": "setMotorDirection",
        "args": ["PORT", "DIRECTION"]
      },
      "getDistance": {
        "kind": "reporter",
        "method": "getDistance",
        "args": []
      },
      "getTiltAngle": {
        "kind": "reporter",
        "method": "getTiltAngle",
        "args": ["DIRECTION"]
      },
      "whenTilted": {
        "kind": "hat",
        "method": "whenTilted",
        "args": ["DIRECTION"]
      },
      "isTilted": {
        "kind": "boolean",
        "method": "isTilted",
        "args": ["DIRECTION"]
      },
      "setLED": {
        "kind": "command",
        "method": "setLED",
        "args": ["HUE"]
      },
      "playNote": {
        "kind": "command",
        "method": "playNote",
        "args": ["NOTE", "DURATION"]
      },
      "whenButtonPressed": {
        "kind": "hat",
        "method": "whenButtonPressed",
        "args": []
      },
      "isButtonPressed": {
        "kind": "boolean",
        "method": "isButtonPressed",
        "args": []
      },
      "getBatteryLevel": {
        "kind": "reporter",
        "method": "getBatteryLevel",
        "args": []
      }
    }
  },
  "legospikeprimeBLE": {
    "runtime": "legospikeprimeBLE",
    "ops": {
      "isConnected": {
        "kind": "boolean",
        "method": "isConnected",
        "args": []
      },
      "getHubType": {
        "kind": "reporter",
        "method": "getHubType",
        "args": []
      },
      "enableStreamingMode": {
        "kind": "command",
        "method": "enableStreamingMode",
        "args": []
      },
      "disableStreamingMode": {
        "kind": "command",
        "method": "disableStreamingMode",
        "args": []
      },
      "transpileProject": {
        "kind": "command",
        "method": "transpileProject",
        "args": []
      },
      "showCode": {
        "kind": "command",
        "method": "showCode",
        "args": []
      },
      "downloadCode": {
        "kind": "command",
        "method": "downloadCode",
        "args": []
      },
      "setMovementMotors": {
        "kind": "command",
        "method": "setMovementMotors",
        "args": ["PORT_A", "PORT_B"]
      },
      "motorPairMove": {
        "kind": "command",
        "method": "motorPairMove",
        "args": ["STEERING", "SPEED"]
      },
      "motorPairMoveForTime": {
        "kind": "command",
        "method": "motorPairMoveForTime",
        "args": ["DIRECTION", "VALUE", "UNIT"]
      },
      "stopMovement": {
        "kind": "command",
        "method": "stopMovement",
        "args": []
      },
      "motorRun": {
        "kind": "command",
        "method": "motorRun",
        "args": ["PORT", "DIRECTION"]
      },
      "motorRunForTime": {
        "kind": "command",
        "method": "motorRunForTime",
        "args": ["PORT", "DIRECTION", "VALUE", "UNIT"]
      },
      "motorStop": {
        "kind": "command",
        "method": "motorStop",
        "args": ["PORT"]
      },
      "getMotorPosition": {
        "kind": "reporter",
        "method": "getMotorPosition",
        "args": ["PORT"]
      },
      "getMotorSpeed": {
        "kind": "reporter",
        "method": "getMotorSpeed",
        "args": ["PORT"]
      },
      "resetMotorPosition": {
        "kind": "command",
        "method": "resetMotorPosition",
        "args": ["PORT", "POSITION"]
      },
      "displayShowImage": {
        "kind": "command",
        "method": "displayShowImage",
        "args": ["IMAGE"]
      },
      "displayWrite": {
        "kind": "command",
        "method": "displayWrite",
        "args": ["TEXT"]
      },
      "displaySetPixel": {
        "kind": "command",
        "method": "displaySetPixel",
        "args": ["X", "Y", "BRIGHTNESS"]
      },
      "displayClear": {
        "kind": "command",
        "method": "displayClear",
        "args": []
      },
      "playBeep": {
        "kind": "command",
        "method": "playBeep",
        "args": ["FREQUENCY", "DURATION"]
      },
      "playNote": {
        "kind": "command",
        "method": "playNote",
        "args": ["NOTE", "SECS"]
      },
      "getColorSensorColor": {
        "kind": "reporter",
        "method": "getColorSensorColor",
        "args": ["PORT"]
      },
      "getDistanceSensor": {
        "kind": "reporter",
        "method": "getDistanceSensor",
        "args": ["PORT"]
      },
      "getForceSensor": {
        "kind": "reporter",
        "method": "getForceSensor",
        "args": ["PORT"]
      },
      "isForceSensorPressed": {
        "kind": "boolean",
        "method": "isForceSensorPressed",
        "args": ["PORT"]
      },
      "getYaw": {
        "kind": "reporter",
        "method": "getYaw",
        "args": []
      },
      "getPitch": {
        "kind": "reporter",
        "method": "getPitch",
        "args": []
      },
      "getRoll": {
        "kind": "reporter",
        "method": "getRoll",
        "args": []
      },
      "resetYaw": {
        "kind": "command",
        "method": "resetYaw",
        "args": []
      },
      "presetYaw": {
        "kind": "command",
        "method": "presetYaw",
        "args": ["ANGLE"]
      },
      "getBattery": {
        "kind": "reporter",
        "method": "getBattery",
        "args": []
      },
      "runPythonCode": {
        "kind": "command",
        "method": "runPythonCode",
        "args": ["CODE"]
      }
    }
  },
  "spikeprimeble": {
    "runtime": "spikeprimeble",
    "ops": {
      "connectHub": {
        "kind": "command",
        "method": "connectHub",
        "args": []
      },
      "disconnectHub": {
        "kind": "command",
        "method": "disconnectHub",
        "args": []
      },
      "isConnected": {
        "kind": "boolean",
        "method": "isConnected",
        "args": []
      },
      "startMotor": {
        "kind": "command",
        "method": "startMotor",
        "args": ["PORT", "SPEED"]
      },
      "stopMotor": {
        "kind": "command",
        "method": "stopMotor",
        "args": ["PORT", "ACTION"]
      },
      "getMotorPosition": {
        "kind": "reporter",
        "method": "getMotorPosition",
        "args": ["PORT"]
      },
      "setLightMatrixPixel": {
        "kind": "command",
        "method": "setLightMatrixPixel",
        "args": ["PORT", "X", "Y", "BRIGHTNESS"]
      },
      "getDistance": {
        "kind": "reporter",
        "method": "getDistance",
        "args": ["PORT"]
      },
      "isForceSensorPressed": {
        "kind": "boolean",
        "method": "isForceSensorPressed",
        "args": ["PORT"]
      },
      "getForceSensorValue": {
        "kind": "reporter",
        "method": "getForceSensorValue",
        "args": ["PORT"]
      },
      "getColor": {
        "kind": "reporter",
        "method": "getColor",
        "args": ["PORT"]
      },
      "getOrientation": {
        "kind": "reporter",
        "method": "getOrientation",
        "args": ["AXIS"]
      },
      "getAcceleration": {
        "kind": "reporter",
        "method": "getAcceleration",
        "args": ["AXIS"]
      },
      "getFaceUp": {
        "kind": "reporter",
        "method": "getFaceUp",
        "args": []
      },
      "getBatteryLevel": {
        "kind": "reporter",
        "method": "getBatteryLevel",
        "args": []
      }
    }
  },
  "spikeprimeBTC": {
    "runtime": "spikeprimeBTC",
    "ops": {
      "setMovementMotors": {
        "kind": "command",
        "method": "setMovementMotors",
        "args": ["PORT_A", "PORT_B"]
      },
      "moveForward": {
        "kind": "command",
        "method": "moveForward",
        "args": ["DIRECTION", "VALUE", "UNIT"]
      },
      "steer": {
        "kind": "command",
        "method": "steer",
        "args": ["STEERING"]
      },
      "startTank": {
        "kind": "command",
        "method": "startTank",
        "args": ["LEFT_SPEED", "RIGHT_SPEED"]
      },
      "setMovementSpeed": {
        "kind": "command",
        "method": "setMovementSpeed",
        "args": ["SPEED"]
      },
      "stopMovement": {
        "kind": "command",
        "method": "stopMovement",
        "args": []
      },
      "motorRunFor": {
        "kind": "command",
        "method": "motorRunFor",
        "args": ["PORT", "DIRECTION", "VALUE", "UNIT"]
      },
      "motorRunToPosition": {
        "kind": "command",
        "method": "motorRunToPosition",
        "args": ["PORT", "POSITION"]
      },
      "motorStart": {
        "kind": "command",
        "method": "motorStart",
        "args": ["PORT", "DIRECTION"]
      },
      "motorStop": {
        "kind": "command",
        "method": "motorStop",
        "args": ["PORT"]
      },
      "motorSetSpeed": {
        "kind": "command",
        "method": "motorSetSpeed",
        "args": ["PORT", "SPEED"]
      },
      "motorSetStopAction": {
        "kind": "command",
        "method": "motorSetStopAction",
        "args": ["PORT", "ACTION"]
      },
      "getPosition": {
        "kind": "reporter",
        "method": "getPosition",
        "args": ["PORT"]
      },
      "getRelativePosition": {
        "kind": "reporter",
        "method": "getRelativePosition",
        "args": ["PORT"]
      },
      "getAbsolutePosition": {
        "kind": "reporter",
        "method": "getAbsolutePosition",
        "args": ["PORT"]
      },
      "getSpeed": {
        "kind": "reporter",
        "method": "getSpeed",
        "args": ["PORT"]
      },
      "resetMotorPosition": {
        "kind": "command",
        "method": "resetMotorPosition",
        "args": ["PORT", "POSITION"]
      },
      "displayText": {
        "kind": "command",
        "method": "displayText",
        "args": ["TEXT"]
      },
      "displayImage": {
        "kind": "command",
        "method": "displayImage",
        "args": ["MATRIX"]
      },
      "displayPattern": {
        "kind": "command",
        "method": "displayPattern",
        "args": ["PATTERN"]
      },
      "displayClear": {
        "kind": "command",
        "method": "displayClear",
        "args": []
      },
      "setPixel": {
        "kind": "command",
        "method": "setPixel",
        "args": ["X", "Y", "BRIGHTNESS"]
      },
      "rotateDisplay": {
        "kind": "command",
        "method": "rotateDisplay",
        "args": ["ANGLE"]
      },
      "setCenterButtonColor": {
        "kind": "command",
        "method": "setCenterButtonColor",
        "args": ["COLOR"]
      },
      "getAngle": {
        "kind": "reporter",
        "method": "getAngle",
        "args": ["AXIS"]
      },
      "getGyroRate": {
        "kind": "reporter",
        "method": "getGyroRate",
        "args": ["AXIS"]
      },
      "getFilteredGyroRate": {
        "kind": "reporter",
        "method": "getFilteredGyroRate",
        "args": ["AXIS"]
      },
      "getAcceleration": {
        "kind": "reporter",
        "method": "getAcceleration",
        "args": ["AXIS"]
      },
      "getFilteredAcceleration": {
        "kind": "reporter",
        "method": "getFilteredAcceleration",
        "args": ["AXIS"]
      },
      "resetYaw": {
        "kind": "command",
        "method": "resetYaw",
        "args": []
      },
      "presetYaw": {
        "kind": "command",
        "method": "presetYaw",
        "args": ["ANGLE"]
      },
      "setMatrix3x3ColorGrid": {
        "kind": "command",
        "method": "setMatrix3x3ColorGrid",
        "args": ["PORT", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9"]
      },
      "setMatrix3x3Custom": {
        "kind": "command",
        "method": "setMatrix3x3Custom",
        "args": ["PORT", "PATTERN"]
      },
      "setMatrix3x3SolidColor": {
        "kind": "command",
        "method": "setMatrix3x3SolidColor",
        "args": ["PORT", "COLOR", "BRIGHTNESS"]
      },
      "clearMatrix3x3": {
        "kind": "command",
        "method": "clearMatrix3x3",
        "args": ["PORT"]
      },
      "whenGesture": {
        "kind": "hat",
        "method": "whenGesture",
        "args": ["GESTURE"]
      },
      "isGesture": {
        "kind": "boolean",
        "method": "isGesture",
        "args": ["GESTURE"]
      },
      "getOrientation": {
        "kind": "reporter",
        "method": "getOrientation",
        "args": []
      },
      "playHubSound": {
        "kind": "command",
        "method": "playHubSound",
        "args": ["SOUND"]
      },
      "playBeep": {
        "kind": "command",
        "method": "playBeep",
        "args": ["FREQUENCY", "DURATION"]
      },
      "playNote": {
        "kind": "command",
        "method": "playNote",
        "args": ["NOTE", "SECS"]
      },
      "playWaveBeep": {
        "kind": "command",
        "method": "playWaveBeep",
        "args": ["WAVEFORM", "FREQUENCY", "DURATION"]
      },
      "setVolume": {
        "kind": "command",
        "method": "setVolume",
        "args": ["VOLUME"]
      },
      "stopSound": {
        "kind": "command",
        "method": "stopSound",
        "args": []
      },
      "getBatteryLevel": {
        "kind": "reporter",
        "method": "getBatteryLevel",
        "args": []
      },
      "getBatteryTemperature": {
        "kind": "reporter",
        "method": "getBatteryTemperature",
        "args": []
      },
      "getHubTemperature": {
        "kind": "reporter",
        "method": "getHubTemperature",
        "args": []
      },
      "getHubCurrent": {
        "kind": "reporter",
        "method": "getHubCurrent",
        "args": []
      },
      "getHubVoltage": {
        "kind": "reporter",
        "method": "getHubVoltage",
        "args": []
      },
      "getTimer": {
        "kind": "reporter",
        "method": "getTimer",
        "args": []
      },
      "resetTimer": {
        "kind": "command",
        "method": "resetTimer",
        "args": []
      },
      "getDistance": {
        "kind": "reporter",
        "method": "getDistance",
        "args": ["PORT"]
      },
      "setDistanceLights": {
        "kind": "command",
        "method": "setDistanceLights",
        "args": ["PORT", "TL", "TR", "BL", "BR"]
      },
      "getColor": {
        "kind": "reporter",
        "method": "getColor",
        "args": ["PORT"]
      },
      "getReflection": {
        "kind": "reporter",
        "method": "getReflection",
        "args": ["PORT"]
      },
      "getAmbientLight": {
        "kind": "reporter",
        "method": "getAmbientLight",
        "args": ["PORT"]
      },
      "getForce": {
        "kind": "reporter",
        "method": "getForce",
        "args": ["PORT"]
      },
      "isForceSensorPressed": {
        "kind": "boolean",
        "method": "isForceSensorPressed",
        "args": ["PORT"]
      },
      "whenColor": {
        "kind": "hat",
        "method": "whenColor",
        "args": ["PORT", "COLOR"]
      },
      "isColor": {
        "kind": "boolean",
        "method": "isColor",
        "args": ["PORT", "COLOR"]
      },
      "whenForceSensor": {
        "kind": "hat",
        "method": "whenForceSensor",
        "args": ["PORT", "STATE"]
      },
      "isButtonPressed": {
        "kind": "boolean",
        "method": "isButtonPressed",
        "args": ["BUTTON"]
      },
      "whenButtonPressed": {
        "kind": "hat",
        "method": "whenButtonPressed",
        "args": ["BUTTON"]
      },
      "writeLogFile": {
        "kind": "command",
        "method": "writeLogFile",
        "args": ["TEXT", "FILENAME"]
      },
      "readLogFile": {
        "kind": "reporter",
        "method": "readLogFile",
        "args": ["FILENAME"]
      },
      "deleteLogFile": {
        "kind": "command",
        "method": "deleteLogFile",
        "args": ["FILENAME"]
      },
      "listFiles": {
        "kind": "reporter",
        "method": "listFiles",
        "args": []
      },
      "runReplCommand": {
        "kind": "command",
        "method": "runReplCommand",
        "args": ["CODE"]
      },
      "getReplOutput": {
        "kind": "reporter",
        "method": "getReplOutput",
        "args": []
      },
      "clearReplOutput": {
        "kind": "command",
        "method": "clearReplOutput",
        "args": []
      },
      "getReplHistory": {
        "kind": "reporter",
        "method": "getReplHistory",
        "args": ["INDEX"]
      },
      "runPythonCommand": {
        "kind": "command",
        "method": "runPythonCommand",
        "args": ["CODE"]
      },
      "runHubCommand": {
        "kind": "command",
        "method": "runHubCommand",
        "args": ["CODE"]
      },
      "exitScript": {
        "kind": "command",
        "method": "exitScript",
        "args": []
      }
    }
  },
  "spikeprimeBridge": {
    "runtime": "spikeprimeBridge",
    "ops": {
      "connectHub": {
        "kind": "command",
        "method": "connectHub",
        "args": ["URL"]
      },
      "disconnectHub": {
        "kind": "command",
        "method": "disconnectHub",
        "args": []
      },
      "isConnected": {
        "kind": "boolean",
        "method": "isConnected",
        "args": []
      },
      "motorRunFor": {
        "kind": "command",
        "method": "motorRunFor",
        "args": ["PORT", "DIRECTION", "VALUE", "UNIT"]
      },
      "motorStart": {
        "kind": "command",
        "method": "motorStart",
        "args": ["PORT", "DIRECTION"]
      },
      "motorStop": {
        "kind": "command",
        "method": "motorStop",
        "args": ["PORT"]
      },
      "motorSetSpeed": {
        "kind": "command",
        "method": "motorSetSpeed",
        "args": ["PORT", "SPEED"]
      },
      "getPosition": {
        "kind": "reporter",
        "method": "getPosition",
        "args": ["PORT"]
      },
      "displayText": {
        "kind": "command",
        "method": "displayText",
        "args": ["TEXT"]
      },
      "displayImage": {
        "kind": "command",
        "method": "displayImage",
        "args": ["MATRIX"]
      },
      "displayPattern": {
        "kind": "command",
        "method": "displayPattern",
        "args": ["PATTERN"]
      },
      "displayClear": {
        "kind": "command",
        "method": "displayClear",
        "args": []
      },
      "setPixel": {
        "kind": "command",
        "method": "setPixel",
        "args": ["X", "Y", "BRIGHTNESS"]
      },
      "getAngle": {
        "kind": "reporter",
        "method": "getAngle",
        "args": ["AXIS"]
      },
      "getAcceleration": {
        "kind": "reporter",
        "method": "getAcceleration",
        "args": ["AXIS"]
      },
      "resetYaw": {
        "kind": "command",
        "method": "resetYaw",
        "args": []
      },
      "getDistance": {
        "kind": "reporter",
        "method": "getDistance",
        "args": ["PORT"]
      },
      "getColor": {
        "kind": "reporter",
        "method": "getColor",
        "args": ["PORT"]
      },
      "getForce": {
        "kind": "reporter",
        "method": "getForce",
        "args": ["PORT"]
      },
      "isForceSensorPressed": {
        "kind": "boolean",
        "method": "isForceSensorPressed",
        "args": ["PORT"]
      },
      "whenGesture": {
        "kind": "hat",
        "method": "whenGesture",
        "args": ["GESTURE"]
      },
      "playBeep": {
        "kind": "command",
        "method": "playBeep",
        "args": ["FREQUENCY", "DURATION"]
      },
      "stopSound": {
        "kind": "command",
        "method": "stopSound",
        "args": []
      },
      "getBatteryLevel": {
        "kind": "reporter",
        "method": "getBatteryLevel",
        "args": []
      },
      "getTimer": {
        "kind": "reporter",
        "method": "getTimer",
        "args": []
      },
      "resetTimer": {
        "kind": "command",
        "method": "resetTimer",
        "args": []
      },
      "runPythonCommand": {
        "kind": "command",
        "method": "runPythonCommand",
        "args": ["CODE"]
      },
      "getReplOutput": {
        "kind": "reporter",
        "method": "getReplOutput",
        "args": []
      },
      "clearReplOutput": {
        "kind": "command",
        "method": "clearReplOutput",
        "args": []
      }
    }
  },
  "ev3comprehensive": {
    "runtime": "ev3comprehensive",
    "ops": {
      "setMode": {
        "kind": "command",
        "method": "setMode",
        "args": ["MODE"]
      },
      "connect": {
        "kind": "command",
        "method": "connect",
        "args": ["PARAM"]
      },
      "disconnect": {
        "kind": "command",
        "method": "disconnect",
        "args": []
      },
      "isConnected": {
        "kind": "boolean",
        "method": "isConnected",
        "args": []
      },
      "setBridgeHost": {
        "kind": "command",
        "method": "setBridgeHost",
        "args": ["URL"]
      },
      "setBridgePort": {
        "kind": "command",
        "method": "setBridgePort",
        "args": ["PORT"]
      },
      "enableBridgeSSL": {
        "kind": "command",
        "method": "enableBridgeSSL",
        "args": []
      },
      "disableBridgeSSL": {
        "kind": "command",
        "method": "disableBridgeSSL",
        "args": []
      },
      "setBridgeAuthToken": {
        "kind": "command",
        "method": "setBridgeAuthToken",
        "args": ["TOKEN"]
      },
      "clearBridgeAuthToken": {
        "kind": "command",
        "method": "clearBridgeAuthToken",
        "args": []
      },
      "testBridgeConnection": {
        "kind": "reporter",
        "method": "testBridgeConnection",
        "args": []
      },
      "setEV3IP": {
        "kind": "command",
        "method": "setEV3IP",
        "args": ["IP"]
      },
      "setEV3Port": {
        "kind": "command",
        "method": "setEV3Port",
        "args": ["PORT"]
      },
      "testConnection": {
        "kind": "reporter",
        "method": "testConnection",
        "args": []
      },
      "setLMSApiUrl": {
        "kind": "command",
        "method": "setLMSApiUrl",
        "args": ["URL", "PORT"]
      },
      "testCompiler": {
        "kind": "reporter",
        "method": "testCompiler",
        "args": []
      },
      "transpileToLMS": {
        "kind": "command",
        "method": "transpileToLMS",
        "args": []
      },
      "showLMSCode": {
        "kind": "command",
        "method": "showLMSCode",
        "args": []
      },
      "downloadLMSCode": {
        "kind": "command",
        "method": "downloadLMSCode",
        "args": []
      },
      "compileToRBF": {
        "kind": "command",
        "method": "compileToRBF",
        "args": []
      },
      "showRBFCode": {
        "kind": "command",
        "method": "showRBFCode",
        "args": []
      },
      "downloadRBF": {
        "kind": "command",
        "method": "downloadRBF",
        "args": []
      },
      "uploadAndRun": {
        "kind": "command",
        "method": "uploadAndRun",
        "args": []
      },
      "showDebugLog": {
        "kind": "command",
        "method": "showDebugLog",
        "args": []
      },
      "motorRun": {
        "kind": "command",
        "method": "motorRun",
        "args": ["PORT", "POWER"]
      },
      "motorRunTime": {
        "kind": "command",
        "method": "motorRunTime",
        "args": ["PORT", "TIME", "POWER"]
      },
      "motorRunRotations": {
        "kind": "command",
        "method": "motorRunRotations",
        "args": ["PORT", "ROTATIONS", "POWER"]
      },
      "motorRunDegrees": {
        "kind": "command",
        "method": "motorRunDegrees",
        "args": ["PORT", "DEGREES", "POWER"]
      },
      "motorStop": {
        "kind": "command",
        "method": "motorStop",
        "args": ["PORT", "BRAKE"]
      },
      "motorReset": {
        "kind": "command",
        "method": "motorReset",
        "args": ["PORT"]
      },
      "motorPolarity": {
        "kind": "command",
        "method": "motorPolarity",
        "args": ["PORT", "POLARITY"]
      },
      "tankDrive": {
        "kind": "command",
        "method": "tankDrive",
        "args": ["LEFT", "RIGHT", "VALUE", "UNIT"]
      },
      "steerDrive": {
        "kind": "command",
        "method": "steerDrive",
        "args": ["STEERING", "SPEED", "VALUE", "UNIT"]
      },
      "motorPosition": {
        "kind": "reporter",
        "method": "motorPosition",
        "args": ["PORT"]
      },
      "motorSpeed": {
        "kind": "reporter",
        "method": "motorSpeed",
        "args": ["PORT"]
      },
      "touchSensor": {
        "kind": "boolean",
        "method": "touchSensor",
        "args": ["PORT"]
      },
      "touchSensorBumped": {
        "kind": "boolean",
        "method": "touchSensorBumped",
        "args": ["PORT"]
      },
      "colorSensor": {
        "kind": "reporter",
        "method": "colorSensor",
        "args": ["PORT", "MODE"]
      },
      "colorSensorRGB": {
        "kind": "reporter",
        "method": "colorSensorRGB",
        "args": ["PORT", "COMPONENT"]
      },
      "ultrasonicSensor": {
        "kind": "reporter",
        "method": "ultrasonicSensor",
        "args": ["PORT", "UNIT"]
      },
      "ultrasonicListen": {
        "kind": "boolean",
        "method": "ultrasonicListen",
        "args": ["PORT"]
      },
      "gyroSensor": {
        "kind": "reporter",
        "method": "gyroSensor",
        "args": ["PORT", "MODE"]
      },
      "gyroReset": {
        "kind": "command",
        "method": "gyroReset",
        "args": ["PORT"]
      },
      "irProximity": {
        "kind": "reporter",
        "method": "irProximity",
        "args": ["PORT"]
      },
      "irBeaconHeading": {
        "kind": "reporter",
        "method": "irBeaconHeading",
        "args": ["PORT", "CHANNEL"]
      },
      "irBeaconDistance": {
        "kind": "reporter",
        "method": "irBeaconDistance",
        "args": ["PORT", "CHANNEL"]
      },
      "irRemoteButton": {
        "kind": "boolean",
        "method": "irRemoteButton",
        "args": ["PORT", "CHANNEL", "BUTTON"]
      },
      "screenClear": {
        "kind": "command",
        "method": "screenClear",
        "args": []
      },
      "screenText": {
        "kind": "command",
        "method": "screenText",
        "args": ["TEXT", "X", "Y"]
      },
      "screenTextLarge": {
        "kind": "command",
        "method": "screenTextLarge",
        "args": ["TEXT", "X", "Y"]
      },
      "drawPixel": {
        "kind": "command",
        "method": "drawPixel",
        "args": ["X", "Y"]
      },
      "drawLine": {
        "kind": "command",
        "method": "drawLine",
        "args": ["X1", "Y1", "X2", "Y2"]
      },
      "drawCircle": {
        "kind": "command",
        "method": "drawCircle",
        "args": ["X", "Y", "R", "FILL"]
      },
      "drawRectangle": {
        "kind": "command",
        "method": "drawRectangle",
        "args": ["X", "Y", "W", "H", "FILL"]
      },
      "screenUpdate": {
        "kind": "command",
        "method": "screenUpdate",
        "args": []
      },
      "screenInvert": {
        "kind": "command",
        "method": "screenInvert",
        "args": []
      },
      "playTone": {
        "kind": "command",
        "method": "playTone",
        "args": ["FREQ", "DURATION"]
      },
      "playNote": {
        "kind": "command",
        "method": "playNote",
        "args": ["NOTE", "DURATION"]
      },
      "beep": {
        "kind": "command",
        "method": "beep",
        "args": []
      },
      "setVolume": {
        "kind": "command",
        "method": "setVolume",
        "args": ["VOLUME"]
      },
      "getVolume": {
        "kind": "reporter",
        "method": "getVolume",
        "args": []
      },
      "stopSound": {
        "kind": "command",
        "method": "stopSound",
        "args": []
      },
      "setLED": {
        "kind": "command",
        "method": "setLED",
        "args": ["COLOR"]
      },
      "ledAllOff": {
        "kind": "command",
        "method": "ledAllOff",
        "args": []
      },
      "buttonPressed": {
        "kind": "boolean",
        "method": "buttonPressed",
        "args": ["BUTTON"]
      },
      "waitForButton": {
        "kind": "command",
        "method": "waitForButton",
        "args": ["BUTTON"]
      },
      "batteryLevel": {
        "kind": "reporter",
        "method": "batteryLevel",
        "args": []
      },
      "batteryCurrent": {
        "kind": "reporter",
        "method": "batteryCurrent",
        "args": []
      },
      "batteryVoltage": {
        "kind": "reporter",
        "method": "batteryVoltage",
        "args": []
      },
      "freeMemory": {
        "kind": "reporter",
        "method": "freeMemory",
        "args": []
      },
      "resetTimer": {
        "kind": "command",
        "method": "resetTimer",
        "args": ["TIMER"]
      },
      "timerValue": {
        "kind": "reporter",
        "method": "timerValue",
        "args": ["TIMER"]
      },
      "waitSeconds": {
        "kind": "command",
        "method": "waitSeconds",
        "args": ["TIME"]
      },
      "waitMillis": {
        "kind": "command",
        "method": "waitMillis",
        "args": ["TIME"]
      }
    }
  },
  "legoev3direct": {
    "runtime": "legoev3direct",
    "ops": {
      "connect": {
        "kind": "command",
        "method": "connect",
        "args": []
      },
      "disconnect": {
        "kind": "command",
        "method": "disconnect",
        "args": []
      },
      "isConnected": {
        "kind": "boolean",
        "method": "isConnected",
        "args": []
      },
      "motorOn": {
        "kind": "command",
        "method": "motorOn",
        "args": ["PORTS", "POWER"]
      },
      "motorRunDegrees": {
        "kind": "command",
        "method": "motorRunDegrees",
        "args": ["PORTS", "DEGREES", "POWER", "BRAKE"]
      },
      "motorRunSeconds": {
        "kind": "command",
        "method": "motorRunSeconds",
        "args": ["PORTS", "SECONDS", "POWER", "BRAKE"]
      },
      "motorStop": {
        "kind": "command",
        "method": "motorStop",
        "args": ["PORTS", "BRAKE"]
      },
      "setMotorPolarity": {
        "kind": "command",
        "method": "setMotorPolarity",
        "args": ["PORTS", "POLARITY"]
      },
      "getMotorPosition": {
        "kind": "reporter",
        "method": "getMotorPosition",
        "args": ["PORT"]
      },
      "getMotorSpeed": {
        "kind": "reporter",
        "method": "getMotorSpeed",
        "args": ["PORT"]
      },
      "resetMotorPosition": {
        "kind": "command",
        "method": "resetMotorPosition",
        "args": ["PORTS"]
      },
      "isTouchPressed": {
        "kind": "boolean",
        "method": "isTouchPressed",
        "args": ["PORT"]
      },
      "getColor": {
        "kind": "reporter",
        "method": "getColor",
        "args": ["PORT"]
      },
      "getReflectedLight": {
        "kind": "reporter",
        "method": "getReflectedLight",
        "args": ["PORT"]
      },
      "getAmbientLight": {
        "kind": "reporter",
        "method": "getAmbientLight",
        "args": ["PORT"]
      },
      "getRGBRaw": {
        "kind": "reporter",
        "method": "getRGBRaw",
        "args": ["PORT", "COMPONENT"]
      },
      "getUltrasonicDistance": {
        "kind": "reporter",
        "method": "getUltrasonicDistance",
        "args": ["PORT"]
      },
      "getGyroAngle": {
        "kind": "reporter",
        "method": "getGyroAngle",
        "args": ["PORT"]
      },
      "getGyroRate": {
        "kind": "reporter",
        "method": "getGyroRate",
        "args": ["PORT"]
      },
      "resetGyro": {
        "kind": "command",
        "method": "resetGyro",
        "args": ["PORT"]
      },
      "getInfraredProximity": {
        "kind": "reporter",
        "method": "getInfraredProximity",
        "args": ["PORT"]
      },
      "getNXTLight": {
        "kind": "reporter",
        "method": "getNXTLight",
        "args": ["PORT"]
      },
      "getNXTSound": {
        "kind": "reporter",
        "method": "getNXTSound",
        "args": ["PORT"]
      },
      "isButtonPressed": {
        "kind": "boolean",
        "method": "isButtonPressed",
        "args": ["BUTTON"]
      },
      "setLED": {
        "kind": "command",
        "method": "setLED",
        "args": ["PATTERN"]
      },
      "playTone": {
        "kind": "command",
        "method": "playTone",
        "args": ["FREQ", "MS", "VOL"]
      },
      "playNote": {
        "kind": "command",
        "method": "playNote",
        "args": ["NOTE", "BEATS"]
      },
      "stopSound": {
        "kind": "command",
        "method": "stopSound",
        "args": []
      },
      "setVolume": {
        "kind": "command",
        "method": "setVolume",
        "args": ["VOL"]
      },
      "getVolume": {
        "kind": "reporter",
        "method": "getVolume",
        "args": []
      },
      "clearScreen": {
        "kind": "command",
        "method": "clearScreen",
        "args": []
      },
      "drawText": {
        "kind": "command",
        "method": "drawText",
        "args": ["TEXT", "X", "Y"]
      },
      "selectFont": {
        "kind": "command",
        "method": "selectFont",
        "args": ["SIZE"]
      },
      "drawPixel": {
        "kind": "command",
        "method": "drawPixel",
        "args": ["X", "Y"]
      },
      "drawLine": {
        "kind": "command",
        "method": "drawLine",
        "args": ["X1", "Y1", "X2", "Y2"]
      },
      "drawRect": {
        "kind": "command",
        "method": "drawRect",
        "args": ["FILL", "X", "Y", "W", "H"]
      },
      "drawCircle": {
        "kind": "command",
        "method": "drawCircle",
        "args": ["FILL", "X", "Y", "R"]
      },
      "invertRect": {
        "kind": "command",
        "method": "invertRect",
        "args": ["X", "Y", "W", "H"]
      },
      "wait": {
        "kind": "command",
        "method": "wait",
        "args": ["MS"]
      },
      "readTimer": {
        "kind": "reporter",
        "method": "readTimer",
        "args": []
      },
      "getBattery": {
        "kind": "reporter",
        "method": "getBattery",
        "args": []
      }
    }
  },
  "legonxt": {
    "runtime": "legonxt",
    "ops": {
      "setConnectionMode": {
        "kind": "command",
        "method": "setConnectionMode",
        "args": ["MODE"]
      },
      "getConnectionMode": {
        "kind": "reporter",
        "method": "getConnectionMode",
        "args": []
      },
      "connect": {
        "kind": "command",
        "method": "connect",
        "args": ["PARAM"]
      },
      "disconnect": {
        "kind": "command",
        "method": "disconnect",
        "args": []
      },
      "isConnected": {
        "kind": "boolean",
        "method": "isConnected",
        "args": []
      },
      "motorOn": {
        "kind": "command",
        "method": "motorOn",
        "args": ["PORT", "POWER"]
      },
      "motorRunDegrees": {
        "kind": "command",
        "method": "motorRunDegrees",
        "args": ["PORT", "POWER", "DEGREES"]
      },
      "motorRunRotations": {
        "kind": "command",
        "method": "motorRunRotations",
        "args": ["PORT", "POWER", "ROTATIONS"]
      },
      "motorStop": {
        "kind": "command",
        "method": "motorStop",
        "args": ["PORT", "ACTION"]
      },
      "getMotorPosition": {
        "kind": "reporter",
        "method": "getMotorPosition",
        "args": ["PORT"]
      },
      "resetMotorPosition": {
        "kind": "command",
        "method": "resetMotorPosition",
        "args": ["PORT"]
      },
      "getMotorPower": {
        "kind": "reporter",
        "method": "getMotorPower",
        "args": ["PORT"]
      },
      "getMotorMode": {
        "kind": "reporter",
        "method": "getMotorMode",
        "args": ["PORT"]
      },
      "getMotorRegulationMode": {
        "kind": "reporter",
        "method": "getMotorRegulationMode",
        "args": ["PORT"]
      },
      "getMotorTurnRatio": {
        "kind": "reporter",
        "method": "getMotorTurnRatio",
        "args": ["PORT"]
      },
      "getMotorRunState": {
        "kind": "reporter",
        "method": "getMotorRunState",
        "args": ["PORT"]
      },
      "getMotorTachoLimit": {
        "kind": "reporter",
        "method": "getMotorTachoLimit",
        "args": ["PORT"]
      },
      "getMotorTachoCount": {
        "kind": "reporter",
        "method": "getMotorTachoCount",
        "args": ["PORT"]
      },
      "getMotorBlockTachoCount": {
        "kind": "reporter",
        "method": "getMotorBlockTachoCount",
        "args": ["PORT"]
      },
      "getMotorRotationCount": {
        "kind": "reporter",
        "method": "getMotorRotationCount",
        "args": ["PORT"]
      },
      "setupTouchSensorNXT": {
        "kind": "command",
        "method": "setupTouchSensorNXT",
        "args": ["PORT"]
      },
      "isTouchPressed": {
        "kind": "boolean",
        "method": "isTouchPressed",
        "args": ["PORT"]
      },
      "setupLightSensor": {
        "kind": "command",
        "method": "setupLightSensor",
        "args": ["PORT", "STATE"]
      },
      "getLightLevel": {
        "kind": "reporter",
        "method": "getLightLevel",
        "args": ["PORT"]
      },
      "setupColorSensor": {
        "kind": "command",
        "method": "setupColorSensor",
        "args": ["PORT", "MODE"]
      },
      "getColor": {
        "kind": "reporter",
        "method": "getColor",
        "args": ["PORT"]
      },
      "setupSoundSensor": {
        "kind": "command",
        "method": "setupSoundSensor",
        "args": ["PORT", "MODE"]
      },
      "getSoundLevel": {
        "kind": "reporter",
        "method": "getSoundLevel",
        "args": ["PORT"]
      },
      "setupUltrasonicSensor": {
        "kind": "command",
        "method": "setupUltrasonicSensor",
        "args": ["PORT"]
      },
      "getDistance": {
        "kind": "reporter",
        "method": "getDistance",
        "args": ["PORT"]
      },
      "getSensorPort": {
        "kind": "reporter",
        "method": "getSensorPort",
        "args": ["PORT"]
      },
      "getSensorValid": {
        "kind": "boolean",
        "method": "getSensorValid",
        "args": ["PORT"]
      },
      "getSensorCalibrated": {
        "kind": "boolean",
        "method": "getSensorCalibrated",
        "args": ["PORT"]
      },
      "getSensorType": {
        "kind": "reporter",
        "method": "getSensorType",
        "args": ["PORT"]
      },
      "getSensorMode": {
        "kind": "reporter",
        "method": "getSensorMode",
        "args": ["PORT"]
      },
      "getSensorRawValue": {
        "kind": "reporter",
        "method": "getSensorRawValue",
        "args": ["PORT"]
      },
      "getSensorNormalizedValue": {
        "kind": "reporter",
        "method": "getSensorNormalizedValue",
        "args": ["PORT"]
      },
      "getSensorScaledValue": {
        "kind": "reporter",
        "method": "getSensorScaledValue",
        "args": ["PORT"]
      },
      "getSensorCalibratedValue": {
        "kind": "reporter",
        "method": "getSensorCalibratedValue",
        "args": ["PORT"]
      },
      "playTone": {
        "kind": "command",
        "method": "playTone",
        "args": ["FREQ", "MS"]
      },
      "playNote": {
        "kind": "command",
        "method": "playNote",
        "args": ["NOTE", "BEATS"]
      },
      "captureScreen": {
        "kind": "command",
        "method": "captureScreen",
        "args": []
      },
      "clearScreen": {
        "kind": "command",
        "method": "clearScreen",
        "args": []
      },
      "updateDisplay": {
        "kind": "command",
        "method": "updateDisplay",
        "args": []
      },
      "drawText": {
        "kind": "command",
        "method": "drawText",
        "args": ["TEXT", "X", "Y"]
      },
      "drawPixel": {
        "kind": "command",
        "method": "drawPixel",
        "args": ["X", "Y", "STATE"]
      },
      "drawLine": {
        "kind": "command",
        "method": "drawLine",
        "args": ["X1", "Y1", "X2", "Y2"]
      },
      "drawRect": {
        "kind": "command",
        "method": "drawRect",
        "args": ["X", "Y", "W", "H", "FILL"]
      },
      "drawCircle": {
        "kind": "command",
        "method": "drawCircle",
        "args": ["X", "Y", "R", "FILL"]
      },
      "drawPattern": {
        "kind": "command",
        "method": "drawPattern",
        "args": ["PATTERN"]
      },
      "getBattery": {
        "kind": "reporter",
        "method": "getBattery",
        "args": []
      },
      "getRawSensorValue": {
        "kind": "reporter",
        "method": "getRawSensorValue",
        "args": ["PORT"]
      },
      "spriteGetX": {
        "kind": "reporter",
        "method": "spriteGetX",
        "args": ["SPRITE"]
      },
      "spriteGetY": {
        "kind": "reporter",
        "method": "spriteGetY",
        "args": ["SPRITE"]
      },
      "spriteGetSize": {
        "kind": "reporter",
        "method": "spriteGetSize",
        "args": ["SPRITE"]
      },
      "spriteGetVisible": {
        "kind": "boolean",
        "method": "spriteGetVisible",
        "args": ["SPRITE"]
      },
      "spriteSetPosition": {
        "kind": "command",
        "method": "spriteSetPosition",
        "args": ["SPRITE", "X", "Y"]
      },
      "spriteSetSize": {
        "kind": "command",
        "method": "spriteSetSize",
        "args": ["SPRITE", "SIZE"]
      },
      "spriteSetVisible": {
        "kind": "command",
        "method": "spriteSetVisible",
        "args": ["SPRITE", "VISIBLE"]
      },
      "transpileProject": {
        "kind": "command",
        "method": "transpileProject",
        "args": []
      },
      "showNXCCode": {
        "kind": "command",
        "method": "showNXCCode",
        "args": []
      },
      "downloadNXC": {
        "kind": "command",
        "method": "downloadNXC",
        "args": []
      },
      "compileToRXE": {
        "kind": "command",
        "method": "compileToRXE",
        "args": []
      },
      "setRxeFilename": {
        "kind": "command",
        "method": "setRxeFilename",
        "args": ["NAME"]
      },
      "uploadToNXT": {
        "kind": "command",
        "method": "uploadToNXT",
        "args": ["FILENAME"]
      },
      "fullWorkflow": {
        "kind": "command",
        "method": "fullWorkflow",
        "args": ["FILENAME"]
      },
      "getDeviceName": {
        "kind": "reporter",
        "method": "getDeviceName",
        "args": []
      },
      "getBluetoothAddress": {
        "kind": "reporter",
        "method": "getBluetoothAddress",
        "args": []
      },
      "getFreeFlash": {
        "kind": "reporter",
        "method": "getFreeFlash",
        "args": []
      },
      "getSignalStrength": {
        "kind": "reporter",
        "method": "getSignalStrength",
        "args": []
      },
      "sendMessage": {
        "kind": "command",
        "method": "sendMessage",
        "args": ["MSG", "BOX"]
      },
      "receiveMessage": {
        "kind": "reporter",
        "method": "receiveMessage",
        "args": ["BOX", "REMOVE"]
      },
      "getLowSpeedStatus": {
        "kind": "reporter",
        "method": "getLowSpeedStatus",
        "args": ["PORT"]
      },
      "startProgram": {
        "kind": "command",
        "method": "startProgram",
        "args": ["FILENAME"]
      },
      "stopProgram": {
        "kind": "command",
        "method": "stopProgram",
        "args": []
      },
      "keepAlive": {
        "kind": "command",
        "method": "keepAlive",
        "args": []
      },
      "getCurrentProgram": {
        "kind": "reporter",
        "method": "getCurrentProgram",
        "args": []
      }
    }
  },
  "spikeprime": {
    "runtime": "spikeprime",
    "ops": {
      "transpileProject": {
        "kind": "command",
        "method": "transpileProject",
        "args": []
      },
      "showCode": {
        "kind": "command",
        "method": "showCode",
        "args": []
      },
      "downloadCode": {
        "kind": "command",
        "method": "downloadCode",
        "args": []
      },
      "getTranspiledCode": {
        "kind": "reporter",
        "method": "getTranspiledCode",
        "args": []
      },
      "uploadScriptToHub": {
        "kind": "command",
        "method": "uploadScriptToHub",
        "args": ["NAME"]
      },
      "runScriptOnHub": {
        "kind": "command",
        "method": "runScriptOnHub",
        "args": ["NAME"]
      },
      "renameScriptOnHub": {
        "kind": "command",
        "method": "renameScriptOnHub",
        "args": ["OLD", "NEW"]
      },
      "deleteScriptOnHub": {
        "kind": "command",
        "method": "deleteScriptOnHub",
        "args": ["NAME"]
      },
      "listScriptsOnHub": {
        "kind": "reporter",
        "method": "listScriptsOnHub",
        "args": []
      },
      "stopRunningScript": {
        "kind": "command",
        "method": "stopRunningScript",
        "args": []
      },
      "setMovementMotors": {
        "kind": "command",
        "method": "setMovementMotors",
        "args": ["PORT_A", "PORT_B"]
      },
      "moveForward": {
        "kind": "command",
        "method": "moveForward",
        "args": ["DIRECTION", "VALUE", "UNIT"]
      },
      "steer": {
        "kind": "command",
        "method": "steer",
        "args": ["STEERING"]
      },
      "startTank": {
        "kind": "command",
        "method": "startTank",
        "args": ["LEFT_SPEED", "RIGHT_SPEED"]
      },
      "setMovementSpeed": {
        "kind": "command",
        "method": "setMovementSpeed",
        "args": ["SPEED"]
      },
      "stopMovement": {
        "kind": "command",
        "method": "stopMovement",
        "args": []
      },
      "motorRunFor": {
        "kind": "command",
        "method": "motorRunFor",
        "args": ["PORT", "DIRECTION", "VALUE", "UNIT"]
      },
      "motorRunToPosition": {
        "kind": "command",
        "method": "motorRunToPosition",
        "args": ["PORT", "POSITION"]
      },
      "motorStart": {
        "kind": "command",
        "method": "motorStart",
        "args": ["PORT", "DIRECTION"]
      },
      "motorStop": {
        "kind": "command",
        "method": "motorStop",
        "args": ["PORT"]
      },
      "motorSetSpeed": {
        "kind": "command",
        "method": "motorSetSpeed",
        "args": ["PORT", "SPEED"]
      },
      "motorSetStopAction": {
        "kind": "command",
        "method": "motorSetStopAction",
        "args": ["PORT", "ACTION"]
      },
      "getPosition": {
        "kind": "reporter",
        "method": "getPosition",
        "args": ["PORT"]
      },
      "getRelativePosition": {
        "kind": "reporter",
        "method": "getRelativePosition",
        "args": ["PORT"]
      },
      "getAbsolutePosition": {
        "kind": "reporter",
        "method": "getAbsolutePosition",
        "args": ["PORT"]
      },
      "getSpeed": {
        "kind": "reporter",
        "method": "getSpeed",
        "args": ["PORT"]
      },
      "resetMotorPosition": {
        "kind": "command",
        "method": "resetMotorPosition",
        "args": ["PORT", "POSITION"]
      },
      "displayText": {
        "kind": "command",
        "method": "displayText",
        "args": ["TEXT"]
      },
      "displayImage": {
        "kind": "command",
        "method": "displayImage",
        "args": ["MATRIX"]
      },
      "displayPattern": {
        "kind": "command",
        "method": "displayPattern",
        "args": ["PATTERN"]
      },
      "displayClear": {
        "kind": "command",
        "method": "displayClear",
        "args": []
      },
      "setPixel": {
        "kind": "command",
        "method": "setPixel",
        "args": ["X", "Y", "BRIGHTNESS"]
      },
      "rotateDisplay": {
        "kind": "command",
        "method": "rotateDisplay",
        "args": ["ANGLE"]
      },
      "setCenterButtonColor": {
        "kind": "command",
        "method": "setCenterButtonColor",
        "args": ["COLOR"]
      },
      "getAngle": {
        "kind": "reporter",
        "method": "getAngle",
        "args": ["AXIS"]
      },
      "getGyroRate": {
        "kind": "reporter",
        "method": "getGyroRate",
        "args": ["AXIS"]
      },
      "getFilteredGyroRate": {
        "kind": "reporter",
        "method": "getFilteredGyroRate",
        "args": ["AXIS"]
      },
      "getAcceleration": {
        "kind": "reporter",
        "method": "getAcceleration",
        "args": ["AXIS"]
      },
      "getFilteredAcceleration": {
        "kind": "reporter",
        "method": "getFilteredAcceleration",
        "args": ["AXIS"]
      },
      "resetYaw": {
        "kind": "command",
        "method": "resetYaw",
        "args": []
      },
      "presetYaw": {
        "kind": "command",
        "method": "presetYaw",
        "args": ["ANGLE"]
      },
      "setMatrix3x3ColorGrid": {
        "kind": "command",
        "method": "setMatrix3x3ColorGrid",
        "args": ["PORT", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9"]
      },
      "setMatrix3x3Custom": {
        "kind": "command",
        "method": "setMatrix3x3Custom",
        "args": ["PORT", "PATTERN"]
      },
      "setMatrix3x3SolidColor": {
        "kind": "command",
        "method": "setMatrix3x3SolidColor",
        "args": ["PORT", "COLOR", "BRIGHTNESS"]
      },
      "clearMatrix3x3": {
        "kind": "command",
        "method": "clearMatrix3x3",
        "args": ["PORT"]
      },
      "whenGesture": {
        "kind": "hat",
        "method": "whenGesture",
        "args": ["GESTURE"]
      },
      "isGesture": {
        "kind": "boolean",
        "method": "isGesture",
        "args": ["GESTURE"]
      },
      "getOrientation": {
        "kind": "reporter",
        "method": "getOrientation",
        "args": []
      },
      "playHubSound": {
        "kind": "command",
        "method": "playHubSound",
        "args": ["SOUND"]
      },
      "playBeep": {
        "kind": "command",
        "method": "playBeep",
        "args": ["FREQUENCY", "DURATION"]
      },
      "playNote": {
        "kind": "command",
        "method": "playNote",
        "args": ["NOTE", "SECS"]
      },
      "playWaveBeep": {
        "kind": "command",
        "method": "playWaveBeep",
        "args": ["WAVEFORM", "FREQUENCY", "DURATION"]
      },
      "setVolume": {
        "kind": "command",
        "method": "setVolume",
        "args": ["VOLUME"]
      },
      "stopSound": {
        "kind": "command",
        "method": "stopSound",
        "args": []
      },
      "getBatteryLevel": {
        "kind": "reporter",
        "method": "getBatteryLevel",
        "args": []
      },
      "getBatteryTemperature": {
        "kind": "reporter",
        "method": "getBatteryTemperature",
        "args": []
      },
      "getHubTemperature": {
        "kind": "reporter",
        "method": "getHubTemperature",
        "args": []
      },
      "getHubCurrent": {
        "kind": "reporter",
        "method": "getHubCurrent",
        "args": []
      },
      "getHubVoltage": {
        "kind": "reporter",
        "method": "getHubVoltage",
        "args": []
      },
      "getTimer": {
        "kind": "reporter",
        "method": "getTimer",
        "args": []
      },
      "resetTimer": {
        "kind": "command",
        "method": "resetTimer",
        "args": []
      },
      "getDistance": {
        "kind": "reporter",
        "method": "getDistance",
        "args": ["PORT"]
      },
      "setDistanceLights": {
        "kind": "command",
        "method": "setDistanceLights",
        "args": ["PORT", "TL", "TR", "BL", "BR"]
      },
      "getColor": {
        "kind": "reporter",
        "method": "getColor",
        "args": ["PORT"]
      },
      "getReflection": {
        "kind": "reporter",
        "method": "getReflection",
        "args": ["PORT"]
      },
      "getAmbientLight": {
        "kind": "reporter",
        "method": "getAmbientLight",
        "args": ["PORT"]
      },
      "getForce": {
        "kind": "reporter",
        "method": "getForce",
        "args": ["PORT"]
      },
      "isForceSensorPressed": {
        "kind": "boolean",
        "method": "isForceSensorPressed",
        "args": ["PORT"]
      },
      "whenColor": {
        "kind": "hat",
        "method": "whenColor",
        "args": ["PORT", "COLOR"]
      },
      "isColor": {
        "kind": "boolean",
        "method": "isColor",
        "args": ["PORT", "COLOR"]
      },
      "whenForceSensor": {
        "kind": "hat",
        "method": "whenForceSensor",
        "args": ["PORT", "STATE"]
      },
      "isButtonPressed": {
        "kind": "boolean",
        "method": "isButtonPressed",
        "args": ["BUTTON"]
      },
      "whenButtonPressed": {
        "kind": "hat",
        "method": "whenButtonPressed",
        "args": ["BUTTON"]
      },
      "writeLogFile": {
        "kind": "command",
        "method": "writeLogFile",
        "args": ["TEXT", "FILENAME"]
      },
      "readLogFile": {
        "kind": "reporter",
        "method": "readLogFile",
        "args": ["FILENAME"]
      },
      "deleteLogFile": {
        "kind": "command",
        "method": "deleteLogFile",
        "args": ["FILENAME"]
      },
      "listFiles": {
        "kind": "reporter",
        "method": "listFiles",
        "args": []
      },
      "runReplCommand": {
        "kind": "command",
        "method": "runReplCommand",
        "args": ["CODE"]
      },
      "getReplOutput": {
        "kind": "reporter",
        "method": "getReplOutput",
        "args": []
      },
      "clearReplOutput": {
        "kind": "command",
        "method": "clearReplOutput",
        "args": []
      },
      "getReplHistory": {
        "kind": "reporter",
        "method": "getReplHistory",
        "args": ["INDEX"]
      },
      "runPythonCommand": {
        "kind": "command",
        "method": "runPythonCommand",
        "args": ["CODE"]
      },
      "runHubCommand": {
        "kind": "command",
        "method": "runHubCommand",
        "args": ["CODE"]
      },
      "exitScript": {
        "kind": "command",
        "method": "exitScript",
        "args": []
      }
    }
  },
  "scratchtoev3": {
    "runtime": "scratchtoev3",
    "ops": {
      "setConnectionMode": {
        "kind": "command",
        "method": "setConnectionMode",
        "args": ["MODE", "IP", "PORT"]
      },
      "setCredentials": {
        "kind": "command",
        "method": "setCredentials",
        "args": ["USER", "PASS"]
      },
      "enableStreaming": {
        "kind": "command",
        "method": "enableStreaming",
        "args": []
      },
      "disableStreaming": {
        "kind": "command",
        "method": "disableStreaming",
        "args": []
      },
      "testConnection": {
        "kind": "reporter",
        "method": "testConnection",
        "args": []
      },
      "transpileProject": {
        "kind": "command",
        "method": "transpileProject",
        "args": []
      },
      "showCode": {
        "kind": "command",
        "method": "showCode",
        "args": []
      },
      "downloadCode": {
        "kind": "command",
        "method": "downloadCode",
        "args": []
      },
      "downloadUploader": {
        "kind": "command",
        "method": "downloadUploader",
        "args": []
      },
      "getLanguageInfo": {
        "kind": "reporter",
        "method": "getLanguageInfo",
        "args": []
      },
      "uploadAndRunScript": {
        "kind": "command",
        "method": "uploadAndRunScript",
        "args": ["NAME"]
      },
      "uploadScript": {
        "kind": "command",
        "method": "uploadScript",
        "args": ["NAME"]
      },
      "runScriptByName": {
        "kind": "command",
        "method": "runScriptByName",
        "args": ["NAME"]
      },
      "stopCurrentScript": {
        "kind": "command",
        "method": "stopCurrentScript",
        "args": []
      },
      "stopScriptById": {
        "kind": "command",
        "method": "stopScriptById",
        "args": ["ID"]
      },
      "stopAllScripts": {
        "kind": "command",
        "method": "stopAllScripts",
        "args": []
      },
      "deleteScript": {
        "kind": "command",
        "method": "deleteScript",
        "args": ["NAME"]
      },
      "refreshScriptList": {
        "kind": "command",
        "method": "refreshScriptList",
        "args": []
      },
      "getScriptList": {
        "kind": "reporter",
        "method": "getScriptList",
        "args": []
      },
      "getRunningScripts": {
        "kind": "reporter",
        "method": "getRunningScripts",
        "args": []
      },
      "getScriptCount": {
        "kind": "reporter",
        "method": "getScriptCount",
        "args": []
      },
      "isScriptRunning": {
        "kind": "boolean",
        "method": "isScriptRunning",
        "args": ["NAME"]
      },
      "getCurrentScriptId": {
        "kind": "reporter",
        "method": "getCurrentScriptId",
        "args": []
      },
      "ev3MotorRun": {
        "kind": "command",
        "method": "ev3MotorRun",
        "args": ["PORT", "SPEED"]
      },
      "ev3MotorRunFor": {
        "kind": "command",
        "method": "ev3MotorRunFor",
        "args": ["PORT", "ROTATIONS", "SPEED"]
      },
      "ev3MotorStop": {
        "kind": "command",
        "method": "ev3MotorStop",
        "args": ["PORT", "BRAKE"]
      },
      "ev3MotorRunDegrees": {
        "kind": "command",
        "method": "ev3MotorRunDegrees",
        "args": ["PORT", "DEGREES", "SPEED"]
      },
      "ev3MotorRunTimed": {
        "kind": "command",
        "method": "ev3MotorRunTimed",
        "args": ["PORT", "SECONDS", "SPEED"]
      },
      "ev3MotorRunToAbsPos": {
        "kind": "command",
        "method": "ev3MotorRunToAbsPos",
        "args": ["PORT", "POS", "SPEED"]
      },
      "ev3MotorSetRamping": {
        "kind": "command",
        "method": "ev3MotorSetRamping",
        "args": ["PORT", "MS"]
      },
      "ev3TankDrive": {
        "kind": "command",
        "method": "ev3TankDrive",
        "args": ["LEFT", "RIGHT", "ROTATIONS"]
      },
      "ev3MotorPosition": {
        "kind": "reporter",
        "method": "ev3MotorPosition",
        "args": ["PORT"]
      },
      "ev3MotorSpeed": {
        "kind": "reporter",
        "method": "ev3MotorSpeed",
        "args": ["PORT"]
      },
      "ev3MotorIsRunning": {
        "kind": "boolean",
        "method": "ev3MotorIsRunning",
        "args": ["PORT"]
      },
      "ev3MotorIsStalled": {
        "kind": "boolean",
        "method": "ev3MotorIsStalled",
        "args": ["PORT"]
      },
      "ev3MotorReset": {
        "kind": "command",
        "method": "ev3MotorReset",
        "args": ["PORT"]
      },
      "servoRunToPosition": {
        "kind": "command",
        "method": "servoRunToPosition",
        "args": ["PORT", "POS", "SPEED"]
      },
      "servoStop": {
        "kind": "command",
        "method": "servoStop",
        "args": ["PORT"]
      },
      "moveSteering": {
        "kind": "command",
        "method": "moveSteering",
        "args": ["STEERING", "SPEED", "ROTATIONS"]
      },
      "ev3DcMotorRun": {
        "kind": "command",
        "method": "ev3DcMotorRun",
        "args": ["PORT", "SPEED"]
      },
      "ev3DcMotorStop": {
        "kind": "command",
        "method": "ev3DcMotorStop",
        "args": ["PORT"]
      },
      "ev3TouchSensor": {
        "kind": "boolean",
        "method": "ev3TouchSensor",
        "args": ["PORT"]
      },
      "ev3ConfigurePort": {
        "kind": "command",
        "method": "ev3ConfigurePort",
        "args": ["PORT", "DEVICE"]
      },
      "ev3ColorSensor": {
        "kind": "reporter",
        "method": "ev3ColorSensor",
        "args": ["PORT", "MODE"]
      },
      "ev3ColorIsColor": {
        "kind": "boolean",
        "method": "ev3ColorIsColor",
        "args": ["PORT", "COLOR"]
      },
      "ev3ColorRGB": {
        "kind": "reporter",
        "method": "ev3ColorRGB",
        "args": ["PORT", "COMPONENT"]
      },
      "ev3UltrasonicSensor": {
        "kind": "reporter",
        "method": "ev3UltrasonicSensor",
        "args": ["PORT", "UNIT"]
      },
      "ev3UltrasonicPresence": {
        "kind": "boolean",
        "method": "ev3UltrasonicPresence",
        "args": ["PORT"]
      },
      "ev3GyroSensor": {
        "kind": "reporter",
        "method": "ev3GyroSensor",
        "args": ["PORT", "MODE"]
      },
      "ev3GyroReset": {
        "kind": "command",
        "method": "ev3GyroReset",
        "args": ["PORT"]
      },
      "ev3InfraredProximity": {
        "kind": "reporter",
        "method": "ev3InfraredProximity",
        "args": ["PORT"]
      },
      "ev3InfraredBeaconHeading": {
        "kind": "reporter",
        "method": "ev3InfraredBeaconHeading",
        "args": ["PORT", "CHANNEL"]
      },
      "ev3InfraredBeaconDistance": {
        "kind": "reporter",
        "method": "ev3InfraredBeaconDistance",
        "args": ["PORT", "CHANNEL"]
      },
      "ev3InfraredRemoteButton": {
        "kind": "boolean",
        "method": "ev3InfraredRemoteButton",
        "args": ["PORT", "CHANNEL", "BUTTON"]
      },
      "ev3SoundSensor": {
        "kind": "reporter",
        "method": "ev3SoundSensor",
        "args": ["PORT", "MODE"]
      },
      "ev3LightSensor": {
        "kind": "reporter",
        "method": "ev3LightSensor",
        "args": ["PORT", "MODE"]
      },
      "ev3ButtonPressed": {
        "kind": "boolean",
        "method": "ev3ButtonPressed",
        "args": ["BUTTON"]
      },
      "ev3ScreenClear": {
        "kind": "command",
        "method": "ev3ScreenClear",
        "args": []
      },
      "ev3ScreenText": {
        "kind": "command",
        "method": "ev3ScreenText",
        "args": ["TEXT", "X", "Y"]
      },
      "ev3DrawCircle": {
        "kind": "command",
        "method": "ev3DrawCircle",
        "args": ["X", "Y", "R"]
      },
      "ev3DrawRectangle": {
        "kind": "command",
        "method": "ev3DrawRectangle",
        "args": ["X1", "Y1", "X2", "Y2"]
      },
      "ev3DrawLine": {
        "kind": "command",
        "method": "ev3DrawLine",
        "args": ["X1", "Y1", "X2", "Y2"]
      },
      "ev3Speak": {
        "kind": "command",
        "method": "ev3Speak",
        "args": ["TEXT"]
      },
      "ev3Beep": {
        "kind": "command",
        "method": "ev3Beep",
        "args": ["FREQUENCY", "DURATION"]
      },
      "ev3SetLED": {
        "kind": "command",
        "method": "ev3SetLED",
        "args": ["COLOR"]
      },
      "ev3SetVolume": {
        "kind": "command",
        "method": "ev3SetVolume",
        "args": ["VOLUME"]
      },
      "ev3PlayTone": {
        "kind": "command",
        "method": "ev3PlayTone",
        "args": ["NOTE", "DURATION"]
      },
      "ev3SetLEDSide": {
        "kind": "command",
        "method": "ev3SetLEDSide",
        "args": ["SIDE", "COLOR"]
      },
      "ev3LEDAllOff": {
        "kind": "command",
        "method": "ev3LEDAllOff",
        "args": []
      },
      "ev3LEDReset": {
        "kind": "command",
        "method": "ev3LEDReset",
        "args": []
      },
      "ev3LEDAnimate": {
        "kind": "command",
        "method": "ev3LEDAnimate",
        "args": ["ANIMATION", "COLOR1", "COLOR2", "DURATION", "SLEEPTIME"]
      },
      "ev3PlaySong": {
        "kind": "command",
        "method": "ev3PlaySong",
        "args": ["SONG", "TEMPO"]
      },
      "ev3LEDStopAnimation": {
        "kind": "command",
        "method": "ev3LEDStopAnimation",
        "args": []
      },
      "ev3GetVolume": {
        "kind": "reporter",
        "method": "ev3GetVolume",
        "args": []
      },
      "ev3PlayToneSequence": {
        "kind": "command",
        "method": "ev3PlayToneSequence",
        "args": ["SEQUENCE"]
      },
      "ev3PlayFile": {
        "kind": "command",
        "method": "ev3PlayFile",
        "args": ["FILENAME", "VOLUME"]
      },
      "ev3BatteryLevel": {
        "kind": "reporter",
        "method": "ev3BatteryLevel",
        "args": []
      },
      "spriteGetX": {
        "kind": "reporter",
        "method": "spriteGetX",
        "args": ["SPRITE"]
      },
      "spriteGetY": {
        "kind": "reporter",
        "method": "spriteGetY",
        "args": ["SPRITE"]
      },
      "spriteGetSize": {
        "kind": "reporter",
        "method": "spriteGetSize",
        "args": ["SPRITE"]
      },
      "spriteGetVisible": {
        "kind": "boolean",
        "method": "spriteGetVisible",
        "args": ["SPRITE"]
      },
      "spriteSetPosition": {
        "kind": "command",
        "method": "spriteSetPosition",
        "args": ["SPRITE", "X", "Y"]
      },
      "spriteSetSize": {
        "kind": "command",
        "method": "spriteSetSize",
        "args": ["SPRITE", "SIZE"]
      },
      "spriteSetVisible": {
        "kind": "command",
        "method": "spriteSetVisible",
        "args": ["SPRITE", "VISIBLE"]
      }
    }
  },
  "ev3lms": {
    "runtime": "ev3lms",
    "ops": {
      "setEV3IP": {
        "kind": "command",
        "method": "setEV3IP",
        "args": ["IP"]
      },
      "setLMSApiUrl": {
        "kind": "command",
        "method": "setLMSApiUrl",
        "args": ["URL", "PORT"]
      },
      "enableStreaming": {
        "kind": "command",
        "method": "enableStreaming",
        "args": []
      },
      "disableStreaming": {
        "kind": "command",
        "method": "disableStreaming",
        "args": []
      },
      "testConnection": {
        "kind": "reporter",
        "method": "testConnection",
        "args": []
      },
      "testCompiler": {
        "kind": "reporter",
        "method": "testCompiler",
        "args": []
      },
      "transpileToLMS": {
        "kind": "command",
        "method": "transpileToLMS",
        "args": []
      },
      "showLMSCode": {
        "kind": "command",
        "method": "showLMSCode",
        "args": []
      },
      "downloadLMSCode": {
        "kind": "command",
        "method": "downloadLMSCode",
        "args": []
      },
      "compileToRBF": {
        "kind": "command",
        "method": "compileToRBF",
        "args": []
      },
      "showRBFCode": {
        "kind": "command",
        "method": "showRBFCode",
        "args": []
      },
      "downloadRBF": {
        "kind": "command",
        "method": "downloadRBF",
        "args": []
      },
      "showDebugLog": {
        "kind": "command",
        "method": "showDebugLog",
        "args": []
      },
      "testDiagnostics": {
        "kind": "command",
        "method": "testDiagnostics",
        "args": []
      },
      "motorRun": {
        "kind": "command",
        "method": "motorRun",
        "args": ["PORT", "POWER"]
      },
      "motorRunTime": {
        "kind": "command",
        "method": "motorRunTime",
        "args": ["PORT", "TIME", "POWER"]
      },
      "motorRunRotations": {
        "kind": "command",
        "method": "motorRunRotations",
        "args": ["PORT", "ROTATIONS", "POWER"]
      },
      "motorRunDegrees": {
        "kind": "command",
        "method": "motorRunDegrees",
        "args": ["PORT", "DEGREES", "POWER"]
      },
      "motorStop": {
        "kind": "command",
        "method": "motorStop",
        "args": ["PORT", "BRAKE"]
      },
      "motorReset": {
        "kind": "command",
        "method": "motorReset",
        "args": ["PORT"]
      },
      "motorPolarity": {
        "kind": "command",
        "method": "motorPolarity",
        "args": ["PORT", "POLARITY"]
      },
      "tankDrive": {
        "kind": "command",
        "method": "tankDrive",
        "args": ["LEFT", "RIGHT", "VALUE", "UNIT"]
      },
      "steerDrive": {
        "kind": "command",
        "method": "steerDrive",
        "args": ["STEERING", "SPEED", "VALUE", "UNIT"]
      },
      "motorPosition": {
        "kind": "reporter",
        "method": "motorPosition",
        "args": ["PORT"]
      },
      "motorSpeed": {
        "kind": "reporter",
        "method": "motorSpeed",
        "args": ["PORT"]
      },
      "touchSensor": {
        "kind": "boolean",
        "method": "touchSensor",
        "args": ["PORT"]
      },
      "touchSensorBumped": {
        "kind": "boolean",
        "method": "touchSensorBumped",
        "args": ["PORT"]
      },
      "colorSensor": {
        "kind": "reporter",
        "method": "colorSensor",
        "args": ["PORT", "MODE"]
      },
      "colorSensorRGB": {
        "kind": "reporter",
        "method": "colorSensorRGB",
        "args": ["PORT", "COMPONENT"]
      },
      "ultrasonicSensor": {
        "kind": "reporter",
        "method": "ultrasonicSensor",
        "args": ["PORT", "UNIT"]
      },
      "ultrasonicListen": {
        "kind": "boolean",
        "method": "ultrasonicListen",
        "args": ["PORT"]
      },
      "gyroSensor": {
        "kind": "reporter",
        "method": "gyroSensor",
        "args": ["PORT", "MODE"]
      },
      "gyroReset": {
        "kind": "command",
        "method": "gyroReset",
        "args": ["PORT"]
      },
      "irProximity": {
        "kind": "reporter",
        "method": "irProximity",
        "args": ["PORT"]
      },
      "irBeaconHeading": {
        "kind": "reporter",
        "method": "irBeaconHeading",
        "args": ["PORT", "CHANNEL"]
      },
      "irBeaconDistance": {
        "kind": "reporter",
        "method": "irBeaconDistance",
        "args": ["PORT", "CHANNEL"]
      },
      "irRemoteButton": {
        "kind": "boolean",
        "method": "irRemoteButton",
        "args": ["PORT", "CHANNEL", "BUTTON"]
      },
      "buttonPressed": {
        "kind": "boolean",
        "method": "buttonPressed",
        "args": ["BUTTON"]
      },
      "waitForButton": {
        "kind": "command",
        "method": "waitForButton",
        "args": ["BUTTON"]
      },
      "screenClear": {
        "kind": "command",
        "method": "screenClear",
        "args": []
      },
      "screenText": {
        "kind": "command",
        "method": "screenText",
        "args": ["TEXT", "X", "Y"]
      },
      "screenTextLarge": {
        "kind": "command",
        "method": "screenTextLarge",
        "args": ["TEXT", "X", "Y"]
      },
      "drawPixel": {
        "kind": "command",
        "method": "drawPixel",
        "args": ["X", "Y"]
      },
      "drawLine": {
        "kind": "command",
        "method": "drawLine",
        "args": ["X1", "Y1", "X2", "Y2"]
      },
      "drawCircle": {
        "kind": "command",
        "method": "drawCircle",
        "args": ["X", "Y", "R", "FILL"]
      },
      "drawRectangle": {
        "kind": "command",
        "method": "drawRectangle",
        "args": ["X", "Y", "W", "H", "FILL"]
      },
      "screenUpdate": {
        "kind": "command",
        "method": "screenUpdate",
        "args": []
      },
      "screenInvert": {
        "kind": "command",
        "method": "screenInvert",
        "args": []
      },
      "playTone": {
        "kind": "command",
        "method": "playTone",
        "args": ["FREQ", "DURATION"]
      },
      "playNote": {
        "kind": "command",
        "method": "playNote",
        "args": ["NOTE", "DURATION"]
      },
      "beep": {
        "kind": "command",
        "method": "beep",
        "args": []
      },
      "setVolume": {
        "kind": "command",
        "method": "setVolume",
        "args": ["VOLUME"]
      },
      "getVolume": {
        "kind": "reporter",
        "method": "getVolume",
        "args": []
      },
      "stopSound": {
        "kind": "command",
        "method": "stopSound",
        "args": []
      },
      "setLED": {
        "kind": "command",
        "method": "setLED",
        "args": ["COLOR"]
      },
      "ledAllOff": {
        "kind": "command",
        "method": "ledAllOff",
        "args": []
      },
      "batteryLevel": {
        "kind": "reporter",
        "method": "batteryLevel",
        "args": []
      },
      "batteryCurrent": {
        "kind": "reporter",
        "method": "batteryCurrent",
        "args": []
      },
      "batteryVoltage": {
        "kind": "reporter",
        "method": "batteryVoltage",
        "args": []
      },
      "freeMemory": {
        "kind": "reporter",
        "method": "freeMemory",
        "args": []
      },
      "resetTimer": {
        "kind": "command",
        "method": "resetTimer",
        "args": ["TIMER"]
      },
      "timerValue": {
        "kind": "reporter",
        "method": "timerValue",
        "args": ["TIMER"]
      },
      "waitSeconds": {
        "kind": "command",
        "method": "waitSeconds",
        "args": ["TIME"]
      },
      "waitMillis": {
        "kind": "command",
        "method": "waitMillis",
        "args": ["TIME"]
      }
    }
  },
  "circuit": {
    "runtime": "circuit",
    "ops": {
      "nodevoltage": {
        "kind": "reporter",
        "method": "nodevoltage",
        "args": ["NET"]
      },
      "branchcurrent": {
        "kind": "reporter",
        "method": "branchcurrent",
        "args": ["PART"]
      },
      "resistance": {
        "kind": "reporter",
        "method": "resistance",
        "args": ["A", "B"]
      },
      "ledbrightness": {
        "kind": "reporter",
        "method": "ledbrightness",
        "args": ["PART"]
      },
      "buzzertone": {
        "kind": "reporter",
        "method": "buzzertone",
        "args": ["PART"]
      },
      "setcontrol": {
        "kind": "command",
        "method": "setcontrol",
        "args": ["CONTROL", "VALUE"]
      },
      "setpower": {
        "kind": "command",
        "method": "setpower",
        "args": ["STATE"]
      }
    }
  },
  "ledcube": {
    "runtime": "ledcube",
    "ops": {
      "setvoxel": {
        "kind": "command",
        "method": "setvoxel",
        "args": ["X", "Y", "Z", "COLOUR"]
      },
      "clearvoxel": {
        "kind": "command",
        "method": "clearvoxel",
        "args": ["X", "Y", "Z"]
      },
      "filllayer": {
        "kind": "command",
        "method": "filllayer",
        "args": ["LAYER", "COLOUR"]
      },
      "fillcolumn": {
        "kind": "command",
        "method": "fillcolumn",
        "args": ["X", "Y", "COLOUR"]
      },
      "fillwall": {
        "kind": "command",
        "method": "fillwall",
        "args": ["Z", "COLOUR"]
      },
      "clear": {
        "kind": "command",
        "method": "clear",
        "args": []
      },
      "invert": {
        "kind": "command",
        "method": "invert",
        "args": []
      },
      "shift": {
        "kind": "command",
        "method": "shift",
        "args": ["DIR"]
      },
      "hold": {
        "kind": "command",
        "method": "hold",
        "args": ["DURATION"]
      },
      "readvoxel": {
        "kind": "reporter",
        "method": "readvoxel",
        "args": ["X", "Y", "Z"]
      }
    }
  },
  "stc12live": {
    "runtime": "stc12live",
    "ops": {
      "connect": {
        "kind": "command",
        "method": "connect",
        "args": []
      },
      "disconnect": {
        "kind": "command",
        "method": "disconnect",
        "args": []
      },
      "isConnected": {
        "kind": "boolean",
        "method": "isConnected",
        "args": []
      },
      "chipVersion": {
        "kind": "reporter",
        "method": "chipVersion",
        "args": []
      },
      "consumed": {
        "kind": "reporter",
        "method": "consumed",
        "args": []
      }
    }
  }
};
const RUNTIME_EXTENSION_URLS = {
  "universalgamepad": "https://crispstrobe.github.io/extensions/CrispStrobe/gamepad.js",
  "legoboostunified": "https://crispstrobe.github.io/extensions/CrispStrobe/legoboost_universal.js",
  "legopoweredup": "https://crispstrobe.github.io/extensions/CrispStrobe/lego_poweredup.js",
  "wedo2unified": "https://crispstrobe.github.io/extensions/CrispStrobe/lego_wedo2_universal.js",
  "legospikeprimeBLE": "https://crispstrobe.github.io/extensions/CrispStrobe/legospikeprime_ble.js",
  "spikeprimeble": "https://crispstrobe.github.io/extensions/CrispStrobe/legospike_ble.js",
  "spikeprimeBTC": "https://crispstrobe.github.io/extensions/CrispStrobe/legospikeprime_btc_scratchlink.js",
  "spikeprimeBridge": "https://crispstrobe.github.io/extensions/CrispStrobe/legospike_bridge.js",
  "ev3comprehensive": "https://crispstrobe.github.io/extensions/CrispStrobe/ev3_universal.js",
  "legoev3direct": "https://crispstrobe.github.io/extensions/CrispStrobe/ev3_direct.js",
  "legonxt": "https://crispstrobe.github.io/extensions/CrispStrobe/legonxt_transpile_universal.js",
  "spikeprime": "https://crispstrobe.github.io/extensions/CrispStrobe/legospike_turbowarp_transpile.js",
  "scratchtoev3": "https://crispstrobe.github.io/extensions/CrispStrobe/ev3dev_py_transpile.js",
  "ev3lms": "https://crispstrobe.github.io/extensions/CrispStrobe/ev3_lms_transpile.js",
  "circuit": "https://crispstrobe.github.io/extensions/CrispStrobe/circuit.js",
  "ledcube": "https://crispstrobe.github.io/extensions/CrispStrobe/ledcube.js",
  "stc12live": "https://crispstrobe.github.io/extensions/CrispStrobe/stc12live.js"
};

/***/ }),

/***/ "./src/lib/sb3-creator.js":
/*!********************************!*\
  !*** ./src/lib/sb3-creator.js ***!
  \********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var jszip__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jszip */ "./node_modules/jszip/dist/jszip.min.js");
/* harmony import */ var jszip__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jszip__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _sb3_creator_runtime_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./sb3-creator-runtime.js */ "./src/lib/sb3-creator-runtime.js");
/* harmony import */ var _sb3_creator_scratchruntime_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./sb3-creator-scratchruntime.js */ "./src/lib/sb3-creator-scratchruntime.js");
/* harmony import */ var _sb3_creator_chostruntime_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./sb3-creator-chostruntime.js */ "./src/lib/sb3-creator-chostruntime.js");
/* harmony import */ var _cubeDirections_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./cubeDirections.js */ "./src/lib/cubeDirections.js");
function asyncGeneratorStep(n,t,e,r,o,a,c){try{var i=n[a](c),u=i.value;}catch(n){return void e(n);}i.done?t(u):Promise.resolve(u).then(r,o);}function _asyncToGenerator(n){return function(){var t=this,e=arguments;return new Promise(function(r,o){var a=n.apply(t,e);function _next(n){asyncGeneratorStep(a,r,o,_next,_throw,"next",n);}function _throw(n){asyncGeneratorStep(a,r,o,_next,_throw,"throw",n);}_next(void 0);});};}function ownKeys(e,r){var t=Object.keys(e);if(Object.getOwnPropertySymbols){var o=Object.getOwnPropertySymbols(e);r&&(o=o.filter(function(r){return Object.getOwnPropertyDescriptor(e,r).enumerable;})),t.push.apply(t,o);}return t;}function _objectSpread(e){for(var r=1;r<arguments.length;r++){var t=null!=arguments[r]?arguments[r]:{};r%2?ownKeys(Object(t),!0).forEach(function(r){_defineProperty(e,r,t[r]);}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(t)):ownKeys(Object(t)).forEach(function(r){Object.defineProperty(e,r,Object.getOwnPropertyDescriptor(t,r));});}return e;}function _defineProperty(e,r,t){return(r=_toPropertyKey(r))in e?Object.defineProperty(e,r,{value:t,enumerable:!0,configurable:!0,writable:!0}):e[r]=t,e;}function _toPropertyKey(t){var i=_toPrimitive(t,"string");return"symbol"==typeof i?i:i+"";}function _toPrimitive(t,r){if("object"!=typeof t||!t)return t;var e=t[Symbol.toPrimitive];if(void 0!==e){var i=e.call(t,r||"default");if("object"!=typeof i)return i;throw new TypeError("@@toPrimitive must return a primitive value.");}return("string"===r?String:Number)(t);}// Auto-generated hardware-extension registry (scripts/gen-runtime-registry.mjs). Covers all
// the LEGO/hardware extensions declaratively so the pluggable driver "works for all of them".
// Scratch-runtime shim table: maps graphical blocks (motion/looks/sensing/…) to
// reversible `scratch.<method>(...)` calls so Python/JS round-trips preserve the project.
// The host C target's runtime and shim naming (see cHostRuntime.js for why the
// shim is generated from OP_TO_SCRATCH rather than written out).
// The LED cube's shift directions. Shared with the C reader so the two cannot
// drift — they already did once, and the round trip lost the block.
// Structured error classes
class SB3Error extends Error{constructor(message){let type=arguments.length>1&&arguments[1]!==undefined?arguments[1]:'SB3Error';super(message);this.name=type;this.isSB3Error=true;}}class ParseError extends SB3Error{constructor(message){let line=arguments.length>1&&arguments[1]!==undefined?arguments[1]:null;super(message,'ParseError');this.line=line;}}class ValidationError extends SB3Error{constructor(message){super(message,'ValidationError');}}class AssetError extends SB3Error{constructor(message){super(message,'AssetError');}}/**
 * SB3 Creator: compiles the pseudocode language into a Scratch 3.0 project.
 */class SB3Creator{constructor(){this.reset();}reset(){this.project={targets:[],monitors:[],extensions:[],meta:{semver:"3.0.0",vm:"4.6.0",agent:"SB3 Creator/1.0.0"}};this.usedIds=new Set();this.variables=new Map();// scope:name -> {id, name, isGlobal}
this.lists=new Map();// scope:name -> {id, name, isGlobal}
this.broadcasts=new Map();// name -> id
this.assets=new Map();// assetId -> {type, data, metadata}
// Explicit scope declarations (GLOBAL / LOCAL / LIST) override the magic-name fallback.
this.declaredGlobals=new Set();// var names forced global
this.declaredLocals=new Set();// `${scope}:${name}` forced local
this.declaredGlobalLists=new Set();// list names forced global
this.declaredLocalLists=new Set();// `${scope}:${name}` forced local
this.spriteColorIndex=0;this.spriteColors=new Map();// sprite name -> costume colour (for extra costumes)
this.procedures=[];// registered custom blocks (for call-site matching)
this.currentProcArgs=null;// param name -> {type} while parsing a definition body
this.targetNames=new Set(['Stage']);// all sprite/stage names (for sensing_of)
this.generatedSB3=null;this.errors=[];this.warnings=[];this.scriptCount=0;// Comments are the ground truth on the blocks, not the text: a `# comment`
// line is attached as a Scratch block comment to the block that follows it,
// so it survives compile → From-blocks (decompile) round-trips.
this._pendingComment='';this._commentSeq=0;}// Use Scratch's character set for IDs
generateId(){const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#%()*+,-./:;=?@[]^_`{|}~';let id;do{id='';for(let i=0;i<20;i++){id+=chars[Math.floor(Math.random()*chars.length)];}}while(this.usedIds.has(id));this.usedIds.add(id);return id;}// Filesystem-safe id for asset filenames (mirrors Scratch's md5-hex names).
// The full block-id alphabet contains '/' and '.', which JSZip path-normalizes
// and would desync a costume's md5ext from its stored zip entry.
generateAssetId(){const hex='0123456789abcdef';let id;do{id='';for(let i=0;i<32;i++)id+=hex[Math.floor(Math.random()*16)];}while(this.usedIds.has(id));this.usedIds.add(id);return id;}// Push a warning tagged with its 1-based source line number.
warn(lineIndex,message){this.warnings.push("Line ".concat(lineIndex+1,": ").concat(message));}// Strip a trailing `// comment` that is outside any double-quoted string.
stripComment(line){let inStr=false;for(let i=0;i<line.length-1;i++){const c=line[i];if(c==='"')inStr=!inStr;else if(!inStr&&c==='/'&&line[i+1]==='/')return line.slice(0,i);}return line;}// Reconcile project.extensions with the blocks that are actually used. Scratch
// opcodes are `<category>_<name>`; any non-core category is an extension id. This
// both AUTO-ADDS extensions the code needs (compile direction) and parses which
// extensions are genuinely used in the blocks (read direction). Custom gallery
// extensions also get an extensionURL so the VM can load them.
// Source of truth for URLs: github.com/CrispStrobe/extensions (see reference/extensions/).
syncExtensions(){let project=arguments.length>0&&arguments[0]!==undefined?arguments[0]:this.project;const CORE=SB3Creator.CORE_CATEGORIES;const used=new Set();for(const t of project.targets||[]){for(const b of Object.values(t.blocks||{})){const op=b.opcode||'';const i=op.indexOf('_');if(i<=0)continue;const prefix=op.slice(0,i);if(!CORE.has(prefix))used.add(prefix);}}project.extensions=[...used];const urls=_objectSpread({},project.extensionURLs||{});for(const id of used)if(SB3Creator.EXTENSION_URLS[id])urls[id]=SB3Creator.EXTENSION_URLS[id];if(Object.keys(urls).length)project.extensionURLs=urls;return project.extensions;}// ---- Pluggable runtime/hardware extension convention (see RUNTIME_EXTENSIONS) ----
// Look up an opcode in the runtime registry -> { runtime, method, kind, args, neutral }.
runtimeOp(opcode){const i=opcode.indexOf('_');if(i<=0)return null;const reg=SB3Creator.RUNTIME_EXTENSIONS[opcode.slice(0,i)];const op=reg&&reg.ops[opcode.slice(i+1)];return op?_objectSpread({runtime:reg.runtime},op):null;}// Resolve one runtime-op argument: a menu/dropdown shadow -> its field value (quoted);
// a plain field -> the same; a value input -> the language value via `valFn(key)`.
runtimeArg(b,key,blocks,valFn){const input=b.inputs[key];// Blocks whose arguments are fields rather than inputs (the stc12 pin blocks are the
// first) would otherwise resolve to a neutral value and lose the pin name entirely.
if(!input&&b.fields&&b.fields[key])return this.pyStr(String(b.fields[key][0]));if(!input)return valFn(key);const inner=input[1];if(!Array.isArray(inner)){const shadow=blocks[inner];if(shadow&&shadow.shadow&&shadow.fields){const fk=Object.keys(shadow.fields)[0];if(fk)return JSON.stringify(String(shadow.fields[fk][0]));}}return valFn(key);}// Build `_<runtime>.<method>(args)` for a runtime-extension block, or null. Records the
// runtime as used so its driver shim gets emitted.
runtimeCall(b,blocks,valFn){const op=this.runtimeOp(b.opcode);if(!op)return null;if(!this._runtimesUsed)this._runtimesUsed=new Set();this._runtimesUsed.add(b.opcode.slice(0,b.opcode.indexOf('_')));const args=(op.args||[]).map(k=>this.runtimeArg(b,k,blocks,valFn));const call="_".concat(op.runtime,".").concat(op.method,"(").concat(args.join(', '),")");return{kind:op.kind,call:this._async?"await ".concat(call):call};}// Emit a driver for a runtime extension. The program is driver-agnostic; this is the
// single swap point. `mode` selects the backend:
//   'shim'     — neutral no-op stub (default): runs anywhere, drives nothing.
//   'remote'   — forwards each call to a Brickwright bridge over WebSocket
//                (github.com/CrispStrobe/brickwright-bridges, e.g. universal_lego_bridge.py,
//                normalized JSON {"command","args"} → device binary).
//   'ondevice' — for on-brick code (ev3dev/pybricks); the per-hardware transpilers
//                (github.com/CrispStrobe/extensions, ev3dev_py_transpile.js → real ev3dev2)
//                are the source of truth — emit a header pointing there over the neutral base.
// `lang` is 'py' or 'js'. See reference/runtime-drivers.md.
runtimeShim(extId,lang){let mode=arguments.length>2&&arguments[2]!==undefined?arguments[2]:'shim';const reg=SB3Creator.RUNTIME_EXTENSIONS[extId];if(!reg)return[];const rt=reg.runtime;const methods=new Map();for(const op of Object.values(reg.ops))if(!methods.has(op.method))methods.set(op.method,op);const cls=rt.charAt(0).toUpperCase()+rt.slice(1);// The simulated-board driver. Only the stc12 runtime has the pin table needed to
// speak boundary A, so other runtimes fall back to the neutral stub.
if(mode==='simulator'&&extId==='stc12'&&this._driverPins){return this.stc12SimulatorDriver(lang,this._driverPins);}// The circuit extension talks directly to the board (boundary B).
// Meter reporters sample at display rate (~60 Hz), not per edge.
if(mode==='simulator'&&extId==='circuit'){return this.circuitSimulatorDriver(lang);}// Device convenience blocks: read state from board.getDeviceState().
if(mode==='simulator'&&extId==='devices'){return this.devicesSimulatorDriver(lang);}// LED cube: a frame buffer that the board's led_cube can read if attached.
if(mode==='simulator'&&extId==='ledcube'){return this.ledcubeSimulatorDriver(lang);}const banner={shim:'neutral stub — drives nothing; implement to drive real hardware',simulator:'simulated board — no board attached for this runtime, so neutral',remote:"forwards to a Brickwright bridge (brickwright-bridges) over WebSocket",ondevice:"on-brick target \u2014 see the per-hardware transpiler (extensions/CrispStrobe) for real ev3dev/pybricks code"}[mode]||'neutral stub';if(lang==='py'){const lines=["# _".concat(rt," driver \u2014 ").concat(banner)];if(mode==='remote'){lines.push('# pip install websockets; run a bridge from github.com/CrispStrobe/brickwright-bridges');lines.push('import json');lines.push("class _".concat(cls,"Driver:"));lines.push('    def __init__(self, url="ws://localhost:8080"): self._url = url; self._ws = None');lines.push('    def _send(self, command, args):');lines.push("        payload = json.dumps({\"ext\": \"".concat(rt,"\", \"command\": command, \"args\": args})"));lines.push('        # send `payload` to the bridge (async websockets); the bridge maps it to the');lines.push('        # device per hub — see brickwright-bridges/universal_lego_bridge.py from_normalized.');}else{lines.push("class _".concat(cls,"Driver:"));}const df=this._async?'async def':'def';// async so `await _boost.x()` works
for(const[method,op]of methods){if(mode==='remote'&&op.kind==='command'){lines.push("    ".concat(df," ").concat(method,"(self, *a): self._send(\"").concat(method,"\", list(a))"));continue;}let neutral=op.neutral||'0';if(neutral==='NaN')neutral='float("nan")';// Python has no bare NaN
const ret=op.kind==='command'?'pass':op.kind==='boolean'?'return False':"return ".concat(neutral);lines.push("    ".concat(df," ").concat(method,"(self, *a): ").concat(ret));}lines.push('    def on(self, event, handler): pass  # register an event-hat handler');lines.push("_".concat(rt," = _").concat(cls,"Driver()"));return lines;}const entries=[...methods].map(_ref=>{let[method,op]=_ref;if(mode==='remote'&&op.kind==='command')return"".concat(method,": (...a) => _").concat(rt,"_send(\"").concat(method,"\", a)");const ret=op.kind==='command'?'() => {}':op.kind==='boolean'?'() => false':"() => ".concat(op.neutral||'0');return"".concat(method,": ").concat(ret);});entries.push('on: (event, handler) => {}');// register an event-hat handler
const out=["// _".concat(rt," driver \u2014 ").concat(banner)];if(mode==='remote'){// Real WebSocket transport to a Brickwright bridge. The bridge maps
// {ext, command, args} to the device (per hub, e.g. universal_lego_bridge.py
// from_normalized). Point the URL at your running bridge (8080 / 20110).
out.push("const _".concat(rt,"_ws = (typeof WebSocket !== 'undefined') ? new WebSocket(\"ws://localhost:8080\") : null;"));out.push("const _".concat(rt,"_send = (command, args) => { if (_").concat(rt,"_ws && _").concat(rt,"_ws.readyState === 1) _").concat(rt,"_ws.send(JSON.stringify({ ext: \"").concat(rt,"\", command, args })); };"));}out.push("const _".concat(rt," = { ").concat(entries.join(', ')," };"));return out;}// The `simulator` driver for the stc12 runtime: turns the emitted program into the MCU
// side of **boundary A** (see reference/simulation-contract.md), talking to a board layer.
//
// The program says `turn on led1`; the board needs `setPin("P1.0", mode, driveHigh)`. Only
// the project knows that led1 is P1.0, is push-pull, and is wired ACTIVE LOW — so the pin
// table is emitted as data beside the driver. That inversion (`on` -> a 0 on an active-low
// pin) is the whole reason the board can then *show* why the naive wiring stays dark.
//
// The host supplies `bwBoard`; with none attached the driver stays neutral, so the program
// still runs standalone.
stc12SimulatorDriver(lang,pins){const table={};for(const p of pins){// 8051 pins are spelled P<port>.<bit>; board-class devices
// (Nano A4/D2, Pico GP0) carry their terminal name in `where`
// and have no port/bit — emitting the template anyway produced
// "Pundefined.undefined" and every setPin landed on a pin the
// board does not have.
const pin=p.port!==undefined?"P".concat(p.port,".").concat(p.bit):String(p.where||p.pin||p.name).toLowerCase();table[p.name]={pin,dir:p.direction,low:!!p.activeLow};}const json=JSON.stringify(table);// `set high`/`set low` are levels; `turn on`/`off` are states and respect the polarity.
const drive='const _drv = (p, st) => (st === "high" ? true : st === "low" ? false : ((st === "on") !== p.low));';const mode='const _mod = (p) => (p.dir === "output" ? "pushpull" : p.dir === "analog" ? "input" : "quasi");';// Boundary A is (pins, TIME). Driving pins without advancing the clock leaves the
// board frozen: the 20 ms brightness integrator never samples, RC never charges, and
// the buzzer has no edges to measure a period from. So a `wait` must move the clock —
// which means overriding the neutral `scratch.wait` the stage shim installs.
if(lang==='py'){return['# _stc12 driver — simulated board (boundary A). Supply `bw_board` to attach one.','import json',"_stc12_pins = json.loads(".concat(this.pyStr(json),")"),'class _Stc12Simulated:','    def _p(self, name): return _stc12_pins.get(name)','    def _mode(self, p): return "pushpull" if p["dir"] == "output" else ("input" if p["dir"] == "analog" else "quasi")','    def _drive(self, p, st): return True if st == "high" else False if st == "low" else ((st == "on") != p["low"])','    def setPin(self, name, state):','        p = self._p(name)','        if p and _board(): _board().setPin(p["pin"], self._mode(p), self._drive(p, state))','    def writePin(self, name, v):','        p = self._p(name)','        if p and _board(): _board().setPin(p["pin"], self._mode(p), bool(int(v)))','    def togglePin(self, name):','        p = self._p(name)','        if p and _board(): _board().setPin(p["pin"], self._mode(p), not _board().readPin(p["pin"]))','    def readPin(self, name):','        p = self._p(name)','        if not p or not _board(): return 0','        # An ANALOG pin reads volts from the board; the MCU scales to counts.','        if p["dir"] == "analog": return int(_board().readAnalog(p["pin"]) / 5.0 * 1023)','        return (not _board().readPin(p["pin"])) if p["low"] else _board().readPin(p["pin"])','    def setPwm(self, name, value):','        p = self._p(name)','        if p and _board(): _board().setPwm(p["pin"], int(value))','    def setTone(self, name, value):','        p = self._p(name)','        if p and _board(): _board().setTone(p["pin"], int(value))','    def setPort(self, name, value): pass  # TODO: whole-port sim','    def readPort(self, name): return 0  # TODO: whole-port sim','    def setPart(self, name, value): pass  # TODO: shift-register sim','    def print(self, value, mode):','        if mode == "text": print(value)','        else: print(int(value))','    def on(self, event, handler): pass','def _board(): return globals().get("bw_board")','_stc12 = _Stc12Simulated()','','# Simulated time. A wait advances the board clock; without this the board is frozen.','_bw_t = [0]','def _bw_wait(secs, *_a):','    _bw_t[0] += int(round(float(secs) * 1e9))','    b = _board()','    if b: b.advanceTo(_bw_t[0])','scratch.wait = _bw_wait'];}return['// _stc12 driver — simulated board (boundary A). Supply `bwBoard` to attach one.',"const _stc12_pins = ".concat(json,";"),drive,mode,'const _board = () => (typeof bwBoard !== "undefined" ? bwBoard : null);','const _stc12 = {','    setPin: (name, st) => { const p = _stc12_pins[name], b = _board();','        if (p && b) b.setPin(p.pin, _mod(p), _drv(p, st)); },','    writePin: (name, v) => { const p = _stc12_pins[name], b = _board();','        if (p && b) b.setPin(p.pin, _mod(p), !!Number(v)); },','    togglePin: (name) => { const p = _stc12_pins[name], b = _board();','        if (p && b) b.setPin(p.pin, _mod(p), !b.readPin(p.pin)); },','    readPin: (name) => { const p = _stc12_pins[name], b = _board();','        if (!p || !b) return 0;','        // An ANALOG pin reads volts from the board; the MCU scales to counts.','        if (p.dir === "analog") return Math.round(b.readAnalog(p.pin) / 5.0 * 1023);','        return p.low ? (b.readPin(p.pin) ? 0 : 1) : b.readPin(p.pin); },','    setPwm: (name, v) => { const p = _stc12_pins[name], b = _board();','        if (p && b && b.setPwm) b.setPwm(p.pin, Number(v)); },','    setTone: (name, v) => { const p = _stc12_pins[name], b = _board();','        if (p && b && b.setTone) b.setTone(p.pin, Number(v)); },','    setPort: (name, v) => {},',// TODO: whole-port sim
'    readPort: (name) => 0,',// TODO: whole-port sim
'    setPart: (name, v) => {},',// TODO: shift-register sim
'    print: (v, mode) => { console.log(mode === "text" ? v : Number(v)); },','    on: (event, handler) => {}','};','','// Simulated time. A wait advances the board clock; without this the board is frozen:','// the brightness integrator never samples and the buzzer has no edges to measure.','let _bw_t = 0n;','scratch.wait = (secs) => { _bw_t += BigInt(Math.round(Number(secs) * 1e9));','    const b = _board(); if (b) b.advanceTo(_bw_t); };','const _bw_now_ns = () => _bw_t;'];}// The circuit extension driver — boundary B exposed to Python/JS. Meter reporters
// sample at display rate (~60 Hz), not per edge (measured constraint from bw-board).
circuitSimulatorDriver(lang){// No-board returns NaN (stopgap) — visibly wrong, not a plausible 0.
// Greying out unavailable blocks per target is the real fix.
// Self-contained board lookup: the stc12 driver defines `_board`, but a project can
// use circuit blocks WITHOUT any stc12 pin block, and then `_board` would not exist
// (a ReferenceError/NameError on the first reporter). Own helper name, no collision
// when both drivers are emitted side by side.
if(lang==='py'){return['# _circuit driver — board instruments (boundary B). Supply `bw_board` to attach one.','# No-board reporters return float("nan") — visibly wrong, not a plausible 0.','def _circuit_board(): return globals().get("bw_board")','class _CircuitSimulated:','    def nodeVoltage(self, net):','        b = _circuit_board()','        return b.nodeVoltage(net) if b else float("nan")','    def branchCurrent(self, part):','        b = _circuit_board()','        return b.branchCurrent(part, "a") if b else float("nan")','    def resistance(self, a, b_net):','        b = _circuit_board()','        return b.resistance(a, b_net) if b else float("nan")','    def ledBrightness(self, part):','        b = _circuit_board()','        return b.ledBrightness(part) if b else float("nan")','    def buzzerTone(self, part):','        b = _circuit_board()','        if not b: return float("nan")','        r = b.buzzerTone(part)','        return r.get("hz", 0) if r.get("on") else 0','    def setControl(self, control, value):','        b = _circuit_board()','        if b: b.setControl(control, float(value))','    def setPower(self, state):','        b = _circuit_board()','        if b: b.setPower(state == "on")','_circuit = _CircuitSimulated()'];}return['// _circuit driver — board instruments (boundary B). Supply `bwBoard` to attach one.','// No-board reporters return NaN — visibly wrong, not a plausible 0.','// Stopgap: greying out unavailable blocks per target is the real fix.','const _circuit_board = () => (typeof bwBoard !== "undefined" ? bwBoard : null);','const _circuit = {','    nodeVoltage: (net) => { const b = _circuit_board(); return b ? b.nodeVoltage(net) : NaN; },','    branchCurrent: (part) => { const b = _circuit_board(); return b ? b.branchCurrent(part, "a") : NaN; },','    resistance: (a, bNet) => { const b = _circuit_board(); return b ? b.resistance(a, bNet) : NaN; },','    ledBrightness: (part) => { const b = _circuit_board(); return b ? b.ledBrightness(part) : NaN; },','    buzzerTone: (part) => { const b = _circuit_board(); if (!b) return NaN;','        const r = b.buzzerTone(part); return r && r.on ? r.hz : 0; },','    setControl: (control, v) => { const b = _circuit_board(); if (b) b.setControl(control, Number(v)); },','    setPower: (state) => { const b = _circuit_board(); if (b) b.setPower(state === "on"); }','};'];}// Device convenience blocks simulator driver — reads getDeviceState()
// from the board for reporters, forwards commands for actuators.
devicesSimulatorDriver(lang){if(lang==='py'){return['# _devices driver — reads device state from the board via getDeviceState().','class _DevicesSimulated:','    def _state(self, name):','        b = _board()','        return b.getDeviceState(str(name)) if b and hasattr(b, "getDeviceState") else None','    def servoAngle(self, s):','        st = self._state(s)','        return st.get("targetAngle", 0) if st else float("nan")','    def motorSpeed(self, m):','        st = self._state(m)','        return st.get("omega", 0) if st else float("nan")','    def motorDirection(self, m):','        st = self._state(m)','        return st.get("direction", "stopped") if st else "stopped"','    def deviceState(self, d):','        st = self._state(d)','        if not st: return "unknown"','        if "energized" in st: return "on" if st["energized"] else "off"','        return "unknown"','    def temperature(self, s):','        st = self._state(s)','        return st.get("temperature", float("nan")) if st else float("nan")','    def light(self, s):','        st = self._state(s)','        return st.get("lux", float("nan")) if st else float("nan")','    def distance(self, s):','        st = self._state(s)','        return st.get("distance", float("nan")) if st else float("nan")','    def flex(self, s):','        st = self._state(s)','        return st.get("flex", float("nan")) if st else float("nan")','    def force(self, s):','        st = self._state(s)','        return st.get("force", float("nan")) if st else float("nan")','    def irCode(self, s):','        st = self._state(s)','        return st.get("code", float("nan")) if st else float("nan")','    def pressed(self, b): return bool(self._state(b) and self._state(b).get("pressed"))','    def above(self, s, t): v = self._state(s); return float(v.get("value", 0) if v else 0) > float(t)','    def closer(self, s, d): v = self._state(s); return float(v.get("distance", 999) if v else 999) < float(d)','    def motion(self, s): return bool(self._state(s) and self._state(s).get("motion"))','    def tilted(self, s): return bool(self._state(s) and self._state(s).get("tilted"))','    def energised(self, d): return bool(self._state(d) and self._state(d).get("energized"))','    # Commands are forwarded to the board if it supports them.','    def setServo(self, s, a): pass','    def setMotor(self, m, s): pass','    def setDirection(self, m, d): pass','    def setRelay(self, r, s): pass','    def activate(self, d): pass','    def deactivate(self, d): pass','    def showDigit(self, d, n): pass','    def setRgb(self, l, r, g, b): pass','    def lcdPrint(self, d, t): pass','    def lcdCursor(self, d, r, c): pass','    def lcdClear(self, d): pass','    # oled: implemented (I2C bit-bang) in the JS driver; py parity is TODO','    def oledPrint(self, t, d): pass','    def oledCursor(self, r, c, d): pass','    def oledClear(self, d): pass','    def oledPixel(self, x, y, v, d): pass','    def setPixel(self, m, x, y, b): pass','    def clearMatrix(self, m): pass','    def setNeopixel(self, s, i, r, g, b): pass','    def clearNeopixels(self, s): pass','_devices = _DevicesSimulated()'];}return['// _devices driver — reads device state from the board via getDeviceState().','const _devices = {','    _state: (name) => { const b = _board(); return b && b.getDeviceState ? b.getDeviceState(String(name)) : null; },','    servoAngle: (s) => { const st = _devices._state(s); return st ? (st.targetAngle ?? 0) : NaN; },','    motorSpeed: (m) => { const st = _devices._state(m); return st ? (st.omega ?? 0) : NaN; },','    motorDirection: (m) => { const st = _devices._state(m); return st ? (st.direction ?? "stopped") : "stopped"; },','    deviceState: (d) => { const st = _devices._state(d); if (!st) return "unknown"; return ("energized" in st) ? (st.energized ? "on" : "off") : "unknown"; },','    temperature: (s) => { const st = _devices._state(s); return st ? (st.temperature ?? NaN) : NaN; },','    light: (s) => { const st = _devices._state(s); return st ? (st.lux ?? NaN) : NaN; },','    distance: (s) => { const st = _devices._state(s); return st ? (st.distance ?? NaN) : NaN; },','    flex: (s) => { const st = _devices._state(s); return st ? (st.flex ?? NaN) : NaN; },','    force: (s) => { const st = _devices._state(s); return st ? (st.force ?? NaN) : NaN; },','    irCode: (s) => { const st = _devices._state(s); return st ? (st.code ?? NaN) : NaN; },','    pressed: (b) => { const st = _devices._state(b); return !!(st && st.pressed); },','    above: (s, t) => { const st = _devices._state(s); return ((st && st.value) ?? 0) > Number(t); },','    closer: (s, d) => { const st = _devices._state(s); return ((st && st.distance) ?? 999) < Number(d); },','    motion: (s) => { const st = _devices._state(s); return !!(st && st.motion); },','    tilted: (s) => { const st = _devices._state(s); return !!(st && st.tilted); },','    energised: (d) => { const st = _devices._state(d); return !!(st && st.energized); },','    // Commands — no-ops in the simulator driver (the board handles them through pins)','    setServo: () => {}, setMotor: () => {}, setDirection: () => {}, setRelay: () => {},','    activate: () => {}, deactivate: () => {}, showDigit: () => {}, setRgb: () => {},','    setPixel: () => {}, clearMatrix: () => {}, setNeopixel: () => {}, clearNeopixels: () => {},','    // I2C displays are NOT side-channelled: the driver bit-bangs the','    // same wire protocol the C flavors emit, on the declared sda/scl','    // pins, and the board\'s SSD1306 / PCF8574+HD44780 models decode','    // the edges. Unwired or miswired sda/scl = dark display — which','    // is the lesson the simulator exists to teach.','    _i2c: () => {','        if (typeof _stc12_pins === "undefined") return null;','        const find = (n) => { for (const k in _stc12_pins) { if (k.toLowerCase() === n) return _stc12_pins[k]; } return null; };','        const sda = find("sda"), scl = find("scl"), b = _board();','        return (sda && scl && b) ? { sda, scl, b } : null; },','    _w: (i, p, v) => { i.b.setPin(p.pin, "pushpull", !!v); },',// FAST PATH: with Board#i2cInject present, a transaction is
// BUFFERED and handed to the device decoders whole — the
// bit-bang costs one full MNA solve per edge (~29k solves for
// a single display clear; the calculator's first frame outran
// the run budget, 2026-08-17). Boards without the API keep the
// true electrical waveform below.
'    _start: (i) => { if (i.b.i2cInject) { _devices._txn = []; return; }','        _devices._w(i, i.sda, 1); _devices._w(i, i.scl, 1); _devices._w(i, i.sda, 0); _devices._w(i, i.scl, 0); },','    _stopB: (i) => { if (_devices._txn) { const t = _devices._txn; _devices._txn = null; i.b.i2cInject(t);','        _devices._w(i, i.sda, 0); _devices._w(i, i.sda, 1); return; }  // one visible bus pulse per txn','        _devices._w(i, i.sda, 0); _devices._w(i, i.scl, 1); _devices._w(i, i.sda, 1); },','    _byte: (i, dat) => {','        if (_devices._txn) { _devices._txn.push(dat & 0xFF); return; }','        for (let k = 0; k < 8; k++) { _devices._w(i, i.sda, dat & 0x80); dat = (dat << 1) & 0xFF;','            _devices._w(i, i.scl, 1); _devices._w(i, i.scl, 0); }','        _devices._w(i, i.sda, 1); _devices._w(i, i.scl, 1); _devices._w(i, i.scl, 0); },  // ACK clock, unchecked','    // ── SSD1306 (0x3C): control 0x00 = command, 0x40 = data ──','    _oledCmd: (i, c) => { _devices._start(i); _devices._byte(i, 0x78); _devices._byte(i, 0x00); _devices._byte(i, c); _devices._stopB(i); },','    _oledData: (i, bytes) => { _devices._start(i); _devices._byte(i, 0x78); _devices._byte(i, 0x40);','        for (const d of bytes) _devices._byte(i, d); _devices._stopB(i); },','    _oledInit: (i) => { if (_devices._oledUp) return; _devices._oledUp = true;','        for (const c of [0xAE, 0x20, 0x02, 0xA1, 0xC8, 0x8D, 0x14, 0xAF]) _devices._oledCmd(i, c);','        _devices.oledClear(0); },','    _oledPageCol: (i, page, col) => { _devices._oledCmd(i, 0xB0 | (page & 0x07));','        _devices._oledCmd(i, col & 0x0F); _devices._oledCmd(i, 0x10 | ((col >> 4) & 0x0F)); },',"    _font5x7: [0,0,0,0,0,0,0,95,0,0,0,7,0,7,0,20,127,20,127,20,36,42,127,42,18,35,19,8,100,98,54,73,85,34,80,0,5,3,0,0,0,28,34,65,0,0,65,34,28,0,20,8,62,8,20,8,8,62,8,8,0,80,48,0,0,8,8,8,8,8,0,96,96,0,0,32,16,8,4,2,62,81,73,69,62,0,66,127,64,0,66,97,81,73,70,33,65,69,75,49,24,20,18,127,16,39,69,69,69,57,60,74,73,73,48,1,113,9,5,3,54,73,73,73,54,6,73,73,41,30,0,54,54,0,0,0,86,54,0,0,8,20,34,65,0,20,20,20,20,20,0,65,34,20,8,2,1,81,9,6,50,73,121,65,62,126,17,17,17,126,127,73,73,73,54,62,65,65,65,34,127,65,65,34,28,127,73,73,73,65,127,9,9,9,1,62,65,73,73,122,127,8,8,8,127,0,65,127,65,0,32,64,65,63,1,127,8,20,34,65,127,64,64,64,64,127,2,12,2,127,127,4,8,16,127,62,65,65,65,62,127,9,9,9,6,62,65,81,33,94,127,9,25,41,70,70,73,73,73,49,1,1,127,1,1,63,64,64,64,63,31,32,64,32,31,63,64,56,64,63,99,20,8,20,99,7,8,112,8,7,97,81,73,69,67,0,127,65,65,0,2,4,8,16,32,0,65,65,127,0,4,2,1,2,4,64,64,64,64,64,0,1,2,4,0,32,84,84,84,120,127,72,68,68,56,56,68,68,68,32,56,68,68,72,127,56,84,84,84,24,8,126,9,1,2,12,82,82,82,62,127,8,4,4,120,0,68,125,64,0,32,64,68,61,0,127,16,40,68,0,0,65,127,64,0,124,4,24,4,120,124,8,4,4,120,56,68,68,68,56,124,20,20,20,8,8,20,20,24,124,124,8,4,4,8,72,84,84,84,32,4,63,68,64,32,60,64,64,32,124,28,32,64,32,28,60,64,48,64,60,68,40,16,40,68,12,80,80,80,60,68,100,84,76,68,0,8,54,65,0,0,0,127,0,0,0,65,54,8,0,16,8,8,16,8],",'    oledClear: (d) => { const i = _devices._i2c(); if (!i) return; _devices._oledInit(i);','        for (const c of [0x20, 0x00, 0x21, 0x00, 0x7F, 0x22, 0x00, 0x07]) _devices._oledCmd(i, c);','        _devices._oledData(i, new Uint8Array(1024));','        _devices._oledCmd(i, 0x20); _devices._oledCmd(i, 0x02);','        _devices._oledPageCol(i, 0, 0); },','    oledCursor: (r, c, d) => { const i = _devices._i2c(); if (!i) return; _devices._oledInit(i);','        _devices._oledPageCol(i, Number(r) & 0x07, (Number(c) * 6) & 0x7F); },','    oledPrint: (t, d) => { const i = _devices._i2c(); if (!i) return; _devices._oledInit(i);','        for (const ch of String(t)) { let c = ch.charCodeAt(0);','            if (c < 0x20 || c > 0x7E) c = 0x20;','            const idx = (c - 0x20) * 5;','            _devices._oledData(i, _devices._font5x7.slice(idx, idx + 5).concat([0x00])); } },','    oledPixel: (x, y, v, d) => { const i = _devices._i2c(); if (!i) return; _devices._oledInit(i);','        _devices._oledPageCol(i, (Number(y) >> 3) & 0x07, Number(x) & 0x7F);','        _devices._oledData(i, [Number(v) ? (1 << (Number(y) & 7)) : 0x00]); },','    // ── HD44780 via PCF8574 backpack (0x27): D7 D6 D5 D4 BL EN RW RS ──','    _lcdSend: (i, val) => { _devices._start(i); _devices._byte(i, 0x4E); _devices._byte(i, val); _devices._stopB(i); },','    _lcdNib: (i, nib, rs) => { const v = (nib & 0xF0) | 0x08 | rs;','        _devices._lcdSend(i, v | 0x04); _devices._lcdSend(i, v & ~0x04); },','    _lcdCmd: (i, c) => { _devices._lcdNib(i, c & 0xF0, 0); _devices._lcdNib(i, (c << 4) & 0xF0, 0); },','    _lcdData: (i, c) => { _devices._lcdNib(i, c & 0xF0, 1); _devices._lcdNib(i, (c << 4) & 0xF0, 1); },','    _lcdInit: (i) => { if (_devices._lcdUp) return; _devices._lcdUp = true;','        _devices._lcdNib(i, 0x30, 0); _devices._lcdNib(i, 0x30, 0); _devices._lcdNib(i, 0x30, 0);','        _devices._lcdNib(i, 0x20, 0);','        for (const c of [0x28, 0x0C, 0x06, 0x01]) _devices._lcdCmd(i, c); },','    lcdPrint: (t, d) => { const i = _devices._i2c(); if (!i) return; _devices._lcdInit(i);','        for (const ch of String(t)) _devices._lcdData(i, ch.charCodeAt(0) & 0xFF); },','    lcdCursor: (r, c, d) => { const i = _devices._i2c(); if (!i) return; _devices._lcdInit(i);','        _devices._lcdCmd(i, 0x80 | ((Number(r) & 1) ? 0x40 : 0x00) | (Number(c) & 0x0F)); },','    lcdClear: (d) => { const i = _devices._i2c(); if (!i) return; _devices._lcdInit(i);','        _devices._lcdCmd(i, 0x01); },','};'];}// LED cube simulator driver — a frame buffer that records voxel state.
// The board's led_cube kind reads scan history from it if attached.
ledcubeSimulatorDriver(lang){const cube=this.project&&this.project.stc&&this.project.stc.ledcube||{size:4,selects:8};const S=cube.selects;const N=cube.size;if(lang==='py'){return["# _ledcube driver \u2014 ".concat(N,"x").concat(N,"x").concat(N," frame buffer."),"_ledcube_frame = [0] * ".concat(S),'class _LedcubeDriver:',"    def _addr(self, x, y, z, c=1): return (z * 2 + (1 if c > 1 else 0), y * ".concat(N," + x)"),'    def setVoxel(self, x, y, z, c):','        s, b = self._addr(int(x), int(y), int(z), int(c))',"        if 0 <= s < ".concat(S," and 0 <= b < 8:"),"            _ledcube_frame[s] = (_ledcube_frame[s] | (1 << b)) if c else (_ledcube_frame[s] & ~(1 << b))",'    def clearVoxel(self, x, y, z): self.setVoxel(int(x), int(y), int(z), 0)',"    def fillLayer(self, layer, c):","        s = int(layer) * 2 + (1 if int(c) > 1 else 0)","        if 0 <= s < ".concat(S,": _ledcube_frame[s] = 0xFF if c else 0"),"    def fillColumn(self, x, y, c):","        for z in range(".concat(N,"): self.setVoxel(int(x), int(y), z, int(c))"),"    def fillWall(self, z, c):","        for y in range(".concat(N,"):"),"            for x in range(".concat(N,"): self.setVoxel(x, y, int(z), int(c))"),"    def clear(self):","        for i in range(".concat(S,"): _ledcube_frame[i] = 0"),"    def invert(self):","        for i in range(".concat(S,"): _ledcube_frame[i] = _ledcube_frame[i] ^ 0xFF"),'    def shift(self, d): pass  # direction shift — needs voxel map',"    def hold(self, ms): scratch.wait(float(ms) / 1000)",'    def readVoxel(self, x, y, z):','        s, b = self._addr(int(x), int(y), int(z))',"        if 0 <= s < ".concat(S," and 0 <= b < 8: return (_ledcube_frame[s] >> b) & 1"),'        return 0','_ledcube = _LedcubeDriver()'];}return["// _ledcube driver \u2014 ".concat(N,"x").concat(N,"x").concat(N," frame buffer."),"const _ledcube_frame = new Uint8Array(".concat(S,");"),'const _ledcube = {',"    _addr: (x, y, z, c = 1) => [z * 2 + (c > 1 ? 1 : 0), y * ".concat(N," + x],"),'    setVoxel: (x, y, z, c) => { const [s, b] = _ledcube._addr(x, y, z, c);',"        if (s >= 0 && s < ".concat(S," && b >= 0 && b < 8)"),'            _ledcube_frame[s] = c ? (_ledcube_frame[s] | (1 << b)) : (_ledcube_frame[s] & ~(1 << b)); },','    clearVoxel: (x, y, z) => _ledcube.setVoxel(x, y, z, 0),',"    fillLayer: (layer, c) => { const s = layer * 2 + (c > 1 ? 1 : 0);","        if (s >= 0 && s < ".concat(S,") _ledcube_frame[s] = c ? 0xFF : 0; },"),"    fillColumn: (x, y, c) => { for (let z = 0; z < ".concat(N,"; z++) _ledcube.setVoxel(x, y, z, c); },"),"    fillWall: (z, c) => { for (let y = 0; y < ".concat(N,"; y++) for (let x = 0; x < ").concat(N,"; x++) _ledcube.setVoxel(x, y, z, c); },"),"    clear: () => { _ledcube_frame.fill(0); },","    invert: () => { for (let i = 0; i < ".concat(S,"; i++) _ledcube_frame[i] ^= 0xFF; },"),'    shift: (d) => {},  // direction shift — needs voxel map','    hold: (ms) => { scratch.wait(ms / 1000); },','    readVoxel: (x, y, z) => { const [s, b] = _ledcube._addr(x, y, z);',"        return (s >= 0 && s < ".concat(S," && b >= 0 && b < 8) ? (_ledcube_frame[s] >> b) & 1 : 0; },"),'};'];}// Attach any buffered `# comment` to a freshly created block as a Scratch block
// comment (stored on the target, referenced by the block) so it survives to decompile.
attachPendingComment(target,block,blockId){if(!this._pendingComment||!block)return;const cid="cmt_".concat(this._commentSeq++);if(!target.comments)target.comments={};target.comments[cid]={// minimized: an OPEN comment bubble must be positioned by Blockly
// the moment the workspace renders, and on a hidden workspace
// (project loaded while another tab is active) positionBubble_
// dereferences null and crashes the GUI (2026-08-10, examples
// 05-08). A minimized comment renders as an icon, no bubble, and
// the reader expands it when they actually want it.
blockId,x:0,y:0,width:200,height:100,minimized:true,text:this._pendingComment};block.comment=cid;this._pendingComment='';}// Determine if a variable should be global.
// Explicit GLOBAL/LOCAL declarations win; otherwise fall back to the legacy
// magic-name list (kept only for backwards compatibility) or Stage scope.
isGlobalVariable(name,target){if(this.declaredLocals.has("".concat(target.name,":").concat(name)))return false;if(this.declaredGlobals.has(name))return true;if(target.isStage)return true;const globalVars=['health','score','game active','speed','lives','level','time','points'];return globalVars.includes(name.toLowerCase());}isGlobalList(name,target){if(this.declaredLocalLists.has("".concat(target.name,":").concat(name)))return false;if(this.declaredGlobalLists.has(name))return true;return target.isStage;}getOrCreateVariable(name,target){const isGlobal=this.isGlobalVariable(name,target);const scope=isGlobal?'Stage':target.name;const key="".concat(scope,":").concat(name);if(!this.variables.has(key)){const id=this.generateId();this.variables.set(key,{id,name,isGlobal});const varTarget=isGlobal?this.project.targets.find(t=>t.isStage):target;if(varTarget){if(!varTarget.variables)varTarget.variables={};varTarget.variables[id]=[name,0];// Create monitor for global variables
if(isGlobal){this.createMonitor(id,name,'data_variable');}}}return this.variables.get(key);}getOrCreateList(name,target){const isGlobal=this.isGlobalList(name,target);const scope=isGlobal?'Stage':target.name;const key="".concat(scope,":").concat(name);if(!this.lists.has(key)){const id=this.generateId();this.lists.set(key,{id,name,isGlobal});const listTarget=isGlobal?this.project.targets.find(t=>t.isStage):target;if(listTarget){if(!listTarget.lists)listTarget.lists={};listTarget.lists[id]=[name,[]];this.createMonitor(id,name,'data_listcontents');}}return this.lists.get(key);}// Does a variable already exist in scope? Used to disambiguate reporter phrases
// (e.g. `size`) from user variables of the same name.
variableExists(name,target){return this.variables.has("Stage:".concat(name))||this.variables.has("".concat(target.name,":").concat(name));}listExists(name,target){return this.lists.has("Stage:".concat(name))||this.lists.has("".concat(target.name,":").concat(name));}getOrCreateBroadcast(name){if(!this.broadcasts.has(name)){const id=this.generateId();this.broadcasts.set(name,id);const stage=this.project.targets.find(t=>t.isStage);if(stage){if(!stage.broadcasts)stage.broadcasts={};stage.broadcasts[id]=name;}}return{id:this.broadcasts.get(name),name};}// Set a monitor's initial on-stage visibility (used by show/hide commands so
// the display state matches the author's intent from frame 0, not just after
// the runtime show/hide block fires).
setMonitorVisible(varId,visible){const m=this.project.monitors.find(mon=>mon.id===varId);if(m)m.visible=visible;}createMonitor(varId,varName){let opcode=arguments.length>2&&arguments[2]!==undefined?arguments[2]:'data_variable';if(this.project.monitors.find(m=>m.id===varId))return;const isList=opcode==='data_listcontents';const monitorY=5+this.project.monitors.length*28;this.project.monitors.push({id:varId,mode:isList?"list":"default",opcode,params:isList?{LIST:varName}:{VARIABLE:varName},spriteName:null,value:isList?[]:0,width:isList?100:0,height:isList?120:0,x:5,y:monitorY,// Hidden by default — games use lots of internal state (loop counters,
// board cells) that shouldn't clutter the stage. Use `show variable X`
// / `show list X` to display one.
visible:false,sliderMin:0,sliderMax:100,isDiscrete:true});}// Create shadow block for dropdown menus
createShadowBlock(opcode,fieldName,value,parentId){const shadowId=this.generateId();const shadowOpcode=this.getShadowOpcode(opcode,fieldName);return{id:shadowId,block:{opcode:shadowOpcode,next:null,parent:parentId,inputs:{},fields:{[fieldName]:[value,null]},shadow:true,topLevel:false}};}getShadowOpcode(parentOpcode,fieldName){const shadowMap={'KEY_OPTION':'sensing_keyoptions','TOUCHINGOBJECTMENU':'sensing_touchingobjectmenu','DISTANCETOMENU':'sensing_distancetomenu','BACKDROP':'event_whenbackdropswitchesto_menu','BROADCAST_OPTION':'event_broadcast_menu','STOP_OPTION':'control_stop_menu','CLONE_OPTION':'control_create_clone_of_menu'};return shadowMap[fieldName]||parentOpcode+'_menu';}createBlock(opcode){let options=arguments.length>1&&arguments[1]!==undefined?arguments[1]:{};const id=this.generateId();const block=_objectSpread({opcode,next:null,parent:null,inputs:{},fields:{},shadow:false,topLevel:false},options);return{id,block:{[id]:block}};}// ---- Expression engine helpers -------------------------------------------------
// Register a reporter/boolean block and return its id.
pushBlock(context,opcode){let inputs=arguments.length>2&&arguments[2]!==undefined?arguments[2]:{};let fields=arguments.length>3&&arguments[3]!==undefined?arguments[3]:{};const id=this.generateId();context.extraBlocks[id]={opcode,parent:context.parentId,next:null,shadow:false,topLevel:false,inputs,fields};return id;}// Register a dropdown menu shadow block and return an input array [1, id].
menuInput(context,opcode,field,value){const id=this.generateId();context.extraBlocks[id]={opcode,parent:context.parentId,next:null,shadow:true,topLevel:false,inputs:{},fields:{[field]:[value,null]}};return[1,id];}valueOfBlock(id){return[3,id,[4,"0"]];}// Index of the ')' matching the '(' at position `open`, or -1.
matchParen(s,open){let depth=0,inStr=false;for(let i=open;i<s.length;i++){const c=s[i];if(c==='"'){inStr=!inStr;continue;}if(inStr)continue;if(c==='(')depth++;else if(c===')'){depth--;if(depth===0)return i;}}return-1;}stripOuterParens(s){s=s.trim();while(s.startsWith('(')&&this.matchParen(s,0)===s.length-1){s=s.slice(1,-1).trim();}return s;}prevMeaningful(s,i){for(let j=i-1;j>=0;j--){if(s[j]!==' ')return s[j];}return null;}// Split `s` at the rightmost top-level occurrence of any operator in `ops`
// (left-associative). Respects parentheses and quotes. Returns {left,right,op} or null.
splitBinary(s,ops){let opts=arguments.length>2&&arguments[2]!==undefined?arguments[2]:{};const ci=!!opts.ci;let depth=0,inStr=false,best=null;for(let i=0;i<s.length;i++){const ch=s[i];if(ch==='"'){inStr=!inStr;continue;}if(inStr)continue;if(ch==='('){depth++;continue;}if(ch===')'){depth--;continue;}if(depth!==0)continue;for(const op of ops){const seg=s.substr(i,op.length);if(ci?seg.toLowerCase()!==op.toLowerCase():seg!==op)continue;if(op==='+'||op==='-'){const prev=this.prevMeaningful(s,i);if(prev===null||'+-*/(,'.includes(prev))continue;// unary sign, not a binary op
}if(op==='<'&&s[i+1]==='=')continue;if(op==='>'&&s[i+1]==='=')continue;if(op==='='&&(s[i-1]==='<'||s[i-1]==='>'||s[i+1]==='='))continue;if(!s.slice(0,i).trim()||!s.slice(i+op.length).trim())continue;best={index:i,op};}}if(!best)return null;return{left:s.slice(0,best.index).trim(),right:s.slice(best.index+best.op.length).trim(),op:best.op.trim()};}// Parse a numeric/string value expression into a Scratch input array.
parseValue(valueStr,context){let s=this.stripOuterParens((valueStr||'').trim());// Literals
if(/^-?\d+(\.\d+)?$/.test(s))return[1,[4,s]];// Hex, because a bit mask is unreadable in decimal and firmware is written in them.
if(/^0[xX][0-9a-fA-F]+$/.test(s))return[1,[4,String(parseInt(s,16))]];if(s.length>=2&&s.startsWith('"')&&s.endsWith('"')&&this.matchQuote(s)===s.length-1){return[1,[10,s.slice(1,-1)]];}if(/^(true|false)$/i.test(s))return[1,[10,s.toLowerCase()]];if(/^#[0-9a-fA-F]{6}$/.test(s))return[1,[9,s.toLowerCase()]];// Bounded reporters (item/letter/pick random) are recognized before operator
// splitting: their trailing `of`/`to`/`in` keyword bounds an index/argument
// expression that may itself contain operators (e.g. `item (r*8+c)+1 of board`).
// Unbounded reporters (abs/round/…) stay after operators so that
// `abs of vx * -1` keeps its `(abs of vx) * -1` meaning.
if(/^(item|letter|pick random)\b/i.test(s)){const early=this.parseReporter(s,context);if(early)return early;}// Binary operators, loosest binding first
let sp;if(sp=this.splitBinary(s,[' join '])){return this.valueOfBlock(this.pushBlock(context,'operator_join',{STRING1:this.parseValue(sp.left,context),STRING2:this.parseValue(sp.right,context)}));}// Prefix join: `join X Y` (no leading space — splitBinary misses it)
if(/^join\s/i.test(s)){const inner=s.slice(4).trim();const sp2=this.splitBinary(inner,[' ']);if(sp2){return this.valueOfBlock(this.pushBlock(context,'operator_join',{STRING1:this.parseValue(sp2.left,context),STRING2:this.parseValue(sp2.right,context)}));}}if(sp=this.splitBinary(s,['+','-'])){const op=sp.op==='+'?'operator_add':'operator_subtract';return this.valueOfBlock(this.pushBlock(context,op,{NUM1:this.parseValue(sp.left,context),NUM2:this.parseValue(sp.right,context)}));}if(sp=this.splitBinary(s,['*','/',' mod '])){const op=sp.op==='*'?'operator_multiply':sp.op==='/'?'operator_divide':'operator_mod';return this.valueOfBlock(this.pushBlock(context,op,{NUM1:this.parseValue(sp.left,context),NUM2:this.parseValue(sp.right,context)}));}// Unary minus applied to a non-literal (e.g. `-score`)
if(s.startsWith('-')&&s.length>1){return this.valueOfBlock(this.pushBlock(context,'operator_subtract',{NUM1:[1,[4,"0"]],NUM2:this.parseValue(s.slice(1).trim(),context)}));}// Reporter phrases
const reporter=this.parseReporter(s,context);if(reporter)return reporter;// Identifier -> list or variable reporter
if(/^[a-zA-Z_][a-zA-Z0-9_\s]*$/.test(s)){if(this.listExists(s,context.target)){const list=this.getOrCreateList(s,context.target);return[3,[13,list.name,list.id],[10,""]];}const variable=this.getOrCreateVariable(s,context.target);return[3,[12,variable.name,variable.id],[10,""]];}// Fallback: string literal
return[1,[10,s]];}matchQuote(s){for(let i=1;i<s.length;i++){if(s[i]==='"')return i;}return-1;}// Reporter phrases (blocks that report a value). Returns an input array or null.
parseReporter(s,context){var _this=this;const B=function B(op){let inputs=arguments.length>1&&arguments[1]!==undefined?arguments[1]:{};let fields=arguments.length>2&&arguments[2]!==undefined?arguments[2]:{};return _this.valueOfBlock(_this.pushBlock(context,op,inputs,fields));};let m;// Custom-block parameters resolve to argument reporters inside their definition.
if(this.currentProcArgs&&this.currentProcArgs.has(s)){const arg=this.currentProcArgs.get(s);const op=arg.type==='b'?'argument_reporter_boolean':'argument_reporter_string_number';return B(op,{},{VALUE:[s,null]});}// STC12 pin read: digital level, or the 10-bit ADC value for an ANALOG pin.
if((m=s.match(/^read\s+([A-Za-z_]\w*)$/i))&&this.stcPin(m[1])){return B('stc12_read',{},{PIN:[this.stcPin(m[1]).name,null]});}// STC12 port read: the whole 8-bit port value.
if((m=s.match(/^read\s+([A-Za-z_]\w*)$/i))&&this.stcPort(m[1])){return B('stc12_readport',{},{PORT:[this.stcPort(m[1]).name,null]});}// TABLE lookup: table[index] — a constant byte from code-space flash.
if((m=s.match(/^([A-Za-z_]\w*)\[(.+)\]$/))&&this.stcTable(m[1])){return B('stc12_tableindex',{INDEX:this.parseValue(m[2],context)},{TABLE:[this.stcTable(m[1]).name,null]});}// Circuit extension reporters (boundary B instruments).
if(m=s.match(/^voltage at\s+(.+)$/i)){return B('circuit_nodevoltage',{NET:this.parseValue(m[1],context)});}if(m=s.match(/^current through\s+(.+)$/i)){return B('circuit_branchcurrent',{PART:this.parseValue(m[1],context)});}if(m=s.match(/^resistance between\s+(.+?)\s+and\s+(.+)$/i)){return B('circuit_resistance',{A:this.parseValue(m[1],context),B:this.parseValue(m[2],context)});}if(m=s.match(/^brightness of\s+(.+)$/i)){return B('circuit_ledbrightness',{PART:this.parseValue(m[1],context)});}if(m=s.match(/^tone of\s+(.+)$/i)){return B('circuit_buzzertone',{PART:this.parseValue(m[1],context)});}// LED cube voxel read: voxel <x> <y> <z>
if((m=s.match(/^voxel\s+(.+?)\s+(.+?)\s+(.+)$/i))&&this.project&&this.project.stc&&this.project.stc.ledcube){return B('ledcube_readvoxel',{X:this.parseValue(m[1],context),Y:this.parseValue(m[2],context),Z:this.parseValue(m[3],context)});}// Device reporters
if(m=s.match(/^temperature from\s+(.+)$/i)){return B('devices_temperature',{SENSOR:this.parseValue(m[1],context)});}if(m=s.match(/^light from\s+(.+)$/i)){return B('devices_light',{SENSOR:this.parseValue(m[1],context)});}if(m=s.match(/^angle of\s+(.+)$/i)){return B('devices_servoangle',{SERVO:this.parseValue(m[1],context)});}if(m=s.match(/^distance from\s+(.+)$/i)){return B('devices_distance',{SENSOR:this.parseValue(m[1],context)});}if(m=s.match(/^speed of\s+(.+)$/i)){return B('devices_motorspeed',{MOTOR:this.parseValue(m[1],context)});}if(m=s.match(/^direction of\s+(.+)$/i)){return B('devices_motordirection',{MOTOR:this.parseValue(m[1],context)});}if(m=s.match(/^state of\s+(.+)$/i)){return B('devices_devicestate',{DEVICE:this.parseValue(m[1],context)});}if(m=s.match(/^flex of\s+(.+)$/i)){return B('devices_flex',{SENSOR:this.parseValue(m[1],context)});}if(m=s.match(/^force on\s+(.+)$/i)){return B('devices_force',{SENSOR:this.parseValue(m[1],context)});}if(m=s.match(/^ir code from\s+(.+)$/i)){return B('devices_ircode',{SENSOR:this.parseValue(m[1],context)});}if(m=s.match(/^pick random\s+(.+)$/i)){const parts=this.splitBinary(m[1],[' to '],{ci:true});if(parts){return B('operator_random',{FROM:this.parseValue(parts.left,context),TO:this.parseValue(parts.right,context)});}}if(m=s.match(/^round\s+(.+)$/i)){return B('operator_round',{NUM:this.parseValue(m[1],context)});}// Bitwise. Scratch has none, and that absence is what made half the real 8051
// firmware in the corpus untranslatable — masking a port, setting one bit, shifting
// a reading. Worded like `mod` and `join` rather than punctuated, so pseudocode
// still reads aloud.
if(m=s.match(/^bitnot\s+(.+)$/i))return B('bitops_not',{NUM:this.parseValue(m[1],context)});for(const[word,op]of[['bitand','and'],['bitor','or'],['bitxor','xor'],['shiftleft','shl'],['shiftright','shr']]){const sp=this.splitBinary(s,[" ".concat(word," ")],{ci:true});if(sp){return B("bitops_".concat(op),{NUM1:this.parseValue(sp.left,context),NUM2:this.parseValue(sp.right,context)});}}// Planète Maths distinctive reporters (no standard equivalent). syncExtensions
// auto-declares the `planetemaths` extension from these opcodes.
if(m=s.match(/^factorial of\s+(.+)$/i))return B('planetemaths_factorial',{NUM1:this.parseValue(m[1],context)});if(m=s.match(/^sum of digits of\s+(.+)$/i))return B('planetemaths_sommechiffres',{NUM1:this.parseValue(m[1],context)});if(m=s.match(/^min of\s+(.+?)\s+and\s+(.+)$/i))return B('planetemaths_min',{NUM1:this.parseValue(m[1],context),NUM2:this.parseValue(m[2],context)});if(m=s.match(/^max of\s+(.+?)\s+and\s+(.+)$/i))return B('planetemaths_max',{NUM1:this.parseValue(m[1],context),NUM2:this.parseValue(m[2],context)});if(m=s.match(/^(.+?)\s+to the power of\s+(.+)$/i))return B('planetemaths_pow',{NUM1:this.parseValue(m[1],context),NUM2:this.parseValue(m[2],context)});if(/^pi$/i.test(s)&&!this.variableExists('pi',context.target))return B('planetemaths_nombre_pi',{});if(/^euler$/i.test(s)&&!this.variableExists('euler',context.target))return B('planetemaths_nombre_e',{});// Arrays & Vectors reporters (anchored on `array "NAME"`; 0-based).
if(/\barray\s+"/.test(s)){const aN=n=>[1,[10,n]];// 2D / matrix reporters. get2D first, so `item row R col C of array` isn't
// mis-parsed as a 1D `item <index> of array`.
if(m=s.match(/^item\s+row\s+(.+?)\s+col\s+(.+?)\s+of array\s+"([^"]*)"$/i))return B('arrays_get2D',{NAME:aN(m[3]),ROW:this.parseValue(m[1],context),COL:this.parseValue(m[2],context)});if(m=s.match(/^transpose of array\s+"([^"]*)"$/i))return B('arrays_transpose',{NAME:aN(m[1])});if(m=s.match(/^reshape array\s+"([^"]*)"\s+to\s+(.+)$/i))return B('arrays_reshape',{NAME:aN(m[1]),SHAPE:[1,[10,m[2].trim()]]});// functional reporters (FUNC is a quoted JS arrow string; emitted as a Python lambda / raw JS)
if(m=s.match(/^map\s+"([^"]*)"\s+over array\s+"([^"]*)"$/i))return B('arrays_map',{NAME:aN(m[2]),FUNC:[1,[10,m[1]]]});if(m=s.match(/^filter array\s+"([^"]*)"\s+by\s+"([^"]*)"$/i))return B('arrays_filter',{NAME:aN(m[1]),FUNC:[1,[10,m[2]]]});if(m=s.match(/^reduce array\s+"([^"]*)"\s+with\s+"([^"]*)"\s+from\s+(.+)$/i))return B('arrays_reduce',{NAME:aN(m[1]),FUNC:[1,[10,m[2]]],INIT:this.parseValue(m[3],context)});if(m=s.match(/^item\s+(.+?)\s+of array\s+"([^"]*)"$/i))return B('arrays_get',{NAME:aN(m[2]),INDEX:this.parseValue(m[1],context)});if(m=s.match(/^pop from array\s+"([^"]*)"$/i))return B('arrays_pop',{NAME:aN(m[1])});if(m=s.match(/^length of array\s+"([^"]*)"$/i))return B('arrays_length',{NAME:aN(m[1])});if(m=s.match(/^sum of array\s+"([^"]*)"$/i))return B('arrays_sum',{NAME:aN(m[1])});if(m=s.match(/^(?:mean|average) of array\s+"([^"]*)"$/i))return B('arrays_mean',{NAME:aN(m[1])});if(m=s.match(/^smallest of array\s+"([^"]*)"$/i))return B('arrays_min',{NAME:aN(m[1])});if(m=s.match(/^largest of array\s+"([^"]*)"$/i))return B('arrays_max',{NAME:aN(m[1])});if(m=s.match(/^index of\s+(.+?)\s+in array\s+"([^"]*)"$/i))return B('arrays_indexOf',{NAME:aN(m[2]),VALUE:this.parseValue(m[1],context)});if(m=s.match(/^reverse of array\s+"([^"]*)"$/i))return B('arrays_reverse',{NAME:aN(m[1])});if(m=s.match(/^flatten of array\s+"([^"]*)"$/i))return B('arrays_flatten',{NAME:aN(m[1])});if(m=s.match(/^sort of array\s+"([^"]*)"\s+(ascending|descending)$/i))return B('arrays_sort',{NAME:aN(m[1])},{ORDER:[m[2].toLowerCase(),null]});if(m=s.match(/^slice of array\s+"([^"]*)"\s+from\s+(.+?)\s+to\s+(.+)$/i))return B('arrays_slice',{NAME:aN(m[1]),START:this.parseValue(m[2],context),END:this.parseValue(m[3],context)});if(m=s.match(/^array\s+"([^"]*)"\s+as text$/i))return B('arrays_toJSON',{NAME:aN(m[1])});}if(m=s.match(/^(abs|floor|ceiling|sqrt|sin|cos|tan|asin|acos|atan|ln|log)\s+of\s+(.+)$/i)){return B('operator_mathop',{NUM:this.parseValue(m[2],context)},{OPERATOR:[m[1].toLowerCase(),null]});}if(m=s.match(/^letter\s+(.+?)\s+of\s+(.+)$/i)){return B('operator_letter_of',{LETTER:this.parseValue(m[1],context),STRING:this.parseValue(m[2],context)});}if(m=s.match(/^item\s+#\s+of\s+(.+)\s+in\s+(.+)$/i)){const list=this.getOrCreateList(m[2].trim(),context.target);return B('data_itemnumoflist',{ITEM:this.parseValue(m[1],context)},{LIST:[list.name,list.id]});}if((m=s.match(/^item\s+(.+?)\s+of\s+(.+)$/i))&&this.listExists(m[2].trim(),context.target)){const list=this.getOrCreateList(m[2].trim(),context.target);return B('data_itemoflist',{INDEX:this.parseValue(m[1],context)},{LIST:[list.name,list.id]});}if(m=s.match(/^length of\s+(.+)$/i)){const arg=m[1].trim();if(this.listExists(arg,context.target)){const list=this.getOrCreateList(arg,context.target);return B('data_lengthoflist',{},{LIST:[list.name,list.id]});}return B('operator_length',{STRING:this.parseValue(arg,context)});}if(m=s.match(/^distance to\s+(.+)$/i)){const target=/^mouse(-pointer)?$/i.test(m[1].trim())?'_mouse_':m[1].trim();return B('sensing_distanceto',{DISTANCETOMENU:this.menuInput(context,'sensing_distancetomenu','DISTANCETOMENU',target)});}// [property] of [Sprite|Stage] -> sensing_of (only when the object is a real target).
if((m=s.match(/^(.+?)\s+of\s+(.+)$/i))&&this.targetExists(m[2].trim())){const objName=m[2].trim();const object=/^stage$/i.test(objName)?'_stage_':objName;const propMap={'x position':'x position','y position':'y position','direction':'direction','costume number':'costume #','costume name':'costume name','size':'size','volume':'volume','backdrop number':'backdrop #','backdrop name':'backdrop name'};const prop=propMap[m[1].trim().toLowerCase()]||m[1].trim();return B('sensing_of',{OBJECT:this.menuInput(context,'sensing_of_object_menu','OBJECT',object)},{PROPERTY:[prop,null]});}// current date/time
if(m=s.match(/^current (year|month|date|hour|minute|second)$/i)){return B('sensing_current',{},{CURRENTMENU:[m[1].toUpperCase(),null]});}if(/^day of week$/i.test(s))return B('sensing_current',{},{CURRENTMENU:['DAYOFWEEK',null]});// Zero-argument reporters. Single ambiguous words defer to an existing variable.
const simple={'x position':'motion_xposition','y position':'motion_yposition','mouse x':'sensing_mousex','mouse y':'sensing_mousey','days since 2000':'sensing_dayssince2000'};const key=s.toLowerCase();if(simple[key])return B(simple[key]);if(key==='answer')return B('sensing_answer');if(key==='timer')return B('sensing_timer');if(key==='loudness')return B('sensing_loudness');if(key==='username')return B('sensing_username');if(key==='costume number')return B('looks_costumenumbername',{},{NUMBER_NAME:['number',null]});if(key==='costume name')return B('looks_costumenumbername',{},{NUMBER_NAME:['name',null]});if(key==='backdrop number')return B('looks_backdropnumbername',{},{NUMBER_NAME:['number',null]});if(key==='backdrop name')return B('looks_backdropnumbername',{},{NUMBER_NAME:['name',null]});const ambiguous={direction:'motion_direction',size:'looks_size',volume:'sound_volume'};if(ambiguous[key]&&!this.variableExists(s,context.target))return B(ambiguous[key]);return null;}targetExists(name){const lower=name.toLowerCase();for(const n of this.targetNames)if(n.toLowerCase()===lower)return true;return false;}// Normalize a key name for KEY_OPTION / WHEN key pressed menus.
normalizeKey(key){key=key.toLowerCase().trim();const keyMap={'leftarrow':'left arrow','rightarrow':'right arrow','uparrow':'up arrow','downarrow':'down arrow','left':'left arrow','right':'right arrow','up':'up arrow','down':'down arrow'};return keyMap[key]||key;}// ---- STC12 / 8051 target: the device model ------------------------------------
// `DEVICE` / `CLOCK` / `PIN` are top-level declarations (like GLOBAL / COSTUME) and
// live on `project.stc`, so they survive pseudocode ⇄ blocks and ride along inside
// project.json. The spelling deliberately mirrors ../stc-compiler's pseudocode
// dialect (`stc_pseudocode.py`), which is this target's reference implementation
// and test oracle — see generateC().
stcConfig(){let project=arguments.length>0&&arguments[0]!==undefined?arguments[0]:this.project;if(!project.stc)project.stc={device:'stc12c5a60s2',clock:11059200,pins:[],ports:[],parts:[],tables:[]};const cfg=project.stc;if(!cfg.ports)cfg.ports=[];if(!cfg.parts)cfg.parts=[];if(!cfg.tables)cfg.tables=[];if(!cfg.ledcube)cfg.ledcube=null;return cfg;}// A declared pin by name (case-insensitive), or null. Pin commands only claim a line
// when the name really is a pin, so `turn on led1` cannot shadow anything else.
stcPin(name){const cfg=this.project&&this.project.stc;if(!cfg||!name)return null;const lower=String(name).trim().toLowerCase();return cfg.pins.find(p=>p.name.toLowerCase()===lower)||null;}// A declared whole-port by name, or null.
stcPort(name){const cfg=this.project&&this.project.stc;if(!cfg||!cfg.ports||!name)return null;const lower=String(name).trim().toLowerCase();return cfg.ports.find(p=>p.name.toLowerCase()===lower)||null;}// A declared lookup table by name, or null.
stcTable(name){const cfg=this.project&&this.project.stc;if(!cfg||!cfg.tables||!name)return null;const lower=String(name).trim().toLowerCase();return cfg.tables.find(t=>t.name.toLowerCase()===lower)||null;}// A declared shift-register part by name, or null.
stcPart(name){const cfg=this.project&&this.project.stc;if(!cfg||!cfg.parts||!name)return null;const lower=String(name).trim().toLowerCase();return cfg.parts.find(p=>p.name.toLowerCase()===lower)||null;}// Parse a top-level DEVICE / CLOCK / PIN declaration. Returns true if the line was one.
parseStcDeclaration(trimmed,lineIndex){let m;if(m=trimmed.match(/^DEVICE\s+([\w-]+):?$/i)){const device=m[1].toLowerCase();if(!SB3Creator.STC_PARTS[device]){this.warn(lineIndex,"Unknown DEVICE \"".concat(m[1],"\"; known: ").concat(Object.keys(SB3Creator.STC_PARTS).sort().join(', ')));return true;}const cfg=this.stcConfig();const wasDefault=cfg.clock===11059200&&cfg.device==='stc12c5a60s2';cfg.device=device;// The seeded default clock belongs to the seeded default device.
// A DEVICE line that changes chips takes the chip's own default
// with it — an explicit CLOCK line still wins, before or after.
if(wasDefault&&SB3Creator.STC_PARTS[device]&&SB3Creator.STC_PARTS[device].core==='arduino'){cfg.clock=16000000;}if(wasDefault&&SB3Creator.STC_PARTS[device]&&SB3Creator.STC_PARTS[device].core==='rp2040'){cfg.clock=125000000;}if(wasDefault&&SB3Creator.STC_PARTS[device]&&SB3Creator.STC_PARTS[device].core==='w65c02'){cfg.clock=1000000;// 1 MHz phi2, the canonical breadboard build
}return true;}if(m=trimmed.match(/^CLOCK\s+([\d_]+)\s*(hz|mhz)?$/i)){const value=Number(m[1].replace(/_/g,''));this.stcConfig().clock=/^mhz$/i.test(m[2]||'')?value*1000000:value;return true;}// MAP / CHIP: the composable 6502 machine's declared config — the
// second of its three config sources (preset, DECLARED, wired). A
// machine is regions plus chips; the wired-breadboard extractor emits
// exactly these lines, which is what makes the three sources one.
if(m=trimmed.match(/^MAP\s+(RAM|ROM)\s+[$0]?[x$]?([0-9a-f]{1,4})\s*-\s*[$0]?[x$]?([0-9a-f]{1,4})$/i)){const cfg=this.stcConfig();const part=SB3Creator.STC_PARTS[cfg.device];if(!part||part.core!=='w65c02'){this.warn(lineIndex,'MAP declarations describe the 6502 machine — this device has a fixed memory map');return true;}const start=parseInt(m[2],16);const end=parseInt(m[3],16);if(start>=end){this.warn(lineIndex,"MAP range $".concat(m[2]," >= $").concat(m[3]," \u2014 start must be below end"));return true;}if(!cfg.machine)cfg.machine={regions:[],chips:[]};for(const r of cfg.machine.regions){if(start<=r.end&&r.start<=end){this.warn(lineIndex,"MAP ".concat(m[1].toUpperCase()," overlaps the ").concat(r.kind.toUpperCase()," at $").concat(r.start.toString(16),"-$").concat(r.end.toString(16)));return true;}}cfg.machine.regions.push({kind:m[1].toLowerCase(),start,end});return true;}if(m=trimmed.match(/^CHIP\s+([A-Za-z_]\w*)\s*=\s*SIMPLEVGA$/i)){// The simplevga card takes NO address: it is a write-snoop
// overlay on the ROM window with its bank line on the VIA's
// port B — no decode window, so no AT clause and no overlap
// checks. (bw-board machine chips kind 'simplevga'.)
const cfg=this.stcConfig();const part=SB3Creator.STC_PARTS[cfg.device];if(!part||part.core!=='w65c02'){this.warn(lineIndex,'CHIP declarations describe the 6502 machine — this device has its peripherals on-die');return true;}if(!cfg.machine)cfg.machine={regions:[],chips:[]};if(cfg.machine.chips.some(c=>c.kind==='simplevga')){this.warn(lineIndex,'a SIMPLEVGA is already declared — one card per machine');return true;}cfg.machine.chips.push({name:m[1],kind:'simplevga',at:0});return true;}if(m=trimmed.match(/^CHIP\s+([A-Za-z_]\w*)\s*=\s*(W65C22|W65C51|TMS9918)\s+AT\s+[$0]?[x$]?([0-9a-f]{1,4})$/i)){const cfg=this.stcConfig();const part=SB3Creator.STC_PARTS[cfg.device];if(!part||part.core!=='w65c02'){this.warn(lineIndex,'CHIP declarations describe the 6502 machine — this device has its peripherals on-die');return true;}const kind=/22$/i.test(m[2])?'via':/9918$/i.test(m[2])?'vdp':'acia';const at=parseInt(m[3],16);// Register-window widths, matching the machine's decode table:
// VIA 16, ACIA 4, VDP 2 (data + control ports).
const CHIP_SPAN={via:16,acia:4,vdp:2};const span=CHIP_SPAN[kind];if(!cfg.machine)cfg.machine={regions:[],chips:[]};if(cfg.machine.chips.some(c=>c.kind===kind)){this.warn(lineIndex,"a ".concat(m[2].toUpperCase()," is already declared \u2014 one of each for now (the emitter names its registers singly)"));return true;}for(const r of cfg.machine.regions){if(at<=r.end&&r.start<=at+span-1){this.warn(lineIndex,"CHIP at $".concat(m[3]," sits inside the ").concat(r.kind.toUpperCase()," region $").concat(r.start.toString(16),"-$").concat(r.end.toString(16)));return true;}}for(const c of cfg.machine.chips){const cSpan=CHIP_SPAN[c.kind]||4;if(at<=c.at+cSpan-1&&c.at<=at+span-1){this.warn(lineIndex,"CHIP at $".concat(m[3]," overlaps \"").concat(c.name,"\" at $").concat(c.at.toString(16)));return true;}}cfg.machine.chips.push({kind,name:m[1],at});return true;}// A numbered pin (D13, A0) for the boards that have them. Kept as its
// own branch: an Arduino pin has no port and no bit, so every check
// below it is about a coordinate system it is not in.
if(m=trimmed.match(/^PIN\s+([A-Za-z_]\w*)\s*=\s*([DA]\d+|GP\d+|P[A-D]\d|P\d+|BUTTON_[AB]|(?:OUT|IN)\d|MK\d+)\s+(OUTPUT|INPUT|ANALOG|PWM|TONE)(?:\s+ACTIVE\s+(LOW|HIGH))?$/i)){const[,name,where,direction,active]=m;const cfg=this.stcConfig();const part=SB3Creator.STC_PARTS[cfg.device];const core=part&&part.core;// Three vocabularies reach here and each board owns exactly one.
// Naming a pin in another board's spelling is the mistake worth
// catching, because both spellings look perfectly reasonable.
// Per DEVICE, not per core: a micro:bit and a Pico are both
// MicroPython and share no pin name at all, so one regex for the
// pair let each accept the other's spelling.
const SPOKEN={'arduino-uno':[/^(D\d+|A\d+)$/i,'D0-D13 or A0-A5'],'atmega168p':[/^(D\d+|A\d+)$/i,'D0-D13 or A0-A5'],'arduino-mega':[/^(D\d+|A\d+)$/i,'D0-D53 or A0-A15'],'arduino-nano':[/^(D\d+|A\d+)$/i,'D0-D13 or A0-A7'],atmega328p:[/^(D\d+|A\d+)$/i,'D0-D13 or A0-A5'],microbit:[/^(P\d+|BUTTON_[AB])$/i,'P0-P20, BUTTON_A or BUTTON_B'],pico:[/^GP\d+$/i,'GP0-GP28'],// PB7 is Timer 1's square-wave pin and the machine's timebase
// guard: the emitter would refuse it anyway, refuse it here too.
eater6502:[/^(PA[0-7]|PB[0-7]|MK\d+)$/i,'PA0-PA7, PB0-PB7, or MK0-MK19 (matrix keypad)'],z80:[/^(OUT[0-7]|IN[0-7])$/i,'OUT0-OUT7 (latch) or IN0-IN7 (buffer)'],attiny88:[/^(PA[0-3]|PB[0-7]|PC[0-7]|PD[0-7])$/i,'PA0-PA3, PB0-PB7, PC0-PC7, PD0-PD7'],attiny85:[/^PB[0-4]$/i,'PB0-PB4 (PB5 is RESET)']};const spoken=SPOKEN[cfg.device];if(!spoken||!spoken[0].test(where)){const want=spoken?spoken[1]:'P<port>.<bit>';this.warn(lineIndex,"\"".concat(where.toUpperCase(),"\" is not how ").concat(cfg.device||'this device'," names a pin; it uses ").concat(want));return true;}// The board ends somewhere, and the compiler already refuses past
// it. Disagreeing here would mean a project that builds in one
// place and not the other.
const LAST={'arduino-uno':{D:13,A:5},'arduino-nano':{D:13,A:7},'atmega168p':{D:13,A:5},'arduino-mega':{D:53,A:15},atmega328p:{D:13,A:5},microbit:{P:20},pico:{GP:28},eater6502:{PA:7,PB:7}};// PB7: plain I/O while ACR7=0, same as the SPOKEN gate
const edge=LAST[cfg.device]||{};const num=where.match(/^([A-Z]+)(\d+)$/i);if(num&&edge[num[1].toUpperCase()]!==undefined&&Number(num[2])>edge[num[1].toUpperCase()]){this.warn(lineIndex,"".concat(cfg.device," has no ").concat(where.toUpperCase(),"; it goes up to ").concat(num[1].toUpperCase()).concat(edge[num[1].toUpperCase()]));return true;}if(this.stcPin(name)){this.warn(lineIndex,"Pin \"".concat(name,"\" declared twice"));return true;}// The Nano's A6/A7 reach the pad with no digital buffer behind
// them, so a digital write to one does nothing on the board. The
// compiler refuses it; agreeing here is the point of the rule
// above about not disagreeing with it.
if(cfg.device==='arduino-nano'&&/^A[67]$/i.test(where)&&!/^analog$/i.test(direction)){this.warn(lineIndex,"".concat(where.toUpperCase()," is analog-input only on the Nano (the TQFP package brings out the ADC channel with no digital buffer), so it cannot be an ").concat(direction.toUpperCase()));return true;}if(core==='rp2040'&&/^analog$/i.test(direction)&&!/^GP2[678]$/i.test(where)){this.warn(lineIndex,"ANALOG on the Pico means GP26, GP27 or GP28 (ADC0-2), not ".concat(where.toUpperCase()));return true;}if(core==='arduino'&&/^analog$/i.test(direction)&&!/^A/i.test(where)){this.warn(lineIndex,"ANALOG needs an analog input (A0 and up), not ".concat(where.toUpperCase()));return true;}if(core==='micropython'&&/^button_[ab]$/i.test(where)&&!/^input$/i.test(direction)){this.warn(lineIndex,"".concat(where.toUpperCase()," is a button and can only be an INPUT"));return true;}cfg.pins.push({name,where:where.toUpperCase(),direction:direction.toLowerCase(),activeLow:/^low$/i.test(active||'')});return true;}if(m=trimmed.match(/^PIN\s+([A-Za-z_]\w*)\s*=\s*P([0-5])\.([0-7])\s+(OUTPUT|INPUT|ANALOG|PWM|TONE)(?:\s+ACTIVE\s+(LOW|HIGH))?$/i)){const[,name,port,bit,direction,active]=m;const cfg=this.stcConfig();if(this.stcPin(name)){this.warn(lineIndex,"Pin \"".concat(name,"\" declared twice"));return true;}// ADC channel n is physically P1.n — there is no mux to anywhere else.
if(/^analog$/i.test(direction)&&port!=='1'){this.warn(lineIndex,"ANALOG is only available on P1.0-P1.7 (ADC0-ADC7), not P".concat(port,".").concat(bit));return true;}// PORT conflict: a PIN inside a declared PORT would be clobbered by every
// port write, and neither declaration looks wrong on its own.
if(cfg.ports.some(w=>w.port===Number(port))){const conflict=cfg.ports.find(w=>w.port===Number(port));this.warn(lineIndex,"P".concat(port," is already declared as the whole port \"").concat(conflict.name,"\"; a PORT write covers all eight bits and would clobber P").concat(port,".").concat(bit));return true;}cfg.pins.push({name,port:Number(port),bit:Number(bit),direction:direction.toLowerCase(),activeLow:/^low$/i.test(active||'')});return true;}// PORT <name> = P<n> OUTPUT|INPUT [ACTIVE LOW|HIGH]
if(m=trimmed.match(/^PORT\s+([A-Za-z_]\w*)\s*=\s*P([0-4])\s+(OUTPUT|INPUT)(?:\s+ACTIVE\s+(LOW|HIGH))?$/i)){const[,name,port,direction,active]=m;const cfg=this.stcConfig();const portNum=Number(port);if(this.stcPort(name)||this.stcPin(name)||this.stcPart(name)){this.warn(lineIndex,"\"".concat(name,"\" declared twice"));return true;}// Conflict: a PIN already uses a bit on this port.
const conflict=cfg.pins.find(p=>p.port===portNum);if(conflict){this.warn(lineIndex,"P".concat(port," is already used one bit at a time, by \"").concat(conflict.name,"\" (P").concat(conflict.port,".").concat(conflict.bit,"); a PORT writes all eight at once and would clobber it"));return true;}// Two PORTs on the same physical port.
if(cfg.ports.some(p=>p.port===portNum)){this.warn(lineIndex,"P".concat(port," is already declared as \"").concat(cfg.ports.find(p=>p.port===portNum).name,"\""));return true;}cfg.ports.push({name,port:portNum,direction:direction.toLowerCase(),activeLow:/^low$/i.test(active||'')});return true;}// PART <name> = 74HC595 data P<p>.<b> clock P<p>.<b> latch P<p>.<b> [ACTIVE LOW|HIGH]
if(m=trimmed.match(/^PART\s+([A-Za-z_]\w*)\s*=\s*74HC595\s+data\s+P([0-4])\.([0-7])\s+clock\s+P([0-4])\.([0-7])\s+latch\s+P([0-4])\.([0-7])(?:\s+ACTIVE\s+(LOW|HIGH))?$/i)){const[,name,dp,db,cp,cb,lp,lb,active]=m;const cfg=this.stcConfig();if(this.stcPin(name)||this.stcPort(name)||this.stcPart(name)){this.warn(lineIndex,"\"".concat(name,"\" declared twice"));return true;}const claims=[[Number(dp),Number(db)],[Number(cp),Number(cb)],[Number(lp),Number(lb)]];const claimSet=new Set(claims.map(_ref2=>{let[p,b]=_ref2;return"".concat(p,".").concat(b);}));if(claimSet.size!==3){this.warn(lineIndex,"\"".concat(name,"\" names the same pin twice; data, clock and latch must be three different pins"));return true;}// Check conflicts with existing PINs, PORTs, PARTs.
for(const[p,b]of claims){const pinConflict=cfg.pins.find(pin=>pin.port===p&&pin.bit===b);if(pinConflict){this.warn(lineIndex,"P".concat(p,".").concat(b," is already declared as \"").concat(pinConflict.name,"\"; a PART claims its pins"));return true;}const portConflict=cfg.ports.find(w=>w.port===p);if(portConflict){this.warn(lineIndex,"P".concat(p,".").concat(b," is inside the whole port \"").concat(portConflict.name,"\", which would clobber it"));return true;}for(const prev of cfg.parts){if(prev.claims.some(_ref3=>{let[pp,pb]=_ref3;return pp===p&&pb===b;})){this.warn(lineIndex,"P".concat(p,".").concat(b," is already claimed by \"").concat(prev.name,"\""));return true;}}}cfg.parts.push({name,type:'74hc595',claims,data:{port:Number(dp),bit:Number(db)},clock:{port:Number(cp),bit:Number(cb)},latch:{port:Number(lp),bit:Number(lb)},activeLow:/^low$/i.test(active||'')});return true;}// PART <name> = 74HC595 data <where> clock <where> latch <where> [ACTIVE LOW|HIGH]
// Non-8051 boards: pin names are D<n>, A<n>, GP<n>, PA<n>, PB<n> etc.
if(m=trimmed.match(/^PART\s+([A-Za-z_]\w*)\s*=\s*74HC595\s+data\s+(\S+)\s+clock\s+(\S+)\s+latch\s+(\S+)(?:\s+ACTIVE\s+(LOW|HIGH))?$/i)){const[,name,dw,cw,lw,active]=m;const cfg=this.stcConfig();const part=SB3Creator.STC_PARTS[cfg.device];const core=part&&part.core;// Only match for non-8051 cores (the P<p>.<b> branch above handles 8051).
if(core&&core!=='8051'&&!/^P\d\.\d$/.test(dw)){if(this.stcPin(name)||this.stcPort(name)||this.stcPart(name)){this.warn(lineIndex,"\"".concat(name,"\" declared twice"));return true;}const wheres=[dw.toUpperCase(),cw.toUpperCase(),lw.toUpperCase()];if(new Set(wheres).size!==3){this.warn(lineIndex,"\"".concat(name,"\" names the same pin twice; data, clock and latch must be three different pins"));return true;}// Check conflicts with existing PINs and PARTs.
for(const w of wheres){const pinConflict=cfg.pins.find(pin=>(pin.where||'').toUpperCase()===w);if(pinConflict){this.warn(lineIndex,"".concat(w," is already declared as \"").concat(pinConflict.name,"\"; a PART claims its pins"));return true;}for(const prev of cfg.parts){if((prev.claims||[]).some(c=>typeof c==='string'?c===w:false)){this.warn(lineIndex,"".concat(w," is already claimed by \"").concat(prev.name,"\""));return true;}}}cfg.parts.push({name,type:'74hc595',claims:wheres,data:{where:wheres[0]},clock:{where:wheres[1]},latch:{where:wheres[2]},activeLow:/^low$/i.test(active||'')});return true;}}// TABLE <name> = <value>, <value>, ... — constant lookup table in code space.
// Values are bytes (0–255), separated by commas. Supports hex (0x3F) and
// binary (0b00111111) literals. The table rides in project.stc.tables and
// the C emitter puts it in __code flash.
if(m=trimmed.match(/^TABLE\s+([A-Za-z_]\w*)\s*=\s*(.+)$/i)){const[,name,body]=m;const cfg=this.stcConfig();if(this.stcTable(name)){this.warn(lineIndex,"Table \"".concat(name,"\" declared twice"));return true;}const values=[];for(let item of body.split(',')){item=item.trim();if(!item)continue;let n;if(/^0b[01]+$/i.test(item))n=parseInt(item.slice(2),2);else n=Number(item.startsWith('0x')||item.startsWith('0X')?item:item);if(!Number.isFinite(n)||n!==Math.floor(n)){this.warn(lineIndex,"\"".concat(item,"\" is not a constant; a TABLE holds numbers only"));return true;}if(n<0||n>255){this.warn(lineIndex,"".concat(n," is outside 0\u2013255; a TABLE holds bytes"));return true;}values.push(n);}if(!values.length){this.warn(lineIndex,"Table \"".concat(name,"\" is empty"));return true;}cfg.tables.push({name,values});return true;}// LEDCUBE <size> — a multiplexed LED cube, <size>x<size>x<size>.
// The voxel map (select, bit) → (x, y, z) is hardware-dependent and
// currently unknown (see stc/src/20-ledcube/README.md). The blocks
// work on the logical grid; the mapping table translates at emit time.
if(m=trimmed.match(/^LEDCUBE\s+(\d+)$/i)){const size=Number(m[1]);if(size<2||size>8){this.warn(lineIndex,"LEDCUBE size must be 2\u20138, got ".concat(size));return true;}const cfg=this.stcConfig();if(cfg.ledcube){this.warn(lineIndex,'LEDCUBE declared twice');return true;}// selects = size * (bicolour ? 2 : 1), bits = size * size.
// For the 4x4x4: 8 selects, 8 data bits per select (only lower 4x4
// used unless bi-colour doubles the select range).
cfg.ledcube={size,selects:size*2,bits:8};return true;}return false;}// Parse a boolean condition expression into a block id.
parseCondition(conditionStr,context){var _this2=this,_this$currentProcArgs;let s=this.stripOuterParens((conditionStr||'').trim());const push=function push(op){let inputs=arguments.length>1&&arguments[1]!==undefined?arguments[1]:{};let fields=arguments.length>2&&arguments[2]!==undefined?arguments[2]:{};return _this2.pushBlock(context,op,inputs,fields);};// Boolean precedence, loosest first — Python's, which is the
// reference dialect's (stc-compiler c34ad1b): or < and < not <
// comparisons. `not` must be checked AFTER and/or, not before:
// binding it loosest made `not a and b` parse as `not (a and b)`
// where the language means `(not a) and b`, and `not k = shown`
// only looked right by coincidence (comparison is tighter than
// not in both orders). Comparisons stay below, tighter than all.
let sp;if(sp=this.splitBinary(s,[' or '],{ci:true})){return push('operator_or',{OPERAND1:[2,this.parseCondition(sp.left,context)],OPERAND2:[2,this.parseCondition(sp.right,context)]});}if(sp=this.splitBinary(s,[' and '],{ci:true})){return push('operator_and',{OPERAND1:[2,this.parseCondition(sp.left,context)],OPERAND2:[2,this.parseCondition(sp.right,context)]});}if(/^not\s+/i.test(s)){const child=this.parseCondition(s.replace(/^not\s+/i,''),context);return push('operator_not',{OPERAND:[2,child]});}// Planète Maths distinctive boolean (extension `planetemaths`).
let mm;if(mm=s.match(/^(.+?)\s+is multiple of\s+(.+)$/i)){return push('planetemaths_multiple',{NUM1:this.parseValue(mm[1],context),NUM2:this.parseValue(mm[2],context)});}// Arrays & Vectors boolean: array "NAME" contains VALUE
if(mm=s.match(/^array\s+"([^"]*)"\s+contains\s+(.+)$/i)){return push('arrays_contains',{NAME:[1,[10,mm[1]]],VALUE:this.parseValue(mm[2],context)});}// Comparisons. Scratch 3.0 has no native <= / >=, so build them from not().
if(sp=this.splitBinary(s,['<='])){const gt=push('operator_gt',{OPERAND1:this.parseValue(sp.left,context),OPERAND2:this.parseValue(sp.right,context)});return push('operator_not',{OPERAND:[2,gt]});}if(sp=this.splitBinary(s,['>='])){const lt=push('operator_lt',{OPERAND1:this.parseValue(sp.left,context),OPERAND2:this.parseValue(sp.right,context)});return push('operator_not',{OPERAND:[2,lt]});}for(const[sym,op]of[['<','operator_lt'],['>','operator_gt'],['=','operator_equals']]){if(sp=this.splitBinary(s,[sym])){return push(op,{OPERAND1:this.parseValue(sp.left,context),OPERAND2:this.parseValue(sp.right,context)});}}// Predicates
let m;// A bare `read <pin>` used as a condition is the pin's level (active-low aware).
// Wrap in `> 0` so the CONDITION input gets a Boolean-shaped block —
// stc12_read is a reporter (rounded), not a boolean (hexagonal).
if((m=s.match(/^read\s+([A-Za-z_]\w*)$/i))&&this.stcPin(m[1])){const reader=push('stc12_read',{},{PIN:[this.stcPin(m[1]).name,null]});return push('operator_gt',{OPERAND1:[3,reader,[10,""]],OPERAND2:[1,[4,"0"]]});}if((m=s.match(/^read\s+([A-Za-z_]\w*)$/i))&&this.stcPort(m[1])){const reader=push('stc12_readport',{},{PORT:[this.stcPort(m[1]).name,null]});return push('operator_gt',{OPERAND1:[3,reader,[10,""]],OPERAND2:[1,[4,"0"]]});}// Device predicates (boolean reporters)
// Device predicate: "<name> pressed?" — but NOT "key X pressed?" which is Scratch's own.
if(m=s.match(/^"([^"]+)"\s+pressed\??$/i)){return push('devices_pressed',{BUTTON:this.parseValue("\"".concat(m[1],"\""),context)});}if(m=s.match(/^(.+?)\s+above\s+(.+)$/i)){return push('devices_above',{SENSOR:this.parseValue(m[1],context),THRESHOLD:this.parseValue(m[2],context)});}if(m=s.match(/^(.+?)\s+closer than\s+(.+)$/i)){return push('devices_closer',{SENSOR:this.parseValue(m[1],context),DISTANCE:this.parseValue(m[2],context)});}if(m=s.match(/^motion detected on\s+(.+)$/i)){return push('devices_motion',{SENSOR:this.parseValue(m[1],context)});}if(m=s.match(/^(.+?)\s+tilted\??$/i)){return push('devices_tilted',{SENSOR:this.parseValue(m[1],context)});}if((m=s.match(/^(.+?)\s+energised\??$/i))||(m=s.match(/^(.+?)\s+energized\??$/i))){return push('devices_energised',{DEVICE:this.parseValue(m[1],context)});}if(m=s.match(/^touching color\s+(.+)$/i)){const color=this.parseValue(m[1].trim(),context);return push('sensing_touchingcolor',{COLOR:color});}if(m=s.match(/^touching\s+(.+)$/i)){let name=m[1].trim();if(/^edge$/i.test(name))name='_edge_';else if(/^mouse(-pointer)?$/i.test(name))name='_mouse_';return push('sensing_touchingobject',{TOUCHINGOBJECTMENU:this.menuInput(context,'sensing_touchingobjectmenu','TOUCHINGOBJECTMENU',name)});}if(m=s.match(/^key\s+(.+?)\s+pressed\??$/i)){return push('sensing_keypressed',{KEY_OPTION:this.menuInput(context,'sensing_keyoptions','KEY_OPTION',this.normalizeKey(m[1]))});}if(/^mouse down\??$/i.test(s)){return push('sensing_mousedown');}if(sp=this.splitBinary(s,[' contains '],{ci:true})){const left=sp.left.trim();if(this.listExists(left,context.target)){const list=this.getOrCreateList(left,context.target);return push('data_listcontainsitem',{ITEM:this.parseValue(sp.right,context)},{LIST:[list.name,list.id]});}return push('operator_contains',{STRING1:this.parseValue(sp.left,context),STRING2:this.parseValue(sp.right,context)});}// A boolean custom-block parameter used directly as a condition.
if(this.currentProcArgs&&((_this$currentProcArgs=this.currentProcArgs.get(s))===null||_this$currentProcArgs===void 0?void 0:_this$currentProcArgs.type)==='b'){return push('argument_reporter_boolean',{},{VALUE:[s,null]});}// Default: treat as a boolean-ish value compared to true.
return push('operator_equals',{OPERAND1:this.parseValue(s,context),OPERAND2:[1,[10,'true']]});}unquote(s){s=s.trim();if(s.length>=2&&s.startsWith('"')&&s.endsWith('"'))return s.slice(1,-1);return s;}// Parse `DEFINE [FAST] <signature>:` into {proccode, argNames, argTypes, warp, regexParts}.
parseSignature(headerLine){let sig=headerLine.replace(/^DEFINE\s+/i,'').replace(/:\s*$/,'').trim();let warp=false;if(/^FAST\s+/i.test(sig)){warp=true;sig=sig.replace(/^FAST\s+/i,'');}const tokens=sig.match(/\([^)]*\)|<[^>]*>|[^\s]+/g)||[];const procParts=[];const template=[];// per proccode word: { lit } or { arg: true }
const argNames=[];const argTypes=[];for(const tok of tokens){if(tok.startsWith('(')||tok.startsWith('<')){const type=tok.startsWith('<')?'b':'s';argNames.push(tok.slice(1,-1).trim());argTypes.push(type);procParts.push(type==='b'?'%b':'%s');template.push({arg:true});}else{procParts.push(tok);template.push({lit:tok});}}return{proccode:procParts.join(' '),argNames,argTypes,warp,template};}// Split a line into top-level tokens: parenthesized groups and quoted strings
// count as a single token, so custom-block args like `(pr + 1)` stay intact.
tokenizeTop(s){const tokens=[];let i=0;s=s.trim();while(i<s.length){if(s[i]===' '){i++;continue;}if(s[i]==='('){let depth=0,j=i;for(;j<s.length;j++){if(s[j]==='(')depth++;else if(s[j]===')'){depth--;if(depth===0){j++;break;}}}tokens.push(s.slice(i,j));i=j;continue;}if(s[i]==='"'){let j=i+1;while(j<s.length&&s[j]!=='"')j++;j++;tokens.push(s.slice(i,j));i=j;continue;}let j=i;while(j<s.length&&s[j]!==' '&&s[j]!=='('&&s[j]!=='"')j++;tokens.push(s.slice(i,j));i=j;}return tokens;}// First-pass registration so calls resolve even before the DEFINE appears.
registerProcedure(headerLine){const sig=this.parseSignature(headerLine);if(this.procedures.some(p=>p.proccode===sig.proccode))return;this.procedures.push({proccode:sig.proccode,argIds:sig.argNames.map(()=>this.generateId()),argNames:sig.argNames,argTypes:sig.argTypes,warp:sig.warp,template:sig.template});// Longest templates first so a more specific signature wins call matching.
this.procedures.sort((a,b)=>b.template.length-a.template.length);}// Build the definition blocks. Returns { block, extraBlocks, args } where `args`
// maps param names to their type so the body emits argument reporters.
parseDefine(headerLine,target){const context={target,extraBlocks:{},parentId:null};const sig=this.parseSignature(headerLine);const proc=this.procedures.find(p=>p.proccode===sig.proccode);const argIds=proc.argIds;const argDefaults=sig.argTypes.map(t=>t==='b'?'false':'');const args=new Map();sig.argNames.forEach((name,i)=>args.set(name,{type:sig.argTypes[i]}));const defId=this.generateId();const protoId=this.generateId();const protoInputs={};sig.argNames.forEach((name,i)=>{const repId=this.generateId();context.extraBlocks[repId]={opcode:sig.argTypes[i]==='b'?'argument_reporter_boolean':'argument_reporter_string_number',next:null,parent:protoId,inputs:{},fields:{VALUE:[name,null]},shadow:true,topLevel:false};protoInputs[argIds[i]]=[1,repId];});context.extraBlocks[protoId]={opcode:'procedures_prototype',next:null,parent:defId,inputs:protoInputs,fields:{},shadow:true,topLevel:false,mutation:{tagName:'mutation',children:[],proccode:sig.proccode,argumentids:JSON.stringify(argIds),argumentnames:JSON.stringify(sig.argNames),argumentdefaults:JSON.stringify(argDefaults),warp:String(sig.warp)}};const block={[defId]:{opcode:'procedures_definition',next:null,parent:null,inputs:{custom_block:[1,protoId]},fields:{},shadow:false,topLevel:true}};return{block,extraBlocks:context.extraBlocks,args};}// Try to resolve a line as a call to a registered custom block, matching the
// call's top-level tokens against the procedure's template token-for-token.
tryProcedureCall(line,target){const tokens=this.tokenizeTop(line);for(const proc of this.procedures){if(proc.template.length!==tokens.length)continue;const rawArgs=[];let ok=true;for(let i=0;i<proc.template.length;i++){const t=proc.template[i];if(t.lit){if(tokens[i]!==t.lit){ok=false;break;}}else rawArgs.push(tokens[i]);}if(!ok)continue;const context={target,extraBlocks:{},parentId:null};const{id,block}=this.createBlock('procedures_call');context.parentId=id;const inputs={};proc.argIds.forEach((argId,i)=>{inputs[argId]=proc.argTypes[i]==='b'?[2,this.parseCondition(rawArgs[i],context)]:this.parseValue(rawArgs[i],context);});block[id].inputs=inputs;block[id].mutation={tagName:'mutation',children:[],proccode:proc.proccode,argumentids:JSON.stringify(proc.argIds),warp:String(proc.warp)};return{block,extraBlocks:context.extraBlocks};}return null;}parseCommand(line,target){var _this3=this;// Event hats reach here with their trailing ':' — strip it so the hat
// patterns can anchor cleanly. Remember that it WAS a hat: an unrecognised
// one must be refused rather than falling through to statement parsing,
// which silently swallowed the whole script (see the guard below).
let wasHat=false;if(/^when\b/i.test(line)){wasHat=/:\s*$/.test(line);line=line.replace(/\s*:\s*$/,'');}const context={target,extraBlocks:{},parentId:null};let match;// Create a stack command block and make it the parent for any reporter/menu
// blocks parsed into its inputs.
const cmd=function cmd(opcode){let opts=arguments.length>1&&arguments[1]!==undefined?arguments[1]:{};const{id,block}=_this3.createBlock(opcode,opts);context.parentId=id;return{id,block};};const ret=block=>({block,extraBlocks:context.extraBlocks});const ext=n=>{if(!this.project.extensions.includes(n))this.project.extensions.push(n);};const val=s=>this.parseValue(s,context);// ---- Event hats (routed here from the main loop) ---------------------------
if(/^when I start as a clone$/i.test(line)){return{block:this.createBlock('control_start_as_clone',{topLevel:true}).block,extraBlocks:{}};}if(match=line.match(/^when I receive\s+(.+)$/i)){const bc=this.getOrCreateBroadcast(this.unquote(match[1]));const{id,block}=this.createBlock('event_whenbroadcastreceived',{topLevel:true});block[id].fields.BROADCAST_OPTION=[bc.name,bc.id];return{block,extraBlocks:{}};}if(/^when (this )?sprite clicked$/i.test(line)){return{block:this.createBlock('event_whenthisspriteclicked',{topLevel:true}).block,extraBlocks:{}};}if(match=line.match(/^when\s+(.+?)\s+key\s+pressed$/i)){const{id,block}=this.createBlock('event_whenkeypressed',{topLevel:true});block[id].fields.KEY_OPTION=[this.normalizeKey(match[1]),null];return{block,extraBlocks:{}};}// `flag clicked`, `started` and `powered on` are one hat under three names.
// stc-compiler's stc_pseudocode.py accepts all three and CANONICALISES to
// `WHEN started:`, so refusing that spelling made this side unable to read
// the other's own output — the scripts vanished and an empty main() compiled
// clean. Both implementations now accept all three; each keeps its own
// canonical spelling on the way out.
if(line.includes('flag clicked')||/^when\s+started$/i.test(line)||/^when\s+powered\s+on$/i.test(line)){return{block:this.createBlock('event_whenflagclicked',{topLevel:true}).block,extraBlocks:{}};}// Device sensor hats: threshold-based and binary event blocks.
// Quoted sensor name avoids collision with Scratch's "when X key pressed".
if(match=line.match(/^when\s+"([^"]+)"\s+above\s+(.+)$/i)){const{id,block}=this.createBlock('devices_whenabove',{topLevel:true});block[id].inputs.SENSOR=[1,[10,match[1]]];block[id].inputs.THRESHOLD=val(match[2]);return{block,extraBlocks:{}};}if(match=line.match(/^when\s+"([^"]+)"\s+closer than\s+(.+)$/i)){const{id,block}=this.createBlock('devices_whencloser',{topLevel:true});block[id].inputs.SENSOR=[1,[10,match[1]]];block[id].inputs.DISTANCE=val(match[2]);return{block,extraBlocks:{}};}if(match=line.match(/^when motion on\s+"([^"]+)"$/i)){const{id,block}=this.createBlock('devices_whenmotion',{topLevel:true});block[id].inputs.SENSOR=[1,[10,match[1]]];return{block,extraBlocks:{}};}if(match=line.match(/^when\s+"([^"]+)"\s+tilted$/i)){const{id,block}=this.createBlock('devices_whentilted',{topLevel:true});block[id].inputs.SENSOR=[1,[10,match[1]]];return{block,extraBlocks:{}};}if(match=line.match(/^when IR received on\s+"([^"]+)"$/i)){const{id,block}=this.createBlock('devices_whenirreceived',{topLevel:true});block[id].inputs.SENSOR=[1,[10,match[1]]];return{block,extraBlocks:{}};}// STC12 event hat: `when <pin> pressed` / `when <pin> released` for INPUT pins.
if((match=line.match(/^when\s+([A-Za-z_]\w*)\s+(pressed|released)$/i))&&this.stcPin(match[1])){const pin=this.stcPin(match[1]);if(pin.direction==='input'){const{id,block}=this.createBlock('stc12_whenpin',{topLevel:true});block[id].fields.PIN=[pin.name,null];block[id].fields.EDGE=[match[2].toLowerCase(),null];return{block,extraBlocks:{}};}// An OUTPUT/ANALOG/PWM/TONE pin has no edge to react to. Build the block
// anyway so the script body is kept, but generateC will refuse it.
this.warn(null,"\"".concat(pin.name,"\" is ").concat(pin.direction.toUpperCase(),", not INPUT; a \"when ").concat(pin.name," ").concat(match[2].toLowerCase(),"\" hat has no edge to react to"));const{id,block}=this.createBlock('stc12_whenpin',{topLevel:true});block[id].fields.PIN=[pin.name,null];block[id].fields.EDGE=[match[2].toLowerCase(),null];return{block,extraBlocks:{}};}// Nothing above matched a line that arrived as `WHEN ...:`. Falling through
// to statement parsing is what made an unknown hat silently drop its entire
// script, so say so instead.
if(wasHat){throw new ParseError("Unknown event hat \"".concat(line,"\". Known hats: WHEN flag clicked / ")+"started / powered on, WHEN <key> key pressed, WHEN sprite clicked, "+"WHEN I receive \"<message>\", WHEN I start as a clone.");}// ---- STC12 / 8051 pin commands --------------------------------------------
// Guarded on the name really being a declared PIN, so these never shadow
// `turn right 15 degrees`, `set score to 0`, or a custom block called `toggle`.
const stcSet=(pin,state)=>{const{id,block}=this.createBlock('stc12_setpin');block[id].fields.PIN=[pin.name,null];block[id].fields.STATE=[state,null];return{block,extraBlocks:{}};};if((match=line.match(/^turn\s+(on|off)\s+([A-Za-z_]\w*)$/i))&&this.stcPin(match[2])){return stcSet(this.stcPin(match[2]),match[1].toLowerCase());}if((match=line.match(/^set\s+([A-Za-z_]\w*)\s+(high|low)$/i))&&this.stcPin(match[1])){return stcSet(this.stcPin(match[1]),match[2].toLowerCase());}// `set <pin> to <n> percent` — PWM duty cycle. Must match BEFORE the generic
// `set <pin> to <expr>` (writepin) below.
if((match=line.match(/^set\s+([A-Za-z_]\w*)\s+to\s+(.+?)\s*(?:percent|%)$/i))&&this.stcPin(match[1])){const pin=this.stcPin(match[1]);if(pin.direction!=='pwm'){this.warn(null,"\"".concat(pin.name,"\" is a ").concat(pin.direction.toUpperCase()," pin; only a PWM pin takes a percentage"));}const{id,block}=cmd('stc12_setpwm');block[id].fields.PIN=[pin.name,null];block[id].inputs.VALUE=val(match[2]);return ret(block);}// `set <pin> to <n> hz` — tone frequency. Must match BEFORE the generic writepin.
if((match=line.match(/^set\s+([A-Za-z_]\w*)\s+to\s+(.+?)\s*(?:hz|hertz)$/i))&&this.stcPin(match[1])){const pin=this.stcPin(match[1]);if(pin.direction!=='tone'){this.warn(null,"\"".concat(pin.name,"\" is a ").concat(pin.direction.toUpperCase()," pin; only a TONE pin takes a frequency"));}const{id,block}=cmd('stc12_settone');block[id].fields.PIN=[pin.name,null];block[id].inputs.VALUE=val(match[2]);return ret(block);}// `set <pin> to <expr>` writes a computed LEVEL. Distinct from `turn on/off`, which
// are states and respect ACTIVE LOW; a level is a level, exactly like `set high`.
// Placed before the generic variable assignment (and before motion's `set x to`) so a
// declared pin always wins, consistent with the other pin statements.
if((match=line.match(/^set\s+([A-Za-z_]\w*)\s+to\s+(.+)$/i))&&this.stcPin(match[1])){const{id,block}=cmd('stc12_writepin');block[id].fields.PIN=[this.stcPin(match[1]).name,null];block[id].inputs.VALUE=val(match[2]);return ret(block);}if((match=line.match(/^toggle\s+([A-Za-z_]\w*)$/i))&&this.stcPin(match[1])){const{id,block}=this.createBlock('stc12_toggle');block[id].fields.PIN=[this.stcPin(match[1]).name,null];return{block,extraBlocks:{}};}// ---- STC12 / 8051 PORT and PART commands ------------------------------------
// `set <port> to <n>` — writes the whole 8-bit port at once.
if((match=line.match(/^set\s+([A-Za-z_]\w*)\s+to\s+(.+)$/i))&&this.stcPort(match[1])){const port=this.stcPort(match[1]);const{id,block}=cmd('stc12_setport');block[id].fields.PORT=[port.name,null];block[id].inputs.VALUE=val(match[2]);return ret(block);}// `set <part> to <n>` — shifts a byte out to a 74HC595.
if((match=line.match(/^set\s+([A-Za-z_]\w*)\s+to\s+(.+)$/i))&&this.stcPart(match[1])){const part=this.stcPart(match[1]);const{id,block}=cmd('stc12_setpart');block[id].fields.PART=[part.name,null];block[id].inputs.VALUE=val(match[2]);return ret(block);}// ---- STC12 / 8051 print (program-wide, no declaration needed) ---------------
if(match=line.match(/^print\s+"([^"]*)"\s*$/i)){const{id,block}=cmd('stc12_print');block[id].inputs.VALUE=[1,[10,match[1]]];block[id].fields.MODE=['text',null];return ret(block);}if(match=line.match(/^print\s+(.+)$/i)){const{id,block}=cmd('stc12_print');block[id].inputs.VALUE=val(match[1]);block[id].fields.MODE=['number',null];return ret(block);}// ---- micro:bit display (explicit device verb: say is STAGE, this is LEDs) ----
if(match=line.match(/^(?:display|scroll)\s+"([^"]*)"\s*$/i)){const{id,block}=cmd('microbit_display');block[id].inputs.VALUE=[1,[10,match[1]]];block[id].fields.MODE=['text',null];return ret(block);}if(match=line.match(/^(?:display|scroll)\s+(.+)$/i)){const{id,block}=cmd('microbit_display');block[id].inputs.VALUE=val(match[1]);block[id].fields.MODE=['number',null];return ret(block);}// ---- Circuit extension commands (boundary B) --------------------------------
if(match=line.match(/^set control\s+(.+?)\s+to\s+(.+)$/i)){const{id,block}=cmd('circuit_setcontrol');block[id].inputs.CONTROL=val(match[1]);block[id].inputs.VALUE=val(match[2]);return ret(block);}if(match=line.match(/^turn power\s+(on|off)$/i)){const{id,block}=cmd('circuit_setpower');block[id].fields.STATE=[match[1].toLowerCase(),null];return ret(block);}// ---- LED cube commands (guarded on a LEDCUBE declaration) --------------------
if(this.project&&this.project.stc&&this.project.stc.ledcube){if(match=line.match(/^set voxel\s+(.+?)\s+(.+?)\s+(.+?)\s+to\s+(.+)$/i)){const{id,block}=cmd('ledcube_setvoxel');block[id].inputs.X=val(match[1]);block[id].inputs.Y=val(match[2]);block[id].inputs.Z=val(match[3]);block[id].inputs.COLOUR=val(match[4]);return ret(block);}if(match=line.match(/^clear voxel\s+(.+?)\s+(.+?)\s+(.+)$/i)){const{id,block}=cmd('ledcube_clearvoxel');block[id].inputs.X=val(match[1]);block[id].inputs.Y=val(match[2]);block[id].inputs.Z=val(match[3]);return ret(block);}if(match=line.match(/^fill layer\s+(.+?)\s+with\s+(.+)$/i)){const{id,block}=cmd('ledcube_filllayer');block[id].inputs.LAYER=val(match[1]);block[id].inputs.COLOUR=val(match[2]);return ret(block);}if(/^clear cube$/i.test(line)){const{block}=cmd('ledcube_clear');return ret(block);}// Alternation built from the shared table, so adding a direction
// there makes the dialect accept it. Spelling the six words out
// here was a third copy — the parser would have gone on rejecting
// a direction the emitter and reader both understood.
if(match=line.match(new RegExp("^shift cube\\s+(".concat(_cubeDirections_js__WEBPACK_IMPORTED_MODULE_4__.CUBE_DIRECTIONS.join('|'),")$"),'i'))){const{id,block}=cmd('ledcube_shift');block[id].fields.DIR=[match[1].toLowerCase(),null];return ret(block);}if(match=line.match(/^hold frame(?:\s+for)?\s+(.+?)\s*(?:ms|milliseconds?)$/i)){const{id,block}=cmd('ledcube_hold');block[id].inputs.DURATION=val(match[1]);return ret(block);}if(match=line.match(/^fill column\s+(.+?)\s+(.+?)\s+with\s+(.+)$/i)){const{id,block}=cmd('ledcube_fillcolumn');block[id].inputs.X=val(match[1]);block[id].inputs.Y=val(match[2]);block[id].inputs.COLOUR=val(match[3]);return ret(block);}if(match=line.match(/^fill wall\s+(.+?)\s+with\s+(.+)$/i)){const{id,block}=cmd('ledcube_fillwall');block[id].inputs.Z=val(match[1]);block[id].inputs.COLOUR=val(match[2]);return ret(block);}if(/^invert cube$/i.test(line)){const{block}=cmd('ledcube_invert');return ret(block);}}// ---- Device convenience blocks (seven-segment, RGB LED, servo, motor, relay) ----
// Higher-level vocabulary over the pin/port primitives. A learner says
// "show digit 5" not "set port to font[5]".
if(match=line.match(/^show digit\s+(.+?)\s+on\s+(.+)$/i)){const{id,block}=cmd('devices_showdigit');block[id].inputs.DIGIT=val(match[1]);block[id].inputs.DISPLAY=val(match[2]);return ret(block);}if(match=line.match(/^set\s+(.+?)\s+colour to R\s+(.+?)\s+G\s+(.+?)\s+B\s+(.+)$/i)){const{id,block}=cmd('devices_setrgb');block[id].inputs.LED=val(match[1]);block[id].inputs.R=val(match[2]);block[id].inputs.G=val(match[3]);block[id].inputs.B=val(match[4]);return ret(block);}if(match=line.match(/^set\s+(.+?)\s+angle to\s+(.+)$/i)){const{id,block}=cmd('devices_setservo');block[id].inputs.SERVO=val(match[1]);block[id].inputs.ANGLE=val(match[2]);return ret(block);}if(match=line.match(/^set\s+(.+?)\s+speed to\s+(.+)$/i)){const{id,block}=cmd('devices_setmotor');block[id].inputs.MOTOR=val(match[1]);block[id].inputs.SPEED=val(match[2]);return ret(block);}if(match=line.match(/^set relay\s+(.+?)\s+(on|off)$/i)){const{id,block}=cmd('devices_setrelay');block[id].inputs.RELAY=val(match[1]);block[id].fields.STATE=[match[2].toLowerCase(),null];return ret(block);}if(match=line.match(/^set\s+(.+?)\s+direction\s+(forward|reverse|brake|coast)$/i)){const{id,block}=cmd('devices_setdirection');block[id].inputs.MOTOR=val(match[1]);block[id].fields.DIR=[match[2].toLowerCase(),null];return ret(block);}if(match=line.match(/^activate\s+(.+)$/i)){const{id,block}=cmd('devices_activate');block[id].inputs.DEVICE=val(match[1]);return ret(block);}if(match=line.match(/^deactivate\s+(.+)$/i)){const{id,block}=cmd('devices_deactivate');block[id].inputs.DEVICE=val(match[1]);return ret(block);}if(match=line.match(/^read temperature from\s+(.+)$/i)){// Reporter — handled in parseReporter, not here
}if(match=line.match(/^read light from\s+(.+)$/i)){// Reporter — handled in parseReporter, not here
}// ---- char_lcd blocks ----
if(match=line.match(/^lcd print\s+"([^"]*)"\s+on\s+(.+)$/i)){const{id,block}=cmd('devices_lcdprint');block[id].inputs.TEXT=[1,[10,match[1]]];block[id].inputs.DISPLAY=val(match[2]);return ret(block);}if(match=line.match(/^lcd print\s+(.+?)\s+on\s+(.+)$/i)){const{id,block}=cmd('devices_lcdprint');block[id].inputs.TEXT=val(match[1]);block[id].inputs.DISPLAY=val(match[2]);return ret(block);}if(match=line.match(/^lcd set cursor\s+(.+?)\s+(.+?)\s+on\s+(.+)$/i)){const{id,block}=cmd('devices_lcdcursor');block[id].inputs.ROW=val(match[1]);block[id].inputs.COL=val(match[2]);block[id].inputs.DISPLAY=val(match[3]);return ret(block);}if(match=line.match(/^lcd clear\s+(.+)$/i)){const displayArg=match[1].trim();if(/\s/.test(displayArg)){this.warn(null,"lcd clear takes a single display name, but got \"".concat(displayArg,"\" (contains whitespace) \u2014 did you mean \"lcd clear <display>\"?"));return null;}const{id,block}=cmd('devices_lcdclear');block[id].inputs.DISPLAY=val(match[1]);return ret(block);}// ---- tft blocks (ILI9341) ----
if(match=line.match(/^tft pixel\s+(.+?)\s+(.+?)\s+R\s+(.+?)\s+G\s+(.+?)\s+B\s+(.+?)\s+on\s+(.+)$/i)){const{id,block}=cmd('devices_tftpixel');block[id].inputs.X=val(match[1]);block[id].inputs.Y=val(match[2]);block[id].inputs.R=val(match[3]);block[id].inputs.G=val(match[4]);block[id].inputs.B=val(match[5]);block[id].inputs.DISPLAY=val(match[6]);return ret(block);}if(match=line.match(/^tft fill\s+(.+?)\s+(.+?)\s+(.+?)\s+(.+?)\s+R\s+(.+?)\s+G\s+(.+?)\s+B\s+(.+?)\s+on\s+(.+)$/i)){const{id,block}=cmd('devices_tftfill');block[id].inputs.X=val(match[1]);block[id].inputs.Y=val(match[2]);block[id].inputs.W=val(match[3]);block[id].inputs.H=val(match[4]);block[id].inputs.R=val(match[5]);block[id].inputs.G=val(match[6]);block[id].inputs.B=val(match[7]);block[id].inputs.DISPLAY=val(match[8]);return ret(block);}if(match=line.match(/^tft print\s+"([^"]*)"\s+on\s+(.+)$/i)){const{id,block}=cmd('devices_tftprint');block[id].inputs.TEXT=[1,[10,match[1]]];block[id].inputs.DISPLAY=val(match[2]);return ret(block);}if(match=line.match(/^tft print\s+(.+?)\s+on\s+(.+)$/i)){const{id,block}=cmd('devices_tftprint');block[id].inputs.TEXT=val(match[1]);block[id].inputs.DISPLAY=val(match[2]);return ret(block);}if(match=line.match(/^tft set cursor\s+(.+?)\s+(.+?)\s+on\s+(.+)$/i)){const{id,block}=cmd('devices_tftcursor');block[id].inputs.ROW=val(match[1]);block[id].inputs.COL=val(match[2]);block[id].inputs.DISPLAY=val(match[3]);return ret(block);}if(match=line.match(/^tft clear\s+(.+)$/i)){const displayArg=match[1].trim();if(/\s/.test(displayArg)){this.warn(null,"tft clear takes a single display name, but got \"".concat(displayArg,"\" (contains whitespace) \u2014 did you mean \"tft clear <display>\"?"));return null;}const{id,block}=cmd('devices_tftclear');block[id].inputs.DISPLAY=val(match[1]);return ret(block);}// ---- oled blocks (SSD1306) ----
if(match=line.match(/^oled pixel\s+(.+?)\s+(.+?)\s+(.+?)\s+on\s+(.+)$/i)){const{id,block}=cmd('devices_oledpixel');block[id].inputs.X=val(match[1]);block[id].inputs.Y=val(match[2]);block[id].inputs.VALUE=val(match[3]);block[id].inputs.DISPLAY=val(match[4]);return ret(block);}if(match=line.match(/^oled print\s+"([^"]*)"\s+on\s+(.+)$/i)){const{id,block}=cmd('devices_oledprint');block[id].inputs.TEXT=[1,[10,match[1]]];block[id].inputs.DISPLAY=val(match[2]);return ret(block);}if(match=line.match(/^oled print\s+(.+?)\s+on\s+(.+)$/i)){const{id,block}=cmd('devices_oledprint');block[id].inputs.TEXT=val(match[1]);block[id].inputs.DISPLAY=val(match[2]);return ret(block);}// ---- grey blocks (the MakeCode lesson) ----
// `raw "<line>"` carries source a reader could not translate.
// It round-trips VERBATIM through the MicroPython emitter and
// degrades to a comment everywhere else — an import loses
// nothing, it just shows what it could not understand.
if(match=line.match(/^raw\s+"(.*)"\s*$/i)){const text=match[1].replace(/\\"/g,'"').replace(/\\\\/g,'\\');const{id,block}=cmd('bw_raw');block[id].fields.TEXT=[text,null];return ret(block);}if(match=line.match(/^oled set cursor\s+(.+?)\s+(.+?)\s+on\s+(.+)$/i)){const{id,block}=cmd('devices_oledcursor');block[id].inputs.ROW=val(match[1]);block[id].inputs.COL=val(match[2]);block[id].inputs.DISPLAY=val(match[3]);return ret(block);}if(match=line.match(/^oled clear\s+(.+)$/i)){const displayArg=match[1].trim();if(/\s/.test(displayArg)){this.warn(null,"oled clear takes a single display name, but got \"".concat(displayArg,"\" (contains whitespace) \u2014 did you mean \"oled clear <display>\"?"));return null;}const{id,block}=cmd('devices_oledclear');block[id].inputs.DISPLAY=val(match[1]);return ret(block);}// ---- led_matrix blocks ----
if(match=line.match(/^set pixel\s+(.+?)\s+(.+?)\s+to\s+(.+?)\s+on\s+(.+)$/i)){const{id,block}=cmd('devices_setpixel');block[id].inputs.X=val(match[1]);block[id].inputs.Y=val(match[2]);block[id].inputs.BRIGHTNESS=val(match[3]);block[id].inputs.MATRIX=val(match[4]);return ret(block);}if(match=line.match(/^clear matrix\s+(.+)$/i)){const{id,block}=cmd('devices_clearmatrix');block[id].inputs.MATRIX=val(match[1]);return ret(block);}// ---- neopixel blocks ----
if(match=line.match(/^set neopixel\s+(.+?)\s+to R\s+(.+?)\s+G\s+(.+?)\s+B\s+(.+?)\s+on\s+(.+)$/i)){const{id,block}=cmd('devices_setneopixel');block[id].inputs.INDEX=val(match[1]);block[id].inputs.R=val(match[2]);block[id].inputs.G=val(match[3]);block[id].inputs.B=val(match[4]);block[id].inputs.STRIP=val(match[5]);return ret(block);}if(match=line.match(/^clear neopixels on\s+(.+)$/i)){const{id,block}=cmd('devices_clearneopixels');block[id].inputs.STRIP=val(match[1]);return ret(block);}// ---- Arrays & Vectors extension commands (anchored on `array "NAME"`; 0-based) ----
// syncExtensions() auto-declares the `arrays` extension from these opcodes.
const aName=n=>[1,[10,n]];if(match=line.match(/^new array\s+"([^"]*)"\s*=\s*range\s+(.+?)\s+to\s+(.+)$/i)){const{id,block}=cmd('arrays_createRange');block[id].inputs.NAME=aName(match[1]);block[id].inputs.START=val(match[2]);block[id].inputs.END=val(match[3]);return ret(block);}if(match=line.match(/^new 2D array\s+"([^"]*)"\s*=\s*(.+)$/i)){const{id,block}=cmd('arrays_create2D');block[id].inputs.NAME=aName(match[1]);block[id].inputs.JSON=[1,[10,match[2].trim()]];return ret(block);}if(match=line.match(/^new array\s+"([^"]*)"\s*=\s*(.+)$/i)){const{id,block}=cmd('arrays_create1D');block[id].inputs.NAME=aName(match[1]);block[id].inputs.JSON=[1,[10,match[2].trim()]];return ret(block);}if(match=line.match(/^new array\s+"([^"]*)"$/i)){const{id,block}=cmd('arrays_createEmpty');block[id].inputs.NAME=aName(match[1]);return ret(block);}if(match=line.match(/^push\s+(.+?)\s+to array\s+"([^"]*)"$/i)){const{id,block}=cmd('arrays_push');block[id].inputs.NAME=aName(match[2]);block[id].inputs.VALUE=val(match[1]);return ret(block);}if(match=line.match(/^set item\s+row\s+(.+?)\s+col\s+(.+?)\s+of array\s+"([^"]*)"\s+to\s+(.+)$/i)){const{id,block}=cmd('arrays_set2D');block[id].inputs.NAME=aName(match[3]);block[id].inputs.ROW=val(match[1]);block[id].inputs.COL=val(match[2]);block[id].inputs.VALUE=val(match[4]);return ret(block);}if(match=line.match(/^set item\s+(.+?)\s+of array\s+"([^"]*)"\s+to\s+(.+)$/i)){const{id,block}=cmd('arrays_set');block[id].inputs.NAME=aName(match[2]);block[id].inputs.INDEX=val(match[1]);block[id].inputs.VALUE=val(match[3]);return ret(block);}if(match=line.match(/^insert\s+(.+?)\s+at\s+(.+?)\s+of array\s+"([^"]*)"$/i)){const{id,block}=cmd('arrays_insert');block[id].inputs.NAME=aName(match[3]);block[id].inputs.INDEX=val(match[2]);block[id].inputs.VALUE=val(match[1]);return ret(block);}if(match=line.match(/^remove item\s+(.+?)\s+of array\s+"([^"]*)"$/i)){const{id,block}=cmd('arrays_remove');block[id].inputs.NAME=aName(match[2]);block[id].inputs.INDEX=val(match[1]);return ret(block);}if(match=line.match(/^delete array\s+"([^"]*)"$/i)){const{id,block}=cmd('arrays_delete');block[id].inputs.NAME=aName(match[1]);return ret(block);}// ---- Motion ----------------------------------------------------------------
if(match=line.match(/^move\s+(.+)\s+steps?$/i)){const{id,block}=cmd('motion_movesteps');block[id].inputs.STEPS=val(match[1]);return ret(block);}if(match=line.match(/^turn\s+(left|right)\s+(.+)\s+degrees?$/i)){const{id,block}=cmd(match[1].toLowerCase()==='left'?'motion_turnleft':'motion_turnright');block[id].inputs.DEGREES=val(match[2]);return ret(block);}if(match=line.match(/^turn\s+(.+)\s+degrees?$/i)){const{id,block}=cmd('motion_turnright');block[id].inputs.DEGREES=val(match[1]);return ret(block);}if(match=line.match(/^go to x:\s*(.+?)\s+y:\s*(.+)$/i)){const{id,block}=cmd('motion_gotoxy');block[id].inputs.X=val(match[1]);block[id].inputs.Y=val(match[2]);return ret(block);}if(match=line.match(/^glide\s+(.+?)\s+secs?\s+to x:\s*(.+?)\s+y:\s*(.+)$/i)){const{id,block}=cmd('motion_glidesecstoxy');block[id].inputs.SECS=val(match[1]);block[id].inputs.X=val(match[2]);block[id].inputs.Y=val(match[3]);return ret(block);}if(match=line.match(/^glide\s+(.+?)\s+secs?\s+to\s+(.+)$/i)){const{id,block}=cmd('motion_glideto');block[id].inputs.SECS=val(match[1]);block[id].inputs.TO=this.menuInput(context,'motion_glideto_menu','TO',this.spriteMenuValue(match[2]));return ret(block);}if(match=line.match(/^go to\s+(.+)$/i)){const{id,block}=cmd('motion_goto');block[id].inputs.TO=this.menuInput(context,'motion_goto_menu','TO',this.spriteMenuValue(match[1]));return ret(block);}if(match=line.match(/^change x by\s+(.+)$/i)){const{id,block}=cmd('motion_changexby');block[id].inputs.DX=val(match[1]);return ret(block);}if(match=line.match(/^change y by\s+(.+)$/i)){const{id,block}=cmd('motion_changeyby');block[id].inputs.DY=val(match[1]);return ret(block);}if(match=line.match(/^set x to\s+(.+)$/i)){const{id,block}=cmd('motion_setx');block[id].inputs.X=val(match[1]);return ret(block);}if(match=line.match(/^set y to\s+(.+)$/i)){const{id,block}=cmd('motion_sety');block[id].inputs.Y=val(match[1]);return ret(block);}if(match=line.match(/^point in direction\s+(.+)$/i)){const{id,block}=cmd('motion_pointindirection');block[id].inputs.DIRECTION=val(match[1]);return ret(block);}if(match=line.match(/^point towards\s+(.+)$/i)){const{id,block}=cmd('motion_pointtowards');block[id].inputs.TOWARDS=this.menuInput(context,'motion_pointtowards_menu','TOWARDS',this.spriteMenuValue(match[1]));return ret(block);}if(/^if on edge,?\s*bounce$/i.test(line)){return{block:this.createBlock('motion_ifonedgebounce').block,extraBlocks:{}};}if(match=line.match(/^set rotation style\s+(.+)$/i)){const{id,block}=cmd('motion_setrotationstyle');block[id].fields.STYLE=[match[1].trim(),null];return ret(block);}// ---- Looks -----------------------------------------------------------------
if(match=line.match(/^say\s+(.+?)(?:\s+for\s+(.+)\s+seconds?)?$/i)){const{id,block}=cmd(match[2]?'looks_sayforsecs':'looks_say');block[id].inputs.MESSAGE=val(match[1]);if(match[2])block[id].inputs.SECS=val(match[2]);return ret(block);}if(match=line.match(/^think\s+(.+?)(?:\s+for\s+(.+)\s+seconds?)?$/i)){const{id,block}=cmd(match[2]?'looks_thinkforsecs':'looks_think');block[id].inputs.MESSAGE=val(match[1]);if(match[2])block[id].inputs.SECS=val(match[2]);return ret(block);}if(line.toLowerCase()==='show')return{block:this.createBlock('looks_show').block,extraBlocks:{}};if(line.toLowerCase()==='hide')return{block:this.createBlock('looks_hide').block,extraBlocks:{}};if(match=line.match(/^switch costume to\s+(.+)$/i)){const arg=match[1].trim();const{id,block}=cmd('looks_switchcostumeto');// A parenthesised argument is a reporter expression (e.g. ("t" join v));
// anything else is a literal costume NAME carried in a costume menu shadow
// (a bare word must not become a variable reference).
if(arg.startsWith('(')){const rep=val(arg);const menu=this.menuInput(context,'looks_costume','COSTUME','');block[id].inputs.COSTUME=rep[0]===3?[3,rep[1],menu[1]]:rep;}else{block[id].inputs.COSTUME=this.menuInput(context,'looks_costume','COSTUME',this.unquote(arg));}return ret(block);}if(line.toLowerCase()==='next costume')return{block:this.createBlock('looks_nextcostume').block,extraBlocks:{}};if(match=line.match(/^switch backdrop to\s+(.+)$/i)){const{id,block}=cmd('looks_switchbackdropto');block[id].inputs.BACKDROP=this.menuInput(context,'looks_backdrops','BACKDROP',this.unquote(match[1]));return ret(block);}if(line.toLowerCase()==='next backdrop')return{block:this.createBlock('looks_nextbackdrop').block,extraBlocks:{}};if(match=line.match(/^change size by\s+(.+)$/i)){const{id,block}=cmd('looks_changesizeby');block[id].inputs.CHANGE=val(match[1]);return ret(block);}if(match=line.match(/^set size to\s+(.+)$/i)){const{id,block}=cmd('looks_setsizeto');block[id].inputs.SIZE=val(match[1]);return ret(block);}if(match=line.match(/^change\s+(color|fisheye|whirl|pixelate|mosaic|brightness|ghost)\s+effect by\s+(.+)$/i)){const{id,block}=cmd('looks_changeeffectby');block[id].fields.EFFECT=[match[1].toUpperCase(),null];block[id].inputs.CHANGE=val(match[2]);return ret(block);}if(match=line.match(/^set\s+(color|fisheye|whirl|pixelate|mosaic|brightness|ghost)\s+effect to\s+(.+)$/i)){const{id,block}=cmd('looks_seteffectto');block[id].fields.EFFECT=[match[1].toUpperCase(),null];block[id].inputs.VALUE=val(match[2]);return ret(block);}if(/^clear graphic effects$/i.test(line))return{block:this.createBlock('looks_cleargraphiceffects').block,extraBlocks:{}};if(/^go to front$/i.test(line)){const{id,block}=this.createBlock('looks_gotofrontback');block[id].fields.FRONT_BACK=['front',null];return{block,extraBlocks:{}};}if(/^go to back$/i.test(line)){const{id,block}=this.createBlock('looks_gotofrontback');block[id].fields.FRONT_BACK=['back',null];return{block,extraBlocks:{}};}if(match=line.match(/^go (forward|backward|back)\s+(.+?)\s+layers?$/i)){const{id,block}=cmd('looks_goforwardbackwardlayers');block[id].fields.FORWARD_BACKWARD=[match[1].toLowerCase()==='forward'?'forward':'backward',null];block[id].inputs.NUM=val(match[2]);return ret(block);}// ---- Sound -----------------------------------------------------------------
if(match=line.match(/^play sound\s+(.+)\s+until done$/i)){const{id,block}=cmd('sound_playuntildone');block[id].inputs.SOUND_MENU=val(match[1]);return ret(block);}if(match=line.match(/^play sound\s+(.+)$/i)){const{id,block}=cmd('sound_play');block[id].inputs.SOUND_MENU=val(match[1]);return ret(block);}if(line.toLowerCase()==='stop all sounds')return{block:this.createBlock('sound_stopallsounds').block,extraBlocks:{}};if(match=line.match(/^change volume by\s+(.+)$/i)){const{id,block}=cmd('sound_changevolumeby');block[id].inputs.VOLUME=val(match[1]);return ret(block);}if(match=line.match(/^set volume to\s+(.+)$/i)){const{id,block}=cmd('sound_setvolumeto');block[id].inputs.VOLUME=val(match[1]);return ret(block);}// ---- Pen -------------------------------------------------------------------
if(line.toLowerCase()==='clear'){ext('pen');return{block:this.createBlock('pen_clear').block,extraBlocks:{}};}if(line.toLowerCase()==='stamp'){ext('pen');return{block:this.createBlock('pen_stamp').block,extraBlocks:{}};}if(line.toLowerCase()==='pen down'){ext('pen');return{block:this.createBlock('pen_penDown').block,extraBlocks:{}};}if(line.toLowerCase()==='pen up'){ext('pen');return{block:this.createBlock('pen_penUp').block,extraBlocks:{}};}if(match=line.match(/^set pen color to\s+(.+)$/i)){ext('pen');const{id,block}=cmd('pen_setPenColorToColor');block[id].inputs.COLOR=val(match[1]);return ret(block);}if(match=line.match(/^change pen (color|saturation|brightness|transparency) by\s+(.+)$/i)){ext('pen');const{id,block}=cmd('pen_changePenColorParamBy');block[id].inputs.COLOR_PARAM=this.menuInput(context,'pen_menu_colorParam','colorParam',match[1].toLowerCase());block[id].inputs.VALUE=val(match[2]);return ret(block);}if(match=line.match(/^set pen (color|saturation|brightness|transparency) to\s+(.+)$/i)){ext('pen');const{id,block}=cmd('pen_setPenColorParamTo');block[id].inputs.COLOR_PARAM=this.menuInput(context,'pen_menu_colorParam','colorParam',match[1].toLowerCase());block[id].inputs.VALUE=val(match[2]);return ret(block);}if(match=line.match(/^change pen size by\s+(.+)$/i)){ext('pen');const{id,block}=cmd('pen_changePenSizeBy');block[id].inputs.SIZE=val(match[1]);return ret(block);}if(match=line.match(/^set pen size to\s+(.+)$/i)){ext('pen');const{id,block}=cmd('pen_setPenSizeTo');block[id].inputs.SIZE=val(match[1]);return ret(block);}// ---- Sensing ---------------------------------------------------------------
if(match=line.match(/^ask\s+(.+?)\s+and wait$/i)){const{id,block}=cmd('sensing_askandwait');block[id].inputs.QUESTION=val(match[1]);return ret(block);}if(line.toLowerCase()==='reset timer')return{block:this.createBlock('sensing_resettimer').block,extraBlocks:{}};if(match=line.match(/^set drag mode\s+(draggable|not draggable)$/i)){const{id,block}=this.createBlock('sensing_setdragmode');block[id].fields.DRAG_MODE=[match[1].toLowerCase(),null];return{block,extraBlocks:{}};}// ---- Music (extension) -----------------------------------------------------
if(match=line.match(/^play note\s+(.+?)\s+for\s+(.+)\s+beats?$/i)){ext('music');const{id,block}=cmd('music_playNoteForBeats');block[id].inputs.NOTE=val(match[1]);block[id].inputs.BEATS=val(match[2]);return ret(block);}if(match=line.match(/^play drum\s+(.+?)\s+for\s+(.+)\s+beats?$/i)){ext('music');const{id,block}=cmd('music_playDrumForBeats');block[id].inputs.DRUM=this.menuInput(context,'music_menu_DRUM','DRUM',match[1].trim());block[id].inputs.BEATS=val(match[2]);return ret(block);}if(match=line.match(/^rest for\s+(.+)\s+beats?$/i)){ext('music');const{id,block}=cmd('music_restForBeats');block[id].inputs.BEATS=val(match[1]);return ret(block);}if(match=line.match(/^set tempo to\s+(.+)$/i)){ext('music');const{id,block}=cmd('music_setTempo');block[id].inputs.TEMPO=val(match[1]);return ret(block);}if(match=line.match(/^change tempo by\s+(.+)$/i)){ext('music');const{id,block}=cmd('music_changeTempo');block[id].inputs.TEMPO=val(match[1]);return ret(block);}// ---- Lists (before the generic variable set/change) ------------------------
if((match=line.match(/^add\s+(.+?)\s+to\s+(.+)$/i))&&this.isListTarget(match[2],target)){const list=this.getOrCreateList(match[2].trim(),target);const{id,block}=cmd('data_addtolist');block[id].inputs.ITEM=val(match[1]);block[id].fields.LIST=[list.name,list.id];return ret(block);}if(match=line.match(/^delete all of\s+(.+)$/i)){const list=this.getOrCreateList(match[1].trim(),target);const{id,block}=this.createBlock('data_deletealloflist');block[id].fields.LIST=[list.name,list.id];return{block,extraBlocks:{}};}if((match=line.match(/^delete\s+(.+?)\s+of\s+(.+)$/i))&&this.isListTarget(match[2],target)){const list=this.getOrCreateList(match[2].trim(),target);const{id,block}=cmd('data_deleteoflist');block[id].inputs.INDEX=val(match[1]);block[id].fields.LIST=[list.name,list.id];return ret(block);}if(match=line.match(/^insert\s+(.+?)\s+at\s+(.+?)\s+of\s+(.+)$/i)){const list=this.getOrCreateList(match[3].trim(),target);const{id,block}=cmd('data_insertatlist');block[id].inputs.ITEM=val(match[1]);block[id].inputs.INDEX=val(match[2]);block[id].fields.LIST=[list.name,list.id];return ret(block);}if(match=line.match(/^replace item\s+(.+?)\s+of\s+(.+?)\s+with\s+(.+)$/i)){const list=this.getOrCreateList(match[2].trim(),target);const{id,block}=cmd('data_replaceitemoflist');block[id].inputs.INDEX=val(match[1]);block[id].inputs.ITEM=val(match[3]);block[id].fields.LIST=[list.name,list.id];return ret(block);}if(match=line.match(/^show list\s+(.+)$/i)){const list=this.getOrCreateList(match[1].trim(),target);this.setMonitorVisible(list.id,true);const{id,block}=this.createBlock('data_showlist');block[id].fields.LIST=[list.name,list.id];return{block,extraBlocks:{}};}if(match=line.match(/^hide list\s+(.+)$/i)){const list=this.getOrCreateList(match[1].trim(),target);this.setMonitorVisible(list.id,false);const{id,block}=this.createBlock('data_hidelist');block[id].fields.LIST=[list.name,list.id];return{block,extraBlocks:{}};}if(match=line.match(/^show variable\s+(.+)$/i)){const v=this.getOrCreateVariable(match[1].trim(),target);this.setMonitorVisible(v.id,true);const{id,block}=this.createBlock('data_showvariable');block[id].fields.VARIABLE=[v.name,v.id];return{block,extraBlocks:{}};}if(match=line.match(/^hide variable\s+(.+)$/i)){const v=this.getOrCreateVariable(match[1].trim(),target);this.setMonitorVisible(v.id,false);const{id,block}=this.createBlock('data_hidevariable');block[id].fields.VARIABLE=[v.name,v.id];return{block,extraBlocks:{}};}// ---- Control ---------------------------------------------------------------
if(match=line.match(/^wait\s+(.+?)\s+(seconds?|secs?|s|ms|milliseconds?)$/i)){const{id,block}=cmd('control_wait');const unit=match[2].toLowerCase();// Scratch stores duration in seconds; convert ms.
if(unit==='ms'||unit.startsWith('millisecond')){const raw=match[1].trim();const n=Number(raw);block[id].inputs.DURATION=Number.isFinite(n)?val(String(n/1000)):val("".concat(raw," / 1000"));}else{block[id].inputs.DURATION=val(match[1]);}return ret(block);}if(match=line.match(/^wait until\s+(.+)$/i)){const{id,block}=cmd('control_wait_until');block[id].inputs.CONDITION=[2,this.parseCondition(match[1],context)];return ret(block);}if(line.toLowerCase()==='stop all'){const{id,block}=this.createBlock('control_stop');block[id].fields.STOP_OPTION=['all',null];block[id].mutation={tagName:'mutation',children:[],hasnext:'false'};return{block,extraBlocks:{}};}if(/^stop this script$/i.test(line)){const{id,block}=this.createBlock('control_stop');block[id].fields.STOP_OPTION=['this script',null];block[id].mutation={tagName:'mutation',children:[],hasnext:'false'};return{block,extraBlocks:{}};}if(/^stop other scripts in sprite$/i.test(line)){const{id,block}=this.createBlock('control_stop');block[id].fields.STOP_OPTION=['other scripts in sprite',null];block[id].mutation={tagName:'mutation',children:[],hasnext:'true'};return{block,extraBlocks:{}};}if(match=line.match(/^create clone of\s+(.+)$/i)){const{id,block}=cmd('control_create_clone_of');block[id].inputs.CLONE_OPTION=this.menuInput(context,'control_create_clone_of_menu','CLONE_OPTION',this.cloneMenuValue(match[1]));return ret(block);}if(/^delete this clone$/i.test(line)){return{block:this.createBlock('control_delete_this_clone').block,extraBlocks:{}};}// ---- Broadcasts ------------------------------------------------------------
if(match=line.match(/^broadcast\s+(.+?)\s+and wait$/i)){const bc=this.getOrCreateBroadcast(this.unquote(match[1]));const{id,block}=cmd('event_broadcastandwait');block[id].inputs.BROADCAST_INPUT=[1,[11,bc.name,bc.id]];return ret(block);}if(match=line.match(/^broadcast\s+(.+)$/i)){const bc=this.getOrCreateBroadcast(this.unquote(match[1]));const{id,block}=cmd('event_broadcast');block[id].inputs.BROADCAST_INPUT=[1,[11,bc.name,bc.id]];return ret(block);}// ---- Custom block calls (before the generic variable fallback) -------------
if(this.procedures.length){const call=this.tryProcedureCall(line,target);if(call)return call;}// ---- Generic variable set / change (LAST so specific commands win) ---------
if(match=line.match(/^set\s+(.+?)\s+to\s+(.+)$/i)){const variable=this.getOrCreateVariable(match[1].trim(),target);const{id,block}=cmd('data_setvariableto');block[id].inputs.VALUE=val(match[2]);block[id].fields.VARIABLE=[variable.name,variable.id];return ret(block);}if(match=line.match(/^change\s+(.+?)\s+by\s+(.+)$/i)){const variable=this.getOrCreateVariable(match[1].trim(),target);const{id,block}=cmd('data_changevariableby');block[id].inputs.VALUE=val(match[2]);block[id].fields.VARIABLE=[variable.name,variable.id];return ret(block);}throw new ParseError("Unknown command: \"".concat(line,"\""));}// Menu value helpers ------------------------------------------------------------
spriteMenuValue(name){name=this.unquote(name).trim();if(/^mouse(-pointer)?$/i.test(name))return'_mouse_';if(/^random( position)?$/i.test(name))return'_random_';return name;}cloneMenuValue(name){name=this.unquote(name).trim();if(/^(myself|me|this sprite)$/i.test(name))return'_myself_';return name;}// Only treat `add/delete X of Y` as a list op when Y is plausibly a list.
isListTarget(name,target){name=name.trim();return this.listExists(name,target)||this.declaredGlobalLists.has(name)||this.declaredLocalLists.has("".concat(target.name,":").concat(name));}// Generate an audible 16-bit PCM mono WAV sine tone (with short fades to avoid clicks).
// 22.05 kHz keeps a beep perfectly clear while roughly halving the file size.
makeToneWav(freq,durationSec){let rate=arguments.length>2&&arguments[2]!==undefined?arguments[2]:22050;const sampleCount=Math.max(1,Math.floor(rate*durationSec));const dataSize=sampleCount*2;const buf=new ArrayBuffer(44+dataSize);const dv=new DataView(buf);const writeStr=(off,s)=>{for(let i=0;i<s.length;i++)dv.setUint8(off+i,s.charCodeAt(i));};writeStr(0,'RIFF');dv.setUint32(4,36+dataSize,true);writeStr(8,'WAVE');writeStr(12,'fmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);dv.setUint32(24,rate,true);dv.setUint32(28,rate*2,true);dv.setUint16(32,2,true);dv.setUint16(34,16,true);writeStr(36,'data');dv.setUint32(40,dataSize,true);const fade=Math.min(Math.floor(sampleCount/8),400);for(let i=0;i<sampleCount;i++){let amp=0.35;if(i<fade)amp*=i/fade;else if(i>sampleCount-fade)amp*=(sampleCount-i)/fade;const s=Math.sin(2*Math.PI*freq*i/rate)*amp;dv.setInt16(44+i*2,Math.max(-1,Math.min(1,s))*32767,true);}return{data:new Uint8Array(buf),sampleCount,rate};}// Register a generated tone as a sound asset and return its sound descriptor.
registerSound(name,freq,durationSec){const{data,sampleCount,rate}=this.makeToneWav(freq,durationSec);const assetId=this.generateAssetId();this.assets.set(assetId,{type:'wav',data,filename:"".concat(assetId,".wav"),metadata:{}});return{assetId,name,dataFormat:'wav',rate,sampleCount,md5ext:"".concat(assetId,".wav")};}// Build a distinct costume SVG. `variant` slightly squishes the shape so cycling
// through a sprite's costumes reads as a simple animation.
buildCostume(spriteName,color,variant,costumeName){const letter=(spriteName.trim()[0]||'S').toUpperCase().replace(/[<>&"]/g,'');const ry=36-variant%3*6;// bob up/down across frames
const cy=40+variant%3*3;const assetId=this.generateAssetId();const svg="<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"80\" height=\"80\" viewBox=\"0 0 80 80\"><ellipse cx=\"40\" cy=\"".concat(cy,"\" rx=\"36\" ry=\"").concat(ry,"\" fill=\"").concat(color,"\" stroke=\"#000000\" stroke-width=\"3\"/><text x=\"40\" y=\"").concat(cy+13,"\" font-size=\"40\" text-anchor=\"middle\" fill=\"#ffffff\" font-family=\"Helvetica, Arial, sans-serif\">").concat(letter,"</text></svg>");this.assets.set(assetId,{type:'svg',data:svg,filename:"".concat(assetId,".svg"),metadata:{width:80,height:80}});return{assetId,name:costumeName,md5ext:"".concat(assetId,".svg"),dataFormat:'svg',rotationCenterX:40,rotationCenterY:40};}// Build a "tile" costume: a rounded square (optionally filled) with centered
// text — digits, letters, symbols. This is what lets grid games render real
// numbers/marks (2048, minesweeper, tic-tac-toe) instead of recoloured blobs.
buildTileCostume(text,bg,fg,costumeName){const size=80;const assetId=this.generateAssetId();const esc=String(text).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;','\'':'&#39;'})[c]);const n=esc.replace(/&[a-z#0-9]+;/g,'x').length;const fontSize=n>=4?24:n===3?32:n===2?40:48;const y=40+fontSize*0.34;const bgRect=bg&&bg!=='none'?"<rect x=\"3\" y=\"3\" width=\"74\" height=\"74\" rx=\"10\" fill=\"".concat(bg,"\" stroke=\"#00000033\" stroke-width=\"2\"/>"):'';const label=esc?"<text x=\"40\" y=\"".concat(y,"\" font-size=\"").concat(fontSize,"\" text-anchor=\"middle\" fill=\"").concat(fg,"\" font-family=\"Helvetica, Arial, sans-serif\" font-weight=\"bold\">").concat(esc,"</text>"):'';const svg="<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"".concat(size,"\" height=\"").concat(size,"\" viewBox=\"0 0 ").concat(size," ").concat(size,"\">").concat(bgRect).concat(label,"</svg>");this.assets.set(assetId,{type:'svg',data:svg,filename:"".concat(assetId,".svg"),metadata:{width:size,height:size}});return{assetId,name:costumeName,md5ext:"".concat(assetId,".svg"),dataFormat:'svg',rotationCenterX:size/2,rotationCenterY:size/2};}// Split a COSTUME spec into tokens, keeping "quoted strings" as single tokens.
tokenizeCostumeSpec(s){const out=[];const re=/"([^"]*)"|(\S+)/g;let m;while((m=re.exec(s))!==null)out.push(m[1]!==undefined?"\"".concat(m[1],"\""):m[2]);return out;}// Build a solid-colour backdrop SVG.
buildBackdrop(color,name){const assetId=this.generateAssetId();const svg="<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"480\" height=\"360\" viewBox=\"0 0 480 360\"><rect width=\"480\" height=\"360\" fill=\"".concat(color,"\"/></svg>");this.assets.set(assetId,{type:'svg',data:svg,filename:"".concat(assetId,".svg"),metadata:{width:480,height:360}});return{assetId,name,md5ext:"".concat(assetId,".svg"),dataFormat:'svg',rotationCenterX:240,rotationCenterY:180};}// Build a plain geometric costume at true size. Kinds: rect/square/circle/ellipse/
// triangle, or `polygon` with an arbitrary list of x,y points (custom SVG art).
buildShapeCostume(color,kind,dims){const s=2;let w,h,shape;if(kind==='polygon'){const pts=[];for(let i=0;i+1<dims.length;i+=2)pts.push([dims[i],dims[i+1]]);while(pts.length<3)pts.push([0,0]);const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);const minX=Math.min(...xs),minY=Math.min(...ys);w=Math.max(...xs)-minX||40;h=Math.max(...ys)-minY||40;const pointsStr=pts.map(p=>"".concat(p[0]-minX+s,",").concat(p[1]-minY+s)).join(' ');const W0=w+2*s,H0=h+2*s;shape="<polygon points=\"".concat(pointsStr,"\" fill=\"").concat(color,"\" stroke=\"#000000\" stroke-width=\"").concat(s,"\" stroke-linejoin=\"round\"/>");const svg0="<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"".concat(W0,"\" height=\"").concat(H0,"\" viewBox=\"0 0 ").concat(W0," ").concat(H0,"\">").concat(shape,"</svg>");const assetId0=this.generateAssetId();this.assets.set(assetId0,{type:'svg',data:svg0,filename:"".concat(assetId0,".svg"),metadata:{width:W0,height:H0}});return{assetId:assetId0,name:'costume1',md5ext:"".concat(assetId0,".svg"),dataFormat:'svg',rotationCenterX:W0/2,rotationCenterY:H0/2};}if(kind==='rect'||kind==='ellipse'){w=dims[0]||40;h=dims[1]||dims[0]||40;}else{w=dims[0]||40;h=w;}// square / circle / triangle
const W=w+2*s,H=h+2*s;if(kind==='circle')shape="<circle cx=\"".concat(W/2,"\" cy=\"").concat(H/2,"\" r=\"").concat(w/2,"\" fill=\"").concat(color,"\" stroke=\"#000000\" stroke-width=\"").concat(s,"\"/>");else if(kind==='ellipse')shape="<ellipse cx=\"".concat(W/2,"\" cy=\"").concat(H/2,"\" rx=\"").concat(w/2,"\" ry=\"").concat(h/2,"\" fill=\"").concat(color,"\" stroke=\"#000000\" stroke-width=\"").concat(s,"\"/>");else if(kind==='triangle')shape="<polygon points=\"".concat(W/2,",").concat(s," ").concat(W-s,",").concat(H-s," ").concat(s,",").concat(H-s,"\" fill=\"").concat(color,"\" stroke=\"#000000\" stroke-width=\"").concat(s,"\"/>");else shape="<rect x=\"".concat(s,"\" y=\"").concat(s,"\" width=\"").concat(w,"\" height=\"").concat(h,"\" rx=\"3\" fill=\"").concat(color,"\" stroke=\"#000000\" stroke-width=\"").concat(s,"\"/>");const svg="<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"".concat(W,"\" height=\"").concat(H,"\" viewBox=\"0 0 ").concat(W," ").concat(H,"\">").concat(shape,"</svg>");const assetId=this.generateAssetId();this.assets.set(assetId,{type:'svg',data:svg,filename:"".concat(assetId,".svg"),metadata:{width:W,height:H}});return{assetId,name:'costume1',md5ext:"".concat(assetId,".svg"),dataFormat:'svg',rotationCenterX:W/2,rotationCenterY:H/2};}// SHAPE <kind> <dims...> [#hex]: replace a sprite's first costume with a real shape.
setShape(target,spec,lineIndex){if(target.isStage){this.warn(lineIndex,'SHAPE has no effect on the Stage (use BACKDROP)');return;}const tokens=spec.split(/\s+/).filter(Boolean);const kind=(tokens[0]||'').toLowerCase();if(!['rect','square','circle','ellipse','triangle','polygon'].includes(kind)){this.warn(lineIndex,"Unknown SHAPE \"".concat(tokens[0],"\" (use rect/square/circle/ellipse/triangle/polygon)"));return;}const hex=tokens.find(t=>/^#[0-9a-fA-F]{6}$/.test(t));const dims=tokens.slice(1).filter(t=>/^\d+(\.\d+)?$/.test(t)).map(Number);const color=hex?hex.toLowerCase():this.spriteColors.get(target.name)||'#4C97FF';const old=target.costumes[0];if(old&&old.assetId)this.assets.delete(old.assetId);target.costumes[0]=this.buildShapeCostume(color,kind,dims.length?dims:[40]);target.costumes[0]._shapeSpec=spec.trim();// remember directive for lossless round-trip
}// Add an extra costume/backdrop to a target (used by COSTUME / BACKDROP declarations).
// Supported specs (sprites):
//   COSTUME <name>                         legacy letter-in-a-circle frame
//   COSTUME <name> tile "<txt>" <bg> [fg]  rounded square with centered text
//   COSTUME <name> label "<txt>" [fg]      transparent centered text
//   COSTUME <name> <shape> <dims..> [#hex] a real geometric costume (square/circle/…)
addCostume(target,spec){if(target.isStage){const tks=this.tokenizeCostumeSpec(spec);const name=this.unquote(tks[0]||'backdrop');const hex=tks.find(t=>/^#[0-9a-fA-F]{6}$/.test(t));const palette=['#576065','#4a6fa5','#8a5a83','#3d7068','#a5794a'];const color=hex||palette[(target.costumes.length-1)%palette.length];const bd=this.buildBackdrop(color,name);bd._spec=spec.trim();target.costumes.push(bd);return;}const tokens=this.tokenizeCostumeSpec(spec);const name=this.unquote(tokens[0]||"costume".concat(target.costumes.length+1));const kind=(tokens[1]||'').toLowerCase();let costume;if(kind==='tile'||kind==='label'){const text=this.unquote(tokens[2]||'');const colors=tokens.slice(3).filter(t=>/^#[0-9a-fA-F]{6}$/.test(t));const bg=kind==='tile'?colors[0]||'#cccccc':'none';const fg=kind==='tile'?colors[1]||'#222222':colors[0]||'#222222';costume=this.buildTileCostume(text,bg,fg,name);}else if(['rect','square','circle','ellipse','triangle','polygon'].includes(kind)){const hex=tokens.find(t=>/^#[0-9a-fA-F]{6}$/.test(t));const dims=tokens.slice(2).filter(t=>/^\d+(\.\d+)?$/.test(t)).map(Number);const color=hex?hex.toLowerCase():this.spriteColors.get(target.name)||'#4C97FF';costume=this.buildShapeCostume(color,kind,dims.length?dims:[40]);costume.name=name;}else{const color=this.spriteColors.get(target.name)||'#4C97FF';costume=this.buildCostume(target.name,color,target.costumes.length,name);}costume._spec=spec.trim();// remember directive for lossless round-trip
target.costumes.push(costume);}createStage(){return{isStage:true,name:"Stage",variables:{},lists:{},broadcasts:{},blocks:{},comments:{},currentCostume:0,costumes:[{assetId:"cd21514d0531fdffb22204e0ec5ed84a",name:"backdrop1",md5ext:"cd21514d0531fdffb22204e0ec5ed84a.svg",dataFormat:"svg",rotationCenterX:240,rotationCenterY:180}],sounds:[this.registerSound('Pop',800,0.12)],volume:100,layerOrder:0,tempo:60,videoTransparency:50,videoState:"on",textToSpeechLanguage:null};}// Build a distinct colored first costume so sprites don't all render identically.
createSpriteCostume(name){const palette=['#4C97FF','#FF6680','#59C059','#FFAB19','#9966FF','#FF8C1A','#0FBD8C','#DB6E00'];const color=palette[this.spriteColorIndex++%palette.length];this.spriteColors.set(name,color);return this.buildCostume(name,color,0,'costume1');}createSprite(name){return{isStage:false,name,variables:{},lists:{},broadcasts:{},blocks:{},comments:{},currentCostume:0,costumes:[this.createSpriteCostume(name)],sounds:[this.registerSound('Meow',320,0.25)],volume:100,layerOrder:1,visible:true,x:0,y:0,size:100,direction:90,draggable:false,rotationStyle:"all around"};}parse(pseudocode){this.reset();if(!pseudocode.trim()){throw new ParseError("Pseudocode is empty");}// Normalise line endings and expand leading tabs so tab- or CRLF-indented files
// parse the same as space-indented ones.
const lines=pseudocode.replace(/\r\n?/g,'\n').split('\n').map(raw=>{const line=this.stripComment(raw);const lead=line.match(/^[ \t]*/)[0].replace(/\t/g,'  ');return lead+line.slice(line.match(/^[ \t]*/)[0].length);});const getIndent=s=>s.match(/^\s*/)[0].length;// Indentation of the next non-blank line after `idx` (or -1 if none).
const nextIndent=idx=>{for(let j=idx+1;j<lines.length;j++){if(lines[j].trim())return getIndent(lines[j]);}return-1;};// Child-block indent: the actual indent of the following line when it is deeper
// than the block header, so any consistent indent step (2, 4, tab…) works.
const childIndent=(idx,headerIndent)=>{const ni=nextIndent(idx);return ni>headerIndent?ni:headerIndent+2;};const stage=this.createStage();this.project.targets.push(stage);let currentTarget=stage;const parseStructure=(startIndex,indentLevel,target)=>{let i=startIndex;let firstBlockId=null;let lastBlockId=null;const allBlocks={};const linkBlock=newBlockData=>{if(!newBlockData||!newBlockData.block)return;const newId=Object.keys(newBlockData.block)[0];Object.assign(allBlocks,newBlockData.extraBlocks||{},newBlockData.block);if(!firstBlockId)firstBlockId=newId;if(lastBlockId){allBlocks[lastBlockId].next=newId;allBlocks[newId].parent=lastBlockId;}lastBlockId=newId;this.attachPendingComment(target,allBlocks[newId],newId);};while(i<lines.length){const line=lines[i];if(!line.trim()){i++;continue;}// A `# comment` line buffers onto the next block created (see linkBlock).
if(line.trim().startsWith('#')){const text=line.trim().replace(/^#+\s?/,'');this._pendingComment=this._pendingComment?"".concat(this._pendingComment,"\n").concat(text):text;i++;continue;}const currentIndent=getIndent(line);if(currentIndent<indentLevel)break;if(currentIndent>indentLevel){this.warn(i,"Skipping line with unexpected indentation: \"".concat(line.trim(),"\""));i++;continue;}const trimmed=line.trim();if(trimmed.endsWith(':')){let newBlockData;const context={target,extraBlocks:{},parentId:null};// A comment written above `IF …:` belongs to the IF. The body is
// parsed before the control block is linked, so without setting
// the pending comment aside here the body's first statement
// swallows it — and the decompiler then writes it one level in,
// which is not what was written and does not survive a round trip.
const ownComment=this._pendingComment;this._pendingComment='';if(trimmed.toUpperCase().startsWith('FOREVER')){newBlockData={block:this.createBlock('control_forever').block,extraBlocks:{}};}else if(/^REPEAT\s+UNTIL\b/i.test(trimmed)){const m=trimmed.match(/^REPEAT\s+UNTIL\s+(.+):$/i);if(!m){this.warn(i,"Malformed REPEAT UNTIL (expected \"REPEAT UNTIL <condition>:\"): \"".concat(trimmed,"\""));this._pendingComment=ownComment;i++;continue;}const{id,block}=this.createBlock('control_repeat_until');context.parentId=id;block[id].inputs.CONDITION=[2,this.parseCondition(m[1],context)];newBlockData={block,extraBlocks:context.extraBlocks};}else if(trimmed.toUpperCase().startsWith('REPEAT')){const m=trimmed.match(/REPEAT\s+(.+?):/i);if(!m){this.warn(i,"Malformed REPEAT (expected \"REPEAT <count>:\"): \"".concat(trimmed,"\""));this._pendingComment=ownComment;i++;continue;}const{id,block}=this.createBlock('control_repeat');context.parentId=id;block[id].inputs.TIMES=this.parseValue(m[1],context);newBlockData={block,extraBlocks:context.extraBlocks};}else if(trimmed.toUpperCase().startsWith('IF')){const m=trimmed.match(/IF\s+(.+?)\s+THEN:/i);if(!m){this.warn(i,"Malformed IF (expected \"IF <condition> THEN:\"): \"".concat(trimmed,"\""));this._pendingComment=ownComment;i++;continue;}const{id,block}=this.createBlock('control_if');context.parentId=id;const condId=this.parseCondition(m[1],context);block[id].inputs.CONDITION=[2,condId];newBlockData={block,extraBlocks:context.extraBlocks};}else if(trimmed.toUpperCase().startsWith('ELSE')){// Find the parent IF block to convert to IF_ELSE
this._pendingComment=ownComment;if(lastBlockId&&allBlocks[lastBlockId]&&allBlocks[lastBlockId].opcode==='control_if'){allBlocks[lastBlockId].opcode='control_if_else';const childResult=parseStructure(i+1,childIndent(i,currentIndent),target);if(childResult.firstBlockId){allBlocks[lastBlockId].inputs.SUBSTACK2=[2,childResult.firstBlockId];childResult.blocks[childResult.firstBlockId].parent=lastBlockId;Object.assign(allBlocks,childResult.blocks);}i=childResult.endIndex;continue;}else{this.warn(i,'ELSE block without matching IF block');}}if(newBlockData){const childResult=parseStructure(i+1,childIndent(i,currentIndent),target);const blockId=Object.keys(newBlockData.block)[0];if(childResult.firstBlockId){newBlockData.block[blockId].inputs.SUBSTACK=[2,childResult.firstBlockId];childResult.blocks[childResult.firstBlockId].parent=blockId;Object.assign(newBlockData.extraBlocks,childResult.blocks);}this._pendingComment=ownComment;// …and hand it to the block it was written for
linkBlock(newBlockData);i=childResult.endIndex;continue;}}else{try{linkBlock(this.parseCommand(trimmed,target));}catch(error){if(error.isSB3Error){this.warn(i,error.message);}else{throw error;}}}i++;}return{blocks:allBlocks,firstBlockId,endIndex:i};};// First pass: collect sprite names and register all custom-block signatures so
// forward references (sensing_of a later sprite, calling a later DEFINE) resolve.
for(const l of lines){const t=l.trim();const sm=t.match(/^SPRITE\s+(.+?):/i);if(sm)this.targetNames.add(sm[1].trim());if(/^DEFINE\b/i.test(t))this.registerProcedure(t);}let i=0;while(i<lines.length){const line=lines[i];const trimmed=line.trim();if(!trimmed){i++;continue;}// A `# comment` before a hat (or sprite) buffers onto the next block created.
if(trimmed.startsWith('#')){const text=trimmed.replace(/^#+\s?/,'');this._pendingComment=this._pendingComment?"".concat(this._pendingComment,"\n").concat(text):text;i++;continue;}// Explicit scope declarations
let decl;if(decl=trimmed.match(/^(GLOBAL|LOCAL)\s+LIST\s+(.+)$/i)){const name=decl[2].trim();if(decl[1].toUpperCase()==='GLOBAL')this.declaredGlobalLists.add(name);else this.declaredLocalLists.add("".concat(currentTarget.name,":").concat(name));this.getOrCreateList(name,currentTarget);i++;continue;}if(decl=trimmed.match(/^LIST\s+(.+)$/i)){const name=decl[1].trim();if(currentTarget.isStage)this.declaredGlobalLists.add(name);else this.declaredLocalLists.add("".concat(currentTarget.name,":").concat(name));this.getOrCreateList(name,currentTarget);i++;continue;}if(decl=trimmed.match(/^(GLOBAL|LOCAL)\s+(.+)$/i)){const name=decl[2].trim();if(decl[1].toUpperCase()==='GLOBAL')this.declaredGlobals.add(name);else this.declaredLocals.add("".concat(currentTarget.name,":").concat(name));this.getOrCreateVariable(name,currentTarget);i++;continue;}// STC12 / 8051 target declarations (DEVICE / CLOCK / PIN / PORT / PART). Inert
// for every other target; generateC() is the only consumer.
if(/^(DEVICE|CLOCK|PIN|PORT|PART|TABLE|LEDCUBE|MAP|CHIP)\b/i.test(trimmed)&&this.parseStcDeclaration(trimmed,i)){i++;continue;}// Asset declarations: shape, extra costumes (animation frames), backdrops, sounds.
if(decl=trimmed.match(/^SHAPE\s+(.+)$/i)){this.setShape(currentTarget,decl[1].trim(),i);i++;continue;}if(decl=trimmed.match(/^COSTUME\s+(.+)$/i)){this.addCostume(currentTarget,decl[1].trim());i++;continue;}if(decl=trimmed.match(/^BACKDROP\s+(.+)$/i)){this.addCostume(stage,decl[1].trim());i++;continue;}if(decl=trimmed.match(/^SOUND\s+(.+?)(?:\s+(\d+))?$/i)){const freq=decl[2]?Number(decl[2]):440;currentTarget.sounds.push(this.registerSound(this.unquote(decl[1].trim()),freq,0.3));i++;continue;}if(trimmed.toUpperCase().startsWith('SPRITE')||trimmed.toUpperCase().startsWith('STAGE')){if(trimmed.toUpperCase().startsWith('SPRITE')){const m=trimmed.match(/SPRITE\s+(.+?):/i);if(!m){this.warn(i,"Malformed SPRITE header (expected \"SPRITE <name>:\"): \"".concat(trimmed,"\""));i++;continue;}const spriteName=m[1].trim();if(this.project.targets.some(t=>!t.isStage&&t.name===spriteName)){this.warn(i,"Duplicate sprite name \"".concat(spriteName,"\" \u2014 sprite names must be unique"));}currentTarget=this.createSprite(spriteName);this.project.targets.push(currentTarget);}else{currentTarget=stage;}i++;}else if(trimmed.toUpperCase().startsWith('WHEN')){try{const eventData=this.parseCommand(trimmed,currentTarget);const eventId=Object.keys(eventData.block)[0];eventData.block[eventId].topLevel=true;eventData.block[eventId].x=50+this.scriptCount%3*350;eventData.block[eventId].y=50+Math.floor(this.scriptCount/3)*300;this.scriptCount++;this.attachPendingComment(currentTarget,eventData.block[eventId],eventId);const nextLineIndent=i+1<lines.length?getIndent(lines[i+1]):0;const result=parseStructure(i+1,nextLineIndent,currentTarget);if(result.firstBlockId){eventData.block[eventId].next=result.firstBlockId;result.blocks[result.firstBlockId].parent=eventId;}Object.assign(currentTarget.blocks,eventData.block,eventData.extraBlocks||{},result.blocks);i=result.endIndex;}catch(error){if(error.isSB3Error){this.warn(i,"Error in \"".concat(trimmed,"\": ").concat(error.message));i++;}else{throw error;}}}else if(trimmed.toUpperCase().startsWith('DEFINE')){try{const defData=this.parseDefine(trimmed,currentTarget);const defId=Object.keys(defData.block)[0];defData.block[defId].x=50+this.scriptCount%3*350;defData.block[defId].y=50+Math.floor(this.scriptCount/3)*300;this.scriptCount++;this.currentProcArgs=defData.args;const nextLineIndent=i+1<lines.length?getIndent(lines[i+1]):0;const result=parseStructure(i+1,nextLineIndent,currentTarget);if(result.firstBlockId){defData.block[defId].next=result.firstBlockId;result.blocks[result.firstBlockId].parent=defId;}Object.assign(currentTarget.blocks,defData.block,defData.extraBlocks||{},result.blocks);this.currentProcArgs=null;i=result.endIndex;}catch(error){this.currentProcArgs=null;if(error.isSB3Error){this.warn(i,"Error in DEFINE \"".concat(trimmed,"\": ").concat(error.message));i++;}else{throw error;}}}else{this.warn(i,"Ignoring line not associated with a script: \"".concat(trimmed,"\""));i++;}}this.validateReferences();this.syncExtensions();for(const t of this.project.targets)this.layoutScripts(t);SB3Creator.writeStcComment(this.project);return this.project;}// ===== STC persistence: survive the sb3 serializer ==============================
//
// scratch-vm's sb3 serializer emits only targets/monitors/extensions/meta and
// drops every other top-level key — so `project.stc` dies on the first save from
// a running VM, and a reopened project loses every pin declaration. Stage
// comments, however, round-trip through every sb3 serializer and every editor.
// So the declarations ride in BOTH places: the top-level `stc` key (canonical,
// read by the hosted compiler and everything in this repo) and a Stage comment
// carrying the same JSON behind a magic marker (the survivor). readStc() prefers
// the key and falls back to the comment; the comment is regenerated on every
// parse, so the two cannot drift within this library's own flows.
/** Marker that identifies the persistence comment. *//**
     * Write (or rewrite) the Stage comment mirroring project.stc.
     * No-op when the project has no stc block or no stage.
     * @param {object} project - sb3-shaped project JSON
     */static writeStcComment(project){if(!project||!project.stc||!Array.isArray(project.targets))return;const stage=project.targets.find(t=>t.isStage);if(!stage)return;if(!stage.comments)stage.comments={};stage.comments[SB3Creator.STC_COMMENT_ID]={blockId:null,x:0,y:0,width:320,height:140,minimized:true,text:'BrickWright hardware declarations — regenerated on save, do not edit.\n'+SB3Creator.STC_MAGIC+JSON.stringify(project.stc)};}/**
     * Recover the stc block from a project: the top-level key when present,
     * else the Stage persistence comment. Returns null when neither exists or
     * the comment is corrupt — never a fabricated default.
     * @param {object} project - sb3-shaped project JSON
     * @returns {object | null}
     */static readStc(project){if(!project)return null;if(project.stc)return project.stc;const stage=Array.isArray(project.targets)?project.targets.find(t=>t.isStage):null;if(!stage||!stage.comments)return null;for(const c of Object.values(stage.comments)){const text=c&&typeof c.text==='string'?c.text:'';const at=text.indexOf(SB3Creator.STC_MAGIC);if(at===-1)continue;try{return JSON.parse(text.slice(at+SB3Creator.STC_MAGIC.length));}catch(_unused){return null;// corrupt comment: absent beats invented
}}return null;}// Lay a target's top-level scripts out so they don't overlap in the editor. The parse-time
// grid uses fixed 350×300 cells, so tall scripts (a big `DEFINE`) collide with the next row.
// This masonry pass measures each script (block count → height) and drops it into whichever
// column currently ends highest, giving a compact, collision-free arrangement.
layoutScripts(target){const blocks=target.blocks||{};const tops=Object.entries(blocks).filter(_ref4=>{let[,b]=_ref4;return b.topLevel&&!b.shadow;});if(!tops.length)return;const MARGIN=40,GAP=48,COL_W=600,ROW_H=48;const nCols=Math.min(3,Math.max(1,Math.ceil(Math.sqrt(tops.length))));const colY=new Array(nCols).fill(MARGIN);// Estimate a script's pixel height from the number of blocks it contains (incl. nested).
const heightOf=hatId=>{let count=0;const walk=id=>{while(id&&blocks[id]){count++;const inp=blocks[id].inputs||{};for(const k of['SUBSTACK','SUBSTACK2'])if(Array.isArray(inp[k]))walk(inp[k][1]);id=blocks[id].next;}};walk(blocks[hatId].next);return ROW_H*(count+1)+24;// hat + stacked blocks + padding
};for(const[id,b]of tops){let col=0;for(let k=1;k<nCols;k++)if(colY[k]<colY[col])col=k;b.x=MARGIN+col*COL_W;b.y=colY[col];colY[col]+=heightOf(id)+GAP;}}// Warn about menu blocks (touching, clone of, ... of, point/go towards) that name a
// sprite which doesn't exist — usually a typo that would silently do nothing.
validateReferences(){const MENUS={sensing_touchingobjectmenu:['TOUCHINGOBJECTMENU',['_edge_','_mouse_']],control_create_clone_of_menu:['CLONE_OPTION',['_myself_']],sensing_of_object_menu:['OBJECT',['_stage_']],motion_pointtowards_menu:['TOWARDS',['_mouse_','_random_']],motion_goto_menu:['TO',['_mouse_','_random_']],motion_glideto_menu:['TO',['_mouse_','_random_']],sensing_distancetomenu:['DISTANCETOMENU',['_mouse_']]};const known=new Set([...this.targetNames].map(n=>n.toLowerCase()));const seen=new Set();// Every sound name defined anywhere (a sprite may reference by shared name).
const allSounds=new Set();for(const t of this.project.targets)for(const s of t.sounds||[])allSounds.add(s.name);// Literal string value of an input like COSTUME / SOUND_MENU (else null).
const literal=input=>Array.isArray(input)&&input[0]===1&&Array.isArray(input[1])&&input[1][0]===10?input[1][1]:null;for(const target of this.project.targets){const costumeNames=new Set((target.costumes||[]).map(c=>c.name));for(const block of Object.values(target.blocks||{})){const menu=MENUS[block.opcode];if(menu){var _block$fields;const[field,allowed]=menu;const value=(_block$fields=block.fields)===null||_block$fields===void 0||(_block$fields=_block$fields[field])===null||_block$fields===void 0?void 0:_block$fields[0];if(typeof value==='string'&&!allowed.includes(value)&&!known.has(value.toLowerCase())&&!seen.has(value)){seen.add(value);this.warnings.push("References unknown sprite \"".concat(value,"\" (not a defined sprite)"));}}if(block.opcode==='looks_switchcostumeto'){var _block$inputs;const inp=(_block$inputs=block.inputs)===null||_block$inputs===void 0?void 0:_block$inputs.COSTUME;// Read the name from the costume menu shadow; reporter forms
// ([3, reporterId, shadowId]) are dynamic, so skip them.
let name=literal(inp);if(name===null&&Array.isArray(inp)&&inp[0]===1){var _shadow$fields;const shadow=target.blocks[inp[1]];name=shadow&&(_shadow$fields=shadow.fields)!==null&&_shadow$fields!==void 0&&_shadow$fields.COSTUME?shadow.fields.COSTUME[0]:null;}if(name&&!/^\d+$/.test(name)&&!costumeNames.has(name)&&!seen.has('c:'+name)){seen.add('c:'+name);this.warnings.push("Switches to unknown costume \"".concat(name,"\" (declare it with COSTUME ").concat(name,")"));}}if(block.opcode==='sound_play'||block.opcode==='sound_playuntildone'){var _block$inputs2;const name=literal((_block$inputs2=block.inputs)===null||_block$inputs2===void 0?void 0:_block$inputs2.SOUND_MENU);if(name&&!allSounds.has(name)&&!seen.has('s:'+name)){seen.add('s:'+name);this.warnings.push("Plays unknown sound \"".concat(name,"\" (declare it with SOUND ").concat(name,")"));}}}}}generateSB3(){var _this4=this;return _asyncToGenerator(function*(){if(!_this4.project){throw new ValidationError('No project to generate');}// Auto-declare the extensions the blocks actually use (and their URLs) so the
// VM loads them — covers blocks that arrived via any path (compile / injected).
_this4.syncExtensions();const zip=new (jszip__WEBPACK_IMPORTED_MODULE_0___default())();zip.file('project.json',JSON.stringify(_this4.project));// The Stage's default backdrop is the one fixed asset id (a soft gradient).
// Everything else — sprite costumes, extra costumes/backdrops, and the generated
// tone sounds — is produced on the fly and lives in `this.assets`.
const stageAsset="<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" width=\"480\" height=\"360\" viewBox=\"0,0,480,360\"><defs><linearGradient id=\"bg\" x1=\"0%\" y1=\"0%\" x2=\"100%\" y2=\"100%\"><stop offset=\"0%\" style=\"stop-color:#87CEEB;stop-opacity:1\" /><stop offset=\"100%\" style=\"stop-color:#98FB98;stop-opacity:1\" /></linearGradient></defs><rect width=\"480\" height=\"360\" fill=\"url(#bg)\"/></svg>";zip.file('cd21514d0531fdffb22204e0ec5ed84a.svg',stageAsset);for(const assetData of _this4.assets.values()){zip.file(assetData.filename,assetData.data);}_this4.generatedSB3=yield zip.generateAsync({type:'blob'});return _this4.generatedSB3;})();}validate(){this.errors=[];// Check for sprites without costumes
for(const target of this.project.targets){if(!target.costumes||target.costumes.length===0){this.errors.push("".concat(target.name," has no costumes"));}}// Check for scripts
const scriptsFound=this.project.targets.reduce((acc,t)=>acc+Object.values(t.blocks||{}).filter(b=>b.topLevel).length,0);if(scriptsFound===0&&this.errors.length===0){this.warnings.push("No scripts found. Scripts must start with 'WHEN'.");}return{isValid:this.errors.length===0,errors:this.errors,parsingWarnings:this.warnings,scriptsFound,variablesCreated:this.variables.size,targets:this.project.targets.length};}// Deep referential-integrity check of the generated project graph.
// Returns an array of human-readable problems (empty === healthy).
checkIntegrity(){let project=arguments.length>0&&arguments[0]!==undefined?arguments[0]:this.project;const issues=[];const allVarIds=new Set();const allListIds=new Set();const broadcastIds=new Set();for(const t of project.targets){for(const id of Object.keys(t.variables||{}))allVarIds.add(id);for(const id of Object.keys(t.lists||{}))allListIds.add(id);if(t.isStage)for(const id of Object.keys(t.broadcasts||{}))broadcastIds.add(id);}for(const t of project.targets){const blocks=t.blocks||{};const ids=new Set(Object.keys(blocks));const where=bid=>"".concat(t.isStage?'Stage':t.name,"/").concat(bid);const checkInput=(bid,key,input)=>{if(!Array.isArray(input))return;const shadowType=input[0];const check=(ref,kind)=>{if(typeof ref==='string'){if(!ids.has(ref))issues.push("".concat(where(bid)," input ").concat(key," references missing ").concat(kind," block ").concat(ref));}else if(Array.isArray(ref)){if(ref[0]===12&&!allVarIds.has(ref[2]))issues.push("".concat(where(bid)," input ").concat(key," references undeclared variable ").concat(ref[1]));if(ref[0]===13&&!allListIds.has(ref[2]))issues.push("".concat(where(bid)," input ").concat(key," references undeclared list ").concat(ref[1]));if(ref[0]===11&&!broadcastIds.has(ref[2]))issues.push("".concat(where(bid)," input ").concat(key," references undeclared broadcast ").concat(ref[1]));}};if(shadowType===2||shadowType===3)check(input[1],'block');// boolean/obscured value
if(shadowType===1)check(input[1],'shadow');// shadow primitive or menu id
if(shadowType===3&&input[2]!==undefined)check(input[2],'shadow');};for(const[bid,b]of Object.entries(blocks)){if(b.next&&!ids.has(b.next))issues.push("".concat(where(bid)," .next points to missing block ").concat(b.next));if(b.parent&&!ids.has(b.parent))issues.push("".concat(where(bid)," .parent points to missing block ").concat(b.parent));for(const[key,input]of Object.entries(b.inputs||{}))checkInput(bid,key,input);for(const[fname,fval]of Object.entries(b.fields||{})){if(fname==='VARIABLE'&&Array.isArray(fval)&&!allVarIds.has(fval[1]))issues.push("".concat(where(bid)," field VARIABLE references undeclared variable ").concat(fval[0]));if(fname==='LIST'&&Array.isArray(fval)&&!allListIds.has(fval[1]))issues.push("".concat(where(bid)," field LIST references undeclared list ").concat(fval[0]));if(fname==='BROADCAST_OPTION'&&Array.isArray(fval)&&!broadcastIds.has(fval[1]))issues.push("".concat(where(bid)," field BROADCAST_OPTION references undeclared broadcast ").concat(fval[0]));}}// Every referenced costume/sound asset must be present in the project.
for(const c of t.costumes||[]){if(!c.assetId||!c.md5ext)issues.push("".concat(where('costume')," ").concat(c.name," missing asset id"));}}return issues;}// Add method to handle SVG uploads
addSVGAsset(file,name){var _this5=this;let targetIndex=arguments.length>2&&arguments[2]!==undefined?arguments[2]:1;return _asyncToGenerator(function*(){if(!file.type.includes('svg')){throw new AssetError('File must be an SVG');}const svgText=yield file.text();const parser=new DOMParser();const svgDoc=parser.parseFromString(svgText,'image/svg+xml');const svgElement=svgDoc.querySelector('svg');if(!svgElement){throw new AssetError('Invalid SVG file');}// Extract dimensions
const width=parseFloat(svgElement.getAttribute('width'))||240;const height=parseFloat(svgElement.getAttribute('height'))||180;const assetId=_this5.generateAssetId();const filename="".concat(assetId,".svg");// Store asset data
_this5.assets.set(assetId,{type:'svg',data:svgText,filename,metadata:{width,height}});// Create costume object
const costume={assetId,name,md5ext:filename,dataFormat:'svg',rotationCenterX:width/2,rotationCenterY:height/2};// Add to target
if(_this5.project.targets[targetIndex]){_this5.project.targets[targetIndex].costumes.push(costume);}return{assetId,costume};})();}// Read width/height from raw SVG text (attributes first, then viewBox), no DOM.
svgDimensions(svgText){const wm=svgText.match(/\bwidth\s*=\s*"([\d.]+)/i);const hm=svgText.match(/\bheight\s*=\s*"([\d.]+)/i);let w=wm?parseFloat(wm[1]):0;let h=hm?parseFloat(hm[1]):0;if(!w||!h){const vb=svgText.match(/viewBox\s*=\s*"\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/i);if(vb){w=w||parseFloat(vb[1]);h=h||parseFloat(vb[2]);}}return{width:w||80,height:h||80};}// Bake a user-supplied SVG in as a named sprite's costume (replacing costume 1).
// Returns true if the sprite exists. Used by the app's SVG-upload feature.
applyCustomSVG(spriteName,svgText){const target=this.project.targets.find(t=>!t.isStage&&t.name===spriteName);if(!target)return false;const{width,height}=this.svgDimensions(svgText);const assetId=this.generateAssetId();this.assets.set(assetId,{type:'svg',data:svgText,filename:"".concat(assetId,".svg"),metadata:{width,height}});const old=target.costumes[0];if(old&&old.assetId)this.assets.delete(old.assetId);target.costumes[0]={assetId,name:'costume1',md5ext:"".concat(assetId,".svg"),dataFormat:'svg',rotationCenterX:width/2,rotationCenterY:height/2};return true;}// ===== Decompiler: project blocks -> pseudocode (inverse of the parser) =========
// Decompile a whole project back into pseudocode.
decompile(){let project=arguments.length>0&&arguments[0]!==undefined?arguments[0]:this.project;const out=[];const stage=project.targets.find(t=>t.isStage);// STC12 / 8051 device declarations first — they are read before any script.
// A project that lived through scratch-vm's serializer has lost the
// top-level key; recover it from the Stage persistence comment.
if(!project.stc){const recovered=SB3Creator.readStc(project);if(recovered)project.stc=recovered;}if(project.stc){const cfg=project.stc;out.push("DEVICE ".concat(String(cfg.device||'stc12c5a60s2').toUpperCase()));out.push("CLOCK ".concat(cfg.clock||11059200));if(cfg.machine){const hx=n=>'$'+n.toString(16).toUpperCase().padStart(4,'0');for(const r of cfg.machine.regions||[]){out.push("MAP ".concat(r.kind.toUpperCase()," ").concat(hx(r.start),"-").concat(hx(r.end)));}for(const c of cfg.machine.chips||[]){if(c.kind==='simplevga'){out.push("CHIP ".concat(c.name," = SIMPLEVGA"));continue;}const chipName={via:'W65C22',acia:'W65C51',vdp:'TMS9918'}[c.kind]||'W65C51';out.push("CHIP ".concat(c.name," = ").concat(chipName," AT ").concat(hx(c.at)));}}for(const p of cfg.pins||[]){out.push("PIN ".concat(p.name," = ").concat(p.where||"P".concat(p.port,".").concat(p.bit)," ").concat(p.direction.toUpperCase()).concat(p.activeLow?' ACTIVE LOW':''));}for(const p of cfg.ports||[]){out.push("PORT ".concat(p.name," = P").concat(p.port," ").concat(p.direction.toUpperCase()).concat(p.activeLow?' ACTIVE LOW':''));}for(const p of cfg.parts||[]){const pinStr=pin=>pin.where||"P".concat(pin.port,".").concat(pin.bit);out.push("PART ".concat(p.name," = 74HC595 data ").concat(pinStr(p.data)," clock ").concat(pinStr(p.clock)," latch ").concat(pinStr(p.latch)).concat(p.activeLow?' ACTIVE LOW':''));}for(const t of cfg.tables||[]){const vals=t.values.map(v=>"0x".concat(v.toString(16).toUpperCase().padStart(2,'0')));out.push("TABLE ".concat(t.name," = ").concat(vals.join(', ')));}if(cfg.ledcube)out.push("LEDCUBE ".concat(cfg.ledcube.size));out.push('');}for(const v of Object.values(stage.variables||{}))out.push("GLOBAL ".concat(v[0]));for(const l of Object.values(stage.lists||{}))out.push("GLOBAL LIST ".concat(l[0]));for(const bd of(stage.costumes||[]).slice(1))out.push("BACKDROP ".concat(bd._spec||bd.name));for(const snd of(stage.sounds||[]).slice(1))out.push("SOUND ".concat(snd.name));if(out.length)out.push('');for(const t of project.targets){const scripts=this.decompileTargetScripts(t);if(t.isStage){if(scripts.length){out.push('STAGE:');out.push(...scripts.map(l=>l?"  ".concat(l):l));out.push('');}}else{out.push("SPRITE ".concat(t.name,":"));if(t.costumes&&t.costumes[0]&&t.costumes[0]._shapeSpec)out.push("  SHAPE ".concat(t.costumes[0]._shapeSpec));for(const v of Object.values(t.variables||{}))out.push("  LOCAL ".concat(v[0]));for(const l of Object.values(t.lists||{}))out.push("  LOCAL LIST ".concat(l[0]));for(const cos of(t.costumes||[]).slice(1))out.push("  COSTUME ".concat(cos._spec||cos.name));for(const snd of(t.sounds||[]).slice(1))out.push("  SOUND ".concat(snd.name));out.push(...scripts.map(l=>l?"  ".concat(l):l));out.push('');}}return out.join('\n').replace(/\n{3,}/g,'\n\n').trim()+'\n';}decompileTargetScripts(target){const blocks=target.blocks||{};const lines=[];// Reverse-map blockId -> comment text so blocks can re-emit their `# comment`.
this._blockComments={};for(const c of Object.values(target.comments||{}))if(c&&c.blockId)this._blockComments[c.blockId]=c.text;const tops=Object.entries(blocks).filter(_ref5=>{let[,b]=_ref5;return b.topLevel&&!b.shadow;});for(const[id,b]of tops){const hat=this.decompileHat(b,blocks);if(hat===null)continue;lines.push(...this.commentLines(id,0));lines.push(hat);lines.push(...this.decompileStackFrom(b.next,blocks,1));lines.push('');}return lines;}// `# comment` lines (indented to `level`) for a block that carries a comment.
commentLines(blockId,level){const text=this._blockComments&&this._blockComments[blockId];if(!text)return[];return String(text).split('\n').map(l=>"".concat('  '.repeat(level),"# ").concat(l));}decompileStackFrom(firstId,blocks,level){const lines=[];let id=firstId;while(id&&blocks[id]){lines.push(...this.commentLines(id,level));lines.push(...this.decompileStackBlock(blocks[id],blocks,level));id=blocks[id].next;}return lines;}// Decompile a value input -> pseudocode expression. Compound reporters are wrapped
// in parens so the result is always a single top-level token.
dval(input,blocks){if(!Array.isArray(input))return'';const inner=input[1];if(Array.isArray(inner)){const[type,a]=inner;if(type===10)return"\"".concat(a,"\"");// string
if(type===11)return"\"".concat(a,"\"");// broadcast
// number (4), color (9), variable (12), list (13) — emit the raw value
return String(a);}// block reference (a reporter)
return"(".concat(this.drep(blocks[inner],blocks),")");}// Decompile a reporter block (without outer parens).
drep(b,blocks){if(!b)return'';const v=k=>this.dval(b.inputs[k],blocks);const f=k=>b.fields[k]?b.fields[k][0]:'';switch(b.opcode){case'operator_add':return"".concat(v('NUM1')," + ").concat(v('NUM2'));case'operator_subtract':return"".concat(v('NUM1')," - ").concat(v('NUM2'));case'operator_multiply':return"".concat(v('NUM1')," * ").concat(v('NUM2'));case'operator_divide':return"".concat(v('NUM1')," / ").concat(v('NUM2'));case'operator_mod':return"".concat(v('NUM1')," mod ").concat(v('NUM2'));case'bitops_and':return"".concat(v('NUM1')," bitand ").concat(v('NUM2'));case'bitops_or':return"".concat(v('NUM1')," bitor ").concat(v('NUM2'));case'bitops_xor':return"".concat(v('NUM1')," bitxor ").concat(v('NUM2'));case'bitops_shl':return"".concat(v('NUM1')," shiftleft ").concat(v('NUM2'));case'bitops_shr':return"".concat(v('NUM1')," shiftright ").concat(v('NUM2'));case'bitops_not':return"bitnot ".concat(v('NUM'));case'operator_random':return"pick random ".concat(v('FROM')," to ").concat(v('TO'));case'operator_round':return"round ".concat(v('NUM'));case'operator_mathop':return"".concat(f('OPERATOR')," of ").concat(v('NUM'));case'operator_join':return"".concat(v('STRING1')," join ").concat(v('STRING2'));case'operator_letter_of':return"letter ".concat(v('LETTER')," of ").concat(v('STRING'));case'operator_length':return"length of ".concat(v('STRING'));case'operator_contains':return"".concat(v('STRING1')," contains ").concat(v('STRING2'));case'data_itemoflist':return"item ".concat(v('INDEX')," of ").concat(f('LIST'));case'data_itemnumoflist':return"item # of ".concat(v('ITEM')," in ").concat(f('LIST'));case'data_lengthoflist':return"length of ".concat(f('LIST'));case'data_listcontainsitem':return"".concat(f('LIST')," contains ").concat(v('ITEM'));case'motion_xposition':return'x position';case'motion_yposition':return'y position';case'motion_direction':return'direction';case'looks_size':return'size';case'looks_costumenumbername':return"costume ".concat(f('NUMBER_NAME'));case'looks_backdropnumbername':return"backdrop ".concat(f('NUMBER_NAME'));case'sound_volume':return'volume';case'sensing_answer':return'answer';case'sensing_timer':return'timer';case'sensing_mousex':return'mouse x';case'sensing_mousey':return'mouse y';case'sensing_loudness':return'loudness';case'sensing_username':return'username';case'sensing_dayssince2000':return'days since 2000';case'sensing_distanceto':return"distance to ".concat(this.dmenu(b.inputs.DISTANCETOMENU,blocks,'DISTANCETOMENU'));case'sensing_current':return f('CURRENTMENU')==='DAYOFWEEK'?'day of week':"current ".concat(f('CURRENTMENU').toLowerCase());case'sensing_of':return"".concat(this.dprop(f('PROPERTY'))," of ").concat(this.dmenu(b.inputs.OBJECT,blocks,'OBJECT'));case'argument_reporter_string_number':case'argument_reporter_boolean':return f('VALUE');// Planète Maths reporters. Ops with a standard equivalent decompile to
// standard pseudocode (execution-preserved); the distinctive ones get their
// own readable phrase that parses back to the extension block.
case'planetemaths_add':return"".concat(v('NUM1')," + ").concat(v('NUM2'));case'planetemaths_substract':return"".concat(v('NUM1')," - ").concat(v('NUM2'));case'planetemaths_multiply':return"".concat(v('NUM1')," * ").concat(v('NUM2'));case'planetemaths_divide':return"".concat(v('NUM1')," / ").concat(v('NUM2'));case'planetemaths_oppose':return"0 - ".concat(v('NUM1'));case'planetemaths_inverse':return"1 / ".concat(v('NUM1'));case'planetemaths_pourcent':return"".concat(v('NUM1')," / 100");case'planetemaths_join':return"".concat(v('STRING1')," join ").concat(v('STRING2'));case'planetemaths_letterOf':return"letter ".concat(v('LETTER')," of ").concat(v('STRING'));case'planetemaths_length':return"length of ".concat(v('STRING'));case'planetemaths_random':return"pick random ".concat(v('NUM1')," to ").concat(v('NUM2'));case'planetemaths_pow':return"".concat(v('NUM1')," to the power of ").concat(v('NUM2'));case'planetemaths_factorial':return"factorial of ".concat(v('NUM1'));case'planetemaths_sommechiffres':return"sum of digits of ".concat(v('NUM1'));case'planetemaths_min':return"min of ".concat(v('NUM1')," and ").concat(v('NUM2'));case'planetemaths_max':return"max of ".concat(v('NUM1')," and ").concat(v('NUM2'));case'planetemaths_nombre_pi':return'pi';case'planetemaths_nombre_e':return'euler';// Arrays & Vectors reporters (v('NAME') yields the quoted name).
case'arrays_get':return"item ".concat(v('INDEX')," of array ").concat(v('NAME'));case'arrays_pop':return"pop from array ".concat(v('NAME'));case'arrays_length':return"length of array ".concat(v('NAME'));case'arrays_sum':return"sum of array ".concat(v('NAME'));case'arrays_mean':return"mean of array ".concat(v('NAME'));case'arrays_min':return"smallest of array ".concat(v('NAME'));case'arrays_max':return"largest of array ".concat(v('NAME'));case'arrays_indexOf':return"index of ".concat(v('VALUE')," in array ").concat(v('NAME'));case'arrays_reverse':return"reverse of array ".concat(v('NAME'));case'arrays_flatten':return"flatten of array ".concat(v('NAME'));case'arrays_sort':return"sort of array ".concat(v('NAME')," ").concat(f('ORDER')||'ascending');case'arrays_slice':return"slice of array ".concat(v('NAME')," from ").concat(v('START')," to ").concat(v('END'));case'arrays_toJSON':case'arrays_toString':return"array ".concat(v('NAME')," as text");case'arrays_get2D':return"item row ".concat(v('ROW')," col ").concat(v('COL')," of array ").concat(v('NAME'));case'arrays_transpose':return"transpose of array ".concat(v('NAME'));case'arrays_reshape':return"reshape array ".concat(v('NAME')," to ").concat(this.dval(b.inputs.SHAPE,blocks).replace(/^"|"$/g,''));case'arrays_map':return"map ".concat(this.dval(b.inputs.FUNC,blocks)," over array ").concat(v('NAME'));case'arrays_filter':return"filter array ".concat(v('NAME')," by ").concat(this.dval(b.inputs.FUNC,blocks));case'arrays_reduce':return"reduce array ".concat(v('NAME')," with ").concat(this.dval(b.inputs.FUNC,blocks)," from ").concat(v('INIT'));// STC12 / 8051 pin read (digital level or ADC value).
case'stc12_read':return"read ".concat(f('PIN'));case'stc12_readport':return"read ".concat(f('PORT'));case'stc12_tableindex':return"".concat(f('TABLE'),"[").concat(v('INDEX'),"]");case'ledcube_readvoxel':return"voxel ".concat(v('X')," ").concat(v('Y')," ").concat(v('Z'));// Device reporters
case'devices_temperature':return"temperature from ".concat(v('SENSOR'));case'devices_light':return"light from ".concat(v('SENSOR'));case'devices_servoangle':return"angle of ".concat(v('SERVO'));case'devices_distance':return"distance from ".concat(v('SENSOR'));case'devices_motorspeed':return"speed of ".concat(v('MOTOR'));case'devices_motordirection':return"direction of ".concat(v('MOTOR'));case'devices_devicestate':return"state of ".concat(v('DEVICE'));case'devices_flex':return"flex of ".concat(v('SENSOR'));case'devices_force':return"force on ".concat(v('SENSOR'));case'devices_ircode':return"ir code from ".concat(v('SENSOR'));// circuit extension reporters
case'circuit_nodevoltage':return"voltage at ".concat(v('NET'));case'circuit_branchcurrent':return"current through ".concat(v('PART'));case'circuit_resistance':return"resistance between ".concat(v('A')," and ").concat(v('B'));case'circuit_ledbrightness':return"brightness of ".concat(v('PART'));case'circuit_buzzertone':return"tone of ".concat(v('PART'));default:return b.opcode;}}dprop(p){return p==='costume #'?'costume number':p==='backdrop #'?'backdrop number':p;}// Decompile a boolean input/block -> condition text.
dcond(ref,blocks){const b=typeof ref==='string'?blocks[ref]:blocks[ref];if(!b)return'';const v=k=>this.dval(b.inputs[k],blocks);const c=k=>this.dcond(b.inputs[k][1],blocks);switch(b.opcode){case'operator_gt':return"".concat(v('OPERAND1')," > ").concat(v('OPERAND2'));case'operator_lt':return"".concat(v('OPERAND1')," < ").concat(v('OPERAND2'));case'operator_equals':return"".concat(v('OPERAND1')," = ").concat(v('OPERAND2'));case'operator_and':return"(".concat(c('OPERAND1'),") and (").concat(c('OPERAND2'),")");case'operator_or':return"(".concat(c('OPERAND1'),") or (").concat(c('OPERAND2'),")");case'operator_not':return"not (".concat(c('OPERAND'),")");case'operator_contains':return"".concat(v('STRING1')," contains ").concat(v('STRING2'));case'data_listcontainsitem':return"".concat(b.fields.LIST[0]," contains ").concat(v('ITEM'));case'sensing_touchingobject':return"touching ".concat(this.dmenu(b.inputs.TOUCHINGOBJECTMENU,blocks,'TOUCHINGOBJECTMENU'));case'sensing_touchingcolor':return"touching color ".concat(v('COLOR'));case'sensing_keypressed':return"key ".concat(this.dmenu(b.inputs.KEY_OPTION,blocks,'KEY_OPTION')," pressed?");case'sensing_mousedown':return'mouse down?';case'argument_reporter_boolean':return b.fields.VALUE[0];// Planète Maths booleans (semantics from the implementation: gt = NUM1 < NUM2).
case'planetemaths_gt':return"".concat(v('NUM1')," < ").concat(v('NUM2'));case'planetemaths_gte':return"".concat(v('NUM1')," <= ").concat(v('NUM2'));case'planetemaths_lt':return"".concat(v('NUM1')," > ").concat(v('NUM2'));case'planetemaths_lte':return"".concat(v('NUM1')," >= ").concat(v('NUM2'));case'planetemaths_equals':return"".concat(v('NUM1')," = ").concat(v('NUM2'));case'planetemaths_and':return"(".concat(c('OPERAND1'),") and (").concat(c('OPERAND2'),")");case'planetemaths_or':return"(".concat(c('OPERAND1'),") or (").concat(c('OPERAND2'),")");case'planetemaths_not':return"not (".concat(c('OPERAND1'),")");case'planetemaths_contains':return"".concat(v('STRING1')," contains ").concat(v('STRING2'));case'planetemaths_multiple':return"".concat(v('NUM1')," is multiple of ").concat(v('NUM2'));case'arrays_contains':return"array ".concat(v('NAME')," contains ").concat(v('VALUE'));// Device predicates
case'devices_pressed':return"".concat(v('BUTTON')," pressed?");case'devices_above':return"".concat(v('SENSOR')," above ").concat(v('THRESHOLD'));case'devices_closer':return"".concat(v('SENSOR')," closer than ").concat(v('DISTANCE'));case'devices_motion':return"motion detected on ".concat(v('SENSOR'));case'devices_tilted':return"".concat(v('SENSOR')," tilted?");case'devices_energised':return"".concat(v('DEVICE')," energised?");default:return this.drep(b,blocks);}}// Read a dropdown menu shadow's value and map internal names back to pseudocode.
dmenu(input,blocks,field){if(!Array.isArray(input))return'';const shadow=blocks[input[1]];const val=shadow&&shadow.fields&&shadow.fields[field]?shadow.fields[field][0]:'';const map={_edge_:'edge',_mouse_:'mouse-pointer',_myself_:'myself',_random_:'random position',_stage_:'Stage'};return map[val]||val;}decompileHat(b,blocks){const f=k=>b.fields[k]?b.fields[k][0]:'';const v=k=>this.dval(b.inputs[k],blocks);switch(b.opcode){case'event_whenflagclicked':return'WHEN flag clicked:';case'event_whenkeypressed':return"WHEN ".concat(f('KEY_OPTION')," key pressed:");case'event_whenthisspriteclicked':return'WHEN sprite clicked:';case'event_whenbroadcastreceived':return"WHEN I receive \"".concat(f('BROADCAST_OPTION'),"\":");case'control_start_as_clone':return'WHEN I start as a clone:';case'stc12_whenpin':return"WHEN ".concat(f('PIN')," ").concat(f('EDGE'),":");case'devices_whenabove':return"WHEN ".concat(v('SENSOR')," above ").concat(v('THRESHOLD'),":");case'devices_whencloser':return"WHEN ".concat(v('SENSOR')," closer than ").concat(v('DISTANCE'),":");case'devices_whenmotion':return"WHEN motion on ".concat(v('SENSOR'),":");case'devices_whentilted':return"WHEN ".concat(v('SENSOR')," tilted:");case'devices_whenirreceived':return"WHEN IR received on ".concat(v('SENSOR'),":");case'procedures_definition':{const proto=blocks[b.inputs.custom_block[1]];const m=proto.mutation;const names=JSON.parse(m.argumentnames||'[]');let ai=0;const sig=m.proccode.replace(/%[sb]/g,tok=>{const nm=names[ai++];return tok==='%b'?"<".concat(nm,">"):"(".concat(nm,")");});return"DEFINE ".concat(m.warp==='true'?'FAST ':'').concat(sig,":");}default:return null;}}// Decompile a stack block (and any nested substacks) into pseudocode lines.
decompileStackBlock(b,blocks,level){const pad='  '.repeat(level);const v=k=>this.dval(b.inputs[k],blocks);const f=k=>b.fields[k]?b.fields[k][0]:'';const sub=(k,lvl)=>b.inputs[k]?this.decompileStackFrom(b.inputs[k][1],blocks,lvl):[];const line=txt=>[pad+txt];switch(b.opcode){// ---- control structures ----
case'control_forever':return[pad+'FOREVER:',...sub('SUBSTACK',level+1)];case'control_repeat':return[pad+"REPEAT ".concat(v('TIMES'),":"),...sub('SUBSTACK',level+1)];case'control_repeat_until':return[pad+"REPEAT UNTIL ".concat(this.dcond(b.inputs.CONDITION[1],blocks),":"),...sub('SUBSTACK',level+1)];case'control_if':return[pad+"IF ".concat(this.dcond(b.inputs.CONDITION[1],blocks)," THEN:"),...sub('SUBSTACK',level+1)];case'control_if_else':return[pad+"IF ".concat(this.dcond(b.inputs.CONDITION[1],blocks)," THEN:"),...sub('SUBSTACK',level+1),pad+'ELSE:',...sub('SUBSTACK2',level+1)];case'control_wait':return line("wait ".concat(v('DURATION')," seconds"));case'control_wait_until':return line("wait until ".concat(this.dcond(b.inputs.CONDITION[1],blocks)));case'control_stop':return line(f('STOP_OPTION')==='all'?'stop all':f('STOP_OPTION')==='this script'?'stop this script':'stop other scripts in sprite');case'control_create_clone_of':return line("create clone of ".concat(this.dmenu(b.inputs.CLONE_OPTION,blocks,'CLONE_OPTION')));case'control_delete_this_clone':return line('delete this clone');// ---- motion ----
case'motion_movesteps':return line("move ".concat(v('STEPS')," steps"));case'motion_turnright':return line("turn right ".concat(v('DEGREES')," degrees"));case'motion_turnleft':return line("turn left ".concat(v('DEGREES')," degrees"));case'motion_gotoxy':return line("go to x: ".concat(v('X')," y: ").concat(v('Y')));case'motion_glidesecstoxy':return line("glide ".concat(v('SECS')," secs to x: ").concat(v('X')," y: ").concat(v('Y')));case'motion_glideto':return line("glide ".concat(v('SECS')," secs to ").concat(this.dmenu(b.inputs.TO,blocks,'TO')));case'motion_goto':return line("go to ".concat(this.dmenu(b.inputs.TO,blocks,'TO')));case'motion_changexby':return line("change x by ".concat(v('DX')));case'motion_changeyby':return line("change y by ".concat(v('DY')));case'motion_setx':return line("set x to ".concat(v('X')));case'motion_sety':return line("set y to ".concat(v('Y')));case'motion_pointindirection':return line("point in direction ".concat(v('DIRECTION')));case'motion_pointtowards':return line("point towards ".concat(this.dmenu(b.inputs.TOWARDS,blocks,'TOWARDS')));case'motion_ifonedgebounce':return line('if on edge bounce');case'motion_setrotationstyle':return line("set rotation style ".concat(f('STYLE')));// ---- looks ----
case'looks_sayforsecs':return line("say ".concat(v('MESSAGE')," for ").concat(v('SECS')," seconds"));case'looks_say':return line("say ".concat(v('MESSAGE')));case'looks_thinkforsecs':return line("think ".concat(v('MESSAGE')," for ").concat(v('SECS')," seconds"));case'looks_think':return line("think ".concat(v('MESSAGE')));case'looks_show':return line('show');case'looks_hide':return line('hide');case'looks_switchcostumeto':{const inp=b.inputs.COSTUME;if(Array.isArray(inp)&&inp[0]===3)return line("switch costume to (".concat(this.drep(blocks[inp[1]],blocks),")"));return line("switch costume to ".concat(this.dmenu(inp,blocks,'COSTUME')));}case'looks_nextcostume':return line('next costume');case'looks_switchbackdropto':return line("switch backdrop to ".concat(this.dmenu(b.inputs.BACKDROP,blocks,'BACKDROP')));case'looks_nextbackdrop':return line('next backdrop');case'looks_changesizeby':return line("change size by ".concat(v('CHANGE')));case'looks_setsizeto':return line("set size to ".concat(v('SIZE')));case'looks_changeeffectby':return line("change ".concat(f('EFFECT').toLowerCase()," effect by ").concat(v('CHANGE')));case'looks_seteffectto':return line("set ".concat(f('EFFECT').toLowerCase()," effect to ").concat(v('VALUE')));case'looks_cleargraphiceffects':return line('clear graphic effects');case'looks_gotofrontback':return line(f('FRONT_BACK')==='back'?'go to back':'go to front');case'looks_goforwardbackwardlayers':return line("go ".concat(f('FORWARD_BACKWARD')," ").concat(v('NUM')," layers"));// ---- sound / pen / sensing / music ----
case'sound_playuntildone':return line("play sound ".concat(v('SOUND_MENU')," until done"));case'sound_play':return line("play sound ".concat(v('SOUND_MENU')));case'sound_stopallsounds':return line('stop all sounds');case'sound_changevolumeby':return line("change volume by ".concat(v('VOLUME')));case'sound_setvolumeto':return line("set volume to ".concat(v('VOLUME')));case'pen_clear':return line('clear');case'pen_stamp':return line('stamp');case'pen_penDown':return line('pen down');case'pen_penUp':return line('pen up');case'pen_setPenColorToColor':return line("set pen color to ".concat(v('COLOR')));case'pen_changePenColorParamBy':return line("change pen ".concat(this.dmenu(b.inputs.COLOR_PARAM,blocks,'colorParam')," by ").concat(v('VALUE')));case'pen_setPenColorParamTo':return line("set pen ".concat(this.dmenu(b.inputs.COLOR_PARAM,blocks,'colorParam')," to ").concat(v('VALUE')));case'pen_changePenSizeBy':return line("change pen size by ".concat(v('SIZE')));case'pen_setPenSizeTo':return line("set pen size to ".concat(v('SIZE')));case'sensing_askandwait':return line("ask ".concat(v('QUESTION')," and wait"));case'sensing_resettimer':return line('reset timer');case'sensing_setdragmode':return line("set drag mode ".concat(f('DRAG_MODE')));case'music_playNoteForBeats':return line("play note ".concat(v('NOTE')," for ").concat(v('BEATS')," beats"));case'music_playDrumForBeats':return line("play drum ".concat(this.dmenu(b.inputs.DRUM,blocks,'DRUM')," for ").concat(v('BEATS')," beats"));case'music_restForBeats':return line("rest for ".concat(v('BEATS')," beats"));case'music_setTempo':return line("set tempo to ".concat(v('TEMPO')));case'music_changeTempo':return line("change tempo by ".concat(v('TEMPO')));// ---- data ----
case'data_setvariableto':return line("set ".concat(f('VARIABLE')," to ").concat(v('VALUE')));case'data_changevariableby':return line("change ".concat(f('VARIABLE')," by ").concat(v('VALUE')));case'data_addtolist':return line("add ".concat(v('ITEM')," to ").concat(f('LIST')));case'data_deleteoflist':return line("delete ".concat(v('INDEX')," of ").concat(f('LIST')));case'data_deletealloflist':return line("delete all of ".concat(f('LIST')));case'data_insertatlist':return line("insert ".concat(v('ITEM')," at ").concat(v('INDEX')," of ").concat(f('LIST')));case'data_replaceitemoflist':return line("replace item ".concat(v('INDEX')," of ").concat(f('LIST')," with ").concat(v('ITEM')));// Arrays & Vectors commands (v('NAME') yields the quoted name).
case'arrays_create1D':return line("new array ".concat(v('NAME')," = ").concat(this.dval(b.inputs.JSON,blocks).replace(/^"|"$/g,'')));case'arrays_create2D':return line("new 2D array ".concat(v('NAME')," = ").concat(this.dval(b.inputs.JSON,blocks).replace(/^"|"$/g,'')));case'arrays_set2D':return line("set item row ".concat(v('ROW')," col ").concat(v('COL')," of array ").concat(v('NAME')," to ").concat(v('VALUE')));case'arrays_createEmpty':return line("new array ".concat(v('NAME')));case'arrays_createRange':return line("new array ".concat(v('NAME')," = range ").concat(v('START')," to ").concat(v('END')));case'arrays_push':return line("push ".concat(v('VALUE')," to array ").concat(v('NAME')));case'arrays_set':return line("set item ".concat(v('INDEX')," of array ").concat(v('NAME')," to ").concat(v('VALUE')));case'arrays_insert':return line("insert ".concat(v('VALUE')," at ").concat(v('INDEX')," of array ").concat(v('NAME')));case'arrays_remove':return line("remove item ".concat(v('INDEX')," of array ").concat(v('NAME')));case'arrays_delete':return line("delete array ".concat(v('NAME')));// ---- STC12 / 8051 pins ----
case'stc12_setpin':{const state=f('STATE');return line(state==='on'||state==='off'?"turn ".concat(state," ").concat(f('PIN')):"set ".concat(f('PIN')," ").concat(state));}case'stc12_writepin':return line("set ".concat(f('PIN')," to ").concat(v('VALUE')));case'stc12_toggle':return line("toggle ".concat(f('PIN')));case'stc12_setpwm':return line("set ".concat(f('PIN')," to ").concat(v('VALUE')," percent"));case'stc12_settone':return line("set ".concat(f('PIN')," to ").concat(v('VALUE')," hz"));case'stc12_setport':return line("set ".concat(f('PORT')," to ").concat(v('VALUE')));case'stc12_setpart':return line("set ".concat(f('PART')," to ").concat(v('VALUE')));case'stc12_print':{const mode=f('MODE');if(mode==='text')return line("print \"".concat(this.dval(b.inputs.VALUE,blocks).replace(/^"|"$/g,''),"\""));return line("print ".concat(v('VALUE')));}case'microbit_display':{const mode=f('MODE');if(mode==='text')return line("display \"".concat(this.dval(b.inputs.VALUE,blocks).replace(/^"|"$/g,''),"\""));return line("display ".concat(v('VALUE')));}// circuit extension commands
case'circuit_setcontrol':return line("set control ".concat(v('CONTROL')," to ").concat(v('VALUE')));case'circuit_setpower':return line("turn power ".concat(f('STATE')));// Device convenience blocks
case'devices_showdigit':return line("show digit ".concat(v('DIGIT')," on ").concat(v('DISPLAY')));case'devices_setrgb':return line("set ".concat(v('LED')," colour to R ").concat(v('R')," G ").concat(v('G')," B ").concat(v('B')));case'devices_setservo':return line("set ".concat(v('SERVO')," angle to ").concat(v('ANGLE')));case'devices_setmotor':return line("set ".concat(v('MOTOR')," speed to ").concat(v('SPEED')));case'devices_setrelay':return line("set relay ".concat(v('RELAY')," ").concat(f('STATE')));case'devices_setdirection':return line("set ".concat(v('MOTOR')," direction ").concat(f('DIR')));case'devices_activate':return line("activate ".concat(v('DEVICE')));case'devices_deactivate':return line("deactivate ".concat(v('DEVICE')));case'devices_lcdprint':return line("lcd print ".concat(v('TEXT')," on ").concat(v('DISPLAY')));case'devices_lcdcursor':return line("lcd set cursor ".concat(v('ROW')," ").concat(v('COL')," on ").concat(v('DISPLAY')));case'devices_lcdclear':return line("lcd clear ".concat(v('DISPLAY')));case'devices_setpixel':return line("set pixel ".concat(v('X')," ").concat(v('Y')," to ").concat(v('BRIGHTNESS')," on ").concat(v('MATRIX')));case'devices_clearmatrix':return line("clear matrix ".concat(v('MATRIX')));case'devices_setneopixel':return line("set neopixel ".concat(v('INDEX')," to R ").concat(v('R')," G ").concat(v('G')," B ").concat(v('B')," on ").concat(v('STRIP')));case'devices_clearneopixels':return line("clear neopixels on ".concat(v('STRIP')));case'devices_tftpixel':return line("tft pixel ".concat(v('X')," ").concat(v('Y')," R ").concat(v('R')," G ").concat(v('G')," B ").concat(v('B')," on ").concat(v('DISPLAY')));case'devices_tftfill':return line("tft fill ".concat(v('X')," ").concat(v('Y')," ").concat(v('W')," ").concat(v('H')," R ").concat(v('R')," G ").concat(v('G')," B ").concat(v('B')," on ").concat(v('DISPLAY')));case'devices_tftclear':return line("tft clear ".concat(v('DISPLAY')));case'devices_tftprint':return line("tft print ".concat(v('TEXT')," on ").concat(v('DISPLAY')));case'devices_tftcursor':return line("tft set cursor ".concat(v('ROW')," ").concat(v('COL')," on ").concat(v('DISPLAY')));case'devices_oledpixel':return line("oled pixel ".concat(v('X')," ").concat(v('Y')," ").concat(v('VALUE')," on ").concat(v('DISPLAY')));case'bw_raw':{const t=String(b.fields.TEXT?b.fields.TEXT[0]:'');return line("raw \"".concat(t.replace(/\\/g,'\\\\').replace(/"/g,'\\"'),"\""));}case'devices_oledclear':return line("oled clear ".concat(v('DISPLAY')));case'devices_oledprint':return line("oled print ".concat(v('TEXT')," on ").concat(v('DISPLAY')));case'devices_oledcursor':return line("oled set cursor ".concat(v('ROW')," ").concat(v('COL')," on ").concat(v('DISPLAY')));// LED cube commands
case'ledcube_setvoxel':return line("set voxel ".concat(v('X')," ").concat(v('Y')," ").concat(v('Z')," to ").concat(v('COLOUR')));case'ledcube_clearvoxel':return line("clear voxel ".concat(v('X')," ").concat(v('Y')," ").concat(v('Z')));case'ledcube_filllayer':return line("fill layer ".concat(v('LAYER')," with ").concat(v('COLOUR')));case'ledcube_clear':return line('clear cube');case'ledcube_shift':return line("shift cube ".concat(f('DIR')));case'ledcube_hold':return line("hold frame for ".concat(v('DURATION')," ms"));case'ledcube_fillcolumn':return line("fill column ".concat(v('X')," ").concat(v('Y')," with ").concat(v('COLOUR')));case'ledcube_fillwall':return line("fill wall ".concat(v('Z')," with ").concat(v('COLOUR')));case'ledcube_invert':return line('invert cube');case'data_showlist':return line("show list ".concat(f('LIST')));case'data_hidelist':return line("hide list ".concat(f('LIST')));case'data_showvariable':return line("show variable ".concat(f('VARIABLE')));case'data_hidevariable':return line("hide variable ".concat(f('VARIABLE')));// ---- broadcasts ----
case'event_broadcast':return line("broadcast ".concat(this.dbroadcast(b.inputs.BROADCAST_INPUT)));case'event_broadcastandwait':return line("broadcast ".concat(this.dbroadcast(b.inputs.BROADCAST_INPUT)," and wait"));// ---- custom block calls ----
case'procedures_call':{const m=b.mutation;const argIds=JSON.parse(m.argumentids||'[]');let ai=0;const text=m.proccode.replace(/%[sb]/g,tok=>{const input=b.inputs[argIds[ai++]];if(tok==='%b')return"(".concat(this.dcond(input[1],blocks),")");return this.dval(input,blocks);});return line(text);}default:return line("# unsupported: ".concat(b.opcode));}}dbroadcast(input){if(Array.isArray(input)&&Array.isArray(input[1])&&input[1][0]===11)return"\"".concat(input[1][1],"\"");return'"message1"';}// ---- Python code generation (blocks -> readable Python 3) --------------------
// Phase 1 of multi-target codegen (see PLAN §22): the algorithmic subset
// (variables, math, loops, if/else, lists, say->print, ask->input) emits
// runnable Python; sprite/graphics blocks are emitted as `# ...` comments.
isHat(op){return['event_whenflagclicked','event_whenkeypressed','event_whenthisspriteclicked','event_whenbroadcastreceived','control_start_as_clone','procedures_definition','stc12_whenpin','devices_whenabove','devices_whencloser','devices_whenmotion','devices_whentilted','devices_whenirreceived'].includes(op);}pyName(name){if(!this._pyNames)this._pyNames=new Map();if(this._pyNames.has(name))return this._pyNames.get(name);const id=(0,_sb3_creator_scratchruntime_js__WEBPACK_IMPORTED_MODULE_2__.sanitizeIdent)(name);const used=new Set(this._pyNames.values());let final=id,n=2;while(used.has(final))final=id+'_'+n++;this._pyNames.set(name,final);return final;}pyProcName(proccode){return this.pyName('do_'+proccode.replace(/%[sb]/g,'').trim());}pyStr(s){return JSON.stringify(String(s));}pyVal(input,blocks){if(!Array.isArray(input))return'None';const inner=input[1];if(Array.isArray(inner)){const[type,a]=inner;if(type===10||type===11){return /^-?\d+(\.\d+)?$/.test(String(a))?String(a):this.pyStr(a);}if(type===12||type===13)return this.varRef(a);return /^-?\d+(\.\d+)?$/.test(String(a))?String(a):this.pyStr(a);}return this.pyRep(blocks[inner],blocks);}pyMathop(op,x){const need=['floor','ceiling','sqrt','sin','cos','tan','ln','log','e ^','10 ^'];if(need.includes(op))this._pyUses.math=true;const m={abs:"abs(".concat(x,")"),floor:"math.floor(".concat(x,")"),ceiling:"math.ceil(".concat(x,")"),sqrt:"math.sqrt(".concat(x,")"),sin:"math.sin(math.radians(".concat(x,"))"),cos:"math.cos(math.radians(".concat(x,"))"),tan:"math.tan(math.radians(".concat(x,"))"),ln:"math.log(".concat(x,")"),log:"math.log10(".concat(x,")"),'e ^':"math.exp(".concat(x,")"),'10 ^':"(10 ** (".concat(x,"))")};return m[op]||"abs(".concat(x,")");}pyRep(b,blocks){if(!b)return'None';const v=k=>this.pyVal(b.inputs[k],blocks);const f=k=>b.fields[k]?b.fields[k][0]:'';switch(b.opcode){case'operator_add':return"(".concat(v('NUM1')," + ").concat(v('NUM2'),")");case'operator_subtract':return"(".concat(v('NUM1')," - ").concat(v('NUM2'),")");case'operator_multiply':return"(".concat(v('NUM1')," * ").concat(v('NUM2'),")");case'operator_divide':return"(".concat(v('NUM1')," / ").concat(v('NUM2'),")");case'operator_mod':return"(".concat(v('NUM1')," % ").concat(v('NUM2'),")");case'bitops_and':return"(int(".concat(v('NUM1'),") & int(").concat(v('NUM2'),"))");case'bitops_or':return"(int(".concat(v('NUM1'),") | int(").concat(v('NUM2'),"))");case'bitops_xor':return"(int(".concat(v('NUM1'),") ^ int(").concat(v('NUM2'),"))");case'bitops_shl':return"(int(".concat(v('NUM1'),") << int(").concat(v('NUM2'),"))");case'bitops_shr':return"(int(".concat(v('NUM1'),") >> int(").concat(v('NUM2'),"))");case'bitops_not':return"(~int(".concat(v('NUM'),"))");case'operator_random':this._pyUses.random=true;return"random.randint(".concat(v('FROM'),", ").concat(v('TO'),")");case'operator_round':return"round(".concat(v('NUM'),")");case'operator_mathop':return this.pyMathop(f('OPERATOR'),v('NUM'));case'operator_join':return"(str(".concat(v('STRING1'),") + str(").concat(v('STRING2'),"))");case'operator_letter_of':return"str(".concat(v('STRING'),")[int(").concat(v('LETTER'),") - 1]");case'operator_length':return"len(str(".concat(v('STRING'),"))");case'operator_contains':return"(str(".concat(v('STRING2'),") in str(").concat(v('STRING1'),"))");case'data_itemoflist':return"".concat(this.varRef(f('LIST')),"[int(").concat(v('INDEX'),") - 1]");case'data_lengthoflist':return"len(".concat(this.varRef(f('LIST')),")");case'data_listcontainsitem':return"(".concat(v('ITEM')," in ").concat(this.varRef(f('LIST')),")");case'sensing_answer':this._pyUses.answer=true;return'answer';case'argument_reporter_string_number':case'argument_reporter_boolean':return this.pyName(f('VALUE'));// Planète Maths extension (id `planetemaths`) — pure math, maps 1:1.
case'planetemaths_add':return"(".concat(v('NUM1')," + ").concat(v('NUM2'),")");case'planetemaths_substract':return"(".concat(v('NUM1')," - ").concat(v('NUM2'),")");case'planetemaths_multiply':return"(".concat(v('NUM1')," * ").concat(v('NUM2'),")");case'planetemaths_divide':return"(".concat(v('NUM1')," / ").concat(v('NUM2'),")");case'planetemaths_pow':return"(".concat(v('NUM1')," ** ").concat(v('NUM2'),")");case'planetemaths_oppose':return"(0 - ".concat(v('NUM1'),")");case'planetemaths_inverse':return"(1 / ".concat(v('NUM1'),")");case'planetemaths_pourcent':return"(".concat(v('NUM1')," / 100)");case'planetemaths_nombre_pi':this._pyUses.math=true;return'math.pi';case'planetemaths_nombre_e':this._pyUses.math=true;return'math.e';case'planetemaths_factorial':this._pyUses.math=true;return"math.factorial(int(".concat(v('NUM1'),"))");case'planetemaths_min':return"min(".concat(v('NUM1'),", ").concat(v('NUM2'),")");case'planetemaths_max':return"max(".concat(v('NUM1'),", ").concat(v('NUM2'),")");case'planetemaths_random':this._pyUses.random=true;return"random.randint(".concat(v('NUM1'),", ").concat(v('NUM2'),")");case'planetemaths_join':return"(str(".concat(v('STRING1'),") + str(").concat(v('STRING2'),"))");case'planetemaths_letterOf':return"str(".concat(v('STRING'),")[int(").concat(v('LETTER'),") - 1]");case'planetemaths_length':return"len(str(".concat(v('STRING'),"))");case'planetemaths_sommechiffres':this._pyUses.sumdigits=true;return"_sumdigits(".concat(v('NUM1'),")");// Arrays & Vectors reporters (0-based; `_arrays` registry).
// Scratch-runtime reporters (x position, mouse x, timer, …) -> scratch.<method>().
default:{const ac=this.arraysCall(b,blocks,this.pyVal);if(ac)return ac.call;const sc=this.scratchCall(b,blocks,this.pyVal);if(sc)return sc.call;const rc=this.runtimeCall(b,blocks,v);// pluggable runtime/hardware extensions
if(rc)return rc.call;return'None';}}}pyCond(ref,blocks){const b=blocks[ref];if(!b)return'False';const v=k=>this.pyVal(b.inputs[k],blocks);const c=k=>this.pyCond(b.inputs[k][1],blocks);switch(b.opcode){case'operator_gt':return"(".concat(v('OPERAND1')," > ").concat(v('OPERAND2'),")");case'operator_lt':return"(".concat(v('OPERAND1')," < ").concat(v('OPERAND2'),")");case'operator_equals':this._pyUses.eq=true;return"_eq(".concat(v('OPERAND1'),", ").concat(v('OPERAND2'),")");case'operator_and':return"(".concat(c('OPERAND1')," and ").concat(c('OPERAND2'),")");case'operator_or':return"(".concat(c('OPERAND1')," or ").concat(c('OPERAND2'),")");case'operator_not':return"(not ".concat(c('OPERAND'),")");case'operator_contains':return"(str(".concat(v('STRING2'),") in str(").concat(v('STRING1'),"))");case'data_listcontainsitem':return"(".concat(v('ITEM')," in ").concat(this.varRef(b.fields.LIST[0]),")");case'argument_reporter_boolean':return this.pyName(b.fields.VALUE[0]);// Planète Maths booleans — semantics from the implementation (opcode names
// are internal misnomers: `gt` computes compare<0, i.e. NUM1 < NUM2).
case'planetemaths_gt':return"(".concat(v('NUM1')," < ").concat(v('NUM2'),")");case'planetemaths_gte':return"(".concat(v('NUM1')," <= ").concat(v('NUM2'),")");case'planetemaths_lt':return"(".concat(v('NUM1')," > ").concat(v('NUM2'),")");case'planetemaths_lte':return"(".concat(v('NUM1')," >= ").concat(v('NUM2'),")");case'planetemaths_equals':this._pyUses.eq=true;return"_eq(".concat(v('NUM1'),", ").concat(v('NUM2'),")");case'planetemaths_and':return"(".concat(c('OPERAND1')," and ").concat(c('OPERAND2'),")");case'planetemaths_or':return"(".concat(c('OPERAND1')," or ").concat(c('OPERAND2'),")");case'planetemaths_not':return"(not ".concat(c('OPERAND1'),")");case'planetemaths_contains':return"(str(".concat(v('STRING2'),") in str(").concat(v('STRING1'),"))");case'planetemaths_multiple':this._pyUses.multiple=true;return"_multiple(".concat(v('NUM1'),", ").concat(v('NUM2'),")");// Scratch-runtime predicates (touching, key pressed?, mouse down?) -> scratch.<method>().
default:{const ac=this.arraysCall(b,blocks,this.pyVal);if(ac)return ac.call;const sc=this.scratchCall(b,blocks,this.pyVal);if(sc)return sc.call;const rc=this.runtimeCall(b,blocks,v);if(rc)return rc.call;return'False';}}}// Project-wide blockId -> comment text map for codegen. Block ids are unique
// across targets, so one merged map is safe.
_buildCodeComments(targets){this._codeComments={};for(const t of targets||[]){for(const c of Object.values(t.comments||{})){if(c&&c.blockId)this._codeComments[c.blockId]=c.text;}}}// `#` / `//` comment lines (indented to `pad`) for a block carrying a Scratch
// block comment, so a native comment survives blocks -> Python/JS. Mirrors the
// decompiler's commentLines(); reads the project-wide _codeComments map built
// in generatePython/generateJavaScript.
codeCommentLines(blockId,pad,marker){if(this._emitComments===false)return[];const text=this._codeComments&&this._codeComments[blockId];if(!text)return[];return String(text).split('\n').map(l=>"".concat(pad).concat(marker," ").concat(l));}pyStackFrom(firstId,blocks,level){const lines=[];let id=firstId;const pad='    '.repeat(level);while(id&&blocks[id]){lines.push(...this.codeCommentLines(id,pad,'#'));lines.push(...this.pyStackBlock(blocks[id],blocks,level));id=blocks[id].next;}return lines;}pyStackBlock(b,blocks,level){const pad='    '.repeat(level);const v=k=>this.pyVal(b.inputs[k],blocks);const f=k=>b.fields[k]?b.fields[k][0]:'';// A Python block needs a real statement; a body of only `# comments`
// (sprite ops we don't run) still needs a `pass`.
const body=k=>{const s=b.inputs[k]?this.pyStackFrom(b.inputs[k][1],blocks,level+1):[];const real=s.some(l=>{const t=l.trim();return t&&!t.startsWith('#');});return real?s:[...s,pad+'    pass'];};const line=t=>[pad+t];switch(b.opcode){case'control_forever':return[pad+'while True:',...body('SUBSTACK')];case'control_repeat':return[pad+"for _ in range(int(".concat(v('TIMES'),")):"),...body('SUBSTACK')];case'control_repeat_until':return[pad+"while not (".concat(this.pyCond(b.inputs.CONDITION[1],blocks),"):"),...body('SUBSTACK')];case'control_if':return[pad+"if ".concat(this.pyCond(b.inputs.CONDITION[1],blocks),":"),...body('SUBSTACK')];case'control_if_else':return[pad+"if ".concat(this.pyCond(b.inputs.CONDITION[1],blocks),":"),...body('SUBSTACK'),pad+'else:',...body('SUBSTACK2')];case'control_wait':this._pyUses.time=true;return line("time.sleep(".concat(v('DURATION'),")"));case'control_wait_until':return[pad+"while not (".concat(this.pyCond(b.inputs.CONDITION[1],blocks),"):"),pad+'    pass'];// 'this script' -> return (halts the Python function); 'all'/'other' -> scratch.stop().
case'control_stop':return f('STOP_OPTION')==='this script'?line('return'):line(this.scratchCall(b,blocks,this.pyVal).call);case'sensing_askandwait':this._pyUses.answer=true;return line("answer = input(str(".concat(v('QUESTION'),") + \" \")"));case'data_setvariableto':return line("".concat(this.varRef(f('VARIABLE'))," = ").concat(v('VALUE')));case'data_changevariableby':return line("".concat(this.varRef(f('VARIABLE'))," += ").concat(v('VALUE')));case'data_addtolist':return line("".concat(this.varRef(f('LIST')),".append(").concat(v('ITEM'),")"));case'data_deleteoflist':return line("del ".concat(this.varRef(f('LIST')),"[int(").concat(v('INDEX'),") - 1]"));case'data_deletealloflist':return line("".concat(this.varRef(f('LIST')),".clear()"));case'data_insertatlist':return line("".concat(this.varRef(f('LIST')),".insert(int(").concat(v('INDEX'),") - 1, ").concat(v('ITEM'),")"));case'data_replaceitemoflist':return line("".concat(this.varRef(f('LIST')),"[int(").concat(v('INDEX'),") - 1] = ").concat(v('ITEM')));// Arrays & Vectors extension (id `arrays`) — a named-array registry (`_arrays`),
// 0-based indexing (matches the extension). Command blocks:
case'procedures_call':{const m=b.mutation;const argIds=JSON.parse(m.argumentids||'[]');let ai=0;const args=[];m.proccode.replace(/%[sb]/g,tok=>{const input=b.inputs[argIds[ai++]];args.push(tok==='%b'?this.pyCond(input[1],blocks):this.pyVal(input,blocks));return'';});const fn=this.pyName(this._curPrefix+this.pyProcRaw(m.proccode));return line("".concat(this._async?'await ':'').concat(fn,"(").concat(args.join(', '),")"));}default:{const ac=this.arraysCall(b,blocks,this.pyVal);if(ac)return line(ac.call);const sc=this.scratchCall(b,blocks,this.pyVal);// motion/looks/sensing/pen/… -> scratch.<method>()
if(sc)return line(sc.call);const rc=this.runtimeCall(b,blocks,v);// pluggable runtime/hardware commands
if(rc)return line(rc.call);const ps=(this.decompileStackBlock(b,blocks,0)[0]||b.opcode).trim();return line("# ".concat(ps));}}}pyAssigned(firstId,blocks,acc){let id=firstId;while(id&&blocks[id]){const b=blocks[id];if(b.opcode==='data_setvariableto'||b.opcode==='data_changevariableby')acc.add(b.fields.VARIABLE[0]);if(b.opcode==='sensing_askandwait')acc.add('\u0000answer');for(const k of['SUBSTACK','SUBSTACK2'])if(b.inputs[k])this.pyAssigned(b.inputs[k][1],blocks,acc);id=b.next;}return acc;}pyHatName(b){const f=k=>b.fields[k]?b.fields[k][0]:'';switch(b.opcode){case'event_whenflagclicked':return'when_flag_clicked';case'event_whenkeypressed':return this.pyName('when_'+f('KEY_OPTION')+'_key');case'event_whenthisspriteclicked':return'when_clicked';case'event_whenbroadcastreceived':return this.pyName('on_'+f('BROADCAST_OPTION'));case'control_start_as_clone':return'when_clone_starts';default:return this.pyName('handler');}}pyFunc(header,firstId,blocks,argNames){if(this._async)header='async '+header;// await runtime/hardware calls
const assigned=this.pyAssigned(firstId,blocks,new Set());const globals=[];for(const a of assigned){if(a==='\u0000answer'){globals.push('answer');this._pyUses.answer=true;}else{const nm=this.varRef(a);if(!argNames.includes(nm))globals.push(nm);}}const bodyLines=this.pyStackFrom(firstId,blocks,1);const out=[header];if(globals.length)out.push('    global '+[...new Set(globals)].join(', '));out.push(...bodyLines);// Ensure a real statement (a `global` line counts; a body of only comments does not).
const hasStmt=globals.length>0||bodyLines.some(l=>{const t=l.trim();return t&&!t.startsWith('#');});if(!hasStmt)out.push('    pass');return out.join('\n');}// ---- scratch-runtime shim helpers (shared by Python + JS codegen) -----------
// Prefix-aware variable/list reference: sprite-local names are prefixed `s<idx>_`
// (so same-named locals in different sprites stay distinct in the flat module);
// globals (Stage) and anything else use their plain sanitized name.
varRef(name){if(this._curLocals&&this._curLocals.has(name))return this._curPrefix+this.pyName(name);return this.pyName(name);}scratchCall(b,blocks,valFn){return this.runtimeObjCall(b,blocks,valFn,_sb3_creator_scratchruntime_js__WEBPACK_IMPORTED_MODULE_2__.OP_TO_SCRATCH,'scratch');}arraysCall(b,blocks,valFn){if(!_sb3_creator_scratchruntime_js__WEBPACK_IMPORTED_MODULE_2__.OP_TO_ARRAYS[b.opcode])return null;if(this._pyUses){this._pyUses.arrays=true;this._pyUses.json=true;}if(this._jsUses)this._jsUses.arrays=true;return this.runtimeObjCall(b,blocks,valFn,_sb3_creator_scratchruntime_js__WEBPACK_IMPORTED_MODULE_2__.OP_TO_ARRAYS,'_arrays');}// Build an `<obj>.<method>(args)` call for a block from a reversible-op table, or null.
// `valFn` is pyVal or jsVal (value inputs); menu/field args become string literals,
// broadcasts pass through quoted. Used for both `scratch` and the `_arrays` registry.
runtimeObjCall(b,blocks,valFn,table,obj){const e=table[b.opcode];if(!e)return null;const args=e.gen.map(g=>{if(g.v)return valFn.call(this,b.inputs[g.v],blocks);// A menu input can be obscured by a reporter (e.g. `switch costume to (join …)`);
// then emit the expression, otherwise the dropdown value as a string literal.
if(g.m){const inp=b.inputs[g.m];if(Array.isArray(inp)&&inp[0]===3)return valFn.call(this,inp,blocks);return this.pyStr(this.dmenu(inp,blocks,g.field||g.m));}if(g.f)return this.pyStr(b.fields[g.f]?b.fields[g.f][0]:'');if(g.bc)return this.dbroadcast(b.inputs[g.bc]);return'None';});return{kind:e.kind||'command',call:"".concat(obj,".").concat(e.m,"(").concat(args.join(', '),")")};}// A guaranteed-unique sanitized identifier (unlike pyName, which memoizes by input, so
// two same-named hats — e.g. a sprite with two `when flag clicked` — would collide).
pyFreshName(base){let id=String(base).replace(/[^A-Za-z0-9_]+/g,'_').replace(/^_+|_+$/g,'')||'f';if(/^[0-9]/.test(id))id='v_'+id;const used=new Set(this._pyNames.values());let final=id,n=2;while(used.has(final))final=id+'_'+n++;this._pyNames.set(Symbol(base),final);// reserve the value (Symbol key never matches a name lookup)
return final;}// Custom-block base name (unprefixed) and hat base name — used with the sprite prefix.
pyProcRaw(proccode){return'do_'+String(proccode).replace(/%[sb]/g,'').trim();}pyHatBase(b){const f=k=>b.fields[k]?b.fields[k][0]:'';switch(b.opcode){case'event_whenflagclicked':return'when_flag_clicked';case'event_whenkeypressed':return'when_'+f('KEY_OPTION')+'_key';case'event_whenthisspriteclicked':return'when_clicked';case'event_whenbroadcastreceived':return'on_'+f('BROADCAST_OPTION');case'control_start_as_clone':return'when_clone_starts';default:return'handler';}}// DEVICE / CLOCK / PIN as reversible marker calls. Without these the Python
// and JavaScript targets emitted the pin-driver shim and the setPin() calls
// but nothing that says what the pins ARE, so a hardware project came back
// from either of them with `_stc12` as a variable and no pins at all.
stcStructMarkers(project){const stc=project&&project.stc;if(!stc||!stc.pins||!stc.pins.length)return[];const q=v=>this.pyStr(v);const lines=["scratch.device(".concat(q(stc.device),", ").concat(stc.clock,")")];for(const pin of stc.pins){const loc=pin.where||"P".concat(pin.port,".").concat(pin.bit);lines.push("scratch.pin(".concat(q(pin.name),", ").concat(q(loc),", ")+"".concat(q(pin.direction),", ").concat(pin.activeLow?1:0,")"));}return lines;}// The pseudocode structure markers for one target: scratch.sprite/stage + local + costume.
// `quote` = this.pyStr (JSON strings work in both Python and JS).
scratchStructMarkers(t){const q=s=>this.pyStr(s);const lines=[];if(t.isStage)lines.push('scratch.stage()');else{const shape=t.costumes&&t.costumes[0]&&t.costumes[0]._shapeSpec;lines.push(shape?"scratch.sprite(".concat(q(t.name),", ").concat(q(shape),")"):"scratch.sprite(".concat(q(t.name),")"));}for(const v of Object.values(t.variables||{}))if(!t.isStage)lines.push("scratch.local(".concat(q(v[0]),")"));for(const l of Object.values(t.lists||{}))if(!t.isStage)lines.push("scratch.local_list(".concat(q(l[0]),")"));for(const cos of(t.costumes||[]).slice(1))lines.push("scratch.costume(".concat(q(cos._spec||cos.name),")"));for(const snd of(t.sounds||[]).slice(1))lines.push("scratch.sound(".concat(q(snd.name),")"));return lines;}generatePython(){let project=arguments.length>0&&arguments[0]!==undefined?arguments[0]:this.project;let opts=arguments.length>1&&arguments[1]!==undefined?arguments[1]:{};this._driverPins=project.stc&&project.stc.pins||null;this._pyNames=new Map();this._pyUses={random:false,math:false,time:false,eq:false,answer:false,arrays:false,json:false,sumdigits:false};this._runtimesUsed=new Set();this._async=!!(opts&&opts.async);this._events=!!(opts&&opts.events);this._emitComments=!(opts&&opts.comments===false);// default: include block comments as #/// lines
const targets=project.targets||[];this._buildCodeComments(targets);const stage=targets.find(t=>t.isStage);// Stage variables are globals; sprite variables are locals (prefixed per sprite).
const gScalars=stage?Object.values(stage.variables||{}).map(v=>v[0]):[];const gLists=stage?Object.values(stage.lists||{}).map(l=>l[0]):[];for(const n of gScalars)this.pyName(n);for(const n of gLists)this.pyName(n);// Sections in emission order (Stage only if it has scripts). The section's POSITION
// is its sprite index for prefixing — matching how the parser counts markers back.
const sections=targets.filter(t=>!t.isStage||Object.values(t.blocks||{}).some(b=>b.topLevel));const stateDecls=[];// module-level `name = 0/[]` (globals + all locals)
const bodyBlocks=[];// [{markers, defs}] in emission order
const flagCalls=[],eventRegs=[];for(const n of gScalars)stateDecls.push("".concat(this.pyName(n)," = 0"));for(const n of gLists)stateDecls.push("".concat(this.pyName(n)," = []"));sections.forEach((t,idx)=>{const pfx=(0,_sb3_creator_scratchruntime_js__WEBPACK_IMPORTED_MODULE_2__.spritePrefix)(idx);const localScalars=t.isStage?[]:Object.values(t.variables||{}).map(v=>v[0]);const localLists=t.isStage?[]:Object.values(t.lists||{}).map(l=>l[0]);this._curPrefix=pfx;this._curLocals=new Set([...localScalars,...localLists]);for(const n of localScalars)stateDecls.push("".concat(pfx).concat(this.pyName(n)," = 0"));for(const n of localLists)stateDecls.push("".concat(pfx).concat(this.pyName(n)," = []"));const defs=[];const blocks=t.blocks||{};for(const b of Object.values(blocks)){if(!b.topLevel)continue;const rop=this.runtimeOp(b.opcode);if(rop&&rop.kind==='hat'){if(this._events){this._runtimesUsed.add(b.opcode.slice(0,b.opcode.indexOf('_')));const hn=this.pyFreshName(pfx+'on_'+b.opcode.slice(b.opcode.indexOf('_')+1));defs.push(this.pyFunc("def ".concat(hn,"():"),b.next,blocks,[]));eventRegs.push("_".concat(rop.runtime,".on(").concat(this.pyStr(b.opcode),", ").concat(hn,")"));}continue;}if(!this.isHat(b.opcode))continue;if(b.opcode==='procedures_definition'){const proto=blocks[b.inputs.custom_block[1]];const m=proto.mutation;const argNames=JSON.parse(m.argumentnames||'[]').map(n=>this.pyName(n));const fn=this.pyName(pfx+this.pyProcRaw(m.proccode));// Marker preserves the exact proccode (arg positions interleave with label
// words) + warp flag, which the flat function name can't encode.
const marker="scratch.defblock(".concat(this.pyStr(m.proccode),", ").concat(m.warp==='true'?1:0,")");defs.push(marker+'\n'+this.pyFunc("def ".concat(fn,"(").concat(argNames.join(', '),"):"),b.next,blocks,argNames));}else{const name=this.pyFreshName(pfx+this.pyHatBase(b));const isFlag=b.opcode==='event_whenflagclicked';// A comment on the hat belongs to the script, and was being dropped.
const note=this.codeCommentLines(Object.keys(blocks).find(k=>blocks[k]===b),'','#');let code=this.pyFunc("def ".concat(name,"():"),b.next,blocks,[]);if(note.length)code=note.join('\n')+'\n'+code;if(!isFlag)code="# ".concat(this.decompileHat(b,blocks),"  (event handler \u2014 call it when that event happens)\n")+code;defs.push(code);if(isFlag)flagCalls.push("".concat(name,"()"));}}bodyBlocks.push({markers:this.scratchStructMarkers(t),defs});});this._curPrefix='';this._curLocals=null;const out=[];out.push('# Generated by Brickwright — blocks → Python.');out.push('# Scratch blocks (motion/looks/sensing/…) map to a `scratch` runtime object;');out.push('# sprite structure is marked by scratch.sprite()/costume() so it round-trips to blocks.');out.push('');if(this._pyUses.random)out.push('import random');if(this._pyUses.math)out.push('import math');if(this._pyUses.time)out.push('import time');if(this._pyUses.json)out.push('import json');if(this._async)out.push('import asyncio');if(this._pyUses.random||this._pyUses.math||this._pyUses.time||this._pyUses.json||this._async)out.push('');out.push(...this.scratchShimPy());out.push('');if(this._pyUses.arrays){out.push(...this.arraysShimPy());out.push('');}if(this._pyUses.sumdigits){out.push('def _sumdigits(n): return sum(int(d) for d in str(n) if d.isdigit())');out.push('');}if(this._pyUses.multiple){out.push('def _multiple(a, b):  # `is multiple of`, kept distinct from `mod … = 0`');out.push('    return float(b) != 0 and float(a) % float(b) == 0');out.push('');}if(this._pyUses.eq){out.push('def _eq(a, b):  # Scratch-style loose equality');out.push('    try:');out.push('        return float(a) == float(b)');out.push('    except (ValueError, TypeError):');out.push('        return str(a).lower() == str(b).lower()');out.push('');}// Pluggable driver shim(s) for any runtime/hardware extensions used.
for(const extId of this._runtimesUsed){out.push(...this.runtimeShim(extId,'py',opts.driver||'shim'));out.push('');}// module state
if(this._pyUses.answer)stateDecls.push('answer = ""');if(stateDecls.length){out.push(...stateDecls);out.push('');}// Hardware declarations first: they are the project's header in pseudocode too.
const stcMarkers=this.stcStructMarkers(project);if(stcMarkers.length){out.push(...stcMarkers);out.push('');}// Global-name markers (carry original names so the parser un-mangles identifiers).
for(const n of gScalars)out.push("scratch.global_var(".concat(this.pyStr(n),")"));for(const n of gLists)out.push("scratch.global_list(".concat(this.pyStr(n),")"));if(gScalars.length||gLists.length)out.push('');for(const{markers,defs}of bodyBlocks){out.push(...markers);out.push('');for(const d of defs){out.push(d);out.push('');}}if(eventRegs.length||flagCalls.length){out.push('# run');out.push(...eventRegs);out.push(...flagCalls.map(c=>this._async?"asyncio.run(".concat(c,")"):c));}return out.join('\n').replace(/\n{3,}/g,'\n\n').trim()+'\n';}// A tiny no-op `scratch` runtime so the generated Python runs headless. It is the swap
// point: implement these to drive a real stage. Reporters return neutral values.
scratchShimPy(){return['class _Scratch:','    """No-op Scratch stage shim (swap for a real renderer). Reporters return neutral values."""','    def say(self, msg, *_a): print(msg)','    def think(self, msg, *_a): print(msg)','    def __getattr__(self, _name):','        def _op(*_a, **_k): return 0','        return _op','scratch = _Scratch()'];}// ---- JavaScript code generation (same walker, JS templates) -----------------
// JS closures mean functions read the outer `let` state directly (no `global`),
// and empty `{}` is valid (no `pass` needed). Runs in a browser (console/prompt).
jsVal(input,blocks){if(!Array.isArray(input))return'undefined';const inner=input[1];if(Array.isArray(inner)){const[type,a]=inner;if(type===12||type===13)return this.varRef(a);return /^-?\d+(\.\d+)?$/.test(String(a))?String(a):this.pyStr(a);}return this.jsRep(blocks[inner],blocks);}jsMathop(op,x){const m={abs:"Math.abs(".concat(x,")"),floor:"Math.floor(".concat(x,")"),ceiling:"Math.ceil(".concat(x,")"),sqrt:"Math.sqrt(".concat(x,")"),sin:"Math.sin((".concat(x,") * Math.PI / 180)"),cos:"Math.cos((".concat(x,") * Math.PI / 180)"),tan:"Math.tan((".concat(x,") * Math.PI / 180)"),ln:"Math.log(".concat(x,")"),log:"Math.log10(".concat(x,")"),'e ^':"Math.exp(".concat(x,")"),'10 ^':"(10 ** (".concat(x,"))")};return m[op]||"Math.abs(".concat(x,")");}jsRep(b,blocks){if(!b)return'undefined';const v=k=>this.jsVal(b.inputs[k],blocks);const f=k=>b.fields[k]?b.fields[k][0]:'';const L=k=>this.varRef(f(k));switch(b.opcode){case'operator_add':return"(".concat(v('NUM1')," + ").concat(v('NUM2'),")");case'operator_subtract':return"(".concat(v('NUM1')," - ").concat(v('NUM2'),")");case'operator_multiply':return"(".concat(v('NUM1')," * ").concat(v('NUM2'),")");case'operator_divide':return"(".concat(v('NUM1')," / ").concat(v('NUM2'),")");case'operator_mod':return"(".concat(v('NUM1')," % ").concat(v('NUM2'),")");case'bitops_and':return"((".concat(v('NUM1'),") & (").concat(v('NUM2'),"))");case'bitops_or':return"((".concat(v('NUM1'),") | (").concat(v('NUM2'),"))");case'bitops_xor':return"((".concat(v('NUM1'),") ^ (").concat(v('NUM2'),"))");case'bitops_shl':return"((".concat(v('NUM1'),") << (").concat(v('NUM2'),"))");case'bitops_shr':return"((".concat(v('NUM1'),") >> (").concat(v('NUM2'),"))");case'bitops_not':return"(~(".concat(v('NUM'),"))");case'operator_random':this._jsUses.rand=true;return"_rand(".concat(v('FROM'),", ").concat(v('TO'),")");case'operator_round':return"Math.round(".concat(v('NUM'),")");case'operator_mathop':return this.jsMathop(f('OPERATOR'),v('NUM'));case'operator_join':return"(String(".concat(v('STRING1'),") + String(").concat(v('STRING2'),"))");case'operator_letter_of':return"String(".concat(v('STRING'),")[Number(").concat(v('LETTER'),") - 1]");case'operator_length':return"String(".concat(v('STRING'),").length");case'operator_contains':return"String(".concat(v('STRING1'),").includes(String(").concat(v('STRING2'),"))");case'data_itemoflist':return"".concat(L('LIST'),"[Number(").concat(v('INDEX'),") - 1]");case'data_lengthoflist':return"".concat(L('LIST'),".length");case'data_listcontainsitem':return"".concat(L('LIST'),".includes(").concat(v('ITEM'),")");case'sensing_answer':this._jsUses.answer=true;return'answer';case'argument_reporter_string_number':case'argument_reporter_boolean':return this.pyName(f('VALUE'));// Planète Maths extension (id `planetemaths`) — source of truth:
// github.com/CrispStrobe/extensions (extensions/CrispStrobe/planetemaths.js).
case'planetemaths_add':return"(".concat(v('NUM1')," + ").concat(v('NUM2'),")");case'planetemaths_substract':return"(".concat(v('NUM1')," - ").concat(v('NUM2'),")");case'planetemaths_multiply':return"(".concat(v('NUM1')," * ").concat(v('NUM2'),")");case'planetemaths_divide':return"(".concat(v('NUM1')," / ").concat(v('NUM2'),")");case'planetemaths_pow':return"Math.pow(".concat(v('NUM1'),", ").concat(v('NUM2'),")");case'planetemaths_oppose':return"(0 - ".concat(v('NUM1'),")");case'planetemaths_inverse':return"(1 / ".concat(v('NUM1'),")");case'planetemaths_pourcent':return"(".concat(v('NUM1')," / 100)");case'planetemaths_nombre_pi':return'Math.PI';case'planetemaths_nombre_e':return'Math.E';case'planetemaths_factorial':this._jsUses.fact=true;return"_fact(".concat(v('NUM1'),")");case'planetemaths_min':return"Math.min(".concat(v('NUM1'),", ").concat(v('NUM2'),")");case'planetemaths_max':return"Math.max(".concat(v('NUM1'),", ").concat(v('NUM2'),")");case'planetemaths_random':this._jsUses.rand=true;return"_rand(".concat(v('NUM1'),", ").concat(v('NUM2'),")");case'planetemaths_join':return"(String(".concat(v('STRING1'),") + String(").concat(v('STRING2'),"))");case'planetemaths_letterOf':return"String(".concat(v('STRING'),")[Number(").concat(v('LETTER'),") - 1]");case'planetemaths_length':return"String(".concat(v('STRING'),").length");case'planetemaths_sommechiffres':this._jsUses.sumdigits=true;return"_sumdigits(".concat(v('NUM1'),")");// Arrays & Vectors reporters (0-based; `_arrays` registry).
default:{const ac=this.arraysCall(b,blocks,this.jsVal);if(ac)return ac.call;const sc=this.scratchCall(b,blocks,this.jsVal);// scratch-runtime reporters
if(sc)return sc.call;const rc=this.runtimeCall(b,blocks,v);// pluggable runtime/hardware extensions
if(rc)return rc.call;return'undefined';}}}jsCond(ref,blocks){const b=blocks[ref];if(!b)return'false';const v=k=>this.jsVal(b.inputs[k],blocks);const c=k=>this.jsCond(b.inputs[k][1],blocks);switch(b.opcode){case'operator_gt':return"(".concat(v('OPERAND1')," > ").concat(v('OPERAND2'),")");case'operator_lt':return"(".concat(v('OPERAND1')," < ").concat(v('OPERAND2'),")");case'operator_equals':this._jsUses.eq=true;return"_eq(".concat(v('OPERAND1'),", ").concat(v('OPERAND2'),")");case'operator_and':return"(".concat(c('OPERAND1')," && ").concat(c('OPERAND2'),")");case'operator_or':return"(".concat(c('OPERAND1')," || ").concat(c('OPERAND2'),")");case'operator_not':return"(!".concat(c('OPERAND'),")");case'operator_contains':return"String(".concat(v('STRING1'),").includes(String(").concat(v('STRING2'),"))");case'data_listcontainsitem':return"".concat(this.varRef(b.fields.LIST[0]),".includes(").concat(v('ITEM'),")");case'argument_reporter_boolean':return this.pyName(b.fields.VALUE[0]);// Planète Maths booleans (semantics from the implementation, not the labels).
case'planetemaths_gt':return"(".concat(v('NUM1')," < ").concat(v('NUM2'),")");case'planetemaths_gte':return"(".concat(v('NUM1')," <= ").concat(v('NUM2'),")");case'planetemaths_lt':return"(".concat(v('NUM1')," > ").concat(v('NUM2'),")");case'planetemaths_lte':return"(".concat(v('NUM1')," >= ").concat(v('NUM2'),")");case'planetemaths_equals':this._jsUses.eq=true;return"_eq(".concat(v('NUM1'),", ").concat(v('NUM2'),")");case'planetemaths_and':return"(".concat(c('OPERAND1')," && ").concat(c('OPERAND2'),")");case'planetemaths_or':return"(".concat(c('OPERAND1')," || ").concat(c('OPERAND2'),")");case'planetemaths_not':return"(!".concat(c('OPERAND1'),")");case'planetemaths_contains':return"String(".concat(v('STRING1'),").includes(String(").concat(v('STRING2'),"))");case'planetemaths_multiple':this._jsUses.multiple=true;return"_multiple(".concat(v('NUM1'),", ").concat(v('NUM2'),")");default:{const ac=this.arraysCall(b,blocks,this.jsVal);if(ac)return ac.call;const sc=this.scratchCall(b,blocks,this.jsVal);// scratch-runtime predicates
if(sc)return sc.call;const rc=this.runtimeCall(b,blocks,v);if(rc)return rc.call;return'false';}}}jsStackFrom(firstId,blocks,level){const lines=[];let id=firstId;const pad='  '.repeat(level);while(id&&blocks[id]){lines.push(...this.codeCommentLines(id,pad,'//'));lines.push(...this.jsStackBlock(blocks[id],blocks,level));id=blocks[id].next;}return lines;}jsStackBlock(b,blocks,level){const pad='  '.repeat(level);const v=k=>this.jsVal(b.inputs[k],blocks);const f=k=>b.fields[k]?b.fields[k][0]:'';const L=k=>this.varRef(f(k));const sub=k=>b.inputs[k]?this.jsStackFrom(b.inputs[k][1],blocks,level+1):[];const line=t=>[pad+t];const block=(head,k)=>[pad+head,...sub(k),pad+'}'];const cond=()=>this.jsCond(b.inputs.CONDITION[1],blocks);switch(b.opcode){case'control_forever':return block('while (true) {','SUBSTACK');case'control_repeat':return block("for (let _i".concat(level," = 0; _i").concat(level," < ").concat(v('TIMES'),"; _i").concat(level,"++) {"),'SUBSTACK');case'control_repeat_until':return block("while (!(".concat(cond(),")) {"),'SUBSTACK');case'control_if':return block("if (".concat(cond(),") {"),'SUBSTACK');case'control_if_else':return[pad+"if (".concat(cond(),") {"),...sub('SUBSTACK'),pad+'} else {',...sub('SUBSTACK2'),pad+'}'];case'control_wait':return line("scratch.wait(".concat(v('DURATION'),");"));case'control_wait_until':return line("scratch.wait_until(".concat(cond(),");"));case'control_stop':return f('STOP_OPTION')==='this script'?line('return;'):line(this.scratchCall(b,blocks,this.jsVal).call+';');case'sensing_askandwait':this._jsUses.answer=true;return line("answer = prompt(String(".concat(v('QUESTION'),"));"));case'data_setvariableto':return line("".concat(this.varRef(f('VARIABLE'))," = ").concat(v('VALUE'),";"));case'data_changevariableby':return line("".concat(this.varRef(f('VARIABLE'))," += ").concat(v('VALUE'),";"));case'data_addtolist':return line("".concat(L('LIST'),".push(").concat(v('ITEM'),");"));case'data_deleteoflist':return line("".concat(L('LIST'),".splice(Number(").concat(v('INDEX'),") - 1, 1);"));case'data_deletealloflist':return line("".concat(L('LIST'),".length = 0;"));case'data_insertatlist':return line("".concat(L('LIST'),".splice(Number(").concat(v('INDEX'),") - 1, 0, ").concat(v('ITEM'),");"));case'data_replaceitemoflist':return line("".concat(L('LIST'),"[Number(").concat(v('INDEX'),") - 1] = ").concat(v('ITEM'),";"));// Arrays & Vectors extension (id `arrays`) — `_arrays` registry, 0-based.
case'procedures_call':{const m=b.mutation;const argIds=JSON.parse(m.argumentids||'[]');let ai=0;const args=[];m.proccode.replace(/%[sb]/g,tok=>{const input=b.inputs[argIds[ai++]];args.push(tok==='%b'?this.jsCond(input[1],blocks):this.jsVal(input,blocks));return'';});const fn=this.pyName(this._curPrefix+this.pyProcRaw(m.proccode));return line("".concat(this._async?'await ':'').concat(fn,"(").concat(args.join(', '),");"));}default:{const ac=this.arraysCall(b,blocks,this.jsVal);if(ac)return line(ac.call+';');const sc=this.scratchCall(b,blocks,this.jsVal);// motion/looks/sensing/pen/… -> scratch.<method>()
if(sc)return line(sc.call+';');const rc=this.runtimeCall(b,blocks,v);// pluggable runtime/hardware commands
if(rc)return line(rc.call+';');const ps=(this.decompileStackBlock(b,blocks,0)[0]||b.opcode).trim();return line("// ".concat(ps));}}}generateJavaScript(){let project=arguments.length>0&&arguments[0]!==undefined?arguments[0]:this.project;let opts=arguments.length>1&&arguments[1]!==undefined?arguments[1]:{};this._driverPins=project.stc&&project.stc.pins||null;this._pyNames=new Map();this._jsUses={rand:false,eq:false,answer:false,fact:false,arrays:false,sumdigits:false,multiple:false};this._runtimesUsed=new Set();this._async=!!(opts&&opts.async);this._events=!!(opts&&opts.events);this._emitComments=!(opts&&opts.comments===false);// default: include block comments as #/// lines
const targets=project.targets||[];this._buildCodeComments(targets);const stage=targets.find(t=>t.isStage);const gScalars=stage?Object.values(stage.variables||{}).map(v=>v[0]):[];const gLists=stage?Object.values(stage.lists||{}).map(l=>l[0]):[];for(const n of gScalars)this.pyName(n);for(const n of gLists)this.pyName(n);const sections=targets.filter(t=>!t.isStage||Object.values(t.blocks||{}).some(b=>b.topLevel));const stateDecls=[];const bodyBlocks=[];const flagCalls=[],eventRegs=[];for(const n of gScalars)stateDecls.push("let ".concat(this.pyName(n)," = 0;"));for(const n of gLists)stateDecls.push("let ".concat(this.pyName(n)," = [];"));sections.forEach((t,idx)=>{const pfx=(0,_sb3_creator_scratchruntime_js__WEBPACK_IMPORTED_MODULE_2__.spritePrefix)(idx);const localScalars=t.isStage?[]:Object.values(t.variables||{}).map(v=>v[0]);const localLists=t.isStage?[]:Object.values(t.lists||{}).map(l=>l[0]);this._curPrefix=pfx;this._curLocals=new Set([...localScalars,...localLists]);for(const n of localScalars)stateDecls.push("let ".concat(pfx).concat(this.pyName(n)," = 0;"));for(const n of localLists)stateDecls.push("let ".concat(pfx).concat(this.pyName(n)," = [];"));const defs=[];const blocks=t.blocks||{};const af=this._async?'async ':'';for(const b of Object.values(blocks)){if(!b.topLevel)continue;const rop=this.runtimeOp(b.opcode);if(rop&&rop.kind==='hat'){if(this._events){this._runtimesUsed.add(b.opcode.slice(0,b.opcode.indexOf('_')));const hn=this.pyFreshName(pfx+'on_'+b.opcode.slice(b.opcode.indexOf('_')+1));defs.push(["".concat(af,"function ").concat(hn,"() {"),...this.jsStackFrom(b.next,blocks,1),'}'].join('\n'));eventRegs.push("_".concat(rop.runtime,".on(").concat(this.pyStr(b.opcode),", ").concat(hn,");"));}continue;}if(!this.isHat(b.opcode))continue;if(b.opcode==='procedures_definition'){const proto=blocks[b.inputs.custom_block[1]];const m=proto.mutation;const argNames=JSON.parse(m.argumentnames||'[]').map(n=>this.pyName(n));const fn=this.pyName(pfx+this.pyProcRaw(m.proccode));const marker="scratch.defblock(".concat(this.pyStr(m.proccode),", ").concat(m.warp==='true'?1:0,");");defs.push([marker,"".concat(af,"function ").concat(fn,"(").concat(argNames.join(', '),") {"),...this.jsStackFrom(b.next,blocks,1),'}'].join('\n'));}else{const name=this.pyFreshName(pfx+this.pyHatBase(b));const isFlag=b.opcode==='event_whenflagclicked';// A comment on the hat belongs to the script, and was being dropped.
const note=this.codeCommentLines(Object.keys(blocks).find(k=>blocks[k]===b),'','//');let code=[...note,"".concat(af,"function ").concat(name,"() {"),...this.jsStackFrom(b.next,blocks,1),'}'].join('\n');if(!isFlag)code="// ".concat(this.decompileHat(b,blocks),"  (event handler \u2014 call it when that event happens)\n")+code;defs.push(code);if(isFlag)flagCalls.push("".concat(name,"();"));}}bodyBlocks.push({markers:this.scratchStructMarkers(t).map(l=>l+';'),defs});});this._curPrefix='';this._curLocals=null;const out=[];out.push('// Generated by Brickwright — blocks → JavaScript.');out.push('// Scratch blocks (motion/looks/sensing/…) map to a `scratch` runtime object;');out.push('// sprite structure is marked by scratch.sprite()/costume() so it round-trips to blocks.');out.push('');// `is multiple of` gets its own function: `x % y === 0` is a different
// block that means the same thing, and the way back cannot guess which.
if(this._jsUses.multiple)out.push('function _multiple(a, b) { return Number(b) !== 0 && Number(a) % Number(b) === 0; }');if(this._jsUses.eq)out.push('function _eq(a, b) { const x = Number(a), y = Number(b); if (!Number.isNaN(x) && !Number.isNaN(y)) return x === y; return String(a).toLowerCase() === String(b).toLowerCase(); }');if(this._jsUses.rand)out.push('function _rand(a, b) { a = Number(a); b = Number(b); return Math.floor(Math.random() * (b - a + 1)) + a; }');if(this._jsUses.fact)out.push('function _fact(n) { n = Number(n); let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }');if(this._jsUses.sumdigits)out.push("function _sumdigits(n) { return String(n).split('').filter(d => d >= '0' && d <= '9').reduce((s, d) => s + Number(d), 0); }");if(this._jsUses.eq||this._jsUses.rand||this._jsUses.fact||this._jsUses.sumdigits)out.push('');out.push(...this.scratchShimJs());out.push('');if(this._jsUses.arrays){out.push(...this.arraysShimJs());out.push('');}// Pluggable driver shim(s) for any runtime/hardware extensions used.
for(const extId of this._runtimesUsed){out.push(...this.runtimeShim(extId,'js',opts.driver||'shim'));out.push('');}if(this._jsUses.answer)stateDecls.push('let answer = "";');if(stateDecls.length){out.push(...stateDecls);out.push('');}const stcMarkers=this.stcStructMarkers(project).map(l=>l+';');if(stcMarkers.length){out.push(...stcMarkers);out.push('');}for(const n of gScalars)out.push("scratch.global_var(".concat(this.pyStr(n),");"));for(const n of gLists)out.push("scratch.global_list(".concat(this.pyStr(n),");"));if(gScalars.length||gLists.length)out.push('');for(const{markers,defs}of bodyBlocks){out.push(...markers);out.push('');for(const d of defs){out.push(d);out.push('');}}if(eventRegs.length||flagCalls.length){out.push('// run');out.push(...eventRegs);out.push(...flagCalls.map(c=>this._async?"(async () => { await ".concat(c," })();"):c));}return out.join('\n').replace(/\n{3,}/g,'\n\n').trim()+'\n';}// A tiny no-op `scratch` runtime so the generated JavaScript runs headless. `say`/`think`
// log to the console (so existing behaviour tests keep working); other ops are no-ops
// and reporters return 0. Swap for a real renderer to actually drive a stage.
scratchShimJs(){return['const scratch = new Proxy({','    say: (m) => console.log(m), think: (m) => console.log(m)','}, { get: (t, k) => (k in t ? t[k] : () => 0) });  // no-op stage shim; reporters -> 0'];}// ---- C code generation (blocks -> C for the STC12 / 8051) --------------------
//
// The fifth target. It is emit-only *for now*: there is no C -> blocks front end yet,
// so C is excluded from the two-way convergence invariant (it must not break the
// others). Both directions ARE the intent, and two thirds of the way back already
// exist in ../stc-compiler: `keil2sdcc.py` (POST /translate, /translate-project)
// reads arbitrary third-party C at 546/597 on an 86-repo corpus, and `stc_disasm.py`
// (POST /disassemble) takes an Intel HEX image back to 8051 assembly, 380/380
// byte-exact over 349 images with reassembly as its oracle. What is missing is the
// C -> pseudocode/blocks lift on top of them, not the ability to read C.
//
// `../stc-compiler/stc_pseudocode.py` is the reference implementation AND the test
// oracle — the same AST shape, one language over. `cStackBlock` ports its `stmts_c`,
// `cTaskBlock` its `stmts_task`, `generateC` its `emit_c`. Three decisions come from
// there unchanged (they are settled; do not redesign them here):
//
//  1. **Scheduling.** Several `when green flag clicked` scripts compile to cooperative
//     tasks: a Timer-0 ISR advances a millisecond counter and does nothing else, and
//     each script becomes a Duff's-device state machine that yields at every wait AND
//     at every loop back-edge — Scratch's own contract, and what stops a busy FOREVER
//     starving the others. Deadlines are wraparound-safe 16-bit compares behind an
//     interrupt-safe read, because a 16-bit load is not atomic on an 8051. A single
//     script keeps straight-line emission in main().
//  2. **Timing.** Everything hangs off Timer 0 at FOSC/12 — the one mode a 12T STC89
//     and a 1T STC12/STC15 count identically, so one program is timing-correct on any
//     supported part. NEVER emit a cycle-counted delay loop: on a 1T part it runs
//     6-12x too fast, the classic drop-in-socket bug (`../stc/README.md` §8.1).
//  3. **Active-low pins.** A quasi-bidirectional 8051 pin sinks 20 mA but sources only
//     ~230 µA, so LEDs are wired active-low and `turn on` must write a 0.
//
// Numbers are 16-bit ints (Scratch's integers without the float tail). Blocks with no
// meaning on bare metal — motion, looks, sound, lists — become /* comments */ and a
// warning, exactly as the Python back end turns them into `#` lines.
// A unique, valid C identifier for a Scratch name. Memoized like pyName, but with its
// own map so C keywords and the Python/JS names never interfere.
cName(name){if(!this._cNames)this._cNames=new Map();if(this._cNames.has(name))return this._cNames.get(name);let id=(0,_sb3_creator_scratchruntime_js__WEBPACK_IMPORTED_MODULE_2__.sanitizeIdent)(name);if(SB3Creator.C_RESERVED.has(id))id+='_';const used=new Set(this._cNames.values());let final=id,n=2;while(used.has(final))final=id+'_'+n++;this._cNames.set(name,final);return final;}// Prefix-aware variable reference (sprite locals are `s<idx>_`-prefixed, as in Python/JS).
cRef(name){if(this._curLocals&&this._curLocals.has(name))return this.cName(this._curPrefix+name);return this.cName(name);}// Make arbitrary text safe to drop inside a /* ... */ comment.
cComment(text){return String(text).replace(/\*\//g,'* /').replace(/\/\*/g,'/ *');}// A marker-header token that must survive the trip byte for byte — a block id.
// cComment is the wrong tool for those: Scratch's id alphabet contains both `*`
// and `/` (see generateId, and generateAssetId which already exists to dodge the
// same alphabet for filenames), so roughly one id in 400 contains `*/` and would
// close the comment the header lives in. cComment would then rewrite it to `* /`
// and silently hand back a DIFFERENT id, which is worse than a broken comment.
// encodeURIComponent leaves `*` alone but escapes `/`, so escape `*` too; what is
// left has no `/`, no `*` and no whitespace, and decodeURIComponent is exact.
cMark(text){return encodeURIComponent(String(text)).replace(/\*/g,'%2A');}cWarn(message){if(!this._cWarnings)this._cWarnings=[];if(!this._cWarnings.includes(message))this._cWarnings.push(message);}cPin(name){if(!this._cPins||name===undefined||name===null)return null;return this._cPins.get(String(name).toLowerCase())||null;}// Scratch values are strings/numbers; C variables here are ints, so a literal is
// truncated (as the oracle's `int(node.value)` does) and a non-number becomes 0.
/** LCD/text-capable device args: literal strings become C string
     *  literals in code space; everything else stays a numeric expression.
     *  Before this, cVal routed "HELLO" through cNum and emitted
     *  `0 /* HELLO *​/` — the firmware printed a null pointer and every
     *  LCD in the product stayed blank while the whole I2C chain worked
     *  (found by the app-path repro, 2026-08-16). */cCString(value){const esc=String(value).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n').replace(/\r/g,'').replace(/[^\x20-\x7e\\n]/g,'?');return"\"".concat(esc,"\"");}cTextArg(input,blocks){// Scratch input shapes: [1,[10,"str"]] literal; [3,"blockId",shadow]
// or [2,"blockId"] reporter; [1,[4..8, n]] numeric literal.
const prim=input&&input[1];if(Array.isArray(prim)&&prim[0]===10){const raw=prim[1];const n=Number(raw);if(String(raw).trim()!==''&&Number.isFinite(n)){return{isString:false,code:this.cNum(raw)};}return{isString:true,code:this.cCString(raw)};}return{isString:false,code:this.cVal(input,blocks)};}cNum(value){const n=Number(value);if(!Number.isFinite(n))return"0 /* ".concat(this.cComment(value)," */");return String(Math.trunc(n));}cInit(value){const n=Number(value);return Number.isFinite(n)?String(Math.trunc(n)):'0';}cVal(input,blocks){if(!Array.isArray(input))return'0';const inner=input[1];if(Array.isArray(inner)){const[type,a]=inner;if(type===12)return this.cRef(a);if(type===13){this.cWarn('lists have no C equivalent — emitted as 0');return'0';}return this.cNum(a);}return this.cRep(blocks[inner],blocks);}// ---- AVR (Arduino Nano/Uno) pin plumbing --------------------------------
//
// Arduino pins are NAMES (D13, A0); the hardware is (DDRx, PORTx, PINx,
// bit). One table, mirroring bw-board's avr8js adapter exactly — the
// emitted C and the emulator must agree on what D13 is or nothing that
// follows means anything. A6/A7 are ADC-only pads on the Nano: channel
// numbers 6/7, no digital register at all.
/** The GPIO index for a Pico pin record (GP<n> -> n), or null. */armHw(pin){const m=String(pin.where||'').toUpperCase().match(/^GP(\d+)$/);return m&&Number(m[1])<=28?{gpio:Number(m[1])}:null;}/** The Arduino Mega 2560's pin map (official Arduino pin mapping):
     *  54 digital + 16 analog pins across ports A–L. D30–D37 and D42–D49
     *  run DESCENDING through their ports — the board's own quirk. *//** {reg, bit} for an AVR pin record, or null (A6/A7 and unknowns).
     *  Device-aware: the Mega speaks ports A–L, the 328/168 B–D,
     *  the ATtiny88 speaks PB0-PB7/PC0-PC7/PD0-PD7/PA0-PA3. */avrHw(pin){// ATtiny88 pins are port/bit names directly (PB0, PC3, PD7, PA2)
const where=String(pin.where||'').toUpperCase();const portBit=where.match(/^P([A-D])(\d)$/);if(portBit)return{reg:portBit[1],bit:Number(portBit[2])};const table=this._cMega?SB3Creator.AVR_PINS_MEGA:SB3Creator.AVR_PINS;const hw=table[where];return hw?{reg:hw[0],bit:hw[1]}:null;}/** VIA port letter + bit for a 6502-machine pin name (PA0-PB6).
     *  PB7 never resolves: it is Timer 1's square-wave pin. */viaHw(pin){const m=String(pin.where||'').toUpperCase().match(/^P([AB])([0-7])$/);if(!m||m[1]==='B'&&m[2]==='7')return null;return{port:m[1],bit:Number(m[2])};}/** Z80 bench pin → bit number (0-7). Output pins are OUT0-OUT7, input pins are IN0-IN7. */z80Hw(pin){const w=String(pin.where||pin.name||'').toUpperCase();const m=w.match(/^(?:OUT|IN)([0-7])$/);return m?Number(m[1]):0;}// The SFR bit name for a driveable pin (`P1_0`), or null with a warning.
// On the AVR core there is no bit-addressable lvalue; callers that need
// to WRITE go through cSetPin/cTogglePin instead, and this returns the
// pin RECORD marker so those call sites can branch.
cSfr(name){const pin=this.cPin(name);if(!pin){this.cWarn("undeclared pin \"".concat(name,"\" \u2014 declare it with e.g. PIN ").concat(name," = P1.0 OUTPUT"));return null;}if(pin.direction!=='output'){this.cWarn("\"".concat(pin.name,"\" is an ").concat(pin.direction.toUpperCase()," pin and cannot be driven"));return null;}if(this._core==='avr'){const hw=this.avrHw(pin);if(!hw){this.cWarn("\"".concat(pin.name,"\" (").concat(pin.where,") has no digital pad on this board"));return null;}// Not an lvalue — a token the write/toggle sites expand. Kept
// distinct on purpose so any NEW site that string-interpolates it
// produces C that does not compile, instead of C that lies.
return"BW_AVR:".concat(pin.name);}if(this._core==='arm'){const hw=this.armHw(pin);if(!hw){this.cWarn("\"".concat(pin.name,"\" (").concat(pin.where,") is not a Pico GPIO"));return null;}return"BW_ARM:".concat(pin.name);// same non-lvalue discipline as the AVR
}if(this._core==='6502'){const hw=this.viaHw(pin);if(!hw){this.cWarn("\"".concat(pin.name,"\" (").concat(pin.where,") is not a VIA port pin (PA0-PA7, PB0-PB6)"));return null;}return"BW_VIA:".concat(pin.name);// same non-lvalue discipline as the AVR
}if(this._core==='z80'){return"BW_Z80:".concat(pin.name);// same non-lvalue discipline
}return"P".concat(pin.port,"_").concat(pin.bit);}// Reading a pin: the ADC for an ANALOG pin, otherwise the level — inverted when the
// pin is wired ACTIVE LOW, so the pseudocode never has to know about the polarity.
cPinRead(name){const pin=this.cPin(name);if(!pin){this.cWarn("read of undeclared pin \"".concat(name,"\" \u2014 emitted as 0"));return"0 /* read ".concat(this.cComment(name)," */");}// Matrix keypad virtual pin (MK0-MK19): emits a scan-based read.
const mkMatch=String(pin.where||'').match(/^MK(\d+)$/i);if(mkMatch){this._cUses.matrixKeypad=true;return"bw_key_read(".concat(mkMatch[1],")");}if(pin.direction==='analog'){if(this._core==='6502'){this.cWarn("\"".concat(pin.name,"\" cannot be analog: the 6502 machine has no ADC"));return"0 /* no ADC: ".concat(this.cComment(name)," */");}this._cUses.adc=true;if(this._core==='avr'){// Channel = the number in the name: A0..A7 -> ADC0..ADC7.
const ch=Number(String(pin.where||'').replace(/^A/i,''));return"adc_read(".concat(ch,")");}if(this._core==='arm'){// GP26..GP28 carry ADC channels 0..2 on the Pico.
const hw=this.armHw(pin);return"adc_read(".concat(hw.gpio-26,")");}return"adc_read(".concat(pin.bit,")");// ADC channel n is physically P1.n
}if(this._core==='avr'){const hw=this.avrHw(pin);if(!hw){this.cWarn("\"".concat(pin.name,"\" (").concat(pin.where,") cannot be read digitally"));return"0 /* read ".concat(this.cComment(name)," */");}const raw="((PIN".concat(hw.reg," >> ").concat(hw.bit,") & 1)");return pin.activeLow?"!".concat(raw):raw;}if(this._core==='arm'){const hw=this.armHw(pin);if(!hw){this.cWarn("\"".concat(pin.name,"\" (").concat(pin.where,") cannot be read digitally"));return"0 /* read ".concat(this.cComment(name)," */");}const raw="((BW_SIO_GPIO_IN >> ".concat(hw.gpio,") & 1u)");return pin.activeLow?"!".concat(raw):raw;}if(this._core==='6502'){const hw=this.viaHw(pin);if(!hw){this.cWarn("\"".concat(pin.name,"\" (").concat(pin.where,") cannot be read digitally"));return"0 /* read ".concat(this.cComment(name)," */");}// Port A reads through $600F (no handshake) so a read never
// clears the CA1/CA2 flags as a side effect; port B has no
// no-handshake register, so IRB it is.
const raw="((BW_VIA_IR".concat(hw.port," >> ").concat(hw.bit,") & 1)");return pin.activeLow?"!".concat(raw):raw;}if(this._core==='z80'){const bit=this.z80Hw(pin);const raw="((BW_PORT_IN >> ".concat(bit,") & 1)");return pin.activeLow?"!".concat(raw):raw;}const sfr="P".concat(pin.port,"_").concat(pin.bit);return pin.activeLow?"!".concat(sfr):sfr;}// `turn on` writes a 0 on an ACTIVE LOW pin. That inversion is the whole point.
cSetPin(name,state){const sfr=this.cSfr(name);if(!sfr)return"/* set ".concat(this.cComment(name)," ").concat(this.cComment(state)," */");const pin=this.cPin(name);const high=state==='high'?true:state==='low'?false:state==='on'!==!!pin.activeLow;if(this._core==='avr'){const hw=this.avrHw(pin);return high?"PORT".concat(hw.reg," |= (1 << ").concat(hw.bit,");"):"PORT".concat(hw.reg," &= (uint8_t)~(1 << ").concat(hw.bit,");");}if(this._core==='arm'){const hw=this.armHw(pin);// SIO's set/clr registers are single-writer atomic — the RP2040's
// own idiom, no read-modify-write anywhere.
return high?"BW_SIO_GPIO_OUT_SET = (1UL << ".concat(hw.gpio,");"):"BW_SIO_GPIO_OUT_CLR = (1UL << ".concat(hw.gpio,");");}if(this._core==='6502'){// Read-modify-write on ORA/ORB is safe here: one CPU, no ISR in
// this build, and the scheduler is cooperative.
const hw=this.viaHw(pin);return high?"BW_VIA_OR".concat(hw.port," |= (uint8_t)(1 << ").concat(hw.bit,");"):"BW_VIA_OR".concat(hw.port," &= (uint8_t)~(1 << ").concat(hw.bit,");");}if(this._core==='z80'){// Shadow byte + OUT to the latch port.
const bit=this.z80Hw(pin);return high?"_z80_sh |= (uint8_t)(1 << ".concat(bit,"); BW_PORT_OUT = _z80_sh;"):"_z80_sh &= (uint8_t)~(1 << ".concat(bit,"); BW_PORT_OUT = _z80_sh;");}return"".concat(sfr," = ").concat(high?1:0,";");}cRep(b,blocks){if(!b)return'0';const v=k=>this.cVal(b.inputs[k],blocks);const f=k=>b.fields[k]?b.fields[k][0]:'';switch(b.opcode){case'operator_add':case'planetemaths_add':return"(".concat(v('NUM1')," + ").concat(v('NUM2'),")");case'operator_subtract':case'planetemaths_substract':return"(".concat(v('NUM1')," - ").concat(v('NUM2'),")");case'operator_multiply':case'planetemaths_multiply':return"(".concat(v('NUM1')," * ").concat(v('NUM2'),")");case'operator_divide':case'planetemaths_divide':return"(".concat(v('NUM1')," / ").concat(v('NUM2'),")");case'operator_mod':return"(".concat(v('NUM1')," % ").concat(v('NUM2'),")");// Native on the chip, and the reason these exist: masking a port, setting one
// bit, shifting an ADC reading.
case'bitops_and':return"(".concat(v('NUM1')," & ").concat(v('NUM2'),")");case'bitops_or':return"(".concat(v('NUM1')," | ").concat(v('NUM2'),")");case'bitops_xor':return"(".concat(v('NUM1')," ^ ").concat(v('NUM2'),")");case'bitops_shl':return"(".concat(v('NUM1')," << ").concat(v('NUM2'),")");case'bitops_shr':return"(".concat(v('NUM1')," >> ").concat(v('NUM2'),")");case'bitops_not':return"(~".concat(v('NUM'),")");case'operator_round':return v('NUM');// integer arithmetic already
case'planetemaths_oppose':return"(0 - ".concat(v('NUM1'),")");case'planetemaths_pourcent':return"(".concat(v('NUM1')," / 100)");case'stc12_read':return this.cPinRead(f('PIN'));case'stc12_readport':{const portCfg=this.project&&this.project.stc&&(this.project.stc.ports||[]).find(p=>p.name.toLowerCase()===f('PORT').toLowerCase());return portCfg?"P".concat(portCfg.port):"0 /* read ".concat(this.cComment(f('PORT'))," */");}case'stc12_tableindex':{const tbl=this.stcTable(f('TABLE'));const tName=tbl?"bw_tab_".concat(tbl.name):"bw_tab_".concat(f('TABLE').toLowerCase());const len=tbl?tbl.values.length:0;this._cUses.table=true;return len?"".concat(tName,"[bw_clamp(").concat(v('INDEX'),", ").concat(len-1,")]"):"".concat(tName,"[").concat(v('INDEX'),"]");}case'ledcube_readvoxel':{this._cUses.cube=true;return"bw_cube_get(".concat(v('X'),", ").concat(v('Y'),", ").concat(v('Z'),")");}case'argument_reporter_string_number':case'argument_reporter_boolean':return this.cName(f('VALUE'));// Device reporters: sensor reads, actuator readback, generic state.
case'devices_servoangle':{if(this._core==='6502')return'0 /* no servo on this machine */';this._cUses.devices=true;this._cUses.servo=true;return"bw_servo_get(".concat(v('SERVO'),")");}case'devices_motorspeed':{if(this._core==='6502')return'0 /* no motor on this machine */';this._cUses.devices=true;this._cUses.motor=true;return"bw_motor_get_speed(".concat(v('MOTOR'),")");}case'devices_motordirection':{if(this._core==='6502')return'0 /* no motor on this machine */';this._cUses.devices=true;this._cUses.motor=true;return"bw_motor_get_dir(".concat(v('MOTOR'),")");}case'devices_temperature':{this._cUses.devices=true;this._cUses.sensor=true;this._cUses.adc=true;return"bw_temperature(".concat(v('SENSOR'),")");}case'devices_light':{this._cUses.devices=true;this._cUses.sensor=true;this._cUses.adc=true;return"bw_light(".concat(v('SENSOR'),")");}case'devices_distance':{this._cUses.devices=true;this._cUses.ultrasonic=true;return"bw_distance(".concat(v('SENSOR'),")");}case'devices_flex':{this._cUses.devices=true;this._cUses.sensor=true;this._cUses.adc=true;return"bw_flex(".concat(v('SENSOR'),")");}case'devices_force':{this._cUses.devices=true;this._cUses.sensor=true;this._cUses.adc=true;return"bw_force(".concat(v('SENSOR'),")");}case'devices_ircode':{this._cUses.devices=true;return"bw_ir_code(".concat(v('SENSOR'),")");}case'devices_devicestate':{this._cUses.devices=true;return"bw_device_state(".concat(v('DEVICE'),")");}// Device predicates (booleans): these also land here via cCond → cRep fallback.
case'devices_pressed':{this._cUses.devices=true;this._cUses.button=true;return"bw_pressed(".concat(v('BUTTON'),")");}case'devices_above':{this._cUses.devices=true;this._cUses.sensor=true;this._cUses.adc=true;return"bw_above(".concat(v('SENSOR'),", ").concat(v('THRESHOLD'),")");}case'devices_closer':{this._cUses.devices=true;this._cUses.ultrasonic=true;return"bw_closer(".concat(v('SENSOR'),", ").concat(v('DISTANCE'),")");}case'devices_motion':{this._cUses.devices=true;this._cUses.button=true;return"bw_motion(".concat(v('SENSOR'),")");}case'devices_tilted':{this._cUses.devices=true;this._cUses.button=true;return"bw_tilted(".concat(v('SENSOR'),")");}case'devices_energised':{this._cUses.devices=true;this._cUses.relay=true;return"bw_energised(".concat(v('DEVICE'),")");}default:{const text=this.drep(b,blocks)||b.opcode;this.cWarn("no C equivalent for \"".concat(text,"\" \u2014 emitted as 0"));return"0 /* ".concat(this.cComment(text)," */");}}}cCond(ref,blocks){const b=typeof ref==='string'?blocks[ref]:null;if(!b)return'0';const v=k=>this.cVal(b.inputs[k],blocks);const f=k=>b.fields[k]?b.fields[k][0]:'';const c=k=>this.cCond(b.inputs[k]?b.inputs[k][1]:null,blocks);switch(b.opcode){case'operator_gt':return"(".concat(v('OPERAND1')," > ").concat(v('OPERAND2'),")");case'operator_lt':return"(".concat(v('OPERAND1')," < ").concat(v('OPERAND2'),")");case'operator_equals':{// `IF <boolean-ish> THEN:` parses to `x = true`; on a chip that is just `x`.
const lit=k=>{const inner=Array.isArray(b.inputs[k])?b.inputs[k][1]:null;return Array.isArray(inner)&&(inner[0]===10||inner[0]===4)?String(inner[1]):null;};const l=lit('OPERAND1'),r=lit('OPERAND2');if(/^true$/i.test(r||''))return"(".concat(v('OPERAND1'),")");if(/^false$/i.test(r||''))return"(!(".concat(v('OPERAND1'),"))");if(/^true$/i.test(l||''))return"(".concat(v('OPERAND2'),")");if(/^false$/i.test(l||''))return"(!(".concat(v('OPERAND2'),"))");return"(".concat(v('OPERAND1')," == ").concat(v('OPERAND2'),")");}case'planetemaths_equals':return"(".concat(v('NUM1')," == ").concat(v('NUM2'),")");// The planetemaths boolean opcode NAMES are misnomers; map by the implementation.
case'planetemaths_gt':return"(".concat(v('NUM1')," < ").concat(v('NUM2'),")");case'planetemaths_gte':return"(".concat(v('NUM1')," <= ").concat(v('NUM2'),")");case'planetemaths_lt':return"(".concat(v('NUM1')," > ").concat(v('NUM2'),")");case'planetemaths_lte':return"(".concat(v('NUM1')," >= ").concat(v('NUM2'),")");case'operator_and':case'planetemaths_and':return"(".concat(c('OPERAND1')," && ").concat(c('OPERAND2'),")");case'operator_or':case'planetemaths_or':return"(".concat(c('OPERAND1')," || ").concat(c('OPERAND2'),")");case'operator_not':return"(!".concat(c('OPERAND'),")");case'planetemaths_not':return"(!".concat(c('OPERAND1'),")");case'planetemaths_multiple':return"((".concat(v('NUM1')," % ").concat(v('NUM2'),") == 0)");case'stc12_read':return this.cPinRead(f('PIN'));case'stc12_readport':{const portCfg=this.project&&this.project.stc&&(this.project.stc.ports||[]).find(p=>p.name.toLowerCase()===f('PORT').toLowerCase());return portCfg?"P".concat(portCfg.port):"0 /* read ".concat(this.cComment(f('PORT'))," */");}case'argument_reporter_boolean':return this.cName(f('VALUE'));default:return"(".concat(this.cRep(b,blocks),")");}}// A `wait` duration (seconds, as Scratch spells it) in milliseconds, folded to a
// constant where it can be — everything downstream counts whole milliseconds.
cMs(input,blocks){const inner=Array.isArray(input)?input[1]:null;if(Array.isArray(inner)){const n=Number(inner[1]);if(inner[0]!==12&&inner[0]!==13&&Number.isFinite(n))return String(Math.round(n*1000));}return"(unsigned int)((".concat(this.cVal(input,blocks),") * 1000)");}// Block comments as real C comments (the Python/JS emitters use `#` / `//`).
cCommentLines(blockId,pad){if(this._emitComments===false)return[];const text=this._codeComments&&this._codeComments[blockId];if(!text)return[];return String(text).split('\n').map(l=>"".concat(pad,"/* ").concat(this.cComment(l)," */"));}cProcCall(b,blocks){const m=b.mutation;const argIds=JSON.parse(m.argumentids||'[]');let ai=0;const args=[];m.proccode.replace(/%[sb]/g,tok=>{const input=b.inputs[argIds[ai++]];args.push(tok==='%b'?this.cCond(input?input[1]:null,blocks):this.cVal(input,blocks));return'';});return"".concat(this.cName(this._curPrefix+this.pyProcRaw(m.proccode)),"(").concat(args.join(', '),");");}cStackFrom(firstId,blocks,level){const lines=[];let id=firstId;const pad='    '.repeat(level);while(id&&blocks[id]){lines.push(...this.cCommentLines(id,pad));lines.push(...this.cStackBlock(blocks[id],blocks,level));id=blocks[id].next;}return lines;}// Straight-line statements — the single-script case, and every custom block's body.
// (Custom blocks run to completion, so a `wait` inside one really does block.)
cStackBlock(b,blocks,level){var _this6=this;const pad='    '.repeat(level);const v=k=>this.cVal(b.inputs[k],blocks);const f=k=>b.fields[k]?b.fields[k][0]:'';const sub=function sub(k){let lvl=arguments.length>1&&arguments[1]!==undefined?arguments[1]:level+1;return b.inputs[k]?_this6.cStackFrom(b.inputs[k][1],blocks,lvl):[];};const cond=()=>this.cCond(b.inputs.CONDITION?b.inputs.CONDITION[1]:null,blocks);const line=t=>[pad+t];switch(b.opcode){case'control_forever':return[pad+'for (;;) {',...sub('SUBSTACK'),pad+'}'];case'control_repeat':{// The counter is scoped to its own block so nested REPEATs never collide,
// and declared up front because C89 wants declarations before statements.
const i="_i".concat(++this._cCounter);return[pad+"{ unsigned int ".concat(i,";"),pad+"    for (".concat(i," = 0; ").concat(i," < (").concat(v('TIMES'),"); ").concat(i,"++) {"),...sub('SUBSTACK',level+2),pad+'    }',pad+'}'];}case'control_repeat_until':return[pad+"while (!(".concat(cond(),")) {"),...sub('SUBSTACK'),pad+'}'];case'control_if':return[pad+"if (".concat(cond(),") {"),...sub('SUBSTACK'),pad+'}'];case'control_if_else':return[pad+"if (".concat(cond(),") {"),...sub('SUBSTACK'),pad+'} else {',...sub('SUBSTACK2'),pad+'}'];case'control_wait':{if(this._cTasks){this._cUses.blockDelay=true;return line("bw_block_ms(".concat(this.cMs(b.inputs.DURATION,blocks),");"));}this._cUses.delay=true;return line("delay_ms(".concat(this.cMs(b.inputs.DURATION,blocks),");"));}case'control_wait_until':return line("while (!(".concat(cond(),")) ;"));case'control_stop':{const option=f('STOP_OPTION');if(option==='this script')return line('return;');// Straight-line emission means there is exactly one script, so "stop other
// scripts" has nothing to stop; only "stop all" halts the chip.
if(option==='other scripts in sprite')return line('/* stop other scripts in sprite — there are none */');return line('for (;;) ;   /* stop all */');}case'data_setvariableto':return line("".concat(this.cRef(f('VARIABLE'))," = ").concat(v('VALUE'),";"));case'data_changevariableby':return line("".concat(this.cRef(f('VARIABLE'))," += ").concat(v('VALUE'),";"));case'stc12_setpin':return line(this.cSetPin(f('PIN'),f('STATE')));case'stc12_writepin':{const sfr=this.cSfr(f('PIN'));if(!sfr)return line("/* set ".concat(this.cComment(f('PIN'))," */"));// A computed value is a LEVEL, so ACTIVE LOW does not invert it — the same
// rule `set high` / `set low` already follow.
if(this._core==='avr'){const hw=this.avrHw(this.cPin(f('PIN')));return line("if (".concat(v('VALUE'),") PORT").concat(hw.reg," |= (1 << ").concat(hw.bit,"); ")+"else PORT".concat(hw.reg," &= (uint8_t)~(1 << ").concat(hw.bit,");"));}if(this._core==='arm'){const hw=this.armHw(this.cPin(f('PIN')));return line("if (".concat(v('VALUE'),") BW_SIO_GPIO_OUT_SET = (1UL << ").concat(hw.gpio,"); ")+"else BW_SIO_GPIO_OUT_CLR = (1UL << ".concat(hw.gpio,");"));}if(this._core==='6502'){const hw=this.viaHw(this.cPin(f('PIN')));return line("if (".concat(v('VALUE'),") BW_VIA_OR").concat(hw.port," |= (uint8_t)(1 << ").concat(hw.bit,"); ")+"else BW_VIA_OR".concat(hw.port," &= (uint8_t)~(1 << ").concat(hw.bit,");"));}if(this._core==='z80'){const bit=this.z80Hw(this.cPin(f('PIN')));return line("if (".concat(v('VALUE'),") _z80_sh |= (uint8_t)(1 << ").concat(bit,"); ")+"else _z80_sh &= (uint8_t)~(1 << ".concat(bit,"); BW_PORT_OUT = _z80_sh;"));}return line("".concat(sfr," = (").concat(v('VALUE'),") ? 1 : 0;"));}case'stc12_toggle':{const sfr=this.cSfr(f('PIN'));if(!sfr)return line("/* toggle ".concat(this.cComment(f('PIN'))," */"));if(this._core==='avr'){const hw=this.avrHw(this.cPin(f('PIN')));// Writing 1 to PINx toggles PORTx in hardware — one cycle,
// no read-modify-write race. The datasheet's own idiom.
return line("PIN".concat(hw.reg," = (1 << ").concat(hw.bit,");"));}if(this._core==='arm'){const hw=this.armHw(this.cPin(f('PIN')));// GPIO_OUT_XOR: the RP2040's hardware toggle, same idiom.
return line("BW_SIO_GPIO_OUT_XOR = (1UL << ".concat(hw.gpio,");"));}if(this._core==='6502'){const hw=this.viaHw(this.cPin(f('PIN')));return line("BW_VIA_OR".concat(hw.port," ^= (uint8_t)(1 << ").concat(hw.bit,");"));}if(this._core==='z80'){const bit=this.z80Hw(this.cPin(f('PIN')));return line("_z80_sh ^= (uint8_t)(1 << ".concat(bit,"); BW_PORT_OUT = _z80_sh;"));}return line("".concat(sfr," = !").concat(sfr,";"));}case'stc12_setpwm':{if(this._core==='6502'||this._core==='z80'){this.cWarn("no PWM on the ".concat(this._core," machine"));return line("/* no PWM on ".concat(this.cComment(f('PIN'))," */"));}this._cUses.pwm=true;const pin=this._cPins&&this._cPins.get(f('PIN').toLowerCase());if(this._core==='avr'){// Hardware PWM lives on the OC pins of Timers 1 and 2 —
// Timer 0 is the millisecond tick and its pins are refused.
// The Mega's OC1/OC2 pins are D9-D12; the 328's are
// D3/D9/D10/D11 (the same silicon units, routed differently).
const d=pin?Number(String(pin.where||'').replace(/^D/i,'')):NaN;const usable=this._cMega?[9,10,11,12]:[3,9,10,11];if(!usable.includes(d)){this.cWarn("\"".concat(pin?pin.where:f('PIN'),"\" has no usable PWM here: ")+"Timers 1 and 2 drive ".concat(this._cMega?'D9-D12 on the Mega':'D3/D9/D10/D11'," ")+'(Timer 0 is the millisecond tick and its pins are refused)');return line("/* no PWM on ".concat(this.cComment(pin?pin.where:f('PIN'))," */"));}return line("pwm_set(".concat(d,", ").concat(v('VALUE'),");"));}if(this._core==='arm'){const hw=pin?this.armHw(pin):null;if(!hw)return line("/* no PWM on ".concat(this.cComment(f('PIN'))," */"));return line("pwm_set(".concat(hw.gpio,", ").concat(v('VALUE'),");"));}const module=pin?"".concat(pin.port*8+pin.bit):'0';return line("pwm_set(".concat(module,", ").concat(v('VALUE'),");"));}case'stc12_settone':{if(this._core==='6502'||this._core==='z80'){this.cWarn("no tone on the ".concat(this._core," machine"));return line('/* no tone on this machine */');}this._cUses.tone=true;return line("tone_set(".concat(v('VALUE'),");"));}case'stc12_setport':{const port=f('PORT');const portCfg=this.project&&this.project.stc&&(this.project.stc.ports||[]).find(p=>p.name.toLowerCase()===port.toLowerCase());const sfr=portCfg?"P".concat(portCfg.port):"/* ".concat(this.cComment(port)," */");return line("".concat(sfr," = (unsigned char)(").concat(v('VALUE'),");"));}case'stc12_setpart':{this._cUses.shiftOut=true;const part=f('PART');const partCfg=this.project&&this.project.stc&&(this.project.stc.parts||[]).find(p=>p.name.toLowerCase()===part.toLowerCase());if(!partCfg)return line("/* set ".concat(this.cComment(part)," \u2014 undeclared PART */"));const{data,clock,latch}=partCfg;const al=partCfg.activeLow?'1':'0';const val="(unsigned char)(".concat(v('VALUE'),")");if(this._core==='avr'){const dh=this.avrHw(data),ch=this.avrHw(clock),lh=this.avrHw(latch);if(!dh||!ch||!lh)return line("/* set ".concat(this.cComment(part)," \u2014 bad PART pin */"));return line("shift_out(&PORT".concat(dh.reg,", ").concat(dh.bit,", &PORT").concat(ch.reg,", ").concat(ch.bit,", &PORT").concat(lh.reg,", ").concat(lh.bit,", ").concat(al,", ").concat(val,");"));}if(this._core==='arm'){const dg=this.armHw(data),cg=this.armHw(clock),lg=this.armHw(latch);if(!dg||!cg||!lg)return line("/* set ".concat(this.cComment(part)," \u2014 bad PART pin */"));return line("shift_out(".concat(dg.gpio,", ").concat(cg.gpio,", ").concat(lg.gpio,", ").concat(al,", ").concat(val,");"));}if(this._core==='6502'){const dh=this.viaHw(data),ch=this.viaHw(clock),lh=this.viaHw(latch);if(!dh||!ch||!lh)return line("/* set ".concat(this.cComment(part)," \u2014 bad PART pin */"));return line("shift_out(&BW_VIA_OR".concat(dh.port,", ").concat(dh.bit,", &BW_VIA_OR").concat(ch.port,", ").concat(ch.bit,", &BW_VIA_OR").concat(lh.port,", ").concat(lh.bit,", ").concat(al,", ").concat(val,");"));}// 8051: SFR bit lvalues
return line("shift_out(P".concat(data.port,"_").concat(data.bit,", P").concat(clock.port,"_").concat(clock.bit,", P").concat(latch.port,"_").concat(latch.bit,", ").concat(al,", ").concat(val,");"));}case'stc12_print':{this._cUses.print=true;const mode=f('MODE');if(mode==='text'){const text=this.dval(b.inputs.VALUE,blocks).replace(/^"|"$/g,'');return line("bw_print(\"".concat(this.cComment(text),"\");"));}return line("bw_print_num(".concat(v('VALUE'),");"));}// LED cube commands — manipulate the working frame, then hold to play.
case'ledcube_setvoxel':{this._cUses.cube=true;return line("bw_cube_set(".concat(v('X'),", ").concat(v('Y'),", ").concat(v('Z'),", ").concat(v('COLOUR'),");"));}case'ledcube_clearvoxel':{this._cUses.cube=true;return line("bw_cube_set(".concat(v('X'),", ").concat(v('Y'),", ").concat(v('Z'),", 0);"));}case'ledcube_filllayer':{this._cUses.cube=true;return line("bw_cube_fill_layer(".concat(v('LAYER'),", ").concat(v('COLOUR'),");"));}case'ledcube_clear':{this._cUses.cube=true;return line('bw_cube_clear();');}case'ledcube_shift':{this._cUses.cube=true;const dir=f('DIR');const dirIdx=(0,_cubeDirections_js__WEBPACK_IMPORTED_MODULE_4__.cubeDirectionIndex)(dir);// `|| 0` used to live here, which turned any unrecognised
// direction into "up" and emitted it as though it were asked
// for. Refuse instead: a cube shifting the wrong way is not a
// thing anyone can debug from the firmware.
if(dirIdx<0){throw new ParseError("shift cube: \"".concat(dir,"\" is not a direction. ")+"Use one of: ".concat(_cubeDirections_js__WEBPACK_IMPORTED_MODULE_4__.CUBE_DIRECTIONS.join(', '),"."));}return line("bw_cube_shift(".concat(dirIdx,");"));}case'ledcube_hold':{this._cUses.cube=true;return line("bw_cube_hold(".concat(v('DURATION'),");"));}case'ledcube_fillcolumn':{this._cUses.cube=true;return line("bw_cube_fill_column(".concat(v('X'),", ").concat(v('Y'),", ").concat(v('COLOUR'),");"));}case'ledcube_fillwall':{this._cUses.cube=true;return line("bw_cube_fill_wall(".concat(v('Z'),", ").concat(v('COLOUR'),");"));}case'ledcube_invert':{this._cUses.cube=true;return line('bw_cube_invert();');}// ---- devices_* C lowerings ----
// Each emits a call to an inline bw_* stub, emitted by the assembly
// section when _cUses.devices is set. The stubs are no-ops on the
// device target — they record the call so the simulator can read it,
// but on bare metal a servo/LCD/motor needs a real driver library
// that this emitter does not yet generate. The stubs make the code
// COMPILE, which is better than a link error, and the /* TODO */
// comment in each stub says what a real implementation would do.
case'devices_setservo':{if(this._core==='6502'){this.cWarn('no servo on the 6502 machine: it needs a PWM frame, and the VIA has no compare unit');return line('/* no servo on this machine */');}this._cUses.devices=true;this._cUses.servo=true;return line("bw_servo_set(".concat(v('SERVO'),", ").concat(v('ANGLE'),");"));}case'devices_setmotor':{if(this._core==='6502'){this.cWarn('no motor driver on the 6502 machine: speed control needs PWM, and the VIA has no compare unit');return line('/* no motor on this machine */');}this._cUses.devices=true;this._cUses.motor=true;return line("bw_motor_speed(".concat(v('MOTOR'),", ").concat(v('SPEED'),");"));}case'devices_setdirection':{if(this._core==='6502'){this.cWarn('no motor driver on the 6502 machine: speed control needs PWM, and the VIA has no compare unit');return line('/* no motor on this machine */');}this._cUses.devices=true;this._cUses.motor=true;const d=f('DIR');return line("bw_motor_dir(".concat(v('MOTOR'),", ").concat({forward:0,reverse:1,brake:2,coast:3}[d]||0,");"));}case'devices_setrelay':{this._cUses.devices=true;this._cUses.relay=true;return line("bw_relay_set(".concat(v('RELAY'),", ").concat(f('STATE')==='on'?1:0,");"));}case'devices_activate':{this._cUses.devices=true;this._cUses.relay=true;return line("bw_device_activate(".concat(v('DEVICE'),");"));}case'devices_deactivate':{this._cUses.devices=true;this._cUses.relay=true;return line("bw_device_deactivate(".concat(v('DEVICE'),");"));}case'devices_lcdprint':{this._cUses.devices=true;this._cUses.lcd=true;const t=this.cTextArg(b.inputs.TEXT,blocks);return line(t.isString?"bw_lcd_print_s(".concat(v('DISPLAY'),", ").concat(t.code,");"):"bw_lcd_print_n(".concat(v('DISPLAY'),", ").concat(t.code,");"));}case'devices_lcdcursor':{this._cUses.devices=true;this._cUses.lcd=true;return line("bw_lcd_cursor(".concat(v('DISPLAY'),", ").concat(v('ROW'),", ").concat(v('COL'),");"));}case'devices_lcdclear':{this._cUses.devices=true;this._cUses.lcd=true;return line("bw_lcd_clear(".concat(v('DISPLAY'),");"));}case'devices_showdigit':{this._cUses.devices=true;return line("bw_7seg_show(".concat(v('DISPLAY'),", ").concat(v('DIGIT'),");"));}case'devices_setrgb':{this._cUses.devices=true;return line("bw_rgb_set(".concat(v('LED'),", ").concat(v('R'),", ").concat(v('G'),", ").concat(v('B'),");"));}case'devices_setpixel':{this._cUses.devices=true;return line("bw_matrix_set(".concat(v('MATRIX'),", ").concat(v('X'),", ").concat(v('Y'),", ").concat(v('BRIGHTNESS'),");"));}case'devices_clearmatrix':{this._cUses.devices=true;return line("bw_matrix_clear(".concat(v('MATRIX'),");"));}case'devices_setneopixel':{this._cUses.devices=true;this._cUses.neopixel=true;return line("bw_neopixel_set(".concat(v('STRIP'),", ").concat(v('INDEX'),", ").concat(v('R'),", ").concat(v('G'),", ").concat(v('B'),");"));}case'devices_clearneopixels':{this._cUses.devices=true;this._cUses.neopixel=true;return line("bw_neopixel_clear(".concat(v('STRIP'),");"));}case'devices_tftpixel':{this._cUses.devices=true;this._cUses.tft=true;return line("bw_tft_pixel(".concat(v('DISPLAY'),", ").concat(v('X'),", ").concat(v('Y'),", ").concat(v('R'),", ").concat(v('G'),", ").concat(v('B'),");"));}case'devices_tftfill':{this._cUses.devices=true;this._cUses.tft=true;return line("bw_tft_fill(".concat(v('DISPLAY'),", ").concat(v('X'),", ").concat(v('Y'),", ").concat(v('W'),", ").concat(v('H'),", ").concat(v('R'),", ").concat(v('G'),", ").concat(v('B'),");"));}case'devices_tftclear':{this._cUses.devices=true;this._cUses.tft=true;return line("bw_tft_clear(".concat(v('DISPLAY'),");"));}case'devices_tftprint':{this._cUses.devices=true;this._cUses.tft=true;const t=this.cTextArg(b.inputs.TEXT,blocks);return line(t.isString?"bw_tft_print_s(".concat(v('DISPLAY'),", ").concat(t.code,");"):"bw_tft_print_n(".concat(v('DISPLAY'),", ").concat(t.code,");"));}case'devices_tftcursor':{this._cUses.devices=true;this._cUses.tft=true;return line("bw_tft_cursor(".concat(v('DISPLAY'),", ").concat(v('ROW'),", ").concat(v('COL'),");"));}case'devices_oledpixel':{this._cUses.devices=true;this._cUses.oled=true;return line("bw_oled_pixel(".concat(v('DISPLAY'),", ").concat(v('X'),", ").concat(v('Y'),", ").concat(v('VALUE'),");"));}case'devices_oledclear':{this._cUses.devices=true;this._cUses.oled=true;return line("bw_oled_clear(".concat(v('DISPLAY'),");"));}case'devices_oledprint':{this._cUses.devices=true;this._cUses.oled=true;const t=this.cTextArg(b.inputs.TEXT,blocks);return line(t.isString?"bw_oled_print_s(".concat(v('DISPLAY'),", ").concat(t.code,");"):"bw_oled_print_n(".concat(v('DISPLAY'),", ").concat(t.code,");"));}case'devices_oledcursor':{this._cUses.devices=true;this._cUses.oled=true;return line("bw_oled_cursor(".concat(v('DISPLAY'),", ").concat(v('ROW'),", ").concat(v('COL'),");"));}case'procedures_call':return line(this.cProcCall(b,blocks));default:{const text=(this.decompileStackBlock(b,blocks,0)[0]||b.opcode).trim();this.cWarn("no C equivalent for \"".concat(text,"\" \u2014 emitted as a comment"));return line("/* ".concat(this.cComment(text)," */"));}}}// Does this stack contain a `wait`? Only then does its task need a deadline slot.
cHasWait(firstId,blocks){let id=firstId;while(id&&blocks[id]){const b=blocks[id];if(b.opcode==='control_wait')return true;for(const k of['SUBSTACK','SUBSTACK2']){if(b.inputs[k]&&this.cHasWait(b.inputs[k][1],blocks))return true;}id=b.next;}return false;}cTaskFrom(firstId,blocks,level,ctx){const lines=[];let id=firstId;const pad='    '.repeat(level);while(id&&blocks[id]){lines.push(...this.cCommentLines(id,pad));lines.push(...this.cTaskBlock(blocks[id],blocks,level,ctx,id));id=blocks[id].next;}return lines;}// Record a yield point: `<task>_state == state` means "about to run this block".
// The state number is minted here so the map can never disagree with the `case`
// labels — they come from the same counter, in the same order.
cYield(ctx,blockId,kind){const state=++ctx.state;ctx.yields.push({task:ctx.task,state,block:blockId,kind});return state;}// One task's statements as the interior of a Duff's-device state machine. The switch
// sits in the caller; case labels land inside whatever nesting the statements build,
// which C allows as long as no inner switch appears (we emit none). Every wait AND
// every loop back-edge is a numbered yield — the latter is Scratch's own scheduling
// contract, and it is what makes a busy FOREVER unable to starve the other tasks.
cTaskBlock(b,blocks,level,ctx,blockId){const pad='    '.repeat(level);const v=k=>this.cVal(b.inputs[k],blocks);const f=k=>b.fields[k]?b.fields[k][0]:'';const sub=(k,lvl)=>b.inputs[k]?this.cTaskFrom(b.inputs[k][1],blocks,lvl,ctx):[];const cond=()=>this.cCond(b.inputs.CONDITION?b.inputs.CONDITION[1]:null,blocks);const task=ctx.task;switch(b.opcode){case'control_wait':{this._cUses.now=true;const s=this.cYield(ctx,blockId,'wait');return["".concat(pad).concat(task,"_until = bw_now() + (").concat(this.cMs(b.inputs.DURATION,blocks),");"),"".concat(pad).concat(task,"_state = ").concat(s,";"),"".concat(pad,"case ").concat(s,":"),"".concat(pad,"if ((int)(bw_now() - ").concat(task,"_until) < 0) return;")];}case'control_wait_until':{const s=this.cYield(ctx,blockId,'wait-until');return["".concat(pad).concat(task,"_state = ").concat(s,";"),"".concat(pad,"case ").concat(s,":"),"".concat(pad,"if (!(").concat(cond(),")) return;")];}case'control_forever':{const s=this.cYield(ctx,blockId,'forever');return["".concat(pad).concat(task,"_state = ").concat(s,";"),"".concat(pad,"case ").concat(s,":"),...sub('SUBSTACK',level),"".concat(pad).concat(task,"_state = ").concat(s,";"),"".concat(pad,"return;")];}case'control_repeat':{// The counter has to survive the yield, so it is a static, not a local.
const name="bw_i".concat(++this._cCounter);ctx.statics.push(name);const s=this.cYield(ctx,blockId,'repeat');return["".concat(pad).concat(name," = (").concat(v('TIMES'),");"),"".concat(pad).concat(task,"_state = ").concat(s,";"),"".concat(pad,"case ").concat(s,":"),"".concat(pad,"if (").concat(name,") {"),...sub('SUBSTACK',level+1),"".concat(pad,"    ").concat(name,"--;"),"".concat(pad,"    ").concat(task,"_state = ").concat(s,";"),"".concat(pad,"    return;"),"".concat(pad,"}")];}case'control_repeat_until':{const s=this.cYield(ctx,blockId,'repeat-until');return["".concat(pad).concat(task,"_state = ").concat(s,";"),"".concat(pad,"case ").concat(s,":"),"".concat(pad,"if (!(").concat(cond(),")) {"),...sub('SUBSTACK',level+1),"".concat(pad,"    ").concat(task,"_state = ").concat(s,";"),"".concat(pad,"    return;"),"".concat(pad,"}")];}case'control_if':return["".concat(pad,"if (").concat(cond(),") {"),...sub('SUBSTACK',level+1),"".concat(pad,"}")];case'control_if_else':return["".concat(pad,"if (").concat(cond(),") {"),...sub('SUBSTACK',level+1),"".concat(pad,"} else {"),...sub('SUBSTACK2',level+1),"".concat(pad,"}")];case'control_stop':{const option=f('STOP_OPTION');const others=option==='this script'?[task]:option==='other scripts in sprite'?ctx.tasks.filter(t=>t!==task):ctx.tasks;const out=others.map(t=>"".concat(pad).concat(t,"_state = 0xFFFF;"));if(option!=='other scripts in sprite')out.push("".concat(pad,"return;"));return out;}// Everything else is the same statement in either mode (it cannot yield).
default:return this.cStackBlock(b,blocks,level);}}// ================== host C target =========================================
// The second C target. `generateC` emits bare metal for the 8051, where a
// `move 10 steps` block has no meaning and saying so is correct. A project
// that moves a sprite needs the other one: a portable C99 program that runs
// the project the way `generatePython` does, against the shim in
// cHostRuntime.js. Which target a project gets is decided by the project —
// declared pins mean the chip, everything else means the host.
//
// These walkers mirror the PYTHON ones, not the device ones, because
// Python's are already total: every block either has a case here or falls
// through to the same OP_TO_SCRATCH lookup that gives Python its coverage.
hcStr(s){return"bw_str(".concat(JSON.stringify(String(s)),")");}// A variable or list reference: sprite locals carry their sprite prefix, so
// two sprites with a `count` each stay distinct in one flat C file.
hcVar(name){const base=this._curLocals&&this._curLocals.has(name)?this._curPrefix+name:name;return this.cName(base);}// Unique C identifier for a function (two `when flag clicked` hats in one
// sprite would otherwise collide, exactly as pyFreshName guards against).
hcFresh(base){let id=(0,_sb3_creator_scratchruntime_js__WEBPACK_IMPORTED_MODULE_2__.sanitizeIdent)(base)||'f';if(SB3Creator.C_RESERVED.has(id))id+='_';const used=new Set(this._cNames?this._cNames.values():[]);let final=id,n=2;while(used.has(final))final=id+'_'+n++;if(!this._cNames)this._cNames=new Map();this._cNames.set(Symbol(base),final);return final;}hcVal(input,blocks){if(!Array.isArray(input))return'bw_num(0)';const inner=input[1];if(Array.isArray(inner)){const[type,a]=inner;if(type===12||type===13)return this.hcVar(a);return /^-?\d+(\.\d+)?$/.test(String(a))?"bw_num(".concat(Number(a),")"):this.hcStr(a);}return this.hcRep(blocks[inner],blocks);}// `scratch.<method>(...)` from the shared table, spelled for C. Mirrors
// runtimeObjCall rather than calling it, because the separator and the
// arity-disambiguated names (say / say_for) are C's problem alone.
hcScratchCall(b,blocks){const e=_sb3_creator_scratchruntime_js__WEBPACK_IMPORTED_MODULE_2__.OP_TO_SCRATCH[b.opcode];if(!e)return null;const args=e.gen.map(g=>{if(g.v)return this.hcVal(b.inputs[g.v],blocks);if(g.m){const inp=b.inputs[g.m];if(Array.isArray(inp)&&inp[0]===3)return this.hcVal(inp,blocks);return this.hcStr(this.dmenu(inp,blocks,g.field||g.m));}if(g.f)return this.hcStr(b.fields[g.f]?b.fields[g.f][0]:'');if(g.bc)return this.hcStr(this.dbroadcast(b.inputs[g.bc]).replace(/^"|"$/g,''));return'bw_num(0)';});return"".concat((0,_sb3_creator_chostruntime_js__WEBPACK_IMPORTED_MODULE_3__.cShimName)(e.m,args.length),"(").concat(args.join(', '),")");}// The Arrays & Vectors registry, the same shape as hcScratchCall. The 2-D and
// functional blocks have no C implementation, so using one warns rather than
// quietly returning 0 — the C would otherwise disagree with Python in silence.
hcArraysCall(b,blocks){const e=_sb3_creator_scratchruntime_js__WEBPACK_IMPORTED_MODULE_2__.OP_TO_ARRAYS[b.opcode];if(!e)return null;if(SB3Creator.C_ARRAYS_UNIMPLEMENTED.has(e.m)){this.hcWarn(b,blocks);return null;}const args=e.gen.map(g=>{if(g.v)return this.hcVal(b.inputs[g.v],blocks);if(g.m){const inp=b.inputs[g.m];if(Array.isArray(inp)&&inp[0]===3)return this.hcVal(inp,blocks);return this.hcStr(this.dmenu(inp,blocks,g.field||g.m));}if(g.f)return this.hcStr(b.fields[g.f]?b.fields[g.f][0]:'');return'bw_num(0)';});return"arrays_".concat(e.m,"(").concat(args.join(', '),")");}hcRep(b,blocks){if(!b)return'bw_num(0)';const v=k=>this.hcVal(b.inputs[k],blocks);const n=k=>"bw_n(".concat(this.hcVal(b.inputs[k],blocks),")");const f=k=>b.fields[k]?b.fields[k][0]:'';const list=k=>"&".concat(this.hcVar(f(k)));switch(b.opcode){case'operator_add':return"bw_num(".concat(n('NUM1')," + ").concat(n('NUM2'),")");case'operator_subtract':return"bw_num(".concat(n('NUM1')," - ").concat(n('NUM2'),")");case'operator_multiply':return"bw_num(".concat(n('NUM1')," * ").concat(n('NUM2'),")");case'operator_divide':return"bw_num(".concat(n('NUM1')," / ").concat(n('NUM2'),")");case'operator_mod':return"bw_mod(".concat(v('NUM1'),", ").concat(v('NUM2'),")");case'bitops_and':return"bw_num((double)((long)".concat(n('NUM1')," & (long)").concat(n('NUM2'),"))");case'bitops_or':return"bw_num((double)((long)".concat(n('NUM1')," | (long)").concat(n('NUM2'),"))");case'bitops_xor':return"bw_num((double)((long)".concat(n('NUM1')," ^ (long)").concat(n('NUM2'),"))");case'bitops_shl':return"bw_num((double)((long)".concat(n('NUM1')," << (long)").concat(n('NUM2'),"))");case'bitops_shr':return"bw_num((double)((long)".concat(n('NUM1')," >> (long)").concat(n('NUM2'),"))");case'bitops_not':return"bw_num((double)(~(long)".concat(n('NUM'),"))");case'operator_random':return"bw_random(".concat(v('FROM'),", ").concat(v('TO'),")");case'operator_round':return"bw_num(round(".concat(n('NUM'),"))");case'operator_mathop':return"bw_mathop(".concat(JSON.stringify(f('OPERATOR')),", ").concat(v('NUM'),")");case'operator_join':return"bw_join(".concat(v('STRING1'),", ").concat(v('STRING2'),")");case'operator_letter_of':return"bw_letter(".concat(v('STRING'),", ").concat(v('LETTER'),")");case'operator_length':return"bw_length(".concat(v('STRING'),")");case'operator_contains':return"bw_contains(".concat(v('STRING1'),", ").concat(v('STRING2'),")");case'data_itemoflist':return"bw_list_item(".concat(list('LIST'),", (int)").concat(n('INDEX'),")");case'data_itemnumoflist':return"bw_list_index(".concat(list('LIST'),", ").concat(v('ITEM'),")");case'data_lengthoflist':return"bw_list_length(".concat(list('LIST'),")");case'data_listcontainsitem':return"bw_list_contains(".concat(list('LIST'),", ").concat(v('ITEM'),")");case'sensing_answer':this._hcUses.answer=true;return'bw_answer';case'argument_reporter_string_number':case'argument_reporter_boolean':return this.cName(f('VALUE'));case'planetemaths_add':return"bw_num(".concat(n('NUM1')," + ").concat(n('NUM2'),")");case'planetemaths_substract':return"bw_num(".concat(n('NUM1')," - ").concat(n('NUM2'),")");case'planetemaths_multiply':return"bw_num(".concat(n('NUM1')," * ").concat(n('NUM2'),")");case'planetemaths_divide':return"bw_num(".concat(n('NUM1')," / ").concat(n('NUM2'),")");case'planetemaths_pow':return"bw_num(pow(".concat(n('NUM1'),", ").concat(n('NUM2'),"))");case'planetemaths_oppose':return"bw_num(0 - ".concat(n('NUM1'),")");case'planetemaths_inverse':return"bw_num(1 / ".concat(n('NUM1'),")");case'planetemaths_pourcent':return"bw_num(".concat(n('NUM1')," / 100)");case'planetemaths_nombre_pi':return'bw_pi()';case'planetemaths_nombre_e':return'bw_e()';case'planetemaths_factorial':return"bw_num(tgamma(".concat(n('NUM1')," + 1))");case'planetemaths_min':return"bw_num(fmin(".concat(n('NUM1'),", ").concat(n('NUM2'),"))");case'planetemaths_max':return"bw_num(fmax(".concat(n('NUM1'),", ").concat(n('NUM2'),"))");case'planetemaths_random':return"bw_random(".concat(v('NUM1'),", ").concat(v('NUM2'),")");case'planetemaths_join':return"bw_join(".concat(v('STRING1'),", ").concat(v('STRING2'),")");case'planetemaths_letterOf':return"bw_letter(".concat(v('STRING'),", ").concat(v('LETTER'),")");case'planetemaths_length':return"bw_length(".concat(v('STRING'),")");case'planetemaths_sommechiffres':return"bw_sumdigits(".concat(v('NUM1'),")");default:{const ac=this.hcArraysCall(b,blocks);if(ac)return ac;const sc=this.hcScratchCall(b,blocks);if(sc)return sc;this.hcWarn(b,blocks);return'bw_num(0)';}}}hcCond(ref,blocks){const b=blocks[ref];if(!b)return'0';const v=k=>this.hcVal(b.inputs[k],blocks);const c=k=>b.inputs[k]?this.hcCond(b.inputs[k][1],blocks):'0';const truthy=e=>"(bw_n(".concat(e,") != 0)");switch(b.opcode){case'operator_gt':return"(bw_cmp(".concat(v('OPERAND1'),", ").concat(v('OPERAND2'),") > 0)");case'operator_lt':return"(bw_cmp(".concat(v('OPERAND1'),", ").concat(v('OPERAND2'),") < 0)");case'operator_equals':return"(bw_cmp(".concat(v('OPERAND1'),", ").concat(v('OPERAND2'),") == 0)");case'operator_and':return"(".concat(c('OPERAND1')," && ").concat(c('OPERAND2'),")");case'operator_or':return"(".concat(c('OPERAND1')," || ").concat(c('OPERAND2'),")");case'operator_not':return"(!".concat(c('OPERAND'),")");case'operator_contains':return truthy("bw_contains(".concat(v('STRING1'),", ").concat(v('STRING2'),")"));case'data_listcontainsitem':return truthy("bw_list_contains(&".concat(this.hcVar(b.fields.LIST[0]),", ").concat(v('ITEM'),")"));case'argument_reporter_boolean':return truthy(this.cName(b.fields.VALUE[0]));case'planetemaths_gt':return"(bw_cmp(".concat(v('NUM1'),", ").concat(v('NUM2'),") < 0)");case'planetemaths_gte':return"(bw_cmp(".concat(v('NUM1'),", ").concat(v('NUM2'),") <= 0)");case'planetemaths_lt':return"(bw_cmp(".concat(v('NUM1'),", ").concat(v('NUM2'),") > 0)");case'planetemaths_lte':return"(bw_cmp(".concat(v('NUM1'),", ").concat(v('NUM2'),") >= 0)");case'planetemaths_equals':return"(bw_cmp(".concat(v('NUM1'),", ").concat(v('NUM2'),") == 0)");case'planetemaths_and':return"(".concat(c('OPERAND1')," && ").concat(c('OPERAND2'),")");case'planetemaths_or':return"(".concat(c('OPERAND1')," || ").concat(c('OPERAND2'),")");case'planetemaths_not':return"(!".concat(c('OPERAND1'),")");case'planetemaths_contains':return truthy("bw_contains(".concat(v('STRING1'),", ").concat(v('STRING2'),")"));case'planetemaths_multiple':// Its own helper: `x mod y = 0` is a different block that happens
// to mean the same thing, and the way back cannot guess which.
return"bw_multiple(".concat(v('NUM1'),", ").concat(v('NUM2'),")");default:{const ac=this.hcArraysCall(b,blocks);if(ac)return truthy(ac);const sc=this.hcScratchCall(b,blocks);if(sc)return truthy(sc);this.hcWarn(b,blocks);return'0';}}}// A block with no host-C form. Unlike the device target this should stay
// empty for ordinary projects — if it fills up, the table and the walkers
// have drifted apart and that is worth knowing.
hcWarn(b,blocks){const text=(this.decompileStackBlock(b,blocks,0)[0]||b.opcode).trim();const msg="no host-C form for \"".concat(text,"\"");if(!this._hcWarnings.includes(msg))this._hcWarnings.push(msg);}hcStackFrom(firstId,blocks,level){const out=[];let id=firstId;while(id&&blocks[id]){out.push(...this.codeCommentLines(id,'    '.repeat(level),'//'));out.push(...this.hcStackBlock(blocks[id],blocks,level));id=blocks[id].next;}return out;}hcStackBlock(b,blocks,level){const pad='    '.repeat(level);const v=k=>this.hcVal(b.inputs[k],blocks);const n=k=>"bw_n(".concat(this.hcVal(b.inputs[k],blocks),")");const f=k=>b.fields[k]?b.fields[k][0]:'';const list=k=>"&".concat(this.hcVar(f(k)));const cond=k=>b.inputs[k]?this.hcCond(b.inputs[k][1],blocks):'0';const body=k=>b.inputs[k]?this.hcStackFrom(b.inputs[k][1],blocks,level+1):[];const line=t=>[pad+t];switch(b.opcode){case'control_forever':return["".concat(pad,"for (;;) {"),...body('SUBSTACK'),"".concat(pad,"}")];case'control_repeat':{const i="bw_i".concat(++this._hcCounter);// A C99 for-init declaration, so the whole construct is one line
// going out and one line coming back.
return["".concat(pad,"for (long ").concat(i," = (long)").concat(n('TIMES'),"; ").concat(i,"-- > 0; ) {"),...body('SUBSTACK'),"".concat(pad,"}")];}case'control_repeat_until':return["".concat(pad,"while (!").concat(cond('CONDITION'),") {"),...body('SUBSTACK'),"".concat(pad,"}")];case'control_while':return["".concat(pad,"while (").concat(cond('CONDITION'),") {"),...body('SUBSTACK'),"".concat(pad,"}")];case'control_if':return["".concat(pad,"if (").concat(cond('CONDITION'),") {"),...body('SUBSTACK'),"".concat(pad,"}")];case'control_if_else':return["".concat(pad,"if (").concat(cond('CONDITION'),") {"),...body('SUBSTACK'),"".concat(pad,"} else {"),...body('SUBSTACK2'),"".concat(pad,"}")];case'control_wait':return line("bw_wait(".concat(v('DURATION'),");"));case'control_wait_until':return line("while (!".concat(cond('CONDITION'),") ;"));case'control_stop':return f('STOP_OPTION')==='this script'?line('return;'):line("".concat(this.hcScratchCall(b,blocks),";"));case'sensing_askandwait':this._hcUses.answer=true;return line("bw_answer = bw_ask(".concat(v('QUESTION'),");"));case'data_setvariableto':return line("".concat(this.hcVar(f('VARIABLE'))," = ").concat(v('VALUE'),";"));case'data_changevariableby':// Not `x = bw_num(bw_n(x) + …)`: that is byte-identical to what
// `set x to x + 1` emits, and the way back could not tell the two
// blocks apart. A named helper keeps the distinction.
return line("bw_change(&".concat(this.hcVar(f('VARIABLE')),", ").concat(v('VALUE'),");"));case'data_addtolist':return line("bw_list_add(".concat(list('LIST'),", ").concat(v('ITEM'),");"));case'data_deleteoflist':return line("bw_list_delete(".concat(list('LIST'),", (int)").concat(n('INDEX'),");"));case'data_deletealloflist':return line("bw_list_delete_all(".concat(list('LIST'),");"));case'data_insertatlist':return line("bw_list_insert(".concat(list('LIST'),", (int)").concat(n('INDEX'),", ").concat(v('ITEM'),");"));case'data_replaceitemoflist':return line("bw_list_replace(".concat(list('LIST'),", (int)").concat(n('INDEX'),", ").concat(v('ITEM'),");"));case'procedures_call':{const m=b.mutation;const argIds=JSON.parse(m.argumentids||'[]');let ai=0;const args=[];m.proccode.replace(/%[sb]/g,tok=>{const input=b.inputs[argIds[ai++]];args.push(tok==='%b'?"bw_bool(".concat(this.hcCond(input[1],blocks),")"):this.hcVal(input,blocks));return'';});return line("".concat(this.cName(this._curPrefix+this.pyProcRaw(m.proccode)),"(").concat(args.join(', '),");"));}default:{const ac=this.hcArraysCall(b,blocks);if(ac)return line(ac+';');const sc=this.hcScratchCall(b,blocks);if(sc)return line(sc+';');this.hcWarn(b,blocks);const ps=(this.decompileStackBlock(b,blocks,0)[0]||b.opcode).trim();return line("/* ".concat(ps," */"));}}}// The whole program. Mirrors generatePython's shape — global state, one
// function per script, structural markers so the project round-trips —
// with C's constraints: markers must live inside a function, and every
// function needs a prototype before it is called.
// Everything the extension offers has a C form now: the value model grew a
// list kind for reverse/sort/slice/transpose/reshape, and map/filter/reduce
// evaluate their lambda text with a small parser over the subset those
// blocks contain. The set stays as the place to name a block that has no C
// form, so one reappearing is a warning rather than a silent zero.
generateHostC(){let project=arguments.length>0&&arguments[0]!==undefined?arguments[0]:this.project;let opts=arguments.length>1&&arguments[1]!==undefined?arguments[1]:{};this._cNames=new Map();this._hcWarnings=[];this._hcUses={answer:false};this._hcCounter=0;this._emitComments=opts.comments!==false;const targets=project.targets||[];this._buildCodeComments(targets);const stage=targets.find(t=>t.isStage);const gScalars=stage?Object.values(stage.variables||{}).map(v=>v[0]):[];const gLists=stage?Object.values(stage.lists||{}).map(l=>l[0]):[];const sections=targets.filter(t=>!t.isStage||Object.values(t.blocks||{}).some(b=>b.topLevel));const decls=[];// file-scope state
const protos=[];// every function, declared before use
const defs=[];// the functions themselves
const structure=[];// marker calls, for the round trip
const flagCalls=[];for(const name of gScalars)decls.push("static bw_val ".concat(this.cName(name),";"));for(const name of gLists)decls.push("static bw_list ".concat(this.cName(name),";"));for(const name of gScalars)structure.push("    scratch_global_var(".concat(this.hcStr(name),");"));for(const name of gLists)structure.push("    scratch_global_list(".concat(this.hcStr(name),");"));sections.forEach((t,idx)=>{const pfx=(0,_sb3_creator_scratchruntime_js__WEBPACK_IMPORTED_MODULE_2__.spritePrefix)(idx);const localScalars=t.isStage?[]:Object.values(t.variables||{}).map(v=>v[0]);const localLists=t.isStage?[]:Object.values(t.lists||{}).map(l=>l[0]);this._curPrefix=pfx;this._curLocals=new Set([...localScalars,...localLists]);for(const name of localScalars)decls.push("static bw_val ".concat(this.hcVar(name),";"));for(const name of localLists)decls.push("static bw_list ".concat(this.hcVar(name),";"));if(t.isStage)structure.push('    scratch_stage();');else{const shape=t.costumes&&t.costumes[0]&&t.costumes[0]._shapeSpec;structure.push(shape?"    scratch_sprite_shape(".concat(this.hcStr(t.name),", ").concat(this.hcStr(shape),");"):"    scratch_sprite(".concat(this.hcStr(t.name),");"));}for(const name of localScalars)structure.push("    scratch_local(".concat(this.hcStr(name),");"));for(const name of localLists)structure.push("    scratch_local_list(".concat(this.hcStr(name),");"));for(const cos of(t.costumes||[]).slice(1)){structure.push("    scratch_costume(".concat(this.hcStr(cos._spec||cos.name),");"));}for(const snd of(t.sounds||[]).slice(1)){structure.push("    scratch_sound(".concat(this.hcStr(snd.name),");"));}const blocks=t.blocks||{};for(const b of Object.values(blocks)){if(!b.topLevel||!this.isHat(b.opcode))continue;if(b.opcode==='procedures_definition'){const proto=blocks[b.inputs.custom_block[1]];const m=proto.mutation;const argNames=JSON.parse(m.argumentnames||'[]').map(a=>this.cName(a));const fn=this.cName(pfx+this.pyProcRaw(m.proccode));const params=argNames.length?argNames.map(a=>"bw_val ".concat(a)).join(', '):'void';// External linkage on purpose: a custom block or an event handler
// that nothing calls is still meaningful -- it is an entry point for
// whatever drives the shim -- and `static` would make an uncalled one
// a warning under -Werror.
protos.push("void ".concat(fn,"(").concat(params,");"));// The marker keeps the exact proccode and warp flag, which a flat
// C name cannot encode — the same reason Python emits defblock().
defs.push(["/* DEFINE ".concat(m.proccode," */"),"void ".concat(fn,"(").concat(params,")"),'{',"    scratch_defblock(".concat(this.hcStr(m.proccode),", bw_num(").concat(m.warp==='true'?1:0,"));"),...this.hcStackFrom(b.next,blocks,1),'}'].join('\n'));}else{const fn=this.hcFresh(pfx+this.pyHatBase(b));protos.push("void ".concat(fn,"(void);"));// A comment attached to the hat belongs to the script; `//` so
// the way back can tell it from the emitter's own /* notes */.
const note=this.codeCommentLines(b.id||Object.keys(blocks).find(k=>blocks[k]===b),'','//');const head=b.opcode==='event_whenflagclicked'?[]:["/* ".concat(this.decompileHat(b,blocks)," \u2014 call when that happens */")];defs.push([...note,...head,"void ".concat(fn,"(void)"),'{',...this.hcStackFrom(b.next,blocks,1),'}'].join('\n'));if(b.opcode==='event_whenflagclicked')flagCalls.push("    ".concat(fn,"();"));}}});this._curPrefix='';this._curLocals=null;const program=[];if(decls.length)program.push(...decls,'');if(this._hcUses.answer)program.push('static bw_val bw_answer;','');if(protos.length)program.push(...protos,'');if(structure.length){program.push('/* Project structure, so the C reads back as the same blocks. */','static void bw_structure(void)','{',...structure,'}','');}for(const d of defs)program.push(d,'');program.push('int main(void)','{');if(structure.length)program.push('    bw_structure();');program.push(...flagCalls,'    return 0;','}');const body=program.join('\n');const out=['/* Generated by Brickwright — blocks → C (host).',' * Scratch blocks map to a `scratch_*` shim you can point at a real renderer;',' * the structure calls in bw_structure() are what make this read back as the',' * same project. For the STC12/8051 this is the WRONG target — declare pins',' * and you get bare metal instead. */',// 200809L, not 199309L: POSIX.1b gets nanosleep but predates C99, so the
// headers then hide snprintf and every generated program fails to compile
// with an implicit declaration. POSIX.1-2008 has both.
'#define _POSIX_C_SOURCE 200809L   /* nanosleep, and C99 in the headers */',..._sb3_creator_chostruntime_js__WEBPACK_IMPORTED_MODULE_3__.C_HOST_INCLUDES.map(h=>"#include <".concat(h,">")),'',(0,_sb3_creator_chostruntime_js__WEBPACK_IMPORTED_MODULE_3__.cHostRuntime)(body),'/* @bw-program — everything above is runtime; the project starts here. */',body,''];return out.join('\n');}/**
     * The seventh target: blocks → line-numbered BASIC, to be TYPED into a
     * live interpreter over the ACIA (BeebEater's BBC BASIC today, the MIT
     * MS BASIC port when it lands) or run under BBCSDL's console as the
     * host oracle. Two dialect profiles:
     *   'bbc' (default): BBC BASIC — REPEAT/UNTIL, TIME-based waits, MOD,
     *     ?&addr indirection for VIA pokes, DEF PROC/ENDPROC with
     *     parameters (auto-LOCAL, the chapter-16 contract). Variable names
     *     stay readable and LOWERCASE: BBC keywords are uppercase-only
     *     tokens, so lowercase names can never collide with them.
     *   'ms': Microsoft BASIC 1.1 — POKE/PEEK, GOTO loops, arithmetic in
     *     place of MOD/EOR, delay loops in place of TIME (with a REM'd
     *     calibration constant), and names mangled to two significant
     *     characters because that is all 1.1 keeps.
     * Single-script programs only: BASIC is single-threaded, so multi-WHEN
     * projects refuse with the reason instead of pretending. DEF FN (the
     * chapter-17 value-returning half) is the READER's obligation —
     * basicToPseudocode must accept it; the emitter will use it the day
     * the dialect grows reporter procedures.
     * Returns { ok, basic?, reasons: [], warnings: [] }.
     *//**
     * MicroPython for the micro:bit — the board's own dialect, where
     * hardware blocks map to the microbit API (say → display.scroll) and
     * MULTIPLE WHEN SCRIPTS run on a single thread via the settled
     * cooperative-scheduling contract in its Python-native form: every
     * script is a GENERATOR yielding milliseconds at each wait and 0 at
     * every loop back-edge; a round-robin driver on running_time() walks
     * them. Same semantics as the C state machines, a tenth of the
     * machinery, because yield is a language feature here.
     *
     * Degradations are NAMED, never silent: blocks with no board meaning
     * (pen, motion) and sensing that would need the host shim come back
     * as warnings; reasons[] only for programs that cannot run at all.
     *
     * @returns {{ok: boolean, py?: string, reasons: string[], warnings: string[]}}
     */generateMicroPython(){let project=arguments.length>0&&arguments[0]!==undefined?arguments[0]:this.project;// The shared pure-Python expression layer (pyVal/pyCond/varRef)
// reads the same context generatePython sets up.
this._pyNames=new Map();this._pyUses={random:false,math:false,time:false,eq:false,answer:false,arrays:false,json:false,sumdigits:false};this._runtimesUsed=new Set();this._async=false;this._emitComments=false;this._driverPins=project.stc&&project.stc.pins||null;this._curPrefix='';this._curLocals=new Set();const warnings=[];const reasons=[];const targets=project.targets||[];const stage=targets.find(t=>t.isStage);const stateDecls=[];const seen=new Set();const declVar=(name,init)=>{const n=this.pyName(name);if(!seen.has(n)){seen.add(n);stateDecls.push("".concat(n," = ").concat(init));}return n;};if(stage){for(const v of Object.values(stage.variables||{}))declVar(v[0],'0');for(const l of Object.values(stage.lists||{}))declVar(l[0],'[]');}const KEYMAP={a:'button_a',b:'button_b'};const uses={music:false,buttons:false,oled:false};const degrade=msg=>{if(!warnings.includes(msg))warnings.push(msg);};// TWO boards run MicroPython here. The micro:bit's pins are ambient
// objects (pin0..pin20); the Pico's are CONSTRUCTED — Pin(n, Pin.IN,
// Pin.PULL_UP) — and an ACTIVE LOW input gets the INTERNAL pull-up,
// the button-to-GND idiom with no external resistor, exactly the
// real builds' wiring. The platform convention holds on both:
// on/off is LOGICAL (ACTIVE LOW inverts), high/low and computed
// writes are PHYSICAL levels.
const isPico=/^pico$/i.test(String(project.stc&&project.stc.device||''));const pinMap=new Map();for(const p of project.stc&&project.stc.pins||[]){if(isPico){const m=/^GP(\d{1,2})$/i.exec(p.where||'');if(m&&Number(m[1])<=28){pinMap.set(p.name,{expr:"_pin_".concat(p.name),gpio:Number(m[1]),activeLow:!!p.activeLow,direction:p.direction});}else{degrade("pin ".concat(p.name," at \"").concat(p.where,"\" is not a Pico pin (GP0-GP28); its operations are stubs"));}continue;}const m=/^P(\d{1,2})$/i.exec(p.where||'');if(m&&Number(m[1])<=20){pinMap.set(p.name,{expr:"pin".concat(Number(m[1])),activeLow:!!p.activeLow});}else{degrade("pin ".concat(p.name," at \"").concat(p.where,"\" is not a micro:bit pin (P0-P20); its operations are stubs"));}}const pinOf=name=>pinMap.get(name)||null;const readExpr=pin=>isPico?pin.activeLow?"(1 - ".concat(pin.expr,".value())"):"".concat(pin.expr,".value()"):pin.activeLow?"(1 - ".concat(pin.expr,".read_digital())"):"".concat(pin.expr,".read_digital()");// Expression via the shared pure-Python layer; anything that came
// out needing the host shim is a named degradation, not a lie.
const guard=(expr,what)=>{if(String(expr).includes('scratch.')){degrade("".concat(what," has no micro:bit form yet; emitted as 0"));return'0';}return expr;};// Pin reporters get intercepted BEFORE the shared layer: reading a
// pin is board-native here, not a shim call.
const pinReporter=(input,blocks)=>{if(!Array.isArray(input)||typeof input[1]!=='string')return null;const rb=blocks[input[1]];if(!rb)return null;if(rb.opcode==='stc12_readpin'){const p=pinOf(rb.fields.PIN?rb.fields.PIN[0]:'');if(!p)return'0';return readExpr(p);}if(rb.opcode==='stc12_read'){const p=pinOf(rb.fields.PIN?rb.fields.PIN[0]:'');if(!p)return'0';if(isPico){degrade("analog read of ".concat(p.expr," needs machine.ADC \u2014 not emitted yet"));return'0';}return"".concat(p.expr,".read_analog()");}return null;};const val=(b,k,blocks)=>{var _pinReporter;return(_pinReporter=pinReporter(b.inputs[k],blocks))!==null&&_pinReporter!==void 0?_pinReporter:guard(this.pyVal(b.inputs[k],blocks),b.opcode);};const cond=(b,blocks)=>{const ref=b.inputs.CONDITION?b.inputs.CONDITION[1]:null;if(ref&&blocks[ref]&&blocks[ref].opcode==='stc12_readpin'){const p=pinOf(blocks[ref].fields.PIN?blocks[ref].fields.PIN[0]:'');if(!p)return'False';if(isPico)return"".concat(p.expr,".value() == ").concat(p.activeLow?0:1);return"".concat(p.expr,".read_digital() == ").concat(p.activeLow?0:1);}if(ref&&blocks[ref]&&blocks[ref].opcode==='sensing_keypressed'){const kb=blocks[ref];const opt=kb.inputs.KEY_OPTION?blocks[kb.inputs.KEY_OPTION[1]]:null;const key=opt&&opt.fields.KEY_OPTION?String(opt.fields.KEY_OPTION[0]).toLowerCase():'';if(KEYMAP[key]){uses.buttons=true;return"".concat(KEYMAP[key],".is_pressed()");}degrade("key '".concat(key,"' maps to no micro:bit button (a/b only); condition is False"));return'False';}return guard(this.pyCond(ref,blocks),ref&&blocks[ref]?blocks[ref].opcode:'condition');};const stmt=(b,blocks,pad)=>{const v=k=>val(b,k,blocks);const vs=k=>"str(".concat(val(b,k,blocks),")");const f=k=>b.fields[k]?b.fields[k][0]:'';const sub=k=>b.inputs[k]?walk(b.inputs[k][1],blocks,pad+'    '):["".concat(pad,"    pass")];switch(b.opcode){case'data_setvariableto':{const n=declVar(f('VARIABLE'),'0');return["".concat(pad).concat(n," = ").concat(v('VALUE'))];}case'data_changevariableby':{const n=declVar(f('VARIABLE'),'0');return["".concat(pad).concat(n," = ").concat(n," + ").concat(v('VALUE'))];}// say is STAGE speech — the board has no stage, so it is a
// NAMED degradation; putting text on the LEDs is the explicit
// `display` verb, and serial output is `print`. Two intents,
// two verbs, per the owner's correction.
case'looks_say':case'looks_think':degrade('say/think is stage speech — use `display` for the LEDs or `print` for serial');return["".concat(pad,"pass  # say (stage)")];case'looks_sayforsecs':case'looks_thinkforsecs':degrade('say/think is stage speech — use `display` for the LEDs or `print` for serial');return["".concat(pad,"yield int((").concat(v('SECS'),") * 1000)  # say (stage)")];case'microbit_display':return["".concat(pad,"display.scroll(").concat(vs('VALUE'),", wait=False, loop=False)")];case'stc12_print':return["".concat(pad,"print(").concat(vs('VALUE'),")")];case'stc12_setpin':{const p=pinOf(f('PIN'));if(!p){degrade("undeclared pin ".concat(f('PIN')));return["".concat(pad,"pass  # pin ").concat(f('PIN'))];}const st=f('STATE');// on/off logical (ACTIVE LOW inverts); high/low physical.
const level=st==='high'?1:st==='low'?0:st==='on'!==p.activeLow?1:0;return["".concat(pad).concat(p.expr,".").concat(isPico?'value':'write_digital',"(").concat(level,")")];}case'stc12_toggle':{const p=pinOf(f('PIN'));if(!p){degrade("undeclared pin ".concat(f('PIN')));return["".concat(pad,"pass")];}return["".concat(pad).concat(p.expr,".write_digital(1 - ").concat(p.expr,".read_digital())")];}case'stc12_writepin':{const p=pinOf(f('PIN'));if(!p){degrade("undeclared pin ".concat(f('PIN')));return["".concat(pad,"pass")];}return["".concat(pad).concat(p.expr,".write_digital(1 if (").concat(v('VALUE'),") else 0)")];}case'stc12_setpwm':{const p=pinOf(f('PIN'));if(!p){degrade("undeclared pin ".concat(f('PIN')));return["".concat(pad,"pass")];}return["".concat(pad).concat(p.expr,".write_analog(int((").concat(v('VALUE'),") * 1023 / 100))")];}case'stc12_settone':{uses.music=true;degrade('tone plays on the board speaker/pin0 — the micro:bit has no per-pin tone routing');return["".concat(pad,"music.pitch(int(").concat(v('VALUE'),"), wait=False)")];}case'control_wait':return["".concat(pad,"yield int((").concat(v('DURATION'),") * 1000)")];case'control_wait_until':return["".concat(pad,"while not (").concat(cond(b,blocks),"):"),"".concat(pad,"    yield 0")];case'control_forever':return["".concat(pad,"while True:"),...sub('SUBSTACK'),"".concat(pad,"    yield 0")];case'control_repeat':return["".concat(pad,"for _ in range(int(").concat(v('TIMES'),")):"),...sub('SUBSTACK'),"".concat(pad,"    yield 0")];case'control_repeat_until':return["".concat(pad,"while not (").concat(cond(b,blocks),"):"),...sub('SUBSTACK'),"".concat(pad,"    yield 0")];case'control_if':return["".concat(pad,"if ").concat(cond(b,blocks),":"),...sub('SUBSTACK')];case'control_if_else':return["".concat(pad,"if ").concat(cond(b,blocks),":"),...sub('SUBSTACK'),"".concat(pad,"else:"),...sub('SUBSTACK2')];case'control_stop':return["".concat(pad,"return")];case'sound_playnoteforbeats':{uses.music=true;// Scratch note number → frequency; 60 beats/min default tempo.
return["".concat(pad,"music.pitch(int(440 * 2 ** ((").concat(v('NOTE')," - 69) / 12)), wait=False)"),"".concat(pad,"yield int((").concat(v('BEATS'),") * 500)"),"".concat(pad,"music.stop()")];}case'event_broadcast':{const msg=this.pyVal(b.inputs.BROADCAST_INPUT,blocks);return["".concat(pad,"_pending.append(").concat(msg,")")];}case'procedures_call':{const m=b.mutation;const argIds=JSON.parse(m.argumentids||'[]');let ai=0;const args=[];m.proccode.replace(/%[sb]/g,()=>{var _pinReporter2;const input=b.inputs[argIds[ai++]];args.push((_pinReporter2=pinReporter(input,blocks))!==null&&_pinReporter2!==void 0?_pinReporter2:guard(this.pyVal(input,blocks),'procedure argument'));return'';});const fn=this.pyName('_proc_'+this.pyProcRaw(m.proccode));// yield from: a DEFINE may wait — the call must thread
// the scheduler through. A fast DEFINE simply has no
// yields inside and runs atomically.
return["".concat(pad,"yield from ").concat(fn,"(").concat(args.join(', '),")")];}case'bw_raw':{// The grey block comes home: the exact line the reader
// could not translate, re-emitted verbatim. This is
// what makes import → edit → export lossless.
const t=String(b.fields.TEXT?b.fields.TEXT[0]:'');return["".concat(pad).concat(t)];}// OLED verbs, Pico only: the page-mode driver in the header
// (validated on the real GME12864-70 — an SH1106, which
// ignores the SSD1306 window commands; page mode works on
// BOTH controllers). Cursor is text cells, 8x8 font.
case'devices_oledclear':if(isPico){uses.oled=true;return["".concat(pad,"_oled.fill(0)"),"".concat(pad,"_oled.show()")];}break;case'devices_oledcursor':if(isPico){uses.oled=true;return["".concat(pad,"_oled.crow = int(").concat(v('ROW'),")"),"".concat(pad,"_oled.ccol = int(").concat(v('COL'),")")];}break;case'devices_oledprint':if(isPico){uses.oled=true;return["".concat(pad,"_oled_print(").concat(v('VALUE'),")")];}break;default:{const desc=this.decompileBlock?this.decompileBlock(b,blocks):b.opcode;degrade("".concat(b.opcode," has no ").concat(isPico?'Pico':'micro:bit'," form yet (").concat(String(desc).slice(0,40),")"));return["".concat(pad,"pass  # ").concat(b.opcode)];}}// A cased verb that only one board lowers falls through to here.
degrade("".concat(b.opcode," has no ").concat(isPico?'Pico':'micro:bit'," form yet"));return["".concat(pad,"pass  # ").concat(b.opcode)];};const walk=(id,blocks,pad)=>{const out=[];let b=blocks[id];while(b){out.push(...stmt(b,blocks,pad));b=blocks[b.next];}return out.length?out:["".concat(pad,"pass")];};// ---- hats → generator defs ------------------------------------
const taskDefs=[];const procDefs=[];// DEFINEs — assembled AFTER all walking so
// globalsFor sees the complete variable set
const starts=[];// started at flag
const receivers=[];// [message, fnName]
let taskSeq=0;for(const t of targets){const blocks=t.blocks||{};for(const b of Object.values(blocks)){if(!b.topLevel)continue;if(b.opcode==='event_whenflagclicked'){const fn="_task_".concat(taskSeq++);const body=walk(b.next,blocks,'    ');taskDefs.push(["def ".concat(fn,"():"),...globalsFor(this,body),...body].join('\n'));starts.push(fn);}else if(b.opcode==='event_whenbroadcastreceived'){const fn="_task_".concat(taskSeq++);const msg=b.fields.BROADCAST_OPTION?b.fields.BROADCAST_OPTION[0]:'';const body=walk(b.next,blocks,'    ');taskDefs.push(["def ".concat(fn,"():"),...globalsFor(this,body),...body].join('\n'));receivers.push([msg,fn]);}else if(b.opcode==='stc12_whenpin'){// Edge-triggered pin hat as an edge-polling generator:
// the body (yields and all) runs on each matching edge.
const p=pinOf(b.fields.PIN?b.fields.PIN[0]:'');if(!p){degrade("WHEN on undeclared pin ".concat(b.fields.PIN?b.fields.PIN[0]:'?',"; script skipped"));continue;}const edge=b.fields.EDGE?String(b.fields.EDGE[0]).toLowerCase():'on';const activeVal=(edge==='on'||edge==='pressed')!==p.activeLow?1:0;const fn="_task_".concat(taskSeq++);const body=walk(b.next,blocks,'            ');taskDefs.push(["def ".concat(fn,"():"),...globalsFor(this,body),'    _prev = False','    while True:',"        _cur = ".concat(p.expr,".read_digital() == ").concat(activeVal),'        if _cur and not _prev:',...body,'        _prev = _cur','        yield 0'].join('\n'));starts.push(fn);}else if(b.opcode==='procedures_definition'){// DEFINE → a GENERATOR function; calls are `yield from`,
// so a waiting procedure threads the scheduler and a
// fast one runs straight through. `if False: yield`
// makes the yield-less body a generator all the same.
const proto=blocks[b.inputs.custom_block?b.inputs.custom_block[1]:''];if(!proto||!proto.mutation){degrade('procedure without a prototype; skipped');continue;}const m=proto.mutation;const fn=this.pyName('_proc_'+this.pyProcRaw(m.proccode));const argNames=JSON.parse(m.argumentnames||'[]').map(a=>this.pyName(a));const body=walk(b.next,blocks,'    ');procDefs.push({fn,argNames,body});}else if(this.isHat(b.opcode)){degrade("hat ".concat(b.opcode," has no ").concat(isPico?'Pico':'micro:bit'," form yet; script skipped"));}}}for(const{fn,argNames,body}of procDefs){const globals=globalsFor(this,body).map(l=>argNames.length?l.replace(new RegExp("\\b(".concat(argNames.join('|'),")\\b,? ?"),'g'),'').replace(/, *$/,'').replace(/global *$/,''):l).filter(l=>/global \w/.test(l));taskDefs.unshift(["def ".concat(fn,"(").concat(argNames.join(', '),"):"),...globals,...body,'    if False:','        yield 0'].join('\n'));}if(!taskDefs.length)reasons.push('no runnable scripts (a when-flag-clicked hat is required)');if(reasons.length)return{ok:false,reasons,warnings};function globalsFor(self,bodyLines){const names=new Set();for(const line of bodyLines){const m=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*) = /);if(m&&seen.has(m[1]))names.add(m[1]);}return names.size?["    global ".concat([...names].join(', '))]:[];}const header=isPico?['# generated for Raspberry Pi Pico (MicroPython)','from machine import Pin, I2C','import time','','# The shared scheduler speaks micro:bit; two shims make the','# Pico fluent in it.','def running_time():','    return time.ticks_ms()','','def sleep(ms):','    time.sleep_ms(int(ms))']:['# generated for micro:bit (MicroPython)','from microbit import *'];if(uses.music&&!isPico)header.push('import music');if(isPico){// Pin objects. sda/scl by NAME feed the hardware I2C when the
// program drives an OLED — they must not be constructed as
// plain outputs on top of the peripheral.
const i2cNames=new Set(uses.oled?['sda','scl']:[]);for(const[name,p]of pinMap){if(i2cNames.has(String(name).toLowerCase()))continue;if(p.direction==='input'){const pull=p.activeLow?', Pin.PULL_UP':', Pin.PULL_DOWN';header.push("".concat(p.expr," = Pin(").concat(p.gpio,", Pin.IN").concat(pull,")"));}else{header.push("".concat(p.expr," = Pin(").concat(p.gpio,", Pin.OUT)"));}}if(uses.oled){const sdaPin=[...pinMap.entries()].find(_ref6=>{let[n]=_ref6;return n.toLowerCase()==='sda';});const sclPin=[...pinMap.entries()].find(_ref7=>{let[n]=_ref7;return n.toLowerCase()==='scl';});const sdaN=sdaPin?sdaPin[1].gpio:0;const sclN=sclPin?sclPin[1].gpio:1;const bus=sdaN%4===0?0:1;// RP2040 I2C pin muxing
header.push('','import framebuf','','# Page-mode OLED driver: works on SSD1306 AND SH1106 (the','# GME12864-70 carries an SH1106, which ignores the SSD1306','# window commands — horizontal-mode drivers show only noise).','class _OLED(framebuf.FrameBuffer):','    COL_OFFSET = 2  # SH1106 window; harmless 2px shift on a true SSD1306','','    def __init__(self, i2c, addr=0x3C, width=128, height=64):','        self.i2c = i2c; self.addr = addr','        self.width = width; self.height = height','        self.pages = height // 8','        self.buf = bytearray(self.pages * width)','        super().__init__(self.buf, width, height, framebuf.MONO_VLSB)','        self.crow = 0; self.ccol = 0','        for c in (0xAE, 0x40, 0xA0, 0xA8, height - 1, 0xC0, 0xD3, 0x00,','                  0xDA, 0x12, 0xD5, 0x80, 0xD9, 0xF1, 0xDB, 0x30,','                  0x81, 0xFF, 0xA4, 0xA6, 0x8D, 0x14, 0xAF):','            self.cmd(c)','        self.fill(0); self.show()','','    def cmd(self, c):','        self.i2c.writeto(self.addr, bytes((0x80, c)))','','    def show(self):','        for page in range(self.pages):','            self.cmd(0xB0 | page)','            self.cmd(0x00 | (self.COL_OFFSET & 0x0F))','            self.cmd(0x10 | (self.COL_OFFSET >> 4))','            s = page * self.width','            self.i2c.writeto(self.addr, b"\\x40" + self.buf[s:s + self.width])','',"_i2c = I2C(".concat(bus,", sda=Pin(").concat(sdaN,"), scl=Pin(").concat(sclN,"), freq=400_000)"),'_oled = _OLED(_i2c)','','def _fmt(v):','    if isinstance(v, float) and v == int(v):','        v = int(v)','    return str(v)','','def _oled_print(v):','    s = _fmt(v)','    _oled.text(s, _oled.ccol * 8, _oled.crow * 8)','    _oled.ccol += len(s)','    _oled.show()');}}const driver=['','_pending = []',"_receivers = {".concat(receivers.map(_ref8=>{let[m,fn]=_ref8;return"".concat(this.pyStr(m),": ").concat(fn);}).join(', '),"}"),'','def _run(tasks):','    # The scheduling contract: every task yields ms to sleep (0 at','    # loop back-edges), the driver round-robins on running_time().','    tasks = [[t, 0] for t in tasks]','    while tasks:','        while _pending:','            fn = _receivers.get(_pending.pop(0))','            if fn: tasks.append([fn(), 0])','        now = running_time()','        alive = []','        for entry in tasks:','            gen, wake = entry','            if now >= wake:','                try:','                    entry[1] = now + next(gen)','                    alive.append(entry)','                except StopIteration:','                    pass','            else:','                alive.append(entry)','        tasks = alive','        sleep(1)','',"_run([".concat(starts.map(fn=>"".concat(fn,"()")).join(', '),"])")];// Shared-layer helpers the expressions leaned on. The micro:bit
// programs never tripped these; the Pico calculator's _eq(error, 0)
// was a NameError at the first key press.
const helpers=[];if(this._pyUses.eq){helpers.push('def _eq(a, b):  # Scratch-style loose equality','    try:','        return float(a) == float(b)','    except (ValueError, TypeError):','        return str(a).lower() == str(b).lower()','');}const py=[...header,'',...helpers,...stateDecls,'',...taskDefs,...driver].join('\n')+'\n';return{ok:true,py,reasons:[],warnings};}generateBASIC(){let project=arguments.length>0&&arguments[0]!==undefined?arguments[0]:this.project;let opts=arguments.length>1&&arguments[1]!==undefined?arguments[1]:{};const profile=opts.profile||'bbc';const bbc=profile==='bbc';const reasons=[];const warnings=[];// Line numbers are OPTIONAL in modern BBC BASIC (tutorial Appendix
// A: "Line Numbers and the Dreaded GOTO") — the structured form uses
// multi-line IF/ENDIF (ch. 9) and REPEAT/UNTIL (ch. 12) instead of
// labels, and is what BBCSDL/console runs natively. The NUMBERED
// form remains the default because BASIC 4 on the live machine
// (BeebEater) accepts nothing else. MS BASIC 1.1 always numbers.
let numbered=opts.lineNumbers!==false;if(!numbered&&!bbc){warnings.push('MS BASIC 1.1 requires line numbers — emitting numbered');numbered=true;}const structured=bbc&&!numbered;let depth=0;this._basLoopSeq=0;const stc=project.stc||{};const machine=stc.machine||null;const viaAt=(machine&&(machine.chips||[]).find(c=>c.kind==='via')||{at:0x6000}).at;const pins=new Map((stc.pins||[]).map(p=>[String(p.name).toLowerCase(),p]));// Pin pokes are addresses on the 6502 MACHINE's VIA. Another device's
// pins (P1.0, D13, GP25) have no meaning as BASIC pokes — on the
// w65c02 they are real pokes; on anything else they degrade to
// REM-commented stubs that still RUN (host-C's report-stub pattern).
const devPart=SB3Creator.STC_PARTS[String(stc.device||'').toLowerCase()];const pokeable=!stc.device||devPart&&devPart.core==='w65c02';if(!pokeable&&pins.size){warnings.push("DEVICE ".concat(String(stc.device).toUpperCase()," pin operations emitted as REM stubs \u2014 ")+'BASIC pokes drive the 6502 machine\'s VIA; retarget to EATER6502 for real pokes');}// ---- shim tracking (like _cUses: emit DEF PROCs on demand) ----
const basUses={answer:false,lists:new Map(),pen:false,motionXY:false,timer:false};// String-type tracking: BASIC needs name$ for string variables.
// We track which Scratch variable names are known-string (from
// assignments of string literals, join, letter-of, ask/answer).
const stringVars=new Set();// Lists: track name -> { lenVar, dimmed }; Scratch lists map to
// parallel DIM arrays + a length counter variable.
const listMeta=raw=>{const k=String(raw);if(basUses.lists.has(k))return basUses.lists.get(k);const bn=basName(k);const meta={baseName:bn,lenVar:bn+'_n',dimmed:false};basUses.lists.set(k,meta);return meta;};// ---- names ----------------------------------------------------
const KEYWORDS=new Set(('print time for next if then else goto gosub return repeat '+'until end def proc fn local endproc rem let dim to step and or not eor mod div '+'true false rnd int abs sgn sqr len peek poke input count pos page top lomem '+'himem ptr ext err erl pi sin cos tan asn acs atn log ln exp rad deg val get '+'inkey point adval usr eval read data restore stop run list new old clear '+'width tab spc on error trace vdu plot move draw gcol colour mode sound '+'envelope call chain load save cls clg off asc instr left right mid str '+'string bget bput openin openout opt oscli report him auto delete renumber').split(' '));const names=new Map();let msSeq=0;const basName=raw=>{const k=String(raw);if(names.has(k))return names.get(k);let n;if(bbc){n=k.toLowerCase().replace(/^proc:/,'').replace(/[^a-z0-9_]/g,'_').replace(/^[^a-z_]/,'v$&');if(KEYWORDS.has(n))n="".concat(n,"x");const taken=new Set([...names.values()].map(x=>x.toLowerCase()));while(taken.has(n))n+='x';}else{n='V'+(msSeq++).toString(36).toUpperCase();}names.set(k,n);return n;};// String-safe variable reference: appends $ if we know it's a string.
const basVarRef=raw=>{const n=basName(raw);return stringVars.has(String(raw))?n+'$':n;};// ---- the two-pass line store -----------------------------------
// lineBlocks runs PARALLEL to outLines: lineBlocks[i] is the Scratch
// block id whose lowering emitted outLines[i] (null for scaffolding).
// It becomes the returned lineMap, which is what lets BBC BASIC's own
// TRACE output — line numbers in the serial stream — glow the block
// that owns the line. The one splice below mirrors into it.
const outLines=[];const lineBlocks=[];let curBlockId=null;let labelSeq=0;const newLabel=()=>"@L".concat(labelSeq++,"@");const emit=s=>{outLines.push(structured?'  '.repeat(depth)+s:s);lineBlocks.push(curBlockId);};const emitLabel=l=>{outLines.push({label:l});lineBlocks.push(null);};// ---- expressions ----------------------------------------------
const num=v=>{const n=Number(v);return Number.isFinite(n)?String(n):'0';};const pinMask=p=>1<<Number(String(p.where||'').replace(/^P[AB]/i,''));const pinPort=p=>/^PB/i.test(p.where||'')?viaAt+0:viaAt+1;const peekPin=p=>{const mask=pinMask(p);const raw=bbc?"((?&".concat(pinPort(p).toString(16).toUpperCase()," AND ").concat(mask,") DIV ").concat(mask,")"):"((PEEK(".concat(pinPort(p),") AND ").concat(mask,")/").concat(mask,")");return p.activeLow?"(1-".concat(raw,")"):raw;};// String-literal detection: if the input is a literal string (not a
// number and not a block), yield it quoted for BASIC string ops.
const basValStr=(input,blocks)=>{if(!input)return'""';const v=input[1];if(Array.isArray(v)){if(v[0]===12)return basVarRef(v[1]);// Literal: if it looks like a number return the number, else quote it.
const s=String(v[1]);const n=Number(s);if(Number.isFinite(n)&&s===String(n))return s;return"\"".concat(s.replace(/"/g,'""'),"\"");}if(typeof v==='string'&&blocks[v])return basRep(blocks[v],blocks);return'""';};const basVal=(input,blocks)=>{if(!input)return'0';const v=input[1];if(Array.isArray(v)){if(v[0]===12)return basVarRef(v[1]);return num(v[1]);}if(typeof v==='string'&&blocks[v])return basRep(blocks[v],blocks);return'0';};// BBC BASIC math-op mapping (operator_mathop OPERATOR field).
const basMathop=(op,arg)=>{switch(String(op).toLowerCase()){case'abs':return"ABS(".concat(arg,")");case'floor':return"INT(".concat(arg,")");case'ceiling':return"(INT(".concat(arg,")+(").concat(arg,"<>INT(").concat(arg,")))");case'sqrt':return"SQR(".concat(arg,")");case'sin':return"SIN(RAD(".concat(arg,"))");case'cos':return"COS(RAD(".concat(arg,"))");case'tan':return"TAN(RAD(".concat(arg,"))");case'asin':return"DEG(ASN(".concat(arg,"))");case'acos':return"DEG(ACS(".concat(arg,"))");case'atan':return"DEG(ATN(".concat(arg,"))");case'ln':return"LN(".concat(arg,")");case'log':return"(LN(".concat(arg,")/LN(10))");case'e ^':return"EXP(".concat(arg,")");case'10 ^':return"(10^".concat(arg,")");default:return"(".concat(arg,")");}};const basRep=(b,blocks)=>{const v=k2=>basVal(b.inputs[k2],blocks);const vs=k2=>basValStr(b.inputs[k2],blocks);const f=k2=>b.fields[k2]?b.fields[k2][0]:'';switch(b.opcode){case'operator_add':return"(".concat(v('NUM1'),"+").concat(v('NUM2'),")");case'operator_subtract':return"(".concat(v('NUM1'),"-").concat(v('NUM2'),")");case'operator_multiply':return"(".concat(v('NUM1'),"*").concat(v('NUM2'),")");case'operator_divide':return"(".concat(v('NUM1'),"/").concat(v('NUM2'),")");case'operator_mod':return bbc?"(".concat(v('NUM1')," MOD ").concat(v('NUM2'),")"):"(".concat(v('NUM1'),"-INT(").concat(v('NUM1'),"/").concat(v('NUM2'),")*").concat(v('NUM2'),")");case'operator_random':return bbc?"(RND(".concat(v('TO'),"-").concat(v('FROM'),"+1)+").concat(v('FROM'),"-1)"):"(INT(RND(1)*(".concat(v('TO'),"-").concat(v('FROM'),"+1))+").concat(v('FROM'),")");case'operator_round':return"INT(".concat(v('NUM'),"+0.5)");case'operator_mathop':return basMathop(f('OPERATOR'),v('NUM'));case'operator_join':return"(".concat(vs('STRING1'),"+").concat(vs('STRING2'),")");case'operator_letter_of':return"MID$(".concat(vs('STRING'),",").concat(v('LETTER'),",1)");case'operator_length':return"LEN(".concat(vs('STRING'),")");case'operator_contains':return"(INSTR(".concat(vs('STRING1'),",").concat(vs('STRING2'),")>0)");case'operator_equals':return"".concat(v('OPERAND1'),"=").concat(v('OPERAND2'));case'operator_gt':return"".concat(v('OPERAND1'),">").concat(v('OPERAND2'));case'operator_lt':return"".concat(v('OPERAND1'),"<").concat(v('OPERAND2'));case'operator_and':return"(".concat(v('OPERAND1'),") AND (").concat(v('OPERAND2'),")");case'operator_or':return"(".concat(v('OPERAND1'),") OR (").concat(v('OPERAND2'),")");case'operator_not':return"NOT (".concat(v('OPERAND'),")");// ---- sensing reporters ----
case'sensing_answer':basUses.answer=true;return'answer$';case'sensing_timer':basUses.timer=true;return'(TIME/100)';case'sensing_mousex':return'0:REM mouse x (no input device)';case'sensing_mousey':return'0:REM mouse y (no input device)';case'sensing_loudness':return'0';case'sensing_keypressed':return"(INKEY(-".concat(this._basInkeyCode(f('KEY_OPTION')),")=-1)");case'sensing_mousedown':return'0';// ---- motion reporters ----
case'motion_xposition':basUses.motionXY=true;return'bw_x%';case'motion_yposition':basUses.motionXY=true;return'bw_y%';case'motion_direction':return'bw_dir%';// ---- looks reporters ----
case'looks_costumenumbername':return'1:REM costume '+f('NUMBER_NAME');case'looks_backdropnumbername':return'1:REM backdrop '+f('NUMBER_NAME');case'looks_size':return'100';// ---- data / list reporters ----
case'data_itemoflist':{const lm=listMeta(f('LIST'));return"".concat(lm.baseName,"(").concat(v('INDEX'),")");}case'data_lengthoflist':{const lm=listMeta(f('LIST'));return lm.lenVar;}case'data_listcontainsitem':{const lm=listMeta(f('LIST'));return"FNlist_contains(".concat(lm.baseName,"(),").concat(lm.lenVar,",").concat(vs('ITEM'),")");}case'data_itemnumoflist':{const lm=listMeta(f('LIST'));return"FNlist_indexof(".concat(lm.baseName,"(),").concat(lm.lenVar,",").concat(vs('ITEM'),")");}// ---- pin reads (hardware) ----
case'stc12_read':case'stc12_readpin':{if(!pokeable){return'0:REM read '+f('PIN');}const p=pins.get(String(f('PIN')).toLowerCase());if(!p){warnings.push("read of undeclared pin \"".concat(f('PIN'),"\" \u2014 0"));return'0';}return peekPin(p);}case'argument_reporter_string_number':case'argument_reporter_boolean':return basName(f('VALUE'));// ---- Planete Maths extension ----
case'planetemaths_add':return"(".concat(v('A'),"+").concat(v('B'),")");case'planetemaths_substract':return"(".concat(v('A'),"-").concat(v('B'),")");case'planetemaths_multiply':return"(".concat(v('A'),"*").concat(v('B'),")");case'planetemaths_divide':return"(".concat(v('A'),"/").concat(v('B'),")");case'planetemaths_pow':return"(".concat(v('A'),"^").concat(v('B'),")");case'planetemaths_oppose':return"(0-".concat(v('A'),")");case'planetemaths_inverse':return"(1/".concat(v('A'),")");case'planetemaths_pourcent':return"(".concat(v('A'),"/100)");case'planetemaths_nombre_pi':return'PI';case'planetemaths_nombre_e':return'EXP(1)';case'planetemaths_factorial':return"FNfact(".concat(v('A'),")");case'planetemaths_min':return"FNmin(".concat(v('A'),",").concat(v('B'),")");case'planetemaths_max':return"FNmax(".concat(v('A'),",").concat(v('B'),")");case'planetemaths_random':return"(RND(".concat(v('B'),"-").concat(v('A'),"+1)+").concat(v('A'),"-1)");case'planetemaths_join':return"(".concat(vs('A'),"+").concat(vs('B'),")");case'planetemaths_letterOf':return"MID$(".concat(vs('S'),",").concat(v('L'),",1)");case'planetemaths_length':return"LEN(".concat(vs('S'),")");case'planetemaths_sommechiffres':return"FNsumdigits(".concat(v('N'),")");case'planetemaths_gt':return"".concat(v('A'),"<").concat(v('B'));case'planetemaths_gte':return"".concat(v('A'),"<=").concat(v('B'));case'planetemaths_lt':return"".concat(v('A'),">").concat(v('B'));case'planetemaths_lte':return"".concat(v('A'),">=").concat(v('B'));case'planetemaths_equals':return"".concat(v('A'),"=").concat(v('B'));case'planetemaths_and':return"(".concat(v('A'),") AND (").concat(v('B'),")");case'planetemaths_or':return"(".concat(v('A'),") OR (").concat(v('B'),")");case'planetemaths_not':return"NOT (".concat(v('A'),")");case'planetemaths_contains':return"(INSTR(".concat(vs('A'),",").concat(vs('B'),")>0)");case'planetemaths_multiple':return"((".concat(v('A'),") MOD (").concat(v('B'),")=0)");// ---- arrays extension reporters ----
case'arrays_get':return"".concat(basName(this._basUnq(v('NAME'))),"(").concat(v('INDEX'),")");case'arrays_length':return"".concat(basName(this._basUnq(v('NAME'))),"_n");case'arrays_contains':return"FNlist_contains(".concat(basName(this._basUnq(v('NAME'))),"(),").concat(basName(this._basUnq(v('NAME'))),"_n,").concat(vs('VALUE'),")");default:{// Unsupported reporter — degrade to 0 with a warning, not a hard refusal.
const desc=this.decompileBlock?this.decompileBlock(b,blocks):b.opcode;warnings.push("no BASIC form for reporter \"".concat(desc,"\" \u2014 0"));return'0';}}};// ---- statements -----------------------------------------------
const pokePin=(p,on)=>{const mask=pinMask(p);const port=pinPort(p);const high=on!==!!p.activeLow;if(bbc){const a='?&'+port.toString(16).toUpperCase();return high?"".concat(a,"=").concat(a," OR ").concat(mask):"".concat(a,"=").concat(a," AND ").concat(255-mask);}return high?"POKE ".concat(port,",PEEK(").concat(port,") OR ").concat(mask):"POKE ".concat(port,",PEEK(").concat(port,") AND ").concat(255-mask);};const basChain=(id,blocks)=>{let b=blocks[id];while(b){// Save/restore means a control block's TAIL lines (NEXT,
// UNTIL, ENDWHILE) emitted after the nested basChain returns
// still map to the CONTROL block, not to the last statement
// inside it — each nested iteration restores its caller's id.
const saved=curBlockId;curBlockId=id;basStmt(b,blocks);curBlockId=saved;id=b.next;b=blocks[id];}};const basStmt=(b,blocks)=>{const v=k2=>basVal(b.inputs[k2],blocks);const vs=k2=>basValStr(b.inputs[k2],blocks);const f=k2=>b.fields[k2]?b.fields[k2][0]:'';switch(b.opcode){case'data_setvariableto':emit("".concat(basVarRef(f('VARIABLE')),"=").concat(v('VALUE')));return;case'data_changevariableby':{const n=basVarRef(f('VARIABLE'));emit("".concat(n,"=").concat(n,"+").concat(v('VALUE')));return;}// ---- looks ----
case'looks_say':emit("PRINT ".concat(vs('MESSAGE')));return;case'looks_sayforsecs':{emit("PRINT ".concat(vs('MESSAGE')));if(bbc){emit("time_target=TIME+".concat(v('SECS'),"*100"));emit('REPEAT UNTIL TIME>=time_target');}return;}case'looks_think':emit("PRINT ".concat(vs('MESSAGE')));return;case'looks_thinkforsecs':{emit("PRINT ".concat(vs('MESSAGE')));if(bbc){emit("time_target=TIME+".concat(v('SECS'),"*100"));emit('REPEAT UNTIL TIME>=time_target');}return;}case'looks_show':emit('REM show');return;case'looks_hide':emit('REM hide');return;case'looks_switchcostumeto':emit("REM switch costume to ".concat(vs('COSTUME')));return;case'looks_nextcostume':emit('REM next costume');return;case'looks_setsizeto':emit("REM set size to ".concat(v('SIZE')));return;case'looks_changesizeby':emit("REM change size by ".concat(v('CHANGE')));return;case'looks_seteffectto':emit("REM set ".concat(f('EFFECT')," effect to ").concat(v('VALUE')));return;case'looks_changeeffectby':emit("REM change ".concat(f('EFFECT')," effect by ").concat(v('CHANGE')));return;// ---- sensing ----
case'sensing_askandwait':{basUses.answer=true;emit("PRINT ".concat(vs('QUESTION')));emit('INPUT answer$');return;}case'sensing_resettimer':basUses.timer=true;emit('TIME=0');return;// ---- sound (REM stubs) ----
case'sound_play':emit("REM play sound ".concat(vs('SOUND_MENU')));return;case'sound_playuntildone':emit("REM play sound ".concat(vs('SOUND_MENU')," until done"));return;case'sound_stopallsounds':emit('REM stop all sounds');return;case'sound_setvolumeto':emit("REM set volume to ".concat(v('VOLUME')));return;case'sound_changevolumeby':emit("REM change volume by ".concat(v('VOLUME')));return;// ---- pen (VDU path for BBC BASIC) ----
case'pen_clear':basUses.pen=true;emit('CLG');return;case'pen_penDown':basUses.pen=true;emit('bw_pen%=TRUE');return;case'pen_penUp':basUses.pen=true;emit('bw_pen%=FALSE');return;case'pen_setPenColorToColor':{basUses.pen=true;emit("PROCpen_colour(".concat(v('COLOR'),")"));return;}case'pen_setPenSizeTo':basUses.pen=true;emit("REM set pen size to ".concat(v('SIZE')));return;case'pen_changePenSizeBy':basUses.pen=true;emit("REM change pen size by ".concat(v('SIZE')));return;case'pen_stamp':basUses.pen=true;emit('REM stamp');return;case'pen_changePenColorParamBy':emit("REM change pen ".concat(f('COLOR_PARAM')," by ").concat(v('VALUE')));return;case'pen_setPenColorParamTo':emit("REM set pen ".concat(f('COLOR_PARAM')," to ").concat(v('VALUE')));return;// ---- motion (tracked x/y + pen integration) ----
case'motion_gotoxy':{basUses.motionXY=true;emit("bw_x%=".concat(v('X'),":bw_y%=").concat(v('Y')));emit('IF bw_pen% THEN DRAW bw_x%*4+640,bw_y%*4+512 ELSE MOVE bw_x%*4+640,bw_y%*4+512');return;}case'motion_glidesecstoxy':{basUses.motionXY=true;emit("bw_x%=".concat(v('X'),":bw_y%=").concat(v('Y')));emit('IF bw_pen% THEN DRAW bw_x%*4+640,bw_y%*4+512 ELSE MOVE bw_x%*4+640,bw_y%*4+512');if(bbc){emit("time_target=TIME+".concat(v('SECS'),"*100"));emit('REPEAT UNTIL TIME>=time_target');}return;}case'motion_movesteps':{basUses.motionXY=true;const s=v('STEPS');emit("bw_x%=bw_x%+INT(".concat(s,"*SIN(RAD(bw_dir%)))"));emit("bw_y%=bw_y%+INT(".concat(s,"*COS(RAD(bw_dir%)))"));emit('IF bw_pen% THEN DRAW bw_x%*4+640,bw_y%*4+512 ELSE MOVE bw_x%*4+640,bw_y%*4+512');return;}case'motion_changexby':basUses.motionXY=true;emit("bw_x%=bw_x%+".concat(v('DX')));emit('IF bw_pen% THEN DRAW bw_x%*4+640,bw_y%*4+512 ELSE MOVE bw_x%*4+640,bw_y%*4+512');return;case'motion_changeyby':basUses.motionXY=true;emit("bw_y%=bw_y%+".concat(v('DY')));emit('IF bw_pen% THEN DRAW bw_x%*4+640,bw_y%*4+512 ELSE MOVE bw_x%*4+640,bw_y%*4+512');return;case'motion_setx':basUses.motionXY=true;emit("bw_x%=".concat(v('X')));emit('IF bw_pen% THEN DRAW bw_x%*4+640,bw_y%*4+512 ELSE MOVE bw_x%*4+640,bw_y%*4+512');return;case'motion_sety':basUses.motionXY=true;emit("bw_y%=".concat(v('Y')));emit('IF bw_pen% THEN DRAW bw_x%*4+640,bw_y%*4+512 ELSE MOVE bw_x%*4+640,bw_y%*4+512');return;case'motion_turnright':basUses.motionXY=true;emit("bw_dir%=(bw_dir%+".concat(v('DEGREES'),") MOD 360"));return;case'motion_turnleft':basUses.motionXY=true;emit("bw_dir%=(bw_dir%-".concat(v('DEGREES'),"+360) MOD 360"));return;case'motion_pointindirection':basUses.motionXY=true;emit("bw_dir%=".concat(v('DIRECTION')));return;// ---- events (broadcasts as REM stubs) ----
case'event_broadcast':emit("REM broadcast ".concat(vs('BROADCAST_INPUT')));return;case'event_broadcastandwait':emit("REM broadcast ".concat(vs('BROADCAST_INPUT')," and wait"));return;// ---- control (clones as REM stubs) ----
case'control_create_clone_of':emit("REM create clone of ".concat(vs('CLONE_OPTION')));return;case'control_delete_this_clone':emit('REM delete this clone');return;case'control_stop':{const opt=f('STOP_OPTION');if(opt==='this script'){emit('ENDPROC');return;}emit('END');return;}// ---- data (monitor visibility — REM stubs) ----
case'data_showvariable':emit("REM show variable ".concat(f('VARIABLE')));return;case'data_hidevariable':emit("REM hide variable ".concat(f('VARIABLE')));return;case'data_showlist':emit("REM show list ".concat(f('LIST')));return;case'data_hidelist':emit("REM hide list ".concat(f('LIST')));return;// ---- list operations ----
case'data_addtolist':{const lm=listMeta(f('LIST'));emit("".concat(lm.lenVar,"=").concat(lm.lenVar,"+1"));emit("".concat(lm.baseName,"(").concat(lm.lenVar,")=").concat(vs('ITEM')));return;}case'data_deleteoflist':{const lm=listMeta(f('LIST'));emit("PROClist_del(".concat(lm.baseName,"(),").concat(lm.lenVar,",").concat(v('INDEX'),")"));emit("".concat(lm.lenVar,"=").concat(lm.lenVar,"-1"));return;}case'data_deletealloflist':{const lm=listMeta(f('LIST'));emit("".concat(lm.lenVar,"=0"));return;}case'data_insertatlist':{const lm=listMeta(f('LIST'));emit("PROClist_ins(".concat(lm.baseName,"(),").concat(lm.lenVar,",").concat(v('INDEX'),",").concat(vs('ITEM'),")"));emit("".concat(lm.lenVar,"=").concat(lm.lenVar,"+1"));return;}case'data_replaceitemoflist':{const lm=listMeta(f('LIST'));emit("".concat(lm.baseName,"(").concat(v('INDEX'),")=").concat(vs('ITEM')));return;}// ---- arrays extension ----
case'arrays_create1D':{const an=basName(this._basUnq(v('NAME')));emit("DIM ".concat(an,"(200)"));emit("".concat(an,"_n=0"));return;}case'arrays_createEmpty':{const an=basName(this._basUnq(v('NAME')));emit("DIM ".concat(an,"(200)"));emit("".concat(an,"_n=0"));return;}case'arrays_push':{const an=basName(this._basUnq(v('NAME')));emit("".concat(an,"_n=").concat(an,"_n+1"));emit("".concat(an,"(").concat(an,"_n)=").concat(vs('VALUE')));return;}case'arrays_set':{const an=basName(this._basUnq(v('NAME')));emit("".concat(an,"(").concat(v('INDEX'),")=").concat(vs('VALUE')));return;}case'arrays_remove':{const an=basName(this._basUnq(v('NAME')));emit("PROClist_del(".concat(an,"(),").concat(an,"_n,").concat(v('INDEX'),")"));emit("".concat(an,"_n=").concat(an,"_n-1"));return;}case'arrays_delete':{const an=basName(this._basUnq(v('NAME')));emit("".concat(an,"_n=0"));return;}case'arrays_insert':{const an=basName(this._basUnq(v('NAME')));emit("PROClist_ins(".concat(an,"(),").concat(an,"_n,").concat(v('INDEX'),",").concat(vs('VALUE'),")"));emit("".concat(an,"_n=").concat(an,"_n+1"));return;}// ---- hardware pin operations ----
case'stc12_setpin':{if(!pokeable){emit("REM turn ".concat(f('STATE')," ").concat(f('PIN')));return;}const p=pins.get(String(f('PIN')).toLowerCase());if(!p){warnings.push("undeclared pin \"".concat(f('PIN'),"\""));return;}const st=f('STATE');const on=st==='on'||st==='high'?st==='high'?!p.activeLow:true:st==='low'?!!p.activeLow:false;emit(pokePin(p,on));return;}case'stc12_toggle':{if(!pokeable){emit("REM toggle ".concat(f('PIN')));return;}const p=pins.get(String(f('PIN')).toLowerCase());if(!p){warnings.push("undeclared pin \"".concat(f('PIN'),"\""));return;}const mask=pinMask(p);const port=pinPort(p);if(bbc){const a='?&'+port.toString(16).toUpperCase();emit("".concat(a,"=").concat(a," EOR ").concat(mask));}else emit("POKE ".concat(port,",PEEK(").concat(port,")+").concat(mask,"-2*(PEEK(").concat(port,") AND ").concat(mask,")"));return;}case'stc12_print':{const mode=f('MODE');if(mode==='text'){emit("PRINT \"".concat(String(this.dval(b.inputs.VALUE,blocks)).replace(/^"|"$/g,'').replace(/"/g,''),"\""));}else emit("PRINT ".concat(v('VALUE')));return;}case'control_wait':{if(bbc){emit("time_target=TIME+".concat(v('DURATION'),"*100"));emit('REPEAT UNTIL TIME>=time_target');}else{emit('REM delay: calibrate DC for the machine (units per second)');emit("FOR TD=1 TO ".concat(v('DURATION'),"*DC:NEXT TD"));this._basNeedsDC=true;}return;}case'control_forever':{if(structured){emit('REPEAT');depth++;basChain(b.inputs.SUBSTACK?b.inputs.SUBSTACK[1]:null,blocks);depth--;emit('UNTIL FALSE');return;}const top=newLabel();emitLabel(top);basChain(b.inputs.SUBSTACK?b.inputs.SUBSTACK[1]:null,blocks);emit("GOTO ".concat(top));return;}case'control_repeat':{const i=basName("loop".concat(this._basLoopSeq++));emit("FOR ".concat(i,"=1 TO ").concat(v('TIMES')));depth++;basChain(b.inputs.SUBSTACK?b.inputs.SUBSTACK[1]:null,blocks);depth--;emit("NEXT ".concat(i));return;}case'control_repeat_until':{if(structured){emit("WHILE NOT (".concat(basVal(b.inputs.CONDITION,blocks),")"));depth++;basChain(b.inputs.SUBSTACK?b.inputs.SUBSTACK[1]:null,blocks);depth--;emit('ENDWHILE');return;}const top=newLabel();const after=newLabel();emitLabel(top);emit("IF ".concat(basVal(b.inputs.CONDITION,blocks)," THEN GOTO ").concat(after));basChain(b.inputs.SUBSTACK?b.inputs.SUBSTACK[1]:null,blocks);emit("GOTO ".concat(top));emitLabel(after);return;}case'control_wait_until':{if(structured){emit("REPEAT UNTIL ".concat(basVal(b.inputs.CONDITION,blocks)));return;}const top=newLabel();emitLabel(top);emit("IF NOT (".concat(basVal(b.inputs.CONDITION,blocks),") THEN GOTO ").concat(top));return;}case'control_if':{if(structured){emit("IF ".concat(basVal(b.inputs.CONDITION,blocks)," THEN"));depth++;basChain(b.inputs.SUBSTACK?b.inputs.SUBSTACK[1]:null,blocks);depth--;emit('ENDIF');return;}const after=newLabel();emit("IF NOT (".concat(basVal(b.inputs.CONDITION,blocks),") THEN GOTO ").concat(after));basChain(b.inputs.SUBSTACK?b.inputs.SUBSTACK[1]:null,blocks);emitLabel(after);return;}case'control_if_else':{if(structured){emit("IF ".concat(basVal(b.inputs.CONDITION,blocks)," THEN"));depth++;basChain(b.inputs.SUBSTACK?b.inputs.SUBSTACK[1]:null,blocks);depth--;emit('ELSE');depth++;basChain(b.inputs.SUBSTACK2?b.inputs.SUBSTACK2[1]:null,blocks);depth--;emit('ENDIF');return;}const elseL=newLabel();const after=newLabel();emit("IF NOT (".concat(basVal(b.inputs.CONDITION,blocks),") THEN GOTO ").concat(elseL));basChain(b.inputs.SUBSTACK?b.inputs.SUBSTACK[1]:null,blocks);emit("GOTO ".concat(after));emitLabel(elseL);basChain(b.inputs.SUBSTACK2?b.inputs.SUBSTACK2[1]:null,blocks);emitLabel(after);return;}case'procedures_call':{if(!bbc){reasons.push('MS BASIC 1.1 has no named procedures — custom blocks need the bbc profile');return;}const proc=basName('proc:'+this.pyProcRaw(b.mutation.proccode));const args=JSON.parse(b.mutation.argumentids||'[]').map(aid=>basVal(b.inputs[aid],blocks));emit("PROC".concat(proc).concat(args.length?"(".concat(args.join(','),")"):''));return;}default:{// Unsupported statement — REM stub that still RUNs.
const desc=this.decompileBlock?this.decompileBlock(b,blocks):b.opcode;warnings.push("no BASIC form for \"".concat(desc,"\" \u2014 emitted as REM"));emit("REM ".concat(b.opcode));}}};// ---- collect scripts -------------------------------------------
const targets=project.targets||[];const scripts=[];const procs=[];const otherHats=[];for(const t of targets){const blocks=t.blocks||{};for(const b of Object.values(blocks)){if(!b.topLevel)continue;if(b.opcode==='event_whenflagclicked')scripts.push({b,blocks});else if(b.opcode==='procedures_definition')procs.push({b,blocks});else if(this.isHat(b.opcode))otherHats.push({b,blocks});}}// Multi-WHEN flag scripts: BASIC is single-threaded, so we
// serialize them sequentially with a REM warning. True concurrency
// (event_whenkeypressed, broadcast-receives, clone starts) cannot
// be serialized — emit REM stubs for those.
if(scripts.length>1){warnings.push("".concat(scripts.length," WHEN flag scripts serialized \u2014 BASIC is single-threaded; concurrent semantics lost"));}for(const h of otherHats){warnings.push("\"".concat(h.b.opcode,"\" script emitted as REM \u2014 BASIC is single-threaded"));}if(!scripts.length&&!otherHats.length)reasons.push('no "when flag clicked" script — nothing to run');if(reasons.length)return{ok:false,reasons:[...new Set(reasons)],warnings};// ---- header + pin setup ----------------------------------------
emit("REM generated by Brickwright (".concat(profile.toUpperCase()," BASIC profile)"));if(stc.device)emit("REM @bw device ".concat(stc.device));for(const p of pins.values())emit("REM @bw pin ".concat(p.name," ").concat(p.where||"P".concat(p.port,".").concat(p.bit)," ").concat(p.direction).concat(p.activeLow?' active-low':''));if(pokeable){const ddr={a:0,b:0};for(const p of pins.values()){if(p.direction==='output')ddr[/^PB/i.test(p.where)?'b':'a']|=pinMask(p);}if(ddr.a)emit(bbc?"?&".concat((viaAt+3).toString(16).toUpperCase(),"=").concat(ddr.a):"POKE ".concat(viaAt+3,",").concat(ddr.a));if(ddr.b)emit(bbc?"?&".concat((viaAt+2).toString(16).toUpperCase(),"=").concat(ddr.b):"POKE ".concat(viaAt+2,",").concat(ddr.b));}if(bbc&&!pokeable&&!stc.device){// Pure Scratch programs get a graphics mode for pen art.
emit('MODE 1');}this._basNeedsDC=false;const headerEnd=outLines.length;// ---- main + procedures -----------------------------------------
// Serialize all when-flag-clicked scripts sequentially.
for(let si=0;si<scripts.length;si++){if(si>0)emit("REM --- script ".concat(si+1," ---"));basChain(scripts[si].b.next,scripts[si].blocks);}// Other hats: emit bodies as REM-commented blocks.
for(const h of otherHats){const hatDesc=h.b.opcode.replace(/^event_/,'').replace(/^control_/,'');emit("REM --- ".concat(hatDesc," (single-threaded: runs after main) ---"));basChain(h.b.next,h.blocks);}emit('END');for(const{b,blocks}of procs){if(!bbc){reasons.push('MS BASIC 1.1 has no named procedures — custom blocks need the bbc profile');break;}const proto=blocks[b.inputs.custom_block[1]];const m=proto.mutation;const argNames=JSON.parse(m.argumentnames||'[]').map(n=>basName(n));const pn=basName('proc:'+this.pyProcRaw(m.proccode));emit("DEF PROC".concat(pn).concat(argNames.length?"(".concat(argNames.join(','),")"):''));basChain(b.next,blocks);emit('ENDPROC');}// ---- on-demand shim procedures (emitted after END) ----
if(bbc){// List helpers: insert, delete, contains, index-of.
if(basUses.lists.size){emit('DEF PROClist_del(a(),BYREF n%,i%)');emit('LOCAL j%:FOR j%=i% TO n%-1:a(j%)=a(j%+1):NEXT j%');emit('ENDPROC');emit('DEF PROClist_ins(a(),BYREF n%,i%,v)');emit('LOCAL j%:FOR j%=n% TO i% STEP -1:a(j%+1)=a(j%):NEXT j%:a(i%)=v');emit('ENDPROC');emit('DEF FNlist_contains(a(),n%,v)');emit('LOCAL j%:FOR j%=1 TO n%:IF a(j%)=v THEN =TRUE');emit('NEXT j%:=FALSE');emit('DEF FNlist_indexof(a(),n%,v)');emit('LOCAL j%:FOR j%=1 TO n%:IF a(j%)=v THEN =j%');emit('NEXT j%:=0');}// Pen colour: Scratch colour number (0-based hue) to BBC GCOL.
if(basUses.pen){emit('DEF PROCpen_colour(c%)');emit('GCOL 0,(c% MOD 8)+1');emit('ENDPROC');}// Planète Maths helpers.
if(names.has('FNfact')){// Not checking — emitting all potential helpers is cheap and safe.
}}// Always-needed math helpers (emitted if referenced by the walk).
const needsFact=outLines.some(l=>typeof l==='string'&&l.includes('FNfact('));const needsMin=outLines.some(l=>typeof l==='string'&&l.includes('FNmin('));const needsMax=outLines.some(l=>typeof l==='string'&&l.includes('FNmax('));const needsSumDigits=outLines.some(l=>typeof l==='string'&&l.includes('FNsumdigits('));if(bbc&&needsFact){emit('DEF FNfact(n%):IF n%<=1 THEN =1 ELSE =n%*FNfact(n%-1)');}if(bbc&&needsMin){emit('DEF FNmin(a,b):IF a<b THEN =a ELSE =b');}if(bbc&&needsMax){emit('DEF FNmax(a,b):IF a>b THEN =a ELSE =b');}if(bbc&&needsSumDigits){emit('DEF FNsumdigits(n%):LOCAL s%,a%:a%=ABS(n%):s%=0:WHILE a%>0:s%=s%+a% MOD 10:a%=a% DIV 10:ENDWHILE:=s%');}// Post-body splices at the header seam.
const seam=[];if(!bbc)for(const[raw,nm]of names)seam.push("REM ".concat(nm," = ").concat(raw.replace(/^proc:/,'')));if(this._basNeedsDC)seam.push('DC=1000:REM delay units/second - CALIBRATE');// List DIM declarations at top.
for(const[,lm]of basUses.lists){seam.push("DIM ".concat(lm.baseName,"(200)"));seam.push("".concat(lm.lenVar,"=0"));}// Motion init.
if(basUses.motionXY){seam.push('bw_x%=0:bw_y%=0:bw_dir%=90:bw_pen%=FALSE');}outLines.splice(headerEnd,0,...seam);lineBlocks.splice(headerEnd,0,...seam.map(()=>null));if(reasons.length)return{ok:false,reasons:[...new Set(reasons)],warnings};// ---- number the lines, resolve labels --------------------------
// lineMap: emitted-line key → Scratch block id (only lines a block
// owns appear). Numbered mode keys by the BASIC line number — the
// token TRACE prints — structured mode by 1-based output line.
if(structured){const kept=[];const lineMap={};for(let i=0;i<outLines.length;i++){if(typeof outLines[i]!=='string')continue;kept.push(outLines[i]);if(lineBlocks[i])lineMap[kept.length]=lineBlocks[i];}const basic=kept.join('\n')+'\n';return{ok:true,basic,lineMap,reasons:[],warnings};}const lineNo=new Map();let n=10;const numberedOut=[];const lineMap={};for(let i=0;i<outLines.length;i++){const l=outLines[i];if(typeof l==='object'&&l.label){lineNo.set(l.label,n);continue;}numberedOut.push({n,text:l});if(lineBlocks[i])lineMap[n]=lineBlocks[i];n+=10;}const resolve=text=>text.replace(/@L\d+@/g,m=>{var _lineNo$get;return String((_lineNo$get=lineNo.get(m))!==null&&_lineNo$get!==void 0?_lineNo$get:n);});const basic=numberedOut.map(l=>"".concat(l.n," ").concat(resolve(l.text))).join('\n')+'\n';return{ok:true,basic,lineMap,reasons:[],warnings};}// INKEY code lookup for BBC BASIC key detection.
_basInkeyCode(key){const map={space:99,'left arrow':25,'right arrow':121,'up arrow':57,'down arrow':41,a:65,b:100,c:82,d:50,e:34,f:67,g:83,h:84,i:37,j:69,k:70,l:86,m:101,n:85,o:54,p:55,q:16,r:51,s:81,t:35,u:53,v:99,w:33,x:66,y:68,z:97,'0':39,'1':48,'2':49,'3':17,'4':18,'5':19,'6':52,'7':36,'8':21,'9':38,'any':0};return map[String(key).toLowerCase()]||0;}// Helper: strip quotes from a BASIC array name reference.
_basUnq(s){return String(s).replace(/^"|"$/g,'');}generateC(){let project=arguments.length>0&&arguments[0]!==undefined?arguments[0]:this.project;let opts=arguments.length>1&&arguments[1]!==undefined?arguments[1]:{};// Which C? The project decides. Declared pins mean the chip and bare
// metal; anything else is a Scratch program, and emitting 8051 register
// writes for it produced the 390 "no C equivalent" warnings this split
// exists to end. `opts.target` overrides for the rare case of wanting
// the other one on purpose.
const stc=project&&project.stc;const hasPins=!!(stc&&stc.pins&&stc.pins.length);// A PART or PORT declaration means the chip exactly as a PIN does — a
// PART-only program (the 74HC595 chaser) must not fall to host C.
const hasHardware=hasPins||!!(stc&&stc.ledcube)||!!(stc&&stc.parts&&stc.parts.length)||!!(stc&&stc.ports&&stc.ports.length);const want=opts.target||(hasHardware?'device':'host');if(want==='host')return this.generateHostC(project,opts);this._cNames=new Map();this._cCounter=0;this._cWarnings=[];this._cUses={adc:false,delay:false,blockDelay:false,now:false};this._emitComments=!(opts&&opts.comments===false);const targets=project.targets||[];this._buildCodeComments(targets);const stored=project.stc||{};const device=String(opts.device||stored.device||'stc12c5a60s2').toLowerCase();const part=SB3Creator.STC_PARTS[device];const clock=Number(opts.clock||stored.clock||(part&&part.core==='arduino'?16000000:part&&part.core==='rp2040'?125000000:part&&part.core==='w65c02'?1000000:11059200));const pins=opts.pins||stored.pins||[];if(!part)this.cWarn("unknown DEVICE \"".concat(device,"\" \u2014 emitting for stc12c5a60s2"));// Which core? '8051' emits SFR bare metal; 'arduino' emits AVR bare
// metal (avr/io.h — the same silicon avr8js executes; NOT the Arduino
// core runtime). MicroPython boards still refuse: the program IS the
// artefact there. The scheduler, state machines and @bw yield map are
// core-neutral by construction, so the debugger contract carries over
// to the AVR unchanged.
this._core=part&&part.core==='arduino'?'avr':part&&part.core==='rp2040'?'arm':part&&part.core==='w65c02'?'6502':part&&part.core==='z80'?'z80':'8051';this._cMega=!!(part&&part.mega);this._cTiny88=!!(part&&part.tiny88);if(part&&part.core&&part.core!=='8051'&&part.core!=='arduino'&&part.core!=='rp2040'&&part.core!=='w65c02'&&part.core!=='z80'){const how=part.core==='micropython'?'runs MicroPython, where the program IS the artefact and there is nothing to compile':'has numbered pins and no 8051 registers';this.cWarn("DEVICE ".concat(device.toUpperCase()," ").concat(how," \u2014 ")+'this back end emits bare-metal 8051 only. The project is unchanged; '+'build it with stc-compiler, which has a target for this board.');return"/* No C emitted for DEVICE ".concat(device.toUpperCase(),".\n")+' *\n'+' * This back end emits bare-metal 8051. An Arduino board has numbered\n'+' * pins (D13, A0) and none of the registers this emitter writes, so\n'+' * there is nothing here it could correctly produce.\n'+' *\n'+' * The pseudocode form of this project IS portable: stc-compiler\n'+' * builds it for the Arduino targets.\n'+' */\n';}const chip=part||SB3Creator.STC_PARTS.stc12c5a60s2;this._cPins=new Map(pins.map(p=>[String(p.name).toLowerCase(),p]));const stage=targets.find(t=>t.isStage);// Same section rule as the Python/JS back ends, so sprite prefixes line up.
const sections=targets.filter(t=>!t.isStage||Object.values(t.blocks||{}).some(b=>b.topLevel));// Pass 1 — count scripts that become tasks. Several means the cooperative
// scheduler; exactly one `when green flag clicked` keeps straight-line code in
// main(). A `when X pressed` hat ALWAYS forces the scheduler — there is no
// straight-line form of something that has to be sampled.
let scriptCount=0;let hasEventHat=false;for(const t of sections){for(const b of Object.values(t.blocks||{})){if(!b.topLevel)continue;if(b.opcode==='event_whenflagclicked')scriptCount++;if(b.opcode==='stc12_whenpin'){const pn=b.fields.PIN?b.fields.PIN[0]:'';const pc=this._cPins&&this._cPins.get(pn.toLowerCase());if(pc&&pc.direction==='input'){scriptCount++;hasEventHat=true;}}if(['devices_whenabove','devices_whencloser','devices_whenmotion','devices_whentilted'].includes(b.opcode)){scriptCount++;hasEventHat=true;}}}// `{debug: true}` forces the scheduler even for one script. Straight-line code in
// main() has no `<task>_state`, so it has no Level 1 position — and a debugger that
// cannot say where it is in the commonest beginner project (a single WHEN) is not
// worth having. The cooperative form costs the Timer-0 ISR and a dispatch loop and
// changes nothing semantically: a lone task that yields simply re-enters at once.
// Release builds are untouched. See reference/debugger-ui.md §7.
// Event hats always force the scheduler — a polled task has no straight-line form.
const debug=!!(opts&&opts.debug);this._cTasks=scriptCount>1||hasEventHat||scriptCount>0&&debug;const taskNames=Array.from({length:scriptCount},(_,n)=>"bw_task".concat(n));const yieldMap=[];// only emitted for a debug build — see the marker header below
// Pass 2 — declare state. Names are claimed here so a custom block's parameter can
// never quietly take a variable's identifier.
const stateDecls=[];const markVars=[],markProcs=[],markScripts=[];for(const entry of Object.values(stage&&stage.variables||{})){stateDecls.push("static long ".concat(this.cName(entry[0])," = ").concat(this.cInit(entry[1]),";"));markVars.push("var ".concat(this.cName(entry[0])," ").concat(this.pyStr(entry[0])));}sections.forEach((t,idx)=>{if(t.isStage)return;const pfx=(0,_sb3_creator_scratchruntime_js__WEBPACK_IMPORTED_MODULE_2__.spritePrefix)(idx);for(const entry of Object.values(t.variables||{})){stateDecls.push("static long ".concat(this.cName(pfx+entry[0])," = ").concat(this.cInit(entry[1]),";   /* ").concat(this.cComment(t.name),": ").concat(this.cComment(entry[0])," */"));markVars.push("var ".concat(this.cName(pfx+entry[0])," ").concat(this.pyStr(entry[0])," sprite ").concat(this.pyStr(t.name)));}});// Pass 3 — walk the scripts.
const procProtos=[],procDefs=[],taskDefs=[];const statics=[];let mainBody=[];let mainNote=[];// a comment on the single script's hat
let taskIndex=0;sections.forEach((t,idx)=>{const pfx=(0,_sb3_creator_scratchruntime_js__WEBPACK_IMPORTED_MODULE_2__.spritePrefix)(idx);this._curPrefix=pfx;this._curLocals=t.isStage?new Set():new Set([...Object.values(t.variables||{}).map(v=>v[0]),...Object.values(t.lists||{}).map(l=>l[0])]);const blocks=t.blocks||{};for(const[topId,b]of Object.entries(blocks)){if(!b||!b.topLevel)continue;if(b.opcode==='procedures_definition'){const proto=blocks[b.inputs.custom_block[1]];const m=proto.mutation;const argNames=JSON.parse(m.argumentnames||'[]').map(a=>this.cName(a));const fn=this.cName(pfx+this.pyProcRaw(m.proccode));const params=argNames.length?argNames.map(a=>"long ".concat(a)).join(', '):'void';procProtos.push("static void ".concat(fn,"(").concat(params,");"));markProcs.push("proc ".concat(fn," ").concat(this.pyStr(m.proccode)," warp=").concat(m.warp==='true'?1:0));procDefs.push("/* ".concat(this.cComment(m.proccode.replace(/%[sb]/g,'').trim())," */"),"static void ".concat(fn,"(").concat(params,")"),'{',...this.cStackFrom(b.next,blocks,1),'}','');}else if(b.opcode==='event_whenflagclicked'){const n=taskIndex++;const task=taskNames[n];const where=t.isStage?'':", ".concat(this.cComment(t.name));// A comment on the hat belongs to the script. The host target
// carries it; this one was dropping it, which is the only thing
// that stopped a device round trip from being a fixed point.
const hatNote=this.codeCommentLines(topId,'','//');markScripts.push("script ".concat(this._cTasks?task:'main'," ").concat(n)+(t.isStage?' stage':" sprite ".concat(this.pyStr(t.name))));if(!this._cTasks){mainNote=hatNote;mainBody=this.cStackFrom(b.next,blocks,1);continue;}// State 0 is `case 0:` — the task has not started, so the block to point
// at is the hat itself. That is what Scratch shows for a script that has
// not run, and it means the map covers every reachable state.
const ctx={task,state:0,statics,tasks:taskNames,yields:debug?yieldMap:[]};if(debug)yieldMap.push({task,state:0,block:topId,kind:'hat'});const body=this.cTaskFrom(b.next,blocks,1,ctx);taskDefs.push("static ".concat(this._core!=='8051'?'volatile ':'',"unsigned int ").concat(task,"_state;"));if(this.cHasWait(b.next,blocks))taskDefs.push("static ".concat(this._core!=='8051'?'volatile ':'',"unsigned int ").concat(task,"_until;"));taskDefs.push(...hatNote,"/* when green flag clicked (script ".concat(n+1).concat(where,") */"),"static void ".concat(task,"(void)"),'{',"    switch (".concat(task,"_state) {"),'    case 0:',...body,'    }',"    ".concat(task,"_state = 0xFFFF;   /* ran to the end */"),'}','');}else if(b.opcode==='stc12_whenpin'){const pinName=b.fields.PIN?b.fields.PIN[0]:'';const edge=b.fields.EDGE?b.fields.EDGE[0]:'pressed';const pin=this._cPins&&this._cPins.get(pinName.toLowerCase());if(!pin){this.cWarn("\"when ".concat(pinName," ").concat(edge,"\" \u2014 undeclared pin; script skipped"));}else if(pin.direction!=='input'){this.cWarn("\"when ".concat(pinName," ").concat(edge,"\" \u2014 ").concat(pinName," is ").concat(pin.direction.toUpperCase(),", not INPUT; script skipped"));}else{const n=taskIndex++;const task=taskNames[n];const where=t.isStage?'':", ".concat(this.cComment(t.name));const hatNote=this.codeCommentLines(topId,'','//');markScripts.push("script ".concat(task," ").concat(n)+(t.isStage?' stage':" sprite ".concat(this.pyStr(t.name))));const ctx={task,state:0,statics,tasks:taskNames,yields:debug?yieldMap:[]};if(debug)yieldMap.push({task,state:0,block:topId,kind:'hat'});// Body starts at case 1 — case 0 is the edge test.
ctx.state=1;const body=this.cTaskFrom(b.next,blocks,1,ctx);// The polarity-aware LOGICAL level — same rule as cPinRead: ACTIVE
// LOW means pressed = pin low, so `!Px_y` reads as 1 when pressed.
const sfr="P".concat(pin.port,"_").concat(pin.bit);const level=pin.activeLow?"!".concat(sfr):sfr;const test=edge==='pressed'?"now && !".concat(task,"_prev"):"!now && ".concat(task,"_prev");taskDefs.push("static ".concat(this._core!=='8051'?'volatile ':'',"unsigned int ").concat(task,"_state;"));if(this.cHasWait(b.next,blocks))taskDefs.push("static ".concat(this._core!=='8051'?'volatile ':'',"unsigned int ").concat(task,"_until;"));taskDefs.push("static unsigned char ".concat(task,"_prev;"));taskDefs.push(...hatNote,"/* WHEN ".concat(this.cComment(pinName)," ").concat(edge,": (script ").concat(n+1).concat(where,")"),' *'," * Polled once per dispatch and EDGE-triggered: `_prev` is updated on every"," * pass, so a held button runs the body once rather than every millisecond,"," * and a release during the body does not queue a second run. The level read"," * is the LOGICAL one, so an ACTIVE LOW button reads as pressed when the pin"," * is low. */","static void ".concat(task,"(void)"),'{',"    unsigned char now   = (".concat(level,") ? 1 : 0;"),"    unsigned char fired = (".concat(test,") ? 1 : 0;"),"    ".concat(task,"_prev = now;"),'',"    switch (".concat(task,"_state) {"),'    case 0:','        if (!fired)','            return;',"        ".concat(task,"_state = 1;"),'    case 1:',...body,'    }',"    ".concat(task,"_state = 0;   /* ready for the next edge */"),'}','');}}else if(b.opcode==='devices_whenabove'||b.opcode==='devices_whencloser'||b.opcode==='devices_whenmotion'||b.opcode==='devices_whentilted'){// Device event hats: polled tasks with edge detection.
// Same pattern as stc12_whenpin, but poll a sensor reading.
const n=taskIndex++;const task=taskNames[n];const where=t.isStage?'':", ".concat(this.cComment(t.name));const hatNote=this.codeCommentLines(topId,'','//');markScripts.push("script ".concat(task," ").concat(n)+(t.isStage?' stage':" sprite ".concat(this.pyStr(t.name))));const ctx={task,state:0,statics,tasks:taskNames,yields:debug?yieldMap:[]};if(debug)yieldMap.push({task,state:0,block:topId,kind:'hat'});ctx.state=1;const body=this.cTaskFrom(b.next,blocks,1,ctx);let condExpr;switch(b.opcode){case'devices_whenabove':{this._cUses.devices=true;this._cUses.sensor=true;this._cUses.adc=true;const sv=this.cVal(b.inputs.SENSOR,blocks);const tv=this.cVal(b.inputs.THRESHOLD,blocks);condExpr="(bw_temperature(".concat(sv,") > ").concat(tv,")");break;}case'devices_whencloser':{this._cUses.devices=true;this._cUses.ultrasonic=true;const sv=this.cVal(b.inputs.SENSOR,blocks);const dv=this.cVal(b.inputs.DISTANCE,blocks);condExpr="(bw_distance(".concat(sv,") < ").concat(dv,")");break;}case'devices_whenmotion':{this._cUses.devices=true;this._cUses.button=true;const sv=this.cVal(b.inputs.SENSOR,blocks);condExpr="bw_motion(".concat(sv,")");break;}case'devices_whentilted':{this._cUses.devices=true;this._cUses.button=true;const sv=this.cVal(b.inputs.SENSOR,blocks);condExpr="bw_tilted(".concat(sv,")");break;}}taskDefs.push("static ".concat(this._core!=='8051'?'volatile ':'',"unsigned int ").concat(task,"_state;"));if(this.cHasWait(b.next,blocks))taskDefs.push("static ".concat(this._core!=='8051'?'volatile ':'',"unsigned int ").concat(task,"_until;"));taskDefs.push("static unsigned char ".concat(task,"_prev;"));taskDefs.push(...hatNote,"/* ".concat(this.cComment(this.decompileHat(b,blocks)||b.opcode)," (script ").concat(n+1).concat(where,") */"),"static void ".concat(task,"(void)"),'{',"    unsigned char now = ".concat(condExpr," ? 1 : 0;"),"    unsigned char fired = now && !".concat(task,"_prev;"),"    ".concat(task,"_prev = now;"),"    switch (".concat(task,"_state) {"),'    case 0:','        if (!fired)','            return;',"        ".concat(task,"_state = 1;"),'    case 1:',...body,'    }',"    ".concat(task,"_state = 0;   /* ready for the next edge */"),'}','');}else if(this.isHat(b.opcode)||this.runtimeOp(b.opcode)){this.cWarn("\"".concat(this.decompileHat(b,blocks)||b.opcode,"\" has no meaning on the chip \u2014 script skipped"));}}});this._curPrefix='';this._curLocals=null;// The cube scan kernel needs delay_ms unconditionally — it is a blocking
// per-line dwell, not a scheduler wait. Flag it so the assembly emits it
// even when the scheduler is active (which normally suppresses delay_ms
// in favour of the ISR-based bw_now/bw_block_ms).
if(this._cUses.cube)this._cUses.cubeDelay=true;if(this._cUses.adc&&!chip.adc)this.cWarn("ANALOG pins need an ADC, and the ".concat(device," has none"));// PCA: servo (16-bit compare/match) and motor (8-bit PWM) need the PCA.
// STC89 has no PCA — these blocks silently produce 0 edges (ucsim-stc
// 356df26 measured 0 edges on STC89, confirmed).  Same treatment as
// WS2812 on 12T: warn and refuse rather than silently do nothing.
if(this._core==='8051'&&this._cUses.servo&&!chip.pca){this.cWarn("servo requires PCA (compare/match) \u2014 the ".concat(device," has none; the servo will not move"));this.warn(null,"servo requires PCA \u2014 the ".concat(device," has no PCA peripheral"));}if(this._core==='8051'&&this._cUses.motor&&!chip.pca){this.cWarn("motor PWM requires PCA \u2014 the ".concat(device," has none; speed control will not work"));this.warn(null,"motor PWM requires PCA \u2014 the ".concat(device," has no PCA peripheral"));}// On the gcc cores a servo shares PWM hardware with the dimmer:
// the ATmega's Timer 1 becomes the 50 Hz servo frame (D9/D10 stop
// dimming), and the Pico's slice 0 does (GP16/GP17 stop dimming).
if(this._core==='avr'&&this._cUses.servo&&this._cUses.pwm){this.cWarn('servo takes Timer 1 for its 50 Hz frame — '+(this._cMega?'"set ... percent" on D11/D12 will not dim in this program; use D9/D10 (Timer 2)':'"set ... percent" on D9/D10 will not dim in this program; use D3/D11'));}if(this._core==='arm'&&this._cUses.servo&&this._cUses.pwm){this.cWarn('servo takes PWM slice 0 (GP16/GP17) for its 50 Hz frame — '+'do not dim on GP16/GP17 in this program');}if(this._cUses.ultrasonic&&!chip.timer1){this.cWarn("ultrasonic distance requires Timer 1 \u2014 the ".concat(device," has none"));this.warn(null,"ultrasonic distance requires Timer 1 \u2014 the ".concat(device," has none"));}// ---- resource collision check ------------------------------------------------
// Resource allocation table — drivers AND runtime:
//   Timer 0:  scheduler tick (always when _cTasks)
//   Timer 1:  ultrasonic echo timing — ALSO tethered-mode wall clock
//   BRT:      tethered-mode baud generator (10-live-firmware)
//   PCA 0:    servo (16-bit compare/match, CCP0 = P1.3)
//   PCA 1:    motor speed (8-bit PWM, CCP1 = P1.4)
//   P1.1:     ADC sensor channel 1
//   P1.3:     servo (CCP0)
//   P1.4:     motor (CCP1)
//   P2.0:     relay (active-low)
//   P3.2:     button / contact closure (INT0 pin, no ext interrupt)
//   P3.4:     motor IN1
//   P3.5:     motor IN2
//   P3.6:     ultrasonic trigger
//   P3.7:     ultrasonic echo
//
//
// Collision matrix (part-aware via STC_PARTS.ccp and .xtalAdc):
//   UNCONDITIONAL (from block list alone):
//     PCA 0+1 full: servo + motor + stc12_setpwm → no module left
//     Timer 1:      ultrasonic + tethered mode → skew corruption
//   CONFIGURATION-DEPENDENT (from per-part CCP map + pin declarations):
//     CCP0(servo) vs ANALOG on same pin — STC12:P1.3, STC15:P1.1
//     CCP1(motor) vs ANALOG on same pin — STC12:P1.4, STC15:P1.0
//     P1.5 NeoPixel vs ANALOG (ADC5) — same on all families
//     STC15 XTAL shares P1.6(ADC6)/P1.7(ADC7) — crystal costs analog
//   UNRESOLVABLE (no fix possible on this part family):
//     RGB needs 3 PWM channels, only 2 PCA modules exist
//
// Collision warnings use BW_COLLISION markers and are also pushed to
// this.warnings so they reach the UI / CLI without parsing the C.
// The matrix below names PCA modules and P1.x/P3.x pins — 8051 facts.
// The gcc cores state their own timer allocations in their driver
// emissions, so on those cores every collision here would be about
// hardware the chip does not have: the helper goes silent instead.
const collision=msg=>{if(this._core!=='8051')return;this.cWarn("BW_COLLISION: ".concat(msg));this.warn(null,msg);};// ---- Unconditional collisions (from block list alone) ----
// PCA modules: only 2 exist. Servo=0, motor=1. Both consumed = no room.
// A third PWM consumer (e.g. RGB) is unresolvable on this part family.
if(this._cUses.servo&&this._cUses.motor&&this._cUses.pwm){// User's stc12_setpwm also needs a PCA module but both are taken.
collision('both PCA modules are in use (servo=0, motor=1) — no module available for PWM pin blocks');}// Timer 1: ultrasonic vs tethered-mode wall clock.
if(this._cUses.ultrasonic&&debug){collision('Timer 1 is claimed by both the ultrasonic driver (echo timing) '+'and the tethered-mode monitor (wall clock) — distance readings will '+'corrupt the skew counter when the debugger is attached');}// ---- Configuration-dependent collisions (from per-part CCP map) ----
const ccpMap=chip.ccp||[];// Servo uses CCP module 0; check if its pin is also declared ANALOG.
if(this._cUses.servo&&ccpMap[0]){const cp=ccpMap[0];const analog=pins.find(p=>p.port===cp.port&&p.bit===cp.bit&&p.direction==='analog');if(analog)collision("P".concat(cp.port,".").concat(cp.bit," is the servo pin (CCP0) and is also declared ANALOG \u2014 the PCA output fights the ADC input"));}// Motor uses CCP module 1; check if its pin is also declared ANALOG.
if(this._cUses.motor&&ccpMap[1]){const cp=ccpMap[1];const analog=pins.find(p=>p.port===cp.port&&p.bit===cp.bit&&p.direction==='analog');if(analog)collision("P".concat(cp.port,".").concat(cp.bit," is the motor pin (CCP1) and is also declared ANALOG \u2014 the PCA output fights the ADC input"));}// P1.5 = NeoPixel data AND ADC5 (same pin on all families with P1 ADC).
if(this._cUses.neopixel){const p15analog=pins.find(p=>p.port===1&&p.bit===5&&p.direction==='analog');if(p15analog)collision('P1.5 is the NeoPixel data pin and is also declared ANALOG — bitbang output fights the ADC input');}// STC15: XTAL shares P1.6(ADC6)/P1.7(ADC7). If the user declares one
// of these as ANALOG and the board has a crystal, it will not work.
if(chip.xtalAdc){for(const ch of chip.xtalAdc){const analog=pins.find(p=>p.port===1&&p.bit===ch&&p.direction==='analog');if(analog)collision("P1.".concat(ch," (ADC").concat(ch,") is shared with the crystal oscillator on ").concat(device," \u2014 an external crystal disables this analog input"));}}// Driver-fixed pin claims.
const driverPins=[];if(this._cUses.servo&&ccpMap[0])driverPins.push({port:ccpMap[0].port,bit:ccpMap[0].bit,driver:'servo (CCP0)'});if(this._cUses.motor){if(ccpMap[1])driverPins.push({port:ccpMap[1].port,bit:ccpMap[1].bit,driver:'motor PWM (CCP1)'});driverPins.push({port:3,bit:4,driver:'motor IN1'});driverPins.push({port:3,bit:5,driver:'motor IN2'});}if(this._cUses.relay)driverPins.push({port:2,bit:0,driver:'relay'});if(this._cUses.button)driverPins.push({port:3,bit:2,driver:'button'});if(this._cUses.sensor)driverPins.push({port:1,bit:1,driver:'ADC sensor'});if(this._cUses.ultrasonic){driverPins.push({port:3,bit:6,driver:'ultrasonic trigger'});driverPins.push({port:3,bit:7,driver:'ultrasonic echo'});}if(this._cUses.neopixel)driverPins.push({port:1,bit:5,driver:'NeoPixel data'});if(this._cUses.lcd||this._cUses.oled){driverPins.push({port:2,bit:1,driver:'I2C SDA'});driverPins.push({port:2,bit:2,driver:'I2C SCL'});}// Driver pins vs each other.
for(let i=0;i<driverPins.length;i++){for(let j=i+1;j<driverPins.length;j++){if(driverPins[i].port===driverPins[j].port&&driverPins[i].bit===driverPins[j].bit){collision("P".concat(driverPins[i].port,".").concat(driverPins[i].bit," claimed by both ").concat(driverPins[i].driver," and ").concat(driverPins[j].driver));}}}// Driver pins vs user-declared pins.
for(const dp of driverPins){const userPin=pins.find(p=>p.port===dp.port&&p.bit===dp.bit);if(userPin){collision("P".concat(dp.port,".").concat(dp.bit," is declared as \"").concat(userPin.name,"\" and also claimed by the ").concat(dp.driver," driver"));}}// ---- assemble ----------------------------------------------------------------
const hex=n=>n.toString(16).toUpperCase().padStart(2,'0');const out=[// Late checks that need the body's _cUses, BEFORE the warning
// banner renders: a declared 6502 machine without a W65C22 has
// no timebase, and the body just told us whether one is needed.
...(()=>{if(this._core==='6502'&&stored.machine&&!(stored.machine.chips||[]).some(ch=>ch.kind==='via')&&(this._cTasks||this._cUses.delay||this._cUses.now||this._cUses.print)){this.cWarn('the declared machine has no W65C22 — Timer 1 is the timebase; '+'add CHIP via1 = W65C22 AT $6000 (or wherever the decode puts it)');}return[];})(),'/* Generated by Brickwright — blocks → C for the STC12 / 8051.',// This used to read "Hand edits will be lost; change the project
// instead." The first half is still true and the second stopped
// being true once the C reader landed: edits are no longer a dead
// end, they just do not survive a REGENERATION. Telling someone
// their only option is to go back to the blocks now sends them the
// long way round.
' * Regenerating from the project overwrites this file. Your edits are not',' * stuck here though — the C reader imports this back into blocks, and it',' * names anything it cannot represent rather than dropping it in silence.'];// closed either by the not-an-STC12-program diagnostic below, or here
if(!(pins.length===0&&this._cWarnings.length>3))out.push(' */');// A Scratch program compiled to C produces one "no equivalent" warning per block —
// 52 of them for a Minesweeper, which reads as a broken tool rather than as the
// honest answer, which is that a sprite has no meaning on a microcontroller. Lead
// with that once, then summarise. Only projects that declare pins get the detail.
const noPins=!pins.length;if(noPins&&this._cWarnings.length>3){out.push(' *',' * THIS PROJECT IS NOT AN STC12 PROGRAM. It declares no pins, and'+" ".concat(this._cWarnings.length," of its blocks have no meaning on a"),' * microcontroller (sprites, lists, sounds and the like). What follows will'+' compile,',' * but it does nothing on hardware.',' *',' * To target the chip, declare what is wired to it and drive it — see the'+' stc_blink',' * example, or write:  DEVICE STC12C5A60S2 / PIN led = P1.0 OUTPUT ACTIVE'+' LOW / turn on led',' */');const shown=this._cWarnings.slice(0,3);for(const w of shown)out.push("/* warning: ".concat(this.cComment(w)," */"));out.push("/* warning: \u2026and ".concat(this._cWarnings.length-shown.length," more of the same kind. */"));}else{for(const w of this._cWarnings)out.push("/* warning: ".concat(this.cComment(w)," */"));}const tables=project&&project.stc&&project.stc.tables||[];// The marker header: everything the flat C form cannot say for itself, stated by the
// emitter instead of left to be inferred. Same device as `scratch.defblock(...)` /
// `scratch.sprite(...)` in the Python and JS back ends, and for the same reason — it
// is what makes a C -> blocks front end a bounded parser rather than a guessing game.
// `#include <stc12.h>` cannot distinguish stc12c5a60s2 from stc15f2k60s2; `cName`
// mangling is not reversible; a proccode's %s/%b positions are lost in the C name;
// and the Duff's-device form hides where one script ends and the next begins.
// Suppress with `{markers: false}` if you only want the C.
if(!(opts&&opts.markers===false)){const marks=["device ".concat(device),"clock ".concat(clock),...pins.map(p=>"pin ".concat(p.name," ").concat(p.where||"P".concat(p.port,".").concat(p.bit)," ").concat(p.direction).concat(p.activeLow?' active-low':'')),// PARTs must survive the header too, or the C reader cannot
// reconstruct the declaration and shift_out calls come back
// as nothing (found via the chaser's round-trip, 2026-08-13).
...(stored.parts||[]).map(pt=>{const w=x=>x.where||"P".concat(x.port,".").concat(x.bit);return"part ".concat(pt.name," ").concat(pt.type," ").concat(w(pt.data)," ").concat(w(pt.clock)," ").concat(w(pt.latch)).concat(pt.activeLow?' active-low':'');}),// The declared machine survives into the header for the same
// reason PARTs do: the C reader rebuilds the declarations.
...(stored.machine?stored.machine.regions||[]:[]).map(r=>"map ".concat(r.kind," ").concat(r.start.toString(16)," ").concat(r.end.toString(16))),...(stored.machine?stored.machine.chips||[]:[]).map(ch=>"chip ".concat(ch.name," ").concat({via:'w65c22',acia:'w65c51',vdp:'tms9918',simplevga:'simplevga'}[ch.kind]||'w65c51'," ").concat(ch.at.toString(16))),...tables.map(t=>"table ".concat(t.name," ").concat(t.values.length)),...markVars,...markProcs,...markScripts,// The yield map: `<task>_state == N` means "about to run this block". It is
// the only thing that turns a Level 1 position into something the block
// editor can point at, and only the emitter knows it — the C form has lost
// it by the time stc_symtab or either emulator sees the file.
//
// Debug builds only, and that is not squeamishness: block ids are minted
// afresh by every parse, so emitting them unconditionally would make
// generateC's output differ run to run for the same program. That breaks
// the `C -> pseudocode -> C` fixed point the other three languages hold
// themselves to, and makes emitted C undiffable. A debugger asks for
// {debug: true} anyway — it needs the scheduler form regardless.
// reference/debugger-ui.md §7 is the normative spec.
...yieldMap.map(y=>"yield ".concat(y.task," ").concat(y.state," ").concat(this.cMark(y.block)," ").concat(y.kind))];out.push('/* @bw-begin — machine-readable; do not hand-edit.');for(const m of marks)out.push(" * @bw ".concat(this.cComment(m)));out.push(' * @bw-end */');}if(this._core==='6502'){// The machine config: declared MAP/CHIP lines when present, the
// EATER6502 preset otherwise. Only the chip BASES move — the
// register spellings are the chips' own whatever the decode.
const machine=stored.machine||null;const viaChip=machine&&(machine.chips||[]).find(ch=>ch.kind==='via');const aciaChip=machine&&(machine.chips||[]).find(ch=>ch.kind==='acia');const viaAt=viaChip?viaChip.at:0x6000;const aciaAt=aciaChip?aciaChip.at:0x5000;const hx=n=>'0x'+n.toString(16);out.push('#include <stdint.h>','');out.push("#define F_CPU ".concat(clock,"UL"),'');out.push("/* The composable 6502 machine".concat(machine?' (declared config)':' (EATER6502 preset)',": W65C22 VIA at")," * $".concat(viaAt.toString(16),", W65C51 ACIA at $").concat(aciaAt.toString(16),", spelled as addresses from the WDC"),' * datasheets. Timer 1 free-runs at LATCH+2 cycles per rollover; the',' * latch below makes that exactly 1 ms at this clock. There is NO',' * interrupt in this build: bw_now() polls the T1 flag (IFR6) and',' * accumulates. cc65-compatible C (C89 declarations, no VLA, no',' * mixed declarations). */',"#define BW_VIA(a)  (*(volatile uint8_t *)(".concat(hx(viaAt),"u + (a)))"),'#define BW_VIA_ORB   BW_VIA(0x0u)','#define BW_VIA_ORA   BW_VIA(0x1u)','#define BW_VIA_DDRB  BW_VIA(0x2u)','#define BW_VIA_DDRA  BW_VIA(0x3u)','#define BW_VIA_T1CL  BW_VIA(0x4u)','#define BW_VIA_T1CH  BW_VIA(0x5u)','#define BW_VIA_ACR   BW_VIA(0xbu)','#define BW_VIA_IFR   BW_VIA(0xdu)','#define BW_VIA_IRB   BW_VIA_ORB','/* Port A reads through $600F: no handshake, so no CA-flag clears. */','#define BW_VIA_IRA   BW_VIA(0xfu)',"#define BW_ACIA_DATA   (*(volatile uint8_t *)".concat(hx(aciaAt),"u)"),"#define BW_ACIA_STATUS (*(volatile uint8_t *)".concat(hx(aciaAt+1),"u)"),"#define BW_ACIA_CMD    (*(volatile uint8_t *)".concat(hx(aciaAt+2),"u)"),"#define BW_ACIA_CTRL   (*(volatile uint8_t *)".concat(hx(aciaAt+3),"u)"),'#define BW_T1_LATCH ((uint16_t)(F_CPU / 1000UL - 2UL))','');// A declared TMS9918 gets its two ports named — the emitter
// itself drives no video yet, but hand-written C in the same
// project should not have to hardcode the decoded address.
const vdpChip=machine&&(machine.chips||[]).find(c=>c.kind==='vdp')||null;if(vdpChip){out.push("#define BW_VDP_DATA (*(volatile uint8_t *)".concat(hx(vdpChip.at),"u)"),"#define BW_VDP_CTRL (*(volatile uint8_t *)".concat(hx(vdpChip.at+1),"u)"),'');}}else if(this._core==='z80'){// Z80 breadboard machine: OUT latch + IN buffer on I/O port 0.
// Shadow byte for the OUT latch avoids reading back the latch
// (which would return the IN buffer on the shared port address).
const machine=stored.machine||null;const outPort=0;// port 0 for both OUT and IN
out.push('#include <stdint.h>','');out.push("#define F_CPU ".concat(clock,"UL"),'');out.push('/* Z80 breadboard machine: OUT latch (74HC374) + IN buffer (74HC244)',' * on I/O port 0. sdcc -mz80 compatible C. */',"__sfr __at 0x".concat(outPort.toString(16).padStart(2,'0')," BW_PORT_OUT;"),"__sfr __at 0x".concat(outPort.toString(16).padStart(2,'0')," BW_PORT_IN;"),'static uint8_t _z80_sh;  /* shadow byte for the OUT latch */','');// Z80: no timer, no ISR. delay_ms is a calibrated busy loop.
if(this._cUses.delay||this._cUses.blockDelay){const inner=Math.max(1,Math.round(clock/10000));out.push('/* Busy-loop delay (no timer on this machine). */','static void delay_ms(unsigned int ms)','{',"    unsigned int i;",'    while (ms--) {',"        for (i = 0; i < ".concat(inner,"u; i++) ;"),'    }','}','');}}else if(this._core==='arm'){out.push('#include <stdint.h>','');out.push("#define F_CPU ".concat(clock,"UL"),'');out.push('/* Freestanding Cortex-M0+: no SDK, no headers — the registers this',' * program touches, spelled as addresses from the RP2040 datasheet.',' * SIO (single-cycle I/O) owns the GPIO bits; IO_BANK0 selects the',' * pin function; the 1 MHz TIMER is the timebase (no tick ISR at',' * all — bw_now() reads the microsecond counter directly). */','#define BW_MMIO(a) (*(volatile uint32_t *)(a))','#define BW_SIO_GPIO_IN       BW_MMIO(0xd0000004u)','#define BW_SIO_GPIO_OUT_SET  BW_MMIO(0xd0000014u)','#define BW_SIO_GPIO_OUT_CLR  BW_MMIO(0xd0000018u)','#define BW_SIO_GPIO_OUT_XOR  BW_MMIO(0xd000001cu)','#define BW_SIO_GPIO_OE_SET   BW_MMIO(0xd0000024u)','#define BW_IOBANK0_CTRL(n)   BW_MMIO(0x40014004u + (uint32_t)(n) * 8u)','#define BW_PADS(n)           BW_MMIO(0x4001c004u + (uint32_t)(n) * 4u)','#define BW_TIMER_TIMELR      BW_MMIO(0x4005400cu)','#define BW_TIMER_TIMEHR      BW_MMIO(0x40054008u)','#define BW_WATCHDOG_TICK     BW_MMIO(0x4005802cu)','#define BW_ADC_CS            BW_MMIO(0x4004c000u)','#define BW_ADC_RESULT        BW_MMIO(0x4004c004u)','#define BW_UART0_DR          BW_MMIO(0x40034000u)','#define BW_UART0_FR          BW_MMIO(0x40034018u)','#define BW_UART0_IBRD        BW_MMIO(0x40034024u)','#define BW_UART0_FBRD        BW_MMIO(0x40034028u)','#define BW_UART0_LCR_H       BW_MMIO(0x4003402cu)','#define BW_UART0_CR          BW_MMIO(0x40034030u)','#define BW_PWM_CSR(s)        BW_MMIO(0x40050000u + (uint32_t)(s) * 0x14u)','#define BW_PWM_DIV(s)        BW_MMIO(0x40050004u + (uint32_t)(s) * 0x14u)','#define BW_PWM_CC(s)         BW_MMIO(0x4005000cu + (uint32_t)(s) * 0x14u)','#define BW_PWM_TOP(s)        BW_MMIO(0x40050010u + (uint32_t)(s) * 0x14u)','');}else if(this._core==='avr'){out.push('#include <avr/io.h>','#include <avr/interrupt.h>','#include <stdint.h>','');out.push("#define F_CPU ".concat(clock,"UL"),'');if(this._cTiny88){// ATtiny88: Timer0 has no CTC mode. Use Timer1 CTC instead.
out.push('/* Timer 1 in CTC mode ticks every millisecond: F_CPU/64 counts,',' * OCR1A picked so one compare = 1 ms exactly at this clock.',' * (ATtiny88 Timer0 has no CTC — Timer1 is the tick source.) */',"#define BW_OCR1A ((uint16_t)(F_CPU / 64UL / 1000UL - 1UL))",'');}else{out.push('/* Timer 0 in CTC mode ticks every millisecond: F_CPU/64 counts,',' * OCR0A picked so one compare = 1 ms exactly at this clock. The same',' * one-tick contract the 8051 build keeps — nothing generated here',' * ever busy-waits on a cycle count. */',"#define BW_OCR0A ((uint8_t)(F_CPU / 64UL / 1000UL - 1UL))",'');}}else{out.push("#include <".concat(chip.header,">"),'');// The STC15 supplement — everything the STC15 has that SDCC's
// stc12.h does not declare, emitted for EVERY STC15 program so the
// header story is complete, not patched per feature (owner
// directive, 2026-08-16). Deduped against the shipped stc12.h
// (SDCC 4.5.0): that header already carries P5/P5M0/P5M1 at the
// STC15's own addresses, and IAP/SPI/BUS_SPEED besides — but only
// sbits P5_0..P5_3 ("lower 4 bits", an LQFP-48 STC12 note), while
// the STC15 DIP-40 bonds P5.4 and P5.5 (the RBS15667 console's
// buzzer is P5.5). Addresses: STC15-PERIPHERAL-MODEL.md §3.
if(chip.p5){out.push('/* STC15 supplement — registers stc12.h lacks (STC15-PERIPHERAL-MODEL.md §3) */','__sbit __at (0xCC) P5_4;      /* DIP-40 pin 17, RST-shared */','__sbit __at (0xCD) P5_5;      /* DIP-40 pin 19 */','__sbit __at (0xCE) P5_6;      /* not bonded on DIP-40 */','__sbit __at (0xCF) P5_7;      /* not bonded on DIP-40 */','__sfr  __at (0xD6) T2H;       /* Timer 2 — the UART1 baud source */','__sfr  __at (0xD7) T2L;','__sfr  __at (0xBA) P_SW2;     /* peripheral pin switch 2 */','__sfr  __at (0xAA) WKTCL;     /* wake-up timer */','__sfr  __at (0xAB) WKTCH;','__sfr  __at (0xDC) CCAPM2;    /* third PCA/CCP channel */','__sfr  __at (0xEC) CCAP2L;','__sfr  __at (0xFC) CCAP2H;','__sfr  __at (0xF4) PCA_PWM2;','#define P_SW1    AUXR1        /* STC15 name for 0xA2 */','#define INT_CLKO WAKE_CLKO    /* STC15 name for 0x8F */','');}for(const p of pins){if(Number(p.port)!==5)continue;if(!chip.p5){this.cWarn("P5 does not exist on DEVICE ".concat(String(project.stc.device||'').toUpperCase()," \u2014 it is an STC15 port (STC15-PERIPHERAL-MODEL.md \xA73); this C will not compile"));}else if(Number(p.bit)!==4&&Number(p.bit)!==5){this.cWarn("P5.".concat(p.bit," is not bonded on the DIP-40 \u2014 only P5.4 and P5.5 reach pins"));}}out.push("#define FOSC_HZ ".concat(clock,"UL"),'');out.push('/* Timer 0, mode 1, clocked at FOSC/12 — accuracy depends only on FOSC, and',' * every supported family counts this mode identically, so the same program is',' * timing-correct on a 12T STC89 and a 1T STC12 or STC15. Nothing generated here',' * ever busy-waits on a cycle count. */','#define T0_RELOAD (65536UL - (FOSC_HZ / 12UL / 1000UL))','');}if(this._core==='6502'&&(this._cTasks||this._cUses.delay||this._cUses.now||this._cUses.print||this._cUses.blockDelay)){out.push('/* No tick ISR on this core either — but unlike the RP2040 there is',' * no free-running microsecond counter to read, so the millisecond',' * count is HARVESTED: T1 rolls over every 1 ms and sets IFR6;',' * bw_now() collects the flag and increments. Tasks yield at every',' * wait and every loop back-edge, and every wait polls, so the poll',' * cadence beats the 1 ms period by construction. (A single block',' * computing for >1 ms between yields would drop a tick — the same',' * class of caveat as the AVR\'s interrupts-off window, and the',' * corpus shapes stay far under it at this clock.) */','static uint32_t bw_ms;','/* The FLAG-CLEARING read must survive the optimizer: cc65 -O discards',' * a (void)-cast volatile read outright (measured: IFR6 stayed set and',' * bw_ms counted scheduler passes, ~2.4x fast). A store to a volatile',' * sink cannot be dropped. */','static volatile uint8_t bw_t1_sink;','','static uint32_t bw_now(void)','{','    if (BW_VIA_IFR & 0x40u) {','        bw_t1_sink = BW_VIA_T1CL;  /* reading T1C-L clears IFR6 */','        ++bw_ms;','    }','    return bw_ms;','}','');if(this._cUses.blockDelay){out.push('/* A wait inside a custom block: really blocks, but on the timer. */','static void bw_block_ms(uint32_t ms)','{','    uint32_t start = bw_now();','    while ((int32_t)(bw_now() - start - ms) < 0) ;','}','');}if(!this._cTasks&&this._cUses.delay){out.push('/* No scheduler in this build; T1 still rolls, so a blocking delay',' * is a wait on the harvested count, never on a cycle count. */','static void delay_ms(uint32_t ms)','{','    uint32_t start = bw_now();','    while ((int32_t)(bw_now() - start - ms) < 0) ;','}','');}}if(this._cTasks&&this._core==='arm'){out.push('/* One script = one cooperative task; tasks yield at every wait and at',' * every loop iteration (Scratch\'s own scheduling contract). There is',' * NO tick ISR on this core: the RP2040\'s TIMER counts microseconds in',' * hardware, so program time is read, not maintained. */','');if(this._cUses.now||this._cUses.blockDelay){out.push('/* TIMELR latches TIMEHR: the pair is a coherent 64-bit read, so the',' * millisecond count wraps as a uint32 truncation of a monotonic count',' * — delta arithmetic stays correct across the seam (a bare 32-bit',' * microsecond read would wrap at 71 minutes on a NON-power-of-two',' * millisecond boundary, and one wait per boot would misfire). */','static uint32_t bw_now(void)','{','    uint32_t lo = BW_TIMER_TIMELR;','    uint32_t hi = BW_TIMER_TIMEHR;','    return (uint32_t)(((((uint64_t)hi) << 32) | lo) / 1000u);','}','');}if(this._cUses.blockDelay){out.push('/* A wait inside a custom block: really blocks, but on the timer. */','static void bw_block_ms(uint32_t ms)','{','    uint32_t start = bw_now();','    while ((int32_t)(bw_now() - start - ms) < 0) ;','}','');}}else if(this._cTasks&&this._core!=='6502'){out.push('/* One script = one cooperative task. Timer interrupts every millisecond;',' * tasks yield at every wait and at every loop iteration (Scratch\'s own',' * scheduling contract), so no task can starve the others. */',...(this._core==='avr'?['static volatile uint32_t bw_ms;','',"ISR(".concat(this._cTiny88?'TIMER1_COMPA_vect':'TIMER0_COMPA_vect',")"),'{','    bw_ms++;','}','']:['static volatile unsigned int bw_ms;','','void bw_tick(void) __interrupt(1)','{','    TL0 = (unsigned char)(T0_RELOAD & 0xFF);','    TH0 = (unsigned char)(T0_RELOAD >> 8);','    bw_ms++;','}','']));if(this._cUses.now||this._cUses.blockDelay){out.push(...(this._core==='avr'?['/* A 32-bit read is not atomic on an 8-bit AVR; hold interrupts off. */','static uint32_t bw_now(void)','{','    uint32_t t;','    cli();','    t = bw_ms;','    sei();','    return t;','}','']:['/* A 16-bit read is not atomic on an 8051; hold the tick off. */','static unsigned int bw_now(void)','{','    unsigned int t;','    ET0 = 0;','    t = bw_ms;','    ET0 = 1;','    return t;','}','']));}if(this._cUses.blockDelay){out.push(...(this._core==='avr'?['/* A wait inside a custom block: really blocks, but on the tick. */','static void bw_block_ms(uint32_t ms)','{','    uint32_t start = bw_now();','    while ((int32_t)(bw_now() - start - ms) < 0) ;','}','']:['/* A wait inside a custom block: those run to completion in Scratch too, so',' * this one really does block — but on the tick, never on a cycle count. */','static void bw_block_ms(unsigned int ms)','{','    unsigned int start = bw_now();','    while ((int)(bw_now() - start - ms) < 0) ;','}','']));}}else if(this._cUses.delay&&this._core==='arm'){out.push('/* No scheduler in this build; the hardware timer still counts, so a',' * blocking delay is a wait on the microsecond counter. */','static uint32_t bw_now(void)','{','    uint32_t lo = BW_TIMER_TIMELR;','    uint32_t hi = BW_TIMER_TIMEHR;','    return (uint32_t)(((((uint64_t)hi) << 32) | lo) / 1000u);','}','','static void delay_ms(uint32_t ms)','{','    uint32_t start = bw_now();','    while ((int32_t)(bw_now() - start - ms) < 0) ;','}','');}else if(this._cUses.delay&&this._core!=='6502'&&this._core!=='z80'){out.push(...(this._core==='avr'?['/* No scheduler in this build; the tick still runs (main() starts it),',' * so a blocking delay is a wait on bw_ms, never on a cycle count. */','static volatile uint32_t bw_ms;','',"ISR(".concat(this._cTiny88?'TIMER1_COMPA_vect':'TIMER0_COMPA_vect',") { bw_ms++; }"),'','static void delay_ms(uint32_t ms)','{','    uint32_t start;','    cli(); start = bw_ms; sei();','    for (;;) {','        uint32_t now;','        cli(); now = bw_ms; sei();','        if ((int32_t)(now - start - ms) >= 0) break;','    }','}','']:['static void delay_ms(unsigned int ms)','{','    while (ms--) {','        TL0 = (unsigned char)(T0_RELOAD & 0xFF);','        TH0 = (unsigned char)(T0_RELOAD >> 8);','        TF0 = 0;','        TR0 = 1;','        while (!TF0) ;','        TR0 = 0;','        TF0 = 0;','    }','}','']));}// The cube scan kernel always needs delay_ms (blocking per-line dwell).
// The normal path emits it only when !_cTasks && _cUses.delay; if the
// scheduler is active (or no wait blocks exist), it was not emitted.
const delayAlreadyEmitted=!this._cTasks&&this._cUses.delay;if(this._cUses.cubeDelay&&!delayAlreadyEmitted){out.push('/* Blocking delay for the cube scan kernel (per-line dwell). */','static void delay_ms(unsigned int ms)','{','    while (ms--) {','        TL0 = (unsigned char)(T0_RELOAD & 0xFF);','        TH0 = (unsigned char)(T0_RELOAD >> 8);','        TF0 = 0;','        TR0 = 1;','        while (!TF0) ;','        TR0 = 0;','        TF0 = 0;','    }','}','');}if(this._core==='6502'&&this._cUses.print){out.push('/* print goes out the ACIA at 9600 8N1 — the same wire as everywhere.',' * The current WDC silicon has the famous TDRE bug (status bit 4',' * useless), so this build NEVER polls it: each byte is paced on the',' * millisecond clock instead — correct on buggy and pre-bug parts',' * alike, and the trace comparator budgets the same 2 ms/byte. */','static void bw_putc(char c)','{','    uint32_t start;','    BW_ACIA_DATA = (uint8_t)c;','    start = bw_now();','    while ((int32_t)(bw_now() - start - 2) < 0) ;   /* >= 1.05 ms/byte at 9600 */','}','','static void bw_print(const char *s)','{','    while (*s) bw_putc(*s++);','    bw_putc(13); bw_putc(10);','}','','static void bw_print_num(long n)','{','    char buf[12]; unsigned char i = 0;','    unsigned long u;','    if (n < 0) { bw_putc(45); u = (unsigned long)(-n); } else { u = (unsigned long)n; }','    do { buf[i++] = (char)(48 + (u % 10)); u /= 10; } while (u);','    while (i) bw_putc(buf[--i]);','    bw_putc(13); bw_putc(10);','}','');}if(this._core==='arm'&&this._cUses.print){out.push('/* print goes out UART0 (GP0) at 9600 8N1 — the same wire the other',' * builds use, so the serial monitor does not care which chip talks. */','static void bw_putc(char c)','{','    while (BW_UART0_FR & (1u << 5)) ;   /* TXFF: FIFO full */','    BW_UART0_DR = (uint32_t)(uint8_t)c;','}','','static void bw_print(const char *s)','{','    while (*s) bw_putc(*s++);','    bw_putc(13); bw_putc(10);','}','','static void bw_print_num(long n)','{','    char buf[12]; unsigned char i = 0;','    unsigned long u;','    if (n < 0) { bw_putc(45); u = (unsigned long)(-n); } else { u = (unsigned long)n; }','    do { buf[i++] = (char)(48 + (u % 10)); u /= 10; } while (u);','    while (i) bw_putc(buf[--i]);','    bw_putc(13); bw_putc(10);','}','');}if(this._core==='avr'&&this._cUses.print){out.push('/* print goes out UART0 at 9600 8N1 — the same wire the 8051 build uses,',' * so the serial monitor does not care which chip is talking. */','static void bw_putc(char c)','{','    while (!(UCSR0A & (1 << UDRE0))) ;','    UDR0 = (uint8_t)c;','}','','static void bw_print(const char *s)','{','    while (*s) bw_putc(*s++);','    bw_putc(13); bw_putc(10);','}','','static void bw_print_num(long n)','{','    char buf[12]; unsigned char i = 0;','    unsigned long u;','    if (n < 0) { bw_putc(45); u = (unsigned long)(-n); } else { u = (unsigned long)n; }','    do { buf[i++] = (char)(48 + (u % 10)); u /= 10; } while (u);','    while (i) bw_putc(buf[--i]);','    bw_putc(13); bw_putc(10);','}','');}if(this._core==='8051'&&this._cUses.print){out.push('/* print goes out UART (SBUF) at 9600 8N1.',' * Timer 1 mode 2 (8-bit auto-reload) generates the baud clock.',' * TH1 = 256 - FOSC / 12 / 32 / 9600 (the standard formula). */','static void bw_putc(char c)','{','    SBUF = c;','    while (!TI) ;','    TI = 0;','}','','static void bw_print(const char *s)','{','    while (*s) bw_putc(*s++);','    bw_putc(13); bw_putc(10);','}','','static void bw_print_num(long n)','{','    char buf[12]; unsigned char i = 0;','    unsigned long u;','    if (n < 0) { bw_putc(45); u = (unsigned long)(-n); } else { u = (unsigned long)n; }','    do { buf[i++] = (char)(48 + (u % 10)); u /= 10; } while (u);','    while (i) bw_putc(buf[--i]);','    bw_putc(13); bw_putc(10);','}','');}// 74HC595 shift register: bit-bang MSB-first, clock-on-rising-edge.
// The activeLow param inverts the DATA line only (common-cathode vs
// common-anode LED arrays). Edge order: clock LOW, set DATA, clock HIGH.
// Latch pulse after the 8th bit makes the shift register output visible.
if(this._cUses.shiftOut&&(this._core==='avr'||this._core==='6502')){// AVR and 6502 share the same pointer+bit signature.
out.push('/* 74HC595 shift-out: MSB first, rising-edge clock, latch pulse. */','static void shift_out(volatile uint8_t *dp, uint8_t db,','                      volatile uint8_t *cp, uint8_t cb,','                      volatile uint8_t *lp, uint8_t lb,','                      uint8_t activeLow, uint8_t value)','{','    uint8_t i;','    *lp &= (uint8_t)~(1 << lb);                    /* latch low */','    for (i = 0; i < 8; i++) {','        *cp &= (uint8_t)~(1 << cb);                /* clock low */','        uint8_t bit = (value & 0x80) ? 1 : 0;','        if (activeLow) bit = !bit;','        if (bit) *dp |= (uint8_t)(1 << db);','        else     *dp &= (uint8_t)~(1 << db);','        value <<= 1;','        *cp |= (uint8_t)(1 << cb);                 /* clock high — shift */','    }','    *lp |= (uint8_t)(1 << lb);                     /* latch high — output */','}','');}if(this._cUses.shiftOut&&this._core==='arm'){out.push('/* 74HC595 shift-out: MSB first, rising-edge clock, latch pulse. */','static void shift_out(uint8_t data_gpio, uint8_t clock_gpio, uint8_t latch_gpio,','                      uint8_t activeLow, uint8_t value)','{','    uint8_t i;','    BW_SIO_GPIO_OUT_CLR = (1UL << latch_gpio);     /* latch low */','    for (i = 0; i < 8; i++) {','        BW_SIO_GPIO_OUT_CLR = (1UL << clock_gpio); /* clock low */','        uint8_t bit = (value & 0x80) ? 1 : 0;','        if (activeLow) bit = !bit;','        if (bit) BW_SIO_GPIO_OUT_SET = (1UL << data_gpio);','        else     BW_SIO_GPIO_OUT_CLR = (1UL << data_gpio);','        value <<= 1;','        BW_SIO_GPIO_OUT_SET = (1UL << clock_gpio); /* clock high — shift */','    }','    BW_SIO_GPIO_OUT_SET = (1UL << latch_gpio);     /* latch high — output */','}','');}if(this._cUses.shiftOut&&this._core==='8051'){// The 8051 has bit-addressable SFR lvalues: simpler signature.
out.push('/* 74HC595 shift-out: MSB first, rising-edge clock, latch pulse. */','static void shift_out(__sbit data_pin, __sbit clock_pin, __sbit latch_pin,','                      unsigned char activeLow, unsigned char value)','{','    unsigned char i;','    latch_pin = 0;                                  /* latch low */','    for (i = 0; i < 8; i++) {','        clock_pin = 0;                              /* clock low */','        if (activeLow) data_pin = !(value & 0x80);','        else           data_pin =  (value & 0x80) ? 1 : 0;','        value <<= 1;','        clock_pin = 1;                              /* clock high — shift */','    }','    latch_pin = 1;                                  /* latch high — output */','}','');}if(this._cUses.adc&&this._core==='avr'&&this._cMega){out.push('/* 10-bit ADC, polled, AVcc reference. The Mega has 16 channels;',' * channels 8-15 need MUX5 in ADCSRB on top of ADMUX MUX4:0. */','static long adc_read(unsigned char channel)','{','    ADMUX = (uint8_t)((1 << REFS0) | (channel & 0x07));','    if (channel & 0x08) ADCSRB |= (1 << MUX5); else ADCSRB &= (uint8_t)~(1 << MUX5);','    ADCSRA |= (1 << ADSC);','    while (ADCSRA & (1 << ADSC)) ;','    return ADC;','}','');}else if(this._cUses.adc&&this._core==='arm'){out.push('/* 12-bit ADC, polled over APB. Channel n is GP(26+n). The datasheet',' * sequence: enable, wait READY, START_ONCE, wait READY, read RESULT. */','static long adc_read(unsigned char channel)','{','    BW_ADC_CS = 1u | ((uint32_t)channel << 12);        /* EN | AINSEL */','    while (!(BW_ADC_CS & (1u << 8))) ;                 /* READY */','    BW_ADC_CS = 1u | (1u << 2) | ((uint32_t)channel << 12);  /* + START_ONCE */','    while (!(BW_ADC_CS & (1u << 8))) ;                 /* conversion done */','    return (unsigned int)(BW_ADC_RESULT & 0xFFFu);','}','');}else if(this._cUses.adc&&this._core==='avr'){out.push('/* 10-bit ADC, polled, AVcc reference. Channel = the A-pin number;',' * A6/A7 exist on the Nano as ADC-only pads and work here too. */','static long adc_read(unsigned char channel)','{','    ADMUX = (uint8_t)((1 << REFS0) | (channel & 0x0F));','    ADCSRA |= (1 << ADSC);','    while (ADCSRA & (1 << ADSC)) ;','    return ADC;','}','');}else if(this._cUses.adc){out.push('/* 10-bit ADC, polled. Channel n is on P1.n; the channel is selected and the',' * conversion started in one write, as STC\'s own examples do. */','static long adc_read(unsigned char channel)','{',"    /* Mux settle: datasheet \xA710.5 requires ~8 oscillator clocks after","     * channel selection.  At FOSC ".concat((clock/1e6).toFixed(4)," MHz that is"),"     * ".concat((8e9/clock).toFixed(0)," ns \u2014 well under 1 \xB5s.  The NOP loop over-provides"),'     * on both 1T and 12T cores: 1T gives ~32 clocks, 12T ~384. */','    ADC_CONTR = (unsigned char)(0xE8 | channel);  /* power|fast|start|chan */','    __asm nop __endasm; __asm nop __endasm;','    __asm nop __endasm; __asm nop __endasm;','    __asm nop __endasm; __asm nop __endasm;','    __asm nop __endasm; __asm nop __endasm;        /* 8 NOPs ≥ 8 osc clocks */','    while (!(ADC_CONTR & 0x10)) ;                 /* wait for ADC_FLAG */','    ADC_CONTR &= ~0x10;                           /* clear it by hand */','    return ((unsigned int)ADC_RES << 2) | (ADC_RESL & 0x03);','}','');}if((this._cUses.pwm||this._cUses.motor)&&this._core==='arm'){out.push('/* PWM: every RP2040 GPIO has a slice channel — slice (gpio/2)&7,',' * channel A/B by parity, CC packed A-low/B-high. TOP = 999 at a',' * 1 MHz slice clock gives 1 kHz PWM; CC = 0 is constant low and',' * CC = TOP+1 constant high, so 0%% and 100%% need no special case.',' * funcsel moves to PWM here — a later digital write to the same',' * pin would need funcsel SIO back (same takeover the PCA does',' * on the 8051): one pin, one job per program. */','static void pwm_set(unsigned char gpio, unsigned int percent)','{','    uint32_t slice = ((uint32_t)gpio >> 1) & 7u;','    uint32_t duty;','    if (percent > 100) percent = 100;','    duty = (percent * 1000u + 50u) / 100u;','    BW_IOBANK0_CTRL(gpio) = 4u;              /* funcsel PWM */','    BW_PWM_DIV(slice) = 125u << 4;           /* 125 MHz / 125 = 1 MHz */','    BW_PWM_TOP(slice) = 999u;','    if (gpio & 1u) BW_PWM_CC(slice) = (BW_PWM_CC(slice) & 0xFFFFu) | (duty << 16);','    else BW_PWM_CC(slice) = (BW_PWM_CC(slice) & 0xFFFF0000u) | duty;','    BW_PWM_CSR(slice) = 1u;                  /* enable */','}','');}else if((this._cUses.pwm||this._cUses.motor)&&this._core==='avr'&&this._cMega){out.push('/* PWM on ATmega2560: Timers 1-5, 8-bit fast PWM at F_CPU/64/256',' * = 977 Hz. Timer 0 is the ms tick (D13/D4 refused at emit time).',' * D2-D8 use Timers 3+4, D9-D12 use Timers 1+2, D44-D46 Timer 5. */','static void pwm_set(unsigned char pin, unsigned int percent)','{','    uint8_t v;','    if (percent > 100) percent = 100;','    v = (uint8_t)((percent * 255u + 50u) / 100u);','    switch (pin) {','    case 2:   /* OC3B = PE4 */','        DDRE |= (1 << 4);','        if (v == 0)        { TCCR3A &= (uint8_t)~(1 << COM3B1); PORTE &= (uint8_t)~(1 << 4); }','        else if (v == 255) { TCCR3A &= (uint8_t)~(1 << COM3B1); PORTE |= (1 << 4); }','        else               { TCCR3A |= (1 << COM3B1); OCR3B = v; }','        break;','    case 3:   /* OC3C = PE5 */','        DDRE |= (1 << 5);','        if (v == 0)        { TCCR3A &= (uint8_t)~(1 << COM3C1); PORTE &= (uint8_t)~(1 << 5); }','        else if (v == 255) { TCCR3A &= (uint8_t)~(1 << COM3C1); PORTE |= (1 << 5); }','        else               { TCCR3A |= (1 << COM3C1); OCR3C = v; }','        break;','    case 5:   /* OC3A = PE3 */','        DDRE |= (1 << 3);','        if (v == 0)        { TCCR3A &= (uint8_t)~(1 << COM3A1); PORTE &= (uint8_t)~(1 << 3); }','        else if (v == 255) { TCCR3A &= (uint8_t)~(1 << COM3A1); PORTE |= (1 << 3); }','        else               { TCCR3A |= (1 << COM3A1); OCR3A = v; }','        break;','    case 6:   /* OC4A = PH3 */','        DDRH |= (1 << 3);','        if (v == 0)        { TCCR4A &= (uint8_t)~(1 << COM4A1); PORTH &= (uint8_t)~(1 << 3); }','        else if (v == 255) { TCCR4A &= (uint8_t)~(1 << COM4A1); PORTH |= (1 << 3); }','        else               { TCCR4A |= (1 << COM4A1); OCR4A = v; }','        break;','    case 7:   /* OC4B = PH4 */','        DDRH |= (1 << 4);','        if (v == 0)        { TCCR4A &= (uint8_t)~(1 << COM4B1); PORTH &= (uint8_t)~(1 << 4); }','        else if (v == 255) { TCCR4A &= (uint8_t)~(1 << COM4B1); PORTH |= (1 << 4); }','        else               { TCCR4A |= (1 << COM4B1); OCR4B = v; }','        break;','    case 8:   /* OC4C = PH5 */','        DDRH |= (1 << 5);','        if (v == 0)        { TCCR4A &= (uint8_t)~(1 << COM4C1); PORTH &= (uint8_t)~(1 << 5); }','        else if (v == 255) { TCCR4A &= (uint8_t)~(1 << COM4C1); PORTH |= (1 << 5); }','        else               { TCCR4A |= (1 << COM4C1); OCR4C = v; }','        break;','    case 9:   /* OC2B = PH6 */','        DDRH |= (1 << 6);','        if (v == 0)        { TCCR2A &= (uint8_t)~(1 << COM2B1); PORTH &= (uint8_t)~(1 << 6); }','        else if (v == 255) { TCCR2A &= (uint8_t)~(1 << COM2B1); PORTH |= (1 << 6); }','        else               { TCCR2A |= (1 << COM2B1); OCR2B = v; }','        break;','    case 10:  /* OC2A = PB4 */','        DDRB |= (1 << 4);','        if (v == 0)        { TCCR2A &= (uint8_t)~(1 << COM2A1); PORTB &= (uint8_t)~(1 << 4); }','        else if (v == 255) { TCCR2A &= (uint8_t)~(1 << COM2A1); PORTB |= (1 << 4); }','        else               { TCCR2A |= (1 << COM2A1); OCR2A = v; }','        break;','    case 11:  /* OC1A = PB5 */','        DDRB |= (1 << 5);','        if (v == 0)        { TCCR1A &= (uint8_t)~(1 << COM1A1); PORTB &= (uint8_t)~(1 << 5); }','        else if (v == 255) { TCCR1A &= (uint8_t)~(1 << COM1A1); PORTB |= (1 << 5); }','        else               { TCCR1A |= (1 << COM1A1); OCR1A = v; }','        break;','    case 12:  /* OC1B = PB6 */','        DDRB |= (1 << 6);','        if (v == 0)        { TCCR1A &= (uint8_t)~(1 << COM1B1); PORTB &= (uint8_t)~(1 << 6); }','        else if (v == 255) { TCCR1A &= (uint8_t)~(1 << COM1B1); PORTB |= (1 << 6); }','        else               { TCCR1A |= (1 << COM1B1); OCR1B = v; }','        break;','    case 44:  /* OC5C = PL5 */','        DDRL |= (1 << 5);','        if (v == 0)        { TCCR5A &= (uint8_t)~(1 << COM5C1); PORTL &= (uint8_t)~(1 << 5); }','        else if (v == 255) { TCCR5A &= (uint8_t)~(1 << COM5C1); PORTL |= (1 << 5); }','        else               { TCCR5A |= (1 << COM5C1); OCR5C = v; }','        break;','    case 45:  /* OC5B = PL4 */','        DDRL |= (1 << 4);','        if (v == 0)        { TCCR5A &= (uint8_t)~(1 << COM5B1); PORTL &= (uint8_t)~(1 << 4); }','        else if (v == 255) { TCCR5A &= (uint8_t)~(1 << COM5B1); PORTL |= (1 << 4); }','        else               { TCCR5A |= (1 << COM5B1); OCR5B = v; }','        break;','    case 46:  /* OC5A = PL3 */','        DDRL |= (1 << 3);','        if (v == 0)        { TCCR5A &= (uint8_t)~(1 << COM5A1); PORTL &= (uint8_t)~(1 << 3); }','        else if (v == 255) { TCCR5A &= (uint8_t)~(1 << COM5A1); PORTL |= (1 << 3); }','        else               { TCCR5A |= (1 << COM5A1); OCR5A = v; }','        break;','    default: break;','    }','}','');}else if((this._cUses.pwm||this._cUses.motor)&&this._core==='avr'){out.push('/* PWM on the OC pins of Timers 1 and 2 (D9/D10, D11/D3) — 8-bit',' * fast PWM at F_CPU/64/256 ≈ 977 Hz, the analogWrite frequency.',' * Timer 0 is the millisecond tick, so D5/D6 are refused at emit',' * time. 0%% and 100%% disconnect the compare unit and drive the',' * level directly — fast PWM cannot express either exactly. */','static void pwm_set(unsigned char pin, unsigned int percent)','{','    uint8_t v;','    if (percent > 100) percent = 100;','    v = (uint8_t)((percent * 255u + 50u) / 100u);','    switch (pin) {','    case 3:   /* OC2B */','        DDRD |= (1 << 3);','        if (v == 0)        { TCCR2A &= (uint8_t)~(1 << COM2B1); PORTD &= (uint8_t)~(1 << 3); }','        else if (v == 255) { TCCR2A &= (uint8_t)~(1 << COM2B1); PORTD |= (1 << 3); }','        else               { TCCR2A |= (1 << COM2B1); OCR2B = v; }','        break;','    case 9:   /* OC1A */','        DDRB |= (1 << 1);','        if (v == 0)        { TCCR1A &= (uint8_t)~(1 << COM1A1); PORTB &= (uint8_t)~(1 << 1); }','        else if (v == 255) { TCCR1A &= (uint8_t)~(1 << COM1A1); PORTB |= (1 << 1); }','        else               { TCCR1A |= (1 << COM1A1); OCR1A = v; }','        break;','    case 10:  /* OC1B */','        DDRB |= (1 << 2);','        if (v == 0)        { TCCR1A &= (uint8_t)~(1 << COM1B1); PORTB &= (uint8_t)~(1 << 2); }','        else if (v == 255) { TCCR1A &= (uint8_t)~(1 << COM1B1); PORTB |= (1 << 2); }','        else               { TCCR1A |= (1 << COM1B1); OCR1B = v; }','        break;','    case 11:  /* OC2A */','        DDRB |= (1 << 3);','        if (v == 0)        { TCCR2A &= (uint8_t)~(1 << COM2A1); PORTB &= (uint8_t)~(1 << 3); }','        else if (v == 255) { TCCR2A &= (uint8_t)~(1 << COM2A1); PORTB |= (1 << 3); }','        else               { TCCR2A |= (1 << COM2A1); OCR2A = v; }','        break;','    default: break;','    }','}','');}else if(this._cUses.pwm||this._cUses.motor){out.push('/* PCA PWM. The comparator is 9 bits, {EPCnH,CCAPnH} against (0,CL),',' * and it drives the pin LOW while CL is BELOW the compare value — so a',' * LARGER value is a LONGER low time and the duty as a fraction HIGH is',' * (256 - value)/256.  Getting that backwards inverts every brightness and',' * looks entirely plausible doing it.',' *',' * Writing CCAPnH rather than CCAPnL is deliberate: the hardware reloads',' * CCAPnH into CCAPnL when CL wraps, so an update cannot glitch mid-period.',' * The 9th bit (EPCnH) is what expresses 0% and 100%, which an 8-bit',' * compare cannot.  Datasheet 10.3.4. */','static void pwm_set(unsigned char module, unsigned int percent_high)','{','    unsigned int v;','    if (percent_high > 100) percent_high = 100;','    v = 256 - ((percent_high * 256 + 50) / 100);','    if (module == 0) {','        CCAP0H = (unsigned char)v;','        if (v > 255) PCA_PWM0 |= 0x02; else PCA_PWM0 &= (unsigned char)~0x02;','    } else {','        CCAP1H = (unsigned char)v;','        if (v > 255) PCA_PWM1 |= 0x02; else PCA_PWM1 &= (unsigned char)~0x02;','    }','}','');}// tone_set: software square-wave on the declared TONE pin.
if(this._cUses.tone&&this._core==='avr'){// Find the tone pin's port and bit
const tonePin=pins.find(p=>p.direction==='tone');const pinMap=this._cMega?SB3Creator.AVR_PINS_MEGA:SB3Creator.AVR_PINS;if(tonePin){const hw=pinMap[tonePin.where.toUpperCase()];if(hw){const[port,bit]=hw;out.push('/* tone_set: software square-wave via Timer2 CTC + ISR toggle.'," * Pin ".concat(tonePin.where," (P").concat(port).concat(bit,") is the declared TONE output."),' * Frequency = F_CPU / (2 * prescaler * (OCR2A+1)).',' * freq=0 stops the tone (silences the pin). */',"static volatile uint8_t _tone_active;",'',"ISR(TIMER2_COMPA_vect) { if (_tone_active) PIN".concat(port," = (1 << ").concat(bit,"); }"),'','static void tone_set(unsigned int freq)','{','    if (freq == 0) {','        TIMSK2 &= (uint8_t)~(1 << OCIE2A);','        _tone_active = 0;',"        PORT".concat(port," &= (uint8_t)~(1 << ").concat(bit,");"),'        return;','    }','    /* Pick a prescaler that fits the 8-bit OCR2A range. */','    uint32_t ocr;','    uint8_t cs;','    ocr = F_CPU / (2UL * 1UL * freq) - 1;','    if (ocr <= 255) { cs = (1 << CS20); }','    else { ocr = F_CPU / (2UL * 8UL * freq) - 1;','           if (ocr <= 255) cs = (1 << CS21);','           else { ocr = F_CPU / (2UL * 64UL * freq) - 1;','                  if (ocr <= 255) cs = (1 << CS22);','                  else { ocr = F_CPU / (2UL * 256UL * freq) - 1;','                         if (ocr <= 255) cs = (1 << CS22) | (1 << CS21);','                         else { ocr = F_CPU / (2UL * 1024UL * freq) - 1;','                                cs = (1 << CS22) | (1 << CS21) | (1 << CS20);','                                if (ocr > 255) ocr = 255; } } } }',"    DDR".concat(port," |= (1 << ").concat(bit,");"),'    TCCR2A = (1 << WGM21);          /* CTC mode */','    TCCR2B = cs;','    OCR2A  = (uint8_t)ocr;','    TCNT2  = 0;','    _tone_active = 1;','    TIMSK2 |= (1 << OCIE2A);','}','');}}}if(this._cUses.tone&&this._core==='8051'){// 8051 tone via Timer2 (T2CON) — TODO: not all STC parts have Timer2.
// For now, emit a stub that warns at compile time.
const tonePin=pins.find(p=>p.direction==='tone');if(tonePin){out.push('/* tone_set stub: 8051 tone not yet implemented. */','static void tone_set(unsigned int freq)','{',"    (void)freq; /* P".concat(tonePin.port,"_").concat(tonePin.bit," */"),'}','');}}if(this._cUses.tone&&this._core==='arm'){// ARM tone — PWM on the declared tone pin. TODO: implement.
out.push('static void tone_set(unsigned int freq) { (void)freq; }','');}// Lookup tables: constant bytes in code space (__code flash).
// (tables was declared earlier, before the marker header that references it.)
if(tables.length){out.push('/* Lookup tables live in code space: flash is the abundant resource',' * here and RAM is not. `const __code` keeps them out of the 256 bytes',' * that matter. */');const hex2=n=>'0x'+n.toString(16).toUpperCase().padStart(2,'0');// __code is SDCC's flash keyword; on AVR a plain const copy in RAM
// keeps every read site untouched (PROGMEM would need pgm_read_*
// wrappers at each) — tables here are tens of bytes, not kilobytes.
const tq=this._core!=='8051'?'static const unsigned char':'static const __code unsigned char';for(const t of tables){out.push("".concat(tq," bw_tab_").concat(t.name,"[] = { ").concat(t.values.map(hex2).join(', ')," };"));}out.push('','/* A computed index is clamped rather than trusted. Reading past a',' * table means reading a random byte of flash and, on a display,',' * showing it — which looks like data rather than like a fault. */','static unsigned char bw_clamp(int i, unsigned char last)','{','    if (i < 0) return 0;','    if (i > (int)last) return last;','    return (unsigned char)i;','}','');}// LED cube runtime: working frame buffer, scan kernel, and helper functions.
// The voxel map is unknown (stc/src/20-ledcube/README.md): the blocks work on a
// logical grid and the mapping table (identity for now) translates at emit time.
if(this._cUses.cube){const cube=project&&project.stc&&project.stc.ledcube||{size:4,selects:8,bits:8};const S=cube.selects;const N=cube.size;// side length (4 for a 4×4×4)
out.push("/* LED cube: ".concat(cube.size,"x").concat(cube.size,"x").concat(cube.size,", ").concat(S," select lines, multiplex scan."),' *',' * P0 POLARITY — ACTIVE-HIGH.  Measured: emu8051-stc Finding #14, P0',' * value histogram over 5 s of vendor firmware, zero exceptions in 3,930+',' * writes (0x00 always blank, 0xFF always data).  Not yet confirmed on',' * silicon — probe.c on a real cube is the definitive check.  Changing',' * this one constant flips every frame, clear, fill and blank. */','#define BW_CUBE_ACTIVE_HIGH 1',"#define BW_CUBE_BLANK  (BW_CUBE_ACTIVE_HIGH ? 0x00 : 0xFF)","#define BW_CUBE_FILL   (BW_CUBE_ACTIVE_HIGH ? 0xFF : 0x00)","#define BW_CUBE_ON(b)  (BW_CUBE_ACTIVE_HIGH ? (1u << (b)) : ~(1u << (b)))",'',"static const __code unsigned char bw_cube_sel[".concat(S,"] = {"),"    ".concat(Array.from({length:S},(_,i)=>'0x'+(~(1<<i)&0xFF).toString(16).toUpperCase().padStart(2,'0')).join(', ')),'};',"static unsigned char bw_cube_frame[".concat(S,"];   /* working frame buffer */"),'',"static void bw_cube_scan(unsigned int ms)",'{','    unsigned int end;','    unsigned char i;',"    end = ms;   /* iterations, ~1 ms each at ".concat(S," lines \xD7 ~125 \xB5s/line */"),'    while (end--) {',"        for (i = 0; i < ".concat(S,"; i++) {"),'            /* A layer must never be enabled while P0 holds another','             * line\'s data — blank first, then select, then drive. */','            P0 = BW_CUBE_BLANK;','            P2 = bw_cube_sel[i];','            P0 = bw_cube_frame[i];','            delay_ms(1);','        }','    }','}','',"/* VOXEL MAP \u2014 UNVERIFIED.  Assumed identity: (x, y, z) maps to"," * select = z * 2, bit = y * ".concat(N," + x.  Only probe.c on a real cube can")," * fill in the actual (select, bit) \u2192 position table.  Changing this"," * one table corrects every set/get/fill/clear in the kernel."," * See stc/src/20-ledcube/README.md. */","static void bw_cube_addr(int x, int y, int z, int colour,",'                         unsigned char *sel, unsigned char *bit)','{',"    *sel = (unsigned char)(z * 2 + (colour > 1 ? 1 : 0));","    *bit = (unsigned char)(y * ".concat(N," + x);"),'}','',"static void bw_cube_set(int x, int y, int z, int colour)",'{','    unsigned char sel, bit;','    bw_cube_addr(x, y, z, colour, &sel, &bit);',"    if (sel >= ".concat(S," || bit >= 8) return;"),'    if (colour) {','        if (BW_CUBE_ACTIVE_HIGH)','            bw_cube_frame[sel] |= (unsigned char)(1u << bit);','        else','            bw_cube_frame[sel] &= (unsigned char)~(1u << bit);','    } else {','        if (BW_CUBE_ACTIVE_HIGH)','            bw_cube_frame[sel] &= (unsigned char)~(1u << bit);','        else','            bw_cube_frame[sel] |= (unsigned char)(1u << bit);','    }','}','',"static unsigned char bw_cube_get(int x, int y, int z)",'{','    unsigned char sel, bit;','    bw_cube_addr(x, y, z, 1, &sel, &bit);',"    if (sel >= ".concat(S," || bit >= 8) return 0;"),'    return BW_CUBE_ACTIVE_HIGH ? ((bw_cube_frame[sel] >> bit) & 1)','                              : !((bw_cube_frame[sel] >> bit) & 1);','}','','static void bw_cube_clear(void)','{',"    unsigned char i; for (i = 0; i < ".concat(S,"; i++) bw_cube_frame[i] = BW_CUBE_BLANK;"),'}','',"static void bw_cube_fill_layer(int layer, int colour)",'{',"    int sel = layer * 2 + (colour > 1 ? 1 : 0);","    if (sel >= 0 && sel < ".concat(S,") bw_cube_frame[sel] = BW_CUBE_FILL;"),'}','',// The legend the firmware carries for whoever reads the C later.
// Generated from the same table, so it cannot describe an
// encoding the emitter no longer uses — a comment that lies
// about a wire format is worse than no comment.
"/* Directions: ".concat(_cubeDirections_js__WEBPACK_IMPORTED_MODULE_4__.CUBE_DIRECTIONS.map((d,i)=>"".concat(i,"=").concat(d)).join(' ')," */"),'static void bw_cube_shift(int dir)','{',"    unsigned char i;",'    switch (dir) {',"    case 0: for (i = ".concat(S," - 1; i > 0; i--) bw_cube_frame[i] = bw_cube_frame[i-1]; bw_cube_frame[0] = 0; break;"),"    case 1: for (i = 0; i < ".concat(S," - 1; i++) bw_cube_frame[i] = bw_cube_frame[i+1]; bw_cube_frame[").concat(S,"-1] = 0; break;"),'    case 2: for (i = 0; i < '+S+'; i++) bw_cube_frame[i] <<= 1; break;','    case 3: for (i = 0; i < '+S+'; i++) bw_cube_frame[i] >>= 1; break;',"    default: break;  /* forward/back need the voxel map */",'    }','}','',"static void bw_cube_fill_column(int x, int y, int colour)",'{',"    int z; for (z = 0; z < ".concat(N,"; z++) bw_cube_set(x, y, z, colour);"),'}','',"static void bw_cube_fill_wall(int z, int colour)",'{',"    int x, y; for (y = 0; y < ".concat(N,"; y++) for (x = 0; x < ").concat(N,"; x++) bw_cube_set(x, y, z, colour);"),'}','','static void bw_cube_invert(void)','{',"    unsigned char i; for (i = 0; i < ".concat(S,"; i++) bw_cube_frame[i] = ~bw_cube_frame[i];"),'}','','static void bw_cube_hold(unsigned int ms) { bw_cube_scan(ms); }','');}// Device helper stubs — emitted inline when any devices_* block is used.
// These are no-op stubs that make the generated C COMPILE. On bare metal
// a real implementation would drive the peripheral; these record the
// intent so the simulator can read it, and on hardware they do nothing.
// Each carries a /* TODO */ comment saying what a real driver would do.
if(this._cUses.devices){out.push('/* ---- device helper stubs (emitted because devices_* blocks are used) ----',' * These are no-ops on the device target. A real implementation would',' * drive the peripheral via its protocol (I2C for LCD, PWM for servo,',' * pin toggling for shift registers, etc.). The stubs make the code',' * compile and record the call for the simulator. */');// Each stub carries a greppable BW_STUB: marker so the build tool
// can report them. grep 'BW_STUB:' on the generated C and echo to
// stderr — one line per stub, naming the block that will do nothing.
const stub=(sig,marker)=>"".concat(sig," { /* BW_STUB: ").concat(marker," \u2014 no-op on hardware */ }");const rstub=(sig,marker)=>"".concat(sig," { /* BW_STUB: ").concat(marker," */ return 0; }");// Servo: a real driver per core when _cUses.servo is set,
// otherwise fall back to the stub.
if(this._cUses.servo&&this._core==='arm'){out.push('/* Servo driver: PWM slice 0 at 50 Hz — servo 1 = GP16 (channel A),',' * servo 2 = GP17 (channel B). TOP 19999 at the 1 MHz slice clock is',' * a 20 ms frame, and CC is then the pulse width in MICROSECONDS',' * directly (500-2500). Slice 0 belongs to the servos: dimming on',' * GP16/GP17 in the same program would retune their frame. */','static int _servo_angle[2];','','static void bw_servo_set(int servo, int angle)','{','    uint32_t gpio, us;','    if (servo < 1 || servo > 2) return;','    if (angle < 0) angle = 0;','    if (angle > 180) angle = 180;','    _servo_angle[servo - 1] = angle;','    gpio = 15u + (uint32_t)servo;            /* 1 -> GP16, 2 -> GP17 */','    us = 500u + (uint32_t)angle * 2000u / 180u;','    BW_IOBANK0_CTRL(gpio) = 4u;              /* funcsel PWM */','    BW_PWM_DIV(0) = 125u << 4;               /* 1 MHz slice clock */','    BW_PWM_TOP(0) = 19999u;                  /* 20 ms frame */','    if (gpio & 1u) BW_PWM_CC(0) = (BW_PWM_CC(0) & 0xFFFFu) | (us << 16);','    else BW_PWM_CC(0) = (BW_PWM_CC(0) & 0xFFFF0000u) | us;','    BW_PWM_CSR(0) = 1u;','}','','static int bw_servo_get(int servo)','{ return (servo >= 1 && servo <= 2) ? _servo_angle[servo - 1] : 0; }','');}else if(this._cUses.servo&&this._core==='avr'&&this._cMega){out.push('/* Servo driver: Timer 1 in mode 14 (fast PWM, ICR1 TOP) at 50 Hz —',' * Mega routing: servo 1 = D11 (OC1A/PB5), servo 2 = D12 (OC1B/PB6).',' * Prescaler 8 gives 0.5 µs ticks: ICR1 = 39999 is 20 ms and',' * OCR1x = 2 × pulse-µs. Timer 1 belongs to the servos here. */','static int _servo_angle[2];','','static void bw_servo_set(int servo, int angle)','{','    unsigned int us;','    if (servo < 1 || servo > 2) return;','    if (angle < 0) angle = 0;','    if (angle > 180) angle = 180;','    _servo_angle[servo - 1] = angle;','    us = (unsigned int)(500u + (unsigned long)angle * 2000u / 180u);','    if (servo == 1) { TCCR1A |= (1 << COM1A1); OCR1A = us * 2u; }','    else            { TCCR1A |= (1 << COM1B1); OCR1B = us * 2u; }','}','','static int bw_servo_get(int servo)','{ return (servo >= 1 && servo <= 2) ? _servo_angle[servo - 1] : 0; }','');}else if(this._cUses.servo&&this._core==='avr'){out.push('/* Servo driver: Timer 1 in mode 14 (fast PWM, ICR1 TOP) at 50 Hz —',' * servo 1 = D9 (OC1A), servo 2 = D10 (OC1B). Prescaler 8 gives',' * 0.5 µs ticks: ICR1 = 39999 is 20 ms and OCR1x = 2 × pulse-µs.',' * Timer 1 belongs to the servos in this program (bw_setup put it',' * in mode 14, not the dimmer\'s 8-bit mode). */','static int _servo_angle[2];','','static void bw_servo_set(int servo, int angle)','{','    unsigned int us;','    if (servo < 1 || servo > 2) return;','    if (angle < 0) angle = 0;','    if (angle > 180) angle = 180;','    _servo_angle[servo - 1] = angle;','    us = (unsigned int)(500u + (unsigned long)angle * 2000u / 180u);','    if (servo == 1) { TCCR1A |= (1 << COM1A1); OCR1A = us * 2u; }','    else            { TCCR1A |= (1 << COM1B1); OCR1B = us * 2u; }','}','','static int bw_servo_get(int servo)','{ return (servo >= 1 && servo <= 2) ? _servo_angle[servo - 1] : 0; }','');}else if(this._cUses.servo){// PCA module 0 on P1.3, 16-bit software-timer mode.
// At FOSC/12 (921.6 kHz for 11.0592 MHz), 20 ms = 18432 counts.
// Pulse: 500 µs (0°) = 461 counts, 2500 µs (180°) = 2304 counts.
// The ISR toggles the pin: high at frame start, low at the pulse end.
out.push('/* Servo driver: PCA module 0 in 16-bit compare/match mode (50 Hz). */','/* Pin: P1.3 (CCP0). Note: P1.3 is also the ADC example pin — a */','/* project using both servo and ADC on P1.3 would conflict. CCP1 on */','/* P1.4 is available as an alternative. */','/* FOSC/12 clock: 20 ms = FOSC_HZ/12/50 counts. Pulse: 500-2500 µs. */','#define SERVO_PERIOD  ((unsigned int)(FOSC_HZ / 12UL / 50UL))','#define SERVO_MIN_US  500','#define SERVO_MAX_US  2500','static unsigned int _servo_pulse;   /* pulse width in timer counts */','static unsigned int _servo_phase;   /* 0 = rising edge, 1 = falling */','static int _servo_angle;','','static void bw_servo_set(int servo, int angle)','{','    unsigned long us;','    (void)servo;','    if (angle < 0) angle = 0;','    if (angle > 180) angle = 180;','    _servo_angle = angle;','    us = SERVO_MIN_US + (unsigned long)angle * (SERVO_MAX_US - SERVO_MIN_US) / 180;','    _servo_pulse = (unsigned int)(us * (FOSC_HZ / 12UL) / 1000000UL);','}','','static int bw_servo_get(int servo) { (void)servo; return _servo_angle; }','','/* PCA ISR: toggles the servo pin at the pulse edges. */','/* Module 0 match flag (CCF0) fires twice per period: */','/*   phase 0: set pin HIGH, schedule falling edge at +_servo_pulse */','/*   phase 1: set pin LOW,  schedule rising edge at +(PERIOD-pulse) */','void bw_pca_isr(void) __interrupt(7)','{','    unsigned int next;','    if (!(CCON & 0x01)) return;  /* not CCF0 */','    CCON &= ~0x01;               /* clear CCF0 */','    if (_servo_phase == 0) {','        P1_3 = 1;                /* pulse start */','        next = ((unsigned int)CCAP0H << 8) | CCAP0L;','        next += _servo_pulse;','        CCAP0L = (unsigned char)(next & 0xFF);','        CCAP0H = (unsigned char)(next >> 8);','        _servo_phase = 1;','    } else {','        P1_3 = 0;                /* pulse end */','        next = ((unsigned int)CCAP0H << 8) | CCAP0L;','        next += SERVO_PERIOD - _servo_pulse;','        CCAP0L = (unsigned char)(next & 0xFF);','        CCAP0H = (unsigned char)(next >> 8);','        _servo_phase = 0;','    }','}','');}else{out.push(stub('static void bw_servo_set(int servo, int angle)','devices_setservo'),rstub('static int bw_servo_get(int servo)','devices_servoangle'));}// Motor driver: 8-bit PCA PWM for speed (no ISR, no compare/match),
// plain GPIO for direction through an L293D-style H-bridge.
// PCA module 1 (CCP1 on P1.4) — module 0 is reserved for servo.
// Direction pins: P3.4 (IN1) and P3.5 (IN2) — these are the free
// port 3 pins on every STC12 dev board.
//   forward: IN1=1, IN2=0    reverse: IN1=0, IN2=1
//   brake:   IN1=1, IN2=1    coast:   IN1=0, IN2=0
if(this._cUses.motor&&this._core==='arm'){out.push('/* DC motor driver: GP18 (PWM slice 1A) carries speed at 1 kHz;',' * direction is GP19 (IN1) and GP20 (IN2) into an L293D-style',' * H-bridge — the 8051 build\'s P3.4/P3.5 convention in Pico',' * spelling. The servo\'s slice 0 (GP16/GP17) is untouched. */','static int _motor_speed;','static int _motor_dir;','','static void bw_motor_speed(int motor, int speed)','{','    (void)motor;','    if (speed < 0) speed = 0;','    if (speed > 100) speed = 100;','    _motor_speed = speed;','    pwm_set(18, (unsigned int)speed);   /* GP18 = slice 1 A */','}','','static int bw_motor_get_speed(int motor) { (void)motor; return _motor_speed; }','','/* Direction: 0=forward 1=reverse 2=brake 3=coast */','static void bw_motor_dir(int motor, int dir)','{','    (void)motor;','    _motor_dir = dir;','    BW_IOBANK0_CTRL(19) = 5u;','    BW_IOBANK0_CTRL(20) = 5u;','    BW_SIO_GPIO_OE_SET = (1UL << 19) | (1UL << 20);','    switch (dir) {','    case 0: BW_SIO_GPIO_OUT_SET = (1UL << 19); BW_SIO_GPIO_OUT_CLR = (1UL << 20); break;','    case 1: BW_SIO_GPIO_OUT_CLR = (1UL << 19); BW_SIO_GPIO_OUT_SET = (1UL << 20); break;','    case 2: BW_SIO_GPIO_OUT_SET = (1UL << 19) | (1UL << 20); break;','    default: BW_SIO_GPIO_OUT_CLR = (1UL << 19) | (1UL << 20); break;','    }','}','','static int bw_motor_get_dir(int motor) { (void)motor; return _motor_dir; }','');}else if(this._cUses.motor&&this._core==='avr'&&this._cMega){out.push('/* DC motor driver, Mega routing: OC2B (D9/PH6) carries speed PWM',' * at 977 Hz; direction is D7 (PH4, IN1) and D8 (PH5, IN2) into',' * an L293D-style H-bridge. */','static int _motor_speed;','static int _motor_dir;','','static void bw_motor_speed(int motor, int speed)','{','    (void)motor;','    if (speed < 0) speed = 0;','    if (speed > 100) speed = 100;','    _motor_speed = speed;','    pwm_set(9, (unsigned int)speed);   /* OC2B = D9 on the Mega */','}','','static int bw_motor_get_speed(int motor) { (void)motor; return _motor_speed; }','','/* Direction: 0=forward 1=reverse 2=brake 3=coast. D7=PH4, D8=PH5. */','static void bw_motor_dir(int motor, int dir)','{','    (void)motor;','    _motor_dir = dir;','    DDRH |= (1 << 4) | (1 << 5);','    switch (dir) {','    case 0: PORTH |= (1 << 4);  PORTH &= (uint8_t)~(1 << 5); break;','    case 1: PORTH &= (uint8_t)~(1 << 4); PORTH |= (1 << 5); break;','    case 2: PORTH |= (1 << 4) | (1 << 5); break;','    default: PORTH &= (uint8_t)~((1 << 4) | (1 << 5)); break;','    }','}','','static int bw_motor_get_dir(int motor) { (void)motor; return _motor_dir; }','');}else if(this._cUses.motor&&this._core==='avr'){out.push('/* DC motor driver: OC2B (D3) carries speed PWM at 977 Hz;',' * direction is D7 (IN1) and D8 (IN2) into an L293D-style',' * H-bridge — the 8051 build\'s P3.4/P3.5 convention in Arduino',' * spelling. Timer 2 is shared with dimmers; the servo\'s',' * Timer 1 is untouched. */','static int _motor_speed;','static int _motor_dir;','','static void bw_motor_speed(int motor, int speed)','{','    (void)motor;','    if (speed < 0) speed = 0;','    if (speed > 100) speed = 100;','    _motor_speed = speed;','    pwm_set(3, (unsigned int)speed);   /* OC2B = D3 */','}','','static int bw_motor_get_speed(int motor) { (void)motor; return _motor_speed; }','','/* Direction: 0=forward 1=reverse 2=brake 3=coast.',' * D7 = PD7 (IN1), D8 = PB0 (IN2). */','static void bw_motor_dir(int motor, int dir)','{','    (void)motor;','    _motor_dir = dir;','    DDRD |= (1 << 7);','    DDRB |= (1 << 0);','    switch (dir) {','    case 0: PORTD |= (1 << 7);  PORTB &= (uint8_t)~(1 << 0); break;','    case 1: PORTD &= (uint8_t)~(1 << 7); PORTB |= (1 << 0); break;','    case 2: PORTD |= (1 << 7);  PORTB |= (1 << 0); break;','    default: PORTD &= (uint8_t)~(1 << 7); PORTB &= (uint8_t)~(1 << 0); break;','    }','}','','static int bw_motor_get_dir(int motor) { (void)motor; return _motor_dir; }','');}else if(this._cUses.motor){out.push('/* DC motor driver: PCA module 1 (CCP1, P1.4) in 8-bit PWM mode. */','/* No ISR needed — the hardware toggles the pin autonomously. */','/* Direction: P3.4 (IN1) and P3.5 (IN2) for L293D H-bridge. */','#define MOTOR_IN1  P3_4','#define MOTOR_IN2  P3_5','static int _motor_speed;','static int _motor_dir;','','static void bw_motor_speed(int motor, int speed)','{','    (void)motor;','    if (speed < 0) speed = 0;','    if (speed > 100) speed = 100;','    _motor_speed = speed;','    pwm_set(1, (unsigned int)speed);   /* PCA module 1 (CCP1/P1.4) */','}','','static int bw_motor_get_speed(int motor) { (void)motor; return _motor_speed; }','','/* Direction: 0=forward 1=reverse 2=brake 3=coast */','static void bw_motor_dir(int motor, int dir)','{','    (void)motor;','    _motor_dir = dir;','    switch (dir) {','        case 0: MOTOR_IN1 = 1; MOTOR_IN2 = 0; break;  /* forward */','        case 1: MOTOR_IN1 = 0; MOTOR_IN2 = 1; break;  /* reverse */','        case 2: MOTOR_IN1 = 1; MOTOR_IN2 = 1; break;  /* brake */','        default: MOTOR_IN1 = 0; MOTOR_IN2 = 0; break; /* coast */','    }','}','','static int bw_motor_get_dir(int motor) { (void)motor; return _motor_dir; }','');}else{out.push(stub('static void bw_motor_speed(int motor, int speed)','devices_setmotor'),rstub('static int bw_motor_get_speed(int motor)','devices_motorspeed'),stub('static void bw_motor_dir(int motor, int dir)','devices_setdirection'),rstub('static int bw_motor_get_dir(int motor)','devices_motordirection'));}// Relay driver: single GPIO pin drives a transistor that energizes the coil.
// P2.0 default — any output pin works; the 8051 sinks current through an
// NPN base, so relay ON = pin LOW (active-low, same as LEDs).
if(this._cUses.relay){out.push('/* Relay / generic actuator: GPIO pin drives transistor → coil. */','/* P2.0 default.  Active-low: pin LOW = relay ON. */','#define RELAY_PIN  P2_0','static int _relay_state;','','static void bw_relay_set(int relay, int on)','{','    (void)relay;','    _relay_state = on;','    RELAY_PIN = on ? 0 : 1;           /* active-low */','}','','static int bw_energised(int d) { (void)d; return _relay_state; }','','/* activate/deactivate are relay aliases. */','static void bw_device_activate(int dev) { bw_relay_set(dev, 1); }','static void bw_device_deactivate(int dev) { bw_relay_set(dev, 0); }','');}else{out.push(stub('static void bw_relay_set(int relay, int on)','devices_setrelay'),stub('static void bw_device_activate(int dev)','devices_activate'),stub('static void bw_device_deactivate(int dev)','devices_deactivate'),rstub('static int bw_energised(int d)','devices_energised'));}// Button / digital contact closure: GPIO read with pull-up.
// P3.2 (INT0) is the canonical button pin on STC12 dev boards.
// Active-low: pressed = pin LOW (button shorts to GND).
// Motion and tilt sensors are the same behaviour class (contact closure).
if(this._cUses.button){out.push('/* Button / contact closure: active-low GPIO read. */','/* P3.2 (INT0) default.  Pressed = pin LOW. */','#define BUTTON_PIN  P3_2','','static int bw_pressed(int btn) { (void)btn; return !BUTTON_PIN; }','static int bw_motion(int s) { (void)s; return !BUTTON_PIN; }','static int bw_tilted(int s) { (void)s; return !BUTTON_PIN; }','');}else{out.push(rstub('static int bw_pressed(int btn)','devices_pressed'),rstub('static int bw_motion(int s)','devices_motion'),rstub('static int bw_tilted(int s)','devices_tilted'));}// Analog sensors: ADC read + scaling.  All four behaviour classes
// (3-pin voltage, 2-pin resistance divider) reduce to adc_read().
// Default channel: P1.1 (ADC channel 1).
//   temperature (TMP36): V = 10 mV/°C + 500 mV → °C = (mV - 500) / 10
//   light (LDR):  higher light → lower R → higher V → 0-100%
//   flex/force:   resistance divider, 0-1023 raw ADC value
if(this._cUses.sensor){out.push('/* Analog sensors: ADC channel 1 (P1.1) default. */','/* VERIFIED: ADC register sequence (P1ASF, ADC_CONTR handshake), */','/*   arithmetic (raw code → scaled value). */','/* NOT VERIFIED: analog path (voltage → ADC code) — bench only. */','/* TMP36: mV = ADC * 5000 / 1024; °C = (mV - 500) / 10. */','/* LDR / flex / force: percentage = ADC * 100 / 1023. */','#define SENSOR_CH  1','','static int bw_temperature(int s)','{','    unsigned int raw;','    (void)s;','    raw = adc_read(SENSOR_CH);','    /* TMP36 at 5V ref: mV = raw * 5000 / 1024, °C = (mV-500)/10 */','    return (int)((long)raw * 500 / 1024 - 50);','}','','static int bw_light(int s)','{','    (void)s;','    return (int)((unsigned long)adc_read(SENSOR_CH) * 100 / 1023);','}','','static int bw_flex(int s) { (void)s; return (int)adc_read(SENSOR_CH); }','static int bw_force(int s) { (void)s; return (int)adc_read(SENSOR_CH); }','','/* Threshold predicate: compare sensor reading against a value. */','static int bw_above(int s, int thr) { return bw_temperature(s) > thr; }','');}else{out.push(rstub('static int bw_temperature(int s)','devices_temperature'),rstub('static int bw_light(int s)','devices_light'),rstub('static int bw_flex(int s)','devices_flex'),rstub('static int bw_force(int s)','devices_force'),rstub('static int bw_above(int s, int thr)','devices_above'));}// Ultrasonic distance (HC-SR04): trigger pulse + echo timing.
// P3.6 (trigger), P3.7 (echo).  Timer 1 mode 1 measures the echo.
// Distance = echo_us / 58 cm.
if(this._cUses.ultrasonic){out.push('/* Ultrasonic distance (HC-SR04): P3.6 trig, P3.7 echo. */','/* VERIFIED: Timer 1 mode 1 timing, arithmetic. */','/* NOT VERIFIED: analog echo threshold — bench only. */','#define US_TRIG  P3_6','#define US_ECHO  P3_7','','static int bw_distance(int s)','{','    unsigned int ticks;','    unsigned int reload;','    (void)s;','    /* Timer 1 at FOSC/12 for ALL timing — identical on 1T and 12T cores.','     * Never count instructions: same source, different core, wrong time.','     * 10 µs trigger: FOSC/12/100000 ticks ≈ 9 at 11.0592 MHz. */','    TMOD = (TMOD & 0x0F) | 0x10;  /* Timer 1, mode 1 */','    /* 10 µs trigger pulse via Timer 1 */','    reload = (unsigned int)(65536UL - FOSC_HZ / 12UL / 100000UL);','    US_TRIG = 0;','    US_TRIG = 1;','    TL1 = (unsigned char)(reload & 0xFF);','    TH1 = (unsigned char)(reload >> 8);','    TF1 = 0; TR1 = 1;','    while (!TF1) ;','    TR1 = 0;','    US_TRIG = 0;','    /* Wait for echo HIGH (timeout ~60 ms = no object) */','    TL1 = 0; TH1 = 0; TF1 = 0;','    TR1 = 1;','    while (!US_ECHO && !TF1) ;','    if (TF1) { TR1 = 0; return 999; }  /* timeout: no object */','    /* Measure echo pulse width */','    TL1 = 0; TH1 = 0; TF1 = 0;','    while (US_ECHO && !TF1) ;','    TR1 = 0;','    ticks = ((unsigned int)TH1 << 8) | TL1;','    /* cm = ticks * (12 / FOSC_HZ) * 1e6 / 58 */','    return (int)((unsigned long)ticks * 12UL * 1000000UL / (FOSC_HZ * 58UL));','}','','static int bw_closer(int s, int dist) { return bw_distance(s) < dist; }','');}else{out.push(rstub('static int bw_distance(int s)','devices_distance'),rstub('static int bw_closer(int s, int dist)','devices_closer'));}// WS2812 NeoPixel: 800 kHz bit-timed via inline assembly.
// 1T ONLY — 12T cores cannot meet the ±150 ns timing windows
// because a single 12T machine cycle (1085 ns at 11.0592 MHz)
// exceeds the entire 0-bit HIGH window (250-550 ns).
// Pin: P1.5.  Buffer: 8 pixels max (24 bytes GRB, RAM is precious).
if(this._cUses.neopixel){if(!chip.aux1T){this.cWarn('WS2812 NeoPixel requires a 1T core — 12T cannot meet the 800 kHz timing');collision('WS2812 NeoPixel is unavailable on '+device+' (12T core)');}// Timing is hand-counted for 11.0592 MHz 1T (90 ns/cy).
// At very different clocks the NOP counts would need adjusting.
const cyNs=chip.aux1T?1e9/clock:12e9/clock;if(chip.aux1T&&(cyNs<50||cyNs>120)){this.cWarn("WS2812 timing tuned for 11.0592 MHz; at ".concat((clock/1e6).toFixed(3)," MHz pulse widths may drift"));}out.push('/* WS2812B NeoPixel: 800 kHz bitbang via inline assembly (1T only). */','/* Pin: P1.5.  Measured by ucsim-stc fbc15bf (category 2b): */','/*   T0H = 362 ns (250-550)  T0L = 814 ns (700-1000) */','/*   T1H = 814 ns (650-950)  T1L = 452 ns (300-600) */','/*   72 bits, 9 bytes, all sent.  Moves to cat 1 with silicon. */','/* 12T CANNOT DO THIS: 1 cycle = 1085 ns > entire 0-bit window. */','/* Interrupts disabled during send — any ISR breaks bit timing. */','/* A timer-timed pulse carries instruction overhead on top, so a */','/* device with an upper bound needs that overhead counted. Here the */','/* instruction IS the timing; there is no timer to defer to. */','#define NEO_PIN  P1_5','#define NEO_MAX  8','static unsigned char _neo_buf[NEO_MAX * 3];','static unsigned char _neo_count;','','static void bw_neo_byte(unsigned char val)','{','    /* Load byte into accumulator via C — works regardless of SDCC */','    /* calling convention (static functions do NOT use DPL). */','    ACC = val;','    __asm','    push ar7             ; save caller R7 (SDCC loop counter)','    mov  r7, #8','00201$:','    setb 0x95           ; 1  P1.5 HIGH','    rlc  a              ; 1  MSB -> C','    jc   00202$         ; 2  branch if 1-bit','    clr  0x95           ; 1  P1.5 LOW  (T0H = 4 cy = 362 ns)','    nop','    nop','    nop','    nop','    nop','    nop                 ;    T0L = 9 cy = 814 ns','    djnz r7, 00201$     ; 2','    pop  ar7            ; restore caller R7','    sjmp 00203$         ; exit','00202$:','    nop                 ;    T1H continues...','    nop','    nop','    nop','    nop','    clr  0x95           ; 1  P1.5 LOW  (T1H = 10 cy = 904 ns)','    nop                 ;    T1L = 4 cy = 362 ns','    nop','    djnz r7, 00201$     ; 2','    pop  ar7            ; restore caller R7','00203$:','    __endasm;','}','','static void bw_neo_send(void)','{','    unsigned char i, n;','    n = _neo_count * 3;','    EA = 0;','    for (i = 0; i < n; i++) bw_neo_byte(_neo_buf[i]);','    EA = 1;','}','','static void bw_neopixel_set(int s, int idx, int r, int g, int b)','{','    (void)s;','    if (idx < 0 || idx >= _neo_count) return;','    _neo_buf[idx * 3]     = (unsigned char)(g > 255 ? 255 : g < 0 ? 0 : g);','    _neo_buf[idx * 3 + 1] = (unsigned char)(r > 255 ? 255 : r < 0 ? 0 : r);','    _neo_buf[idx * 3 + 2] = (unsigned char)(b > 255 ? 255 : b < 0 ? 0 : b);','    bw_neo_send();','}','','static void bw_neopixel_clear(int s)','{','    unsigned char i;','    (void)s;','    for (i = 0; i < _neo_count * 3; i++) _neo_buf[i] = 0;','    bw_neo_send();','}','');}else{out.push(stub('static void bw_neopixel_set(int s, int i, int r, int g, int b)','devices_setneopixel'),stub('static void bw_neopixel_clear(int s)','devices_clearneopixels'));}// I2C LCD (HD44780 via PCF8574 backpack): bit-banged I2C, 4-bit mode.
// First bidirectional protocol in this project. Open-drain SDA/SCL.
// SIMULATOR LIMIT: the board model decodes I2C bytes but does NOT
// drive SDA for ACK — the driver proceeds without ACK check, which
// is correct for write-only devices (LCD). The data reaches the
// model regardless; the ACK is unverifiable in simulation.
// Shared I2C bus primitives — used by LCD (PCF8574) and OLED (SSD1306).
// Gated by _cUses.lcd || _cUses.oled so only one copy is emitted
// regardless of how many I2C devices a program drives.
if(this._cUses.lcd||this._cUses.oled){// I2C pin-primitive macros — per-core flavor.
// The driver body below calls I2C_SDA_HI()/LO(), I2C_SCL_HI()/LO()
// instead of assignment, so the same code works with 8051 sbit,
// 6502 VIA shadow-byte, AVR port-bit, and ARM SIO.
if(this._core==='6502'){// 6502/VIA: shadow byte + single-store.  ORA |= mask on the
// VIA reads the INPUT pins, not the output latch — an RMW on
// the register is the well-known VIA trap.  A shadow byte in
// RAM avoids it: modify shadow, write shadow to the port.
// SDA and SCL must be on the SAME port (the natural wiring).
const sdaPin=pins.find(p=>p.name.toLowerCase()==='sda');const sclPin=pins.find(p=>p.name.toLowerCase()==='scl');const sdaHw=sdaPin?this.viaHw(sdaPin):null;const sclHw=sclPin?this.viaHw(sclPin):null;if(!sdaHw)this.cWarn('I2C driver needs a pin named "sda" on a VIA port');if(!sclHw)this.cWarn('I2C driver needs a pin named "scl" on a VIA port');const port=sdaHw&&sdaHw.port||'A';const sdaBit=sdaHw?sdaHw.bit:0;const sclBit=sclHw?sclHw.bit:1;out.push("/* I2C bus: bit-banged via W65C22 VIA port ".concat(port," (shadow-byte RMW). */"),"#define I2C_SDA_MASK (1u << ".concat(sdaBit,")"),"#define I2C_SCL_MASK (1u << ".concat(sclBit,")"),"static unsigned char _i2c_sh;  /* shadow for BW_VIA_OR".concat(port," */"),"#define I2C_SDA_HI() (_i2c_sh |= I2C_SDA_MASK, BW_VIA_OR".concat(port," = _i2c_sh)"),"#define I2C_SDA_LO() (_i2c_sh &= (unsigned char)~I2C_SDA_MASK, BW_VIA_OR".concat(port," = _i2c_sh)"),"#define I2C_SCL_HI() (_i2c_sh |= I2C_SCL_MASK, BW_VIA_OR".concat(port," = _i2c_sh)"),"#define I2C_SCL_LO() (_i2c_sh &= (unsigned char)~I2C_SCL_MASK, BW_VIA_OR".concat(port," = _i2c_sh)"),'');}else if(this._core==='avr'){var _project$stc;// AVR: BW_BIT lvalue gives the open-drain idiom its lvalue.
const i2cSrc=(project===null||project===void 0||(_project$stc=project.stc)===null||_project$stc===void 0?void 0:_project$stc.pins)||[];const findPin=n=>i2cSrc.find(q=>q.name.toLowerCase()===n);const sdaPin=findPin('sda'),sclPin=findPin('scl');const table=this._cMega?SB3Creator.AVR_PINS_MEGA:SB3Creator.AVR_PINS;const m1=sdaPin&&table[String(sdaPin.where||'').toUpperCase()];const m2=sclPin&&table[String(sclPin.where||'').toUpperCase()];if(m1&&m2){out.push('struct __bw_bits2 { uint8_t b0:1, b1:1, b2:1, b3:1, b4:1, b5:1, b6:1, b7:1; };','#ifndef BW_BIT','#define BW_BIT(port, bit) (((volatile struct __bw_bits2 *)&(port))->b##bit)','#endif',"#define I2C_SDA_HI() (BW_BIT(PORT".concat(m1[0],", ").concat(m1[1],") = 1)"),"#define I2C_SDA_LO() (BW_BIT(PORT".concat(m1[0],", ").concat(m1[1],") = 0)"),"#define I2C_SCL_HI() (BW_BIT(PORT".concat(m2[0],", ").concat(m2[1],") = 1)"),"#define I2C_SCL_LO() (BW_BIT(PORT".concat(m2[0],", ").concat(m2[1],") = 0)"),'');}else{this.cWarn('I2C on AVR needs pins named "sda" and "scl" — declare them as OUTPUT pins');out.push('#define I2C_SDA_HI() ((void)0)','#define I2C_SDA_LO() ((void)0)','#define I2C_SCL_HI() ((void)0)','#define I2C_SCL_LO() ((void)0)','');}}else if(this._core==='arm'){var _project$stc2;// RP2040: SIO GPIO_OUT byte-addressed bitfield view.
const i2cSrc=(project===null||project===void 0||(_project$stc2=project.stc)===null||_project$stc2===void 0?void 0:_project$stc2.pins)||[];const findPin=n=>i2cSrc.find(q=>q.name.toLowerCase()===n);const sdaPin=findPin('sda'),sclPin=findPin('scl');const h1=sdaPin&&this.armHw(sdaPin);const h2=sclPin&&this.armHw(sclPin);if(h1&&h2){const ref=g=>"BW_BIT((*(volatile unsigned char *)0x".concat((0xd0000010+(g>>3)).toString(16),"u), ").concat(g&7,")");out.push('struct __bw_bits2 { unsigned char b0:1, b1:1, b2:1, b3:1, b4:1, b5:1, b6:1, b7:1; };','#ifndef BW_BIT','#define BW_BIT(port, bit) (((volatile struct __bw_bits2 *)&(port))->b##bit)','#endif',"#define I2C_SDA_HI() (".concat(ref(h1.gpio)," = 1)"),"#define I2C_SDA_LO() (".concat(ref(h1.gpio)," = 0)"),"#define I2C_SCL_HI() (".concat(ref(h2.gpio)," = 1)"),"#define I2C_SCL_LO() (".concat(ref(h2.gpio)," = 0)"),'');}else{this.cWarn('I2C on the Pico needs pins named "sda" and "scl" on GP0-GP28');out.push('#define I2C_SDA_HI() ((void)0)','#define I2C_SDA_LO() ((void)0)','#define I2C_SCL_HI() ((void)0)','#define I2C_SCL_LO() ((void)0)','');}}else if(this._core==='z80'){// Z80: shadow byte + OUT to the latch port, same discipline
// as the 6502 VIA shadow. SDA/SCL on OUT port bits.
const sdaPin=pins.find(p=>p.name.toLowerCase()==='sda');const sclPin=pins.find(p=>p.name.toLowerCase()==='scl');const sdaBit=sdaPin?this.z80Hw(sdaPin):0;const sclBit=sclPin?this.z80Hw(sclPin):1;out.push('/* I2C bus: bit-banged via Z80 OUT latch (shadow-byte RMW). */',"#define I2C_SDA_MASK (1u << ".concat(sdaBit,")"),"#define I2C_SCL_MASK (1u << ".concat(sclBit,")"),'/* _z80_sh is the OUT latch shadow, already declared in the header. */','#define I2C_SDA_HI() (_z80_sh |= I2C_SDA_MASK, BW_PORT_OUT = _z80_sh)','#define I2C_SDA_LO() (_z80_sh &= (unsigned char)~I2C_SDA_MASK, BW_PORT_OUT = _z80_sh)','#define I2C_SCL_HI() (_z80_sh |= I2C_SCL_MASK, BW_PORT_OUT = _z80_sh)','#define I2C_SCL_LO() (_z80_sh &= (unsigned char)~I2C_SCL_MASK, BW_PORT_OUT = _z80_sh)','');}else{// 8051: resolve from declared sda/scl pins, default P2.1/P2.2.
let sdaRef='P2_1',sclRef='P2_2';const sdaPin=pins.find(p=>p.name.toLowerCase()==='sda');const sclPin=pins.find(p=>p.name.toLowerCase()==='scl');if(sdaPin&&sdaPin.port!==undefined)sdaRef="P".concat(sdaPin.port,"_").concat(sdaPin.bit);if(sclPin&&sclPin.port!==undefined)sclRef="P".concat(sclPin.port,"_").concat(sclPin.bit);out.push("/* I2C bus: bit-banged, SDA/SCL from the declared pins (open-drain). */","#define I2C_SDA_HI() (".concat(sdaRef," = 1)"),"#define I2C_SDA_LO() (".concat(sdaRef," = 0)"),"#define I2C_SCL_HI() (".concat(sclRef," = 1)"),"#define I2C_SCL_LO() (".concat(sclRef," = 0)"),'');}// Delay — core-aware loop count.
if(this._core==='6502'){const loops=Math.max(2,Math.ceil(clock*4.7e-6/10));out.push("/* I2C timing: t_LOW \u2265 4.7 \xB5s (100 kHz standard mode). */","static void i2c_delay(void) { unsigned char i; for (i = 0; i < ".concat(loops,"; i++) ; }"));}else{out.push("/* I2C timing: t_LOW \u2265 4.7 \xB5s (100 kHz standard mode). */","static void i2c_delay(void) { unsigned char i; for (i = 0; i < ".concat(chip.aux1T?Math.ceil(clock*4.7e-6/2):Math.max(2,Math.ceil(clock/12*4.7e-6/2)),"; i++) ; }"));}// Driver body — uses HI/LO primitives, core-neutral.
out.push('static void i2c_start(void) { I2C_SDA_HI(); I2C_SCL_HI(); i2c_delay(); I2C_SDA_LO(); i2c_delay(); I2C_SCL_LO(); }','static void i2c_stop(void)  { I2C_SDA_LO(); I2C_SCL_HI(); i2c_delay(); I2C_SDA_HI(); i2c_delay(); }','static void i2c_write(unsigned char dat)','{','    unsigned char i;','    for (i = 0; i < 8; i++) {','        if (dat & 0x80) I2C_SDA_HI(); else I2C_SDA_LO();','        dat <<= 1;','        I2C_SCL_HI(); i2c_delay(); I2C_SCL_LO(); i2c_delay();','    }','    /* ACK clock — we do not check the ACK (write-only devices). */','    I2C_SDA_HI(); I2C_SCL_HI(); i2c_delay(); I2C_SCL_LO(); i2c_delay();','}','');}// LCD (HD44780 via PCF8574 I2C backpack)
if(this._cUses.lcd){out.push('#define LCD_ADDR 0x27   /* PCF8574 default */','','/* Send a byte to the PCF8574 at LCD_ADDR. */','static void lcd_i2c_send(unsigned char val)','{','    i2c_start();','    i2c_write((unsigned char)(LCD_ADDR << 1));  /* address + W */','    i2c_write(val);','    i2c_stop();','}','','/* PCF8574 bit layout: D7 D6 D5 D4 BL EN RW RS */','static void lcd_nibble(unsigned char nib, unsigned char rs)','{','    unsigned char val = (unsigned char)((nib & 0xF0) | 0x08 | rs);  /* BL=1 */','    lcd_i2c_send((unsigned char)(val | 0x04));   /* EN=1 */','    lcd_i2c_send((unsigned char)(val & ~0x04));  /* EN=0 */','}','','static void lcd_cmd(unsigned char cmd)','{','    lcd_nibble((unsigned char)(cmd & 0xF0), 0);','    lcd_nibble((unsigned char)((cmd << 4) & 0xF0), 0);','}','','static void lcd_data(unsigned char dat)','{','    lcd_nibble((unsigned char)(dat & 0xF0), 1);','    lcd_nibble((unsigned char)((dat << 4) & 0xF0), 1);','}','','static void bw_lcd_print_s(int disp, const char *s)','{','    (void)disp;','    while (*s) lcd_data((unsigned char)*s++);','}','','static void bw_lcd_print_n(int disp, long n)','{','    char buf[12]; unsigned char i = 0; unsigned long u;','    (void)disp;','    if (n < 0) { lcd_data(0x2D); u = (unsigned long)(-n); }','    else u = (unsigned long)n;','    if (u == 0) { lcd_data(0x30); return; }','    while (u) { buf[i++] = (char)(0x30 + (u % 10)); u /= 10; }','    while (i) lcd_data((unsigned char)buf[--i]);','}','','static void bw_lcd_cursor(int disp, int row, int col)','{','    (void)disp;','    lcd_cmd((unsigned char)(0x80 | ((row & 1) ? 0x40 : 0x00) | (col & 0x0F)));','}','','static void bw_lcd_clear(int disp) { (void)disp; lcd_cmd(0x01); }','');}else{out.push(stub('static void bw_lcd_print_s(int disp, const char *s)','devices_lcdprint'),stub('static void bw_lcd_print_n(int disp, long n)','devices_lcdprint'),stub('static void bw_lcd_cursor(int disp, int row, int col)','devices_lcdcursor'),stub('static void bw_lcd_clear(int disp)','devices_lcdclear'));}// TFT (ILI9341, bit-banged SPI): gated by _cUses.tft.
if(this._cUses.tft){// Resolve the declared cs/dc/sck/mosi pins HERE, where the
// defines are emitted. The old resolution ran later (in the
// init section), so the defines always used the P1_0..P1_3
// DEFAULT — which happened to match the canonical 8051
// example and masked both the ordering bug and the missing
// AVR mapping entirely.
if(!this._tftPins){var _project$stc3;const tftPinsSrc=(project===null||project===void 0||(_project$stc3=project.stc)===null||_project$stc3===void 0?void 0:_project$stc3.pins)||[];const resolvedHere={};for(const name of['cs','dc','sck','mosi']){const pin=tftPinsSrc.find(q=>q.name.toLowerCase()===name);if(!pin)continue;if(this._core==='avr'){const table=this._cMega?SB3Creator.AVR_PINS_MEGA:SB3Creator.AVR_PINS;const m=table[String(pin.where||'').toUpperCase()];if(m)resolvedHere[name]="BW_BIT(PORT".concat(m[0],", ").concat(m[1],")");}else if(pin.port!==undefined){resolvedHere[name]="P".concat(pin.port,"_").concat(pin.bit);}}if(Object.keys(resolvedHere).length===4)this._tftPins=resolvedHere;}const tftPins=this._tftPins||{cs:'P1_0',dc:'P1_1',sck:'P1_2',mosi:'P1_3'};if(this._core==='avr'){out.push('/* sbit for AVR: a bitfield view of the port register gives the','   TFT driver its lvalue pin idiom (TFT_CS = 1) unchanged. */','struct __bw_bits { uint8_t b0:1, b1:1, b2:1, b3:1, b4:1, b5:1, b6:1, b7:1; };','#define BW_BIT(port, bit) (((volatile struct __bw_bits *)&(port))->b##bit)','');}out.push('/* ILI9341 TFT: bit-banged SPI (4-wire: CS, DC, SCK, MOSI). */','/* ILITEK ILI9341 datasheet V1.11 §7.1.9, §8.2.20-22. */',"#define TFT_CS   ".concat(tftPins.cs),"#define TFT_DC   ".concat(tftPins.dc),"#define TFT_SCK  ".concat(tftPins.sck),"#define TFT_MOSI ".concat(tftPins.mosi),'','static void tft_spi_write(unsigned char byte)','{','    unsigned char i;','    for (i = 0; i < 8; i++) {','        TFT_MOSI = (byte & 0x80) ? 1 : 0;','        byte <<= 1;','        TFT_SCK = 1; TFT_SCK = 0;','    }','}','','static void tft_cmd(unsigned char cmd)','{','    TFT_DC = 0; TFT_CS = 0;','    tft_spi_write(cmd);','    TFT_CS = 1;','}','','static void tft_data(unsigned char dat)','{','    TFT_DC = 1; TFT_CS = 0;','    tft_spi_write(dat);','    TFT_CS = 1;','}','','/* Address window (CASET + PASET), then RAMWR — §8.2.20-22. */','static void tft_set_window(unsigned int x0, unsigned int y0, unsigned int x1, unsigned int y1)','{','    tft_cmd(0x2A);  /* CASET */','    tft_data((unsigned char)(x0 >> 8)); tft_data((unsigned char)x0);','    tft_data((unsigned char)(x1 >> 8)); tft_data((unsigned char)x1);','    tft_cmd(0x2B);  /* PASET */','    tft_data((unsigned char)(y0 >> 8)); tft_data((unsigned char)y0);','    tft_data((unsigned char)(y1 >> 8)); tft_data((unsigned char)y1);','    tft_cmd(0x2C);  /* RAMWR */','}','','/* Write one RGB565 pixel (high byte first). */','static void tft_pixel16(unsigned int rgb565)','{','    TFT_DC = 1; TFT_CS = 0;','    tft_spi_write((unsigned char)(rgb565 >> 8));','    tft_spi_write((unsigned char)(rgb565 & 0xFF));','    TFT_CS = 1;','}','','/* Convert 8-bit RGB to RGB565. */','static unsigned int rgb565(int r, int g, int b)','{','    return (unsigned int)(((r & 0xF8) << 8) | ((g & 0xFC) << 3) | ((b & 0xF8) >> 3));','}','','static void bw_tft_pixel(int disp, int x, int y, int r, int g, int b)','{','    (void)disp;','    tft_set_window((unsigned int)x, (unsigned int)y, (unsigned int)x, (unsigned int)y);','    tft_pixel16(rgb565(r, g, b));','}','','static void bw_tft_fill(int disp, int x, int y, int w, int h, int r, int g, int b)','{','    unsigned int color = rgb565(r, g, b);','    long count = (long)w * h;','    long i;','    (void)disp;','    tft_set_window((unsigned int)x, (unsigned int)y,','                  (unsigned int)(x + w - 1), (unsigned int)(y + h - 1));','    TFT_DC = 1; TFT_CS = 0;','    for (i = 0; i < count; i++) {','        tft_spi_write((unsigned char)(color >> 8));','        tft_spi_write((unsigned char)(color & 0xFF));','    }','    TFT_CS = 1;','}','','static void bw_tft_clear(int disp) { bw_tft_fill(disp, 0, 0, 240, 320, 0, 0, 0); }','','static void bw_tft_print_s(int disp, const char *s)','{','    (void)disp; (void)s;','    /* Text rendering requires a font table — layer 2. */','}','','static void bw_tft_print_n(int disp, long n)','{','    (void)disp; (void)n;','    /* Text rendering requires a font table — layer 2. */','}','','static void bw_tft_cursor(int disp, int row, int col)','{','    (void)disp; (void)row; (void)col;','    /* Cursor positioning requires a font table — layer 2. */','}','');}else{out.push(stub('static void bw_tft_pixel(int d, int x, int y, int r, int g, int b)','devices_tftpixel'),stub('static void bw_tft_fill(int d, int x, int y, int w, int h, int r, int g, int b)','devices_tftfill'),stub('static void bw_tft_clear(int d)','devices_tftclear'),stub('static void bw_tft_print_s(int d, const char *s)','devices_tftprint'),stub('static void bw_tft_print_n(int d, long n)','devices_tftprint'),stub('static void bw_tft_cursor(int d, int row, int col)','devices_tftcursor'));}// OLED (SSD1306, I2C at 0x3C): gated by _cUses.oled.
// Uses the shared I2C primitives emitted above.
if(this._cUses.oled){out.push('/* SSD1306 OLED: 128x64, I2C at 0x3C, page addressing. */','#define OLED_ADDR 0x3C','#define OLED_W    128','#define OLED_H    64','#define OLED_PAGES (OLED_H / 8)','','static void oled_cmd(unsigned char cmd)','{','    i2c_start();','    i2c_write((unsigned char)(OLED_ADDR << 1));','    i2c_write(0x00);  /* control: Co=0 D/C#=0 → command */','    i2c_write(cmd);','    i2c_stop();','}','','static void oled_data_start(void)','{','    i2c_start();','    i2c_write((unsigned char)(OLED_ADDR << 1));','    i2c_write(0x40);  /* control: Co=0 D/C#=1 → data stream */','}','','/* 5x7 font — ASCII 0x20..0x7E (95 printable chars × 5 bytes). */','/* Public domain bitmap (Adafruit GFX lineage). */',"static const ".concat(this._core==='8051'?'__code':''," unsigned char font5x7[475] = {"),'    0x00,0x00,0x00,0x00,0x00, 0x00,0x00,0x5F,0x00,0x00,',// space, !
'    0x00,0x07,0x00,0x07,0x00, 0x14,0x7F,0x14,0x7F,0x14,',// ", #
'    0x24,0x2A,0x7F,0x2A,0x12, 0x23,0x13,0x08,0x64,0x62,',// $, %
'    0x36,0x49,0x55,0x22,0x50, 0x00,0x05,0x03,0x00,0x00,',// &, '
'    0x00,0x1C,0x22,0x41,0x00, 0x00,0x41,0x22,0x1C,0x00,',// (, )
'    0x14,0x08,0x3E,0x08,0x14, 0x08,0x08,0x3E,0x08,0x08,',// *, +
'    0x00,0x50,0x30,0x00,0x00, 0x08,0x08,0x08,0x08,0x08,',// ,, -
'    0x00,0x60,0x60,0x00,0x00, 0x20,0x10,0x08,0x04,0x02,',// ., /
'    0x3E,0x51,0x49,0x45,0x3E, 0x00,0x42,0x7F,0x40,0x00,',// 0, 1
'    0x42,0x61,0x51,0x49,0x46, 0x21,0x41,0x45,0x4B,0x31,',// 2, 3
'    0x18,0x14,0x12,0x7F,0x10, 0x27,0x45,0x45,0x45,0x39,',// 4, 5
'    0x3C,0x4A,0x49,0x49,0x30, 0x01,0x71,0x09,0x05,0x03,',// 6, 7
'    0x36,0x49,0x49,0x49,0x36, 0x06,0x49,0x49,0x29,0x1E,',// 8, 9
'    0x00,0x36,0x36,0x00,0x00, 0x00,0x56,0x36,0x00,0x00,',// :, ;
'    0x08,0x14,0x22,0x41,0x00, 0x14,0x14,0x14,0x14,0x14,',// <, =
'    0x00,0x41,0x22,0x14,0x08, 0x02,0x01,0x51,0x09,0x06,',// >, ?
'    0x32,0x49,0x79,0x41,0x3E, 0x7E,0x11,0x11,0x11,0x7E,',// @, A
'    0x7F,0x49,0x49,0x49,0x36, 0x3E,0x41,0x41,0x41,0x22,',// B, C
'    0x7F,0x41,0x41,0x22,0x1C, 0x7F,0x49,0x49,0x49,0x41,',// D, E
'    0x7F,0x09,0x09,0x09,0x01, 0x3E,0x41,0x49,0x49,0x7A,',// F, G
'    0x7F,0x08,0x08,0x08,0x7F, 0x00,0x41,0x7F,0x41,0x00,',// H, I
'    0x20,0x40,0x41,0x3F,0x01, 0x7F,0x08,0x14,0x22,0x41,',// J, K
'    0x7F,0x40,0x40,0x40,0x40, 0x7F,0x02,0x0C,0x02,0x7F,',// L, M
'    0x7F,0x04,0x08,0x10,0x7F, 0x3E,0x41,0x41,0x41,0x3E,',// N, O
'    0x7F,0x09,0x09,0x09,0x06, 0x3E,0x41,0x51,0x21,0x5E,',// P, Q
'    0x7F,0x09,0x19,0x29,0x46, 0x46,0x49,0x49,0x49,0x31,',// R, S
'    0x01,0x01,0x7F,0x01,0x01, 0x3F,0x40,0x40,0x40,0x3F,',// T, U
'    0x1F,0x20,0x40,0x20,0x1F, 0x3F,0x40,0x38,0x40,0x3F,',// V, W
'    0x63,0x14,0x08,0x14,0x63, 0x07,0x08,0x70,0x08,0x07,',// X, Y
'    0x61,0x51,0x49,0x45,0x43, 0x00,0x7F,0x41,0x41,0x00,',// Z, [
'    0x02,0x04,0x08,0x10,0x20, 0x00,0x41,0x41,0x7F,0x00,',// backslash, ]
'    0x04,0x02,0x01,0x02,0x04, 0x40,0x40,0x40,0x40,0x40,',// ^, _
'    0x00,0x01,0x02,0x04,0x00, 0x20,0x54,0x54,0x54,0x78,',// `, a
'    0x7F,0x48,0x44,0x44,0x38, 0x38,0x44,0x44,0x44,0x20,',// b, c
'    0x38,0x44,0x44,0x48,0x7F, 0x38,0x54,0x54,0x54,0x18,',// d, e
'    0x08,0x7E,0x09,0x01,0x02, 0x0C,0x52,0x52,0x52,0x3E,',// f, g
'    0x7F,0x08,0x04,0x04,0x78, 0x00,0x44,0x7D,0x40,0x00,',// h, i
'    0x20,0x40,0x44,0x3D,0x00, 0x7F,0x10,0x28,0x44,0x00,',// j, k
'    0x00,0x41,0x7F,0x40,0x00, 0x7C,0x04,0x18,0x04,0x78,',// l, m
'    0x7C,0x08,0x04,0x04,0x78, 0x38,0x44,0x44,0x44,0x38,',// n, o
'    0x7C,0x14,0x14,0x14,0x08, 0x08,0x14,0x14,0x18,0x7C,',// p, q
'    0x7C,0x08,0x04,0x04,0x08, 0x48,0x54,0x54,0x54,0x20,',// r, s
'    0x04,0x3F,0x44,0x40,0x20, 0x3C,0x40,0x40,0x20,0x7C,',// t, u
'    0x1C,0x20,0x40,0x20,0x1C, 0x3C,0x40,0x30,0x40,0x3C,',// v, w
'    0x44,0x28,0x10,0x28,0x44, 0x0C,0x50,0x50,0x50,0x3C,',// x, y
'    0x44,0x64,0x54,0x4C,0x44, 0x00,0x08,0x36,0x41,0x00,',// z, {
'    0x00,0x00,0x7F,0x00,0x00, 0x00,0x41,0x36,0x08,0x00,',// |, }
'    0x10,0x08,0x08,0x10,0x08',// ~
'};','','static void oled_set_page_col(unsigned char page, unsigned char col)','{','    oled_cmd((unsigned char)(0xB0 | (page & 0x07)));','    oled_cmd((unsigned char)(0x00 | (col & 0x0F)));','    oled_cmd((unsigned char)(0x10 | ((col >> 4) & 0x0F)));','}','','static void bw_oled_clear(int disp)','{','    unsigned int i;','    (void)disp;','    /* Horizontal mode for bulk write, then back to page mode. */','    oled_cmd(0x20); oled_cmd(0x00);  /* horizontal addressing */','    oled_cmd(0x21); oled_cmd(0x00); oled_cmd(0x7F);  /* col 0-127 */','    oled_cmd(0x22); oled_cmd(0x00); oled_cmd(0x07);  /* page 0-7 */','    oled_data_start();','    for (i = 0; i < 1024; i++) i2c_write(0x00);','    i2c_stop();','    oled_cmd(0x20); oled_cmd(0x02);  /* back to page mode */','    oled_set_page_col(0, 0);','}','','static void bw_oled_pixel(int disp, int x, int y, int val)','{','    unsigned char page = (unsigned char)(y >> 3);','    unsigned char bit  = (unsigned char)(1 << (y & 7));','    (void)disp;','    oled_set_page_col(page, (unsigned char)x);','    oled_data_start();','    i2c_write(val ? bit : 0x00);','    i2c_stop();','}','','static void oled_putchar(unsigned char c)','{','    unsigned char i;','    unsigned int idx;','    if (c < 0x20 || c > 0x7E) c = 0x20;','    idx = (unsigned int)(c - 0x20) * 5;','    oled_data_start();',"    for (i = 0; i < 5; i++) i2c_write(font5x7[idx + i]);",'    i2c_write(0x00);  /* 1-pixel gap */','    i2c_stop();','}','','static void bw_oled_print_s(int disp, const char *s)','{','    (void)disp;','    while (*s) oled_putchar((unsigned char)*s++);','}','','static void bw_oled_print_n(int disp, long n)','{','    char buf[12]; unsigned char i = 0; unsigned long u;','    (void)disp;','    if (n < 0) { oled_putchar(0x2D); u = (unsigned long)(-n); }','    else u = (unsigned long)n;','    if (u == 0) { oled_putchar(0x30); return; }','    while (u) { buf[i++] = (char)(0x30 + (u % 10)); u /= 10; }','    while (i) oled_putchar((unsigned char)buf[--i]);','}','','static void bw_oled_cursor(int disp, int row, int col)','{','    (void)disp;','    oled_set_page_col((unsigned char)(row & 0x07), (unsigned char)(col * 6));','}','');}else{out.push(stub('static void bw_oled_pixel(int d, int x, int y, int v)','devices_oledpixel'),stub('static void bw_oled_clear(int d)','devices_oledclear'),stub('static void bw_oled_print_s(int d, const char *s)','devices_oledprint'),stub('static void bw_oled_print_n(int d, long n)','devices_oledprint'),stub('static void bw_oled_cursor(int d, int row, int col)','devices_oledcursor'));}// Matrix keypad scan driver — emitted when any MK pin is read.
if(this._cUses.matrixKeypad){// Resolve matrix config from the retarget pool.
const pool=SB3Creator.RETARGET_POOLS[device]||{};const mx=pool.matrix||{rows:['PA2','PA3','PA4','PA5'],cols:['PB0','PB1','PB2','PB3','PB4']};const nRows=mx.rows.length,nCols=mx.cols.length;if(this._core==='6502'){// VIA: rows on port A (output), cols on port B (input).
// The row pins are driven via _i2c_sh (shadow byte for ORA)
// if I2C is also used, or directly via ORA otherwise.
const rowBits=mx.rows.map(r=>Number(r.match(/\d+/)[0]));const colBits=mx.cols.map(c=>Number(c.match(/\d+/)[0]));const rowMask=rowBits.reduce((m,b)=>m|1<<b,0);const colMask=colBits.reduce((m,b)=>m|1<<b,0);const useI2cShadow=this._cUses.lcd||this._cUses.oled;const oraWrite=useI2cShadow?expr=>"_i2c_sh = (unsigned char)((unsigned char)(_i2c_sh | 0x".concat(rowMask.toString(16).padStart(2,'0'),") & (unsigned char)~(1u << _mk_rows[r])); BW_VIA_ORA = _i2c_sh"):expr=>"BW_VIA_ORA = (unsigned char)((unsigned char)(BW_VIA_ORA | 0x".concat(rowMask.toString(16).padStart(2,'0'),") & (unsigned char)~(1u << _mk_rows[r]))");out.push("/* Matrix keypad: ".concat(nRows," rows \xD7 ").concat(nCols," cols = ").concat(nRows*nCols," keys. */"),"static const unsigned char _mk_rows[".concat(nRows,"] = { ").concat(rowBits.join(', ')," };"),"static const unsigned char _mk_cols[".concat(nCols,"] = { ").concat(colBits.join(', ')," };"),"static unsigned char _mk_state[".concat(nRows,"];"),'','static void bw_key_scan(void)','{','    unsigned char r;',"    for (r = 0; r < ".concat(nRows,"; r++) {"),"        ".concat(oraWrite(),";"),'        { unsigned char d; for (d = 0; d < 8; d++) ; }',"        _mk_state[r] = BW_VIA_IRB;",'    }',"    ".concat(useI2cShadow?'_i2c_sh |= 0x'+rowMask.toString(16).padStart(2,'0')+'; BW_VIA_ORA = _i2c_sh;':'BW_VIA_ORA |= 0x'+rowMask.toString(16).padStart(2,'0')+';',"  /* rows idle */"),'}','','static int bw_key_read(unsigned char idx)','{',"    unsigned char row = idx / ".concat(nCols,";"),"    unsigned char col = idx % ".concat(nCols,";"),'    bw_key_scan();','    return (_mk_state[row] >> _mk_cols[col]) & 1;','}','');}else{// Stub for non-VIA cores — runtime refusal.
out.push('/* Matrix keypad: not implemented for this core. */','static int bw_key_read(unsigned char idx) { (void)idx; return 0; }','');}}// Stubs: IR (protocol decode), 7-segment, matrix, RGB.
out.push("static int bw_device_state(int dev) { (void)dev; return ".concat(this._cUses.relay?'_relay_state':'0',"; }"),stub('static void bw_7seg_show(int disp, int digit)','devices_showdigit'),stub('static void bw_rgb_set(int led, int r, int g, int b)','devices_setrgb'),stub('static void bw_matrix_set(int m, int x, int y, int br)','devices_setpixel'),stub('static void bw_matrix_clear(int m)','devices_clearmatrix'),rstub('static int bw_ir_code(int s)','devices_ircode'),'');}if(stateDecls.length){out.push('/* Variables: long, matching Scratch\'s number range — int is 16-bit on',' * sdcc/avr-gcc/cc65 and silently wraps mid-expression (76-multimeter). */',...stateDecls,'');}if(procProtos.length)out.push(...procProtos,'');if(procDefs.length)out.push(...procDefs);if(statics.length){out.push('/* REPEAT counters live across yields. */',...statics.map(n=>"static unsigned int ".concat(n,";")),'');}// Forward-declare the print helpers when used inside task bodies.
// The definitions come later (after the timer/print-library section),
// but the calls appear inside bw_taskN which is emitted here.
if(this._cUses.print&&taskDefs.length){out.push('/* forward declarations — print helpers defined after the timer section */','static void bw_putc(char c);','static void bw_print(const char *s);','static void bw_print_num(long n);','');}if(taskDefs.length){// A label must precede a STATEMENT in C. An empty script (a hat
// with nothing under it — the default project's shape) emits
// `case 0:` directly before `}`; SDCC tolerates that, gcc calls
// it "label at end of compound statement" and stops the build.
// taskDefs holds individual LINES, so the pass walks the array:
// a bare label whose next code line closes the block gains a
// null statement, legal C on every core.
for(let li=0;li<taskDefs.length-1;li++){if(!/^\s*(case \d+|default):\s*$/.test(taskDefs[li]))continue;let lj=li+1;while(lj<taskDefs.length&&/^\s*$/.test(taskDefs[lj]))lj++;if(lj<taskDefs.length&&/^\s*\}/.test(taskDefs[lj])){taskDefs[li]+=' ;';}}out.push(...taskDefs);}const setup=[];out.push('/* Register setup: ports, ADC, Timer 0. Kept out of main() so the program',' * body stands alone — a C -> blocks reader can then tell them apart. */','static void bw_setup(void)','{');void setup;if(this._core==='avr'){for(const p of pins){const hw=this.avrHw(p);if(p.direction==='output'){if(!hw)continue;// parser already refused A6/A7 outputs
// Level BEFORE direction: an ACTIVE LOW load must never
// see a power-on LOW glitch while DDR flips to output.
const off=p.activeLow?"PORT".concat(hw.reg," |= (1 << ").concat(hw.bit,");"):"PORT".concat(hw.reg," &= (uint8_t)~(1 << ").concat(hw.bit,");");out.push("    ".concat(off,"      /* ").concat(p.name,": start OFF */"),"    DDR".concat(hw.reg," |= (1 << ").concat(hw.bit,");     /* ").concat(p.name," = ").concat(p.where," output */"));}else if(p.direction==='input'&&hw){// The internal pull-up stands in for the 8051's quasi mode:
// the derived bench wires buttons to ground on both chips.
out.push("    PORT".concat(hw.reg," |= (1 << ").concat(hw.bit,");     /* ").concat(p.name," = ").concat(p.where," input, pull-up */"));}else if(p.direction==='analog'&&hw&&hw.bit<=5){out.push("    DIDR0 |= (1 << ".concat(hw.bit,");     /* ").concat(p.name,": digital buffer off on ADC").concat(hw.bit," */"));}}if(this._cUses.adc){out.push('    ADCSRA = (1 << ADEN) | (1 << ADPS2) | (1 << ADPS1) | (1 << ADPS0);  /* on, /128 */');}// 74HC595 PART pins: all three (data, clock, latch) are outputs.
if(this._cUses.shiftOut){for(const p of project.stc.parts||[]){for(const role of['data','clock','latch']){const hw=this.avrHw(p[role]);if(!hw)continue;out.push("    PORT".concat(hw.reg," &= (uint8_t)~(1 << ").concat(hw.bit,");   /* ").concat(p.name," ").concat(role," LOW */"),"    DDR".concat(hw.reg,"  |= (1 << ").concat(hw.bit,");               /* ").concat(p.name," ").concat(role," = ").concat(p[role].where," output */"));}}}if(this._cTasks||this._cUses.delay){if(this._cTiny88){// ATtiny88: Timer0 has no CTC mode — use Timer1 CTC.
out.push('    TCCR1B = (1 << WGM12) | (1 << CS11) | (1 << CS10);  /* Timer 1 CTC, F_CPU/64 */','    OCR1A  = BW_OCR1A;             /* one compare = 1 ms */','    TIMSK1 = (1 << OCIE1A);        /* millisecond tick */');}else{out.push('    TCCR0A = (1 << WGM01);         /* Timer 0 CTC */','    TCCR0B = (1 << CS01) | (1 << CS00);  /* F_CPU/64 */','    OCR0A  = BW_OCR0A;             /* one compare = 1 ms */','    TIMSK0 = (1 << OCIE0A);        /* millisecond tick */');}}if(this._cUses.servo){out.push('    TCCR1A = (1 << WGM11);         /* Timer 1: mode 14, servo frame */','    TCCR1B = (1 << WGM13) | (1 << WGM12) | (1 << CS11);  /* F_CPU/8 */','    ICR1 = 39999;                  /* 20 ms at 0.5 us ticks */',this._cMega?'    DDRB |= (1 << 5) | (1 << 6);   /* D11/D12 = the servo pins (Mega) */':'    DDRB |= (1 << 1) | (1 << 2);   /* D9/D10 = the servo pins */');}else if(this._cUses.pwm||this._cUses.motor){out.push('    TCCR1A = (1 << WGM10);         /* Timer 1: 8-bit fast PWM */','    TCCR1B = (1 << WGM12) | (1 << CS11) | (1 << CS10);  /* F_CPU/64 */');}if(this._cUses.pwm||this._cUses.motor){out.push('    TCCR2A = (1 << WGM20) | (1 << WGM21);  /* Timer 2: fast PWM */','    TCCR2B = (1 << CS22);          /* F_CPU/64 */');if(this._cMega){// Mega: Timers 3/4/5 are 16-bit; 8-bit fast PWM uses WGM mode 5
// (WGMn2:0 = 101, TOP = 0xFF). Same F_CPU/64 prescaler as Timer 1.
const megaPwmPins=new Set(pins.filter(p=>p.direction==='pwm'||p.direction==='motor').map(p=>{const m=String(p.where).match(/^D(\d+)$/i);return m?Number(m[1]):-1;}));const needT3=[2,3,5].some(d=>megaPwmPins.has(d));const needT4=[6,7,8].some(d=>megaPwmPins.has(d));const needT5=[44,45,46].some(d=>megaPwmPins.has(d));if(needT3)out.push('    TCCR3A = (1 << WGM30);         /* Timer 3: 8-bit fast PWM */','    TCCR3B = (1 << WGM32) | (1 << CS31) | (1 << CS30);  /* F_CPU/64 */');if(needT4)out.push('    TCCR4A = (1 << WGM40);         /* Timer 4: 8-bit fast PWM */','    TCCR4B = (1 << WGM42) | (1 << CS41) | (1 << CS40);  /* F_CPU/64 */');if(needT5)out.push('    TCCR5A = (1 << WGM50);         /* Timer 5: 8-bit fast PWM */','    TCCR5B = (1 << WGM52) | (1 << CS51) | (1 << CS50);  /* F_CPU/64 */');}}if(this._cUses.print){out.push("    UBRR0 = (uint16_t)(F_CPU / 16UL / 9600UL - 1UL);",'    UCSR0B = (1 << TXEN0);         /* transmit only */','    UCSR0C = (1 << UCSZ01) | (1 << UCSZ00);  /* 8N1 */');}}if(this._core==='arm'){out.push('    /* On real silicon the TIMER counts watchdog ticks; the bootrom','     * normally enables them. This build runs without a bootrom, so do','     * it here — the emulator does not care, the silicon will. */','    BW_WATCHDOG_TICK = (1u << 9) | 12u;');for(const p of pins){const hw=this.armHw(p);if(!hw)continue;if(p.direction==='output'){// Level BEFORE output-enable: an ACTIVE LOW load must never
// see a power-on glitch while OE flips.
const off=p.activeLow?"BW_SIO_GPIO_OUT_SET = (1UL << ".concat(hw.gpio,");"):"BW_SIO_GPIO_OUT_CLR = (1UL << ".concat(hw.gpio,");");out.push("    BW_IOBANK0_CTRL(".concat(hw.gpio,") = 5u;   /* ").concat(p.name," = ").concat(p.where,": funcsel SIO */"),"    ".concat(off,"      /* ").concat(p.name,": start OFF */"),"    BW_SIO_GPIO_OE_SET = (1UL << ".concat(hw.gpio,");   /* output */"));}else if(p.direction==='input'){// The pad's INPUT ENABLE is not a given (rp2040js resets
// it off; the SDK's gpio_init sets it) — without IE the
// SIO GPIO_IN bit reads 0 whatever the pin does.
// ACTIVE LOW inputs get the INTERNAL pull-up (PUE, bit 3):
// the button-to-GND idiom with no external resistor — the
// real Pico builds are wired exactly so, and rp2040js
// reports the pad as InputPullUp so the board model sees
// the same weak high the silicon gives.
// ACTIVE LOW → internal pull-up (button to GND);
// active high → internal pull-DOWN (button to 3V3) —
// both real-build idioms, no external resistors, and
// the SDK's gpio_init defaults pull-down the same way.
const pad=p.activeLow?'0x4au':'0x46u';const padNote=p.activeLow?'pad IE + schmitt + PULL-UP':'pad IE + schmitt + PULL-DOWN';out.push("    BW_IOBANK0_CTRL(".concat(hw.gpio,") = 5u;   /* ").concat(p.name," = ").concat(p.where,": funcsel SIO, input */"),"    BW_PADS(".concat(hw.gpio,") = ").concat(pad,";   /* ").concat(p.name,": ").concat(padNote," */"));}else if(p.direction==='analog'){// The datasheet's ADC pad state: input buffer off, output
// disable on — the pad becomes purely analog.
out.push("    BW_PADS(".concat(hw.gpio,") = (1u << 7);   /* ").concat(p.name," = ").concat(p.where,": analog pad (OD=1, IE=0) */"));}}// 74HC595 PART pins: all three (data, clock, latch) are outputs.
if(this._cUses.shiftOut){for(const p of project.stc.parts||[]){for(const role of['data','clock','latch']){const hw=this.armHw(p[role]);if(!hw)continue;out.push("    BW_IOBANK0_CTRL(".concat(hw.gpio,") = 5u;   /* ").concat(p.name," ").concat(role," = ").concat(p[role].where,": funcsel SIO */"),"    BW_SIO_GPIO_OUT_CLR = (1UL << ".concat(hw.gpio,");   /* ").concat(p.name," ").concat(role," LOW */"),"    BW_SIO_GPIO_OE_SET = (1UL << ".concat(hw.gpio,");   /* output */"));}}}if(this._cUses.print){out.push('    BW_IOBANK0_CTRL(0) = 2u;           /* GP0: funcsel UART0 TX */',"    BW_UART0_IBRD = (uint32_t)(F_CPU / 16UL / 9600UL);","    BW_UART0_FBRD = (uint32_t)((((F_CPU % (16UL * 9600UL)) * 64UL) + (8UL * 9600UL)) / (16UL * 9600UL));",'    BW_UART0_LCR_H = (3u << 5) | (1u << 4);   /* 8N1, FIFO on */','    BW_UART0_CR = (1u << 8) | 1u;             /* TX enable, UART enable */');}}if(this._core==='6502'){for(const p of pins){const hw=this.viaHw(p);if(!hw)continue;if(p.direction==='output'){// Level BEFORE direction, same hygiene as every other core:
// the load must never see a power-on glitch while DDR flips.
const off=p.activeLow?"BW_VIA_OR".concat(hw.port," |= (uint8_t)(1 << ").concat(hw.bit,");"):"BW_VIA_OR".concat(hw.port," &= (uint8_t)~(1 << ").concat(hw.bit,");");out.push("    ".concat(off,"      /* ").concat(p.name,": start OFF */"),"    BW_VIA_DDR".concat(hw.port," |= (uint8_t)(1 << ").concat(hw.bit,");   /* ").concat(p.name," = ").concat(p.where," output */"));}// Inputs: DDR bits reset to 0 = input already. The VIA has no
// internal pull-ups — the bench wiring provides them, and the
// derived-circuit layer knows that from the pool metadata.
}// 74HC595 PART pins: all three (data, clock, latch) are outputs.
if(this._cUses.shiftOut){for(const p of project.stc.parts||[]){for(const role of['data','clock','latch']){const hw=this.viaHw(p[role]);if(!hw)continue;out.push("    BW_VIA_OR".concat(hw.port," &= (uint8_t)~(1 << ").concat(hw.bit,");   /* ").concat(p.name," ").concat(role," LOW */"),"    BW_VIA_DDR".concat(hw.port," |= (uint8_t)(1 << ").concat(hw.bit,");   /* ").concat(p.name," ").concat(role," = ").concat(p[role].where," output */"));}}}if(this._cTasks||this._cUses.delay||this._cUses.now||this._cUses.print||this._cUses.blockDelay){out.push('    BW_VIA_ACR = 0x40;             /* Timer 1 free-run */','    BW_VIA_T1CL = (uint8_t)(BW_T1_LATCH & 0xffu);','    BW_VIA_T1CH = (uint8_t)(BW_T1_LATCH >> 8);   /* load + start */');}if(this._cUses.print){out.push('    BW_ACIA_CTRL = 0x1e;           /* 9600 8N1, internal clock */','    BW_ACIA_CMD  = 0x0b;           /* DTR active, no RX IRQ, no parity */');}}if(this._core==='8051'){const outputs={};for(const p of pins)if(p.direction==='output')outputs[p.port]=(outputs[p.port]||0)|1<<p.bit;// 74HC595 PART pins are outputs too (data, clock, latch).
if(this._cUses.shiftOut){for(const p of project.stc.parts||[]){for(const role of['data','clock','latch']){const pin=p[role];if(pin.port!==undefined)outputs[pin.port]=(outputs[pin.port]||0)|1<<pin.bit;}}}if(chip.portModes){for(const port of Object.keys(outputs).sort()){out.push("    P".concat(port,"M1 &= ~0x").concat(hex(outputs[port]),";   /* push-pull */"),"    P".concat(port,"M0 |=  0x").concat(hex(outputs[port]),";"));}}// On a quasi-bidirectional-only part (STC89) there is nothing to set up: the
// active-low wiring sinks the LED current either way.
for(const p of pins){if(p.direction==='output')out.push("    P".concat(p.port,"_").concat(p.bit," = ").concat(p.activeLow?1:0,";   /* ").concat(this.cComment(p.name)," off */"));}// 74HC595 PART pins start LOW (data, clock, latch all idle low).
if(this._cUses.shiftOut){for(const p of project.stc.parts||[]){for(const role of['data','clock','latch']){const pin=p[role];if(pin.port!==undefined)out.push("    P".concat(pin.port,"_").concat(pin.bit," = 0;   /* ").concat(p.name," ").concat(role," LOW */"));}}}let analog=0;for(const p of pins)if(p.direction==='analog')analog|=1<<p.bit;if(analog){out.push('',"    P1ASF = 0x".concat(hex(analog),";                 /* analog function on P1 */"),"    P1M1 |=  0x".concat(hex(analog),";                /* high-impedance input */"),"    P1M0 &= ~0x".concat(hex(analog),";"),'    ADC_CONTR = 0xE0;              /* ADC on, fastest conversion */');}if(this._cUses.print){out.push('','    /* UART at 9600 baud: Timer 1 mode 2 (auto-reload) generates the clock. */','    SCON = 0x50;                      /* mode 1, REN */',"    TMOD = (TMOD & 0x0F) | 0x20;      /* Timer 1, mode 2 */","    TH1  = (unsigned char)(256 - FOSC_HZ / 12 / 32 / 9600);",'    TL1  = TH1;','    TR1  = 1;                          /* start Timer 1 */','    TI   = 1;                          /* transmitter ready */');}out.push('');if(chip.aux1T)out.push('    AUXR &= ~0x80;                 /* Timer 0 at FOSC/12 */');out.push('    TMOD  = (TMOD & 0xF0) | 0x01;  /* Timer 0, mode 1 */');// PCA setup for servo (16-bit compare/match, module 0 on P1.3).
if(this._cUses.servo){out.push('','    /* PCA: FOSC/12 clock, 16-bit compare/match on module 0 (P1.3). */','    CMOD = 0x00;                      /* PCA clock = FOSC/12 */','    CCAPM0 = 0x49;                    /* module 0: match + toggle + interrupt */','    CCAP0L = 0; CCAP0H = 0;','    CL = 0; CH = 0;','    EA = 1;                           /* global interrupt enable */','    /* PCA interrupt is enabled per-module by CCAPM0.ECCF (bit 0 of */','    /* 0x49 above). There is NO IE.EC bit for PCA on STC12 — IE.6 is */','    /* ELVD (Low Voltage Detector). Do not set EC=1 here. */','    CR = 1;                           /* start PCA counter — AFTER EA */','    _servo_pulse = (unsigned int)(1500UL * (FOSC_HZ / 12UL) / 1000000UL);  /* 90° default */','    _servo_angle = 90;','    _servo_phase = 0;');}// PCA setup for motor (8-bit PWM, module 1 on P1.4).
if(this._cUses.motor){if(!this._cUses.servo){// Servo already sets CMOD and starts CR; only emit if alone.
out.push('','    /* PCA: FOSC/12 clock for 8-bit PWM. */','    CMOD = 0x00;                      /* PCA clock = FOSC/12 */','    CL = 0; CH = 0;');}if(chip.portModes){out.push('    P1M1 &= ~0x10; P1M0 |=  0x10;  /* P1.4 (CCP1) push-pull */','    P3M1 &= ~0x30; P3M0 |=  0x30;  /* P3.4, P3.5 push-pull */');}out.push('    CCAPM1 = 0x42;                    /* module 1: 8-bit PWM (ECOM|PWM) */','    CCAP1H = 0xFF; CCAP1L = 0xFF;     /* start at 0% duty (pin stays high) */','    _motor_speed = 0;','    _motor_dir = 3;                    /* coast */','    MOTOR_IN1 = 0; MOTOR_IN2 = 0;     /* coast: both inputs low */');if(!this._cUses.servo){out.push('    CR = 1;                           /* start PCA counter */');}}// stc12_setpwm also needs PCA 8-bit PWM — share the same setup path.
if(this._cUses.pwm&&!this._cUses.servo&&!this._cUses.motor){out.push('','    /* PCA: FOSC/12 clock for 8-bit PWM. */','    CMOD = 0x00;                      /* PCA clock = FOSC/12 */','    CL = 0; CH = 0;','    CR = 1;                           /* start PCA counter */');}// Relay: P2.0 as push-pull output, start de-energized.
if(this._cUses.relay){if(chip.portModes){out.push('    P2M1 &= ~0x01; P2M0 |=  0x01;  /* P2.0 push-pull */');}out.push('    RELAY_PIN = 1;                    /* de-energized (active-low) */','    _relay_state = 0;');}// Ultrasonic: P3.6 (trigger) push-pull output.
if(this._cUses.ultrasonic){if(chip.portModes){out.push('    P3M1 &= ~0x40; P3M0 |=  0x40;  /* P3.6 (US trig) push-pull */');}out.push('    US_TRIG = 0;');if(chip.aux1T)out.push('    AUXR &= ~0x40;                 /* Timer 1 at FOSC/12 */');}// NeoPixel: P1.5 push-pull output, buffer init.
if(this._cUses.neopixel){if(chip.portModes){out.push('    P1M1 &= ~0x20; P1M0 |=  0x20;  /* P1.5 (NeoPixel) push-pull */');}out.push('    NEO_PIN = 0;','    _neo_count = NEO_MAX;');}// I2C bus init — shared by LCD and OLED.
if(this._cUses.lcd||this._cUses.oled){if(this._core==='6502'){// VIA: set DDR bits for SDA/SCL output, init shadow, release bus.
const sdaPin=pins.find(p=>p.name.toLowerCase()==='sda');const sclPin=pins.find(p=>p.name.toLowerCase()==='scl');const sdaHw=sdaPin?this.viaHw(sdaPin):null;const sclHw=sclPin?this.viaHw(sclPin):null;const port=sdaHw&&sdaHw.port||'A';const mask=(sdaHw?1<<sdaHw.bit:1)|(sclHw?1<<sclHw.bit:2);out.push("    BW_VIA_DDR".concat(port," |= 0x").concat(mask.toString(16).padStart(2,'0'),";  /* SDA+SCL output */"),"    _i2c_sh = I2C_SDA_MASK | I2C_SCL_MASK;  /* bus idle: both HIGH */","    BW_VIA_OR".concat(port," = _i2c_sh;"));}else if(this._core==='z80'){// Z80: SDA/SCL are OUT latch bits. Init shadow with both HIGH.
out.push('    _z80_sh |= I2C_SDA_MASK | I2C_SCL_MASK;  /* I2C bus idle */','    BW_PORT_OUT = _z80_sh;');}else{// 8051: open-drain port mode, release bus.
if(chip.portModes){out.push('    P2M1 |=  0x06; P2M0 |=  0x06;  /* P2.1, P2.2 open-drain (I2C) */');}out.push('    I2C_SDA_HI(); I2C_SCL_HI();      /* release bus */');}}// Matrix keypad: row pins as output, col pins as input.
if(this._cUses.matrixKeypad&&this._core==='6502'){const pool=SB3Creator.RETARGET_POOLS[device]||{};const mx=pool.matrix||{rows:['PA2','PA3','PA4','PA5'],cols:['PB0','PB1','PB2','PB3','PB4']};const rowBits=mx.rows.map(r=>Number(r.match(/\d+/)[0]));const rowMask=rowBits.reduce((m,b)=>m|1<<b,0);out.push("    BW_VIA_DDRA |= 0x".concat(rowMask.toString(16).padStart(2,'0'),";  /* matrix rows output */"),"    BW_VIA_ORA  |= 0x".concat(rowMask.toString(16).padStart(2,'0'),";  /* rows idle HIGH */"));}// LCD (HD44780 via PCF8574): 4-bit mode init sequence.
if(this._cUses.lcd){out.push('    /* HD44780 init: 4-bit mode, 2-line, 5x8 font */','    lcd_nibble(0x30, 0); lcd_nibble(0x30, 0); lcd_nibble(0x30, 0);','    lcd_nibble(0x20, 0);             /* switch to 4-bit */','    lcd_cmd(0x28);                    /* 2 lines, 5x8 */','    lcd_cmd(0x0C);                    /* display on, cursor off */','    lcd_cmd(0x06);                    /* increment, no shift */','    lcd_cmd(0x01);                    /* clear */');}// OLED (SSD1306): init sequence.
if(this._cUses.oled){out.push('    /* SSD1306 init: off, page mode, remap, charge pump, on, clear */','    oled_cmd(0xAE);                    /* display off */','    oled_cmd(0x20); oled_cmd(0x02);    /* page addressing mode */','    oled_cmd(0xA1);                    /* segment remap */','    oled_cmd(0xC8);                    /* COM scan direction */','    oled_cmd(0x8D); oled_cmd(0x14);    /* charge pump enable */','    oled_cmd(0xAF);                    /* display on */','    bw_oled_clear(0);                  /* zero GDDRAM */');}// TFT (ILI9341): resolve declared pins and emit SPI init sequence.
if(this._cUses.tft){const tftNames=['cs','dc','sck','mosi'];const resolved={};for(const name of tftNames){const p=pins.find(pin=>pin.name.toLowerCase()===name);if(p&&this._core==='avr'){// AVR pins are D-numbers; the driver's TFT_CS = 1 idiom
// needs an LVALUE, which AVR gets from a bitfield view
// of the port register (BW_BIT below) — the sbit
// equivalent. Before this, the resolution silently
// failed on AVR (no p.port/p.bit) and the driver
// shipped 8051 sbit names into an ATmega program.
const table=this._cMega?SB3Creator.AVR_PINS_MEGA:SB3Creator.AVR_PINS;const m=table[String(p.where||'').toUpperCase()];if(m)resolved[name]="BW_BIT(PORT".concat(m[0],", ").concat(m[1],")");else this.cWarn("TFT pin \"".concat(name,"\" is on ").concat(p.where,", which this board does not map"));}else if(p)resolved[name]="P".concat(p.port,"_").concat(p.bit);else this.cWarn("TFT driver needs a pin named \"".concat(name,"\" \u2014 declare it as an OUTPUT pin"));}if(Object.keys(resolved).length===4){this._tftPins=resolved;out.push('    /* ILI9341 init: SLPOUT, COLMOD, MADCTL, DISPON (§8.2) */','    TFT_CS = 1; TFT_SCK = 0;','    tft_cmd(0x01); delay_ms(5);       /* SWRESET */','    tft_cmd(0x11); delay_ms(120);     /* SLPOUT */','    tft_cmd(0x3A); tft_data(0x55);    /* COLMOD: RGB565 */','    tft_cmd(0x36); tft_data(0x48);    /* MADCTL: row/col, BGR */','    tft_cmd(0x29);                    /* DISPON */');}}// Sensor ADC: P1.1 as analog input (channel 1).
// adc_read() already exists when _cUses.adc is set — the ADC_CONTR
// and P1ASF setup is emitted by the general analog-pin path above.
// But devices_temperature etc. set _cUses.adc themselves, so the
// P1ASF bit for channel 1 must be included.  That path reads from
// the declared pins — sensor blocks have no pin declaration, so add
// the bit here.
if(this._cUses.sensor){out.push('    P1ASF |= 0x02;                    /* P1.1 analog (sensor) */','    P1M1 |=  0x02; P1M0 &= ~0x02;    /* P1.1 high-impedance */');}}// AVR/ARM: the LCD/OLED init sequences above live inside the
// 8051/6502 setup section — these cores got the full bit-banged
// DRIVER but never the panel bring-up, so the display sat in its
// power-on state: SSD1306 with charge pump off and display off,
// decoding GDDRAM writes into a panel that never lit. Found by
// the pico-calculator chain test (owner: 'runs but OLED black'),
// and true on real silicon too, not just under emulation.
if((this._core==='avr'||this._core==='arm')&&(this._cUses.lcd||this._cUses.oled)){out.push('    I2C_SDA_HI(); I2C_SCL_HI();      /* release bus */');if(this._cUses.lcd){out.push('    /* HD44780 init: 4-bit mode, 2-line, 5x8 font */','    lcd_nibble(0x30, 0); lcd_nibble(0x30, 0); lcd_nibble(0x30, 0);','    lcd_nibble(0x20, 0);             /* switch to 4-bit */','    lcd_cmd(0x28);                    /* 2 lines, 5x8 */','    lcd_cmd(0x0C);                    /* display on, cursor off */','    lcd_cmd(0x06);                    /* increment, no shift */','    lcd_cmd(0x01);                    /* clear */');}if(this._cUses.oled){out.push('    /* SSD1306 init: off, page mode, remap, charge pump, on, clear */','    oled_cmd(0xAE);                    /* display off */','    oled_cmd(0x20); oled_cmd(0x02);    /* page addressing mode */','    oled_cmd(0xA1);                    /* segment remap */','    oled_cmd(0xC8);                    /* COM scan direction */','    oled_cmd(0x8D); oled_cmd(0x14);    /* charge pump enable */','    oled_cmd(0xAF);                    /* display on */','    bw_oled_clear(0);                  /* zero GDDRAM */');}}out.push('}','',this._core!=='8051'&&this._core!=='z80'?'int main(void)':'void main(void)','{','    bw_setup();');if(this._cTasks&&(this._core==='arm'||this._core==='6502')){out.push('','    for (;;) {                     /* no tick to start: time is read */',...taskNames.map(n=>"        ".concat(n,"();")),'    }');}else if(this._cTasks&&this._core==='avr'){out.push('    sei();                         /* tick on */','','    for (;;) {',...taskNames.map(n=>"        ".concat(n,"();")),'    }');}else if(this._cTasks){out.push('    TL0 = (unsigned char)(T0_RELOAD & 0xFF);','    TH0 = (unsigned char)(T0_RELOAD >> 8);','    ET0 = 1;                       /* millisecond tick */','    EA  = 1;','    TR0 = 1;','','    for (;;) {',...taskNames.map(n=>"        ".concat(n,"();")),'    }');}else if(this._core==='avr'){out.push('    sei();','');out.push(...mainNote.map(l=>"    ".concat(l)));out.push(...mainBody);}else if(this._core==='arm'){out.push('');out.push(...mainNote.map(l=>"    ".concat(l)));out.push(...mainBody);}else{out.push('');out.push(...mainNote.map(l=>"    ".concat(l)));out.push(...mainBody);}out.push('}','');return out.join('\n').replace(/\n{3,}/g,'\n\n').trim()+'\n';}// Functional shims for the Arrays & Vectors extension (id `arrays`) so the generated
// code runs standalone. The block surface maps 1:1 to these methods (0-based indices).
arraysShimPy(){return['class _Arrays:  # Arrays & Vectors extension (github.com/CrispStrobe/extensions), as plain Python','    def __init__(self): self._d = {}','    def create1d(self, n, j): self._d[n] = json.loads(j) if isinstance(j, str) else list(j)','    def create(self, n): self._d[n] = []','    def create_range(self, n, s, e): self._d[n] = list(range(int(s), int(e) + 1))','    def set(self, n, i, v): self._d[n][int(i)] = v','    def push(self, n, v): self._d[n].append(v)','    def insert(self, n, i, v): self._d[n].insert(int(i), v)','    def remove(self, n, i): del self._d[n][int(i)]','    def drop(self, n): self._d.pop(n, None)','    def get(self, n, i): return self._d[n][int(i)]','    def pop(self, n): return self._d[n].pop()','    def length(self, n): return len(self._d[n])','    def sum(self, n): return sum(self._d[n])','    def mean(self, n): return sum(self._d[n]) / len(self._d[n])','    def min(self, n): return min(self._d[n])','    def max(self, n): return max(self._d[n])','    def index_of(self, n, v): return self._d[n].index(v) if v in self._d[n] else -1','    def reverse(self, n): return list(reversed(self._d[n]))','    def flatten(self, n): return [x for row in self._d[n] for x in (row if isinstance(row, list) else [row])]','    def sort(self, n, o="ascending"): return sorted(self._d[n], reverse=(o != "ascending"))','    def slice(self, n, s, e): return self._d[n][int(s):int(e)]','    def to_text(self, n): return json.dumps(self._d[n])','    def contains(self, n, v): return v in self._d[n]','    def create2d(self, n, j): self._d[n] = json.loads(j) if isinstance(j, str) else [list(r) for r in j]','    def get2d(self, n, r, c): return self._d[n][int(r)][int(c)]','    def set2d(self, n, r, c, v):','        row = self._d[n]','        while len(row) <= int(r): row.append([])','        while len(row[int(r)]) <= int(c): row[int(r)].append(0)','        row[int(r)][int(c)] = v','    def transpose(self, n): return [list(x) for x in zip(*self._d[n])]','    def _flat(self, a): return [y for x in a for y in (self._flat(x) if isinstance(x, list) else [x])]','    def reshape(self, n, shp):','        dims = json.loads(shp) if isinstance(shp, str) else shp','        flat = self._flat(self._d[n])','        def rs(i=0):','            if i == len(dims) - 1: return [flat.pop(0) for _ in range(int(dims[i]))]','            return [rs(i + 1) for _ in range(int(dims[i]))]','        return rs()','    def _fn(self, f):','        if callable(f): return f','        s = str(f)','        i = s.find("=>")','        if i < 0: return lambda *a: None','        return eval("lambda " + s[:i].strip().strip("()").strip() + ": " + s[i + 2:].strip())','    def map(self, n, f):','        g = self._fn(f)','        return [g(x) for x in self._d[n]]','    def filter(self, n, f):','        g = self._fn(f)','        return [x for x in self._d[n] if g(x)]','    def reduce(self, n, f, init):','        g = self._fn(f)','        acc = init','        for x in self._d[n]: acc = g(acc, x)','        return acc','_arrays = _Arrays()'];}arraysShimJs(){return['const _arrays = (() => {  // Arrays & Vectors extension (github.com/CrispStrobe/extensions), as plain JS','    const d = {};','    const _fn = (f) => typeof f === "function" ? f : new Function("return (" + f + ")")();  // compile a "x => …" FUNC string','    return {','        create1d: (n, j) => { d[n] = typeof j === "string" ? JSON.parse(j) : Array.from(j); },','        create: (n) => { d[n] = []; }, create_range: (n, s, e) => { d[n] = Array.from({length: Number(e) - Number(s) + 1}, (_, i) => Number(s) + i); },','        set: (n, i, v) => { d[n][Number(i)] = v; }, push: (n, v) => { d[n].push(v); },','        insert: (n, i, v) => { d[n].splice(Number(i), 0, v); }, remove: (n, i) => { d[n].splice(Number(i), 1); }, drop: (n) => { delete d[n]; },','        get: (n, i) => d[n][Number(i)], pop: (n) => d[n].pop(), length: (n) => d[n].length,','        sum: (n) => d[n].reduce((a, b) => a + Number(b), 0), mean: (n) => d[n].reduce((a, b) => a + Number(b), 0) / d[n].length,','        min: (n) => Math.min(...d[n]), max: (n) => Math.max(...d[n]), index_of: (n, v) => d[n].indexOf(v),','        reverse: (n) => d[n].slice().reverse(), flatten: (n) => d[n].flat(Infinity),','        sort: (n, o = "ascending") => d[n].slice().sort((a, b) => o === "ascending" ? a - b : b - a),','        slice: (n, s, e) => d[n].slice(Number(s), Number(e)), to_text: (n) => JSON.stringify(d[n]), contains: (n, v) => d[n].includes(v),','        create2d: (n, j) => { d[n] = typeof j === "string" ? JSON.parse(j) : j; },','        get2d: (n, r, c) => d[n][Number(r)][Number(c)],','        set2d: (n, r, c, v) => { if (!d[n][Number(r)]) d[n][Number(r)] = []; d[n][Number(r)][Number(c)] = v; },','        transpose: (n) => d[n][0].map((_, i) => d[n].map((row) => row[i])),','        reshape: (n, shp) => { const dims = typeof shp === "string" ? JSON.parse(shp) : shp; const flat = d[n].flat(Infinity); const rs = (i = 0) => i === dims.length - 1 ? flat.splice(0, Number(dims[i])) : Array.from({length: Number(dims[i])}, () => rs(i + 1)); return rs(); },','        map: (n, f) => d[n].map(_fn(f)), filter: (n, f) => d[n].filter(_fn(f)), reduce: (n, f, init) => d[n].reduce(_fn(f), init)','    };','})();'];}// Append a user-supplied SVG as an extra costume (animation frame) on a sprite.
addCustomSVGCostume(spriteName,svgText,costumeName){const target=this.project.targets.find(t=>!t.isStage&&t.name===spriteName);if(!target)return false;const{width,height}=this.svgDimensions(svgText);const assetId=this.generateAssetId();this.assets.set(assetId,{type:'svg',data:svgText,filename:"".concat(assetId,".svg"),metadata:{width,height}});target.costumes.push({assetId,name:costumeName||"costume".concat(target.costumes.length+1),md5ext:"".concat(assetId,".svg"),dataFormat:'svg',rotationCenterX:width/2,rotationCenterY:height/2});return true;}}// Core Scratch block categories (everything else is an extension id, see syncExtensions).
_defineProperty(SB3Creator,"STC_MAGIC",'_stcconfig_');/** Stable comment id, so rewrites replace rather than accumulate. */_defineProperty(SB3Creator,"STC_COMMENT_ID",'stcconfig');_defineProperty(SB3Creator,"AVR_PINS",{D0:['D',0],D1:['D',1],D2:['D',2],D3:['D',3],D4:['D',4],D5:['D',5],D6:['D',6],D7:['D',7],D8:['B',0],D9:['B',1],D10:['B',2],D11:['B',3],D12:['B',4],D13:['B',5],A0:['C',0],A1:['C',1],A2:['C',2],A3:['C',3],A4:['C',4],A5:['C',5]});_defineProperty(SB3Creator,"AVR_PINS_MEGA",(()=>{const m={D0:['E',0],D1:['E',1],D2:['E',4],D3:['E',5],D4:['G',5],D5:['E',3],D6:['H',3],D7:['H',4],D8:['H',5],D9:['H',6],D10:['B',4],D11:['B',5],D12:['B',6],D13:['B',7],D14:['J',1],D15:['J',0],D16:['H',1],D17:['H',0],D18:['D',3],D19:['D',2],D20:['D',1],D21:['D',0],D38:['D',7],D39:['G',2],D40:['G',1],D41:['G',0],D50:['B',3],D51:['B',2],D52:['B',1],D53:['B',0]};for(let i=0;i<=7;i++)m["D".concat(22+i)]=['A',i];// ascending
for(let i=0;i<=7;i++)m["D".concat(30+i)]=['C',7-i];// descending
for(let i=0;i<=7;i++)m["D".concat(42+i)]=['L',7-i];// descending
for(let i=0;i<=7;i++)m["A".concat(i)]=['F',i];for(let i=0;i<=7;i++)m["A".concat(8+i)]=['K',i];return m;})());_defineProperty(SB3Creator,"C_ARRAYS_UNIMPLEMENTED",new Set([]));SB3Creator.CORE_CATEGORIES=new Set(['motion','looks','sound','event','control','sensing','operator','data','procedures','argument']);// URLs for custom gallery extensions so the VM can load them when a project uses them.
// Source of truth: github.com/CrispStrobe/extensions; the fork loads the registry from
// crispstrobe.github.io/extensions/generated-metadata/extensions-v0.json (slug -> `${slug}.js`).
SB3Creator.EXTENSION_URLS=_objectSpread({planetemaths:'https://crispstrobe.github.io/extensions/CrispStrobe/planetemaths.js',arrays:'https://crispstrobe.github.io/extensions/CrispStrobe/arrays.js',// Without this line a hardware project carries `extensions: ["stc12"]` and no URL
// for it, so a TurboWarp-based host has nowhere to fetch the blocks from and the
// project fails to open at all: "Unknown extension: stc12". A host that has the
// extension built in (brickwright-lite does) checks that first and ignores the URL.
stc12:'https://crispstrobe.github.io/extensions/CrispStrobe/stc12.js'},_sb3_creator_runtime_js__WEBPACK_IMPORTED_MODULE_1__.RUNTIME_EXTENSION_URLS);// Pluggable-driver convention for runtime/hardware extensions (gamepad, LEGO, …).
// The transpiled program is driver-agnostic: it calls `_<runtime>.<method>(args)`.
// A driver object is emitted at the top — a neutral no-op "shim" by default — which is
// the single swap point: implement its methods to drive real hardware on-brick (ev3dev/
// pybricks) or remotely (USB/BLE/BTC). Adding an extension = one declarative entry here,
// not new emitter code. Each op: { kind: 'command'|'reporter'|'boolean', method, args?,
// neutral? }. Source of truth for the block surface: github.com/CrispStrobe/extensions.
// All runtime/hardware extensions (Gamepad + Boost, PoweredUp, WeDo, Spike, EV3, …) are
// auto-generated from their block surfaces (scripts/gen-runtime-registry.mjs) so the
// pluggable-driver convention works for every one of them.
SB3Creator.RUNTIME_EXTENSIONS=_objectSpread(_objectSpread({},_sb3_creator_runtime_js__WEBPACK_IMPORTED_MODULE_1__.RUNTIME_EXTENSIONS),{},{// The STC12 pin surface. Declared here rather than special-cased in the walkers, which is
// the convention's own promise: adding hardware is one registry entry, not new emitter code.
//
// This is what lets the CHEAP simulation tier reach the chip blocks. Emitted Python/JS now
// calls `_stc12.setPin("led1", "on")` instead of dropping a `# comment`, so swapping in a
// driver that pokes a board layer simulates an STC12 program with no emitter change at all
// — the same swap point that already serves shim / remote / on-brick. See
// reference/simulation.md (tier 1). `generateC` does NOT come through here: on the chip
// these are direct SFR writes.
stc12:{runtime:'stc12',ops:{setpin:{kind:'command',method:'setPin',args:['PIN','STATE']},toggle:{kind:'command',method:'togglePin',args:['PIN']},writepin:{kind:'command',method:'writePin',args:['PIN','VALUE']},read:{kind:'reporter',method:'readPin',args:['PIN'],neutral:'0'},setpwm:{kind:'command',method:'setPwm',args:['PIN','VALUE']},settone:{kind:'command',method:'setTone',args:['PIN','VALUE']},setport:{kind:'command',method:'setPort',args:['PORT','VALUE']},readport:{kind:'reporter',method:'readPort',args:['PORT'],neutral:'0'},setpart:{kind:'command',method:'setPart',args:['PART','VALUE']},print:{kind:'command',method:'print',args:['VALUE','MODE']},whenpin:{kind:'hat',method:'whenpin',args:['PIN','EDGE']},tableindex:{kind:'reporter',method:'tableIndex',args:['TABLE','INDEX'],neutral:'0'}}},// LED cube — frame-buffer animation blocks. The simulator driver maps to
// the board's cube accessors (bw-board led_cube kind) when a board is
// attached; the neutral shim records frames locally.
ledcube:{runtime:'ledcube',ops:{setvoxel:{kind:'command',method:'setVoxel',args:['X','Y','Z','COLOUR']},clearvoxel:{kind:'command',method:'clearVoxel',args:['X','Y','Z']},filllayer:{kind:'command',method:'fillLayer',args:['LAYER','COLOUR']},fillcolumn:{kind:'command',method:'fillColumn',args:['X','Y','COLOUR']},fillwall:{kind:'command',method:'fillWall',args:['Z','COLOUR']},clear:{kind:'command',method:'clear',args:[]},invert:{kind:'command',method:'invert',args:[]},shift:{kind:'command',method:'shift',args:['DIR']},hold:{kind:'command',method:'hold',args:['DURATION']},readvoxel:{kind:'reporter',method:'readVoxel',args:['X','Y','Z'],neutral:'0'}}},// The circuit extension — board instruments and controls (simulation-only reporters).
// Overrides the generated entry with camelCase method names (matching the simulator
// driver and boundary B) and neutral values (resistance alone refuses with a reason).
// Device convenience blocks — higher-level vocabulary over pins/ports.
// A learner says "show digit 5" not "set port to font[5]".
devices:{runtime:'devices',ops:{showdigit:{kind:'command',method:'showDigit',args:['DIGIT','DISPLAY']},setrgb:{kind:'command',method:'setRgb',args:['LED','R','G','B']},setservo:{kind:'command',method:'setServo',args:['SERVO','ANGLE']},setmotor:{kind:'command',method:'setMotor',args:['MOTOR','SPEED']},setrelay:{kind:'command',method:'setRelay',args:['RELAY','STATE']},temperature:{kind:'reporter',method:'temperature',args:['SENSOR'],neutral:'NaN'},light:{kind:'reporter',method:'light',args:['SENSOR'],neutral:'NaN'},servoangle:{kind:'reporter',method:'servoAngle',args:['SERVO'],neutral:'NaN'},distance:{kind:'reporter',method:'distance',args:['SENSOR'],neutral:'NaN'},// char_lcd
lcdprint:{kind:'command',method:'lcdPrint',args:['TEXT','DISPLAY']},lcdcursor:{kind:'command',method:'lcdCursor',args:['ROW','COL','DISPLAY']},lcdclear:{kind:'command',method:'lcdClear',args:['DISPLAY']},// ssd1306 oled (I2C) — absent entries here made the JS
// generator emit every oled op as a COMMENT, so the in-app
// simulator never drew a pixel while the C flavors worked on
// silicon (the owner's "OLED always black").
oledprint:{kind:'command',method:'oledPrint',args:['TEXT','DISPLAY']},oledcursor:{kind:'command',method:'oledCursor',args:['ROW','COL','DISPLAY']},oledclear:{kind:'command',method:'oledClear',args:['DISPLAY']},oledpixel:{kind:'command',method:'oledPixel',args:['X','Y','VALUE','DISPLAY']},// led_matrix
setpixel:{kind:'command',method:'setPixel',args:['X','Y','BRIGHTNESS','MATRIX']},clearmatrix:{kind:'command',method:'clearMatrix',args:['MATRIX']},// neopixel
setneopixel:{kind:'command',method:'setNeopixel',args:['INDEX','R','G','B','STRIP']},clearneopixels:{kind:'command',method:'clearNeopixels',args:['STRIP']},// H-bridge / solenoid / general actuator control
setdirection:{kind:'command',method:'setDirection',args:['MOTOR','DIR']},activate:{kind:'command',method:'activate',args:['DEVICE']},deactivate:{kind:'command',method:'deactivate',args:['DEVICE']},// Sensor reporters
flex:{kind:'reporter',method:'flex',args:['SENSOR'],neutral:'NaN'},force:{kind:'reporter',method:'force',args:['SENSOR'],neutral:'NaN'},ircode:{kind:'reporter',method:'irCode',args:['SENSOR'],neutral:'NaN'},// Actuator readback reporters
motorspeed:{kind:'reporter',method:'motorSpeed',args:['MOTOR'],neutral:'NaN'},motordirection:{kind:'reporter',method:'motorDirection',args:['MOTOR'],neutral:'"stopped"'},devicestate:{kind:'reporter',method:'deviceState',args:['DEVICE'],neutral:'"unknown"'},// Predicates (boolean reporters)
pressed:{kind:'boolean',method:'pressed',args:['BUTTON'],neutral:'false'},above:{kind:'boolean',method:'above',args:['SENSOR','THRESHOLD'],neutral:'false'},closer:{kind:'boolean',method:'closer',args:['SENSOR','DISTANCE'],neutral:'false'},motion:{kind:'boolean',method:'motion',args:['SENSOR'],neutral:'false'},tilted:{kind:'boolean',method:'tilted',args:['SENSOR'],neutral:'false'},energised:{kind:'boolean',method:'energised',args:['DEVICE'],neutral:'false'},// Sensor event hats
whenabove:{kind:'hat',method:'whenAbove',args:['SENSOR','THRESHOLD']},whencloser:{kind:'hat',method:'whenCloser',args:['SENSOR','DISTANCE']},whenmotion:{kind:'hat',method:'whenMotion',args:['SENSOR']},whentilted:{kind:'hat',method:'whenTilted',args:['SENSOR']},whenirreceived:{kind:'hat',method:'whenIrReceived',args:['SENSOR']}}},// The generated entry from circuit.js provides the opcode shape and the gallery URL.
circuit:{runtime:'circuit',ops:{nodevoltage:{kind:'reporter',method:'nodeVoltage',args:['NET'],neutral:'NaN'},branchcurrent:{kind:'reporter',method:'branchCurrent',args:['PART'],neutral:'NaN'},resistance:{kind:'reporter',method:'resistance',args:['A','B'],neutral:'NaN'},ledbrightness:{kind:'reporter',method:'ledBrightness',args:['PART'],neutral:'NaN'},buzzertone:{kind:'reporter',method:'buzzerTone',args:['PART'],neutral:'NaN'},setcontrol:{kind:'command',method:'setControl',args:['CONTROL','VALUE']},setpower:{kind:'command',method:'setPower',args:['STATE']}}}});// ---- STC12 / 8051 target (generateC) ---------------------------------------------
// What the C emitter must know about a chip family. The point of keeping this explicit:
// an STC12C5A60S2 drops into an STC89C52 socket pin-for-pin, but its 1T core runs
// software delay loops 6-12x too fast. Generated code never busy-waits on a cycle count
// — every delay and every scheduler tick is Timer 0 at FOSC/12, which both families
// count identically — so the same project is timing-correct on either chip.
// Register addresses are datasheet facts; the header is SDCC's own.
// Mirrors the PARTS table in ../stc-compiler/stc_pseudocode.py.
//   header     — the SDCC header carrying this family's registers
//   portModes  — PxM0/PxM1 exist (STC12/STC15); the STC89 is quasi-bidirectional only
//   aux1T      — AUXR.7 selects Timer 0's 1T mode and must be cleared
//   adc        — 10-bit ADC on P1
// The STC15 borrows stc12.h deliberately: every register this emitter touches (P0-P3,
// PxM0/PxM1, AUXR, Timer 0, P1ASF, the ADC block) sits at the same address on an
// STC15F2K60S2. Its famous divergences (Timer 2 at 0xD6/0xD7, S3CON…) are registers
// nothing here ever writes.
// Not all STC any more, but the name is in warning text and in saved
// projects. `core` is what actually matters: it says which vocabulary a
// board's pins are spelled in, and which C back end (if any) can emit for it.
/**
 * Conventional pin pools per device, for retargeting an example from one
 * chip to another. Roles, not pins, are the portable idea: an example says
 * "a LED, a pot, a button" through its declarations, and each device says
 * where such things conventionally live. Order matters — the first free
 * pin of the right role is taken, so multi-LED examples spread naturally.
 * `ledActiveLow` is the wiring convention: the 8051 boards sink current
 * (datasheet §4.6), the Nano/Pico onboard LEDs are driven high.
 */// Pools list the CONVENTION pins first (simple examples land on the
// classic wiring) and then EVERY genuinely-free GPIO the silicon has —
// reserved pins (UART/ISP, Timer-0-owned PWM, crystal ADC, RESET) stay
// out. The old pools were the convention subset ONLY, so any program
// needing more pins than the handful refused even when the chip had
// dozens free — the calculator (12 pins) refused on an Uno with 18
// usable GPIO (owner question, 2026-08-17).
SB3Creator.RETARGET_POOLS=(()=>{const seq=(fmt,a,b)=>Array.from({length:b-a+1},(_,i)=>fmt.replace('%',String(a+i)));const P=port=>seq("P".concat(port,".%"),0,7);// AVR D-pins: D0/D1 are the UART; D5/D6 (Timer 0) allowed as plain
// digital, never as PWM. A-pins double as digital on the '328/'168
// (A6/A7 on the Nano are ADC-ONLY and appear in no digital pool).
const unoDigital=['D13','D12','D8','D7','D4','D2','D3','D5','D6','D9','D10','D11','A0','A1','A2','A3','A4','A5'];const unoInput=['D2','D4','D7','D8','D3','D5','D6','D9','D10','D11','D12','D13','A0','A1','A2','A3','A4','A5'];return{// P1.3/P1.4 (the PCA/CCP pair) close BOTH the digital and input
// pools — appended LAST, so they are touched only when 26+ pins of
// a role are already taken and a PWM-less program needs the full
// 34-GPIO silicon truth (the retro console's 28 outputs + 5
// inputs = 33 distinct coordinates; the pools' previous 32 made
// the console refuse a chip that physically fits it). A program
// that dims a pin still gets the pair first via pools.pwm — only
// a 27-output-plus-PWM program could collide, and that refusal
// is honest.
stc12c5a60s2:{digital:['P1.0','P1.1','P1.2','P1.5','P1.6','P1.7','P3.4','P3.5',...P(2),...P(0),'P4.4','P4.5','P4.6','P4.7','P1.3','P1.4'],analog:['P1.3','P1.4','P1.5','P1.6'],input:['P3.2','P3.3','P3.6','P3.7',...P(2),...P(0),'P1.0','P1.1','P1.2','P1.5','P1.6','P1.7','P1.3','P1.4'],pwm:['P1.3','P1.4'],ledActiveLow:true},stc89c52rc:{digital:[...P(1),...P(2),...P(0)],analog:[],input:['P3.2','P3.3','P3.6','P3.7',...P(2),...P(0),...P(1)],pwm:[],ledActiveLow:true},stc15f2k60s2:{digital:['P1.0','P1.1','P1.2','P1.3','P1.4','P1.5',...P(2),...P(0),'P3.4','P3.5'],// P1.6/P1.7 stay out of the analog pool: a crystal takes ADC6/7.
analog:['P1.0','P1.1','P1.2','P1.3','P1.4','P1.5'],input:['P3.2','P3.3','P3.6','P3.7',...P(2),...P(0)],pwm:['P1.1','P1.0'],ledActiveLow:true},'arduino-uno':{digital:unoDigital,analog:['A0','A1','A2','A3','A4','A5'],input:unoInput,pwm:['D3','D11','D9','D10'],ledActiveLow:false},'atmega168p':{digital:unoDigital,analog:['A0','A1','A2','A3','A4','A5'],input:unoInput,pwm:['D3','D11','D9','D10'],ledActiveLow:false},'arduino-mega':{digital:['D13',...seq('D%',22,49)],analog:['A0','A1','A2','A3','A4','A5','A8','A9'],input:['D2','D3','D18','D19',...seq('D%',22,49)],// Timer 1/2 pins only; D13/D4 are Timer 0's (the tick) and never offered.
pwm:['D9','D10','D11','D12'],ledActiveLow:false},'arduino-nano':{digital:unoDigital,analog:['A0','A1','A2','A3','A6','A7'],input:unoInput,pwm:['D3','D11','D9','D10'],ledActiveLow:false},pico:{digital:['GP25','GP15','GP14','GP13','GP12','GP11','GP10',...seq('GP%',0,9),...seq('GP%',18,22)],analog:['GP26','GP27','GP28'],input:['GP2','GP3','GP4','GP5',...seq('GP%',6,15),...seq('GP%',18,22),'GP0','GP1'],// GP16/GP17 stay out: they are the servo pins (slice 0, 50 Hz).
pwm:['GP15','GP14','GP13','GP12'],ledActiveLow:false},// VIA outputs are symmetric CMOS, so LEDs wire active-high. PB7 never
// appears: Timer 1 owns it. No analog, no PWM — the VIA has neither.
eater6502:{digital:['PA0','PA1','PA2','PA3','PA4','PA5','PA6','PA7'],analog:[],// Direct inputs PLUS matrix-virtual inputs (MK0-MK19):
// a 4×5 matrix keypad on rows PA2-PA5 × cols PB0-PB4 yields
// 20 virtual keys from 9 pins. Direct PB inputs come first
// so small programs use them; the MK slots extend the pool
// for programs that need more than 7 keys (like the calculator).
input:['PB0','PB1','PB2','PB3','PB4','PB5','PB6',...seq('MK%',0,19)],pwm:[],ledActiveLow:false,matrix:{rows:['PA2','PA3','PA4','PA5'],cols:['PB0','PB1','PB2','PB3','PB4']}},// Z80 bench: OUT latch (port 0 write) provides 8 output bits,
// IN buffer (port 0 read) provides 8 input bits. No analog, no PWM.
z80:{digital:seq('OUT%',0,7),analog:[],input:seq('IN%',0,7),pwm:[],ledActiveLow:false},// ATtiny88 as the BARE CHIP: all of B/C/D bar RESET (PC6). The old
// input pool was the PENDANT's two buttons — board truth, not chip
// truth, and generated benches seat the chip.
attiny88:{digital:[...seq('PB%',0,7),...seq('PD%',0,7),...seq('PC%',0,5),'PC7'],analog:[],input:['PC3','PC7',...seq('PC%',0,2),'PC4','PC5',...seq('PD%',0,7),...seq('PB%',0,7)],pwm:[],ledActiveLow:false},// ATtiny85: five usable pins, PB5 is RESET. Honest refusals are the
// point — a 12-pin program cannot fit and should say so.
attiny85:{digital:['PB0','PB1','PB2','PB3','PB4'],analog:['PB2','PB4','PB3'],input:['PB2','PB3','PB4','PB0','PB1'],pwm:['PB0','PB1'],ledActiveLow:false}};})();/**
 * The devices' HARDWARE I2C pins, by dialect coordinate. When a program
 * declares the sda+scl bus idiom, retarget assigns THESE instead of the
 * next free digital pool pins: the pool head is D13 on the AVR boards,
 * and D13 carries the onboard LED — a resistor-and-LED load permanently
 * attached to an open-drain bus line (49-lcd-hello retargeted to the
 * Nano, 2026-08-17). Devices without a hardware I2C convention (the STC
 * parts bit-bang on whatever the author chose; Z80/6502 machines have
 * no convention) are simply absent — pool order applies there.
 * (SPI's cs/dc/sck/mosi idiom could get the same treatment — sck IS
 * D13 on the AVR hardware SPI — but bit-banged SPI has no open-drain
 * hazard, so it keeps pool order until there's a reason.)
 */SB3Creator.I2C_PINS={'arduino-uno':{sda:'A4',scl:'A5'},'arduino-nano':{sda:'A4',scl:'A5'},atmega168p:{sda:'A4',scl:'A5'},'arduino-mega':{sda:'D20',scl:'D21'},pico:{sda:'GP4',scl:'GP5'},// I2C0 default pair
attiny85:{sda:'PB0',scl:'PB2'},// USI
attiny88:{sda:'PC4',scl:'PC5'}// TWI
};/**
 * Retarget a pseudocode program to another device: same body, the target's
 * conventional pins. Returns { ok, pseudocode?, reasons: [], warnings: [] }.
 * `reasons` states every hard blocker (a feature the target cannot do, or
 * more pins of a role than the convention offers); with any reason, ok is
 * false and no pseudocode is produced — a gallery filters on exactly this.
 *//**
 * Emit an ld65 linker config for a declared 6502 machine (stc.machine), or
 * for the EATER6502 preset when machine is null. The toolchain contract:
 * reference/6502-target/README.md documents the build; the compile service
 * calls this so a MAP declaration really changes the memory image, not just
 * the register bases. Refusals are reasons, retargetPseudocode-style.
 *
 * Rules the 6502 itself imposes: RAM must start at $0000 (zero page and the
 * hardware stack live there) and reach at least $02FF (cc65's DATA/BSS
 * start at $0200 above the stack page); some ROM must cover the vectors at
 * $FFFA-$FFFF. Chips are not the linker's business — their decode is the
 * machine's.
 *
 * @param {{regions: Array<{kind: string, start: number, end: number}>}|null} machine
 * @returns {{ ok: boolean, cfg?: string, reasons: string[] }}
 */SB3Creator.generate6502LinkerCfg=function generate6502LinkerCfg(machine){const regions=machine&&machine.regions&&machine.regions.length?machine.regions:[{kind:'ram',start:0x0000,end:0x3fff},{kind:'rom',start:0x8000,end:0xffff}];const reasons=[];const hx=n=>'$'+n.toString(16).toUpperCase().padStart(4,'0');const ram=regions.filter(r=>r.kind==='ram').sort((a,b)=>a.start-b.start)[0];const rom=regions.filter(r=>r.kind==='rom').find(r=>r.start<=0xfffa&&r.end>=0xffff);if(!ram)reasons.push('no RAM region — MAP RAM $0000-$xxxx is required');else if(ram.start!==0)reasons.push("RAM starts at ".concat(hx(ram.start)," \u2014 it must start at $0000: the 6502 keeps zero page and the hardware stack there"));else if(ram.end<0x02ff)reasons.push("RAM ends at ".concat(hx(ram.end)," \u2014 it must reach at least $02FF (zero page + stack page + room for DATA/BSS)"));if(!rom)reasons.push('no ROM region covering the vectors at $FFFA-$FFFF — the CPU reads RESET from there');if(reasons.length)return{ok:false,reasons};const ramSize=ram.end+1-0x0200;const romSize=0xfffa-rom.start;const cfg=["# ld65 config generated from the declared machine: RAM ".concat(hx(ram.start),"-").concat(hx(ram.end),","),"# ROM ".concat(hx(rom.start),"-").concat(hx(rom.end),", vectors carved at $FFFA. Output is a raw"),"# ".concat(((romSize+6)/1024).toFixed(0)," KB ROM image loaded at ").concat(hx(rom.start),"."),'MEMORY {','    ZP:  start = $0000, size = $0100, type = rw, define = yes;',"    RAM: start = $0200, size = ".concat(hx(ramSize),", type = rw, define = yes;"),"    ROM: start = ".concat(hx(rom.start),", size = ").concat(hx(romSize),", type = ro, file = %O, fill = yes, fillval = $EA;"),'    VEC: start = $FFFA, size = $0006, type = ro, file = %O, fill = yes;','}','SEGMENTS {','    ZEROPAGE: load = ZP,  type = zp;','    STARTUP:  load = ROM, type = ro;','    ONCE:     load = ROM, type = ro, optional = yes;','    CODE:     load = ROM, type = ro;','    RODATA:   load = ROM, type = ro;','    DATA:     load = ROM, run = RAM, type = rw, define = yes;','    BSS:      load = RAM, type = bss, define = yes;','    VECTORS:  load = VEC, type = ro;','}','SYMBOLS {','    __STACKSIZE__:  type = weak, value = $0200;','    # none.lib\'s own crt0 module rides along (its _exit chain); this feeds it.',"    __STACKSTART__: type = weak, value = ".concat(hx(ram.end+1),";"),'}','FEATURES {','    CONDES: type = constructor, label = __CONSTRUCTOR_TABLE__, count = __CONSTRUCTOR_COUNT__, segment = ONCE;','    CONDES: type = destructor,  label = __DESTRUCTOR_TABLE__,  count = __DESTRUCTOR_COUNT__,  segment = RODATA;','}',''].join('\n');return{ok:true,cfg,reasons:[]};};SB3Creator.retargetPseudocode=function retargetPseudocode(src,device){const part=SB3Creator.STC_PARTS[device];const pools=SB3Creator.RETARGET_POOLS[device];if(!part||!pools)return{ok:false,reasons:["unknown device: ".concat(device)],warnings:[]};const core=part.core==='arduino'?'avr':part.core==='rp2040'?'arm':part.core||'8051';if(core==='micropython')return{ok:false,reasons:["".concat(device," runs MicroPython \u2014 no C retarget")],warnings:[]};// Retargeting a program to its OWN device is the identity: the authored
// pins ARE the assignment. Canonicalizing them into pool order broke the
// pairing with the authored bench — sda=P2.1 became P1.0, every wire was
// in place, and the LCD stayed dark (49-lcd-hello, 2026-08-17).
const srcDevice=((src.match(/^DEVICE\s+([\w-]+)/im)||[])[1]||'').toLowerCase().replace(/_/g,'-');if(srcDevice===device)return{ok:true,pseudocode:src,reasons:[],warnings:[],pinMap:[]};if(core==='z80'){// Z80 retarget: output pins are OUT0-OUT7, input pins are IN0-IN7.
// No ADC, no PWM, no timer tick — delay-only programs.
}const c=new SB3Creator();c.parse(src);const stc=c.project&&c.project.stc;if(!stc||!Array.isArray(stc.pins)){return{ok:false,reasons:['the source has no hardware declarations to retarget'],warnings:[]};}const reasons=[];const warnings=[...(c.warnings||[])];if((stc.ports||[]).length&&core!=='8051'){reasons.push('whole-port declarations (PORT x = Pn) are an 8051 construct — no port registers here');}// PART (74HC595) shift_out is now ported to all cores — no refusal needed.
// ---- feature scan: what does the body actually use? -----------------
const used={pwmPins:new Set(),port:false,cube:false,pixel:false,servo:false,motor:false,adc:false,tone:false};for(const t of c.project.targets||[]){for(const b of Object.values(t.blocks||{})){if(!b||!b.opcode)continue;if(b.opcode==='stc12_setpwm'&&b.fields&&b.fields.PIN)used.pwmPins.add(String(b.fields.PIN[0]).toLowerCase());if(b.opcode==='stc12_setport'||b.opcode==='stc12_readport')used.port=true;if(/^cube_/.test(b.opcode))used.cube=true;if(/devices_(setpixel|setrgb|clearmatrix)/.test(b.opcode))used.pixel=true;if(/devices_(setservo|servoangle)/.test(b.opcode))used.servo=true;if(/devices_(setmotor|motordir|motorspeed)/.test(b.opcode))used.motor=true;if(b.opcode==='stc12_settone')used.tone=true;}}for(const pin of stc.pins)if(pin.direction==='analog')used.adc=true;// ---- hard blockers, each with its reason ---------------------------
if(used.adc&&(!part.adc||!pools.analog.length))reasons.push("".concat(device," has no ADC \u2014 the analog pins cannot map"));if(used.port&&core!=='8051')reasons.push('whole-port writes are an 8051 construct — no port registers here');if(used.cube&&device!=='stc12c5a60s2')reasons.push('the LED cube is STC12 hardware');if(used.pixel&&core!=='8051')reasons.push('NeoPixel timing is not ported to this core yet');if(used.tone&&core!=='8051')reasons.push('tone is not ported to this core yet');if(used.servo&&core==='8051'&&!part.pca)reasons.push("servo needs the PCA \u2014 ".concat(device," has none"));if(used.motor&&core==='8051'&&!part.pca)reasons.push("motor speed needs the PCA \u2014 ".concat(device," has none"));if((used.servo||used.motor)&&core==='w65c02')reasons.push('servo/motor need PWM — the VIA has no compare unit');if(used.pwmPins.size&&!pools.pwm.length)reasons.push("".concat(device," has no PWM-capable convention pins"));// ---- allocate pins from the pools ----------------------------------
const taken=new Set();const take=list=>{for(const where of list)if(!taken.has(where)){taken.add(where);return where;}return null;};// The sda+scl pair is a BUS, not two ordinary outputs: it lands on the
// device's hardware I2C pins (I2C_PINS above) — the digital pool head
// is the LED pin on the AVR boards, poison for an open-drain line.
// Reserve the pair up front so no other pin is allocated onto it.
const pinLnames=new Set(stc.pins.map(p=>String(p.name).toLowerCase()));const i2cConv=pinLnames.has('sda')&&pinLnames.has('scl')?SB3Creator.I2C_PINS[device]:null;if(i2cConv){taken.add(i2cConv.sda);taken.add(i2cConv.scl);}const newPins=[];// Old coordinate -> new coordinate, one entry per pin (and PART role).
// Circuit-preserving retarget consumes this to rewrite an AUTHORED
// circuit's MCU terminals instead of synthesizing a generic bench.
const pinMap=[];// A declared pin's coordinate in its own dialect: where (D13/GP4/A4)
// on the board dialects, P<port>.<bit> on the 8051 family.
const coordOf=q=>q.where?String(q.where):"P".concat(q.port,".").concat(q.bit);for(const pin of stc.pins){let where=null;let activeLow=false;const lname=String(pin.name).toLowerCase();if(i2cConv&&(lname==='sda'||lname==='scl')){pinMap.push({name:pin.name,from:coordOf(pin),to:i2cConv[lname]});newPins.push(_objectSpread(_objectSpread({},pin),{},{where:i2cConv[lname],activeLow:false,port:undefined,bit:undefined}));continue;}if(pin.direction==='analog'){where=take(pools.analog);if(!where)reasons.push("more analog pins than ".concat(device,"'s convention offers (").concat(pools.analog.length,")"));}else if(pin.direction==='input'){where=take(pools.input);if(!where)reasons.push("more input pins than ".concat(device,"'s convention offers (").concat(pools.input.length,")"));}else if(pin.direction==='output'&&used.pwmPins.has(String(pin.name).toLowerCase())){where=take(pools.pwm);activeLow=false;// a dimmed LED keeps analogWrite semantics: high = bright
if(!where)reasons.push("more dimmed pins than ".concat(device,"'s PWM convention offers (").concat(pools.pwm.length,")"));if(where&&core!=='8051'){// The arduino/pico parsers require the PWM direction for a
// percent write; the 8051 dialect dims OUTPUT pins directly.
pinMap.push({name:pin.name,from:coordOf(pin),to:where});newPins.push(_objectSpread(_objectSpread({},pin),{},{where,activeLow,direction:'pwm',port:undefined,bit:undefined}));continue;}}else if(pin.direction==='output'){where=take(pools.digital);activeLow=pools.ledActiveLow;if(!where)reasons.push("more digital outputs than ".concat(device,"'s convention offers (").concat(pools.digital.length,")"));}else{reasons.push("pin \"".concat(pin.name,"\" has direction ").concat(pin.direction,", which does not retarget yet"));}if(where){pinMap.push({name:pin.name,from:coordOf(pin),to:where});newPins.push(_objectSpread(_objectSpread({},pin),{},{where,activeLow,port:undefined,bit:undefined}));}}// ---- retarget PART pin coordinates ---------------------------------
// PART data/clock/latch pins are implicitly digital outputs — allocate
// them from the digital pool, same as output PINs.
const newParts=[];for(const p of stc.parts||[]){const newPart=_objectSpread({},p);for(const role of['data','clock','latch']){const where=take(pools.digital);if(!where){reasons.push("more PART pins than ".concat(device,"'s digital convention offers (").concat(pools.digital.length,")"));break;}if(p[role])pinMap.push({name:"".concat(p.name,".").concat(role),from:coordOf(p[role]),to:where});newPart[role]={where};}newPart.claims=[newPart.data.where,newPart.clock.where,newPart.latch.where].filter(Boolean);newParts.push(newPart);}stc.parts=newParts;if(reasons.length)return{ok:false,reasons,warnings};// ---- rewrite declarations, keep the body ---------------------------
// On the 8051 cores the parser wants port/bit back; re-parsing the
// decompiled text derives them, so decompile with `where` only.
stc.device=device;stc.clock=core==='avr'?16000000:core==='arm'?125000000:core==='w65c02'?1000000:device.startsWith('stc15')?11059200:11059200;stc.pins=newPins;const out=c.decompile();// The proof of the rewrite is a clean re-parse.
const check=new SB3Creator();check.parse(out);if((check.warnings||[]).length){return{ok:false,reasons:["retargeted text does not re-parse clean: ".concat(check.warnings[0])],warnings};}return{ok:true,pseudocode:out,reasons:[],warnings,pinMap};};SB3Creator.STC_PARTS={// core: '8051' -- {port, bit} pins, and generateC() emits for these.
// ccp: array of {port, bit} for each PCA module (0, 1, …), or null if no PCA.
//   STC12: CCP0=P1.3, CCP1=P1.4.  STC15: CCP0=P1.1, CCP1=P1.0, CCP2=P3.7.
// xtalAdc: array of ADC channels lost to the crystal oscillator, or null.
//   STC15: XTAL shares P1.6(ADC6)/P1.7(ADC7) — a crystal costs two analog inputs.
stc12c5a60s2:{header:'stc12.h',portModes:true,aux1T:true,adc:true,pca:true,timer1:true,ccp:[{port:1,bit:3},{port:1,bit:4}],xtalAdc:null},stc12c5a16s2:{header:'stc12.h',portModes:true,aux1T:true,adc:true,pca:true,timer1:true,ccp:[{port:1,bit:3},{port:1,bit:4}],xtalAdc:null},stc89c52rc:{header:'8052.h',portModes:false,aux1T:false,adc:false,pca:false,timer1:true,ccp:null,xtalAdc:null},stc89c52:{header:'8052.h',portModes:false,aux1T:false,adc:false,pca:false,timer1:true,ccp:null,xtalAdc:null},stc15f2k60s2:{header:'stc12.h',portModes:true,aux1T:true,adc:true,pca:true,timer1:true,// p5: port 5 exists (P5.4/P5.5 bonded on the DIP-40) — the emitter
// declares its SFRs itself, stc12.h has none of them.
p5:true,ccp:[{port:1,bit:1},{port:1,bit:0},{port:3,bit:7}],xtalAdc:[6,7]},// STC15W408AS: lacks Timer 1. Same CCP mapping as STC15F2K. XTAL shares ADC6/7.
stc15w408as:{header:'stc12.h',portModes:true,aux1T:true,adc:true,pca:true,timer1:false,p5:true,ccp:[{port:1,bit:1},{port:1,bit:0}],xtalAdc:[6,7]},// core: 'arduino' -- pins are NUMBERS (D13, A0), and there is no C back
// end here yet. Declared so a sketch imported by cToPseudocode.js parses
// into a project and reaches the blocks; generateC() refuses them by name
// rather than emitting 8051 registers for a board that has none.
'arduino-uno':{core:'arduino',header:'Arduino.h',portModes:false,aux1T:false,adc:true},// The 168P is a 328P with half the flash — same pinout, same registers,
// same codegen; only the compile target and the byte budget differ.
'atmega168p':{core:'arduino',header:'Arduino.h',portModes:false,aux1T:false,adc:true},// The Mega: 54 digital + 16 analog pins across ports A–L, six timers.
'arduino-mega':{core:'arduino',header:'Arduino.h',portModes:false,aux1T:false,adc:true,mega:true},'arduino-nano':{core:'arduino',header:'Arduino.h',portModes:false,aux1T:false,adc:true},atmega328p:{core:'arduino',header:'avr/io.h',portModes:false,aux1T:false,adc:true},// core: 'micropython' -- the program IS the artefact, so there is no C back
// end for these by definition, not merely not yet. Pins are P0-P20 and the
// two buttons on a micro:bit.
microbit:{core:'micropython',header:null,portModes:false,aux1T:false,adc:true},// core: 'rp2040' -- GP0-GP28, and generateC() emits freestanding Cortex-M0
// bare metal (SIO GPIO, the 1 MHz TIMER as an ISR-free timebase, UART0,
// ADC over APB). Decided 2026-08-12 (stc docs/ROADMAP.md): bare-metal C
// first; MicroPython stays a future SECOND runtime for the same board.
pico:{core:'rp2040',header:null,portModes:false,aux1T:false,adc:true},// core: 'w65c02' -- the composable 6502 breadboard machine (EATER6502
// preset: W65C22 VIA at $6000, W65C51 ACIA at $5000, 1 MHz phi2).
// generateC() emits cc65-compatible freestanding C; pins are VIA port
// bits (PA0-PA7, PB0-PB6). No ADC, no PWM -- the VIA has neither, and
// Timer 1 is the millisecond timebase.
eater6502:{core:'w65c02',header:null,portModes:false,aux1T:false,adc:false},// core: 'z80' -- the composable Z80 breadboard machine. Pins are bits of
// an OUT latch + IN buffer on I/O port 0 (74HC374 + 74HC244). No ADC, no
// PWM, no interrupt-driven tick (delay-only timebase via busy loop).
// generateC() emits sdcc -mz80 compatible C: __sfr __at port declarations,
// shadow byte + OUT for pin writes, IN & mask for pin reads.
z80:{core:'z80',header:null,portModes:false,aux1T:false,adc:false},// ATtiny88: 28-pin DIP, avr25 family. Pins are PB0-7/PC0-7/PD0-7/PA0-3
// (port/bit, not Arduino Dn numbering). Timer0 has NO CTC mode — the ms
// tick uses Timer1 CTC instead. ADC on PC0-PC5 (channels 0-5).
// The Blinkenrocket pendant uses PORTB=cols, PORTD=rows for an 8x8 matrix.
attiny88:{core:'arduino',header:'avr/io.h',portModes:false,aux1T:false,adc:true,tiny88:true},// ATtiny85: five GPIO (PB0-PB4, PB5 is RESET), ADC on PB2/3/4. The
// retarget pools exist so small programs port and big ones refuse
// with the honest reason (too few pins), never 'unknown device'.
attiny85:{core:'arduino',header:'avr/io.h',portModes:false,aux1T:false,adc:true,tiny85:true}};// C keywords a sanitized Scratch name could collide with (sanitizeIdent only guards the
// Python/JS ones). SDCC's own storage-class keywords are included.
SB3Creator.C_RESERVED=new Set(['auto','break','case','char','const','continue','default','do','double','else','enum','extern','float','for','goto','if','inline','int','long','register','restrict','return','short','signed','sizeof','static','struct','switch','typedef','union','unsigned','void','volatile','while','bit','sbit','sfr','sfr16','data','idata','xdata','pdata','code','bdata','at','interrupt','using','reentrant','naked','main']);/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (SB3Creator);

/***/ })

}]);