# Spec ISA — Bitdesk Native (bước 0.2)

Nguồn: `docs/game-help/instruction-set.md` (**D**) — ưu tiên. Mã opcode / byte: `assembler.js` (**B**, chỉ grep).
Ký hiệu: ✍️ = **[Bạn viết]** (đọc manual rồi điền). 🤖 = Claude đã điền từ JS, bạn chỉ cần đọc hiểu.

---

## 1. Kiến trúc tóm tắt ✍️ (đọc §1)

- Số thanh ghi đa dụng: 16
- Thanh ghi đặc biệt: PC (program counter), SP (Stack Pointer) và FLAGS
- Độ rộng 1 thanh ghi: TODO bit → giá trị không dấu từ TODO đến TODO
- Kích thước mỗi lệnh: 6 byte; directive thì: giống với số byte mà nó định nghĩa, không phải 6
- Không gian địa chỉ: 0x0000 → 0xFFFF; MMIO bắt đầu từ: TODO
- SP ban đầu (xem trong game / README): 0

## 2. Chế độ địa chỉ ✍️ (đọc §2)

| Dạng | Ý nghĩa (tự diễn đạt bằng tiếng Việt) | Ví dụ |
|---|---|---|
| `Rn` | TODO | |
| Immediate | TODO | |
| Direct address | TODO | |
| `[Rn]` | TODO | |
| `[Rb+Ri]` | TODO | |

Quy tắc "toán hạng đầu tiên": TODO (viết 1 câu + 1 ví dụ bị từ chối)

## 3. Cờ ✍️ (đọc §3, §5.1, và phần cờ ở §6, §7, §9)

Ký hiệu trong bảng: `*` = đặt theo kết quả, `0`/`1` = luôn xóa/đặt, `-` = không đụng tới.

| Lệnh | Z | C | N | O | Ghi chú (khác thường ở đâu?) |
|---|---|---|---|---|---|
| MOV LOAD STORE LOADB STOREB PUSH POP | | | | | |
| ADD | | | | | C = bit 16 của kết quả 32-bit |
| SUB | | | | | C kiểu ARM: C=1 nghĩa là … |
| INC / DEC | | | | | |
| CMP | | | | | |
| MUL | | | | | Z/N tính trên … |
| DIV / MOD (chia được) | | | | | |
| DIV / MOD (chia 0) | | | | | dst = … |
| AND OR XOR NOT | | | | | |
| SHL SHR | | | | | |
| ROL ROR | | | | | vòng 17 bit qua C |
| CLC SEC CLZ SEZ CLN SEN | | | | | |

Điều kiện nhảy (đọc §7) — viết công thức theo cờ:

| Lệnh | Nhảy khi | Có dấu / không dấu? |
|---|---|---|
| JZ / JNZ | | |
| JC / JN / JO | | |
| JG / JGE / JL / JLE | | |
| JB | | |

## 4. Bảng opcode 🤖 (từ `assembler.js`, mảng `names` → chỉ số = mã opcode)

Chữ ký: `r` = thanh ghi, `v` = giá trị (thanh ghi hoặc immediate), `a` = địa chỉ (`[Rn]`, `[Rb+Ri]`, số/nhãn), `t` = đích nhảy.

