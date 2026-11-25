# Voxel Sandbox User Manual

This document describes the Voxel Sandbox device, located at `0xC800–0xC8FF`
in the system memory map, along with the shared Interrupt Controller
(`0xC080`, see the Timer/RTC manual) and the Keyboard device (`0xC500`, see
the Keyboard manual) that it works alongside.

Voxel Sandbox is the most open-ended device in the whole machine. Every
other device gives you a fixed piece of hardware to talk to — a timer, a
screen, a speaker. This one gives you a **3D canvas** and a handful of
building blocks, and leaves the rest up to you. You can use it to sketch a
sculpture one byte at a time, generate a landscape with a couple of
instructions, wire up a working door that opens when a lever is pulled, or
build a small platformer with a character, hazards, and a goal — all from
the same 256 bytes of registers. Whatever you build with it is genuinely
yours; nobody else's program will look the same unless they copy yours.

Like every system register, you can access these two ways — they behave
identically, use whichever reads better in context:

```asm
LOAD R0, 0xC800        ; by raw address
LOAD R0, VOXEL_CTRL    ; by name (same address, resolved at assemble time)
```

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [How Addressing Works](#2-how-addressing-works)
3. [Register Reference](#3-register-reference)
4. [The Voxel Type Table](#4-the-voxel-type-table)
5. [Camera & Keyboard](#5-camera--keyboard)
6. [Creation Tools: FILL, LINE, SPHERE, RANDOM](#6-creation-tools-fill-line-sphere-random)
7. [Actors: Player & NPCs](#7-actors-player--npcs)
8. [Queries: PEEK and QUERY — look before you leap](#8-queries-peek-and-query--look-before-you-leap)
9. [Events: `IRQ_VOXEL`](#9-events-irq_voxel)
10. [Extended Mode & the Metadata Plane](#10-extended-mode--the-metadata-plane)
11. [Signal Circuits: WIRE, POWER_SOURCE, DOOR](#11-signal-circuits-wire-power_source-door)
12. [Light Physics: SAND and WATER](#12-light-physics-sand-and-water)
13. [Crops: Growing and Harvesting](#13-crops-growing-and-harvesting)
14. [Keeping Your Simulation Speed-Independent](#14-keeping-your-simulation-speed-independent)
15. [Performance Notes & Current Limitations](#15-performance-notes--current-limitations)
16. [Ideas & Challenges](#16-ideas--challenges)

---

## 1. Quick Start

Nothing shows up in the Voxel Sandbox window until you tell it three
things: how big your world is, which memory banks it lives in, and that
it's turned on. Here's the smallest program that puts a single glowing
block on screen:

```asm
MOV R0, 0
STORE R0, VOXEL_BANK_START      ; reserve starting at bank 0
MOV R0, 1
STORE R0, VOXEL_BANK_COUNT      ; ...just 1 bank (16KB, plenty for a start)

MOV R0, 4
STORE R0, VOXEL_WORLD_SIZE_X    ; a tiny 4x4x4 world
STORE R0, VOXEL_WORLD_SIZE_Y
STORE R0, VOXEL_WORLD_SIZE_Z

MOV R0, 0
STORE R0, MEMCTRL_BANK          ; select the bank you just reserved

MOV R0, 9                       ; voxel type 9 = TORCH (glows on its own)
STOREB R0, 0x4000               ; voxel (0,0,0) — see §2 for the address math

MOV R0, VOXEL_CTRL_ENABLE
STORE R0, VOXEL_CTRL            ; turn the device on

HLT
```

Open the **Voxel Sandbox** window from the sidebar, run this, and you
should see one warm, glowing cube. Scroll to zoom, right-click and drag to
orbit around it. Everything else in this manual builds on top of exactly
this pattern.

---

## 2. How Addressing Works

There is no `VOXEL_ADDR`/`VOXEL_DATA` port. A voxel's position is never
stored as data anywhere — it's encoded directly in *which address* you
write to, the same trick the VRAM tilemap uses. For a world of size
`(SizeX, SizeY, SizeZ)`:

```
Index  = X + Y*SizeX + Z*SizeX*SizeY
Bank   = VOXEL_BANK_START + (Index / 16384)
Offset = Index % 16384
```

`16384` is the size of one memory bank (`MEMCTRL_BANK_SIZE`). To actually
place a voxel, select the right bank in `MEMCTRL_BANK` and `STOREB` the
type byte at `0x4000 + Offset` (the bank window always starts at `0x4000`).

**Worked example** — a world `8x8x8`, placing voxel `(3, 2, 1)`:

```
Index  = 3 + 2*8 + 1*8*8 = 3 + 16 + 64 = 83
Bank   = VOXEL_BANK_START + (83 / 16384) = VOXEL_BANK_START + 0
Offset = 83 % 16384 = 83
Address = 0x4000 + 83 = 0x4053
```

```asm
MOV R0, 0
STORE R0, MEMCTRL_BANK      ; VOXEL_BANK_START was 0, so this is bank 0
MOV R0, 3                   ; some voxel type
STOREB R0, 0x4053
```

For small worlds this math is trivial (everything fits in bank
`VOXEL_BANK_START` and `Bank` never changes). It only starts to matter once
your world is bigger than 16,384 voxels and spans multiple banks — see §3.2
for the size limits.

A byte of `0` always means **AIR** — empty space. Writing `0` to a voxel
address erases whatever was there.

---

## 3. Register Reference

### 3.1 Control & Status

| Name | Address | Access | Purpose |
|---|---|---|---|
| `VOXEL_CTRL` | `0xC800` | RW | bit0 = `VOXEL_CTRL_ENABLE`, bit1 = `VOXEL_CTRL_EXTENDED_MODE` |
| `VOXEL_STATUS` | `0xC802` | RO | bit0 = `VOXEL_STATUS_CONFIG_VALID` |

While `VOXEL_CTRL_ENABLE` is `0`, the widget reads no memory and renders
nothing — it costs nothing to leave off, and it's the default after a
`Reset()`. There's no penalty for configuring everything first and turning
it on last, the way the Quick Start example does.

`VOXEL_STATUS_CONFIG_VALID` tells you whether your current world size
actually fits inside the banks you reserved (see §3.2). If your world
doesn't fit, the device stays enabled but renders nothing until you fix the
numbers — check this bit instead of guessing when something doesn't show
up.

| Name | Value | Used with |
|---|---|---|
| `VOXEL_CTRL_ENABLE` | `0x0001` | `VOXEL_CTRL` |
| `VOXEL_CTRL_EXTENDED_MODE` | `0x0002` | `VOXEL_CTRL` — see §10 |
| `VOXEL_STATUS_CONFIG_VALID` | `0x0001` | `VOXEL_STATUS` |

### 3.2 World Configuration

| Name | Address | Access | Purpose |
|---|---|---|---|
| `VOXEL_BANK_START` | `0xC804` | RW | first memory bank reserved for the sandbox (0–255) |
| `VOXEL_BANK_COUNT` | `0xC806` | RW | how many consecutive banks, 1–16 |
| `VOXEL_WORLD_SIZE_X` | `0xC808` | RW | world width, in voxels |
| `VOXEL_WORLD_SIZE_Y` | `0xC80A` | RW | world depth, in voxels |
| `VOXEL_WORLD_SIZE_Z` | `0xC80C` | RW | world height, in voxels |

**These banks are exclusively yours.** Whatever you reserve here is off
limits to your own program's code and `.BANK` data blocks — if you also use
`.BANK 0` in your assembly and set `VOXEL_BANK_START` to `0`, they'll
collide, and `Assemble & Load` will overwrite your voxel banks on the next
Reset. Pick banks your program isn't using for anything else.

**Size limits.** `SizeX * SizeY * SizeZ` must fit inside the bytes you
reserved:

| `VOXEL_BANK_COUNT` | Capacity (Simple mode) | Capacity (Extended mode, §10) |
|---|---|---|
| 1 | 16,384 voxels | **not valid — see note below** |
| 2 | 32,768 voxels | 16,384 voxels |
| 4 | 65,536 voxels | 32,768 voxels |
| 8 | 131,072 voxels | 65,536 voxels |
| 16 (max) | 262,144 voxels | 131,072 voxels |

A `256x256x4` world (262,144 voxels) uses the full ceiling in Simple mode —
the largest world the current version supports. Pick whatever shape suits
what you're building; a `64x64x16` world, for example, uses only a quarter
of that (65,536 voxels, 4 banks).

**Extended Mode needs at least 2 reserved banks.** The Metadata plane
(§10) doesn't share spare bytes inside a bank with the Type plane — it
lives in its own separate, whole bank(s), carved out of the upper half of
your reservation. With only 1 bank reserved there's no second bank left to
give it, so the device refuses to turn on (`VOXEL_STATUS_CONFIG_VALID`
stays `0`) no matter how tiny your world is. In general, Extended Mode
capacity is `floor(VOXEL_BANK_COUNT / 2) × 16,384` voxels — an odd bank
count (3, 5, 7...) rounds down and loses a bit of capacity to the split,
but only `1` rounds all the way down to zero and stops working entirely.

### 3.3 Scene / Rendering

| Name | Address | Access | Purpose |
|---|---|---|---|
| `VOXEL_BG_COLOR` | `0xC80E` | RW | sky/background color — RGB555, same format as the VRAM palette |
| `VOXEL_AMBIENT_LIGHT` | `0xC810` | RW | 0–255, overall scene brightness |

`VOXEL_AMBIENT_LIGHT` controls the whole lighting rig together — from a
fully lit scene at `255` down to genuinely pitch black at `0`. There's a
sane default (`180`, roughly 70%) after a `Reset()`, so you never *have* to
touch this register — but if you do, the change is instant and covers the
entire scene evenly, no matter how big your world is.

RGB555 packs 5 bits per channel into one word: `(R << 10) | (G << 5) | B`,
each channel 0–31. A few ready-made values:

| Color | Value |
|---|---|
| Black | `0x0000` |
| White | `0x7FFF` |
| Pure red | `0x7C00` |
| Pure green | `0x03E0` |
| Pure blue | `0x001F` |
| Soft blue-gray sky (the default) | `0x2150` |

### 3.4 Creation Tools

See §6 for full explanations and examples.

| Name | Address | Access | Purpose |
|---|---|---|---|
| `VOXEL_TOOL_X0` | `0xC812` | RW | first point / box corner |
| `VOXEL_TOOL_Y0` | `0xC814` | RW | |
| `VOXEL_TOOL_Z0` | `0xC816` | RW | |
| `VOXEL_TOOL_X1` | `0xC818` | RW | second point / opposite box corner |
| `VOXEL_TOOL_Y1` | `0xC81A` | RW | |
| `VOXEL_TOOL_Z1` | `0xC81C` | RW | |
| `VOXEL_TOOL_RADIUS` | `0xC81E` | RW | only used by `SPHERE` |
| `VOXEL_TOOL_SEED` | `0xC820` | RW | only used by `RANDOM` |
| `VOXEL_TOOL_DENSITY` | `0xC822` | RW | only used by `RANDOM`, 0–255 |
| `VOXEL_TOOL_TYPE` | `0xC824` | RW | which voxel type the operation writes |
| `VOXEL_TOOL_CTRL` | `0xC826` | RW | trigger bits + `BUSY` |

| Name | Value | Used with |
|---|---|---|
| `VOXEL_TOOL_CTRL_TRIGGER_FILL` | `0x0001` | `VOXEL_TOOL_CTRL` |
| `VOXEL_TOOL_CTRL_TRIGGER_LINE` | `0x0002` | `VOXEL_TOOL_CTRL` |
| `VOXEL_TOOL_CTRL_TRIGGER_SPHERE` | `0x0004` | `VOXEL_TOOL_CTRL` |
| `VOXEL_TOOL_CTRL_TRIGGER_RANDOM` | `0x0008` | `VOXEL_TOOL_CTRL` |
| `VOXEL_TOOL_CTRL_BUSY` | `0x0010` | `VOXEL_TOOL_CTRL` (read-only in practice) |

### 3.5 Actors (Player & NPCs)

See §7 for full explanations and examples. Up to 8 actors, each one 5
words (10 bytes) starting at `VOXEL_ACTOR_BASE`:

| Name | Value | Purpose |
|---|---|---|
| `VOXEL_ACTOR_BASE` | `0xC828` | address of actor slot 0 |
| `VOXEL_ACTOR_STRIDE` | `10` | bytes between one actor's slot and the next |
| `VOXEL_ACTOR_X_OFFSET` | `0` | add to an actor's base address |
| `VOXEL_ACTOR_Y_OFFSET` | `2` | |
| `VOXEL_ACTOR_Z_OFFSET` | `4` | |
| `VOXEL_ACTOR_COLOR_OFFSET` | `6` | RGB555, same format as `VOXEL_BG_COLOR` — tints the actor's shirt, see §7.3 |
| `VOXEL_ACTOR_FLAGS_OFFSET` | `8` | see the flag bits below |
| `VOXEL_ACTOR_FLAGS_ACTIVE` | `0x0001` | used with the FLAGS field above |
| `VOXEL_ACTOR_FLAGS_GRAVITY` | `0x0002` | opt-in per actor — see §7.5 |
| `VOXEL_ACTOR_FLAGS_BLOCKS_OTHERS` | `0x0004` | opt-in per actor — see §7.6 |

An actor's own address for field *F* is `VOXEL_ACTOR_BASE + index*VOXEL_ACTOR_STRIDE + F_OFFSET`.
There's no named constant per actor index — compute it, or just hardcode
the raw addresses for a fixed number of actors like the examples in §7 do.

**Appearance — a separate, smaller table**, one word per actor each,
addressed the same way (`BASE + index*2`) but kept apart from the table
above on purpose (see §7.3):

| Name | Value | Purpose |
|---|---|---|
| `VOXEL_ACTOR_MESH_BASE` | `0xC8B6` | which character model — see the mesh table in §7.3 |
| `VOXEL_ACTOR_FACING_BASE` | `0xC8C6` | which way it's facing — see the facing table in §7.3 |
| `VOXEL_ACTOR_MESH_FACING_STRIDE` | `2` | bytes between one actor's entry and the next, in *each* of the two tables above |

| Name | Value | | Name | Value |
|---|---|---|---|---|
| `VOXEL_ACTOR_MESH_MAN` | `0` | | `VOXEL_ACTOR_FACING_EAST` | `0` |
| `VOXEL_ACTOR_MESH_WOMAN` | `1` | | `VOXEL_ACTOR_FACING_WEST` | `1` |
| `VOXEL_ACTOR_MESH_FARMER` | `2` | | `VOXEL_ACTOR_FACING_NORTH` | `2` |
| `VOXEL_ACTOR_MESH_DOG` | `3` | | `VOXEL_ACTOR_FACING_SOUTH` | `3` |
| `VOXEL_ACTOR_MESH_CAT` | `4` | | | |

**Editing voxels around an actor** — see §7.7:

| Name | Address | Access | Purpose |
|---|---|---|---|
| `VOXEL_ACTOR_EDIT_DX` | `0xC8AC` | RW | offset from the actor, signed |
| `VOXEL_ACTOR_EDIT_DY` | `0xC8AE` | RW | |
| `VOXEL_ACTOR_EDIT_DZ` | `0xC8B0` | RW | |
| `VOXEL_ACTOR_EDIT_TYPE` | `0xC8B2` | RW | `0` = destroy, anything else = place |
| `VOXEL_ACTOR_EDIT_TRIGGER` | `0xC8B4` | WO | write anything to attempt it |

### 3.6 Queries

| Name | Address | Access | Purpose |
|---|---|---|---|
| `VOXEL_QUERY_ACTOR_INDEX` | `0xC878` | RW | which actor (0–7) the two registers below answer for |
| `VOXEL_QUERY_STANDING_ON` | `0xC87A` | RO | voxel type at `(X, Y, Z-1)` of that actor |
| `VOXEL_QUERY_AT` | `0xC87C` | RO | voxel type at `(X, Y, Z)` of that actor |
| `VOXEL_PEEK_X` | `0xC87E` | RW | any coordinate, unrelated to any actor |
| `VOXEL_PEEK_Y` | `0xC880` | RW | |
| `VOXEL_PEEK_Z` | `0xC882` | RW | |
| `VOXEL_PEEK_RESULT` | `0xC884` | RO | voxel type at `(VOXEL_PEEK_X, Y, Z)` |
| `VOXEL_PEEK_METADATA` | `0xC886` | RO | Metadata at that same coordinate (0 outside Extended Mode, §10) |
| `VOXEL_PEEK_NEIGHBOR_XP` | `0xC888` | RO | voxel type at `(X+1, Y, Z)` of `VOXEL_PEEK_X/Y/Z` |
| `VOXEL_PEEK_NEIGHBOR_XN` | `0xC88A` | RO | `(X-1, Y, Z)` |
| `VOXEL_PEEK_NEIGHBOR_YP` | `0xC88C` | RO | `(X, Y+1, Z)` |
| `VOXEL_PEEK_NEIGHBOR_YN` | `0xC88E` | RO | `(X, Y-1, Z)` |
| `VOXEL_PEEK_NEIGHBOR_ZP` | `0xC890` | RO | `(X, Y, Z+1)` |
| `VOXEL_PEEK_NEIGHBOR_ZN` | `0xC892` | RO | `(X, Y, Z-1)` |
| `VOXEL_PEEK_COLUMN_HEIGHT` | `0xC894` | RO | height of the solid stack at `(VOXEL_PEEK_X, VOXEL_PEEK_Y)` — `VOXEL_PEEK_Z` is ignored |
| `VOXEL_QUERY_ACTOR_AT_X` | `0xC8D6` | RW | any coordinate, unrelated to any actor |
| `VOXEL_QUERY_ACTOR_AT_Y` | `0xC8D8` | RW | |
| `VOXEL_QUERY_ACTOR_AT_Z` | `0xC8DA` | RW | |
| `VOXEL_QUERY_ACTOR_AT_RESULT` | `0xC8DC` | RO | which active actor (0–7) is sitting exactly there, or `0xFF` if none |
| `VOXEL_QUERY_NEAREST_ACTOR_INDEX` | `0xC8DE` | RO | closest *other* active actor to `VOXEL_QUERY_ACTOR_INDEX`, or `0xFF` if there isn't one |
| `VOXEL_QUERY_NEAREST_ACTOR_DISTANCE` | `0xC8E0` | RO | Manhattan distance (`|dx|+|dy|+|dz|`) to it |
| `VOXEL_QUERY_NEAREST_ACTOR_DX` | `0xC8E2` | RO | signed — how far and which way on X |
| `VOXEL_QUERY_NEAREST_ACTOR_DY` | `0xC8E4` | RO | signed |
| `VOXEL_QUERY_NEAREST_ACTOR_DZ` | `0xC8E6` | RO | signed |
| `VOXEL_QUERY_LOS_X0` | `0xC8E8` | RW | line-of-sight origin |
| `VOXEL_QUERY_LOS_Y0` | `0xC8EA` | RW | |
| `VOXEL_QUERY_LOS_Z0` | `0xC8EC` | RW | |
| `VOXEL_QUERY_LOS_X1` | `0xC8EE` | RW | line-of-sight target |
| `VOXEL_QUERY_LOS_Y1` | `0xC8F0` | RW | |
| `VOXEL_QUERY_LOS_Z1` | `0xC8F2` | RW | |
| `VOXEL_QUERY_LOS_RESULT` | `0xC8F4` | RO | `1` = clear line between them, `0` = something's in the way |
| `VOXEL_PEEK_WALKABLE` | `0xC8F6` | RO | could an actor be standing at `(VOXEL_PEEK_X, Y, Z)` right now? |
| `VOXEL_PEEK_IN_BOUNDS` | `0xC8F8` | RO | does that coordinate actually exist in your configured world? |
| `VOXEL_QUERY_LOS_HIT_X` | `0xC8FA` | RO | where the line above actually stopped |
| `VOXEL_QUERY_LOS_HIT_Y` | `0xC8FC` | RO | |
| `VOXEL_QUERY_LOS_HIT_Z` | `0xC8FE` | RO | |

All of these are computed live the instant you `LOAD` them — there's no
trigger bit, no delay, and no need to poll `BUSY`. See §8 for why this
matters and how to use it.

Notice `VOXEL_PEEK_WALKABLE`/`VOXEL_PEEK_IN_BOUNDS` share
`VOXEL_PEEK_X/Y/Z` with `VOXEL_PEEK_RESULT` above, and
`VOXEL_QUERY_LOS_HIT_X/Y/Z` share `VOXEL_QUERY_LOS_X0..Z1` — no new
coordinate registers were needed for either, they just add another
answer about the same spot you already asked about.

### 3.7 Events

| Name | Address | Access | Purpose |
|---|---|---|---|
| `VOXEL_EVENT_ACTOR_INDEX` | `0xC896` | RO | which actor fired the last event |
| `VOXEL_EVENT_TYPE` | `0xC898` | RO | which voxel type triggered it |
| `VOXEL_EVENT_FLAGS` | `0xC89A` | RO | bit0 = `VOXEL_EVENT_FLAGS_STANDING_ON` |

| Name | Value | Used with |
|---|---|---|
| `IRQ_VOXEL` | `0x0004` | `IE` / `IF` — see the Timer/RTC manual for the general interrupt mechanics |
| `VOXEL_EVENT_FLAGS_STANDING_ON` | `0x0001` | `VOXEL_EVENT_FLAGS` — `0` means it was `AT`, `1` means `STANDING_ON` |

See §9 for the full explanation and an example handler.

### 3.8 Crops

| Name | Address | Access | Purpose |
|---|---|---|---|
| `VOXEL_HARVEST_CROP_INDEX` | `0xC89C` | RW | which crop to ask about (0..`VOXEL_NUM_CROPS`-1) |
| `VOXEL_HARVEST_COUNT` | `0xC89E` | **RO** | how many of that crop have been harvested in total |
| `VOXEL_HARVEST_TRIGGER` | `0xC8A0` | WO | write anything to attempt a harvest — see §13.2 |
| `VOXEL_WATER_TRIGGER` | `0xC8A2` | WO | write anything to attempt watering — see §13.4 |

| Name | Value | Purpose |
|---|---|---|
| `VOXEL_NUM_CROPS` | `4` | how many crop indices are valid |

`VOXEL_HARVEST_COUNT` has no corresponding write register anywhere — it's
the device's own tally, incremented only when `VOXEL_HARVEST_TRIGGER`
successfully harvests something (§13.2), never by anything a program
writes directly. See §13 for the full growing/harvesting mechanic.

### 3.9 Camera

| Name | Address | Access | Purpose |
|---|---|---|---|
| `VOXEL_CAMERA_MODE` | `0xC8A8` | RW | `0`=Diorama, `1`=Follow Actor, `2`=Freeroam — see §5 |
| `VOXEL_CAMERA_TARGET_ACTOR` | `0xC8AA` | RW | which actor to follow in mode `1` (0..`VOXEL_MAX_ACTORS`-1) |

Your program picks the *mode*; the mouse (and, in Freeroam, the keyboard)
drives the camera in real time within whichever mode is active — none of
that goes through the CPU or costs you any instructions.

---

## 4. The Voxel Type Table

The byte you write for each voxel is its **type** — an index from `0` to
`255`. There's no named constant per type yet (unlike, say, `KEY_UP`), so
you use the plain numbers below directly in your code. A comment next to
each `MOV` goes a long way for readability.

| ID | Type | Notes |
|---|---|---|
| 0 | **AIR** | Empty. Writing `0` erases a voxel. |
| 1 | STONE | |
| 2 | SOIL | Required underneath to plant a crop — see §13.1 |
| 3 | GRASS | |
| 4 | WOOD | |
| 5 | LEAVES | |
| 6 | **SAND** | Falls with gravity — see §12 |
| 7 | ICE | |
| 8 | GLASS | Genuinely see-through |
| 9 | TORCH | Glows on its own |
| 10 | LAMP | Glows on its own |
| 11 | **WATER** | Falls and spreads — see §12 |
| 12 | LAVA | Glows; doesn't flow (yet) |
| 13 | BUTTON | Fires `IRQ_VOXEL` when stepped on (§9) — pressed for as long as someone's on it, nothing more |
| 14 | LEVER | Fires `IRQ_VOXEL` when stepped on (§9) — **stays** flipped after you leave, see §10 |
| 15 | PRESSURE_PLATE | Fires `IRQ_VOXEL` when stepped on (§9) — presses, then **releases on its own**, see §10 |
| 16–31 | PAINT_RED … PAINT_WHITE | 16 flat colors for freeform art — see the palette below |
| 32 | HAZARD | Fires `IRQ_VOXEL`; glows red — good for "you lose" tiles |
| 33 | GOAL | Fires `IRQ_VOXEL`; glows green — good for "you win" tiles |
| 34 | SPAWN | Marker tile, no special behavior yet — use it as a convention in your own level format |
| 35 | BOUNCY | Fires `IRQ_VOXEL` |
| 36 | ICE_SLIPPERY | Fires `IRQ_VOXEL` |
| 37 | CONVEYOR | Fires `IRQ_VOXEL` |
| 38 | **WIRE** | Signal circuits — see §11 |
| 39 | **POWER_SOURCE** | Signal circuits — see §11 |
| 40 | **DOOR** | Signal circuits — see §11; multi-voxel groups supported |
| 41 | SNOW | |
| 42 | CONCRETE | |
| 43 | CROP_CARROT | Grows over time, harvested by walking onto it — see §13 |
| 44 | CROP_WHEAT | Same as above |
| 45 | CROP_TOMATO | Same as above |
| 46 | CROP_POTATO | Same as above |
| 47 | **WET_SOIL** | A temporary, darker state of `SOIL` — grows crops 30% faster; see §13.4 |

**The 16-color paint palette** (types 16–31, in order): Red, Orange,
Yellow, Lime, Green, Teal, Cyan, Sky Blue, Blue, Purple, Magenta, Pink,
Brown, Black, Gray, White. These have no behavior at all — they're for
building things that just need to *look* like something (a face, a flag, a
pixel-art sprite carved out of cubes).

Types `48` and up are unused — safe to build your own conventions on top of
them for now (they'll render as a bright magenta placeholder color, easy to
spot if you use one by accident before deciding what it means).

**A note on appearance.** Most natural/solid types (`STONE`, `SOIL`,
`GRASS`, `WOOD`, `LEAVES`, `SAND`, `ICE`, `SNOW`, `CONCRETE`, `WATER`,
`LAVA`) render with a handful of natural color variations instead of one
flat tone — which exact shade a given voxel gets is decided deterministically
from its position, so the same build always looks the same, it's not
random per frame. `GLASS` is properly translucent — you can see
through it, including at stacked or neighboring `GLASS` voxels. The
`PAINT_*` colors (16–31) are the exception on purpose: they stay perfectly
flat, since they're meant for exact, predictable pixel art.

---

## 5. Camera & Keyboard

**Keyboard:** Voxel Sandbox is one of three windows that can capture
keyboard input for your program (the other two are Video Output and Robot
Arm) — click anywhere inside it to give it focus, the same way as the other
two. See the **Keyboard manual** for the full register reference
(`KEY_STATE_0`–`7`), how to build your own key masks, and the
interrupt-driven pattern for reacting to keypresses without polling.

**Camera:** three modes, selected by your program via `VOXEL_CAMERA_MODE`
(§3.9). Whichever mode is active, the mouse (and keyboard, in Freeroam)
drives it in real time directly — your program picks the mode and moves
on, it never has to compute a camera frame itself.

### 5.1 Mode 0 — Diorama (default)

Scroll to zoom, right-click and drag to orbit around the whole world, like
looking at a diorama from outside. This is the camera you've always had —
nothing changed here.

### 5.2 Mode 1 — Follow Actor

```asm
MOV R0, 1
STORE R0, VOXEL_CAMERA_MODE
MOV R0, 0
STORE R0, VOXEL_CAMERA_TARGET_ACTOR    ; follow actor 0
```

Same mouse controls as Diorama (orbit + zoom), but recentered on the
chosen actor instead of the whole world, with its own, much wider zoom
range — zoomed all the way in, it sits right above the actor for a
near-first-person feel, without being a separate mode.

A few things worth knowing:
- **The orbit point trails the actor smoothly**, not a hard snap — so
  camera motion stays fluid even while actor movement itself is coarse
  (jumping tile to tile, as in §7.2).
- **The camera won't clip through walls.** If a solid voxel sits between
  the actor and where the orbit math would otherwise place the camera, it
  gets pulled in front of that voxel instead — and eases into that
  correction over a couple of frames rather than snapping there instantly.
  "Solid" here means anything that isn't `AIR`, `WATER`, `GLASS`, a crop,
  or the walkable special tiles (§9) — ordinary blocks, basically.
- **If `VOXEL_CAMERA_TARGET_ACTOR` points at an actor that isn't active**
  (or an out-of-range index), the camera quietly falls back to orbiting
  the Diorama's center instead of following nothing.

### 5.3 Mode 2 — Freeroam

```asm
MOV R0, 2
STORE R0, VOXEL_CAMERA_MODE
```

Fly freely around the world, independent of any actor. Controls:

| Input | Effect |
|---|---|
| Right-click + drag | Look around |
| `W` / `A` / `S` / `D` | Move forward / left / back / right, relative to where you're looking |
| `E` / `Q` | Move up / down |
| `Shift` (held) | 5× fly speed |
| Mouse wheel | Adjust fly speed |

**Heads up:** Freeroam's `WASD`/`Q`/`E` are read directly from
`KEY_STATE_1`/`KEY_STATE_2` by the camera itself, completely independent
of your program. If your own program *also* reads those same keys to move
an actor, both will happen at once while you're in Freeroam — your
program has no way to know the camera mode has "taken" those keys unless
it explicitly checks `VOXEL_CAMERA_MODE` first and skips its own
movement handling while it's `2`. Simplest fix: use a different set of
keys (arrows, or `IJKL`) for actor movement if you plan on using Freeroam
in the same program.

---

## 6. Creation Tools: FILL, LINE, SPHERE, RANDOM

Writing one `STOREB` per voxel works, but it gets old fast for anything
bigger than a handful of blocks. These four tools run a whole shape in one
shot: load the parameters, set one trigger bit in `VOXEL_TOOL_CTRL`, and
the shape appears immediately — no waiting, no polling required (see the
note on `BUSY` below).

All four respect your configured world size — any coordinate that falls
outside it is simply skipped, no error, no crash.

### 6.1 FILL — a solid box

Fills every voxel in the box between `(X0,Y0,Z0)` and `(X1,Y1,Z1)`,
inclusive, with `VOXEL_TOOL_TYPE`. The corners can be given in any order —
the tool sorts out which is the minimum and which is the maximum on each
axis for you.

```asm
MOV R0, 0
STORE R0, VOXEL_TOOL_X0
STORE R0, VOXEL_TOOL_Y0
STORE R0, VOXEL_TOOL_Z0
MOV R0, 15
STORE R0, VOXEL_TOOL_X1
STORE R0, VOXEL_TOOL_Y1
MOV R0, 0
STORE R0, VOXEL_TOOL_Z1
MOV R0, 3                              ; GRASS
STORE R0, VOXEL_TOOL_TYPE
MOV R0, VOXEL_TOOL_CTRL_TRIGGER_FILL
STORE R0, VOXEL_TOOL_CTRL
```

### 6.2 LINE — a straight line

Draws a line from `(X0,Y0,Z0)` to `(X1,Y1,Z1)` with `VOXEL_TOOL_TYPE`. It's
not an exact 3D Bresenham line — it walks the longest axis and rounds the
other two — so very steep diagonals can be off by a voxel here and there.
For a sandbox tool, that's imperceptible in practice.

```asm
MOV R0, 0
STORE R0, VOXEL_TOOL_X0
STORE R0, VOXEL_TOOL_Y0
MOV R0, 15
STORE R0, VOXEL_TOOL_X1
STORE R0, VOXEL_TOOL_Y1
MOV R0, 16                             ; PAINT_RED
STORE R0, VOXEL_TOOL_TYPE
MOV R0, VOXEL_TOOL_CTRL_TRIGGER_LINE
STORE R0, VOXEL_TOOL_CTRL
```

### 6.3 SPHERE — a filled sphere

Fills a sphere centered at `(X0,Y0,Z0)` with radius `VOXEL_TOOL_RADIUS`,
using `VOXEL_TOOL_TYPE`. `X1`/`Y1`/`Z1` are ignored for this one.

```asm
MOV R0, 20
STORE R0, VOXEL_TOOL_X0
STORE R0, VOXEL_TOOL_Y0
MOV R0, 15
STORE R0, VOXEL_TOOL_Z0
MOV R0, 6
STORE R0, VOXEL_TOOL_RADIUS
MOV R0, 6                              ; SAND
STORE R0, VOXEL_TOOL_TYPE
MOV R0, VOXEL_TOOL_CTRL_TRIGGER_SPHERE
STORE R0, VOXEL_TOOL_CTRL
```

### 6.4 RANDOM — scatter, deterministically

Scatters `VOXEL_TOOL_TYPE` inside the box `(X0,Y0,Z0)`–`(X1,Y1,Z1)`, one
voxel at a time, with probability `VOXEL_TOOL_DENSITY / 255` each. Voxels
that *don't* get picked are left completely untouched — this is a
**scatter**, not a repaint, so it's safe to run on top of a floor you
already built with `FILL` without erasing it.

Crucially, this is **deterministic**: the same `VOXEL_TOOL_SEED`, box, and
density always produce the exact same pattern, no matter how many times you
run it or how fast your CPU clock is set. Change only the seed to get a
different-looking pattern from the same parameters.

```asm
MOV R0, 42
STORE R0, VOXEL_TOOL_SEED
MOV R0, 80                             ; ~31% of voxels get picked
STORE R0, VOXEL_TOOL_DENSITY
MOV R0, 1                              ; STONE
STORE R0, VOXEL_TOOL_TYPE
MOV R0, VOXEL_TOOL_CTRL_TRIGGER_RANDOM
STORE R0, VOXEL_TOOL_CTRL
```

### 6.5 A note on `BUSY`, and on DMA

Every tool trigger is handled the instant you write it — by the time your
next instruction runs, the shape is already there and the trigger bit has
already cleared itself. `VOXEL_TOOL_CTRL_BUSY` exists mostly so the
"write and poll" habit you may have picked up from the DMA manual still
works if you use it out of habit; you'll basically never see it actually
set.

If you need to stamp a shape you've already designed somewhere else in RAM
(rather than generate one from a few numbers), remember that **RAM-to-RAM
DMA** is a separate, complementary tool for exactly that — it copies bytes
that already exist, while `FILL`/`LINE`/`SPHERE`/`RANDOM` generate new
content from parameters. Use whichever fits: DMA to stamp a pre-built
shape, these tools to generate one on the fly.

---

## 7. Actors: Player & NPCs

Up to 8 "pieces" you can move around the world — a player character, a
couple of enemies, a key that needs to be carried, whatever your game
needs. Each one shows up as a character model of your choosing (§7.3),
distinct from any voxel type, so it's always easy to spot.

Moving an actor is a plain `STORE` to its X/Y/Z fields — that position is
**instant and authoritative** the moment you write it; nothing about how
it looks on screen (§7.4) changes what that position *is*, or when a
program reading it back sees the new value. Whether that move is actually
allowed is a different question — see §7.2.

### 7.1 Activating an actor

**Write Z first, then X and Y** — not the other way around. Each of the
three is collision-checked the instant you write it (§7.2), combining
the new value with whatever the *other two* currently hold. Before any
write, all three default to `0` — and `(0, 0, 0)` usually sits inside
your floor, which is solid. Writing X or Y first gets silently vetoed
against that stale `Z = 0`, discarding the very position you meant to
set. Get Z onto solid ground *first* and the later X/Y writes are
checked against a sensible height instead:

```asm
MOV R0, 1
STORE R0, 0xC82C                       ; actor 0, Z = 1 (one voxel above the floor) - FIRST
MOV R0, 0
STORE R0, 0xC828                       ; actor 0, X = 0
STORE R0, 0xC82A                       ; actor 0, Y = 0
MOV R0, 0x7FFF
STORE R0, 0xC82E                       ; actor 0's shirt: white (see §7.3)
MOV R0, VOXEL_ACTOR_FLAGS_ACTIVE
STORE R0, 0xC830                       ; actor 0: active
```

Set `VOXEL_ACTOR_FLAGS_ACTIVE` to `0` to make an actor disappear entirely —
it stops being drawn *and* stops being checked for events (§9). An actor
sitting at a position outside your configured world also just doesn't
render, without any error — handy while you're still deciding how far your
level should extend.

### 7.2 Moving an actor

Just overwrite its X/Y/Z fields:

```asm
LOAD R0, 0xC828     ; actor 0's current X
INC R0
STORE R0, 0xC828    ; one voxel to the right
```

**The device enforces basic collision for you.** If the resulting position
would land inside a solid voxel, the write is silently discarded and the
actor stays exactly where it was — same silent-reject pattern as planting
a crop without `SOIL` underneath (§13.1). "Solid" means anything that
isn't `AIR`, `WATER`, `GLASS`, `WIRE`, a crop, an *open* `DOOR`, or a
walkable special tile (`BUTTON`, `HAZARD`, `GOAL`, etc. — §9); those you
can walk through or onto freely. A **closed** `DOOR` is solid like any
ordinary block; the instant it opens (§11), it stops blocking movement
too — same Metadata bit drives both its look and whether it's walkable,
so they're always in sync. `WIRE` never blocks movement, whether it's
carrying signal or not — it renders as a thin cable (see §11), not a
full block, so it doesn't act like one.

If you want to know *whether* a move would succeed before attempting it
(say, to play a "bump" sound instead of silently failing), check
`VOXEL_PEEK_*` (§8) at the destination yourself first.

### 7.3 Appearance — mesh, shirt color, and facing

Pick a character model with `VOXEL_ACTOR_MESH_INDEX` (a separate
one-word-per-actor table, `VOXEL_ACTOR_MESH_BASE` — see §3.5 for the
address):

| ID | Model | Shirt color? |
|---|---|---|
| `0` | Man (default, also used for any invalid value) | Yes |
| `1` | Woman | Yes |
| `2` | Farmer | Yes |
| `3` | Dog | No |
| `4` | Cat | No |

```asm
MOV R0, VOXEL_ACTOR_MESH_FARMER
STORE R0, VOXEL_ACTOR_MESH_BASE        ; actor 0 becomes the Farmer
```

**`VOXEL_ACTOR_COLOR_OFFSET` (§3.5) tints the shirt**, for whichever of
the three human models is currently selected — same RGB555 format as
`VOXEL_BG_COLOR`. `Dog` and `Cat` don't have a colorable shirt, so this
field simply has no visible effect while one of those two is selected;
switching back to a human model picks the color back up from whatever
this field currently holds.

**Facing** works the same way, its own one-word-per-actor table
(`VOXEL_ACTOR_FACING_BASE`):

```asm
MOV R0, VOXEL_ACTOR_FACING_NORTH
STORE R0, VOXEL_ACTOR_FACING_BASE      ; actor 0 turns to face +Y
```

Nothing derives facing from movement automatically — if you want a
character to visibly turn toward the direction it just walked, write the
matching facing value yourself right alongside the position write (§14's
example does exactly this). An invalid value falls back to
`VOXEL_ACTOR_FACING_EAST`.

### 7.4 Movement looks animated — for free

An actor's position (§7.2) is instant the moment you write it, but what
you *see* eases toward that position instead of jumping there in one
frame — a walk, not a teleport. This needs nothing from your program: it's
always on, there's no register for it, and it can never fall behind in a
way that "breaks" — however fast or slow your program moves an actor, what
you see just keeps smoothly catching up to wherever the real position
currently is. Move once and wait, and it settles in cleanly; move every
single frame, and it reads as continuous motion instead of a strobe of
discrete steps. Facing (§7.3) turns the same way — a smooth turn instead
of a snap.

### 7.5 Falling — opt-in per actor

`VOXEL_ACTOR_FLAGS_GRAVITY` (§3.5) makes one specific actor fall on its
own, one level per frame, whenever there's nothing solid (§7.2's
definition) directly beneath it — same falling rate as `SAND`/`WATER`
(§12), but **actors never pause with the window closed**, unlike that
physics. Off by default for every actor; turn it on only for the ones
you actually want grounded. A drone, a ghost, anything meant to float
free just leaves this bit at `0`.

### 7.6 Blocking other actors — opt-in per actor

By default, two actors can freely occupy the same cell — nothing stops
you from walking one right through another. `VOXEL_ACTOR_FLAGS_BLOCKS_OTHERS`
(§3.5), turned on for one specific actor, makes *that* actor's current
cell solid to every other actor's movement (§7.2) — same silent-reject as
walking into a wall. It only protects the actor that has the bit set; an
actor without it can still walk freely into cells held by other
non-blocking actors. Off by default, so a Sokoban-style "push a crate"
mechanic (§16, idea 5) — which depends on being able to step into another
actor's cell before deciding what that contact means — keeps working
exactly as before unless you deliberately opt in.

### 7.7 Placing and destroying voxels around an actor

An actor can edit the world next to itself — plant a wall, dig a tunnel,
whatever a "build/mine" mechanic needs. Set an offset (`VOXEL_ACTOR_EDIT_DX/DY/DZ`,
§3.5 — signed, typically one of the 6 neighbors but no range limit is
enforced) and a type, then write anything to `VOXEL_ACTOR_EDIT_TRIGGER`.
Same "select the actor first" pattern as harvesting (§13.2) and watering
(§13.4) — point `VOXEL_QUERY_ACTOR_INDEX` at the actor doing the editing.

```asm
MOV R0, 0
STORE R0, VOXEL_QUERY_ACTOR_INDEX      ; which actor is digging/building
MOV R1, 1
STORE R1, VOXEL_ACTOR_EDIT_DX          ; the cell one voxel to the actor's +X
MOV R1, 0
STORE R1, VOXEL_ACTOR_EDIT_DY
STORE R1, VOXEL_ACTOR_EDIT_DZ
MOV R1, 1                              ; STONE - see the type table (§4) for others
STORE R1, VOXEL_ACTOR_EDIT_TYPE
MOV R1, 1
STORE R1, VOXEL_ACTOR_EDIT_TRIGGER     ; the value doesn't matter, only the write does
```

- **`VOXEL_ACTOR_EDIT_TYPE` of `0` destroys** — the target cell becomes
  `AIR` unconditionally, whatever was there.
- **Any other type places** — but only if the target is currently `AIR`;
  otherwise the write is silently discarded, same pattern as planting a
  crop (§13.1). Destroy first, then place, if you want to replace
  something that's already there.
- **The cell the actor is standing on (`STANDING_ON`, one below its own
  position) can never be targeted**, place or destroy — this stops an
  actor from deleting its own floor out from under itself. Any other
  offset, including the actor's own cell or straight up, is fair game.

---

## 8. Queries: PEEK and QUERY — look before you leap

Since moving an actor never checks anything on its own, these are how your
program finds out what's actually at a given spot *before* committing to a
move.

**`QUERY`** answers about a specific actor's current position:

```asm
MOV R0, 0
STORE R0, VOXEL_QUERY_ACTOR_INDEX   ; ask about actor 0
LOAD R1, VOXEL_QUERY_STANDING_ON    ; what's directly beneath it?
LOAD R2, VOXEL_QUERY_AT             ; what's it currently occupying?
```

**`PEEK`** answers about *any* coordinate, whether or not an actor is
there — useful for "is there a wall to my right before I step that way?":

```asm
LOAD R0, 0xC828      ; actor's X
INC R0                ; the spot one step to the right
STORE R0, VOXEL_PEEK_X
LOAD R0, 0xC82A
STORE R0, VOXEL_PEEK_Y
LOAD R0, 0xC82C
STORE R0, VOXEL_PEEK_Z

LOAD R1, VOXEL_PEEK_RESULT   ; voxel type over there
JZ SAFE_TO_MOVE               ; 0 = AIR, nothing in the way
; ...otherwise, something solid is blocking it
```

Both are computed **live** — there's no trigger, no delay, no polling.
Write the coordinates, read the answer back on the very next instruction.

`VOXEL_PEEK_METADATA` works the same way but returns Metadata instead of
Type at that coordinate (always `0` outside Extended Mode) — this is how
you check whether a `DOOR` is currently open, since a door's open/closed
state lives in its Metadata, not its Type (§10–11).

**All 6 neighbors in one shot.** Checking every direction around a
coordinate the way §2 and above do — rewriting `VOXEL_PEEK_X/Y/Z` and
re-reading `VOXEL_PEEK_RESULT` for each of the 6 face directions — costs
around 24 instructions per cell. `VOXEL_PEEK_NEIGHBOR_XP/XN/YP/YN/ZP/ZN`
answer all 6 at once, live, off the same `VOXEL_PEEK_X/Y/Z` you already
set:

```asm
MOV R0, 5
STORE R0, VOXEL_PEEK_X
MOV R0, 3
STORE R0, VOXEL_PEEK_Y
MOV R0, 2
STORE R0, VOXEL_PEEK_Z

LOAD R1, VOXEL_PEEK_NEIGHBOR_XP   ; type at (6,3,2)
LOAD R2, VOXEL_PEEK_NEIGHBOR_XN   ; type at (4,3,2)
LOAD R3, VOXEL_PEEK_NEIGHBOR_YP   ; type at (5,4,2)
LOAD R4, VOXEL_PEEK_NEIGHBOR_YN   ; type at (5,2,2)
LOAD R5, VOXEL_PEEK_NEIGHBOR_ZP   ; type at (5,3,3)
LOAD R6, VOXEL_PEEK_NEIGHBOR_ZN   ; type at (5,3,1)
```

This is the primitive to reach for when writing pathfinding (BFS, A*,
flood-fill) or any algorithm that needs to know what's around a cell —
without spending most of your instruction budget on the round-trip of
asking one direction at a time. A coordinate that falls outside the world
answers `0` (`AIR`), same as `VOXEL_PEEK_RESULT`.

**Column height.** `VOXEL_PEEK_COLUMN_HEIGHT` answers "how tall is the
solid stack at this `(X, Y)`?" — it scans up from `Z=0` and returns the
first height that's empty (so a column with 3 solid voxels stacked from
the floor returns `3`, which also happens to be the `Z` you'd want to drop
something new on top of it). `VOXEL_PEEK_Z` is ignored for this one, same
as `SPHERE` ignoring `X1`/`Y1`/`Z1` in §6.3:

```asm
MOV R0, 5
STORE R0, VOXEL_PEEK_X
MOV R0, 3
STORE R0, VOXEL_PEEK_Y
LOAD R1, VOXEL_PEEK_COLUMN_HEIGHT   ; how many solid voxels are stacked at (5,3)
```

Handy for a sorting-algorithm visualizer (each column is a "bar", and this
tells you its current height without looping `VOXEL_PEEK_RESULT` up the
Z-axis yourself), or for anything that drops or stacks things — "sand
piling up," a Tetris-like faller, a crate landing on whatever's already
there.

**Is anyone standing right here?** `VOXEL_QUERY_ACTOR_AT_X/Y/Z` asks about
a coordinate directly, not about a specific actor — useful for "is
someone on this particular `PRESSURE_PLATE` right now" when you don't
know or care which actor it might be:

```asm
MOV R0, 5
STORE R0, VOXEL_QUERY_ACTOR_AT_X
MOV R0, 5
STORE R0, VOXEL_QUERY_ACTOR_AT_Y
MOV R0, 1
STORE R0, VOXEL_QUERY_ACTOR_AT_Z
LOAD R1, VOXEL_QUERY_ACTOR_AT_RESULT   ; 0-7 = that actor, 0xFF = nobody there
```

**Can an actor even be there?** Working out which types are safe to move
onto yourself means hardcoding the same exceptions the hardware already
uses for movement (§7.2) — and that list silently going stale the moment
a new walkable type gets added. `VOXEL_PEEK_WALKABLE` asks the hardware
directly instead, off the same `VOXEL_PEEK_X/Y/Z` you already set:

```asm
LOAD R0, VOXEL_PEEK_WALKABLE   ; 1 = an actor could stand here, 0 = no
```

`VOXEL_PEEK_IN_BOUNDS` answers a related but different question — *does
this coordinate exist in your configured world at all?* A cell outside
your world and real `AIR` inside it both read as type `0` from
`VOXEL_PEEK_RESULT`, so without this a flood-fill or BFS has no way to
tell "empty space I can walk through" apart from "the edge of the map" —
and will happily keep exploring forever past your last configured voxel.
Check this before you trust `VOXEL_PEEK_WALKABLE` for a coordinate you're
not already sure is inside the world.

**The nearest other actor.** `VOXEL_QUERY_NEAREST_ACTOR_INDEX` (off the
same `VOXEL_QUERY_ACTOR_INDEX` selector as `QUERY_AT`/`STANDING_ON` at the
top of this section) finds whichever *other* active actor is closest, by
Manhattan distance (`|dx|+|dy|+|dz|` — the natural measure on a grid
where movement is one step at a time, no diagonals):

```asm
MOV R0, 0
STORE R0, VOXEL_QUERY_ACTOR_INDEX          ; ask on behalf of actor 0
LOAD R1, VOXEL_QUERY_NEAREST_ACTOR_INDEX   ; 0xFF if actor 0 is alone
LOAD R2, VOXEL_QUERY_NEAREST_ACTOR_DISTANCE
LOAD R3, VOXEL_QUERY_NEAREST_ACTOR_DX      ; signed - positive means it's to the East
LOAD R4, VOXEL_QUERY_NEAREST_ACTOR_DY
```

`DX`/`DY`/`DZ` don't just say *how far* — they say *which way*. A chase
routine can check the sign of `DX` alone to decide whether to increment
or decrement its own X, no distance math required. A flee routine does
the same with the sign flipped.

**Can I actually see it?** Distance alone doesn't tell you whether a wall
sits between you and something — `VOXEL_QUERY_LOS_X0/Y0/Z0` (origin) and
`X1/Y1/Z1` (target) answer that, marching a line between the two points
against the same "what counts as solid" the Follow-Actor camera already
uses for its own occlusion (§5.2) — everything except `AIR`, `WATER`,
`GLASS`, `WIRE`, and crops:

```asm
LOAD R0, 0xC828                  ; your own position...
STORE R0, VOXEL_QUERY_LOS_X0
LOAD R0, 0xC82A
STORE R0, VOXEL_QUERY_LOS_Y0
LOAD R0, 0xC82C
STORE R0, VOXEL_QUERY_LOS_Z0
; ...combine with VOXEL_QUERY_NEAREST_ACTOR_DX/DY/DZ above (added to your
; own position) to check "can I see the nearest actor?", or aim at any
; fixed point you already know instead.
LOAD R1, VOXEL_QUERY_LOS_RESULT  ; 1 = clear, 0 = blocked
```

If it comes back blocked, `VOXEL_QUERY_LOS_HIT_X/Y/Z` says exactly where
the line stopped — the first solid cell it ran into, off the same 6
registers above, no extra setup. If the line was clear, these three just
equal `X1`/`Y1`/`Z1`, the target itself — there was no real obstruction to
report.

Between this and `VOXEL_PEEK_NEIGHBOR_*` (checking what's around a cell)
and `VOXEL_PEEK_WALKABLE`/`VOXEL_PEEK_IN_BOUNDS` (checking whether a cell
is safe to step into and real in the first place), you have what a BFS or
A* needs to scan a grid — the algorithm itself is still yours to write.

---

## 9. Events: `IRQ_VOXEL`

Rather than polling `QUERY`/`PEEK` every frame to notice when an actor
walks onto something interesting, you can let the hardware interrupt you.
`IRQ_VOXEL` fires **on the edge** — the instant an actor's `AT` or
`STANDING_ON` type *changes into* one of the "special" types (`BUTTON`,
`LEVER`, `PRESSURE_PLATE`, `HAZARD`, `GOAL`, `BOUNCY`, `ICE_SLIPPERY`,
`CONVEYOR`) — not on every frame it stays there. Same idea as the Timer's
VBlank IRQ or the Keyboard's IRQ: it tells you *something* happened, and
your handler reads the registers to find out exactly what.

```asm
; --- setup ---
MOV R0, HANDLER
STORE R0, IVEC
MOV R0, IRQ_VOXEL
STORE R0, IE

MAIN_LOOP:
    WAIT
    JMP MAIN_LOOP

HANDLER:
    LOAD R0, VOXEL_EVENT_TYPE

    MOV R1, 33                 ; GOAL
    CMP R0, R1
    JZ ON_GOAL

    MOV R1, 32                 ; HAZARD
    CMP R0, R1
    JZ ON_HAZARD

    JMP HANDLER_DONE

ON_GOAL:
    ; you win!
    JMP HANDLER_DONE

ON_HAZARD:
    ; you lose!

HANDLER_DONE:
    IRET

HLT
```

`VOXEL_EVENT_ACTOR_INDEX` tells you *which* actor triggered it (useful with
more than one), and `VOXEL_EVENT_FLAGS` bit0 tells you whether it was an
`AT` event (the actor walked *into* the tile) or a `STANDING_ON` event (the
tile ended up *underneath* the actor after it landed) — see §15 for a
worked example of the difference.

### 9.1 Not missing simultaneous events — `VOXEL_EVENT_QUEUE`

`VOXEL_EVENT_ACTOR_INDEX`/`TYPE`/`FLAGS` only ever hold the **most recent**
event — if two actors trigger one in the same instant, the first is
silently overwritten by the second. If that matters for your game (several
actors, or several special tiles close together), read from the queue
instead:

| Register | Address | Access | Purpose |
|---|---|---|---|
| `VOXEL_EVENT_QUEUE` | `0xC8A4` | RO | pop the oldest pending event, or `0xFFFF` if none |
| `VOXEL_EVENT_QUEUE_COUNT` | `0xC8A6` | RO | how many events are waiting (doesn't consume one) |

Each popped value packs everything `VOXEL_EVENT_ACTOR_INDEX`/`TYPE`/`FLAGS`
would've told you into one word:

- Bits 0–7: the voxel type that triggered it (same values as
  `VOXEL_EVENT_TYPE`).
- Bits 8–10: which actor (0..`VOXEL_MAX_ACTORS`-1).
- Bit 11 (`VOXEL_EVENT_QUEUE_STANDING_ON_BIT`, `0x0800`): `1` = `STANDING_ON`, `0` = `AT`.

```asm
HANDLER:
LOOP:
    LOAD R0, VOXEL_EVENT_QUEUE
    MOV R1, 0xFFFF
    CMP R0, R1
    JZ HANDLER_DONE              ; nothing left pending

    MOV R2, R0
    AND R2, 0x00FF                ; voxel type
    MOV R3, R0
    AND R3, 0x0700
    ; R3 >> 8 would give you the actor index, if you need it

    JMP LOOP                      ; keep draining - there might be more than one
HANDLER_DONE:
    IRET
```

Up to 32 events queue up if you don't drain them fast enough; past that,
new ones are dropped rather than overwriting older ones. This is the exact
same design as the Keyboard device's `KEY_EVENT_QUEUE` — see the Keyboard
manual §8.2 if the pattern looks familiar.

---

## 10. Extended Mode & the Metadata Plane

Every voxel normally has exactly one byte: its **Type**. `VOXEL_CTRL_EXTENDED_MODE`
adds a second byte per voxel — its **Metadata** — at the cost of halving
how many voxels fit in your reserved banks (see the capacity table in
§3.2). The lower half of your reserved banks becomes the Type plane (same
as always); the upper half becomes the Metadata plane, addressed with the
exact same `Index` formula from §2.

Nothing *requires* Extended Mode unless you want to use Signal Circuits
(§11), crops or watering (§13), the persistent/self-releasing tiles
below, or want your own per-voxel state (a custom "durability" counter, a
"has been visited" flag for a maze generator, anything you invent). Most
of what's in this manual — including all the tools, actors, queries, and
plain events — works fine in Simple mode.

To turn it on:

```asm
MOV R0, VOXEL_CTRL_ENABLE
MOV R1, VOXEL_CTRL_EXTENDED_MODE
OR R0, R1
STORE R0, VOXEL_CTRL
```

There's no dedicated register to read/write Metadata by raw address the
way you write Type with `STOREB` — Metadata is only exposed through
`VOXEL_PEEK_METADATA` (read-only) for your own program's use. Several
systems manage it automatically on your behalf: Signal Circuits (§11),
crops (§13), watering (§13.4) — and two of the tiles from §9:

- **`LEVER`** flips a bit in its own Metadata every time an actor steps
  onto it, and that bit **stays** flipped after the actor leaves — a real
  toggle switch, not a momentary press. Check `VOXEL_PEEK_METADATA` at its
  coordinate (bit `0`) to read its current state without waiting for
  another `IRQ_VOXEL`.
- **`PRESSURE_PLATE`** does the opposite: stepping onto it starts a short
  countdown in its Metadata, and once that reaches `0` — regardless of
  whether the actor is still standing there — it releases on its own,
  same as a spring-loaded plate in the real world. `VOXEL_PEEK_METADATA`
  above `0` means it's currently pressed.

Neither of these needs any setup from you beyond turning on Extended
Mode — same "it just works" spirit as `WIRE` lighting up on its own once
you place it. **Both require Extended Mode to do anything at all** — in
Simple mode they still fire `IRQ_VOXEL` like `BUTTON`, but neither the
toggle nor the countdown happens, since there's no Metadata plane for
either to live in.

---

## 11. Signal Circuits: WIRE, POWER_SOURCE, DOOR

Three voxel types that interact with each other automatically, every
frame, using the Metadata plane from §10 — no registers of their own to
learn beyond `VOXEL_PEEK_METADATA`. This is your logic-and-wiring layer:
buttons that open doors, chains of switches, anything you'd want a
"circuit" for.

- **`POWER_SOURCE`** (39) is always fully powered — its signal level is
  always `255`.
- **`WIRE`** (38) picks up the highest signal among its 6 neighbors (the
  faces, not diagonals) and re-transmits it, minus a small loss per hop —
  a wire reaches roughly 15 blocks from its source before the signal fades
  to nothing. It glows brighter the more signal it's currently carrying,
  so you can *see* a circuit working just by looking at it. It also
  renders as a thin cable resting on the floor of its cell rather than a
  full block, and reshapes itself automatically to match its neighbors —
  a straight run, an L-bend at a corner, a T or a full cross at a
  junction, or a lone dot if it isn't touching another `WIRE`,
  `POWER_SOURCE`, or `DOOR` at all. Purely visual, and entirely automatic
  — there's nothing to configure.
- **`DOOR`** (40) opens (turns invisible, exactly like `AIR`) the instant
  any of its 6 neighbors carries a signal above zero, and closes again the
  instant that signal is gone. **Its Type never changes** — it's always
  genuinely `DOOR` underneath, whether it looks open or closed. That's why
  checking "is this door open" needs `VOXEL_PEEK_METADATA`, not
  `VOXEL_PEEK_RESULT` — the Type alone can't tell you.
  - **Multi-voxel doors work automatically.** Any `DOOR` voxels touching
    face-to-face (not just diagonally) are grouped into a single door every
    frame — wire just *one* voxel of a 2×2 or larger block and the whole
    group opens and closes together. There's no group ID to assign or
    register to configure; the grouping is recomputed from scratch each
    frame based on which `DOOR` voxels happen to be touching right now, so
    building, breaking, or reshaping a door group at runtime just works.

```asm
; A power source, a 3-tile wire, and a door at the end of it.
; (Extended Mode must already be on, and the bank(s) reserved as usual.)

MOV R0, 0
STORE R0, MEMCTRL_BANK

MOV R0, 39                  ; POWER_SOURCE
STOREB R0, 0x4000           ; voxel (0,0,0)

MOV R0, 38                  ; WIRE
STOREB R0, 0x4001           ; (1,0,0)
STOREB R0, 0x4002           ; (2,0,0)
STOREB R0, 0x4003           ; (3,0,0)

MOV R0, 40                  ; DOOR
STOREB R0, 0x4004           ; (4,0,0) - right at the end of the wire
```

Turn on the device and the door should already be open (the wire is
powered from the moment the source exists). Remove the `POWER_SOURCE`
voxel (write `0`) and, one frame later, the whole chain de-energizes and
the door swings shut.

---

## 12. Light Physics: SAND and WATER

Two of the existing decorative types — `SAND` (6) and `WATER` (11) —
behave like the real thing once the device is on: gravity pulls them down,
and `WATER` additionally spreads sideways when it can't fall any further.
This runs automatically, with no bit to turn it on or off — if you place a
`SAND` or `WATER` voxel with nothing underneath it, it *will* fall, always.
If you want a decorative sand dune that stays exactly where you put it,
use a different type (`PAINT_*`, or repurpose an unused ID like `41`+).

**`SAND`** falls straight down, one level per frame, until it lands on
something solid. It never spreads sideways.

**`WATER`** does the same, and if it can't fall any further (something
solid directly beneath it), it tries to spread into an empty neighboring
cell at the same height instead — this is how a block of water dropped
into a container levels out into a flat puddle across the bottom. Once a
given water voxel has been sliding sideways for a while without finding a
way to fall any further, it settles down and stops moving on its own — a
deliberate concession, since this is a lightweight simulation, not a real
fluid solver: without it, a handful of leftover water in a mostly-empty
space would drift forever with no natural way to come to rest.

Touching `WATER` also wets any `SOIL` it lands next to, turning it into
`WET_SOIL` — see §13.4 for what that's good for.

```asm
; A block of water dropped above a walled pond - it will fall in and
; level out across the floor on its own, no further instructions needed.
MOV R0, 4
STORE R0, VOXEL_TOOL_X0
STORE R0, VOXEL_TOOL_Y0
MOV R0, 10
STORE R0, VOXEL_TOOL_Z0
MOV R0, 8
STORE R0, VOXEL_TOOL_X1
STORE R0, VOXEL_TOOL_Y1
MOV R0, 12
STORE R0, VOXEL_TOOL_Z1
MOV R0, 11                             ; WATER
STORE R0, VOXEL_TOOL_TYPE
MOV R0, VOXEL_TOOL_CTRL_TRIGGER_FILL
STORE R0, VOXEL_TOOL_CTRL
```

**Important: physics only runs while the Voxel Sandbox window is open.**
Unlike actors and circuits (which keep updating as long as the device is
enabled, window or no window), gravity and flow are paused while nobody's
looking at them, purely to avoid spending time on something nobody can
see. Open the window before running a program that relies on things
falling, and don't be surprised if a sand pile looks "frozen" while the
window was closed — it'll pick up right where it left off the moment you
reopen it.

---

## 13. Crops: Growing and Harvesting

Four types — `CROP_CARROT` (43), `CROP_WHEAT` (44), `CROP_TOMATO` (45),
and `CROP_POTATO` (46) — grow on their own over real time, using the same
Metadata plane that Signal Circuits (§11) use, just for a different
purpose: instead of signal level, a crop's Metadata is its **growth
progress**, starting at `0` the instant it's planted and climbing roughly
once per real second until it hits that variety's own cap (fully grown).
**Requires Extended Mode** (§10), same as any other use of Metadata.
Growth runs whenever the device is enabled — like circuits and actors, not
like the physics in §12, it does **not** pause while the window is closed.

| Type | ID | Roughly this many seconds to mature |
|---|---|---|
| `CROP_CARROT` | 43 | ~45 |
| `CROP_WHEAT` | 44 | ~35 |
| `CROP_TOMATO` | 45 | ~60 |
| `CROP_POTATO` | 46 | ~50 |

Those numbers are an *average*, not a guarantee: each individual planting
quietly gets its own growth-speed roll (85%–100% of the usual pace) the
instant it's planted, so two carrots started side by side won't
necessarily finish at the exact same moment. This has no register or
visible effect beyond the timing itself — nothing to read, nothing to set,
it's just there so a field of the same crop doesn't all ripen in perfect
lockstep.

You'll see it grow: each crop renders as a small sprite (a "+"-shaped
cross, like classic voxel-game foliage) that visibly fills out through six
stages as its Metadata climbs toward the cap — a bare sprout at the start,
progressively fuller, with the ripe color showing on the last couple of
stages once it's actually ready to harvest.

### 13.1 Planting requires `SOIL` underneath

Writing a `CROP_*` type — by `STOREB`, or with any of the §6 tools — only
succeeds if the voxel directly beneath it (`Z-1`) is `SOIL` (2). If it
isn't, **the write is silently discarded**: the device doesn't error, it
just leaves that voxel exactly as it was before. `PEEK` the target cell
afterward if you need to confirm a plant actually took:

```asm
MOV R0, 2                              ; SOIL
STOREB R0, 0x4000                      ; ground floor, (0,0,0)

MOV R0, 43                             ; CROP_CARROT
STOREB R0, 0x4050                      ; one cell above it, e.g. (0,0,1) - succeeds, SOIL is right below

MOV R0, 43                             ; CROP_CARROT
STOREB R0, 0x4051                      ; (1,0,1) with nothing but AIR beneath - silently ignored, still AIR
```

The same silent-discard applies if there's already **any** crop (of any
variety) sitting in that cell — you can't plant over a growing plant to
reset or replace it. Clear it first (harvest it if it's ripe, per §13.2,
or overwrite it with something else entirely) before planting there again.

### 13.2 Harvesting — your program decides when

Walking onto a ripe crop does **not** harvest it automatically — your
program has to explicitly trigger it, typically bound to a key (like `E`
in the earlier examples). Point `VOXEL_QUERY_ACTOR_INDEX` (§8) at the
actor standing on the crop, then write anything to `VOXEL_HARVEST_TRIGGER`:

```asm
MOV R0, 0
STORE R0, VOXEL_QUERY_ACTOR_INDEX      ; which actor is attempting the harvest
MOV R1, 1
STORE R1, VOXEL_HARVEST_TRIGGER        ; the value itself doesn't matter, only the write does
```

If that actor is standing on a fully-grown crop, the device counts it
(§13.3) and the voxel turns to `AIR` — **not** back to `SOIL`. Whatever
soil was underneath stays exactly as it was; replanting there is a
separate act (§13.1), not automatic. It also fires `IRQ_VOXEL` (§9) with
`VOXEL_EVENT_TYPE` telling you which crop it was, so your handler can react
(sound, message, whatever) even though the counting itself already
happened, tamper-proof, before your handler even runs:

```asm
HANDLER:
    LOAD R0, VOXEL_EVENT_TYPE
    MOV R1, 43                         ; CROP_CARROT
    CMP R0, R1
    JNZ HANDLER_DONE
    ; a carrot was just harvested - play a sound, show a message, etc.
HANDLER_DONE:
    IRET
```

Triggering a harvest while standing on a crop that *isn't* ripe yet, or
not standing on a crop at all, does nothing — no error, no event, no
count. It's always safe to write `VOXEL_HARVEST_TRIGGER` speculatively and
let the device decide.

### 13.3 Counting the harvest — read-only, on purpose

`VOXEL_HARVEST_CROP_INDEX` / `VOXEL_HARVEST_COUNT` work the same
"select, then read" pattern as `VOXEL_QUERY_ACTOR_INDEX`/`VOXEL_QUERY_AT`
(§7-8), but there's a deliberate difference: **`VOXEL_HARVEST_COUNT` has
no matching write register anywhere.** The device is the only thing that
ever increments it — the instant `VOXEL_HARVEST_TRIGGER` successfully
harvests something (§13.2) — so there's no `STORE` a program could use to
inflate its own inventory. If you want a trustworthy score or currency for
a farming minigame, this is the register to build it on:

```asm
MOV R0, 0
STORE R0, VOXEL_HARVEST_CROP_INDEX     ; 0 = CROP_CARROT (see the type table order)
LOAD R1, VOXEL_HARVEST_COUNT           ; how many carrots harvested so far, total
```

`VOXEL_NUM_CROPS` (currently `4`) tells you how many valid indices there
are, if you want to loop over all of them instead of hardcoding each one.

### 13.4 Watering: `WET_SOIL` and faster growth

`SOIL` can be watered into `WET_SOIL` (47) — visibly darker, and a crop
planted there grows **30% faster** than the same crop in dry `SOIL`. Two
ways it happens:

- **Your program waters it on demand.** Point `VOXEL_QUERY_ACTOR_INDEX`
  (§8) at the actor doing the watering, then write anything to
  `VOXEL_WATER_TRIGGER` — same "select, then trigger" pattern as
  harvesting (§13.2). Unlike harvesting, this targets the tile the actor
  is **standing on** (`Z-1`), not the actor's own cell — `SOIL` is solid,
  so an actor is never actually *inside* one:

  ```asm
  MOV R0, 0
  STORE R0, VOXEL_QUERY_ACTOR_INDEX      ; which actor is doing the watering
  MOV R1, 1
  STORE R1, VOXEL_WATER_TRIGGER          ; the value itself doesn't matter, only the write does
  ```

  If that actor isn't standing on `SOIL` or `WET_SOIL`, nothing happens —
  no error, safe to write speculatively, same as `VOXEL_HARVEST_TRIGGER`.

- **It happens on its own next to `WATER`.** Any `SOIL` touching a `WATER`
  voxel in one of its 6 neighbors (§12) turns into `WET_SOIL`
  automatically, no trigger needed — and keeps refreshing for as long as
  that water stays there, so a pond keeps the ground around it
  permanently wet without your program doing anything.

Either way, `WET_SOIL` dries back into ordinary `SOIL` on its own after a
random 20–30 real seconds — watering it again (or keeping it next to
water) before then resets that countdown, it doesn't stack. A crop already
growing when its ground dries out just goes back to the normal speed; it
doesn't stop or reset.

---

## 14. Keeping Your Simulation Speed-Independent

Everything you build with the tools, actors, and circuits above happens
**instantly**, in CPU time — a `FILL` over a huge world takes the same
single instant whether your MIPS slider is low or maxed out. But anything
*you* write that moves things over time — walking a character one tile per
keypress, animating a sequence of `FILL` calls to "grow" a structure — will
run at a different visual speed depending on your MIPS setting, unless you
anchor it to something that doesn't change with CPU speed.

That something is the Timer's VBlank interrupt — a fixed 60Hz-real-time
heartbeat, completely decoupled from your instructions-per-second setting.
**See the Timer/RTC manual, section 6, for the full `WAIT` + `IRQ_TIMER`
pattern** — the short version, adapted to moving an actor:

```asm
MOV R0, HANDLER
STORE R0, IVEC
MOV R0, TIMER_CTRL_VBLANK_IRQ_ENABLE
STORE R0, TIMER_CTRL
MOV R0, IRQ_TIMER
STORE R0, IE

MAIN_LOOP:
    WAIT
    JMP MAIN_LOOP

; runs exactly once per real 1/60s, no matter the MIPS setting
HANDLER:
    LOAD R0, KEY_STATE_0
    AND R0, KEY_RIGHT
    JZ HANDLER_DONE
    LOAD R1, 0xC828
    INC R1
    STORE R1, 0xC828
    MOV R1, VOXEL_ACTOR_FACING_EAST        ; turn to face the way it just moved (§7.3) - the engine eases the turn on its own (§7.4), this is just the target
    STORE R1, VOXEL_ACTOR_FACING_BASE
HANDLER_DONE:
    IRET

HLT
```

Raising the MIPS slider with this pattern gives your interrupt handler
*more instruction budget* per 1/60s window (finer collision checks, more
actors to update, more of the world to scan) — it never makes anything
move faster on screen. That's the same trade the Timer manual describes for
game logic in general, and it applies just as well here.

---

## 15. Performance Notes & Current Limitations

A few honest notes on where this device's edges are today, so you don't
spend time chasing something that's a known limit rather than a bug in
your own program:

- **World size ceiling:** 262,144 voxels (16 full banks) in Simple mode,
  131,072 in Extended mode. A world that doesn't fit simply won't turn on —
  check `VOXEL_STATUS_CONFIG_VALID`.
- **8 actors maximum.** `VOXEL_EVENT_ACTOR_INDEX`/`TYPE`/`FLAGS` still only
  hold the single most recent event — use `VOXEL_EVENT_QUEUE` (§9.1) if you
  need to catch every one without racing to read it first.
- **Physics (§12) pauses while the window is closed.** Circuits (§11) and
  actors (§7) do not — they keep running as long as the device itself is
  enabled.

None of these are permanent — they're simply where the device stands
today. If one of them is actually holding back something you want to
build, that's exactly the kind of thing worth bringing up for a future
pass.

---

## 16. Ideas & Challenges

You've got a canvas, a set of tools, a real player character, wiring, and
even gravity. Here's a ramp from "just getting started" to "genuinely
impressive," roughly in order of difficulty:

1. **Sign your name.** Use the `PAINT_*` palette (§4) and individual
   `STOREB` calls to spell out a few letters, one voxel at a time. It's
   tedious on purpose — you'll appreciate the tools in §6 immediately
   afterward.
2. **Generate a landscape.** A `FILL` for the ground, a `SPHERE` or two for
   hills, a `RANDOM` scatter for scrub and rocks on top. Try the exact
   same `VOXEL_TOOL_SEED` twice and confirm you get an identical result —
   then change the seed and watch it change completely.
3. **Build something interactive.** A `BUTTON` wired to a `DOOR` (§11).
   Then a second button that opens a *different* door, and figure out how
   to tell which one fired from inside a single shared handler.
4. **A tiny platformer.** An actor moved with the VBlank pattern from
   §14, a floor dotted with `HAZARD` tiles and one `GOAL`, `IRQ_VOXEL`
   (§9) deciding win or lose. Walking into walls is already handled for
   you (§7.2) — the real challenge here is the win/lose logic and timing,
   not collision.
5. **A Sokoban-style puzzle.** A second actor as a pushable "crate" —
   moving the player checks `PEEK` at the destination, and if it finds the
   crate there, it also has to move the crate one further, checking *that*
   destination too before committing to anything.
6. **A sand-fall generative art piece.** Drop `SAND` (§12) from many
   points onto a floor with a few solid obstacles and watch the piles form
   on their own — no two runs need to look the same if you vary where and
   when you drop it.
7. **A real logic circuit.** Chain `WIRE` and multiple `LEVER`s so a `DOOR`
   only opens when *two* separate switches are on at once — you'll need to
   get creative, since there's no `AND` gate voxel type yet; that's a
   satisfying constraint to design around, not a wall.
8. **Something nobody asked for.** A sculpture. A tiny diorama that tells
   a story with nothing but color and light. A generative piece that looks
   different every time you run it. This device doesn't have a "correct"
   use — the interesting stuff tends to come from whatever you try that
   isn't in this list.
9. **A working irrigation system.** `WET_SOIL` (§13.4) spreads on its own
   from any `WATER` it touches — dig a channel of `WATER` through a field
   of `CROP_*` and watch which plants mature 30% faster without the
   player ever watering by hand. A good companion to idea 2's landscape tools.
10. **A miner/builder.** Use `VOXEL_ACTOR_EDIT_*` (§7.7) bound to two
    keys — one digs whatever is directly ahead, the other places
    whatever your last-dug block was. Turn on `VOXEL_ACTOR_FLAGS_GRAVITY`
    (§7.5) for the actor and a hole dug straight down turns into an
    actual fall, not just an empty cell it happens to be floating over.
   isn't in this list.
