import { useRef } from "react";
import { openFile, useStore } from "../store";

export function DropZone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const restoring = useStore((s) => s.restoring);

  if (restoring) {
    return (
      <div className="dropzone">
        <div className="dropzone-inner">
          <span className="spinner large" />
          <p>Restoring your workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dropzone" onClick={() => inputRef.current?.click()}>
      <div className="dropzone-inner">
        <div className="dropzone-icon">⬢</div>
        <h2>Drop an STL file anywhere</h2>
        <p className="muted">or click to browse — binary and ASCII STL supported</p>
        <input
          ref={inputRef}
          type="file"
          accept=".stl"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void openFile(file);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
