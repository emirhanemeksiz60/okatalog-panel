export function LoadingScreen({ label = "Yükleniyor…" }: { label?: string }) {
  return (
    <div className="flex min-h-[200px] flex-1 items-center justify-center p-8">
      <div className="flex flex-col items-center gap-3 text-slate-600">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-sky-600"
          aria-hidden
        />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}
