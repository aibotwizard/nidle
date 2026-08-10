import { useEffect, useRef } from "react";
import type { LogTone } from "../../../code/messages.js";
import type { LogLine } from "../../state/appState.js";

function toneColor(t: LogTone): string {
  return {
    dim: "#7a7a7a",
    plain: "#c4c4c4",
    accent: "#b9a6ff",
    ok: "#3dd07e",
    err: "#ff8b8b",
  }[t];
}

export function ConsoleLog({ log }: { log: LogLine[] }) {
  const ref = useRef<HTMLDivElement>(null);

  // The vanilla UI got scroll-to-bottom for free by rebuilding the DOM;
  // React keeps the node alive, so pin it explicitly on new lines.
  useEffect(() => {
    const node = ref.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [log.length]);

  return (
    <div className="console" ref={ref}>
      {log.map((ln, i) => (
        <div key={i} className="ln" style={{ color: toneColor(ln.tone) }}>
          <span className="arr">›</span>
          <span>{ln.text}</span>
        </div>
      ))}
    </div>
  );
}
