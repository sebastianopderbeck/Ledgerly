import { useRef, useState, type DragEvent } from "react";
import { Box, Button, Typography } from "@mui/material";
import { MAX_UPLOAD_BYTES, UPLOAD_TOO_LARGE } from "@ledgerly/shared";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { useIsMobile } from "../useIsMobile.js";

interface FileDropzoneProps { onFile: (file: File) => void; disabled?: boolean; }

const PICKER_TYPES = ["application/pdf", "image/png", "image/jpeg"];
const ACCEPTED_TYPES = [...PICKER_TYPES, "image/heic"];
const ACCEPTED_EXTENSIONS = /\.(pdf|png|jpe?g|heic)$/i;
const UNSUPPORTED_FILE = "Sólo se aceptan PDF o imágenes (PNG, JPG, HEIC)";

const isAccepted = (file: File): boolean =>
  ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXTENSIONS.test(file.name);

export const FileDropzone = ({ onFile, disabled = false }: FileDropzoneProps) => {
  const isMobile = useIsMobile();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (file: File) => {
    if (!isAccepted(file)) {
      setError(UNSUPPORTED_FILE);
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(UPLOAD_TOO_LARGE);
      return;
    }
    setError(null);
    onFile(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const errorText = error ? <Typography color="error" variant="body2" sx={{ mt: 2 }}>{error}</Typography> : null;

  return (
    <Box
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      sx={{
        border: "2px dashed", borderColor: dragging ? "primary.main" : "divider",
        borderRadius: 2, p: { xs: 3, md: 5 }, textAlign: "center", mb: 3,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <UploadFileIcon fontSize="large" color="action" />
      {!isMobile && <Typography sx={{ my: 1 }}>Arrastrá el PDF o la captura del crédito</Typography>}
      <Button
        variant="contained"
        disabled={disabled}
        fullWidth={isMobile}
        onClick={() => inputRef.current?.click()}
        sx={{ mt: { xs: 1, md: 0 } }}
      >
        Elegir archivo
      </Button>
      {errorText}
      <input
        ref={inputRef}
        type="file"
        accept={PICKER_TYPES.join(",")}
        hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
    </Box>
  );
};
