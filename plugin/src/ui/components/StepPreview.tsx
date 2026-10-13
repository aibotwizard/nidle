import { Fragment } from "react";
import { warningLine } from "../state/diagnostics.js";
import type { Diagnostics } from "../state/types.js";
import type { CollectionName, VariableOp, VariablePlan } from "../../shared/mapping/types.js";
import { CollectionIcon } from "./shared/icons.js";
import { StatCards } from "./shared/StatCards.js";
import { VariableRow } from "./shared/VariableRow.js";

const PREVIEW_PER_COLLECTION = 100;
const WARNING_PREVIEW = 8;

export function StepPreview({
  plan,
  selectedCount,
  diagnostics,
}: {
  plan: VariablePlan;
  selectedCount: number;
  diagnostics: Diagnostics;
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
      <WarningPanel list={diagnostics.dropped} />
      <NoticePanel kinds={diagnostics.notices} />
    </div>
  );
}

/**
 * Dropped tokens, per token: these are what the import will lose, so the
 * name of every one of them matters.
 */
function WarningPanel({ list }: { list: Diagnostics["dropped"] }) {
  if (list.length === 0) return null;
  return (
    <div className="warnings">
      <div className="warnings-head">
        {list.length} parse warning{list.length === 1 ? "" : "s"}
      </div>
      {list.slice(0, WARNING_PREVIEW).map((pw, i) => (
        <div key={i} className="warning-ln">
          {warningLine(pw)}
        </div>
      ))}
      {list.length > WARNING_PREVIEW ? (
        <div className="warning-ln">…and {list.length - WARNING_PREVIEW} more</div>
      ) : null}
    </div>
  );
}

/**
 * Conversions and theme fills, one line per kind. Each token imported, so
 * the interesting unit is the kind and its count — thirty near-identical
 * lines say no more than two do. Per-token detail stays on the Step 4
 * console, which keeps the constitution §3.2 promise that nothing is
 * silent.
 */
function NoticePanel({ kinds }: { kinds: Diagnostics["notices"] }) {
  if (kinds.length === 0) return null;
  const total = kinds.reduce((a, k) => a + k.count, 0);
  return (
    <div className="warnings notes">
      <div className="warnings-head">
        {total} notice{total === 1 ? "" : "s"}
      </div>
      {kinds.map(({ kind, count }) => (
        <div key={kind} className="warning-ln">
          {count}× {kind}
        </div>
      ))}
      <div className="warning-ln">Per-token detail in the import console.</div>
    </div>
  );
}
