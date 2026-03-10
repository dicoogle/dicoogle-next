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

export interface ServiceStatus {
  isRunning: boolean;
  port: number;
  hostname: string;
  autostart: boolean;
}

export interface ServiceRequest {
  running: boolean;
  port: number;
  hostname: string;
  autostart: boolean;
}

export interface Plugin {
  name: string;
  type: string;
  enabled: boolean;
}

export interface Version {
  version: string;
}

export interface QuerySettings {
  acceptTimeout: number;
  connectionTimeout: number;
  idleTimeout: number;
  maxAssociations: number;
  maxPduReceive: number;
  maxPduSend: number;
  responseTimeout: number;
}

export interface StorageServer {
  AETitle: string;
  ipAddrs: string;
  port: number;
  description?: string;
  public?: boolean;
}

export interface TransferSyntaxOption {
  name: string;
  value: boolean;
}

export interface TransferSyntaxSettings {
  uid: string;
  sop_name: string;
  options: TransferSyntaxOption[];
}

export interface User {
  username: string;
  roles?: string[];
}

export interface IndexerSettings {
  path?: string;
  zip?: boolean;
  effort?: number;
  thumbnail?: boolean;
  thumbnailSize?: number;
  watcher?: boolean;
}

export interface TaskInfo {
  taskUid: string;
  taskName: string;
  taskProgress: number;
  complete?: boolean;
  elapsedTime?: number;
  nIndexed?: number;
  nErrors?: number;
  canceled?: boolean;
  taskTimeCreated?: string;
}

export interface TaskOutcome {
  tasks: TaskInfo[];
  count: number;
}

export interface DicomViewerProps {
  imageUrls: string[];
  initialIndex?: number;
  onClose?: () => void;
  title?: string;
}

