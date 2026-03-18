const wrap = document.getElementById("menuWrap");
const title = document.getElementById("toggleTitle");
const boxes = document.getElementById("optionBoxes");

let manuallyToggled = false;

wrap.addEventListener("mouseenter", () => {
  if (!manuallyToggled) boxes.classList.add("show");
});

wrap.addEventListener("mouseleave", () => {
  if (!manuallyToggled) boxes.classList.remove("show");
});

title.addEventListener("click", () => {
  manuallyToggled = !manuallyToggled;
  boxes.classList.toggle("show", manuallyToggled);
});



document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const penBtn = document.getElementById("penBtn");
  const eraserBtn = document.getElementById("eraserBtn");
  const clearBtn = document.getElementById("clearBtn");
  const undoBtn = document.getElementById("undoBtn");

  const colorPicker = document.getElementById("colorPicker");
  const brushSize = document.getElementById("brushSize");
  const sizeLabel = document.getElementById("sizeLabel");

  // =========================
  // 0) 새로고침해도 유지 (localStorage)
  // =========================
  const STORAGE_KEY = "board_canvas_v1";

  function saveCanvas() {
    try {
      const dataURL = canvas.toDataURL("image/png");
      localStorage.setItem(STORAGE_KEY, dataURL);
    } catch (e) {
      console.warn("Canvas save failed:", e);
    }
  }

  function loadCanvas() {
    const dataURL = localStorage.getItem(STORAGE_KEY);
    if (!dataURL) return;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = dataURL;
  }

  // =========================
  // 1) 스크롤/줌 방지(모바일) + 경계
  // =========================
  canvas.style.touchAction = "none";
  canvas.style.display = "block";
  canvas.style.border = "2px solid #222";

  canvas.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

  // =========================
  // 2) 기본 설정 + UI 연동
  // =========================
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const applyBrushSize = () => {
    const size = Number(brushSize?.value ?? 6);
    ctx.lineWidth = size;
    if (sizeLabel) sizeLabel.textContent = `${size}px`;
  };
  applyBrushSize();
  brushSize?.addEventListener("input", applyBrushSize);

  const applyColor = () => {
    ctx.strokeStyle = colorPicker?.value ?? "#000000";
  };
  applyColor();
  colorPicker?.addEventListener("input", applyColor);

  let mode = "pen"; // "pen" | "eraser"
  function setMode(next) {
    mode = next;
    if (mode === "eraser") ctx.globalCompositeOperation = "destination-out";
    else {
      ctx.globalCompositeOperation = "source-over";
      applyColor();
    }
  }
  setMode("pen");
  penBtn?.addEventListener("click", () => setMode("pen"));
  eraserBtn?.addEventListener("click", () => setMode("eraser"));

  // =========================
  // 3) Undo 스택
  // =========================
  const undoStack = [];
  const MAX_UNDO = 30;

  function pushUndoState() {
    try {
      undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (undoStack.length > MAX_UNDO) undoStack.shift();
    } catch (err) {
      console.warn("Undo snapshot failed:", err);
    }
  }

  function undo() {
    const prev = undoStack.pop();
    if (!prev) return;
    ctx.putImageData(prev, 0, 0);
    saveCanvas(); // undo 후에도 저장 상태 갱신
  }

  undoBtn?.addEventListener("click", undo);

  window.addEventListener("keydown", (e) => {
    const isZ = e.key.toLowerCase() === "z";
    if (isZ && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      undo();
    }
  });

  // =========================
  // 4) 리사이즈해도 그림 유지 + 저장된 그림도 복원
  // =========================
  function resizeCanvasKeepDrawing() {
    // 현재 캔버스 내용 임시 저장
    const temp = document.createElement("canvas");
    temp.width = canvas.width;
    temp.height = canvas.height;
    temp.getContext("2d").drawImage(canvas, 0, 0);

    const newW = Math.floor(window.innerWidth);
    const newH = Math.floor(window.innerHeight * 0.7);
    if (newW <= 0 || newH <= 0) return;

    canvas.width = newW;
    canvas.height = newH;

    // 설정 복구
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    applyBrushSize();
    setMode(mode);

    // 기존 그림 복구(좌상단 기준)
    ctx.drawImage(temp, 0, 0);
  }

  // 최초 크기 확정
  resizeCanvasKeepDrawing();

  // ✅ 여기서 저장된 그림 불러오기 (크기 확정 후)
  loadCanvas();

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeCanvasKeepDrawing();
      // 리사이즈 후에도 저장된 그림을 다시 덮어씌우고 싶으면 아래 유지
      loadCanvas();
    }, 80);
  });

  // =========================
  // 5) 그리기 로직 + 저장 타이밍
  // =========================
  let drawing = false;
  let lastX = 0, lastY = 0;

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startDraw(e) {
    pushUndoState();
    drawing = true;
    const { x, y } = getPos(e);
    lastX = x;
    lastY = y;
  }

  function moveDraw(e) {
    if (!drawing) return;
    const { x, y } = getPos(e);

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();

    lastX = x;
    lastY = y;
  }

  function endDraw() {
    if (!drawing) return;
    drawing = false;
    saveCanvas(); // ✅ 그리기 끝나면 저장
  }

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    startDraw(e);
  });
  canvas.addEventListener("pointermove", moveDraw);
  canvas.addEventListener("pointerup", endDraw);
  canvas.addEventListener("pointercancel", endDraw);

  clearBtn?.addEventListener("click", () => {
    pushUndoState();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    saveCanvas(); // ✅ 전체 지우기 후 저장(새로고침해도 빈 상태 유지)
  });

  // 새로고침/닫기 직전에도 저장 (안전장치)
  window.addEventListener("beforeunload", saveCanvas);

  // (선택) 저장 데이터만 지우고 싶을 때 쓸 함수
  function clearSavedCanvas() {
    localStorage.removeItem(STORAGE_KEY);
  }
});

