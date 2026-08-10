import { Fragment } from "react";
import type { ModeValue, ValueSpec, VariableOp } from "../../../shared/mapping/toFigma.js";

function RowIcon({
  type,
  sample,
}: {
  type: "COLOR" | "FLOAT";
  sample: ValueSpec | undefined;
}) {
  if (type === "COLOR" && sample?.kind === "literal") {
    return <span className="swatch" style={{ background: String(sample.value) }} />;
  }
  return <span className="hash">{sample?.kind === "alias" ? "→" : "#"}</span>;
}

function ModeValueSpan({
  mv,
  type,
  showModeTag,
}: {
  mv: ModeValue;
  type: "COLOR" | "FLOAT";
  showModeTag: boolean;
}) {
  return (
    <>
      {showModeTag ? <span className="mode-tag">{mv.mode}</span> : null}
      {mv.value.kind === "alias" ? (
        <span className="alias-ref">→ {mv.value.targetName}</span>
      ) : (
        <>
          {type === "COLOR" ? (
            <span className="swatch-sm" style={{ background: String(mv.value.value) }} />
          ) : null}
          {String(mv.value.value)}
        </>
      )}
    </>
  );
}

export function VariableRow({
  op,
  showModeTags,
}: {
  op: VariableOp;
  showModeTags: boolean;
}) {
  return (
    <div className="var-row">
      <RowIcon type={op.resolvedType} sample={op.values[0]?.value} />
      <div className="n mono">{op.name}</div>
      <div className="spacer" />
      <div className="v mono">
        {op.values.map((mv, i) => (
          <Fragment key={mv.mode}>
            {i > 0 ? " · " : null}
            <ModeValueSpan mv={mv} type={op.resolvedType} showModeTag={showModeTags} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}
