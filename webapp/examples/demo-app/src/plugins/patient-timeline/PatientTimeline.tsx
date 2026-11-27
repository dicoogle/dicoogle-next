import { useMemo } from "react";
import type { ResultRendererProps, SearchResult } from "@dicoogle/dicoogle-next-webapp";

interface TimelineStudy {
  uid: string;
  date: string;
  description: string;
  modalities: Set<string>;
  instances: number;
  first: SearchResult;
}

interface TimelinePatient {
  key: string;
  name: string;
  id: string;
  studies: TimelineStudy[];
}

const field = (result: SearchResult, name: string): string => {
  const value = result.fields[name] ?? result.fields[name[0].toLowerCase() + name.slice(1)];
  return value == null ? "" : String(value);
};

/** "20240131" -> "2024-01-31" */
const formatDate = (date: string) =>
  /^\d{8}$/.test(date) ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}` : date || "—";

/** Results are instances; group them into studies, and studies into patients. */
function groupByPatient(results: SearchResult[]): TimelinePatient[] {
  const patients = new Map<string, TimelinePatient>();
  const studies = new Map<string, TimelineStudy>();

  for (const result of results) {
    const uid = field(result, "StudyInstanceUID");
    let study = studies.get(uid);
    if (!study) {
      const patientId = field(result, "PatientID");
      const patientName = field(result, "PatientName").replace(/\^/g, " ").trim();
      const key = patientId || patientName || "unknown";
      let patient = patients.get(key);
      if (!patient) {
        patient = { key, name: patientName || "Unknown patient", id: patientId, studies: [] };
        patients.set(key, patient);
      }
      study = {
        uid,
        date: field(result, "StudyDate"),
        description: field(result, "StudyDescription"),
        modalities: new Set(),
        instances: 0,
        first: result,
      };
      studies.set(uid, study);
      patient.studies.push(study);
    }
    const modality = field(result, "Modality");
    if (modality) study.modalities.add(modality);
    study.instances++;
  }

  for (const patient of patients.values()) {
    patient.studies.sort((a, b) => a.date.localeCompare(b.date));
  }
  return [...patients.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function PatientTimeline({ results, loading, onResultSelect }: ResultRendererProps) {
  const patients = useMemo(() => groupByPatient(results), [results]);

  if (loading) return <p className="p-4 text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      {patients.map((patient) => (
        <section key={patient.key}>
          <h3 className="font-semibold">
            {patient.name}
            {patient.id && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">{patient.id}</span>
            )}
          </h3>
          <ol className="mt-3 ml-2 border-l-2 border-primary/40">
            {patient.studies.map((study) => (
              <li key={study.uid} className="relative pl-6 pb-4 last:pb-0">
                <span className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full bg-primary" />
                <button
                  type="button"
                  onClick={() => onResultSelect?.(study.first)}
                  className="w-full rounded-md p-2 -mt-1 text-left hover:bg-muted transition-colors"
                >
                  <div className="text-sm font-medium">
                    {formatDate(study.date)}
                    <span className="ml-2 inline-flex gap-1">
                      {[...study.modalities].map((modality) => (
                        <span
                          key={modality}
                          className="rounded bg-primary/10 px-1.5 text-xs text-primary"
                        >
                          {modality}
                        </span>
                      ))}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {study.description || "No description"} · {study.instances} instance
                    {study.instances === 1 ? "" : "s"}
                  </div>
                </button>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
