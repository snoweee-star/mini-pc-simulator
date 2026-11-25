window.AsmLessons = {
  examples: [
    {
      id: "sum",
      title: "Vòng lặp tính tổng",
      file: "sum.asm",
      source: `; Cộng các số từ 4 về 1
MOV R0, 0
MOV R1, 4

LOOP:
    ADD R0, R1
    DEC R1
    CMP R1, 0
    JNZ LOOP

HLT`,
      hint: "Theo dõi R0 sau mỗi lệnh ADD. Tổng lần lượt bằng 4, 7, 9 và 10."
    },
    {
      id: "bits",
      title: "Từ bit đến bộ nhớ",
      file: "bits.asm",
      source: `; Ghép 0010 0000 với 0000 1010
MOV R0, 0b00100000
OR R0, 0x000A

; Lưu rồi đọc lại cùng một ô nhớ
STORE R0, 0x0200
LOAD R1, 0x0200
HLT`,
      hint: "Sau OR, hãy đọc R0 ở cả ba hệ. LOAD đọc lại số 42 (0x002A) từ địa chỉ 0x0200 vào R1."
    },
    {
      id: "terminal",
      title: "In chữ ra màn hình",
      file: "hello.asm",
      source: `; Gửi từng mã ASCII đến màn hình
MOV R0, 72    ; H
STORE R0, TEXT_PUTCHAR
MOV R0, 69    ; E
STORE R0, TEXT_PUTCHAR
MOV R0, 76    ; L
STORE R0, TEXT_PUTCHAR
STORE R0, TEXT_PUTCHAR
MOV R0, 79    ; O
STORE R0, TEXT_PUTCHAR
MOV R0, 13    ; Xuống dòng
STORE R0, TEXT_PUTCHAR
HLT`,
      hint: "Quan sát màn hình sau mỗi lệnh STORE. Đổi 72 thành 74 để chữ đầu tiên đổi từ H sang J."
    },
    {
      id: "stack",
      title: "Gọi hàm và dùng ngăn xếp",
      file: "stack.asm",
      source: `; Lưu 7 trước khi gọi hàm
MOV R0, 7
PUSH R0
CALL double_value
POP R1
HLT

double_value:
    ADD R0, R0
    RET`,
      hint: "PUSH rồi CALL làm SP tăng từ 0x8000 lên 0x8004. Sau RET và POP, SP trở về 0x8000, R0 bằng 14 và R1 bằng 7."
    },
    {
      id: "triangle",
      title: "Vẽ tam giác ký tự",
      file: "triangle.asm",
      source: `; Mỗi hàng dài hơn hàng trước một dấu *
MOV R0, 1
MOV R2, 42    ; Dấu *
MOV R3, 13    ; Xuống dòng

row:
    MOV R1, R0
star:
    STORE R2, TEXT_PUTCHAR
    DEC R1
    CMP R1, 0
    JNZ star
    STORE R3, TEXT_PUTCHAR
    INC R0
    CMP R0, 5
    JNZ row
HLT`,
      hint: "Màn hình hiện bốn hàng có 1, 2, 3 và 4 dấu sao. Đổi số 5 trong CMP thành 7 để vẽ sáu hàng."
    }
  ],
  reference: [
    { name: "MOV", syntax: "MOV R0, 0x2A", description: "Chép giá trị bên phải vào thanh ghi bên trái." },
    { name: "ADD", syntax: "ADD R0, R1", description: "Cộng R1 vào R0 và ghi tổng vào R0." },
    { name: "SUB", syntax: "SUB R0, 1", description: "Trừ 1 khỏi R0 và ghi hiệu vào R0." },
    { name: "INC", syntax: "INC R0", description: "Tăng R0 thêm 1." },
    { name: "DEC", syntax: "DEC R1", description: "Giảm R1 đi 1." },
    { name: "CMP", syntax: "CMP R1, 0", description: "So sánh qua phép trừ và cập nhật các cờ. Hai toán hạng giữ nguyên giá trị." },
    { name: "JMP", syntax: "JMP loop", description: "Nhảy đến lệnh tại nhãn loop." },
    { name: "JZ", syntax: "JZ done", description: "Nhảy khi cờ Z bằng 1. Sau CMP, điều này nghĩa là hai giá trị bằng nhau." },
    { name: "JNZ", syntax: "JNZ loop", description: "Nhảy khi cờ Z bằng 0. Sau CMP, điều này nghĩa là hai giá trị khác nhau." },
    { name: "JC", syntax: "JC carried", description: "Nhảy khi cờ nhớ C bằng 1. Sau CMP, C bằng 1 nếu toán hạng trái lớn hơn hoặc bằng toán hạng phải theo số không dấu." },
    { name: "JN", syntax: "JN negative", description: "Nhảy khi cờ âm N bằng 1." },
    { name: "JO", syntax: "JO overflow", description: "Nhảy khi cờ tràn số có dấu O bằng 1." },
    { name: "JG", syntax: "JG greater", description: "Nhảy nếu toán hạng trái lớn hơn toán hạng phải trong phép so sánh có dấu." },
    { name: "JGE", syntax: "JGE at_least", description: "Nhảy nếu toán hạng trái lớn hơn hoặc bằng toán hạng phải trong phép so sánh có dấu." },
    { name: "JL", syntax: "JL less", description: "Nhảy nếu toán hạng trái nhỏ hơn toán hạng phải trong phép so sánh có dấu." },
    { name: "JLE", syntax: "JLE at_most", description: "Nhảy nếu toán hạng trái nhỏ hơn hoặc bằng toán hạng phải trong phép so sánh có dấu." },
    { name: "JB", syntax: "JB below", description: "Nhảy khi C bằng 0. Sau CMP, điều này nghĩa là toán hạng trái nhỏ hơn toán hạng phải theo số không dấu." },
    { name: "AND", syntax: "AND R0, 0xF", description: "Giữ lại các bit cùng bằng 1 ở cả hai toán hạng." },
    { name: "OR", syntax: "OR R0, 0xA", description: "Bật các bit bằng 1 ở ít nhất một trong hai toán hạng." },
    { name: "XOR", syntax: "XOR R0, R1", description: "Đặt bit kết quả bằng 1 ở những vị trí mà hai toán hạng khác nhau." },
    { name: "NOT", syntax: "NOT R0", description: "Đảo cả 16 bit của R0." },
    { name: "SHL", syntax: "SHL R0, 1", description: "Dịch các bit sang trái và điền 0 từ bên phải." },
    { name: "SHR", syntax: "SHR R0, 1", description: "Dịch các bit sang phải và điền 0 từ bên trái." },
    { name: "LOAD", syntax: "LOAD R1, 0x0200", description: "Đọc 16 bit từ hai byte bắt đầu ở địa chỉ 0x0200 vào R1. Byte thấp nằm ở địa chỉ nhỏ hơn." },
    { name: "STORE", syntax: "STORE R0, 0x0200", description: "Ghi 16 bit của R0 vào hai byte bắt đầu ở địa chỉ 0x0200. Dùng địa chỉ TEXT_PUTCHAR (0xC114) để gửi ký tự đến màn hình." },
    { name: "LOADB", syntax: "LOADB R1, 0x0200", description: "Đọc một byte từ địa chỉ 0x0200 vào R1." },
    { name: "STOREB", syntax: "STOREB R0, 0x0200", description: "Ghi 8 bit thấp của R0 vào byte tại địa chỉ 0x0200." },
    { name: "PUSH", syntax: "PUSH R0", description: "Đặt 16 bit của R0 lên ngăn xếp và tăng SP thêm 2 byte." },
    { name: "POP", syntax: "POP R1", description: "Lấy giá trị ở đỉnh ngăn xếp vào R1 và giảm SP đi 2 byte." },
    { name: "CALL", syntax: "CALL double_value", description: "Lưu địa chỉ lệnh kế tiếp vào ngăn xếp rồi nhảy đến hàm." },
    { name: "RET", syntax: "RET", description: "Lấy địa chỉ trở về từ ngăn xếp rồi tiếp tục tại địa chỉ đó." },
    { name: "HLT", syntax: "HLT", description: "Dừng CPU." },
    { name: "NOP", syntax: "NOP", description: "Chuyển sang lệnh tiếp theo." }
  ]
};
