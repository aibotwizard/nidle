import { Fragment } from "react";
import type { Step } from "../state/appState.js";
import { StepCheckIcon } from "./shared/icons.js";

const LABELS = ["Source", "Sets", "Preview", "Import"];
const BLUE = "#0d99ff";

export function Stepper({ step }: { step: Step }) {
  return (
    <div className="stepper">
      {LABELS.map((label, i) => {
        const n = i + 1;
        const done = step > n;
        const active = step === n;
        return (
          <Fragment key={label}>
            {i > 0 ? (
              <div className="line" style={{ background: step >= n ? BLUE : "#444" }} />
            ) : null}
            <div className="step">
              <div
                className="circle"
                style={{
                  background: done || active ? BLUE : "transparent",
                  color: done || active ? "#fff" : "#808080",
                  boxShadow: `inset 0 0 0 1.5px ${done || active ? BLUE : "#555"}`,
                }}
              >
                {done ? StepCheckIcon : String(n)}
              </div>
              <div
                className="label"
                style={{ color: active ? "#fff" : done ? "#b3b3b3" : "#808080" }}
              >
                {label}
              </div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
