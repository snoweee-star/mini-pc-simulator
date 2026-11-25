# Instruction Set User Manual

The complete reference for everything the assembler and CPU support —
every opcode, every directive, syntax, flag effects, and worked
examples for each.

## 1. Architecture at a glance

- **16 general-purpose registers**, `R0`–`R15`, plus `PC` (program
  counter), `SP` (stack pointer), and `FLAGS`.
- **Every instruction is exactly 6 bytes**: 1 byte opcode, 1 byte
  addressing mode, 2 operand words (2 bytes each). This fixed size is
  why the assembler can always compute addresses without decoding
  instructions first. Directives (§12–13) are the exception — they
  occupy exactly the bytes they declare, not 6.
- **64KB address space** (`0x0000`–`0xFFFF`). See the Memory Controller
  manual for how banking extends the effective program size beyond
  that, and the Video Controller / PPU / Keyboard / etc. manuals for
  what lives in the memory-mapped I/O region (`0xC000`+).

## 2. Addressing modes

| Form | Meaning | Example |
|---|---|---|
| `Rn` | A register, `R0`–`R15` | `R3` |
| Immediate | A literal number, hex value, or named constant/label — used directly as a value | `100`, `0xFF`, `SCREEN_WIDTH` |
| Direct address | A literal number/label used as a memory **address** | `LOAD R1, 0x8000` |
| Register pointer | `[Rn]` — the address is whatever value `Rn` currently holds | `LOAD R1, [R2]` |
| Indexed | `[Base+Index]` — **both parts must be registers**; the address is their sum | `LOAD R1, [R4+R6]` |

**A hard rule that trips people up:** for every two-operand
instruction, **the first operand must always be a plain register** —
never a bracketed address, never a direct address. Addressing modes
only ever appear in the *second* operand's position.

```asm
STOREB R2, [R5]      ; correct - value register first, address second
STOREB [R5], R2      ; WRONG - will be rejected: "invalid first operand"
```

## 3. Flags

Four flags, packed into the `FLAGS` register: **Z** (zero), **C**
(carry), **N** (negative), **O** (overflow). **Data-movement
instructions never touch flags** — `LOAD`/`STORE`/`LOADB`/`STOREB`/
`MOV`/`PUSH`/`POP` all leave `FLAGS` exactly as they found it. This
matters most for `LOADB`: a `JZ` right after it does **not** reflect
whether the loaded byte was zero — you need an explicit `CMP` first.

Arithmetic and logical instructions each have their own specific
behavior for exactly which flags they touch and how — see §5.1 for the
confirmed, implementation-level detail (it's more interesting, and more
irregular, than "follows standard conventions" would suggest — `C` in
particular genuinely extends `ADD`/`SUB`/`ROL`/`ROR` to a 17th bit, but
plays no role at all in `MUL`/`SHL`/`SHR`).

## 4. Data movement

### 4.1 `MOV` — copy a value into a register

```
MOV dst, src
```

`dst` must be a register. `src` can be a register or an immediate
value (a number, hex value, or named label/constant).

```asm
MOV R0, 42          ; R0 = 42
MOV R1, 0xFF          ; R1 = 255
MOV R2, R0               ; R2 = R0's current value
MOV R3, SCREEN_WIDTH       ; R3 = whatever SCREEN_WIDTH resolves to
```

`MOV` never touches flags, and never accepts an address expression on
either side — for that, see `LOAD`/`STORE` below.

### 4.2 `LOAD` / `STORE` — move a whole 16-bit word to/from memory

```
LOAD dst, addr
STORE src, addr
```

`dst`/`src` must be a register. `addr` accepts any addressing mode from
§2: a direct address, `[Rn]`, or `[Base+Index]`.

```asm
STORE R0, 0x8000        ; write R0 (16 bits) to a fixed address
LOAD R2, 0x8000            ; read it back into R2

MOV R4, 0x8100               ; R4 = a pointer
STORE R0, [R4]                  ; write through the pointer
LOAD R5, [R4]                      ; read through the pointer

MOV R6, 0x8200                        ; base
MOV R7, 3                                ; index
STORE R0, [R6+R7]                           ; write at base+index
LOAD R8, [R6+R7]                                ; read it back
```

