(() => {
  "use strict";
  const WORD = 0xffff;
  const SIGN = 0x8000;
  const WIDTH = 6;
  const TEXT_PUTCHAR = 0xc114;
  const constants = new Map([["TEXT_PUTCHAR", TEXT_PUTCHAR]]);
  const signatures = {
    MOV: "rv", ADD: "rv", SUB: "rv", CMP: "rv", INC: "r", DEC: "r",
    AND: "rv", OR: "rv", XOR: "rv", NOT: "r", SHL: "rv", SHR: "rv",
    JMP: "t", JZ: "t", JNZ: "t", JC: "t", JN: "t", JO: "t",
    JG: "t", JGE: "t", JL: "t", JLE: "t", JB: "t",
    LOAD: "ra", STORE: "ra", LOADB: "ra", STOREB: "ra",
    LDR: "ra", STR: "av", PUSH: "v", POP: "r", CALL: "t", RET: "",
    OUT: "v", HLT: "", NOP: ""
  };
  const hex = (number, digits = 4) =>
    "0x" + (number & WORD).toString(16).toUpperCase().padStart(digits, "0");

  function problem(line, detail) {
    const error = new Error("Dòng " + line + " · " + detail);
    error.line = line;
    return error;
  }

  // Comments and operand separators inside an ASCII literal are data.
  const sourceTokens = /'(?:\\.|[^'\\])*'|;.*$|[^';]+|'/g;
  function operands(text, line) {
    if (!text) return [];
    const parts = [""];
    for (const token of text.match(/'(?:\\.|[^'\\])*'|,|[^',]+|'/g) || []) {
      if (token === ",") parts.push("");
      else if (token === "'") throw problem(line, "Thiếu dấu nháy đóng ký tự.");
      else parts[parts.length - 1] += token;
    }
    return parts.map(part => part.trim());
  }

  function register(text, line) {
    const name = /^R(1[0-5]|[0-9])$/i.exec(text);
    if (!name) throw problem(line, "Cần thanh ghi R0 đến R15, nhận được “" + text + "”.");
    return { kind: "register", value: Number(name[1]) };
  }

  function value(text, labels, line) {
    if (/^R\d+$/i.test(text)) return register(text, line);
    const name = text.toUpperCase();
    let number;
    if (constants.has(name)) number = constants.get(name);
    else if (labels.has(name)) number = labels.get(name) * WIDTH;
    else if (/^(?:0x[\da-f]+|0b[01]+|-?\d+)$/i.test(text)) number = Number(text);
    else {
      const char = /^'(\\[nrt0'\\]|[^'\\])'$/.exec(text);
      if (!char) throw problem(line, "Không nhận ra toán hạng “" + text + "”.");
      const escaped = { n: 10, r: 13, t: 9, "0": 0, "'": 39, "\\": 92 };
      number = char[1][0] === "\\" ? escaped[char[1][1]] : char[1].charCodeAt(0);
      if (number > 127) throw problem(line, "Hãy dùng một ký tự ASCII.");
    }
    if (!Number.isInteger(number) || number < -32768 || number > WORD)
      throw problem(line, "Giá trị vượt quá phạm vi của một từ 16 bit.");
    return { kind: "literal", value: number & WORD };
  }

  function address(text, labels, line) {
    const brackets = /^\[([^\[\]]+)\]$/.exec(text);
    if (!brackets) return value(text, labels, line);
    const pieces = brackets[1].split("+").map(part => part.trim());
    if (pieces.length === 1) return value(pieces[0], labels, line);
    if (pieces.length !== 2 || pieces.some(part => !part))
      throw problem(line, "Địa chỉ gián tiếp cần dạng [R1] hoặc [R1+R2].");
    return { kind: "sum", left: value(pieces[0], labels, line), right: value(pieces[1], labels, line) };
  }

  function assemble(source) {
    const labels = new Map();
    const rows = [];
    const lines = String(source).split(/\r\n|\r|\n/);
    for (let index = 0; index < lines.length; index++) {
      const line = index + 1;
      let text = (lines[index].match(sourceTokens) || [])
        .filter(token => !token.startsWith(";")).join("").trim();
      let label;
      while ((label = /^([A-Za-z_][\w]*)\s*:\s*/.exec(text))) {
        const name = label[1].toUpperCase();
        if (labels.has(name) || constants.has(name) || /^R\d+$/.test(name))
          throw problem(line, "Nhãn “" + label[1] + "” bị trùng hoặc trùng tên dành riêng.");
        labels.set(name, rows.length);
        text = text.slice(label[0].length);
      }
      if (!text) continue;
      const head = /^(\S+)(?:\s+(.*))?$/.exec(text);
      const op = head[1].toUpperCase();
      if (!Object.hasOwn(signatures, op)) throw problem(line, "Chưa hỗ trợ lệnh “" + op + "”.");
      if ((rows.length + 1) * WIDTH > 65536) throw problem(line, "Chương trình vượt quá 64 KiB.");
      rows.push({ line, op, text, raw: operands(head[2], line) });
    }
    if (!rows.length) throw problem(1, "Hãy nhập ít nhất một lệnh, chẳng hạn HLT.");

    return rows.map(({ line, op, text, raw }) => {
      const pattern = signatures[op];
      if (raw.length !== pattern.length || raw.some(item => !item))
        throw problem(line, op + " cần " + pattern.length + " toán hạng" +
          (pattern.length > 1 ? " cách nhau bằng dấu phẩy." : "."));
      const args = raw.map((item, i) => {
        if (pattern[i] === "r") return register(item, line);
        if (pattern[i] === "a") return address(item, labels, line);
        const operand = value(item, labels, line);
        if (pattern[i] === "t" && operand.kind === "literal" &&
            (operand.value % WIDTH !== 0 || operand.value / WIDTH >= rows.length))
          throw problem(line, "Đích nhảy phải là địa chỉ đầu một lệnh trong chương trình.");
        return operand;
      });
      return { line, op, args, text };
    });
  }

  class Machine {
    constructor(code) {
      this.code = code;
      this.regs = new Uint16Array(16);
      this.memory = new Uint8Array(65536);
      this.flags = { Z: 0, C: 0, N: 0, O: 0 };
      this.pc = 0;
      this.sp = 0x8000;
      this.stackWords = 0;
      this.steps = 0;
      this.halted = false;
      this.output = "";
    }

    get pcAddress() { return this.pc * WIDTH; }

    read(operand) {
      if (operand.kind === "register") return this.regs[operand.value];
      if (operand.kind === "sum") return (this.read(operand.left) + this.read(operand.right)) & WORD;
      return operand.value;
    }

    readWord(addr) {
      return this.memory[addr] | (this.memory[(addr + 1) & WORD] << 8);
    }

    writeWord(addr, word) {
      this.memory[addr] = word & 0xff;
      this.memory[(addr + 1) & WORD] = word >>> 8;
    }

    putChar(word) {
      const char = word & 0xff;
      if (char === 8) this.output = this.output.slice(0, -1);
      else if (char === 10 || char === 13) this.output += "\n";
      else if (char >= 32) this.output += String.fromCharCode(char);
      if (this.output.length > 8192) this.output = this.output.slice(-8192);
    }

    updateZN(word) {
      this.flags.Z = Number((word & WORD) === 0);
      this.flags.N = Number(Boolean(word & SIGN));
    }

    arithmetic(a, b, subtract = false) {
      const total = subtract ? a - b : a + b;
      const word = total & WORD;
      this.updateZN(word);
      this.flags.C = Number(subtract ? a >= b : total > WORD);
      const overflow = subtract ? ((a ^ b) & (a ^ word)) : (~(a ^ b) & (a ^ word));
      this.flags.O = Number(Boolean(overflow & SIGN));
      return word;
    }

    push(word, line) {
      if (this.stackWords >= 16384) throw problem(line, "Ngăn xếp đầy.");
      this.writeWord(this.sp, word);
      this.sp = (this.sp + 2) & WORD;
      this.stackWords++;
    }

    peek(line) {
      if (!this.stackWords) throw problem(line, "Ngăn xếp trống.");
      return this.readWord((this.sp - 2) & WORD);
    }

    pop() {
      this.sp = (this.sp - 2) & WORD;
      this.stackWords--;
    }

    jump(addr, line) {
      const index = addr / WIDTH;
      if (!Number.isInteger(index) || index < 0 || index >= this.code.length)
        throw problem(line, "Địa chỉ nhảy " + hex(addr) + " nằm ngoài lệnh hợp lệ.");
      return index;
    }

    step() {
      if (this.halted) return;
      const instruction = this.code[this.pc];
      if (!instruction) {
        const last = this.code[this.code.length - 1];
        throw problem(last?.line || 1, "CPU đã đi quá lệnh cuối. Hãy kết thúc bằng HLT.");
      }
      const { op, args, line } = instruction;
      const a = args.length ? this.read(args[0]) : 0;
      const b = args.length > 1 ? this.read(args[1]) : 0;
      const dest = args[0]?.value;
      const f = this.flags;
      let next = this.pc + 1;
      let result;
      switch (op) {
        case "MOV": this.regs[dest] = b; break;
        case "ADD": this.regs[dest] = this.arithmetic(a, b); break;
        case "SUB": this.regs[dest] = this.arithmetic(a, b, true); break;
        case "INC": this.regs[dest] = this.arithmetic(a, 1); break;
        case "DEC": this.regs[dest] = this.arithmetic(a, 1, true); break;
        case "CMP": this.arithmetic(a, b, true); break;
        case "AND": result = a & b; break;
        case "OR": result = a | b; break;
        case "XOR": result = a ^ b; break;
        case "NOT": result = ~a; break;
        case "SHL": result = b < 16 ? a << b : 0; break;
        case "SHR": result = b < 16 ? a >>> b : 0; break;
        case "JMP": next = this.jump(a, line); break;
        case "JZ": if (f.Z) next = this.jump(a, line); break;
        case "JNZ": if (!f.Z) next = this.jump(a, line); break;
        case "JC": if (f.C) next = this.jump(a, line); break;
        case "JN": if (f.N) next = this.jump(a, line); break;
        case "JO": if (f.O) next = this.jump(a, line); break;
        case "JG": if (!f.Z && f.N === f.O) next = this.jump(a, line); break;
        case "JGE": if (f.N === f.O) next = this.jump(a, line); break;
        case "JL": if (f.N !== f.O) next = this.jump(a, line); break;
        case "JLE": if (f.Z || f.N !== f.O) next = this.jump(a, line); break;
        case "JB": if (!f.C) next = this.jump(a, line); break;
        case "LOAD": case "LDR": this.regs[dest] = this.readWord(b); break;
        case "LOADB": this.regs[dest] = this.memory[b]; break;
        case "STORE": case "STR": {
          const addr = op === "STR" ? a : b;
          const word = op === "STR" ? b : a;
          this.writeWord(addr, word);
          if (addr === TEXT_PUTCHAR) this.putChar(word);
          break;
        }
        case "STOREB": this.memory[b] = a & 0xff; break;
        case "PUSH": this.push(a, line); break;
        case "POP": this.regs[dest] = this.peek(line); this.pop(); break;
        case "CALL": {
          const target = this.jump(a, line);
          this.push(next * WIDTH, line);
          next = target;
          break;
        }
        case "RET": next = this.jump(this.peek(line), line); this.pop(); break;
        case "OUT": this.putChar(a); break;
        case "NOP": break;
        case "HLT": this.halted = true; next = this.pc; break;
        default: throw problem(line, "Lệnh không hợp lệ.");
      }
      if (result !== undefined) {
        this.regs[dest] = result & WORD;
        this.updateZN(result);
        f.O = 0;
      }
      this.pc = next;
      this.steps++;
      return instruction;
    }
  }

  globalThis.BitCPU = { assemble, Machine, hex };
})();
