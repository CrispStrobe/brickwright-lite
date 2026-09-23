/* The tiny freestanding runtime for the hosted RISC-V C route: the console I/O a
 * beginner's program needs, over the machine's ECALL ABI (a7=64 write, a7=93
 * exit). No newlib — printf() here is a small varargs implementation covering
 * %c %s %d %u %x and %%, which is enough for the console and keeps the image
 * tiny. A learner's `printf("...")` / `puts` / `putchar` just work; anything
 * heavier is out of scope for a browser console and the compiler says so.
 */
typedef unsigned int   size_t_;
typedef __builtin_va_list va_list;
#define va_start __builtin_va_start
#define va_arg   __builtin_va_arg
#define va_end   __builtin_va_end

static long ecall3(long n, long a0, long a1, long a2) {
    register long x10 __asm__("a0") = a0;
    register long x11 __asm__("a1") = a1;
    register long x12 __asm__("a2") = a2;
    register long x17 __asm__("a7") = n;
    __asm__ volatile("ecall" : "+r"(x10) : "r"(x11), "r"(x12), "r"(x17) : "memory");
    return x10;
}

int write(int fd, const void *buf, unsigned len) { return (int)ecall3(64, fd, (long)buf, len); }
void _exit(int code) { ecall3(93, code, 0, 0); for (;;) {} }

static unsigned slen(const char *s) { unsigned n = 0; while (s[n]) n++; return n; }

int putchar(int c) { char ch = (char)c; write(1, &ch, 1); return c; }
int puts(const char *s) { write(1, s, slen(s)); putchar('\n'); return 0; }

static void put_uint(unsigned v, unsigned base, int upper) {
    char tmp[32]; int i = 0;
    const char *dig = upper ? "0123456789ABCDEF" : "0123456789abcdef";
    if (v == 0) tmp[i++] = '0';
    while (v) { tmp[i++] = dig[v % base]; v /= base; }
    while (i) putchar(tmp[--i]);
}

int printf(const char *fmt, ...) {
    va_list ap; va_start(ap, fmt);
    for (const char *p = fmt; *p; p++) {
        if (*p != '%') { putchar(*p); continue; }
        switch (*++p) {
            case 'c': putchar((char)va_arg(ap, int)); break;
            case 's': { const char *s = va_arg(ap, const char *); write(1, s, slen(s)); break; }
            case 'd': { int v = va_arg(ap, int); if (v < 0) { putchar('-'); put_uint((unsigned)(-v), 10, 0); }
                        else put_uint((unsigned)v, 10, 0); break; }
            case 'u': put_uint(va_arg(ap, unsigned), 10, 0); break;
            case 'x': put_uint(va_arg(ap, unsigned), 16, 0); break;
            case 'X': put_uint(va_arg(ap, unsigned), 16, 1); break;
            case '%': putchar('%'); break;
            case '\0': va_end(ap); return 0;
            default: putchar('%'); putchar(*p); break;
        }
    }
    va_end(ap); return 0;
}
