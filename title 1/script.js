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

const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");
const convertBtn = document.getElementById("convertBtn");
const statusBox = document.getElementById("status");
const downloadArea = document.getElementById("downloadArea");
const dropzone = document.getElementById("dropzone");

let selectedFiles = [];

function renderFiles() {
  if (selectedFiles.length === 0) {
    fileList.textContent = "선택된 파일이 없음 샤갈!!";
    return;
  }

  fileList.innerHTML = selectedFiles
    .map(
      (file, index) => `
        <div class="file-item">
          <span>${index + 1}. ${file.name}</span>
          <span>${(file.size / 1024 / 1024).toFixed(2)} MB</span>
        </div>
      `
    )
    .join("");
}

function setFiles(files) {
  selectedFiles = Array.from(files).filter((file) =>
    file.name.toLowerCase().endsWith(".pptx")
  );

  renderFiles();

  if (selectedFiles.length === 0) {
    statusBox.textContent = "PPTX 파일만 선택 가능";
  } else {
    statusBox.textContent = `${selectedFiles.length}개의 PPTX 파일이 준비됨.`;
  }

  downloadArea.innerHTML = "";
}

fileInput.addEventListener("change", (e) => {
  setFiles(e.target.files);
});

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  setFiles(e.dataTransfer.files);
});

convertBtn.addEventListener("click", async () => {
  if (selectedFiles.length === 0) {
    alert("파일이 없잖아요 샤갈!!");
    return;
  }

  convertBtn.disabled = true;
  statusBox.textContent = "업로드 및 변환 중...";
  downloadArea.innerHTML = "";

  try {
    const formData = new FormData();

    selectedFiles.forEach((file) => {
      formData.append("files", file);
    });

    const response = await fetch("http://localhost:3000/upload-multiple", {
      method: "POST",
      body: formData
    });

    const data = await response.json();
    console.log("server response:", data);

    if (!response.ok) {
      throw new Error(data.message || "변환 중 오류발생,, 샤갈!!");
    }

    let message = `변환 완료 / 성공: ${data.successCount}개 / 실패: ${data.failCount}개`;

    if (data.failedFiles && data.failedFiles.length > 0) {
      message += " / 실패 파일: ";
      message += data.failedFiles
        .map((file) => `${file.originalName}: ${file.reason}`)
        .join(", ");
    }

    statusBox.textContent = message;

    // 1개 파일이면 PDF 직접 다운로드 링크
    if (data.downloadType === "single" && data.fileUrl) {
      const fileName = data.successFiles?.[0]?.pdfName || "PDF 다운로드";

      downloadArea.innerHTML = `
        <a class="download-link" href="${data.fileUrl}" download>
          ${fileName} 다운로드
        </a>
      `;
      return;
    }

    // 여러 개면 ZIP 다운로드 링크
    if (data.downloadType === "zip" && data.zipUrl) {
      downloadArea.innerHTML = `
        <a class="download-link" href="${data.zipUrl}" download>
          ZIP 다운로드
        </a>
      `;
      return;
    }

    // 혹시 응답 형식이 달라도 최소한 링크는 보이게
    if (data.fileUrl) {
      downloadArea.innerHTML = `
        <a class="download-link" href="${data.fileUrl}" download>
          PDF 다운로드
        </a>
      `;
      return;
    }

    if (data.zipUrl) {
      downloadArea.innerHTML = `
        <a class="download-link" href="${data.zipUrl}" download>
          ZIP 다운로드
        </a>
      `;
      return;
    }

    downloadArea.innerHTML = `
      <span class="download-link">다운로드 링크를 찾지 못함</span>
    `;
  } catch (error) {
    statusBox.textContent = "에러 발생: " + error.message;
    downloadArea.innerHTML = "";
  } finally {
    convertBtn.disabled = false;
  }
});