A common real-world pattern: writing to a memory-mapped I/O port with a
retry loop, waiting for the write to actually "stick" (used throughout
the Video Controller manual for VRAM access, which is gated by timing):

```asm
RETRY:
    STORE R3, VRAM_ADDR
    STORE R1, VRAM_DATA
    STORE R3, VRAM_ADDR
    LOAD  R0, VRAM_DATA
    CMP   R0, R1
    JNZ   RETRY            ; didn't stick yet - try again
```

### 4.3 `LOADB` / `STOREB` — move exactly 1 byte

Every other memory instruction (`LOAD`/`STORE`) always moves a full
16-bit word. `LOADB`/`STOREB` move exactly **1 byte** instead — nothing
in the neighboring byte is touched or read. These exist to make
byte-oriented work (strings, packed pixel data, small tables)
practical without constantly unpacking/repacking words.

```
LOADB dst, addr
STOREB src, addr
```

```asm
LOADB R1, 0x8000     ; R1 = the single byte at 0x8000, high byte of R1 = 0x00
STOREB R2, 0x8000    ; writes only the LOW byte of R2 to 0x8000
```

**`LOADB` zero-extends**: the destination register's high byte is
always cleared to `0x00`, never left with leftover data from a previous
value in that register.

Same addressing modes as `LOAD`/`STORE`, same operand order
(value/destination register first, address expression second):

```asm
LOADB R1, [R4+R6]     ; indexed - both parts must be registers
STOREB R2, [R5]        ; register pointer with brackets
STOREB R2, R5           ; same thing, without brackets
```

**`LOADB`/`STOREB` don't affect flags** — same as every other
data-movement instruction (§3). A `JZ` right after a `LOADB` will
**not** reflect whether the loaded byte was zero:

```asm
LOADB R2, [R4+R6]
CMP R2, 0             ; <- required; LOADB alone doesn't set the Z flag
JZ END_OF_STRING
```

**Worked example: walk a string byte by byte using indexed addressing**

```asm
JMP MAIN
MSG:
    .DB "Hello", 0
MAIN:
    MOV R4, MSG      ; base pointer - must be a register to use [Base+Index]
    MOV R6, 0          ; index

LOOP:
    LOADB R2, [R4+R6]
    CMP R2, 0
    JZ DONE
    ; ... do something with the character in R2 ...
    INC R6
    JMP LOOP

DONE:
    HLT
```

**Reading/writing VRAM one byte at a time:** `STOREB`/`LOADB` to
`VRAM_DATA` work exactly like `STORE`/`LOAD`, just advancing
`VRAM_ADDR` by 1 instead of 2 — see the Video Controller manual. This
is the mechanism used for VDP pixel plotting (one pixel = one byte).

### 4.4 `PUSH` / `POP` — the stack

```
PUSH src
POP dst
```

`PUSH` writes `src` to the address `SP` points at and advances `SP`;
`POP` retreats `SP` and reads from there into `dst`. Stack access is
strictly LIFO (last in, first out) — pop things back in the *reverse*
order you pushed them:

```asm
PUSH R0
PUSH R1
PUSH R2

POP R2    ; gets back what was in R2
POP R1    ; gets back what was in R1
POP R0    ; gets back what was in R0
```

A common use: save registers you're about to clobber inside a
subroutine, and restore them before returning, so the caller doesn't
notice anything changed:

```asm
SCRATCH_SUBROUTINE:
    PUSH R0
    PUSH R1

    ; ... freely use R0 and R1 for scratch work here ...

    POP R1
    POP R0
    RET
```

`CALL`/`RET` (§8) and `INT`/`IRET` (§10) use the same stack internally
to save return addresses — mixing your own `PUSH`/`POP` with those is
fine as long as you always balance what you pushed against what you
pop, in the right order, before the matching `RET`/`IRET`.

