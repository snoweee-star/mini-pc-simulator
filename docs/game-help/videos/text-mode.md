# Text Mode User Manual

`VIDEO_MODE = 0` (`VIDEO_MODE_TEXT`) — the **default** mode after
Reset, matching how real PC BIOSes always boot straight into text mode.
A 40×25 character grid with per-character foreground/background color,
plus a managed cursor that handles line wrapping and scrolling for you.

Text mode reuses the exact same VRAM regions as PPU mode (tileset for
glyphs, tilemap for content) — see the PPU manual §6 for the built-in
font, and the Video Controller manual for how VRAM access works at all.

## 1. The cursor / teletype port

| Register | Address | Purpose |
|---|---|---|
| `TEXT_CURSOR_X` | `0xC10E` | Current column (0–39) |
| `TEXT_CURSOR_Y` | `0xC110` | Current row (0–24) |
| `TEXT_ATTR` | `0xC112` | Color used by `TEXT_PUTCHAR` — low byte only |
| `TEXT_PUTCHAR` | `0xC114` | Port: write an ASCII byte here to print it |

Writing to `TEXT_PUTCHAR` draws the character at the current cursor
position with the current `TEXT_ATTR`, then advances the cursor:
wraps to the next line at column 40, and **scrolls the whole screen up
one row** (clearing the new bottom row) once row 25 would be exceeded —
none of this needs to be handled by your program.

```asm
MOV R1, 'H'          ; (write the literal ASCII value, not this syntax)
STORE R1, TEXT_PUTCHAR
```

Two ASCII codes are handled specially, not printed as glyphs:

| Code | Meaning |
|---|---|
| `13` (CR) | New line — cursor moves to column 0, row + 1 |
| `8` (Backspace) | Cursor moves back one column (or up a row, at column 0) and the cell is cleared to a space |

**`TEXT_PUTCHAR` has no idea what your program "should" be allowed to
erase** — it will happily keep backspacing past wherever your own input
started, into text your program printed earlier (a prompt, for
example). If you're reading user input, track how many characters
you've actually accepted yourself, and ignore Backspace once that count
reaches zero — see the worked example in §4.

A blinking cursor (a small bar at the current `TEXT_CURSOR_X/Y`) is
drawn automatically whenever `VIDEO_MODE` is `TEXT` — nothing to set up.

## 2. Printing a whole string in one instruction — `TEXT_PRINT_STRING`

A "BIOS-style" print service, equivalent to DOS's `INT 21h, AH=09h`.
Instead of looping through a string one `TEXT_PUTCHAR` at a time, write
the string's **address** to `TEXT_PRINT_STRING` (`0xC128`) and the
engine walks it and prints the whole thing in one shot:

```asm
MSG:
    .DB "Hello!", 0

MOV R4, MSG
STORE R4, TEXT_PRINT_STRING   ; imprime el string entero, listo
```

Internally this is nothing new — it just calls `TEXT_PUTCHAR`'s exact
same logic (cursor, line wrap, scroll) once per character, in a C++
loop, instead of the program doing it in assembly. Both mechanisms
share the same cursor, so mixing them works exactly as expected —
printing a fixed label with `TEXT_PRINT_STRING`, then a computed digit
with `TEXT_PUTCHAR`, land right next to each other with no gap:

```asm
LABEL_MSG:
    .DB "Score: ", 0

MOV R4, LABEL_MSG
STORE R4, TEXT_PRINT_STRING   ; imprime "Score: "

MOV R1, R6                     ; R6 = digito 0-9
ADD R1, 48                       ; a caracter ASCII ('0' = 48)
STORE R1, TEXT_PUTCHAR             ; sigue justo donde el string anterior dejo el cursor
```

**No automatic trailing newline.** It prints exactly what's in memory,
not a byte more — same convention as `.DB`/`.DW` elsewhere. If you want
a line break at the end, put `13` in the string yourself:

```asm
MSG:
    .DB "Hello!", 13, 0    ; ahora sí termina con salto de línea
```

**A hard safety limit: 1024 characters.** If a string is missing its
`0` terminator (a bug, or a stray pointer), the engine doesn't walk
memory forever looking for one — it stops after `TEXT_PRINT_STRING_MAX_LEN`
(1024) characters regardless. Without this, a malformed string could
hang the engine itself, not just your program.

This works from any bank — the address is read through the same
low-level path that already respects the Memory Controller's banking
(see that manual), so no special handling is needed either way.

## 3. Color

`TEXT_ATTR`'s low byte packs two 4-bit color indices (0–15, into the
first 16 entries of the palette — see the PPU manual §4 for the RGB555
format, same palette region):

```
bits 0-3: foreground color
bits 4-7: background color
```

```asm
MOV R1, 0xF500       ; background=white(15)<<4|foreground=magenta(5), in the HIGH byte
STORE R1, TEXT_ATTR
```

Note the value goes in the register's **high** byte because `TEXT_ATTR`
is a full word register but only its low byte is actually used —
writing `0x0F00` (not `0x000F`) is what puts `0x0F` in the low byte.

A default palette of 16 classic CGA/EGA-style colors is preloaded every
Reset (`0`=black, `1`=blue, ... `15`=white) — the default `TEXT_ATTR`
after Reset is `0x0F` (white on black).

## 4. Reading typed input — `KEY_GETCHAR`

See the Keyboard manual for the raw `KEY_STATE_0-7` bitmap. For typing
text, `KEY_GETCHAR` (`0xC510`, read-only) is much more convenient: it
already translates key-presses into ASCII (respecting Shift for
uppercase/symbols), with edge detection (holding a key doesn't repeat
it every frame), queued so you don't lose keystrokes. Each `LOAD`
consumes one pending character; if none is waiting, it returns `0`.
Enter arrives as `13`, Backspace as `8` — matching what `TEXT_PUTCHAR`
expects.

```asm
LOOP:
    LOAD R2, KEY_GETCHAR
    CMP R2, 0
    JZ LOOP              ; nothing typed yet
    ; ... R2 now holds the next character ...
```

Only printable keys, Space, Enter, Tab, and Backspace produce a
character — arrows, Escape, F-keys, and modifiers don't (they have no
ASCII representation and are silently skipped).

### Worked example: read a line, respecting Backspace properly

```asm
    MOV R5, BUFFER
    MOV R3, 0              ; how many real characters typed so far
READ_LOOP:
    LOAD R2, KEY_GETCHAR
    CMP R2, 0
    JZ READ_LOOP

    CMP R2, 13
    JZ DONE

    CMP R2, 8
    JZ HANDLE_BACKSPACE

    STOREB R2, [R5]
    INC R5
    INC R3
    STORE R2, TEXT_PUTCHAR
    JMP READ_LOOP

HANDLE_BACKSPACE:
    CMP R3, 0
    JZ READ_LOOP           ; nothing to erase - ignore, protects earlier text
    DEC R5
    DEC R3
    STORE R2, TEXT_PUTCHAR  ; R2 is still 8 here - TEXT_PUTCHAR erases visually
    JMP READ_LOOP

DONE:
    MOV R0, 0
    STOREB R0, [R5]          ; terminate the string
```

## 5. Current limitations

- No scrolling of the *view* (unlike PPU's `SCROLL_X/Y`) — text mode
  always shows a fixed 40×25 window; the automatic line-scroll (§1) is
  the only "scrolling" that happens.
- No per-character sprite/graphics overlay — if you need that, use PPU
  mode and render the same font tiles yourself (see the PPU manual §6).
