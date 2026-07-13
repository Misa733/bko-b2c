export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function errorPayload(error, fallbackMessage = "Erro inesperado.") {
  return {
    success: false,
    message: error?.message || fallbackMessage,
    details: error?.details || error?.stack || ""
  };
}

export function sendError(res, error, status = 400, fallbackMessage = "Erro inesperado.") {
  return res.status(error?.status || status).json(errorPayload(error, fallbackMessage));
}
