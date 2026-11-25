# Timer / RTC User Manual

This document describes the Timer/RTC memory-mapped device, located at
`0xC600–0xC6FF` in the system memory map, along with the shared Interrupt
Controller (`0xC080–0xC0FF`) that lets it wake up your program without
polling.

All registers can be accessed two ways — they behave identically, use
whichever reads better in context:

```asm
LOAD R0, 0xC600        ; by raw address
LOAD R0, FRAME_COUNT_LO ; by name (same address, resolved at assemble time)
```

Named constants are case-insensitive and resolve exactly like a label. You
cannot declare your own label with the same name as a system constant — the
assembler will reject it with a "collides with a reserved system constant
name" error.

---

## 1. Register Reference

### 1.1 Timer / RTC block (`0xC600`)

| Name | Address | Access | Width | Purpose |
|---|---|---|---|---|
| `FRAME_COUNT_LO` | `0xC600` | RO | 16-bit | Low word of the VBlank counter |
| `FRAME_COUNT_HI` | `0xC602` | RO | 16-bit | High word of the VBlank counter |
| `UPTIME_MS_LO` | `0xC604` | RO | 16-bit | Low word of milliseconds since Reset |
| `UPTIME_MS_HI` | `0xC606` | RO | 16-bit | High word of milliseconds since Reset |
| `TIMER_CTRL` | `0xC608` | RW | 16-bit | bit0 = enable the VBlank interrupt |
| `GPT_RELOAD` | `0xC60A` | RW | 16-bit | General Purpose Timer reload value, in ms |
| `GPT_COUNTER` | `0xC60C` | RW | 16-bit | General Purpose Timer countdown, in ms |
| `GPT_CTRL` | `0xC60E` | RW | 16-bit | bit0 = enable, bit1 = repeat |
| `RTC_SECOND` | `0xC610` | RO | 16-bit | Real-world seconds (0–59) |
| `RTC_MINUTE` | `0xC612` | RO | 16-bit | Real-world minutes (0–59) |
| `RTC_HOUR` | `0xC614` | RO | 16-bit | Real-world hour, 24h format (0–23) |
| `RTC_DAY` | `0xC616` | RO | 16-bit | Day of the month (1–31) |
| `RTC_MONTH` | `0xC618` | RO | 16-bit | Month (1–12) |
| `RTC_YEAR` | `0xC61A` | RO | 16-bit | Full year (e.g. 2026) |
| `RTC_WEEKDAY` | `0xC61C` | RO | 16-bit | Day of week: **0 = Monday** … 6 = Sunday |

### 1.2 Interrupt Controller (`0xC080`)

Shared by every interrupt-capable device in the system, not just the Timer.

| Name | Address | Access | Purpose |
|---|---|---|---|
| `IE` | `0xC080` | RW | Interrupt Enable — one bit per device |
| `IF` | `0xC082` | RW | Interrupt pending flags — auto-clears the bit for whichever interrupt gets dispatched |
| `IVEC` | `0xC084` | RW | Address of your shared interrupt handler |

### 1.3 Bit masks

| Name | Value | Used with |
|---|---|---|
| `IRQ_TIMER` | `0x0001` | `IE` / `IF` — the Timer's VBlank interrupt bit |
| `TIMER_CTRL_VBLANK_IRQ_ENABLE` | `0x0001` | `TIMER_CTRL` — turns VBlank IRQ generation on |
| `GPT_CTRL_ENABLE` | `0x0001` | `GPT_CTRL` — starts the General Purpose Timer |
| `GPT_CTRL_REPEAT` | `0x0002` | `GPT_CTRL` — auto-reload instead of one-shot |

### 1.4 Related instructions

| Instruction | Operands | Purpose |
|---|---|---|
| `WAIT` | none | Puts the CPU to sleep until the next interrupt fires |
| `INT` | none | Software interrupt — manually jumps to `IVEC` (ignores `IE`) |
| `IRET` | none | Returns from an interrupt handler (restores FLAGS and PC) |

