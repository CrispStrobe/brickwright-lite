// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Minimal sandboxed parent: spawns the bundled Renode child, as the
// Tauri app would, and waits for it.
#include <spawn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
#include <mach-o/dyld.h>
#include <libgen.h>
extern char **environ;
int main(int argc, char **argv) {
    char self[4096]; uint32_t n = sizeof self;
    if (_NSGetExecutablePath(self, &n) != 0) return 90;
    char child[4200]; snprintf(child, sizeof child, "%s/../Resources/renode/renode", dirname(self));
    argv[0] = child; pid_t pid;
    int rc = posix_spawn(&pid, child, NULL, NULL, argv, environ);
    if (rc != 0) { fprintf(stderr, "posix_spawn failed: %s\n", strerror(rc)); return 91; }
    int status; waitpid(pid, &status, 0);
    if (WIFSIGNALED(status)) { fprintf(stderr, "child signal %d\n", WTERMSIG(status)); return 128 + WTERMSIG(status); }
    return WEXITSTATUS(status);
}