const exportType = document.getElementById("exportType");
const saveBtn = document.getElementById("saveBtn");

function downloadDataURL(dataURL, filename) {
  const a = document.createElement("a");
  a.href = dataURL;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// PDF는 라이브러리 없이: 새 창에 이미지 띄우고 print → “PDF로 저장”
function exportPDFfromCanvas() {
  const dataURL = canvas.toDataURL("image/png");

  const w = window.open("", "_blank");
  if (!w) {
    alert("팝업이 차단되어 PDF 저장창을 열 수 없어. 팝업 허용해줘!");
    return;
  }

  w.document.open();
  w.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Export PDF</title>
        <style>
          html, body { margin:0; padding:0; height:100%; }
          body { display:flex; align-items:center; justify-content:center; }
          img { max-width:100%; max-height:100%; }
          @page { margin: 0; }
        </style>
      </head>
      <body>
        <img src="${dataURL}" />
        <script>
          // 이미지 로드 후 인쇄창 열기
          const img = document.querySelector('img');
          img.onload = () => {
            window.focus();
            window.print();
          };
        </script>
      </body>
    </html>
  `);
  w.document.close();
}

saveBtn.addEventListener("click", () => {
  const type = exportType.value;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = `drawing-${stamp}`;

  if (type === "png") {
    const dataURL = canvas.toDataURL("image/png");
    downloadDataURL(dataURL, `${baseName}.png`);
  } else if (type === "jpg") {
    // 흰 배경 JPG로 저장(캔버스는 투명 배경 가능해서 JPG 저장 시 검게 보일 때가 있음)
    const temp = document.createElement("canvas");
    temp.width = canvas.width;
    temp.height = canvas.height;
    const tctx = temp.getContext("2d");

    // 흰 배경 깔고 원본 그리기
    tctx.fillStyle = "#ffffff";
    tctx.fillRect(0, 0, temp.width, temp.height);
    tctx.drawImage(canvas, 0, 0);

    const quality = 0.92; // 0~1
    const dataURL = temp.toDataURL("image/jpeg", quality);
    downloadDataURL(dataURL, `${baseName}.jpg`);
  } else if (type === "pdf") {
    exportPDFfromCanvas();
  }
});