| Mã | Lệnh | Ký | | Mã | Lệnh | Ký | | Mã | Lệnh | Ký |
|---|---|---|---|---|---|---|---|---|---|---|
| 0x00 | MOV | rv | | 0x10 | OR | rv | | 0x20 | JB | t |
| 0x01 | LOAD | ra | | 0x11 | XOR | rv | | 0x21 | CALL | t |
| 0x02 | STORE | ra | | 0x12 | NOT | r | | 0x22 | RET | — |
| 0x03 | LOADB | ra | | 0x13 | SHL | rv | | 0x23 | CLC | — |
| 0x04 | STOREB | ra | | 0x14 | SHR | rv | | 0x24 | SEC | — |
| 0x05 | PUSH | v | | 0x15 | ROL | rv | | 0x25 | CLZ | — |
| 0x06 | POP | r | | 0x16 | ROR | rv | | 0x26 | SEZ | — |
| 0x07 | ADD | rv | | 0x17 | JMP | t | | 0x27 | CLN | — |
| 0x08 | SUB | rv | | 0x18 | JZ | t | | 0x28 | SEN | — |
| 0x09 | MUL | rv | | 0x19 | JNZ | t | | 0x29 | NOP | — |
| 0x0A | DIV | rv | | 0x1A | JC | t | | 0x2A | HLT | — |
| 0x0B | INC | r | | 0x1B | JN | t | | 0x2B | INT | — |
| 0x0C | DEC | r | | 0x1C | JO | t | | 0x2C | IRET | — |
| 0x0D | MOD | rv | | 0x1D | JG | t | | 0x2D | WAIT | — |
| 0x0E | CMP | rv | | 0x1E | JGE | t | | | | |
| 0x0F | AND | rv | | 0x1F | JL | t | | | | |

Tổng 46 tên (README ghi "47 lệnh" — ✍️ kiểm lại: đếm bảng §13 của manual, sửa README nếu cần).
⚠️ `INT`, `RET`, `IRET` có chữ ký rỗng trong JS — `INT` thật sự có toán hạng không? ✍️ xem §10.

## 5. Mã hóa 6 byte 🤖

```
byte 0   opcode
byte 1   mode   = (op1 là thanh ghi ? 2 : 0) | (op2 là thanh ghi ? 1 : 0)
byte 2-3 a      (toán hạng 1, little-endian: byte thấp trước)
byte 4-5 b      (toán hạng 2, little-endian)
```

- `[Rn]` được mã hóa **giống** `Rn` (bit0 = 1); lệnh loại `a` tự hiểu đó là con trỏ.
- Immediate cho phép −32768…65535, lưu `& 0xFFFF` (số âm thành bù 2).
- Lệnh không toán hạng: mode phải = 0, a = b = 0.

✍️ **Tự mã hóa bằng tay** (bài tập RE quan trọng nhất của bước này — ghi 6 byte hex):

| Lệnh | 6 byte |
|---|---|
| `MOV R0, 4` | TODO |
| `ADD R0, R1` | TODO |
| `DEC R1` | TODO |
| `JNZ 0x000C` | TODO |
| `MOV R2, -1` | TODO |
| `HLT` | TODO |

Và ngược lại — giải mã: `0E 02 01 00 00 00` = TODO

## 6. Tệp PBIN 🤖 (từ hàm đọc PBIN trong `assembler.js`; số nguyên little-endian)

```
"PBIN"            4 byte chữ ký
u16  version      phải = 1
u16  verLen       + verLen byte chuỗi phiên bản (bỏ qua)
u32  segments     số vùng (≤ 65536)
lặp segments lần: u16 at, u32 length, length byte dữ liệu  (at+length ≤ 65536)
u16  = 0          phần mở rộng bank (JS chỉ chấp nhận 0) và phải hết tệp
```
Tối thiểu 14 byte. Thực thi bắt đầu ở địa chỉ 0.

## 7. Khác biệt manual ↔ JS 🤖 (đã ghi vào `docs/parity.md`)

1. JS có thêm `LDR`, `STR`, `OUT` (bản web) — manual **không** có → bản Java **bỏ**.
2. Indexed `[Rb+Ri]`: JS dùng mode tạm `0x82`, b = `Rb<<8 | Ri`, ghi rõ "chưa xác nhận với bản native" và không nhận từ PBIN. → giữ cách này, đánh dấu chưa xác minh.
3. Toán hạng loại `a` viết `R2` (không ngoặc) vẫn được JS chấp nhận như `[R2]`. ✍️ Manual có cho phép không? Quyết định: TODO
