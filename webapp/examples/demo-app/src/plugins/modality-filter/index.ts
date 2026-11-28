/**
 * Modality filter: a filter on the search page that restricts results to one modality.
 * Extension point: getQueryFilterExtensions.
 *
 * applyFilter returns a query fragment that the search page ANDs with the user's query. The
 * search page recognises fragments by the filter id, so the id is the DICOM field it filters.
 * (One modality at a time: the Lucene query plugin ANDs field terms and has no OR between them.)
 */
import { defineDicooglePlugin } from "@dicoogle/dicoogle-next-webapp";
import { ModalityFilter } from "./ModalityFilter";

export default defineDicooglePlugin({
  getQueryFilterExtensions: () => [
    {
      id: "Modality",
      label: "Modality",
      description: "Only show studies of the selected modality",
      component: ModalityFilter,
      defaultValue: null as string | null,
      order: 5,
      applyFilter: (modality: string | null) => (modality ? `Modality:${modality}` : null),
    },
  ],
});
