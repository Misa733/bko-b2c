import express from "express";
import { readSettings } from "../storage/store.js";
import { getComplementarySheetsStatus, syncComplementarySheets } from "../services/complementarySheets.service.js";
import { asyncHandler, sendError } from "../utils/http.js";

const router = express.Router();

router.get("/status", asyncHandler((req, res) => {
  res.json(getComplementarySheetsStatus(readSettings()));
}));

router.post("/sync", asyncHandler(async (req, res) => {
  try {
    const settings = await syncComplementarySheets(readSettings());
    const sheets = getComplementarySheetsStatus(settings);
    res.json({
      success: sheets.every((sheet) => sheet.status === "sincronizada"),
      totalRows: sheets.reduce((sum, sheet) => sum + (sheet.totalRows || 0), 0),
      sheets
    });
  } catch (error) {
    sendError(res, error, error.status || 400, "Erro ao sincronizar planilhas complementares.");
  }
}));

export default router;
