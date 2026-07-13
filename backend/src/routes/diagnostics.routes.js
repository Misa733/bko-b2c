import express from "express";
import { diagnoseInternalBases, buildCrossTest } from "../services/diagnostics.service.js";
import { asyncHandler } from "../utils/http.js";

const router = express.Router();

router.get("/internal-bases", asyncHandler((req, res) => {
  res.json(diagnoseInternalBases());
}));

router.get("/cross-test/:id", asyncHandler((req, res) => {
  res.json(buildCrossTest(req.params.id));
}));

export default router;
