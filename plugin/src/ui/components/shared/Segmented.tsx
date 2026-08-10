export type SegmentedOption = { id: string; label: string };

export function Segmented({
  options,
  value,
  onChange,
}: {
  options: SegmentedOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="seg-settings">
      {options.map((o) => (
        <button
          key={o.id}
          className={"seg-btn" + (o.id === value ? " active" : "")}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
