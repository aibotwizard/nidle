import { useState, type DragEvent } from "react";
import type { FileMeta } from "../state/appState.js";
import { readDataTransfer } from "../intake/dataTransfer.js";
import { DetectedCheckIcon, UploadIcon, UploadIconLarge } from "./shared/icons.js";

export function StepSource({
  files,
  onFilesPicked,
}: {
  files: FileMeta[];
  onFilesPicked: (list: FileList | File[]) => void;
}) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!e.dataTransfer) return;
    onFilesPicked(await readDataTransfer(e.dataTransfer));
  };

  const totalTokens = files.reduce((a, f) => a + f.tokens.length, 0);

  return (
    <div className="step-pad">
      <div className="h-title">Connect a token source</div>
      <div className="h-sub">
        Import a folder of W3C Design Token files (DTCG · 2025.10) and map them onto Figma
        variables.
      </div>
      <div className="seg">
        <button>
          {UploadIcon}
          Upload folder
        </button>
      </div>
      <label
        className={"dropzone" + (dragging ? " drag" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <div className="icon">{UploadIconLarge}</div>
        <div className="primary">Drop a token folder here</div>
        <div className="secondary">
          or <span className="link">browse files</span> — nested{" "}
          <span className="mono">.json</span> supported
        </div>
        <input
          type="file"
          multiple
          webkitdirectory=""
          onChange={(e) => {
            if (e.target.files) onFilesPicked(e.target.files);
          }}
        />
      </label>
      {files.length > 0 ? (
        <div className="detected">
          <div className="badge">{DetectedCheckIcon}</div>
          <div className="text">
            <b>
              {files.length} file{files.length === 1 ? "" : "s"} detected
            </b>{" "}
            <span className="dim">— {totalTokens} tokens</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
