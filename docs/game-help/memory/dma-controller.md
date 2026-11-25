# DMA Controller User Manual

Copies (or fills) blocks of bytes between the CPU's RAM and the VRAM
without your program doing a `STORE`/`STOREB` per byte. See the Video
Controller manual for background on why VRAM writes are sometimes
restricted, and how that interacts with DMA below.

## 1. Registers

| Register | Address | Purpose |
|---|---|---|
| `DMA_SRC` | `0xC200` | Source address (or, in FILL modes, the byte value to repeat — low byte only) |
| `DMA_DST` | `0xC202` | Destination address |
| `DMA_LEN` | `0xC204` | Number of bytes to copy/fill |
| `DMA_CTRL` | `0xC206` | bits 0-2 = mode, bit 3 = trigger, bit 4 = busy (read-only), bit 5 = `SKIP_ZERO`, bit 6 = `2D` |
| `DMA_WIDTH` | `0xC208` | 2D only: bytes per row |
| `DMA_HEIGHT` | `0xC20A` | 2D only: number of rows |
| `DMA_SRC_STRIDE` | `0xC20C` | 2D only: bytes added to the source address between rows |
| `DMA_DST_STRIDE` | `0xC20E` | 2D only: bytes added to the destination address between rows |

`DMA_CTRL` flag constants: `DMA_CTRL_TRIGGER` (`0x0008`), `DMA_CTRL_BUSY`
(`0x0010`), `DMA_CTRL_SKIP_ZERO` (`0x0020`), `DMA_CTRL_2D` (`0x0040`).
The four 2D registers are only read when the `2D` bit is set; a plain
(1D) transfer ignores them completely, so existing programs are
unaffected.

## 2. Modes

| Name | Value | Effect |
|---|---|---|
| `DMA_MODE_RAM_TO_VRAM` | `0` | Copy CPU RAM → VRAM |
| `DMA_MODE_VRAM_TO_RAM` | `1` | Copy VRAM → CPU RAM |
| `DMA_MODE_RAM_TO_RAM` | `2` | Copy CPU RAM → CPU RAM |
| `DMA_MODE_VRAM_TO_VRAM` | `3` | Copy VRAM → VRAM |
| `DMA_MODE_FILL_VRAM` | `4` | Fill VRAM with a repeated byte (no real source) |
| `DMA_MODE_FILL_RAM` | `5` | Fill CPU RAM with a repeated byte |

For the two `FILL_*` modes, `DMA_SRC` isn't an address — only its low
byte matters, and it's the value written to every byte in the
destination range. `DMA_DST`/`DMA_LEN` mean the same as always.

## 3. Triggering a transfer

Set `DMA_SRC`/`DMA_DST`/`DMA_LEN`, then write the mode with the trigger
bit set to `DMA_CTRL`:

```asm
MOV R0, SOURCE_LABEL
STORE R0, DMA_SRC
MOV R0, VRAM_TILESET_BASE
STORE R0, DMA_DST
MOV R0, 32
STORE R0, DMA_LEN
MOV R0, DMA_MODE_RAM_TO_VRAM
OR R0, DMA_CTRL_TRIGGER
STORE R0, DMA_CTRL
```

The whole transfer happens in one shot, regardless of size (a 1D
transfer is up to 65535 bytes; any transfer, 2D included, is capped at
256 KB in total) — real DMA hardware could move large blocks within a
single vblank because it's dedicated hardware, not the CPU stepping
through instructions one at a time, and this simulator models that.

### The `BUSY` flag — and why you rarely need to poll it

If the destination is VRAM and the transfer is triggered **outside**
the vblank window, it doesn't fail — it's marked pending (`DMA_CTRL_BUSY`
set) and completes automatically the moment the next vblank opens,
without your program retrying anything:

```asm
STORE R0, DMA_CTRL
WAIT_DMA:
    LOAD R0, DMA_CTRL
    AND R0, DMA_CTRL_BUSY
    JNZ WAIT_DMA          ; only needed if you must know exactly when it finished
```

Most programs don't need this loop at all — just trigger it and move
on; the transfer will land on its own.

**Exception: in VDP mode**, VRAM-destination transfers (including
`FILL_VRAM`) are never gated by vblank — same rule as direct
`VRAM_DATA` writes, for the same reason (a raw framebuffer needs to be
redrawn every frame). `RAM_TO_RAM`/`FILL_RAM` are never gated in any
mode, since they never touch VRAM.

## 4. Example: clear the VDP framebuffer to one color

```asm
MOV R0, VDP_FRAMEBUFFER_BASE
STORE R0, DMA_DST
MOV R0, 1                      ; palette index 1 - the fill "value"
STORE R0, DMA_SRC
MOV R0, 64000
STORE R0, DMA_LEN
MOV R0, DMA_MODE_FILL_VRAM
OR R0, DMA_CTRL_TRIGGER
STORE R0, DMA_CTRL
```

