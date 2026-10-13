import type { Phase } from "../state/types.js";

export function Footer({
  phase,
  filesCount,
  selectedCount,
  planVarCount,
  onNavigate,
  onStartImport,
  onReset,
  onClose,
}: {
  phase: Phase;
  filesCount: number;
  selectedCount: number;
  planVarCount: number;
  onNavigate: (to: 1 | 2 | 3) => void;
  onStartImport: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  switch (phase.kind) {
    case "source":
      return (
        <div className="footer">
          <div className="spacer" />
          <button className="btn primary" disabled={filesCount === 0} onClick={() => onNavigate(2)}>
            Continue
          </button>
        </div>
      );
    case "sets":
      return (
        <div className="footer">
          <button className="btn" onClick={() => onNavigate(1)}>
            Back
          </button>
          <div className="spacer" />
          <span className="selcount">{selectedCount} sets selected</span>
          <button
            className="btn primary"
            disabled={selectedCount === 0}
            onClick={() => onNavigate(3)}
          >
            Preview import
          </button>
        </div>
      );
    case "preview":
      return (
        <div className="footer">
          <button className="btn" onClick={() => onNavigate(2)}>
            Back
          </button>
          <div className="spacer" />
          <button className="btn primary" disabled={planVarCount === 0} onClick={onStartImport}>
            Import {planVarCount} variables
          </button>
        </div>
      );
    case "importing":
      return (
        <div className="footer">
          <div className="spacer" />
          <div className="info">Importing… please keep the plugin open</div>
          <div className="spacer" />
        </div>
      );
    case "done":
      return (
        <div className="footer">
          <button className="btn" onClick={onReset}>
            Import another
          </button>
          <div className="spacer" />
          <button className="btn primary" onClick={onClose}>
            Close
          </button>
        </div>
      );
  }
}
