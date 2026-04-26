type Props = {
  etiket: string;
  guncel: number;
  limit: number;
};

export function UsageBar({ etiket, guncel, limit }: Props) {
  const m = limit > 0 ? limit : 1;
  const yuz = Math.min(100, (guncel / m) * 100);
  return (
    <div className="mb-3">
      <div className="mb-0.5 flex items-center justify-between text-xs text-slate-400">
        <span>{etiket}</span>
        <span className="font-mono tabular-nums text-slate-300">
          {guncel} / {limit}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-2.5 min-w-0 rounded-full bg-amber-500 transition-all"
          style={{ width: `${yuz}%` }}
        />
      </div>
    </div>
  );
}
