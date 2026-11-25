# Robot Arm User Manual

This document describes the Robot Arm memory-mapped device, located at
`0xC700–0xC7FF` in the system memory map: 6 rotating joints, a gripper, the
gripper's onboard sensors, and one environment sensor tied to the conveyor
belt that feeds objects to the arm.

**Camera controls in the diorama window:** right-click and hold while
moving the mouse to orbit the view around the arm, and scroll the mouse
wheel to zoom in or out.

All registers can be accessed two ways — they behave identically, use
whichever reads better in context:

```asm
LOAD R0, 0xC742      ; by raw address
LOAD R0, ARM_STATUS  ; by name (same address, resolved at assemble time)
```

Named constants are case-insensitive and resolve exactly like a label. You
cannot declare your own label with the same name as a system constant — the
assembler will reject it with a "collides with a reserved system constant
name" error.

---

## 1. Register Reference

### 1.1 Joint block (`0xC700`) — repeats 6 times, one per joint

Each joint has its own 8-byte block. Joint *N*'s block starts at
`ARM_JOINT_BASE + N * ARM_JOINT_STRIDE` (joints are numbered 0–5). There is
no separate named constant per joint — see section 3.2 for how to address a
specific one.

| Name | Offset | Access | Width | Purpose |
|---|---|---|---|---|
| `ARM_JOINT_BASE` | — | — | — | `0xC700`, the address of joint 0's block |
| `ARM_JOINT_STRIDE` | — | — | — | `8`, bytes between one joint's block and the next |
| `ARM_JOINT_TARGET_ANGLE_OFFSET` | `+0` | RW | 16-bit signed | Angle to move toward, in **decidegrees** (tenths of a degree) |
| `ARM_JOINT_CURRENT_ANGLE_OFFSET` | `+2` | RO | 16-bit signed | Current angle, same units, updated every frame |
| `ARM_JOINT_SPEED_OFFSET` | `+4` | RW | 16-bit unsigned | Speed for this move, in decidegrees/second |
| `ARM_JOINT_STATUS_OFFSET` | `+6` | RO | 16-bit | Bitfield — see 1.6 |

### 1.2 Gripper block (`0xC730`)

| Name | Address | Access | Width | Purpose |
|---|---|---|---|---|
| `ARM_GRIPPER_BASE` | `0xC730` | — | — | Base address of this block |
| `ARM_GRIPPER_TARGET` | `0xC730` | RW | 16-bit | Aperture to move toward, `0`–`255` |
| `ARM_GRIPPER_CURRENT` | `0xC732` | RO | 16-bit | Current aperture, same scale |
| `ARM_GRIPPER_STATUS` | `0xC734` | RO | 16-bit | Bitfield — see 1.6 |

`0` means fully **closed**, `255` means fully **open**. The gripper always
takes about 1 real second to travel the full range, regardless of what you
write to `ARM_JOINT_SPEED_OFFSET` for any joint — there's no separate speed
register for it.

### 1.3 Global control / status (`0xC740`)

| Name | Address | Access | Purpose |
|---|---|---|---|
| `ARM_CTRL` | `0xC740` | RW | bit0 = trigger — see section 2 |
| `ARM_STATUS` | `0xC742` | RO | bit0 = any joint or the gripper moving, bit1 = any joint blocked |

### 1.4 Gripper sensors (`0xC750`) — all read-only

These describe whatever is closest to (or held by) the gripper, whether
you've triggered a move yet or not.

| Name | Offset from `ARM_SENSOR_BASE` | Alias | Width | Purpose |
|---|---|---|---|---|
| `ARM_SENSOR_PROXIMITY_OFFSET` | `+0` | `GRIPPER_PROXIMITY` | 16-bit | Distance to the nearest object's surface, in the same scale as everything else in this scene (roughly centimeters). `ARM_SENSOR_PROXIMITY_NONE` (`0xFFFF`) if nothing is within `100` units |
| `ARM_SENSOR_CONTACT_OFFSET` | `+2` | `GRIPPER_CONTACT` | 16-bit | bit0 (`ARM_SENSOR_CONTACT_BIT`) = touching something right now |
| `ARM_SENSOR_WEIGHT_OFFSET` | `+4` | `GRIPPER_WEIGHT` | 16-bit | Weight of whatever's held, in grams (`0` if nothing) |
| `ARM_SENSOR_COLOR_OFFSET` | `+6` | `GRIPPER_COLOR` | 16-bit | Color of whatever's held — see 1.6 |

