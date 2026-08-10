import { Fragment } from "react";
import type { CollectionName, VariableOp, VariablePlan } from "../../shared/mapping/toFigma.js";
import { CollectionIcon } from "./shared/icons.js";
import { StatCards } from "./shared/StatCards.js";
import { VariableRow } from "./shared/VariableRow.js";

const PREVIEW_PER_COLLECTION = 100;
const WARNING_PREVIEW = 8;

export function StepPreview({
  plan,
  selectedCount,
}: {
  plan: VariablePlan;
  selectedCount: number;
}) {
  const totalModes = plan.collections.reduce((a, c) => a + c.modes.length, 0);

  const byCollection = new Map<CollectionName, VariableOp[]>();
  for (const v of plan.variables) {
    const list = byCollection.get(v.collection) ?? [];
    list.push(v);
    byCollection.set(v.collection, list);
  }

  return (
    <div className="step-pad">
      <StatCards
        items={[
          { n: plan.variables.length, l: "Variables" },
          { n: plan.collections.length, l: "Collections" },
          { n: totalModes, l: "Modes" },
          { n: selectedCount, l: "Files" },
        ]}
      />
      {plan.collections.map((cplan) => {
        const vars = byCollection.get(cplan.name) ?? [];
        return (
          <Fragment key={cplan.name}>
            <div className="collection">
              <div className="collection-head">
                {CollectionIcon}
                <span className="n">{cplan.name}</span>
                <div className="spacer" />
                <span className="mode-chips">
                  {cplan.modes.map((m) => (
                    <span key={m} className="mode-chip">
                      {m}
                    </span>
                  ))}
                </span>
                <span className="count">{vars.length}</span>
              </div>
              <div>
                {vars.slice(0, PREVIEW_PER_COLLECTION).map((v) => (
                  <VariableRow key={v.name} op={v} showModeTags={cplan.modes.length > 1} />
                ))}
              </div>
            </div>
            {vars.length > PREVIEW_PER_COLLECTION ? (
              <div className="h-sub" style={{ marginTop: "4px", marginBottom: "12px" }}>
                Showing first {PREVIEW_PER_COLLECTION} of {vars.length} in {cplan.name}. All will
                be imported.
              </div>
            ) : null}
          </Fragment>
        );
      })}
      {plan.warnings.length > 0 ? (
        <div className="warnings">
          <div className="warnings-head">
            {plan.warnings.length} parse warning{plan.warnings.length === 1 ? "" : "s"}
          </div>
          {plan.warnings.slice(0, WARNING_PREVIEW).map((pw, i) => (
            <div key={i} className="warning-ln">
              {pw.file} · {pw.path} — {pw.reason}
            </div>
          ))}
          {plan.warnings.length > WARNING_PREVIEW ? (
            <div className="warning-ln">…and {plan.warnings.length - WARNING_PREVIEW} more</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
