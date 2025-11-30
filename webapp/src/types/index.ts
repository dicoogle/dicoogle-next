export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  user?: string;
  admin?: boolean;
  roles?: string[];
  token?: string;
}

export interface SearchQuery {
  query: string;
  providers?: string[];
  field?: string;
}

export interface DICOMAttribute {
  tag: string;
  vr: string;
  value: string | string[];
}

export interface SearchResult {
  uri: string;
  fields: Record<string, any>;
}

export interface Study {
  studyInstanceUID: string;
  studyDate?: string;
  studyTime?: string;
  studyDescription?: string;
  patientName?: string;
  patientID?: string;
  modality?: string;
  numberOfSeries?: number;
  numberOfImages?: number;
  InstitutionName?: string;
}

export interface Image {
  sopInstanceUID: string;
  instanceNumber?: string;
  seriesInstanceUID: string;
}

export interface Series {
  seriesInstanceUID: string;
  seriesNumber?: string;
  seriesDescription?: string;
  modality?: string;
  numberOfImages?: number;
  studyInstanceUID: string;
  images: Image[];
}

export interface SearchResponse {
  results: SearchResult[];
  elapsedTime: number;
  numResults: number;
}

export interface DICOMAttributeResponse {
  results: DICOMAttribute;
  elapsedTime: number;
}

export interface DICOMAttribute {
  fields: Record<string, string>;
}