`ARM_SENSOR_BASE` is `0xC750`. The 4 aliases above are just that address
plus the matching offset, already added up for you — use them instead of
doing the math yourself.

### 1.5 Environment sensors (`0xC758`)

| Name | Address | Access | Purpose |
|---|---|---|---|
| `ENV_ARRIVAL_STATUS` | `0xC758` | RO | bit0 (`ENV_ARRIVAL_READY_BIT`) = an object is waiting within the arm's reach |
| `ENV_CONVEYOR_B_ARRIVED_COUNT` | `0xC75A` | RO | Running total of objects Conveyor B has delivered since the last Reset |

### 1.6 Bit masks and value tables

| Name | Value | Used with | Meaning |
|---|---|---|---|
| `ARM_CTRL_TRIGGER` | `0x0001` | `ARM_CTRL` | Apply every pending target at once |
| `ARM_STATUS_ANY_MOVING` | `0x0001` | `ARM_STATUS` | At least one joint or the gripper is moving |
| `ARM_STATUS_ANY_BLOCKED` | `0x0002` | `ARM_STATUS` | At least one joint is stopped by a collision |
| `ARM_JOINT_STATUS_MOVING` | `0x0001` | per-joint `STATUS` | This joint is still moving |
| `ARM_JOINT_STATUS_AT_TARGET` | `0x0002` | per-joint `STATUS` | This joint reached its target (mutually exclusive with `MOVING`) |
| `ARM_JOINT_STATUS_BLOCKED` | `0x0004` | per-joint `STATUS` | This joint wants to move but is stopped by a collision — can be set together with `MOVING` |
| `ARM_GRIPPER_HOLDING_OBJECT` | `0x0001` | `ARM_GRIPPER_STATUS` | The gripper is actually holding something (confirmed by the sensors, not just "aperture is small") |
| `ARM_SENSOR_CONTACT_BIT` | `0x0001` | `ARM_SENSOR_CONTACT_OFFSET` | Touching something |
| `ARM_SENSOR_PROXIMITY_NONE` | `0xFFFF` | `ARM_SENSOR_PROXIMITY_OFFSET` | Nothing detected in range |
| `ENV_ARRIVAL_READY_BIT` | `0x0001` | `ENV_ARRIVAL_STATUS` | Object waiting at the pickup point |

**Color codes** (`GRIPPER_COLOR`): `0` = none, `1` = red, `2` = green,
`3` = blue, `4` = yellow.

---

## 2. How movement works: stage, then trigger

Writing to `ARM_JOINT_TARGET_ANGLE_OFFSET`, `ARM_JOINT_SPEED_OFFSET`, or
`ARM_GRIPPER_TARGET` doesn't move anything by itself — those are plain RAM
that you're free to write in any order, at any pace, across several
instructions. Nothing happens until you **trigger**: write `1`
(`ARM_CTRL_TRIGGER`) to `ARM_CTRL`. At that instant, the controller takes a
single snapshot of all 6 joint targets/speeds *and* the gripper target, and
starts moving everything toward them together.

This matters because it means you can stage a complex, multi-joint pose
across many instructions without any joint sneaking off early while you're
still writing the others — the same reasoning as `DMA_SRC`/`DMA_LEN`/etc.
being read only at trigger time, if you've used that device.

The trigger bit clears itself immediately after — you don't need to (and
shouldn't try to) clear it yourself.

**Single joint, minimal example — move joint 0 to 15.0° at 20.0°/s:**

