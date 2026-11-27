import { cn, type QueryFilterProps } from "@dicoogle/dicoogle-next-webapp";

const MODALITIES = ["CT", "MR", "US", "CR", "DX", "MG", "PT", "NM", "XA", "OT"];

export function ModalityFilter({ value, onChange }: QueryFilterProps) {
  const selected: string | null = typeof value === "string" ? value : null;

  return (
    <div className="flex flex-wrap gap-2">
      {MODALITIES.map((modality) => (
        <button
          key={modality}
          type="button"
          aria-pressed={selected === modality}
          onClick={() => onChange(selected === modality ? null : modality)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            selected === modality
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border hover:bg-muted",
          )}
        >
          {modality}
        </button>
      ))}
      {selected && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="px-2 text-xs text-muted-foreground hover:underline"
        >
          Clear
        </button>
      )}
    </div>
  );
}
