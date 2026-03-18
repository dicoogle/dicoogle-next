package pt.ua.dicooglenext.protocol.dimse;

public record CStoreIdentifiers(
    String patientId,
    String studyInstanceUid,
    String seriesInstanceUid,
    String sopInstanceUid,
    String sopClassUid) {}