---

## 2. `FRAME_COUNT` — the game clock

**What it is:** a 32-bit counter that increments 60 times per real-world
second — always, regardless of how fast or slow your CPU's clock speed
(MIPS) is set.

**When to use it:** as the heartbeat for anything that should run at a
fixed real-world rate — game logic, animation timing, cooldowns measured in
frames. This is what decouples your game's speed from the simulator's MIPS
slider: raising the MIPS slider gives you *more instructions per frame*,
not a faster game.

**Important:** `FRAME_COUNT` pauses whenever the CPU pauses (manual pause,
breakpoint, or `HLT`) — it represents "the console's internal clock," not
wall-clock time. If you need real wall-clock time that keeps advancing
regardless of program state, see the RTC section below.

**Basic example — poll for frame changes:**

```asm
; Runs a tiny piece of logic exactly once every 60 real Hz, by polling.
MOV R2, 0                  ; R2 = last frame count we reacted to

MAIN_LOOP:
    LOAD R0, FRAME_COUNT_LO
    SUB R1, R0
    MOV R1, R0              ; R1 = R0 (current frame count)
    ; (a proper "did the frame change" check compares R0 against R2 here;
    ; kept simple in this example — see the interrupt-driven version in
    ; section 5 for the fully correct pattern)
    JMP MAIN_LOOP
HLT
```

---

## 3. `UPTIME_MS` — real elapsed time

**What it is:** a 32-bit counter of milliseconds since the last `Reset()`.
Same pause behavior as `FRAME_COUNT` (freezes with the CPU).

**When to use it:** anywhere you want finer-grained timing than a whole
frame — measuring how long something inside your program's own logic took,
implementing a countdown display in milliseconds, etc. For "wait N
milliseconds without busy-looping," prefer the General Purpose Timer
(section 4) instead — it doesn't require you to keep re-reading and
comparing values every iteration.

```asm
LOOP:
    LOAD R2, UPTIME_MS_LO
    LOAD R3, UPTIME_MS_HI
    JMP LOOP
HLT
```

---

## 4. General Purpose Timer (GPT)

**What it is:** a second, independent millisecond countdown timer, separate
from the fixed 60Hz VBlank clock. You set how long it counts down
(`GPT_RELOAD`), start it (`GPT_CTRL`), and either poll it or (once you're
comfortable with interrupts) let it interrupt you when it's done.

**When to use it:** precise delays that aren't tied to the frame rate —
"wait exactly 500ms," a cooldown timer with its own custom duration, or a
second clock source for things like a music/audio engine that ticks at a
different rate than your video logic.

Max delay per countdown is ~65.5 seconds (16-bit, in milliseconds). For
longer delays, either chain multiple counts or use `UPTIME_MS`/`FRAME_COUNT`
comparisons instead.

### 4.1 One-shot mode

Counts down once, then automatically clears `GPT_CTRL_ENABLE` — poll it to
know when it's done.

```asm
; Waits ~1 real second, then stops on its own.
MOV R0, 1000
STORE R0, GPT_RELOAD
STORE R0, GPT_COUNTER
MOV R0, GPT_CTRL_ENABLE
STORE R0, GPT_CTRL

WAIT_GPT:
    LOAD R0, GPT_CTRL
    AND R0, GPT_CTRL_ENABLE
    JNZ WAIT_GPT           ; still 1 (enabled) while counting down

MOV R1, 1                   ; done!
HLT
```

### 4.2 Repeat mode

Auto-reloads from `GPT_RELOAD` every time it hits zero, running
indefinitely until you clear `GPT_CTRL_ENABLE` yourself.

```asm
MOV R0, 250
STORE R0, GPT_RELOAD
STORE R0, GPT_COUNTER
MOV R0, GPT_CTRL_ENABLE
MOV R1, GPT_CTRL_REPEAT
OR R0, R1
STORE R0, GPT_CTRL

LOOP:
    LOAD R5, GPT_COUNTER    ; counts 250 -> 0 -> 250 -> 0 ... forever
    JMP LOOP
HLT
```

