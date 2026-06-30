import { useState, useCallback, useMemo } from "react";
import { useSearchStore } from "@/stores/SearchStore";
import { dicoogleService } from "@/services/dicoogleService";
import { toast } from "@/utils/toast";
import type { Study, Series, Image } from "@/types";

type ActionLevel = "study" | "series" | "instance";

interface UseEntryActionsOptions {
  level: ActionLevel;
  study: Study;
  series?: Series;
  image?: Image;
}

interface UseEntryActionsResult {
  openDialog: boolean;
  pendingAction: "unindex" | "remove" | null;
  description: string;
  fileCount: number;
  loading: boolean;
  handleUnindex: () => void;
  handleRemove: () => void;
  handleConfirm: () => void;
  handleCancel: () => void;
}

function collectImageUris(images: Image[]): string[] {
  return images.map((img) => img.uri).filter((uri): uri is string => !!uri);
}

export function useEntryActions({
  level,
  study,
  series,
  image,
}: UseEntryActionsOptions): UseEntryActionsResult {
  const [openDialog, setOpenDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<"unindex" | "remove" | null>(null);
  const [loading, setLoading] = useState(false);

  const { search, query } = useSearchStore();

  const uris = useMemo(() => {
    if (level === "instance" && image) {
      return collectImageUris([image]);
    }
    if (level === "series" && series) {
      return collectImageUris(series.images || []);
    }
    // study level: collect from all series in the study
    const allImages = useSearchStore.getState().series
      .filter((s) => s.studyInstanceUID === study.studyInstanceUID)
      .flatMap((s) => s.images || []);
    return collectImageUris(allImages);
  }, [level, study.studyInstanceUID, series, image]);

  const description = useMemo(() => {
    if (level === "instance" && image) {
      return `SOP Instance UID: ${image.sopInstanceUID}`;
    }
    if (level === "series" && series) {
      return `Series #${series.seriesNumber || "?"} — ${series.seriesDescription || "No description"}`;
    }
    return `${study.patientName || "Unknown"} — ${study.studyDescription || "No description"}`;
  }, [level, study, series, image]);

  const fileCount = uris.length;

  const handleUnindex = useCallback(() => {
    setPendingAction("unindex");
    setOpenDialog(true);
  }, []);

  const handleRemove = useCallback(() => {
    setPendingAction("remove");
    setOpenDialog(true);
  }, []);

  const handleCancel = useCallback(() => {
    setOpenDialog(false);
    setPendingAction(null);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!pendingAction || uris.length === 0) return;

    setLoading(true);
    try {
      if (pendingAction === "remove") {
        await dicoogleService.unindex(uris);
        await dicoogleService.remove(uris);
        toast.success(`Successfully unindexed and removed ${fileCount} file(s).`);
      } else {
        await dicoogleService.unindex(uris);
        toast.success(`Successfully unindexed ${fileCount} file(s).`);
      }

      setOpenDialog(false);
      setPendingAction(null);

      if (query) {
        search({ query });
      }
    } catch (error: any) {
      toast.error(error?.message || `Failed to ${pendingAction} files.`);
    } finally {
      setLoading(false);
    }
  }, [pendingAction, uris, fileCount, query, search]);

  return {
    openDialog,
    pendingAction,
    description,
    fileCount,
    loading,
    handleUnindex,
    handleRemove,
    handleConfirm,
    handleCancel,
  };
}
