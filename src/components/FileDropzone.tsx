import { useRef, useState } from "react";

interface FileDropzoneProps {
  busy: boolean;
  onFileSelect: (file: File) => void;
}

export function FileDropzone({ busy, onFileSelect }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  function accept(fileList: FileList | null) {
    const file = fileList?.[0];
    if (file) {
      onFileSelect(file);
    }
  }

  return (
    <section className="panel upload-panel">
      <div className="panel-heading">
        <p className="eyebrow">Step 1</p>
        <h2>Upload TIFF</h2>
        <p className="panel-copy">
          Drop a 2-, 3-, or 4-channel scientific TIFF file here, or browse from disk.
        </p>
      </div>
      <button
        type="button"
        className={dragging ? "dropzone dragging" : "dropzone"}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          accept(event.dataTransfer.files);
        }}
        disabled={busy}
      >
        <span>{busy ? "Loading TIFF..." : "Drop TIFF or click to browse"}</span>
        <small>Supported storage: uint8 and uint16</small>
      </button>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept=".tif,.tiff"
        onChange={(event) => accept(event.target.files)}
      />
    </section>
  );
}
