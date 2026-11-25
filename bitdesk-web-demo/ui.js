(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const paths = {
    layout:"M3 4h18v16H3z M3 9h18 M9 9v11", book:"M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1z M12 6v14",
    help:"M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4 M12 16h.01",
    play:"M7 4l13 8-13 8z",pause:"M8 5v14 M16 5v14",step:"M4 5l11 7-11 7z M19 5v14",reset:"M3 9a8 8 0 1 1 1 9 M3 4v5h5",
    speed:"M3 17a9 9 0 1 1 18 0 M12 15l5-6 M6 15h1 M12 6v1",
    code:"M8 7l-5 5 5 5 M16 7l5 5-5 5 M14 4l-4 16",folder:"M3 7V5h6l2 2h10v12H3z",
    down:"M5 9l7 7 7-7",left:"M14 5l-7 7 7 7",right:"M9 5l7 7-7 7",cursor:"M4 3l5 16 3-6 6-3z",
    cpu:"M6 6h12v12H6z M9 9h6v6H9z M9 3v3 M15 3v3 M9 18v3 M15 18v3 M3 9h3 M3 15h3 M18 9h3 M18 15h3",
    memory:"M3 7h18v10H3z M6 17v3 M10 17v3 M14 17v3 M18 17v3 M7 10v3 M11 10v3 M15 10v3",
    activity:"M2 13h5l3-8 4 14 3-8 2 2h3",terminal:"M3 4h18v16H3z M6 9l3 3-3 3 M12 15h5",
    bits:"M3 5h7v5H3z M14 5h7v5h-7z M3 14h7v5H3z M14 14h7v5h-7z",close:"M5 5l14 14 M19 5L5 19"
  };
  function icon(name) { return '<svg aria-hidden="true" class="ico" viewBox="0 0 24 24"><path d="' + paths[name] + '"/></svg>'; }
  document.querySelectorAll("[data-icon]").forEach(node => { node.outerHTML = icon(node.dataset.icon); });
  const source = $("source"), modal = $("modal"), examples = window.AsmLessons.examples;
  const { Machine, assemble, hex } = window.BitCPU;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  const binary = value => value.toString(2).padStart(16,"0");
  const nibs = value => binary(value).match(/.{4}/g);
  function stored(key) { try { return localStorage.getItem("bitdesk.v1."+key); } catch { return null; } }
  function save(key, value) { try { localStorage.setItem("bitdesk.v1."+key,value); return true; } catch { return false; } }
  let example = examples.find(x => x.id === stored("example")) || examples[0];
  let machine, error, timer, editTimer, trace=[], breakpoints=new Set(), state="ready", errorLine=0, changed=new Set();
  let selected=0, regPage=0, memBase=0, memTarget=null, wasSaved=true, lastTerminal="";
  const stateNames={ready:"Sẵn sàng", edit:"Đang sửa", running:"Đang chạy",paused:"Tạm dừng",halted:"Đã dừng",break:"Điểm dừng",error:"Lỗi chương trình"};
  const flagsInfo={Z:"Zero · kết quả bằng 0",C:"Carry · cờ nhớ",N:"Negative · bit dấu",O:"Overflow · tràn số có dấu"};
  const tokens=/;.*$|'(?:\\.|[^'\\])*'|\b[A-Za-z_]\w*\s*:|\b(?:0x[\da-f]+|0b[01]+|\d+)\b|\b[A-Za-z_]\w*\b/gi;
  const ops = new Set([...window.AsmLessons.reference.map(x=>x.name),"OUT","LDR","STR"]);
  function paint(line) {
    let html="", last=0;
    for(const match of line.matchAll(tokens)){
      html+=escape(line.slice(last,match.index));
      const t=match[0], upper=t.toUpperCase();
      let cls="";
      if(t[0]===";")cls="asm-comment"; else if(t.endsWith(":"))cls="asm-label";
      else if(/^(?:R\d+)$/i.test(t))cls="asm-reg"; else if(/^['\d]/.test(t))cls="asm-number";
      else if(ops.has(upper))cls="asm-op"; else cls="asm-constant";
      html+='<span class="'+cls+'">'+escape(t)+'</span>';last=match.index+t.length;
    }
    return html+escape(line.slice(last));
  }
  function syncScroll(){ $("highlight").scrollTop=source.scrollTop;$("highlight").scrollLeft=source.scrollLeft;$("gutter-lines").style.transform="translateY("+(-source.scrollTop)+"px)"; }
  function drawCode(){
    const lines=source.value.split("\n");
    $("highlight").innerHTML=lines.map(l=>'<span class="code-line">'+(paint(l)||" ")+'</span>').join("");
    $("gutter-lines").innerHTML=lines.map((_,i)=>'<button class="gutter-line" type="button" data-line="'+(i+1)+'" aria-label="Điểm dừng dòng '+(i+1)+'">'+(i+1)+'</button>').join("");
    markLine();syncScroll();
  }
  function markLine(follow=false) {
    const current=machine?.code[machine.pc]?.line || 0, rows=$("highlight").children, numbers=$("gutter-lines").children;
    for(let i=0;i<rows.length;i++){
      rows[i].classList.toggle("now",i+1===current); rows[i].classList.toggle("invalid",i+1===errorLine);
      const button=numbers[i], bp=breakpoints.has(i+1);
      button.classList.toggle("current",i+1===current);button.classList.toggle("marked",bp);button.setAttribute("aria-pressed",String(bp));
    }
    const focus=errorLine||current;
    if(follow && focus && rows[focus-1]){
      const y=rows[focus-1].offsetTop, height=rows[focus-1].offsetHeight;
      if(y<source.scrollTop || y+height>source.scrollTop+source.clientHeight)source.scrollTop=Math.max(0,y-source.clientHeight/2);
    }
    syncScroll();
  }
  function cursor(){const prefix=source.value.slice(0,source.selectionStart).split("\n");$("cursor-pos").textContent="Dòng "+prefix.length+", cột "+(prefix.at(-1).length+1);}
  function tabs(a,b,which) {
    for(const id of [a,b]){const t=$(id),active=id===which;t.classList.toggle("active",active);t.setAttribute("aria-selected",String(active));$(t.getAttribute("aria-controls")).hidden=!active;}
  }
  function showOutput(id){tabs("trace-tab","terminal-tab",id);}
  function bindTabs(a,b,select){for(const id of [a,b]){const pick=()=>select(id);$(id).onclick=pick;$(id).onkeydown=e=>{if(["ArrowLeft","ArrowRight"].includes(e.key)){e.preventDefault();const other=id===a?b:a;select(other);$(other).focus();}};}}
  bindTabs("trace-tab","terminal-tab",showOutput);
  bindTabs("reg-tab","ram-tab",id=>tabs("reg-tab","ram-tab",id));
  const regTr = [];
  for(let i=0;i<8;i++){
    const tr=$("reg-body").insertRow(); for(let j=0;j<4;j++)tr.insertCell();
    const btn=document.createElement("button");tr.cells[0].append(btn);tr.cells[3].className="reg-bin";
    tr.onclick=()=>chooseRegister(regPage*8+i);regTr.push(tr);
  }
  for(let i=0;i<16;i++)$("bit-reg").add(new Option("R"+i,String(i)));
  function chooseRegister(index){selected=index;regPage=index>>3;drawRegisters();drawBits();}
  function drawRegisters(){
    regTr.forEach((tr,i)=>{const reg=regPage*8+i,v=machine?.regs[reg]||0, cells=tr.cells;
      const name="R"+reg;cells[0].firstChild.textContent=name;cells[0].firstChild.setAttribute("aria-label","Soi bit "+name);
      tr.classList.toggle("selected",reg===selected);cells[1].textContent=hex(v);cells[1].classList.toggle("changed",changed.has(reg));
      cells[2].textContent=String(v).padStart(5,"0");cells[3].innerHTML=nibs(v).map(n=>"<span>"+n+"</span>").join(" ");
    });
    $("reg-range").textContent=regPage?"R8 – R15":"R0 – R7";$("reg-prev").disabled=!regPage;$("reg-next").disabled=!!regPage;
    $("pc").textContent=hex(machine?.pcAddress||0);$("sp").textContent=hex(machine?.sp??0x8000);
    $("flag-bits").innerHTML=Object.entries(flagsInfo).map(([f,label])=>{const on=machine?.flags[f]?1:0;return '<span class="flag '+(on?"on":"")+'" title="'+label+'">'+f+' '+on+'</span>';}).join("");
  }
  function drawBits(){
    const value=machine?.regs[selected]||0;$("bit-reg").value=String(selected);
    $("bits").innerHTML=nibs(value).map((n,group)=>'<div class="nibble">'+[...n].map((v,i)=>'<span title="Bit '+(15-group*4-i)+' · '+(2**(15-group*4-i))+'" class="bit '+(v==="1"?"on":"")+'">'+v+'</span>').join("")+'</div>').join("");
    $("bit-summary").innerHTML="<span>HEX <b>"+hex(value)+"</b></span><span>DEC <b>"+value+"</b></span>";
  }
  $("reg-prev").onclick=()=>chooseRegister(selected%8);$("reg-next").onclick=()=>chooseRegister(selected%8+8);
  $("bit-reg").onchange=()=>chooseRegister(Number($("bit-reg").value));
  $("mem-head").innerHTML="<tr><th>HEX</th>"+Array.from({length:8},(_,i)=>"<th>+"+i+"</th>").join("")+"</tr>";
  function drawMemory(){
    let html="";for(let i=0;i<64;i+=8){html+="<tr><td>"+hex(memBase+i)+"</td>";
      for(let j=0;j<8;j++){const addr=memBase+i+j, v=machine?.memory[addr]||0;html+='<td title="'+hex(addr)+'" class="'+(v?"nonzero ":"")+(memTarget===addr?"target":"")+'">'+v.toString(16).toUpperCase().padStart(2,"0")+"</td>";} html+="</tr>";}
    $("mem-body").innerHTML=html;$("mem-range").textContent=hex(memBase)+" – "+hex(memBase+63);$("mem-prev").disabled=memBase===0;$("mem-next").disabled=memBase===65472;
  }
  function memPage(delta){memBase=Math.max(0,Math.min(65472,memBase+delta));memTarget=null;$("mem-address").value=hex(memBase);drawMemory();}
  $("mem-prev").onclick=()=>memPage(-64);$("mem-next").onclick=()=>memPage(64);
  $("mem-address").oninput=e=>e.target.setCustomValidity("");
  $("mem-form").onsubmit=e=>{e.preventDefault();const field=$("mem-address"),val=field.value.trim();if(!/^(?:0x)?[\da-f]{1,4}$/i.test(val)){field.setCustomValidity("Nhập một địa chỉ từ 0x0000 đến 0xFFFF.");field.reportValidity();return;}memTarget=parseInt(val.replace(/^0x/i,""),16);memBase=memTarget&0xffc0;field.value=hex(memTarget);drawMemory();};
  function addLog(step,op,detail,fault=false){trace.unshift({step,op,detail,fault});if(trace.length>64)trace.pop();}
  function drawTrace(){
    $("trace").innerHTML=trace.length?trace.map(row=>'<div class="log-entry'+(row.fault?" error":"")+'"><span>'+escape(row.step)+'</span><b>'+escape(row.op)+'</b><span>'+escape(row.detail)+'</span></div>').join(""):'<div class="trace-empty">'+icon("activity")+"<span>"+escape(source.value===example.source?example.hint:"Chạy từng bước để theo dõi lệnh và thanh ghi.")+"</span></div>";
    const output=machine?.output||"";$("terminal").textContent=output||"▌";
    if(output!==lastTerminal){$("terminal-pane").scrollTop=$("terminal-pane").scrollHeight;lastTerminal=output;}
    $("steps").textContent=(machine?.steps||0)+" lệnh";
  }
  function setStatus(s){state=s;$("status").dataset.state=s;$("status").textContent=stateNames[s];
    const running=s==="running";$("run").innerHTML=icon(running?"pause":"play")+"<span>"+(running?"Tạm dừng":s==="halted"?"Chạy lại":"Chạy")+"</span>";
    $("step").disabled=running||s==="halted";
  }
  function refresh(follow=false){drawRegisters();drawBits();drawMemory();drawTrace();markLine(follow);}
  function stop(){if(timer!=null){clearTimeout(timer);timer=null;}}
  function compile(report){
    stop();clearTimeout(editTimer);error=null;errorLine=0;trace=[];changed.clear();lastTerminal="";
    try{machine=new Machine(assemble(source.value));setStatus("ready");}
    catch(e){machine=null;error=e;if(report)reportError(e);else setStatus("edit");}
    refresh(report&&!!error);return !!machine;
  }
  function reportError(e){stop();errorLine=e.line||machine?.code[machine.pc]?.line||0;setStatus("error");addLog("!","LỖI",e.message,true);showOutput("trace-tab");}
  function execute(){
    const ir=machine.code[machine.pc];const before=Array.from(machine.regs),sp=machine.sp;
    try{machine.step();}
    catch(e){reportError(e);refresh(true);return false;}
    changed=new Set(before.flatMap((v,i)=>v!==machine.regs[i]?[i]:[]));
    let detail=Array.from(changed,i=>"R"+i+" ← "+hex(machine.regs[i])).join(", ");
    if(!detail && sp!==machine.sp)detail="SP ← "+hex(machine.sp);
    if(!detail)detail=ir.op==="CMP"?Object.keys(flagsInfo).map(f=>f+"="+Number(machine.flags[f])).join("  "):ir.op==="HLT"?"Kết thúc chương trình":ir.op.startsWith("J")?"PC → "+hex(machine.pcAddress):ir.text;
    addLog("#"+machine.steps,ir.op,detail);
    if(machine.halted){stop();setStatus("halted");}
    refresh(true);return !machine.halted;
  }
  function ensure(){if(!machine||state==="halted"||state==="error")return compile(true);return true;}
  function stepOnce(){if(state==="running"||state==="halted"||!ensure())return;setStatus("paused");execute();}
  function schedule(){timer=setTimeout(()=>{timer=null;if(state!=="running")return;const row=machine.code[machine.pc];if(row&&breakpoints.has(row.line)){setStatus("break");markLine(true);return;}if(execute())schedule();},1000/Number($("speed").value));}
  function run(){if(state==="running"){stop();setStatus("paused");return;}if(!ensure())return;
    const atBreak=breakpoints.has(machine.code[machine.pc]?.line);if(state!=="break"&&atBreak){setStatus("break");markLine(true);return;}
    setStatus("running");if(execute())schedule();}
  $("run").onclick=run;$("step").onclick=stepOnce;$("reset").onclick=()=>compile(true);
  $("speed").onchange=()=>{if(state==="running"){stop();schedule();}};
  $("gutter-lines").onclick=e=>{const n=Number(e.target.dataset.line);if(!n||!machine?.code.some(row=>row.line===n))return;if(breakpoints.has(n))breakpoints.delete(n);else breakpoints.add(n);markLine();};
  function recordSource(){wasSaved=save("source."+example.id,source.value);$("saved").textContent=wasSaved?"Đã lưu trên thiết bị":"Lưu trong phiên";}
  source.addEventListener("input",()=>{stop();clearTimeout(editTimer);machine=null;errorLine=0;trace=[];changed.clear();breakpoints.clear();setStatus("edit");recordSource();drawCode();refresh();cursor();editTimer=setTimeout(()=>compile(false),220);});
  source.addEventListener("scroll",syncScroll);["keyup","click","select"].forEach(name=>source.addEventListener(name,cursor));
  source.addEventListener("keydown",event=>{if(event.key==="Tab"&&!event.shiftKey){event.preventDefault();source.setRangeText("    ",source.selectionStart,source.selectionEnd,"end");source.dispatchEvent(new Event("input"));}});
  function loadExample(next){stop();example=next;save("example",next.id);source.value=stored("source."+next.id)??next.source;source.scrollTop=source.scrollLeft=0;source.setSelectionRange(0,0);$("filename").textContent=next.file;$("saved").textContent=stored("source."+next.id)!==null?"Đã lưu trên thiết bị":"Lưu trên thiết bị";
    selected=regPage=0;memBase=0;memTarget=null;$("mem-address").value="0x0000";breakpoints.clear();drawCode();compile(false);cursor();showOutput(["terminal","triangle"].includes(next.id)?"terminal-tab":"trace-tab");}
  function openDialog(id){const head=$("modal-heading"),body=$("modal-body");
    if(id==="examples"){head.textContent="Chọn bài mẫu";body.innerHTML=examples.map((x,i)=>'<button class="example-choice" data-example="'+i+'"><b>'+escape(x.title)+'</b><code>'+escape(x.file)+'</code><small>'+escape(x.hint)+'</small></button>').join("");}
    else if(id==="reference"){head.textContent="Tập lệnh";body.innerHTML=window.AsmLessons.reference.map(x=>'<div class="reference-item"><code>'+escape(x.syntax)+'</code><p>'+escape(x.description)+'</p></div>').join("");}
    else {head.textContent="Thực hành với Bitdesk";body.innerHTML='<ol class="guide-copy"><li>Mở <b>Bài mẫu</b> hoặc viết ASM ngay trong trình soạn thảo. Bản nháp của từng bài được lưu riêng trên trình duyệt này.</li><li>Chọn <b>Từng bước</b> (F8) để thực thi một lệnh. Dòng được đánh dấu là lệnh CPU sắp chạy. <b>Chạy</b> (Ctrl + Enter) chạy liên tục theo tốc độ đã chọn.</li><li>Bấm số dòng có lệnh để đặt điểm dừng. Bấm <b>Chạy</b> lần nữa để tiếp tục. Nút mũi tên vòng đặt lại thanh ghi, RAM và PC.</li><li>Chọn một thanh ghi để xem 16 bit theo nhóm bốn. Mỗi nhóm tương ứng một chữ số HEX. Bit ngoài cùng bên phải có giá trị 1.</li><li>CPU có 16 thanh ghi, RAM dữ liệu 64 KiB, mỗi lệnh chiếm 6 byte địa chỉ. Bộ nhớ dữ liệu và danh sách lệnh được lưu riêng trong bản web. Ghi ký tự ASCII vào <code>TEXT_PUTCHAR</code> để xem trong Terminal.</li></ol>';}
    if(!modal.open)modal.showModal();
  }
  document.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>openDialog(b.dataset.open));
  $("modal-body").onclick=e=>{const b=e.target.closest("[data-example]");if(b){modal.close();loadExample(examples[Number(b.dataset.example)]);}};
  $("close-modal").onclick=()=>modal.close();modal.onclick=e=>{if(e.target===modal){const b=modal.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)modal.close();}};
  document.addEventListener("keydown",e=>{if(modal.open)return;if(e.key==="F8"){e.preventDefault();stepOnce();}if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){e.preventDefault();run();}});
  function drawCircuit(){
    const c=$("circuit"),w=c.clientWidth,h=c.clientHeight;if(!w||!h)return;const dpr=window.devicePixelRatio||1;c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);
    const g=c.getContext("2d");g.scale(dpr*w/340,dpr*h/108);
    g.fillStyle="#d8d7ce";for(let x=4;x<340;x+=9)for(let y=4;y<108;y+=9)g.fillRect(x,y,1,1);
    const wires=[
      [[13,24],[42,24],[56,38],[133,38]],[[33,48],[77,48],[88,58],[133,58]],[[4,87],[55,87],[71,71],[133,71]],[[88,13],[100,25],[132,25]],
      [[205,35],[235,35],[250,20],[300,20]],[[205,51],[261,51],[277,36],[327,36]],[[205,67],[245,67],[260,82],[304,82]],[[205,79],[219,79],[239,99],[274,99]]];
    wires.forEach((wire,i)=>{const color=i===1||i===4?"#8272b8":"#b1aca1";g.strokeStyle=color;g.lineWidth=1.3;g.beginPath();wire.forEach(([x,y],j)=>j?g.lineTo(x,y):g.moveTo(x,y));g.stroke();
      const [x,y]=wire[i<4?0:wire.length-1];g.fillStyle="#f6f5ef";g.beginPath();g.arc(x,y,2.7,0,Math.PI*2);g.fill();g.stroke();});
    g.fillStyle="#aaa5b4";for(let x=145;x<198;x+=8){g.fillRect(x,9,3,9);g.fillRect(x,88,3,9);}for(let y=25;y<85;y+=9){g.fillRect(125,y,10,3);g.fillRect(203,y,10,3);}
    g.fillStyle="#cbc8ce";g.fillRect(137,20,69,70);g.fillStyle="#3f3b51";g.fillRect(133,16,70,70);g.strokeStyle="#777187";g.strokeRect(137.5,20.5,61,61);g.fillStyle="#dcf399";g.fillRect(143,26,5,5);
    g.fillStyle="#f5f1fc";g.font="bold 18px Consolas, monospace";g.fillText("CPU",150,55);g.fillStyle="#cdcadc";g.font="9px Consolas, monospace";g.fillText("16-BIT",151,70);
  }
  loadExample(example);drawCircuit();window.addEventListener("resize",drawCircuit);
})();
