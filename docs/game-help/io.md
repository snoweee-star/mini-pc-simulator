# Keyboard User Manual

This document describes the Keyboard device, located at `0xC500–0xC51F` in
the system memory map, and how it interacts with the shared Interrupt
Controller (`0xC080`, see the Timer/RTC manual for `IE`/`IF`/`IVEC` basics).

Like every system register, you can read the keyboard state by raw address
or by name:

```asm
LOAD R0, 0xC500        ; by raw address
LOAD R0, KEY_STATE_0   ; by name (same address)
```

## 1. Getting keyboard input into your program — three windows can capture it

Your simulator runs entirely inside Slate's UI, sharing keyboard focus with
every other panel (the Code Editor, the address fields in Memory View,
etc). To avoid your keystrokes accidentally typing into the code editor
instead of reaching your program, keyboard capture is scoped to whichever
of these three windows currently has focus: **Video Output**, **Robot
Arm**, and **Voxel Sandbox**. Pick whichever one you're actually looking at
for your program — you don't need Video Output open just to read a key.

**To capture the keyboard: open any one of those three windows and click
anywhere inside it (title bar or content).** While it has focus, every key
you press updates `KEY_STATE_0`–`KEY_STATE_7` live — clicking any other
panel (or alt-tabbing away) hands focus back and your program stops seeing
new key events (whatever was held down at that point is automatically
released, see §4). Only one of the three can hold the keyboard at a time,
same as any other focus in the app — there's no risk of two windows
fighting over the same keystroke.

## 2. Register reference

A full 128-key bitmap across 8 words. A bit is `1` while the key is held
down, `0` when it's up.

| Register | Address | Bits 0–15 |
|---|---|---|
| `KEY_STATE_0` | `0xC500` | Up, Down, Left, Right, Space, Enter, Escape, LeftShift, LeftCtrl, LeftAlt, Tab, Backspace, Delete, CapsLock, —, — |
| `KEY_STATE_1` | `0xC502` | A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P |
| `KEY_STATE_2` | `0xC504` | Q, R, S, T, U, V, W, X, Y, Z, —, —, —, —, —, — |
| `KEY_STATE_3` | `0xC506` | 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, —, —, —, —, —, — |
| `KEY_STATE_4` | `0xC508` | F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12, —, —, —, — |
| `KEY_STATE_5` | `0xC50A` | `,` `.` `/` `;` `'` `[` `]` `\` `-` `=` `` ` ``, —, —, —, —, — |
| `KEY_STATE_6` | `0xC50C` | Home, End, PageUp, PageDown, Insert, RightShift, RightCtrl, RightAlt, —, —, —, —, —, —, —, — |
| `KEY_STATE_7` | `0xC50E` | Numpad 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, `.`, `+`, `-`, `*`, `/`, — |

Bit 0 is always the first key listed for that register. Numpad Enter
doesn't get its own bit — it shares the same underlying key as the regular
Enter, so it's already covered by `KEY_STATE_0` bit 5.

## 3. Named constants

Only the most commonly used bits have a name — the rest you address with a
raw hex mask against the right `KEY_STATE_N`, using the table above (see §5
for exactly how).

| Name | Value | Register |
|---|---|---|
| `KEY_UP` | `0x0001` | `KEY_STATE_0` |
| `KEY_DOWN` | `0x0002` | `KEY_STATE_0` |
| `KEY_LEFT` | `0x0004` | `KEY_STATE_0` |
| `KEY_RIGHT` | `0x0008` | `KEY_STATE_0` |
| `KEY_SPACE` | `0x0010` | `KEY_STATE_0` |
| `KEY_ENTER` | `0x0020` | `KEY_STATE_0` |
| `KEY_ESCAPE` | `0x0040` | `KEY_STATE_0` |
| `IRQ_KEYBOARD` | `0x0002` | `IE` / `IF` |

## 4. A safety behavior worth knowing

If focus is lost while a key is still held down (clicking another panel,
alt-tabbing, minimizing the window), you may never receive the matching
"key released" event. To prevent a key from getting permanently "stuck" as
pressed, **all 8 `KEY_STATE` registers are cleared to zero automatically**
whenever the window holding keyboard focus (Video Output, Robot Arm, or
Voxel Sandbox) loses it.

