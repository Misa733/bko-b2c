import { UploadCloud } from "lucide-react";

export default function UploadBox({ onFiles }) {
  return (
    <label className="upload-box">
      <UploadCloud size={32} />
      <strong>Enviar planilhas .xlsx</strong>
      <span>Selecione um ou mais arquivos exportados da Brisa/Looker Studio</span>
      <input type="file" multiple accept=".xlsx" onChange={(event) => onFiles(event.target.files)} />
    </label>
  );
}