---

## 5. RTC — real-world date and time

**What it is:** the host machine's actual current date and time.

**When to use it:** anything that should reflect the real world regardless
of what your simulated program is doing — a save-file timestamp, a
day/night or calendar mechanic tied to the real date, an on-screen clock.

**Important — different pause behavior than the rest of this device:**
unlike `FRAME_COUNT`/`UPTIME_MS`/GPT, the RTC keeps updating **even while
the CPU is paused**, because it represents real-world time, not the
simulated console's internal clock. Values refresh about once per second.

```asm
LOOP:
    LOAD R0, RTC_HOUR
    LOAD R1, RTC_MINUTE
    LOAD R2, RTC_SECOND
    LOAD R3, RTC_DAY
    LOAD R4, RTC_MONTH
    LOAD R5, RTC_YEAR
    LOAD R6, RTC_WEEKDAY    ; 0 = Monday ... 6 = Sunday
    JMP LOOP
HLT
```

---

## 6. Interrupt-driven usage: `WAIT` + VBlank IRQ

Polling `FRAME_COUNT` works, but it wastes CPU budget spinning in a loop.
The recommended pattern for anything performance-sensitive (like a game
loop) is to let the Timer interrupt your program automatically, 60 times a
second, and have the CPU do nothing at all between interrupts via `WAIT`.

**Setup, once, at the start of your program:**
1. Store the address of your interrupt handler into `IVEC`.
2. Enable VBlank IRQ generation in `TIMER_CTRL`.
3. Enable the Timer's bit in `IE`.

**Then loop:** `WAIT` (sleep), and let the hardware do the rest. Your
handler runs automatically every 1/60s and returns with `IRET`.

```asm
; --- one-time setup ---
MOV R0, HANDLER
STORE R0, IVEC                          ; "when interrupted, jump here"

MOV R0, TIMER_CTRL_VBLANK_IRQ_ENABLE
STORE R0, TIMER_CTRL                    ; Timer device: VBlank IRQ armed

MOV R0, IRQ_TIMER
STORE R0, IE                            ; globally: Timer interrupts allowed

; --- main loop: do nothing until the hardware wakes us up ---
MAIN_LOOP:
    WAIT
    JMP MAIN_LOOP

; --- runs automatically, once per real 1/60s ---
HANDLER:
    INC R1                              ; one "frame" of game logic goes here
    IRET

HLT                                     ; unreachable - only here to satisfy
                                         ; the assembler's "must contain a HLT" check
```

Raising the MIPS slider with this pattern does **not** make the game run
faster — it gives `HANDLER` more instruction budget to do its work within
each 1/60s window, which is exactly the intended behavior (more sprites,
finer collision checks, etc., without becoming choppy).

### 6.1 `INT` — triggering the handler manually

`INT` jumps to `IVEC` immediately, exactly like a hardware interrupt does,
but it's triggered by your own code and **ignores `IE`** (it cannot be
masked). Useful for testing your handler without waiting for a real VBlank,
or for treating "interrupt handler" as a reusable subroutine entry point
callable from software too.

### 6.2 Things worth knowing

- **One pending bit, not a counter.** `IF` has a single bit for the Timer.
  If two VBlanks happen to fire before your handler gets to run (extreme
  lag spike), the second one is simply lost — there's no queue.
- **No nested interrupts.** While your handler is running (between the
  jump to `IVEC` and your `IRET`), further Timer interrupts are held off
  automatically. You don't need to do anything special to prevent
  re-entrancy.
- **No separate global mask instruction.** There's no `EI`/`DI` pair —
  to temporarily block all interrupts outside of a handler, clear `IE`
  yourself and restore it later.
- **FLAGS are preserved automatically.** The interrupt entry/exit sequence
  saves and restores the FLAGS register for you, so an interrupt firing
  mid-calculation won't corrupt a pending `JZ`/`JNZ`/etc. in your main
  code.
