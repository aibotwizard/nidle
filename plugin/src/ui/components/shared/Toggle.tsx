export function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button className={"toggle" + (on ? " on" : "")} onClick={() => onChange(!on)}>
      <span className="knob" />
    </button>
  );
}