```asm
MOV R0, ARM_JOINT_BASE
MOV R1, 150                       ; 15.0° in decidegrees
STORE R1, [R0]                    ; TARGET_ANGLE for joint 0 (offset 0)

MOV R2, 4                         ; SPEED's offset - indexed addressing needs
                                   ; TWO registers, so the offset has to be
                                   ; loaded into one first, even a literal one
MOV R1, 200                       ; 20.0°/s in decidegrees/sec
STORE R1, [R0+R2]                 ; SPEED for joint 0 (offset 4)

MOV R1, ARM_CTRL_TRIGGER
STORE R1, ARM_CTRL                ; go!
HLT
```

### 2.1 Waiting for it to finish

Poll `ARM_STATUS`, or the individual joint's own `STATUS` word if you only
care about that one:

```asm
WAIT_ARM:
    LOAD R0, ARM_STATUS
    AND R0, ARM_STATUS_ANY_MOVING
    JNZ WAIT_ARM                  ; still 1 (something moving) - keep waiting
HLT
```

---

## 3. Joints: angles, speed, and limits

### 3.1 Units

`TARGET_ANGLE`, `CURRENT_ANGLE`, and `SPEED` are all in **tenths of a
degree/second** — `150` means `15.0°`, `-900` means `-90.0°`, `3600` means
`360.0°/s`. Angles follow the usual convention: `0°` straight, positive
values one way, negative the other, wrapping at `±180°` (writing `270°` is
the same physical position as `-90°` — the arm always takes the short way
around when the joint allows it, see 3.3).

`MOV` doesn't accept negative literals directly, so to get a negative value
into a register, build it with `SUB` instead — see the worked example in
section 7 (`MOV R1, 0` then `SUB R1, <register holding 900>`).

### 3.2 Addressing a specific joint

Since there's no per-joint named constant, use **indexed addressing**
(`[BaseReg + OffsetReg]`) with a literal offset — `joint_index * 8`. This is
short enough to just write out for all 6:

```asm
MOV R2, ARM_JOINT_BASE

; joint 0: offset 0        joint 1: offset 8         joint 2: offset 16
; joint 3: offset 24       joint 4: offset 32        joint 5: offset 40

MOV R3, 16                        ; joint 2
MOV R1, 900                       ; 90.0°
STORE R1, [R2+R3]                 ; TARGET_ANGLE

MOV R3, 20                        ; joint 2's SPEED is +4 from its base (16+4)
MOV R1, 450                       ; 45.0°/s
STORE R1, [R2+R3]
```

### 3.3 Physical limits per joint

Whatever you write gets **clamped** (not rejected) to the joint's real
physical range before the arm starts moving — a program asking for
something impossible just saturates at the nearest limit, the same way a
real arm would refuse to overrotate. Joints 0, 3, 4, and 5 have a full
360° range and always take the shortest path to a new target. Joints 1
and 2 have a narrower range and always move in a straight line toward the
target (never "the long way around" — with a limited range this can't
happen anyway, since the far side is outside the reachable zone).

| Joint | Min | Max | Range |
|---|---|---|---|
| 0 | `-180.0°` | `180.0°` | Full rotation |
| 1 | `-103.0°` | `113.0°` | Limited |
| 2 | `-166.0°` | `166.0°` | Limited |
| 3 | `-180.0°` | `180.0°` | Full rotation |
| 4 | `-180.0°` | `180.0°` | Full rotation |
| 5 | `-180.0°` | `180.0°` | Full rotation |

Maximum speed is `360.0°/s` on every joint — anything higher you write to
`SPEED` gets clamped down to that.

Writing `0` to a joint's `SPEED` means it simply won't move on the next
trigger — it reports itself as `AT_TARGET`, never as "stuck moving
forever," so polling `ARM_STATUS` never hangs because of this.

### 3.4 Collisions: the `BLOCKED` bit

If a joint's swing would run it into something (another part of the arm,
the floor, an obstacle in the scene), it stops there and sets its own
`ARM_JOINT_STATUS_BLOCKED` bit — and `ARM_STATUS_ANY_BLOCKED` at the global
level. Note this can happen *together with* `MOVING`: the joint still
"wants" to reach its target, it's just currently stuck. It gets a fresh
chance on every new trigger, so if the new target points somewhere clear,
it moves normally; if it's still aimed at the same obstacle, it re-blocks
immediately.

