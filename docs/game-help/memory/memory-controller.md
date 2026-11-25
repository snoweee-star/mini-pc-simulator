# Memory Controller (Banking) User Manual

Lets programs be bigger than the 32KB program area normally allows, by
splitting it into a **fixed** 16KB region (always present) and a
**switchable** 16KB window that can show any one of 256 banks (4MB
total) — the same model NES and Game Boy cartridges used.

## 1. The model

|Range|Role|
|-|-|
|`0x0000`–`0x3FFF` (16KB)|**Fixed bank** — always the same content, regardless of which bank is selected. Put startup code, interrupt handlers, and anything called from multiple banks here.|
|`0x4000`–`0x7FFF` (16KB)|**Switchable window** — shows whichever bank `MEMCTRL_BANK` currently selects.|

```asm
MOV R0, 3
STORE R0, MEMCTRL_BANK   ; the 0x4000-0x7FFF window now shows bank 3
```

`MEMCTRL_BANK` (`0xC000`) accepts `0`–`255`. Defaults to `0` after
Reset — a program that never touches banking always sees bank `0` in
the window, indistinguishable from plain flat memory.

## 2. Writing banked code — the `.BANK N` directive

Everything before the first `.BANK` directive goes into the fixed
region, exactly like today. `.BANK N` switches where subsequent
code/data gets assembled — addresses reset to `0x4000` for that block:

```asm
JMP MAIN

MAIN:
    ; ... fixed-area code ...
    HLT

.BANK 1
SOME_LABEL:
    ; ... this bank's code, local addresses 0x4000+ ...
```

* `.BANK` **doesn't emit any bytes itself** — it's a mode switch, not data.
* Once you use `.BANK`, you can't go back to writing fixed-area code —
organize your file with all fixed-area content first, then one
`.BANK N` block per bank, in any order.
* Reusing the same `.BANK N` a second time **restarts that bank's
content from `0x4000`**, overwriting what was there — don't split one
bank's code across two separate `.BANK N` blocks.
* Labels are unique across the **whole program**, not per bank — you
can't reuse a label name in two different banks even though their
raw addresses might otherwise coincide.

## 3. `CALL`/`RET` and `INT`/`IRET` carry the bank automatically

A `CALL` into another bank pushes the current bank onto the stack right
alongside the return address; `RET` restores it automatically. Same for
hardware/software interrupts (`INT`/`IRET`) — an interrupt can fire at
any moment, even mid-bank, and its handler is free to switch banks
internally without corrupting the code it interrupted.

**What this protects:** nested crossings — a routine in bank 5 that
itself calls into bank 7 and returns, called from bank 3, all unwinds
correctly without anyone having to remember anything.

**What this does *not* do:** it doesn't pick the right bank for you.
`MEMCTRL_BANK` only matters while the CPU is executing code from the
switchable window — while running fixed-area code, its value is
irrelevant. **Before every `CALL`/`JMP` into a specific bank, you must
select that bank yourself** — the assembler has no way to know which
bank a jump target "belongs to" and switch for you automatically (that
would require analyzing the whole program's control flow, out of
scope). Forgetting this executes whatever happens to be in the
*currently selected* bank at that address instead — not a crash, just
silently wrong code.

```asm
MOV R0, 2
STORE R0, MEMCTRL_BANK   ; select the bank BEFORE jumping/calling into it
CALL BANK2_ROUTINE
```

## 4. A useful pattern: shared routines in the fixed bank

Since the fixed bank is always present no matter what's selected in the
window, routines that need to be callable from *any* bank (string
printing, math helpers, etc.) belong there — any banked routine can
`CALL` them without touching `MEMCTRL_BANK` first, and they return
correctly regardless of which bank called them (`RET`'s automatic
bank-restore handles it).

## 5. Inspecting banks — Memory View

The **Bank** region (`0x4000`–`0x7FFF`) in Memory View shows a
`<| N |>` selector right next to the region badge — arrows and a number
box let you browse any bank's contents. **This is purely a viewing
control** — it's completely independent from `MEMCTRL_BANK` (the
register the running program uses). Looking at bank 5 while the
program is executing bank 2 doesn't affect the program at all, and the
program switching banks doesn't move what you're looking at either.

Read/write/fetch flashes correctly distinguish banks — an access to
bank 5 only flashes while you're viewing bank 5; switching the viewer
to a different bank stops showing flashes for accesses elsewhere.

## 6. Backward compatibility

A program that never uses `.BANK` behaves exactly as before — anything
assembled naturally past `0x3FFF` without an explicit `.BANK` directive
lands in the switchable window at whatever bank happens to be selected
(bank `0` by default), indistinguishable from plain flat 64KB memory
for a program that never touches `MEMCTRL_BANK`.

## 7. Worked example: calling routines in two different banks

```asm
JMP MAIN

MSG_MAIN:
    .DB "Fixed bank: hello from the fixed area", 0
MSG_BACK1:
    .DB "Back from bank 1", 0
MSG_BACK2:
    .DB "Back from bank 2", 0

MAIN:
    MOV R0, VIDEO_MODE_TEXT
    STORE R0, VIDEO_MODE

    MOV R4, MSG_MAIN
    CALL PRINT_STRING

    ; --- bank 1 ---
    MOV R0, 1
    STORE R0, MEMCTRL_BANK
    CALL BANK1_ROUTINE       ; CALL pushes the return PC + current bank (1)

    MOV R4, MSG_BACK1
    CALL PRINT_STRING

    ; --- bank 2 ---
    MOV R0, 2
    STORE R0, MEMCTRL_BANK
    CALL BANK2_ROUTINE

    MOV R4, MSG_BACK2
    CALL PRINT_STRING

    HLT

; Lives in the fixed area - callable from any bank without touching MEMCTRL_BANK.
PRINT_STRING:
    MOV R6, 0
PRINT_STRING_LOOP:
    LOADB R2, [R4+R6]
    CMP R2, 0
    JZ PRINT_STRING_DONE
    STORE R2, TEXT_PUTCHAR
    INC R6
    JMP PRINT_STRING_LOOP
PRINT_STRING_DONE:
    MOV R1, 13
    STORE R1, TEXT_PUTCHAR   ; automatic line break after each message
    RET

.BANK 1
BANK1_ROUTINE:
    MOV R4, MSG_BANK1
    CALL PRINT_STRING         ; PRINT_STRING lives in the fixed area - always reachable
    RET
MSG_BANK1:
    .DB "Hello from bank 1!", 0

.BANK 2
BANK2_ROUTINE:
    MOV R4, MSG_BANK2
    CALL PRINT_STRING
    RET
MSG_BANK2:
    .DB "Hello from bank 2!", 0
```

Expected output, in order: *"Fixed bank: hello from the fixed area"* →
*"Hello from bank 1!"* → *"Back from bank 1"* → *"Hello from bank 2!"*
→ *"Back from bank 2"*.

## 8. Current limitations

* Labels must be unique across the whole program, not scoped per bank.
