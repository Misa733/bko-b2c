import express from "express";
import { readSettings, writeSettings } from "../storage/store.js";
import { getComplementarySheetsStatus, syncComplementarySheets } from "../services/complementarySheets.service.js";
import { asyncHandler } from "../utils/http.js";

const router = express.Router();

router.get("/", asyncHandler((req, res) => {
  const settings = readSettings();
  res.json({
    ...settings,
    planilhasComplementaresStatus: getComplementarySheetsStatus(settings)
  });
}));

router.put("/planilhas-complementares", asyncHandler((req, res) => {
  const settings = readSettings();
  const urls = req.body?.planilhasComplementares || [];
  settings.planilhasComplementares = (settings.planilhasComplementares || []).map((sheet, index) => ({
    ...sheet,
    url: urls[index]?.url || ""
  }));
  writeSettings(settings);
  res.json(settings);
}));

router.post("/planilhas-complementares/sincronizar", async (req, res, next) => {
  try {
    const synced = await syncComplementarySheets(readSettings());
    res.json(synced);
  } catch (error) {
    res.status(error.status || 400).json({
      success: false,
      message: error.message || "Erro ao sincronizar planilhas complementares.",
      details: error.details || null
    });
  }
});

export default router;
