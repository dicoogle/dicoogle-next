package org.dicoogle.query.lucene;

final class LuceneIndexerFields {

  static final String STUDY_INSTANCE_UID = "studyInstanceUid";
  static final String SERIES_INSTANCE_UID = "seriesInstanceUid";
  static final String SOP_INSTANCE_UID = "sopInstanceUid";
  static final String SOP_CLASS_UID = "sopClassUid";
  static final String LOCATION = "location";
  static final String STORAGE_SCHEME = "storageScheme";
  static final String PATIENT_ID = "patientId";
  static final String PATIENT_NAME = "patientName";
  static final String PATIENT_NAME_NORMALIZED = "patientNameNormalized";
  static final String MODALITY = "modality";
  static final String STUDY_DESCRIPTION = "studyDescription";
  static final String SERIES_DESCRIPTION = "seriesDescription";
  static final String ACCESSION_NUMBER = "accessionNumber";
  static final String STUDY_DATE = "studyDate";
  static final String STUDY_TIME = "studyTime";
  static final String ACQUISITION_DATE_TIME = "acquisitionDateTime";
  static final String ALL_TEXT = "allText";
  static final String KEY = "key";

  private LuceneIndexerFields() {}
}
