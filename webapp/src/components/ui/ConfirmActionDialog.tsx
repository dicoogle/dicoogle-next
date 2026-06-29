import { Trash2, Eraser } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

type ActionKind = "unindex" | "remove";

interface ConfirmActionDialogProps {
  open: boolean;
  action: ActionKind;
  level: "study" | "series" | "instance";
  description: string;
  fileCount?: number;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

const ACTION_CONFIG = {
  unindex: {
    title: "Unindex",
    icon: Eraser,
    iconClass: "text-amber-500",
    bgClass: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
    message:
      "This will remove the data from the search index. The files will remain on disk but will no longer appear in search results. This operation can be reversed by re-indexing the files.",
    confirmLabel: "Unindex",
    confirmVariant: "outline-solid" as const,
  },
  remove: {
    title: "Remove",
    icon: Trash2,
    iconClass: "text-destructive",
    bgClass: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
    message:
      "This will permanently delete the files from disk AND remove them from the search index. This operation is irreversible and data cannot be recovered.",
    confirmLabel: "Remove",
    confirmVariant: "destructive" as const,
  },
} as const;

const LEVEL_LABEL: Record<string, string> = {
  study: "Study",
  series: "Series",
  instance: "Instance",
};

export function ConfirmActionDialog({
  open,
  action,
  level,
  description,
  fileCount,
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmActionDialogProps) {
  const config = ACTION_CONFIG[action];
  const Icon = config.icon;

  return (
    <Dialog open={open} onClose={onCancel} title={`Confirm ${config.title}`} size="sm">
      <div className="p-6 space-y-4">
        {/* Warning banner */}
        <div className={`flex gap-3 p-4 rounded-lg border ${config.bgClass}`}>
          <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${config.iconClass}`} />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              {LEVEL_LABEL[level]} level {config.title}
            </p>
            <p className="text-sm text-muted-foreground">{config.message}</p>
          </div>
        </div>

        {/* Scope details */}
        <div className="text-sm text-muted-foreground space-y-1">
          <p>
            <span className="font-medium text-foreground">{LEVEL_LABEL[level]}:</span>{" "}
            {description}
          </p>
          {fileCount !== undefined && (
            <p>
              <span className="font-medium text-foreground">Files:</span>{" "}
              {fileCount} {fileCount === 1 ? "file" : "files"} will be affected
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={config.confirmVariant}
            size="sm"
            onClick={onConfirm}
            disabled={loading}
          >
            <Icon className="w-4 h-4 mr-1.5" />
            {loading ? `${config.title}...` : config.confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
