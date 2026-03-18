const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const { spawn } = require("child_process");
const archiver = require("archiver");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

const app = express();
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
app.use(cors());
app.use(express.json());

const ROOT_DIR = __dirname;
const UPLOAD_DIR = path.join(ROOT_DIR, "uploads");
const RESULT_DIR = path.join(ROOT_DIR, "results");
const TEMP_DIR = path.join(ROOT_DIR, "temp");

ensureDirSync(UPLOAD_DIR);
ensureDirSync(RESULT_DIR);
ensureDirSync(TEMP_DIR);

// 결과 파일 정적 제공
app.use("/results", express.static(RESULT_DIR));

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 한글 파일명 복원
 */
function fixKoreanFilename(name) {
  try {
    const recovered = Buffer.from(name, "latin1").toString("utf8");

    if (recovered.includes("�")) {
      return name;
    }

    return recovered;
  } catch {
    return name;
  }
}

/**
 * 파일명 위험 문자 제거
 */
function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 원본 파일명 정리
 */
function normalizeOriginalFilename(name) {
  const fixed = fixKoreanFilename(name);
  const sanitized = sanitizeFilename(fixed);
  return sanitized || "unnamed.pptx";
}

/**
 * LibreOffice 경로
 */
function getSofficePath() {
  if (process.platform === "win32") {
    return "C:\\Program Files\\LibreOffice\\program\\soffice.exe";
  }
  return "soffice";
}

/**
 * PPTX -> PDF 변환
 */
function convertToPdf(inputPath, outputDir, profileDir) {
  return new Promise((resolve, reject) => {
    const sofficePath = getSofficePath();
    const profileUri = `file:///${profileDir.replace(/\\/g, "/")}`;

    const args = [
      `-env:UserInstallation=${profileUri}`,
      "--headless",
      "--convert-to",
      "pdf",
      "--outdir",
      outputDir,
      inputPath
    ];

    const child = spawn(sofficePath, args, {
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      reject(new Error(`LibreOffice 실행 실패: ${err.message}`));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(stderr || stdout || `PDF 변환 실패 (exit code: ${code})`)
        );
      }

      resolve({ stdout, stderr });
    });
  });
}

/**
 * ZIP 생성
 */
function createZip(files, zipPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", {
      zlib: { level: 9 }
    });

    output.on("close", () => resolve());
    output.on("error", (err) => reject(err));
    archive.on("error", (err) => reject(err));

    archive.pipe(output);

    for (const file of files) {
      archive.file(file.absPath, { name: file.nameInZip });
    }

    archive.finalize();
  });
}

/**
 * 파일/폴더 삭제
 */
async function safeRemove(targetPath) {
  try {
    await fsp.rm(targetPath, { recursive: true, force: true });
  } catch {
    // 무시
  }
}

/**
 * 중복 파일명 방지
 */
function getUniqueTargetPath(dir, desiredFileName) {
  const ext = path.extname(desiredFileName);
  const base = path.basename(desiredFileName, ext);

  let candidateName = desiredFileName;
  let candidatePath = path.join(dir, candidateName);
  let count = 1;

  while (fs.existsSync(candidatePath)) {
    candidateName = `${base} (${count})${ext}`;
    candidatePath = path.join(dir, candidateName);
    count++;
  }

  return {
    fileName: candidateName,
    filePath: candidatePath
  };
}

/**
 * multer 저장
 * 서버 내부 저장명은 영문 UUID 기반
 */
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const normalizedOriginal = normalizeOriginalFilename(file.originalname);
    file.originalname = normalizedOriginal;

    const ext = path.extname(normalizedOriginal).toLowerCase();
    const safeServerName = `${Date.now()}-${uuidv4()}${ext}`;

    cb(null, safeServerName);
  }
});

/**
 * PPTX만 허용
 */
const fileFilter = (req, file, cb) => {
  const normalizedOriginal = normalizeOriginalFilename(file.originalname);
  file.originalname = normalizedOriginal;

  const ext = path.extname(normalizedOriginal).toLowerCase();

  if (ext === ".pptx") {
    cb(null, true);
  } else {
    cb(new Error("PPTX 파일만 업로드 가능합니다."), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    files: 20,
    fileSize: 100 * 1024 * 1024
  }
});

// 기본 확인
app.get("/", (req, res) => {
  res.send("Mainfile server running");
});

/**
 * 여러 PPTX 업로드 -> PDF 변환
 * 1개 성공 시 PDF 직접 링크 반환
 * 2개 이상 성공 시 ZIP 링크 반환
 */