## 5. How to capture a specific key

### 5.1 Keys with a named mask (e.g. `KEY_DOWN`)

Just `AND` the register against the name — no need to know the bit
position yourself:

```asm
LOOP:
    LOAD R0, KEY_STATE_0
    AND R0, KEY_DOWN
    JZ SKIP
    ; Down está apretada
SKIP:
    JMP LOOP
```

### 5.2 Keys without a named mask (e.g. the letter `R`)

Look up which register and bit the key lives at in the table in §2, then
build the mask yourself as `1 << bit`. `R` is the 2nd letter in
`KEY_STATE_2` (`Q, R, S, T, ...`), so it's bit 1 — `0x0002`:

```asm
LOAD R0, KEY_STATE_2
AND R0, 0x0002        ; bit 1 = R (Q=bit0, R=bit1, S=bit2, ...)
JZ NOT_PRESSED
; R está apretada
```

The same idea works for anything without a name — count from bit 0 in
whichever `KEY_STATE_N` row the key is listed in. A couple more examples:

```asm
; 'Z' - último de KEY_STATE_2 (Q..Z), bit 9
LOAD R0, KEY_STATE_2
AND R0, 0x0200         ; 1 << 9

; '5' - KEY_STATE_3 (0..9), bit 5
LOAD R0, KEY_STATE_3
AND R0, 0x0020          ; 1 << 5

; F5 - KEY_STATE_4 (F1..F12), bit 4
LOAD R0, KEY_STATE_4
AND R0, 0x0010            ; 1 << 4

; Numpad 7 - KEY_STATE_7, bit 7
LOAD R0, KEY_STATE_7
AND R0, 0x0080              ; 1 << 7
```

If you'd rather not compute the hex value by hand, you can build the mask
at runtime with `SHL` instead — useful if the bit index is itself coming
from a register (e.g. iterating over every key in a row):

```asm
MOV R1, 1
MOV R2, 1              ; bit index -> R
SHL R1, R2               ; R1 = 1 << R2 = 0x0002
LOAD R0, KEY_STATE_2
AND R0, R1
JZ NOT_PRESSED
```

## 6. Polling example — movement while a key is held

Good for continuous input (moving a character while a direction is held).

```asm
LOOP:
    LOAD R0, KEY_STATE_0
    AND R0, KEY_UP
    JZ SKIP
    INC R1              ; R1 rises the whole time Up is held
SKIP:
    JMP LOOP
HLT
```

## 7. Interrupt-driven example — react once per keypress

Good for discrete actions (jump, menu confirm, typing a character) where
you want to react once per press/release, not spin a polling loop. Uses
`WAIT`, exactly like the VBlank pattern from the Timer/RTC manual — see
that document for the general `INT`/`IRET`/`IE`/`IF`/`IVEC` mechanics.

```asm
; --- setup ---
MOV R0, HANDLER
STORE R0, IVEC

MOV R0, IRQ_KEYBOARD
STORE R0, IE

; --- main loop: sleep until the next key event ---
MAIN_LOOP:
    WAIT
    JMP MAIN_LOOP

; --- runs on EVERY key event (any key, pressed or released) -
;     filter for the one you care about ---
HANDLER:
    LOAD R0, KEY_STATE_0
    AND R0, KEY_UP
    JZ HANDLER_DONE          ; a different key changed - ignore it
    INC R1                   ; Up was involved in this event
HANDLER_DONE:
    IRET

HLT
```

**Note:** `IRQ_KEYBOARD` fires on *every* key transition (press or
release, any of the 128 mapped keys) — it does not tell you which key or
whether it went down or up. Your handler has to read `KEY_STATE_0`–`7`
itself and figure out what changed, typically by comparing against a
snapshot you kept from the previous interrupt if you need edge detection
(e.g. "just pressed" vs. "still held").

## 8. Typing text — `KEY_GETCHAR`

For reading what the user *types* (as opposed to raw held/not-held state),
see the Text Mode manual's `KEY_GETCHAR` port — it translates key
presses (including the numeric keypad) into ASCII automatically, with
edge detection and a small queue, so you don't have to do any of the
bit-mask work described above yourself.