```asm
LOAD R0, ARM_STATUS
AND R0, ARM_STATUS_ANY_BLOCKED
JNZ SOMETHING_IS_STUCK
```

### 3.5 Home position

At startup, and after a system Reset, every joint snaps instantly (no
animation) to a preset home pose and the arm won't move again until your
program's first trigger — `CURRENT_ANGLE` and `STATUS` already reflect the
home pose immediately, without needing a trigger to see them.

---

## 4. The gripper

`ARM_GRIPPER_TARGET`/`ARM_GRIPPER_CURRENT` share the same `0`–`255` scale
(`0` = closed, `255` = open) and are staged/triggered exactly like a
joint — write the target, then `STORE ARM_CTRL_TRIGGER, ARM_CTRL` (the same
single trigger applies to the gripper *and* all 6 joints together).

```asm
MOV R1, 0
STORE R1, ARM_GRIPPER_TARGET      ; close it

MOV R1, ARM_CTRL_TRIGGER
STORE R1, ARM_CTRL

WAIT_GRIPPER:
    LOAD R0, ARM_STATUS
    AND R0, ARM_STATUS_ANY_MOVING
    JNZ WAIT_GRIPPER
HLT
```

**`ARM_GRIPPER_HOLDING_OBJECT` is not the same as "aperture is small."** It
only turns on once the gripper has actually closed around something real —
closing on empty air leaves it off. Always check this bit (or
`GRIPPER_CONTACT`/`GRIPPER_WEIGHT`) rather than assuming a close succeeded
just because you commanded one.

---

## 5. Gripper sensors: seeing what's nearby or held

`GRIPPER_PROXIMITY` works even with the gripper wide open — it's a
reach-out sensor, not just a "something's inside the jaws" check. Use it to
line up an approach before committing to closing:

```asm
APPROACH_LOOP:
    LOAD R0, GRIPPER_PROXIMITY
    CMP R0, ARM_SENSOR_PROXIMITY_NONE
    JZ APPROACH_LOOP               ; nothing in range yet - keep moving closer

    CMP R0, 10                     ; close enough to grab?
    JG APPROACH_LOOP               ; still farther than that - keep going

MOV R1, 0
STORE R1, ARM_GRIPPER_TARGET       ; close
MOV R1, ARM_CTRL_TRIGGER
STORE R1, ARM_CTRL
HLT
```

Once something is actually held, `GRIPPER_WEIGHT` and `GRIPPER_COLOR`
describe *that object* — read them to sort or react by type:

```asm
LOAD R0, ARM_GRIPPER_STATUS
AND R0, ARM_GRIPPER_HOLDING_OBJECT
JZ NOTHING_HELD

LOAD R1, GRIPPER_WEIGHT             ; grams
LOAD R2, GRIPPER_COLOR              ; 0=none 1=red 2=green 3=blue 4=yellow

CMP R2, 1
JZ ITS_RED
```

`GRIPPER_CONTACT` just reports "touching something right now," independent
of whether the gripper considers itself to be "holding" it — useful for
detecting an object you bumped into but haven't grabbed.

---

## 6. Environment: waiting for an object to arrive

Objects appear on a conveyor belt and stop within the arm's reach for a
limited time before moving on. `ENV_ARRIVAL_STATUS` tells you when one is
waiting — and, unlike the arm's own `CURRENT_ANGLE`/`STATUS` registers
(which stay frozen at the home pose until your first trigger), this sensor
is live from the moment the program starts, whether you've moved the arm
yet or not.

```asm
WAIT_FOR_OBJECT:
    LOAD R0, ENV_ARRIVAL_STATUS
    AND R0, ENV_ARRIVAL_READY_BIT
    JZ WAIT_FOR_OBJECT             ; nothing waiting yet

; an object is there - go grab it
HLT
```

