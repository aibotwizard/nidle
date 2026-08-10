import type { FileMeta } from "../state/appState.js";
import { FileIcon, FolderIcon, StepCheckIcon } from "./shared/icons.js";

export function StepSets({
  files,
  onToggleFile,
}: {
  files: FileMeta[];
  onToggleFile: (path: string) => void;
}) {
  const groups = new Map<string, FileMeta[]>();
  for (const f of files) {
    const list = groups.get(f.folder) ?? [];
    list.push(f);
    groups.set(f.folder, list);
  }

  return (
    <div className="step-pad">
      <div className="h-title">Select token sets</div>
      <div className="h-sub">
        Files in <span className="mono">core/</span> become Primitives,{" "}
        <span className="mono">semantic/</span> Semantic,{" "}
        <span className="mono">components/</span> Components. Sibling files with matching shape
        become modes.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {[...groups].map(([folder, group]) => (
          <div key={folder}>
            <div className="group-header">
              {FolderIcon}
              <span className="name mono">{folder === "(root)" ? "./" : folder + "/"}</span>
            </div>
            <div className="file-list">
              {group.map((f) => (
                <div
                  key={f.path}
                  className={"file-row" + (f.selected ? " checked" : "")}
                  onClick={() => onToggleFile(f.path)}
                >
                  <div className="box">{f.selected ? StepCheckIcon : null}</div>
                  {FileIcon}
                  <div className="name mono">{f.name}</div>
                  <div className="count">{f.tokens.length}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
