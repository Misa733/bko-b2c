import express from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { clearConsolidatedCache, readCompetencias, saveCompetencia, writeCompetenciaRawCache, writeConsolidatedCache } from "../storage/store.js";
import { readWorkbook } from "../services/excelReader.service.js";
import { classifySheet, expectedSheetStatus } from "../services/sheetClassifier.service.js";
import { consolidateCompetencia } from "../services/consolidation.service.js";
import { normalizeCpf } from "../utils/normalize.js";
import { asyncHandler } from "../utils/http.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(__dirname, "../../uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 20
  },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith(".xlsx")) {
      return cb(new Error("Envie apenas arquivos .xlsx."));
    }
    cb(null, true);
  }
});

const router = express.Router({ mergeParams: true });

function getCompetencia(req, res) {
  const competencia = readCompetencias().find((item) => item.id === req.params.id);
  if (!competencia) {
    res.status(404).json({ success: false, message: "Competencia nao encontrada.", details: "" });
    return null;
  }
  return competencia;
}

function uploadFiles(req, res, next) {
  upload.array("files")(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") return res.status(400).json({ success: false, message: "Arquivo muito grande. Limite: 50 MB por arquivo.", details: error.message });
      if (error.code === "LIMIT_FILE_COUNT") return res.status(400).json({ success: false, message: "Muitos arquivos enviados. Limite: 20 arquivos por importacao.", details: error.message });
    }
    return res.status(400).json({ success: false, message: error.message || "Nao foi possivel receber os arquivos.", details: "" });
  });
}

router.post("/upload", uploadFiles, asyncHandler((req, res) => {
  const competencia = getCompetencia(req, res);
  if (!competencia) return;
  if (!req.files?.length) return res.status(400).json({ success: false, message: "Selecione ao menos um arquivo .xlsx para importar.", details: "" });

  const imported = [];
  for (const file of req.files || []) {
    try {
      const { rows, columns, sheetName } = readWorkbook(file.path);
      const classification = classifySheet(columns);
      const withoutCpf = rows.filter((row) => "CPF Cliente" in row && !normalizeCpf(row["CPF Cliente"])).length;
      const status = classification.recognized ? "reconhecido" : "erro";
      const record = {
        id: `${Date.now()}-${file.filename}`,
        nomeArquivo: file.originalname,
        salvoComo: file.filename,
        type: classification.type,
        tipo: classification.label,
        linhas: rows.length,
        colunas: columns,
        aba: sheetName,
        status,
        mensagem: withoutCpf > 0
          ? `Esta planilha foi importada, mas ${withoutCpf} registros estao sem CPF Cliente. O sistema usara Nome Cliente + Nome Vendedor como chave alternativa.`
          : classification.message,
        importadoEm: new Date().toISOString()
      };
      competencia.arquivosImportados = competencia.arquivosImportados || [];
      competencia.arquivosImportados.push(record);
      if (classification.recognized) {
        competencia.rawData = competencia.rawData || {};
        competencia.rawData[classification.type] = [...(competencia.rawData[classification.type] || []), ...rows];
      }
      imported.push(record);
    } catch (error) {
      imported.push({
        id: `${Date.now()}-${file.filename}`,
        nomeArquivo: file.originalname,
        salvoComo: file.filename,
        type: "DESCONHECIDO",
        tipo: "Nao reconhecida",
        linhas: 0,
        colunas: [],
        status: "erro",
        mensagem: `Nao foi possivel ler este .xlsx: ${error.message}`,
        importadoEm: new Date().toISOString()
      });
    }
  }

  saveCompetencia(competencia);
  writeCompetenciaRawCache(competencia.id, competencia.rawData || {});
  clearConsolidatedCache(competencia.id);
  res.status(201).json({ importacoes: imported, fontes: expectedSheetStatus(competencia.arquivosImportados || []) });
}));

router.get("/importacoes", asyncHandler((req, res) => {
  const competencia = getCompetencia(req, res);
  if (!competencia) return;
  res.json({
    importacoes: competencia.arquivosImportados || [],
    fontes: expectedSheetStatus(competencia.arquivosImportados || [])
  });
}));

router.post("/consolidar", asyncHandler((req, res) => {
  console.time("consolidate competencia");
  const competencia = getCompetencia(req, res);
  if (!competencia) return;
  competencia.dadosConsolidados = consolidateCompetencia(competencia);
  competencia.ultimaConsolidacao = new Date().toISOString();
  saveCompetencia(competencia);
  writeConsolidatedCache(competencia.id, competencia.dadosConsolidados);
  console.timeEnd("consolidate competencia");
  res.json(competencia.dadosConsolidados);
}));

export default router;