app.post("/upload-multiple", upload.array("files", 20), async (req, res) => {
  const uploadedFilePaths = [];
  const tempPaths = [];

  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        message: "파일이 업로드되지 않았습니다."
      });
    }

    const jobId = uuidv4();
    const jobResultDir = path.join(RESULT_DIR, jobId);
    ensureDirSync(jobResultDir);

    const successFiles = [];
    const failedFiles = [];

    for (const file of req.files) {
      uploadedFilePaths.push(file.path);

      const originalName = normalizeOriginalFilename(file.originalname);
      const originalBaseName = path.basename(
        originalName,
        path.extname(originalName)
      );
      const wantedPdfName = `${originalBaseName}.pdf`;

      const fileWorkId = uuidv4();
      const fileTempRoot = path.join(TEMP_DIR, fileWorkId);
      const fileOutputDir = path.join(fileTempRoot, "out");
      const profileDir = path.join(fileTempRoot, "profile");

      ensureDirSync(fileOutputDir);
      ensureDirSync(profileDir);

      tempPaths.push(fileTempRoot);

      try {
        const inputPath = path.resolve(file.path);

        await convertToPdf(inputPath, fileOutputDir, profileDir);

        const generatedPdfName =
          path.basename(file.filename, path.extname(file.filename)) + ".pdf";

        const generatedPdfPath = path.join(fileOutputDir, generatedPdfName);

        if (!fs.existsSync(generatedPdfPath)) {
          throw new Error("PDF 파일이 생성되지 않았습니다.");
        }

        const uniqueTarget = getUniqueTargetPath(jobResultDir, wantedPdfName);

        await fsp.copyFile(generatedPdfPath, uniqueTarget.filePath);

        successFiles.push({
          originalName,
          pdfName: uniqueTarget.fileName,
          absPath: uniqueTarget.filePath,
          nameInZip: uniqueTarget.fileName
        });
      } catch (err) {
        failedFiles.push({
          originalName,
          reason: err.message
        });
      }
    }

    if (successFiles.length === 0) {
      return res.status(500).json({
        message: "모든 파일 변환 실패",
        failedFiles
      });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    // 성공 파일이 1개면 ZIP 없이 PDF 직접 반환
    if (successFiles.length === 1) {
      const singleFile = successFiles[0];

      return res.json({
        message: "변환 완료",
        successCount: 1,
        failCount: failedFiles.length,
        successFiles: [
          {
            originalName: singleFile.originalName,
            pdfName: singleFile.pdfName
          }
        ],
        failedFiles,
        downloadType: "single",
        fileUrl: `${baseUrl}/results/${jobId}/${encodeURIComponent(singleFile.pdfName)}`
      });
    }

    // 여러 개면 ZIP 생성
    const zipName = "converted-pdf.zip";
    const zipAbsPath = path.join(jobResultDir, zipName);

    await createZip(successFiles, zipAbsPath);

    return res.json({
      message: "변환 완료",
      successCount: successFiles.length,
      failCount: failedFiles.length,
      successFiles: successFiles.map((f) => ({
        originalName: f.originalName,
        pdfName: f.pdfName
      })),
      failedFiles,
      downloadType: "zip",
      zipName,
      zipUrl: `${baseUrl}/results/${jobId}/${encodeURIComponent(zipName)}`
    });
  } catch (error) {
    console.error("서버 오류:", error);

    return res.status(500).json({
      message: "서버 오류",
      error: error.message
    });
  } finally {
    for (const filePath of uploadedFilePaths) {
      await safeRemove(filePath);
    }

    for (const tempPath of tempPaths) {
      await safeRemove(tempPath);
    }
  }
});

/**
 * ZIP 직접 다운로드 라우트
 */
app.get("/download/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;
    const zipPath = path.join(RESULT_DIR, jobId, "converted-pdf.zip");

    if (!fs.existsSync(zipPath)) {
      return res.status(404).json({
        message: "ZIP 파일을 찾을 수 없습니다."
      });
    }

    return res.download(zipPath, "converted-pdf.zip");
  } catch (error) {
    return res.status(500).json({
      message: "다운로드 중 오류가 발생했습니다.",
      error: error.message
    });
  }
});

// 에러 처리
app.use((err, req, res, next) => {
  console.error("에러 처리 미들웨어:", err);

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        message: "파일 1개의 최대 크기는 100MB입니다."
      });
    }

    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        message: "최대 20개 파일까지 업로드 가능합니다."
      });
    }

    return res.status(400).json({
      message: err.message
    });
  }

  return res.status(400).json({
    message: err.message || "알 수 없는 오류가 발생했습니다."
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});