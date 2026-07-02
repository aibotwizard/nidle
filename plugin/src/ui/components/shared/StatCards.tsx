export function StatCards({ items }: { items: { n: number | string; l: string }[] }) {
  return (
    <div className="stats">
      {items.map((s) => (
        <div key={s.l} className="stat">
          <div className="n">{s.n}</div>
          <div className="l">{s.l}</div>
        </div>
      ))}
    </div>
  );
}