## 5. `SKIP_ZERO` — colour-key transparency

Add `DMA_CTRL_SKIP_ZERO` to the control word and every **source** byte
equal to `0` is *not written*: the destination keeps whatever was
already there. Palette index `0` thus acts as the transparent colour,
which is exactly what you need to blit a sprite into the VDP
framebuffer without erasing the background around its silhouette.

- Meant for the copy modes (`RAM_TO_VRAM`, `VRAM_TO_VRAM`, `RAM_TO_RAM`,
  `VRAM_TO_RAM`). In `FILL_*` modes the source is the fill value, so
  filling with `0` and `SKIP_ZERO` together would write nothing.
- It is a per-byte test, so it works on 1D and 2D transfers alike.

```asm
MOV R0, SPRITE_DATA            ; 1D copy, zeros left untouched
STORE R0, DMA_SRC
MOV R0, VDP_FRAMEBUFFER_BASE
STORE R0, DMA_DST
MOV R0, 256
STORE R0, DMA_LEN
MOV R0, DMA_MODE_RAM_TO_VRAM
OR R0, DMA_CTRL_SKIP_ZERO
OR R0, DMA_CTRL_TRIGGER
STORE R0, DMA_CTRL
```

## 6. 2D transfers — rectangles and columns

Setting `DMA_CTRL_2D` turns the transfer into `DMA_HEIGHT` rows of
`DMA_WIDTH` bytes each. Row `R` starts at

```
source row start      = DMA_SRC + R * DMA_SRC_STRIDE
destination row start = DMA_DST + R * DMA_DST_STRIDE
```

`DMA_LEN` is ignored in 2D mode. Strides are 16-bit and the address
arithmetic wraps, so a **negative stride is written as its two's
complement** (e.g. `0xFFFF` = -1, `0xFEC0` = -320), which lets you copy
upwards or mirror vertically. In `FILL_*` modes the source is just the
value, so only `DMA_DST_STRIDE` matters. The registers are sampled at
the moment you trigger, so you can reuse and change them right after.

Everything else behaves as in 1D: the pending/vblank rule from §3, the
`BUSY` flag, `SKIP_ZERO` (§5), and the 256 KB cap
(`WIDTH * HEIGHT` bytes).

### 6.1 Example: blit a 16×16 sprite into the VDP framebuffer

The sprite is stored compactly in RAM (16 bytes per row, no gaps); the
framebuffer rows are 320 bytes apart. Colour `0` is transparent.

```asm
; destination = framebuffer + Y*320 + X  (R0 computed as in the VDP manual §3)
STORE R0, DMA_DST
MOV R0, SPRITE_DATA
STORE R0, DMA_SRC
MOV R0, 16
STORE R0, DMA_WIDTH            ; 16 bytes per row
STORE R0, DMA_HEIGHT           ; 16 rows
STORE R0, DMA_SRC_STRIDE       ; compact source: next row is 16 bytes on
MOV R0, 320
STORE R0, DMA_DST_STRIDE       ; framebuffer: next row is 320 bytes on
MOV R0, DMA_MODE_RAM_TO_VRAM
OR R0, DMA_CTRL_2D
OR R0, DMA_CTRL_SKIP_ZERO
OR R0, DMA_CTRL_TRIGGER
STORE R0, DMA_CTRL
```

One trigger replaces 256 individual `STOREB`s plus the address math.

### 6.2 Example: a vertical wall column (raycasters)

A 1-byte-wide, `H`-tall fill with a destination stride of 320 draws a
whole vertical line in a single transfer:

```asm
; R0 = framebuffer + TopY*320 + ColumnX
STORE R0, DMA_DST
MOV R0, WALL_COLOR
STORE R0, DMA_SRC              ; the fill value
MOV R0, 1
STORE R0, DMA_WIDTH
MOV R0, WALL_HEIGHT
STORE R0, DMA_HEIGHT
MOV R0, 320
STORE R0, DMA_DST_STRIDE
MOV R0, DMA_MODE_FILL_VRAM
OR R0, DMA_CTRL_2D
OR R0, DMA_CTRL_TRIGGER
STORE R0, DMA_CTRL
```

Use the same idea with `VRAM_TO_VRAM`/`RAM_TO_VRAM`, `WIDTH = 1` and a
source stride to draw textured columns.

## 7. Current limitations

- No interrupt on completion — if you need to know exactly when a
  pending transfer finished, poll `DMA_CTRL_BUSY` as shown above.
- Row addresses wrap at 16 bits (64 KB) in 2D mode — no bank awareness.
- One transfer at a time — triggering a new one while another is still
  pending is ignored (only the mode field updates; the trigger bit has
  no effect until the current transfer clears).
