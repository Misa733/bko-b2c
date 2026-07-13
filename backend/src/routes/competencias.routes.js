import express from "express";
import { randomUUID } from "crypto";
import { readCompetencias, saveCompetencia, writeCompetencias } from "../storage/store.js";
import { asyncHandler } from "../utils/http.js";

const router = express.Router();

router.get("/", asyncHandler((req, res) => {
  const competencias = readCompetencias().map(({ rawData, dadosConsolidados, ...item }) => item);
  res.json(competencias);
}));

router.post("/", asyncHandler((req, res) => {
  const competencia = {
    id: randomUUID(),
    nome: req.body.nome,
    dataInicio: req.body.dataInicio,
    dataFim: req.body.dataFim,
    observacao: req.body.observacao || "",
    criadoEm: new Date().toISOString(),
    arquivosImportados: [],
    rawData: {},
    dadosConsolidados: null
  };
  if (!competencia.nome || !competencia.dataInicio || !competencia.dataFim) {
    return res.status(400).json({ success: false, message: "Informe nome, data inicial e data final da competencia.", details: "" });
  }
  saveCompetencia(competencia);
  res.status(201).json(competencia);
}));

router.get("/:id", asyncHandler((req, res) => {
  const competencia = readCompetencias().find((item) => item.id === req.params.id);
  if (!competencia) return res.status(404).json({ success: false, message: "Competencia nao encontrada.", details: "" });
  res.json(competencia);
}));

router.delete("/:id", asyncHandler((req, res) => {
  const next = readCompetencias().filter((item) => item.id !== req.params.id);
  writeCompetencias(next);
  res.status(204).send();
}));

export default router;
