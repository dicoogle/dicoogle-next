import { useState, useEffect } from "react";
import { dicoogleService } from "@/services/dicoogleService";
import type { DICOMAttribute } from "@/types";

export interface MetadataState {
  metadata: DICOMAttribute | null;
  loading: boolean;
  error: string | null;
}

export function useMetadata(
  sopInstanceUID: string | null,
  shouldFetch: boolean = true,
): MetadataState {
  const [metadata, setMetadata] = useState<DICOMAttribute | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadMetadata = async () => {
      if (!sopInstanceUID || !shouldFetch) {
        setMetadata(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const dump = await dicoogleService.getDICOMMetadata(sopInstanceUID);
        setMetadata(dump.results);
      } catch (err: any) {
        setMetadata(null);
        setError(err?.message || "Failed to load metadata");
      } finally {
        setLoading(false);
      }
    };

    loadMetadata();
  }, [sopInstanceUID, shouldFetch]);

  return { metadata, loading, error };
}
