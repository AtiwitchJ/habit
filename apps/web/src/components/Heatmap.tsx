import type { HeatCell } from '@habit/core/heatmap';
import type { Hue } from '@habit/core/repo';

export function Heatmap({ cells, hue = 'green' }: { cells: HeatCell[]; hue?: Hue }) {
  return (
    <div className={`heatmap hue-${hue}`} role="img" aria-label="Completion heatmap, last 26 weeks">
      {cells.map((cell) => (
        <span key={cell.date} className={`cell l${cell.level}`} title={cell.date} />
      ))}
    </div>
  );
}
