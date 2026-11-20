package org.dicoogle.protocol.dimse.store;

public record CStoreIdentifiers(
    String patientId,
    String studyInstanceUid,
    String seriesInstanceUid,
    String sopInstanceUid,
    String sopClassUid) {}
