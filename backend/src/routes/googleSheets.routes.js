import express from "express";
import { COMPLEMENTARY_SHEETS } from "../services/complementarySheets.service.js";
import { diagnoseGoogleSheetsAuth, extractSpreadsheetId, testGoogleSheetsConnection } from "../services/googleSheets.service.js";
import { asyncHandler, sendError } from "../utils/http.js";

const router = express.Router();

router.get("/health", asyncHandler(async (req, res) => {
  const spreadsheetId = extractSpreadsheetId(req.query.spreadsheetId || COMPLEMENTARY_SHEETS[0]?.url);
  const result = await diagnoseGoogleSheetsAuth({ checkApis: Boolean(spreadsheetId), spreadsheetId });
  res.status(result.googleAuthConfigured ? 200 : 400).json(result);
}));

router.post("/test", asyncHandler(async (req, res) => {
  try {
    const result = await testGoogleSheetsConnection({
      spreadsheetUrl: req.body?.spreadsheetUrl,
      spreadsheetId: req.body?.spreadsheetId,
      sheetName: req.body?.sheetName
    });
    res.json(result);
  } catch (error) {
    sendError(res, error, error.status || 500, "Erro inesperado ao testar Google Sheets.");
  }
}));

export default router;
