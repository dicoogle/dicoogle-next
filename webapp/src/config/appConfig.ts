/**
 * Runtime configuration of the web app.
 *
 * Nothing under src/ (other than main.tsx) reads import.meta.env: when the app is consumed as a
 * library, those values would be frozen at the library's build time instead of the host app's.
 * The standalone app fills this from its env in main.tsx; host apps pass it to createDicoogleApp.
 */

export interface DicoogleBranding {
  /** Product name, used as the logo's alt text and the document title. */
  appName: string;
  /** Logo shown in the header, login page and viewer. Defaults to `<publicBaseUrl>logo.png`. */
  logoUrl?: string;
  /** Line under the logo on the login page. */
  tagline: string;
}

export interface DicoogleAppConfig {
  /**
   * Dicoogle Next API location: an absolute URL, or a path on the current origin (e.g.
   * "/next/api"). Defaults to the current origin.
   */
  apiBaseUrl?: string;
  /** Router basename the app is served under (e.g. "/experimental"). */
  basePath: string;
  /**
   * URL the static assets (logo, DICOM workers) are served from; normally the host app's
   * import.meta.env.BASE_URL. Must end with "/".
   */
  publicBaseUrl: string;
  /** Folder the "Import Data" browser opens at, instead of the server's roots. */
  filesystemStartPath?: string;
  /** Version reported to plugins through their context. */
  appVersion: string;
  branding: DicoogleBranding;
}

export interface DicoogleAppConfigInput
  extends Partial<Omit<DicoogleAppConfig, "branding">> {
  branding?: Partial<DicoogleBranding>;
}

const DEFAULT_CONFIG: DicoogleAppConfig = {
  basePath: "/experimental",
  publicBaseUrl: "/",
  appVersion: "1.0.0",
  branding: {
    appName: "Dicoogle",
    tagline: "Medical Imaging PACS Platform",
  },
};

let current: DicoogleAppConfig = DEFAULT_CONFIG;

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

/** Replaces the configuration; anything not given falls back to the defaults. */
export function configureApp(input: DicoogleAppConfigInput = {}): DicoogleAppConfig {
  const defined = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== ""),
  ) as DicoogleAppConfigInput;
  current = {
    ...DEFAULT_CONFIG,
    ...defined,
    publicBaseUrl: withTrailingSlash(defined.publicBaseUrl ?? DEFAULT_CONFIG.publicBaseUrl),
    branding: { ...DEFAULT_CONFIG.branding, ...input.branding },
  };
  return current;
}

export function getAppConfig(): DicoogleAppConfig {
  return current;
}

/** Absolute URL of the Dicoogle Next API, without a trailing slash. */
export function resolveApiBaseUrl(): string {
  const configured = current.apiBaseUrl?.trim();
  if (configured && /^https?:\/\//.test(configured)) {
    return configured.replace(/\/$/, "");
  }
  if (configured && configured.startsWith("/")) {
    return `${window.location.origin}${configured}`.replace(/\/$/, "");
  }
  return window.location.origin;
}

/** URL of a file under the static assets, e.g. publicAssetUrl("logo.png"). */
export function publicAssetUrl(file: string): string {
  return `${current.publicBaseUrl}${file.replace(/^\//, "")}`;
}

export function logoUrl(): string {
  return current.branding.logoUrl ?? publicAssetUrl("logo.png");
}