## 5. Arithmetic

| Instruction | Syntax | Effect |
|---|---|---|
| `ADD` | `ADD dst, src` | `dst` += `src` |
| `SUB` | `SUB dst, src` | `dst` -= `src` |
| `MUL` | `MUL dst, src` | `dst` *= `src` |
| `DIV` | `DIV dst, src` | `dst` /= `src` (integer division) |
| `MOD` | `MOD dst, src` | `dst` = `dst` % `src` |
| `INC` | `INC dst` | `dst` += 1 — flag-for-flag identical to `ADD dst, 1` |
| `DEC` | `DEC dst` | `dst` -= 1 — flag-for-flag identical to `SUB dst, 1` |
| `CMP` | `CMP dst, src` | Computes `dst` - `src` and updates flags **exactly like `SUB`**, but discards the result — `dst` is left unchanged. Used purely to set up a conditional jump. |

`src`/`dst` can be a register or an immediate value wherever a value
(not an address) is expected.

```asm
MOV R0, 10
MOV R1, 3
ADD R0, R1        ; R0 = 13
SUB R0, 5           ; R0 = 8
MUL R0, 2             ; R0 = 16
DIV R0, 4               ; R0 = 4
MOD R0, 3                 ; R0 = 1
INC R0                      ; R0 = 2
DEC R0                        ; R0 = 1

CMP R0, 1                      ; sets Z (since R0 == 1) - R0 itself stays 1
JZ EQUAL_CASE
```

**Worked example: convert a 0–255 value to its decimal digits**, using
`DIV`/`MOD` to peel off one digit at a time — the same technique used
throughout the PPU/VDP manuals for pixel-address math. A quick note on
operand order first: `DIV dst, src` computes `dst / src`, so the value
whose digits you want has to be `dst`, not `src`.

```asm
MOV R0, 156          ; the value to print
MOV R1, R0             ; working copy

MOV R2, 100
MOV R3, R1
DIV R3, R2               ; R3 = R1 / 100 = first digit (1)
ADD R3, 48                 ; to ASCII character ('0' = 48)
STORE R3, TEXT_PUTCHAR

MOV R3, R1
MOD R3, R2                  ; R3 = R1 % 100 = 56 (remainder)
MOV R1, R3

MOV R2, 10
MOV R3, R1
DIV R3, R2                    ; R3 = 56 / 10 = second digit (5)
ADD R3, 48
STORE R3, TEXT_PUTCHAR

MOV R3, R1
MOD R3, 10                      ; third digit (6)
ADD R3, 48
STORE R3, TEXT_PUTCHAR
```

### 5.1 Flag behavior, confirmed exactly from the ALU implementation

**`ADD`/`SUB` (and therefore `INC`/`DEC`) genuinely extend the result to
17 bits via `C`.** Internally, both compute the operation in 32 bits
first, so bit 16 of that intermediate result — the actual carry/borrow
out of the top of a 16-bit register — lands in `C`. This is the classic
"chain two 16-bit registers into a 32-bit add" trick:

```asm
; adding two register pairs as if they were 32-bit numbers:
; (R1:R0) + (R3:R2) -> result in (R1:R0), C carrying the overflow
ADD R0, R2
JC CARRY_SET   ; if there was a carry, C = 1 - add it to R1 before "ADD R1, R3"
```

**`SUB`'s `C` uses the inverted ("ARM-style") convention**, matching
`JB` (§7): `C = 1` means *no* borrow occurred; `C = 0` means the first
operand was smaller (unsigned) and a borrow happened.

**`ROL`/`ROR` genuinely rotate *through* `C`, treating register+Carry
as one 17-bit ring** (the same technique real CPUs call `RCL`/`RCR`) —
this is the other place the "extend to 17 bits" trick shows up. See §6
for the full explanation and example.

