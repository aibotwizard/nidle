import type { Step } from "../state/appState.js";

export function Footer({
  step,
  filesCount,
  selectedCount,
  planVarCount,
  importing,
  done,
  onBack,
  onNext,
  onStartImport,
  onReset,
  onClose,
}: {
  step: Step;
  filesCount: number;
  selectedCount: number;
  planVarCount: number;
  importing: boolean;
  done: boolean;
  onBack: () => void;
  onNext: () => void;
  onStartImport: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  if (step < 4) {
    const primary =
      step === 1
        ? { label: "Continue", disabled: filesCount === 0, onClick: onNext }
        : step === 2
          ? { label: "Preview import", disabled: selectedCount === 0, onClick: onNext }
          : {
              label: `Import ${planVarCount} variables`,
              disabled: planVarCount === 0,
              onClick: onStartImport,
            };
    return (
      <div className="footer">
        {step === 2 || step === 3 ? (
          <button className="btn" onClick={onBack}>
            Back
          </button>
        ) : null}
        <div className="spacer" />
        {step === 2 ? <span className="selcount">{selectedCount} sets selected</span> : null}
        <button className="btn primary" disabled={primary.disabled} onClick={primary.onClick}>
          {primary.label}
        </button>
      </div>
    );
  }
  if (importing) {
    return (
      <div className="footer">
        <div className="spacer" />
        <div className="info">Importing… please keep the plugin open</div>
        <div className="spacer" />
      </div>
    );
  }
  if (done) {
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
  return <div className="footer" />;
}
