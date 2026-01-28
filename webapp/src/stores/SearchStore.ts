import { create } from "zustand";
import { dicoogleService } from "@/services/dicoogleService";
import type { SearchQuery, SearchResult, Study, Series, Image } from "@/types";

interface SearchState {
  results: SearchResult[];
  studies: Study[];
  series: Series[];
  loading: boolean;
  error: string | null;
  selectedStudy: Study | null;
  selectedSeries: Series[];
  query: string;
  elapsedTime: number;

  // Actions
  search: (query: SearchQuery) => Promise<void>;
  clearResults: () => void;
  selectStudy: (study: Study) => void;
  deselectStudy: () => void;
  selectSeries: (series: Series[]) => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  results: [],
  studies: [],
  series: [],
  loading: false,
  error: null,
  selectedStudy: null,
  selectedSeries: [],
  query: "",
  elapsedTime: 0,

  search: async (query: SearchQuery) => {
    set({
      loading: true,
      error: null,
      query: query.query,
      selectedStudy: null,
      selectedSeries: [],
    });

    try {
      const response = await dicoogleService.search(query);

      // Parse results into studies and series with images
      const studiesMap = new Map<string, Study>();
      const seriesMap = new Map<string, Series>();
      const imagesMap = new Map<string, Image[]>(); // Map seriesUID -> images

      response.results.forEach((result: SearchResult) => {
        const fields = result.fields;

        // Extract study information
        const studyUID = fields.StudyInstanceUID || fields.studyInstanceUID;
        if (studyUID && !studiesMap.has(studyUID)) {
          studiesMap.set(studyUID, {
            studyInstanceUID: studyUID,
            studyDate: fields.StudyDate || fields.studyDate,
            studyTime: fields.StudyTime || fields.studyTime,
            studyDescription:
              fields.StudyDescription || fields.studyDescription,
            patientName: fields.PatientName || fields.patientName,
            patientID: fields.PatientID || fields.patientID,
            modality: fields.Modality || fields.modality,
          });
        }

        // Extract series information
        const seriesUID = fields.SeriesInstanceUID || fields.seriesInstanceUID;
        if (seriesUID && studyUID) {
          if (!seriesMap.has(seriesUID)) {
            seriesMap.set(seriesUID, {
              seriesInstanceUID: seriesUID,
              seriesNumber: fields.SeriesNumber || fields.seriesNumber,
              seriesDescription:
                fields.SeriesDescription || fields.seriesDescription,
              modality: fields.Modality || fields.modality,
              studyInstanceUID: studyUID,
              images: [],
            });
            imagesMap.set(seriesUID, []);
          }

          // Extract image/instance information
          const sopInstanceUID = fields.SOPInstanceUID || fields.sopInstanceUID;
          if (sopInstanceUID) {
            const images = imagesMap.get(seriesUID) || [];
            // Check if image already exists
            if (!images.some((img) => img.sopInstanceUID === sopInstanceUID)) {
              images.push({
                sopInstanceUID: sopInstanceUID,
                instanceNumber: fields.InstanceNumber || fields.instanceNumber,
                seriesInstanceUID: seriesUID,
              });
              imagesMap.set(seriesUID, images);
            }
          }
        }
      });

      // Attach images to series
      const series = Array.from(seriesMap.values()).map((s) => ({
        ...s,
        images: imagesMap.get(s.seriesInstanceUID) || [],
        numberOfImages: (imagesMap.get(s.seriesInstanceUID) || []).length,
      }));

      const studies = Array.from(studiesMap.values());

      set({
        results: response.results,
        studies,
        series,
        loading: false,
        error: null,
        elapsedTime: response.elapsedTime || 0,
      });
    } catch (error: any) {
      set({
        results: [],
        studies: [],
        series: [],
        loading: false,
        error: error.message || "Search failed",
      });
    }
  },

  clearResults: () => {
    set({
      results: [],
      studies: [],
      series: [],
      selectedStudy: null,
      selectedSeries: [],
      query: "",
      error: null,
    });
  },

  selectStudy: (study: Study) => {
    const state = get();

    // Collapse if clicking same study again
    if (state.selectedStudy?.studyInstanceUID === study.studyInstanceUID) {
      set({
        selectedStudy: null,
        selectedSeries: [],
      });
      return;
    }

    // Otherwise select the new study
    const studySeries = state.series.filter(
      (s) => s.studyInstanceUID === study.studyInstanceUID,
    );

    set({
      selectedStudy: study,
      selectedSeries: studySeries,
    });
  },

  deselectStudy: () => {
    set({
      selectedStudy: null,
      selectedSeries: [],
    });
  },

  selectSeries: (series: Series[]) => {
    set({ selectedSeries: series });
  },
}));