**`MUL` does *not* extend through `C` at all — the high 16 bits of a
16×16 multiply are simply lost, with no way to recover them.** `C` is
left completely untouched (whatever a previous instruction set it to
persists). `O` tells you *whether* the true result didn't fit in 16
bits (`Result > 32767` or `< -32768`, checked against the full 32-bit
product) — but not what the missing bits were. If you need a real
16×16→32 multiply, you have to build it yourself from smaller pieces;
there's no hardware shortcut for it here.

Also worth knowing: `MUL`'s `Z` and `N` are computed from the **full
32-bit product**, before truncating to 16 bits — in the rare case where
the true product doesn't fit in 16 bits (`O` set), `N` can therefore
disagree with the sign bit of the actual 16-bit value left in `dst`.

**`DIV`/`MOD` never touch `C`.** On success, `Z`/`N` are set normally
and `O` is unconditionally cleared. **Dividing by zero is a real,
defined case, not undefined behavior:** `dst` is set to `0`, `O` is set
to `1`, and — this is the detail to watch for — **`Z`, `N`, and `C` are
left completely untouched**, still holding whatever a previous
instruction set them to. If you divide by zero, check `O` specifically
to detect it; don't trust `Z` to reliably reflect the (unset) `0`
result.

```asm
MOV R0, 10
MOV R1, 0
DIV R0, R1     ; R0 = 0, O = 1 - but Z/N/C are whatever they were BEFORE this instruction
JO DIVIDE_BY_ZERO
```

## 6. Logical / bitwise

| Instruction | Syntax | Effect |
|---|---|---|
| `AND` | `AND dst, src` | `dst` &= `src` |
| `OR` | `OR dst, src` | `dst` \|= `src` |
| `XOR` | `XOR dst, src` | `dst` ^= `src` |
| `NOT` | `NOT dst` | `dst` = bitwise complement of `dst` (single operand) |
| `SHL` | `SHL dst, amount` | `dst` <<= `amount` |
| `SHR` | `SHR dst, amount` | `dst` >>= `amount` |
| `ROL` | `ROL dst, amount` | Rotates `dst` **through `C`** left by `amount` bits — the one place besides `ADD`/`SUB` where `C` genuinely extends the register to 17 bits |
| `ROR` | `ROR dst, amount` | Same, rotating right |

**`AND`/`OR`/`XOR`/`NOT`/`SHL`/`SHR` all set `Z`/`N` from their result
and unconditionally clear `O` to `0` — but none of them touch `C` at
all.** This is worth calling out explicitly for `SHL`/`SHR` in
particular, since plenty of real CPUs *do* feed the bit shifted out
into Carry (`SHL`/`SHR` on x86, for instance) — this ISA's shifts don't;
`C` simply keeps whatever value it already had. If you need the
shifted-out bit, use `ROL`/`ROR` instead, which do route through `C`
on purpose.

### 6.1 `AND` / `OR` / `XOR` — masking and combining bits

```asm
MOV R0, 0x0F00
AND R0, 0xFF00     ; R0 = 0x0F00 (mask off the low byte) - C unaffected either way

MOV R1, CHIPTUNE_CTRL_GATE
MOV R2, CHIPTUNE_WAVEFORM_TRIANGLE
SHL R2, CHIPTUNE_CTRL_WAVEFORM_SHIFT
OR R1, R2            ; combine two bitfields into one CTRL word

MOV R3, 0xFF
XOR R3, 0xFF          ; R3 = 0 (any value XORed with itself is 0)
```

A very common real use of `AND`: checking a single bit out of a
bitmask register (see the Keyboard manual for the full pattern):

```asm
LOAD R0, KEY_STATE_0
AND R0, KEY_DOWN
JZ NOT_PRESSED
; Down está apretada
```

### 6.2 `NOT` — bitwise complement

```asm
MOV R0, 0x00FF
NOT R0                 ; R0 = 0xFF00 (every bit flipped)
```

### 6.3 `SHL` / `SHR` — shifting

`amount` can be an immediate or a register (useful for building a mask
at a bit position computed at runtime):

