## iOS audit: exclusive device-set directory custody — 2026-10-19

The optional controller now has an unwired directory factory. It creates a fresh
private directory exclusively and holds both its parent and directory descriptors
across commands. Identity includes device, inode, owner and permissions. Detected
replacement, parent drift or clock failure refuses subsequent use. Close releases
only held descriptors, continues through interruption and never removes directory
contents or a replacement at the original path.

The bounded command adapter accepts this context separately from the path and
checks it before spawn, after the command and after command cleanup. Real authored
subprocess controls show path-only admission accepting a between-command replacement
while held-context admission refuses it before spawn. Existing path-only controls
remain separate; the eventual wrapper must require the held context. These finite
filesystem readbacks are not an atomic namespace lease or boot/app/service authority.

Twelve filesystem controls and an identity mutation, sixteen command controls and
four platform-profile controls pass. The new default-off directory-only job selects
only these filesystem cases on macOS, starts no simulator or child command, compiles
nothing and excludes normal builds/delivery even when its selector is set alone.
It retains bounded source/job/stat/FD observations for an independent reader.
Namespace, process family, resources and app qualification remain false. Actual
platform originals are required before relying on its Darwin filesystem boundary.
