import type { HeatCell } from '@habit/core/heatmap';

export function Heatmap({ cells }: { cells: HeatCell[] }) {
  return (
    <div className="heatmap" role="img" aria-label="Completion heatmap, last 26 weeks">
      {cells.map((cell) => (
        <span key={cell.date} className={`cell l${cell.level}`} title={cell.date} />
      ))}
    </div>
  );
}
