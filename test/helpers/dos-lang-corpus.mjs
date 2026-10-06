/**
 * Pseudocode programs for the fe and Tcl tabs, each with the console output
 * the DOS interpreter must print for it. Shared by the unit test (generators,
 * readers, fixed points) and the bench test (the shipped fe.exe / tcl.exe
 * actually running the generated code).
 *
 * `out.tcl` / `out.fe` are what Scratch would say, in each interpreter's own
 * number format: partcl is 16-bit integer (7 / 2 is 3), fe is float (3.5).
 * A language missing from `out` refuses the program by name — `refuse` holds
 * a fragment of the reason it must give.
 */
export const DOS_LANG_CORPUS = {
    counting: {
        src: `GLOBAL n
GLOBAL total
WHEN flag clicked:
  set n to 5
  set total to 0
  REPEAT n + 1:
    change total by n
  say total
  REPEAT 3:
    change n by -1
    say n
`,
        out: {tcl: ['30', '4', '3', '2'], fe: ['30', '4', '3', '2']}
    },
    branches: {
        src: `GLOBAL a
GLOBAL b
WHEN flag clicked:
  set a to 7
  set b to 2
  IF (a > 3) and not (b = 4) THEN:
    say "yes"
  ELSE:
    say "no"
  IF (a < b) or (b > 5) THEN:
    say "never"
  ELSE:
    IF a = 7 THEN:
      say "seven"
  IF not (a < b) THEN:
    say "a wins"
`,
        out: {tcl: ['yes', 'seven', 'a wins'], fe: ['yes', 'seven', 'a wins']}
    },
    arithmetic: {
        src: `GLOBAL r
WHEN flag clicked:
  say (17 mod 5)
  say (0 - 7) mod 3
  say 7 / 2
  set r to (2 + 3) * (10 - 4)
  say r
`,
        out: {tcl: ['2', '2', '3', '30'], fe: ['2', '2', '3.5', '30']}
    },
    procedures: {
        // Recursion through a custom block's argument; no globals inside,
        // so partcl can run it too.
        src: `DEFINE countdown (k):
  IF k > 0 THEN:
    say k
    countdown (k - 1)
DEFINE twice (word):
  REPEAT 2:
    say word
WHEN flag clicked:
  countdown 3
  twice "hey"
`,
        out: {tcl: ['3', '2', '1', 'hey', 'hey'], fe: ['3', '2', '1', 'hey', 'hey']}
    },
    loops: {
        src: `GLOBAL i
GLOBAL j
WHEN flag clicked:
  set i to 0
  REPEAT UNTIL i = 3:
    change i by 1
    set j to 0
    REPEAT i:
      change j by 10
    say j
  wait 0.1 secs
  say "done"
`,
        out: {tcl: ['10', '20', '30', 'done'], fe: ['10', '20', '30', 'done']}
    },
    joinAndStop: {
        // join is Tcl-only (fe cannot build text); so is stop.
        src: `GLOBAL n
WHEN flag clicked:
  set n to 0
  FOREVER:
    change n by 1
    say ("n=" join n)
    IF n = 2 THEN:
      stop this script
`,
        out: {tcl: ['n=1', 'n=2']},
        refuse: {fe: 'join'}
    },
    procWithGlobal: {
        // fe custom blocks see globals; partcl procs do not.
        src: `GLOBAL total
DEFINE add (k):
  change total by k
WHEN flag clicked:
  set total to 1
  add 4
  add 5
  say total
`,
        out: {fe: ['10']},
        refuse: {tcl: 'sees only its own arguments'}
    }
};