```asm
MOV R0, 0x0001
SHL R0, 4               ; R0 = 0x0010

MOV R1, 1
MOV R2, 5
SHL R1, R2                  ; R1 = 1 << 5 = 0x0020 - shift amount from a register

MOV R3, 0x00F0
SHR R3, 4                     ; R3 = 0x000F
```

### 6.4 `ROL` / `ROR` — rotate through Carry

Unlike `SHL`/`SHR`, these route through `C`: the bit that falls off one
end becomes the new `C`, and `C`'s *previous* value gets fed in from
the other end. A rotate `amount` of `0` is a special case — it returns
immediately without touching **any** flag, not even `Z`/`N`. The
rotate count is also masked to 0–15 (`amount & 0x0F`) before rotating,
so an `amount` of 16 behaves the same as `0`.

```asm
SEC                 ; C = 1
MOV R0, 0x0001
ROL R0, 1              ; R0 = 0x0003 (the old C=1 rotated in from the right), new C = 0 (the bit that fell off the top)

CLC                  ; C = 0
MOV R1, 0x8000
ROR R1, 1               ; R1 = 0x4000, new C = 0 (the bit that fell off the bottom)
```

## 7. Jumps and comparisons

All jump targets are addresses — almost always a label.

| Instruction | Condition | Meaning |
|---|---|---|
| `JMP` | always | Unconditional jump |
| `JZ` | `Z == 1` | Jump if equal / zero |
| `JNZ` | `Z == 0` | Jump if not equal / not zero |
| `JC` | `C == 1` | Jump if carry set |
| `JN` | `N == 1` | Jump if negative |
| `JO` | `O == 1` | Jump if overflow |
| `JG` | signed `>` | Jump if greater (signed) |
| `JGE` | signed `>=` | Jump if greater or equal (signed) |
| `JL` | signed `<` | Jump if less (signed) |
| `JLE` | signed `<=` | Jump if less or equal (signed) |
| `JB` | unsigned `<` | Jump if below (unsigned) — checks `C == 0` after a `CMP`/`SUB`, see §3 |

Conditional jumps almost always follow a `CMP` (or another
flag-setting instruction) that sets up the comparison:

```asm
MOV R0, 5
MOV R1, 10

CMP R0, R1
JL  LESS         ; R0 < R1 (signed) - taken
JGE NOT_LESS       ; not taken

LESS:
    ; ...
```

**Worked example: a loop counting down to zero**

```asm
MOV R0, 10
LOOP:
    ; ... do something ...
    DEC R0
    CMP R0, 0
    JNZ LOOP
HLT
```

**A self-referencing `JMP` (a one-instruction infinite loop) is
completely valid and correctly supported:**

```asm
SPIN:
    JMP SPIN     ; loops here forever
```

### 7.1 Jumping into a different memory bank — your responsibility, not the assembler's

