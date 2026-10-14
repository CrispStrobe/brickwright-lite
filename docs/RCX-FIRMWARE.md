# RCX firmware: what we may ship, and what the user has to bring

The RCX's ROM holds a bootstrap and nothing else. Firmware lives in RAM and is
lost whenever the batteries are, so *every* RCX toolchain has to answer the
question "where does the firmware come from" — it is not a one-time setup step
that can be assumed away.

This file records the answer, because it constrains what our RCX support can
do out of the box.

## The bytecode NQC emits runs on exactly one firmware

NQC compiles to the bytecode of **LEGO's standard firmware** (`firm0309.lgo`
for RCX 2.0). That is the VM whose opcodes RCX Internals documents, and it is
the VM our `.rcx` images are written for.

It is LEGO's own binary. It shipped with the retail Mindstorms software and in
LEGO's SDKs, under no free licence and with no redistribution grant. **We
cannot ship it**, and neither can anyone else — which is why every tool in
this space handles it the same way: the user supplies the file, from their own
LEGO installation or from a LEGO SDK download, and the tool downloads it to
the brick.

So our RCX path is *bring your own firmware*. A brick that has never been
given firmware cannot run anything we compile, and the honest thing is to say
so at the point of use rather than to fail mysteriously.

## The free replacements exist — but they are a different compiler, not a different download

This is the part that is easy to get wrong. The free firmwares are not drop-in
substitutes that would let us ship a complete toolchain, because **none of
them executes standard-firmware bytecode.** Each replaces the VM outright and
therefore replaces the compiler too:

| Firmware | Licence (verified) | What it runs | What it would cost us |
| --- | --- | --- | --- |
| LEGO standard (`firm0309.lgo`) | proprietary, no redistribution | NQC bytecode | nothing to build; cannot ship the file |
| [brickOS-bibo](https://github.com/BrickBot/brickOS-bibo) | **MPL-2.0** | native H8/300 code | an H8/300 C toolchain, and a different back end |
| [TinyVM](https://github.com/BrickBot/TinyVM) | **MPL-1.0** | a Java subset | a Java front end; leJOS's ancestor |
| leJOS RCX | MPL | Java bytecode | as above, larger |
| pbForth | free (not re-verified here) | Forth | a Forth front end |

Both licences in bold were read from the repositories' own `LICENSE` files, not
inferred from a badge. That matters: **MPL is shippable** under the same rule
that lets us ship NQC itself, so a free end-to-end RCX path is genuinely
available — it is simply a *second* toolchain, not a substitute firmware for
the one we have.

The practical consequence, and the reason this is written down rather than
attempted: the NQC path is finished and costs the user one file they already
own if they own an RCX; the brickOS path would ship complete but needs an
H8/300 compiler in the browser and a code generator we do not have. The first
is what we built. The second is a real option, and this table is what someone
would start from.

## What this means for the UI

  * Do not imply the brick is ready. Offer the firmware download as an
    explicit step, and say plainly that the file comes from the user.
  * Never fetch `firm0309.lgo` from a third-party mirror on the user's behalf.
    Mirrors of it exist; their existence is not a licence.
  * The firmware download link runs at 2400 baud like everything else unless
    the fast mode is used; it is slow (tens of seconds) and needs a progress
    indication rather than a spinner.

See `docs/RCX-IR-PROTOCOL.md` for the wire protocol the download rides on.
