import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import competenciasRoutes from "./routes/competencias.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import configRoutes from "./routes/config.routes.js";
import googleSheetsRoutes from "./routes/googleSheets.routes.js";
import complementarySheetsRoutes from "./routes/complementarySheets.routes.js";
import diagnosticsRoutes from "./routes/diagnostics.routes.js";
import { logGoogleSheetsDiagnostics } from "./services/googleSheets.service.js";
import { ensureStorageDirs, storageDir } from "./storage/store.js";
import { errorPayload } from "./utils/http.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: false });

const app = express();
const port = process.env.PORT || 3333;
const uploadDir = path.resolve(__dirname, "../uploads");
const rootEnvPath = path.resolve(__dirname, "../../.env");
const backendEnvPath = path.resolve(__dirname, "../.env");

process.on("uncaughtException", (error) => {
  console.error("[uncaughtException]", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

ensureStorageDirs();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    timestamp: new Date().toISOString(),
    port: Number(port)
  });
});

app.use("/api/competencias", competenciasRoutes);
app.use("/api/competencias/:id", uploadRoutes);
app.use("/api/competencias/:id", dashboardRoutes);
app.use("/api/configuracoes", configRoutes);
app.use("/api/google-sheets", googleSheetsRoutes);
app.use("/api/complementary-sheets", complementarySheetsRoutes);
app.use("/api/diagnostics", diagnosticsRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Rota nao encontrada.",
    details: `${req.method} ${req.originalUrl}`
  });
});

app.use((err, req, res, next) => {
  if (err) {
    console.error(`[Express Error] ${req.method} ${req.originalUrl}`, err);
    return res.status(err.status || 500).json(errorPayload(err, "Erro inesperado no backend."));
  }
  next();
});

const server = app.listen(port, () => {
  console.log(`API Cockpit Comercial B2C rodando em http://localhost:${port}`);
  console.log(`[Bootstrap] Porta: ${port}`);
  console.log(`[Bootstrap] Pasta uploads: ${uploadDir}`);
  console.log(`[Bootstrap] Pasta storage: ${storageDir}`);
  console.log(`[Bootstrap] .env raiz carregado: ${fs.existsSync(rootEnvPath) ? "sim" : "nao"}`);
  console.log(`[Bootstrap] .env backend carregado: ${fs.existsSync(backendEnvPath) ? "sim" : "nao"}`);
  logGoogleSheetsDiagnostics().catch((error) => {
    console.log(`[Google Sheets] Falha ao executar diagnostico: ${error.message}`);
  });
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`[Bootstrap] Porta ${port} ja esta em uso. Encerre o backend duplicado ou configure outra porta.`);
    process.exitCode = 1;
    setTimeout(() => process.exit(1), 100);
    return;
  }
  console.error("[Bootstrap] Falha ao iniciar servidor", error);
});