If you don't grab it in time, it moves on by itself and a new one takes
its place later — `ENV_ARRIVAL_STATUS` clears and then sets again on its
own, no action needed from your program either way.

### 6.1 The other conveyor: a running count instead of a status bit

The second conveyor (the one carrying away whatever you drop off) never
makes anything wait — objects cross it and disappear on their own the
moment they reach the far end. There's no "waiting" moment for a status
bit to capture, so instead of one you get `ENV_CONVEYOR_B_ARRIVED_COUNT`:
a running total of how many objects it has delivered since the last
Reset. Like `ENV_ARRIVAL_STATUS`, it's live from the moment the program
starts.

Poll it and compare against a value you saved earlier to notice new
deliveries, rather than watching for a single bit to flip:

```asm
MOV R1, 0                         ; last count you've seen, starts at 0

POLL_LOOP:
    LOAD R0, ENV_CONVEYOR_B_ARRIVED_COUNT
    CMP R0, R1
    JZ POLL_LOOP                  ; nothing new since last time

; R0 is the new total - something arrived since R1
MOV R1, R0                        ; remember it for next time
JMP POLL_LOOP
```

---

## 7. Putting it together: wait, approach, grab, move, release

A full pick-and-place cycle, combining every register above: wait for an
object, close in on it using the proximity sensor, confirm the grab,
swing the arm to a drop-off pose, then release.

```asm
; --- wait for something to show up ---
WAIT_OBJECT:
    LOAD R0, ENV_ARRIVAL_STATUS
    AND R0, ENV_ARRIVAL_READY_BIT
    JZ WAIT_OBJECT

; --- open the gripper and approach (joint moves omitted here - depends on
;     your scene's layout; this focuses on the grab itself) ---
MOV R1, 255
STORE R1, ARM_GRIPPER_TARGET
MOV R1, ARM_CTRL_TRIGGER
STORE R1, ARM_CTRL

APPROACH_LOOP:
    LOAD R0, GRIPPER_PROXIMITY
    CMP R0, 10
    JGE APPROACH_LOOP               ; keep closing the distance yourself here

; --- close and confirm ---
MOV R1, 0
STORE R1, ARM_GRIPPER_TARGET
MOV R1, ARM_CTRL_TRIGGER
STORE R1, ARM_CTRL

WAIT_CLOSE:
    LOAD R0, ARM_STATUS
    AND R0, ARM_STATUS_ANY_MOVING
    JNZ WAIT_CLOSE

LOAD R0, ARM_GRIPPER_STATUS
AND R0, ARM_GRIPPER_HOLDING_OBJECT
JZ GRAB_FAILED                      ; closed on nothing - handle however you like

; --- swing joint 0 to the drop-off pose ---
MOV R2, ARM_JOINT_BASE
MOV R3, 0
MOV R4, 900                         ; MOV doesn't accept negative literals -
MOV R1, 0                           ; build -90.0° the same way: 0 - 900
SUB R1, R4                          ; R1 = -900
STORE R1, [R2+R3]
MOV R3, 4
MOV R1, 300                         ; 30.0°/s
STORE R1, [R2+R3]
MOV R1, ARM_CTRL_TRIGGER
STORE R1, ARM_CTRL

WAIT_SWING:
    LOAD R0, ARM_STATUS
    AND R0, ARM_STATUS_ANY_MOVING
    JNZ WAIT_SWING

; --- release ---
MOV R1, 255
STORE R1, ARM_GRIPPER_TARGET
MOV R1, ARM_CTRL_TRIGGER
STORE R1, ARM_CTRL
HLT

GRAB_FAILED:
HLT
```

---

## 8. Reset behavior

A system Reset snaps the whole arm — all 6 joints and the gripper — back
to its home pose **instantly** (no animation), clears `ARM_STATUS` and
every per-joint `STATUS`, and re-arms the "hasn't moved yet" state: the arm
won't move again until your program's next trigger, exactly like right
after startup. Anything the gripper happened to be holding is let go of as
part of the same reset.