If your program uses the Memory Controller's banking (see that
manual), **`JMP`/`CALL` never switch banks for you** — they just jump
to whatever raw address you give them, and that address gets
interpreted using whichever bank happens to be *currently selected* at
the moment execution gets there, regardless of which bank the target
label was actually assembled into. The assembler has no way to verify
this for you either (doing so would require analyzing your program's
entire control flow, which isn't something it attempts).

**You must select the correct bank yourself, before every jump or call
into bank-specific code:**

```asm
; WRONG: jumps to BANK1_ROUTINE without having selected bank 1 first -
; ends up executing whatever's in the CURRENTLY ACTIVE bank at that
; address, not BANK1_ROUTINE's actual code
JMP BANK1_ROUTINE

; RIGHT: select the correct bank BEFORE jumping
MOV R0, 1
STORE R0, MEMCTRL_BANK
JMP BANK1_ROUTINE
```

Getting this wrong doesn't crash or raise any error — it silently
executes the wrong bytes, which can be a confusing bug to track down.
`CALL`/`RET` (§8) are the one exception: they automatically save and
restore the bank across the call itself, but you still choose which
bank to be in before making the call in the first place — see the
Memory Controller manual for the full explanation and a complete
worked example spanning several banks.

## 8. Subroutines

| Instruction | Syntax | Effect |
|---|---|---|
| `CALL` | `CALL addr` | Pushes the return address onto the stack, jumps to `addr` |
| `RET` | `RET` | Pops the return address and jumps back to it |

If the program uses the Memory Controller's banking, `CALL`/`RET` also
automatically save/restore the current bank across the call — no extra
work needed in the common case, though *you* still choose which bank
to be in before making the call (§7.1).

```asm
JMP MAIN

MAIN:
    MOV R4, 5
    CALL SQUARE      ; R4 = 25 on return
    HLT

; Subroutine: squares R4 in place. Destroys R0.
SQUARE:
    MOV R0, R4
    MUL R4, R0
    RET
```

**Worked example: a subroutine that preserves the registers it uses**,
the standard convention for anything meant to be called from various
places without surprising the caller (see §4.4 for the general
`PUSH`/`POP` pattern this relies on):

```asm
; Prints the string pointed to by R4 (0-terminated). Preserves every
; register except the one actually receiving the return value (none,
; here) - a caller can trust R4, R0, R1 etc. are unchanged afterward.
PRINT_STRING:
    PUSH R0
    PUSH R1
    PUSH R4

    MOV R1, 0
PRINT_LOOP:
    LOADB R0, [R4+R1]
    CMP R0, 0
    JZ PRINT_DONE
    STORE R0, TEXT_PUTCHAR
    INC R1
    JMP PRINT_LOOP

PRINT_DONE:
    POP R4
    POP R1
    POP R0
    RET
```

## 9. Flag instructions

Directly set or clear an individual flag, without needing an
arithmetic operation to produce the desired state.

| Instruction | Effect |
|---|---|
| `CLC` | Clear carry (`C = 0`) |
| `SEC` | Set carry (`C = 1`) |
| `CLZ` | Clear zero (`Z = 0`) |
| `SEZ` | Set zero (`Z = 1`) |
| `CLN` | Clear negative (`N = 0`) |
| `SEN` | Set negative (`N = 1`) |

```asm
SEC              ; force C = 1
JC ALWAYS_TAKEN    ; taken, unconditionally, right after this
```

A practical use: priming `C` before a `ROL`/`ROR` chain (§6.4), since
those instructions read `C`'s *current* value as part of the rotation:

```asm
CLC                ; make sure a 0 rotates in, not a leftover 1
MOV R0, 0x0001
ROL R0, 1
```

## 10. System and interrupts

| Instruction | Syntax | Effect |
|---|---|---|
| `NOP` | `NOP` | Does nothing for one instruction slot |
| `HLT` | `HLT` | Stops execution. **Every program needs at least one** — the assembler rejects a program with no reachable `HLT` |
| `INT` | `INT` | Software-triggers the interrupt handler (same handler as a hardware IRQ) — pushes `FLAGS` + return address (+ current bank, if banking is in use), jumps to `IVEC` |
| `IRET` | `IRET` | Returns from an interrupt handler — pops everything `INT`/a hardware IRQ pushed, in reverse order |
| `WAIT` | `WAIT` | Puts the CPU to sleep until the next interrupt fires — see the Timer/RTC and Keyboard manuals for the usual `WAIT`-loop pattern |

```asm
; typical interrupt-driven main loop (see the Timer/RTC manual for the full example)
MOV R0, HANDLER
STORE R0, IVEC
MOV R0, IRQ_TIMER
STORE R0, IE

MAIN_LOOP:
    WAIT           ; sleeps until the timer IRQ wakes it up
    JMP MAIN_LOOP

HANDLER:
    ; ... handle the interrupt ...
    IRET
```

`NOP` is occasionally useful as a harmless placeholder — for example,
padding out a label so `JMP LABEL` doesn't self-reference (though §7
confirms that's actually fine on its own, `NOP` is still handy any time
you just need "a valid instruction that does nothing"):

