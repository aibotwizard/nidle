import type { ImportPhase, LogLine } from "../state/types.js";
import { DoneCheckIcon, SpinnerIcon } from "./shared/icons.js";
import { ConsoleLog } from "./shared/ConsoleLog.js";

export function StepImport({
  phase,
  warnings,
  log,
}: {
  phase: ImportPhase;
  warnings: number;
  log: LogLine[];
}) {
  const result = phase.kind === "done" ? phase.result : undefined;
  const errors = result?.errors.length ?? 0;
  return (
    <div className="step-pad">
      {phase.kind === "importing" ? (
        <>
          <div className="run-center">
            <div className="run-spinner">{SpinnerIcon}</div>
            <div className="run-title">Creating variables…</div>
            <div className="run-pct">{phase.progress}% complete</div>
          </div>
          <div className="progressbar">
            <div className="fill" style={{ width: `${phase.progress}%` }} />
          </div>
        </>
      ) : (
        <>
          <div className="done-center">
            <div className="done-icon">{DoneCheckIcon}</div>
            <div className="done-title">Import complete</div>
            <div className="done-sub">Variables are now live in your Figma file.</div>
          </div>
          <div className="done-stats">
            <div className="cell">
              <div className="big" style={{ color: "#3dd07e" }}>
                {result?.created ?? 0}
              </div>
              <div className="lbl">
                variables
                <br />
                created
              </div>
            </div>
            <div className="cell">
              <div className="big" style={{ color: "#5cb8ff" }}>
                {result?.updated ?? 0}
              </div>
              <div className="lbl">
                variables
                <br />
                updated
              </div>
            </div>
            <div className="cell">
              <div className="big" style={{ color: errors ? "#ff8b8b" : "#6b6b6b" }}>
                {errors}
              </div>
              <div className="lbl">
                errors
                <br />
                skipped
              </div>
            </div>
            <div className="cell">
              <div className="big" style={{ color: warnings ? "#ff8b8b" : "#6b6b6b" }}>
                {warnings}
              </div>
              <div className="lbl">
                parse
                <br />
                warnings
              </div>
            </div>
          </div>
        </>
      )}
      <div className="console-label">CONSOLE</div>
      <ConsoleLog log={log} />
    </div>
  );
}
