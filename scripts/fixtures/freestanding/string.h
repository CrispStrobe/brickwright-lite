#ifndef BW_CYCLE_QUALIFICATION_STRING_H
#define BW_CYCLE_QUALIFICATION_STRING_H

#include <stddef.h>

static inline void *memset(void *destination, int value, size_t count) {
    unsigned char *bytes = (unsigned char *)destination;
    for (size_t index = 0; index < count; index++) bytes[index] = (unsigned char)value;
    return destination;
}

#endif