### 8.1 "Just pressed" without keeping your own snapshot — `KEY_PRESSED_0-7`

If all you need is "did this key get pressed since I last checked" — no
ASCII, no held/not-held live state, just a one-shot per-key flag — these
are cheaper than rolling your own snapshot-and-compare:

| Register | Address | Bits |
|---|---|---|
| `KEY_PRESSED_0` | `0xC512` | Same layout as `KEY_STATE_0` |
| `KEY_PRESSED_1` | `0xC514` | Same layout as `KEY_STATE_1` |
| `KEY_PRESSED_2` | `0xC516` | Same layout as `KEY_STATE_2` |
| `KEY_PRESSED_3` | `0xC518` | Same layout as `KEY_STATE_3` |
| `KEY_PRESSED_4` | `0xC51A` | Same layout as `KEY_STATE_4` |
| `KEY_PRESSED_5` | `0xC51C` | Same layout as `KEY_STATE_5` |
| `KEY_PRESSED_6` | `0xC51E` | Same layout as `KEY_STATE_6` |
| `KEY_PRESSED_7` | `0xC520` | Same layout as `KEY_STATE_7` |

Each bit turns on the instant that key goes down, and **stays on until you
read the register** — reading clears the *entire* register at once, not
one bit at a time. That's the important part to design around: read it
**once** into a CPU register, then test as many bits as you need against
that saved copy — a second `LOAD` from `KEY_PRESSED_N` will come back all
zeros, having already been consumed by the first one:

```asm
LOOP:
    LOAD R0, KEY_PRESSED_0     ; one read - this clears KEY_PRESSED_0 for next time
    MOV R1, R0
    AND R1, KEY_UP
    JZ CHECK_DOWN
    ; Up was pressed at some point since the last time through this loop
CHECK_DOWN:
    MOV R1, R0                 ; testing R0 again, NOT re-reading the register
    AND R1, KEY_DOWN
    JZ SKIP
    ; Down was pressed too
SKIP:
    JMP LOOP
```

Because it latches until read, `KEY_PRESSED_N` never misses a tap no
matter how infrequently your program checks it — see §10 for exactly the
kind of bug this avoids.

### 8.2 A queue for every key, not just typed characters — `KEY_EVENT_QUEUE`

`KEY_GETCHAR` (§8) only queues presses that translate to ASCII. If you
want *every* key — arrows, F-keys, modifiers, anything in the 128-key
map — queued in order, with both press **and** release, use
`KEY_EVENT_QUEUE` instead:

| Register | Address | Access | Purpose |
|---|---|---|---|
| `KEY_EVENT_QUEUE` | `0xC522` | RO | pop the oldest pending event, or `0xFFFF` if none |
| `KEY_EVENT_QUEUE_COUNT` | `0xC524` | RO | how many events are waiting (doesn't consume one) |

Each popped value packs a key and a direction:

- Bits 0–6: `KeyCode` (0–127) = `RegisterIndex*16 + BitIndex` — the same
  register/bit numbering as the `KEY_STATE_0-7` table in §2. To get back
  to a row and bit: `Register = KeyCode >> 4`, `Bit = KeyCode & 0x0F`.
- Bit 7 (`KEY_EVENT_PRESSED_BIT`, `0x0080`): `1` = press, `0` = release.

```asm
LOOP:
    LOAD R0, KEY_EVENT_QUEUE
    MOV R1, 0xFFFF
    CMP R0, R1
    JZ LOOP                     ; nothing pending right now

    MOV R2, R0
    AND R2, KEY_EVENT_PRESSED_BIT
    ; R2 != 0 -> this was a press, R2 == 0 -> a release

    MOV R2, R0
    AND R2, 0x007F               ; strip bit 7, keep just the KeyCode
    ; R2 now holds 0-127 - compare it, or split it into
    ; Register/Bit with SHR 4 / AND 0x0F if you need the row it came from
    JMP LOOP
HLT
```

Up to 32 events queue up if your program doesn't drain them fast enough;
past that, new ones are dropped rather than overwriting older ones
(same policy as `KEY_GETCHAR`'s queue). Losing a window's focus (§4) does
**not** inject synthetic "release" events into this queue directly, but
since it zeroes `KEY_STATE_0-7`, the very next check naturally sees those
keys go from held to not-held and queues the release normally.

### 8.3 Why these three don't show up in the Memory View

`KEY_GETCHAR`, `KEY_PRESSED_0-7`, and `KEY_EVENT_QUEUE` are the exception
to an otherwise simple rule: everywhere else in this machine, if you can
`LOAD` it, you can also just look at it sitting in memory. These three
can't work that way — each one's whole purpose is to **consume or clear
itself the instant it's read** (pop the oldest queued character/event, or
zero out the whole latch), so there's no single "value" sitting at that
address for a passive memory view to display. Looking at it and reading
it would have to be the same action, and a debugger that could tell the
difference would defeat the point of the register.

This isn't a bug, and it isn't unique to this simulator — real hardware
has the exact same wrinkle. A real UART's receive-status register, for
example, typically clears its "byte available" flag the moment the CPU
reads it, for the same reason: it's signaling "you have exactly one
chance to catch this."

**If you need to see what one of these three actually holds while
debugging, execute a real `LOAD` and look at the destination register
instead of the memory address:**

```asm
LOAD R7, KEY_EVENT_QUEUE   ; now check R7 in the Register panel, not 0xC522 in Memory View
```

Every other register in this document — `KEY_STATE_0-7` included — is
ordinary memory the whole time, visible in the Memory View exactly as
written, no `LOAD` required to "activate" it.

## 9. Current limitations

- Numpad Enter shares a key with the regular Enter (see §2) — there's no
  way to tell them apart.
- `KEY_PRESSED_0-7` (§8.1) clears an entire register per read, not one bit
  at a time — read it once per pass through your loop, not once per key
  you want to test (see the code example in §8.1).

## 10. A design pitfall worth knowing — where to put your throttle

If your program only wants to act every so often (once every few VBlanks,
once every N loop iterations, whatever) while still checking the keyboard
in a tight loop or an interrupt handler, **the throttle has to go in front
of the *action*, never in front of the *read*:**

```asm
; WRONG - skips reading the keyboard most of the time
HANDLER:
    ... throttle counter logic ...
    JNZ HANDLER_DONE           ; <- bails out BEFORE ever touching KEY_STATE_0
    LOAD R0, KEY_STATE_0
    ...

; RIGHT - always reads, only throttles what it DOES with what it read
HANDLER:
    LOAD R0, KEY_STATE_0       ; every single time, no exceptions
    ... throttle counter logic ...
    JNZ HANDLER_DONE           ; only the movement/action below this point is paced
    ...
```

Reading `KEY_STATE_0-7` (or anything else, for that matter) has no cost
and no side effects, so there's never a reason to gate it. Gating the read
itself means any keypress that starts and ends inside one of the "skipped"
windows is gone without a trace — not delayed, genuinely invisible to your
program, since none of the live-state registers keep any history of their
own. This is exactly the situation `KEY_PRESSED_0-7` and `KEY_EVENT_QUEUE`
(§8.1–8.2) exist to make foolproof — both latch until read, so even a
program that only checks once in a while won't miss anything — but it's a
good habit to follow even when polling `KEY_STATE_0-7` directly.

**A second version of the same mistake: throttling the *action* built on
top of a one-shot latch.** `KEY_PRESSED_0-7` already guarantees a brief
tap survives until you read it — but if you *also* gate what you do with
that read behind a periodic throttle ("only act every 8th VBlank"), you've
reintroduced the exact same problem one level up. A quick tap only keeps
its latched bit around for a narrow window (until the next time anything
reads that register); if your throttle's "go ahead" tick doesn't happen to
land inside that window, the tap is lost — even though the detection
itself worked perfectly. `SPACE`/confirm-style one-shot actions (plant
something, fire once, confirm a menu) don't need a throttle at all: reading
`KEY_PRESSED_N` already limits you to one action per physical press, since
the bit can't come back until the key is released and pressed again. Save
throttles for things that are genuinely continuous (movement while a key
is *held*, read live from `KEY_STATE_N`) — never stack one on top of an
already-one-shot signal.
