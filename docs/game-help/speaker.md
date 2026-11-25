# PC Speaker User Manual

This document describes the PC Speaker device, located at `0xC400–0xC43F`
in the system memory map: a simple square-wave tone generator, like the
internal speaker of a classic PC.

```asm
LOAD R0, 0xC400        ; by raw address
LOAD R0, SPEAKER_FREQ  ; by name (same address)
```

## 1. Register reference

| Name | Address | Access | Purpose |
|---|---|---|---|
| `SPEAKER_FREQ` | `0xC400` | RW | Tone frequency, in Hz. `0` = no tone |
| `SPEAKER_CTRL` | `0xC402` | RW | bit0 = enable the speaker |

## 2. Named constants

| Name | Value | Purpose |
|---|---|---|
| `SPEAKER_CTRL_ENABLE` | `0x0001` | `SPEAKER_CTRL` — turns the tone on |

## 3. Basic usage

```asm
MOV R0, 440                    ; A4, concert pitch
STORE R0, SPEAKER_FREQ
MOV R0, SPEAKER_CTRL_ENABLE
STORE R0, SPEAKER_CTRL         ; tone starts playing immediately

; ... do something ...

MOV R0, 0
STORE R0, SPEAKER_CTRL         ; tone stops
```

You can change `SPEAKER_FREQ` while the tone is already playing — it
updates live, with no click or restart, so sweeps and simple melodies work
by just writing new values while `SPEAKER_CTRL_ENABLE` stays set.

## 4. A hard physical limit: frequencies above ~22 kHz go silent

Digital audio can only reproduce frequencies up to **half the sample
rate** (44.1 kHz here, so the ceiling is **22050 Hz** — the Nyquist
limit). This isn't a simulator bug; it's the same wall every digital audio
system runs into.

**Below the ceiling, everything behaves exactly as you'd expect.** Above
it, rather than let the speaker produce a confusing "alias" tone at some
*other*, unrelated (and misleadingly *lower*) frequency than what you
asked for, `SPEAKER_FREQ` values of `22050` or higher are simply
silenced. Practically speaking, this ceiling is already well above what
most people can hear (human hearing tops out around 20 kHz for young
ears, less for everyone else), so nothing useful is lost.

## 5. Timed beep — using the GPT to control duration

Combine with the General Purpose Timer (see the Timer/RTC manual) to play
a tone for a precise duration without busy-waiting on your own counter:

```asm
MOV R0, 440
STORE R0, SPEAKER_FREQ
MOV R0, SPEAKER_CTRL_ENABLE
STORE R0, SPEAKER_CTRL

MOV R0, 500                    ; 500ms
STORE R0, GPT_RELOAD
STORE R0, GPT_COUNTER
MOV R0, GPT_CTRL_ENABLE
STORE R0, GPT_CTRL

WAIT_BEEP:
    LOAD R0, GPT_CTRL
    AND R0, GPT_CTRL_ENABLE
    JNZ WAIT_BEEP           ; still counting down

MOV R0, 0
STORE R0, SPEAKER_CTRL         ; stop the tone
HLT
```

## 6. A simple siren — sweeping the frequency

Since `SPEAKER_FREQ` can be updated continuously while the tone plays,
you can sweep it every frame (tied to `FRAME_COUNT`, so the sweep speed
is independent of your CPU's MIPS setting — see the Timer/RTC manual):

```asm
MOV R0, SPEAKER_CTRL_ENABLE
STORE R0, SPEAKER_CTRL

MOV R2, 400                    ; base frequency
MOV R3, 0                      ; previous frame counter

LOOP:
    LOAD R0, FRAME_COUNT_LO
    CMP R0, R3
    JZ LOOP                     ; frame hasn't changed yet, keep waiting

    MOV R3, R0                  ; store the new frame

    INC R2                      ; increase 1Hz per frame -> a slow ramp
    STORE R2, SPEAKER_FREQ

    JMP LOOP
HLT
```

## 7. Behavior while paused

`SPEAKER_FREQ`/`SPEAKER_CTRL` are "game clock" registers — they pause
with the CPU. Any tone playing gets **cut immediately** (not left
looping in the background) whenever execution stops: manual Pause, a
breakpoint, `HLT`, or `Reset`.

## 8. Current limitations

- One channel only: a single square wave. No mixing, no chords, no
  duty-cycle control (always a 50% square wave), no volume register (the
  output level is fixed).
- No envelope/fade — the tone is either fully on or fully off; any
  fade-in/fade-out has to be done in software by ramping frequency, or
  isn't directly possible with this device (a true volume ramp would
  need a volume register, which doesn't exist yet).