```asm
LOOP:
    NOP
    JMP LOOP
```

## 11. Assembler directives — embedding raw data

Regular instructions always occupy 6 bytes. Directives are different:
**they occupy exactly the bytes they declare**, no padding, no fixed
size, and they aren't opcodes the CPU executes — they just tell the
*assembler* what bytes to place at the current position.

| Directive | Meaning | Size |
|---|---|---|
| `.DB v1, v2, ...` | Raw bytes | 1 byte per value (0–255) |
| `.DW v1, v2, ...` | Raw words | 2 bytes per value (0–65535), little-endian |
| `.DS n` | Reserve `n` zeroed bytes | `n` bytes |

```asm
TABLE:
    .DB 1, 2, 0xFF, 10
    .DW 0x1234, 100
BUFFER:
    .DS 32
```

`.DB` also accepts quoted strings — each character becomes one byte, in
order:

```asm
GREETING:
    .DB "Hello World", 0
```

`.DW` values can be labels or named constants (not just numbers) —
handy for jump/pointer tables:

```asm
HANDLERS:
    .DW HANDLER_A, HANDLER_B, HANDLER_C
```

`.DS`'s count must be a literal number, not a label — reserving "N
bytes" based on something resolved elsewhere doesn't make sense at
assembly time.

**A directive is always its own line** — a label and a directive
**cannot share a line**:

```asm
; WRONG - the parser won't recognize either the label or the directive
MSG: .DB "Hi", 0

; RIGHT
MSG:
    .DB "Hi", 0
```

**Data is not code — you must jump around it.** Directives embed raw
bytes exactly where they appear in the program. If execution reaches
them sequentially (falls through without a jump), the CPU will try to
decode that data as instructions — garbage results. Always place a
`JMP` before a block of data to skip over it:

```asm
JMP MAIN
DATA_BLOCK:
    .DB 1, 2, 3
MAIN:
    ; ... actual program starts here ...
```

## 12. `.BANK` — switching which memory bank code/data assembles into

Only relevant if your program is big enough to need the Memory
Controller's banking (see that manual for the full picture — this
section is just the assembler-syntax side of it).

```
.BANK n
```

Everything before the first `.BANK` directive goes into the fixed
16KB region (`0x0000`–`0x3FFF`), exactly like a program that never
uses banking at all. `.BANK n` switches to writing into bank `n`
instead — addresses reset to `0x4000` for that block:

```asm
JMP MAIN

MAIN:
    ; ... fixed-area code ...
    HLT

.BANK 1
SOME_LABEL:
    ; ... this bank's code, local addresses start at 0x4000 again ...
```

`.BANK` doesn't emit any bytes itself — it's a mode switch, not data.
Once you use it, you can't go back to writing fixed-area code — put
all fixed-area content first, then one `.BANK n` block per bank.
Reusing the same `.BANK n` a second time restarts that bank's content
from `0x4000`, overwriting what was there — don't split one bank's
code across two separate `.BANK n` blocks. Labels stay unique across
the *whole* program, not scoped per bank.

## 13. Quick reference table

| Category | Instructions |
|---|---|
| Data movement | `MOV`, `LOAD`, `STORE`, `LOADB`, `STOREB`, `PUSH`, `POP` |
| Arithmetic | `ADD`, `SUB`, `MUL`, `DIV`, `MOD`, `INC`, `DEC`, `CMP` |
| Logical | `AND`, `OR`, `XOR`, `NOT`, `SHL`, `SHR`, `ROL`, `ROR` |
| Jumps | `JMP`, `JZ`, `JNZ`, `JC`, `JN`, `JO`, `JG`, `JGE`, `JL`, `JLE`, `JB` |
| Subroutines | `CALL`, `RET` |
| Flags | `CLC`, `SEC`, `CLZ`, `SEZ`, `CLN`, `SEN` |
| System | `NOP`, `HLT`, `INT`, `IRET`, `WAIT` |
| Directives | `.DB`, `.DW`, `.DS`, `.BANK` |
