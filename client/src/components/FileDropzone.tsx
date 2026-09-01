import { useRef, useState, type DragEvent } from "react";
import { Box, Button, Typography } from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";

interface FileDropzoneProps { onFile: (file: File) => void; disabled?: boolean; }

const isPdf = (file: File): boolean =>
  file.type === "application/pdf" || /\.pdf$/i.test(file.name);

export const FileDropzone = ({ onFile, disabled = false }: FileDropzoneProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState(false);

  const handleFile = (file: File) => {
    if (!isPdf(file)) {
      setRejected(true);
      return;
    }
    setRejected(false);
    onFile(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <Box
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      sx={{
        border: "2px dashed", borderColor: dragging ? "primary.main" : "divider",
        borderRadius: 2, p: 5, textAlign: "center", mb: 3,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <UploadFileIcon fontSize="large" color="action" />
      <Typography sx={{ my: 1 }}>Arrastrá el PDF del resumen o</Typography>
      <Button variant="contained" disabled={disabled} onClick={() => inputRef.current?.click()}>
        Elegir archivo
      </Button>
      {rejected && (
        <Typography color="error" variant="body2" sx={{ mt: 2 }}>
          Sólo se aceptan archivos PDF
        </Typography>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
    </Box>
  );
};
