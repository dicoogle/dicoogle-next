import type {
  DICOMAttributeResponse,
  LoginCredentials,
  LoginResponse,
  QuerySettings,
  SearchQuery,
  SearchResponse,
  ServiceRequest,
  ServiceStatus,
  StorageServer,
  Version,
  Plugin,
} from "@/types/index";
import DicoogleClient from "dicoogle-client";

// Get the base URL from environment or construct it
const getBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;

  // If it's a relative path (like /api), construct full URL
  // This works with Vite's proxy during development
  if (envUrl && envUrl.startsWith("/")) {
    const { protocol, hostname, port } = window.location;
    const fullUrl = `${protocol}//${hostname}${port ? ":" + port : ""}${envUrl}`;
    // console.log('[DicoogleService] Using proxy URL:', fullUrl);
    return fullUrl;
  }

  // If it's already a full URL, use it directly
  if (
    envUrl &&
    (envUrl.startsWith("http://") || envUrl.startsWith("https://"))
  ) {
    // console.log("[DicoogleService] Using direct URL:", envUrl);
    return envUrl;
  }

  // Default fallback
  // console.log('[DicoogleService] Using default URL: http://localhost:8080');
  return "http://localhost:8080";
};

const DICOOGLE_URL = getBaseUrl();

// Initialize the client
let dicoogleClient: ReturnType<typeof DicoogleClient> | null = null;

interface DicoogleServiceStatus {
  isRunning: boolean;
  port: number;
  hostname?: string;
  autostart: boolean;
}

interface RemoteStorage {
  aetitle: string;
  ip: string;
  port: number;
  description?: string;
  public?: boolean;
}

interface DicomQuerySettings {
  acceptTimeout?: number;
  connectionTimeout?: number;
  idleTimeout?: number;
  maxAssociations?: number;
  maxPduReceive?: number;
  maxPduSend?: number;
  responseTimeout?: number;
}

interface PluginInfo {
  name: string;
  type: string;
  enabled: boolean;
}

class DicoogleService {
  private token: string | null = null;

  constructor() {
    // Initialize client with the base URL
    // console.log(
    //   "[DicoogleService] Initializing Dicoogle client with base URL:",
    //   DICOOGLE_URL,
    // );

    try {
      dicoogleClient = DicoogleClient(DICOOGLE_URL);
      // console.log("[DicoogleService] Client initialized successfully");
      // console.log(
      //   "[DicoogleService] Requests will go to:",
      //   DICOOGLE_URL + "/[endpoint]",
      // );
    } catch (error) {
      console.error("[DicoogleService] Failed to initialize client:", error);
    }

    // Restore token from localStorage
    const savedToken = localStorage.getItem("dicoogle_token");
    if (savedToken) {
      this.token = savedToken;
      // console.log("[DicoogleService] Restored token from localStorage");
    }
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem("dicoogle_token", token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem("dicoogle_token");
    localStorage.removeItem("dicoogle_username");
  }

  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    try {
      if (!dicoogleClient) {
        throw new Error("Dicoogle client not initialized");
      }

      // console.log(
      //   "[DicoogleService] Attempting login for user:",
      //   credentials.username,
      // );

      const result = await dicoogleClient.login(
        credentials.username,
        credentials.password,
      );

      // console.log("[DicoogleService] Login result:", result);

      if (result) {
        this.setToken("authenticated");
        // Store username for later retrieval
        localStorage.setItem("dicoogle_username", credentials.username);
      }

      return {
        success: !!result,
        user: credentials.username,
        admin: false,
        roles: [],
        token: "authenticated",
      };
    } catch (error: any) {
      console.error("[DicoogleService] Login failed:", error);
      return {
        success: false,
      };
    }
  }

  async logout(): Promise<boolean> {
    try {
      if (!dicoogleClient || !this.token) {
        return false;
      }

      // console.log("[DicoogleService] Logging out...");
      await dicoogleClient.logout();
      this.clearToken();
      return true;
    } catch (error: any) {
      console.error("[DicoogleService] Logout failed:", error);
      return false;
    } finally {
      this.clearToken();
    }
  }

  async validateToken(): Promise<LoginResponse> {
    try {
      if (!this.token || !dicoogleClient) {
        return {
          success: false,
        };
      }

      // Retrieve stored username
      const username = localStorage.getItem("dicoogle_username") || "User";

      return {
        success: true,
        user: username,
        admin: false,
        roles: [],
      };
    } catch (error: any) {
      console.error("[DicoogleService] Token validation failed:", error);
      this.clearToken();
      return { success: false };
    }
  }

  async search(query: SearchQuery): Promise<SearchResponse> {
    if (!dicoogleClient) {
      throw new Error("Dicoogle client not initialized");
    }

    // console.log("[DicoogleService] Searching with:", {
    //   query: query.query,
    //   providers: query.providers,
    // });

    const outcome = await dicoogleClient.search(query.query, {
      provider: query.providers?.[0] || "lucene",
      keyword: true,
    });

    // console.log("[DicoogleService] Search results:", {
    //   count: outcome.results?.length || 0,
    //   elapsedTime: outcome.elapsedTime,
    // });

    return {
      results: outcome.results || [],
      elapsedTime: outcome.elapsedTime || 0,
      numResults: outcome.results?.length || 0,
    };
  }

  async getDICOMMetadata(uid: string): Promise<DICOMAttributeResponse> {
    try {
      if (!dicoogleClient) {
        throw new Error("Dicoogle client not initialized");
      }

      // Use dump method from dicoogle-client-js
      const outcome = await dicoogleClient.dump(uid);

      if (outcome.results) {
        return {
          results: {
            fields: outcome.results.fields,
          },
          elapsedTime: outcome.elapsedTime || 0,
        };
      }

      throw new Error("DICOM instance not found");
    } catch (error: any) {
      console.error("[DicoogleService] Failed to get DICOM metadata:", error);
      throw error;
    }
  }

  getDICOMFileUrl(uid: string): string {
    return `${DICOOGLE_URL}/legacy/file?uid=${uid}`;
  }

  getThumbnail(uid: string): string {
    if (dicoogleClient) {
      return dicoogleClient.getThumbnailUrl(uid);
    }
    return `${DICOOGLE_URL}/dic2png?thumbnail=true&SOPInstanceUID=${uid}`;
  }

  getImage(uid: string): string {
    if (dicoogleClient) {
      return dicoogleClient.getPreviewUrl(uid);
    }
    return `${DICOOGLE_URL}/dic2png?thumbnail=false&SOPInstanceUID=${uid}`;
  }

  // ============ Management API Methods ============
  // Now using built-in dicoogle-client-js methods!

  async getStorageStatus(): Promise<ServiceStatus> {
    if (!dicoogleClient) {
      throw new Error("Dicoogle client not initialized");
    }

    const status: DicoogleServiceStatus =
      (await dicoogleClient.storage.getStatus()) as DicoogleServiceStatus;
    return {
      isRunning: status.isRunning,
      port: status.port,
      hostname: status.hostname || "localhost",
      autostart: status.autostart,
    };
  }

  async setStorageStatus(status: Partial<ServiceRequest>): Promise<void> {
    if (!dicoogleClient) {
      throw new Error("Dicoogle client not initialized");
    }

    await dicoogleClient.storage.configure({
      running: status.running,
      autostart: status.autostart,
      port: status.port,
      hostname: status.hostname,
    });
  }

  async getQueryStatus(): Promise<ServiceStatus> {
    if (!dicoogleClient) {
      throw new Error("Dicoogle client not initialized");
    }

    const status: DicoogleServiceStatus =
      await dicoogleClient.queryRetrieve.getStatus();
    return {
      isRunning: status.isRunning,
      port: status.port,
      hostname: status.hostname || "localhost",
      autostart: status.autostart,
    };
  }

  async setQueryStatus(status: Partial<ServiceRequest>): Promise<void> {
    if (!dicoogleClient) {
      throw new Error("Dicoogle client not initialized");
    }

    await dicoogleClient.queryRetrieve.configure({
      running: status.running,
      autostart: status.autostart,
      port: status.port,
      hostname: status.hostname,
    });
  }

  async getStorageServers(): Promise<StorageServer[]> {
    if (!dicoogleClient) {
      throw new Error("Dicoogle client not initialized");
    }

    const servers: RemoteStorage[] =
      (await dicoogleClient.storage.getRemoteServers()) as RemoteStorage[];
    return servers.map((server) => ({
      AETitle: server.aetitle,
      ipAddrs: server.ip,
      port: server.port,
      description: server.description,
      public: server.public,
    }));
  }

  async addStorageServer(server: StorageServer): Promise<void> {
    if (!dicoogleClient) {
      throw new Error("Dicoogle client not initialized");
    }

    await dicoogleClient.storage.addRemoteServer({
      aetitle: server.AETitle,
      ip: server.ipAddrs,
      port: server.port,
      description: server.description,
      public: server.public,
    });
  }

  async removeStorageServer(server: StorageServer): Promise<void> {
    if (!dicoogleClient) {
      throw new Error("Dicoogle client not initialized");
    }

    await dicoogleClient.storage.removeRemoteServer({
      aetitle: server.AETitle,
      ip: server.ipAddrs,
      port: server.port,
      description: server.description,
      public: server.public,
    });
  }

  async getPlugins(): Promise<Plugin[]> {
    if (!dicoogleClient) {
      throw new Error("Dicoogle client not initialized");
    }

    const response = await dicoogleClient.getPlugins();
    return response.plugins.map((plugin: PluginInfo) => ({
      name: plugin.name,
      type: plugin.type,
      enabled: plugin.enabled,
    }));
  }

  async getVersion(): Promise<Version> {
    if (!dicoogleClient) {
      throw new Error("Dicoogle client not initialized");
    }

    return await dicoogleClient.getVersion();
  }

  async getAETitle(): Promise<{ aetitle: string }> {
    if (!dicoogleClient) {
      throw new Error("Dicoogle client not initialized");
    }

    const aetitle = await dicoogleClient.getAETitle();
    return { aetitle };
  }

  async getQueryRetrieveSettings(): Promise<QuerySettings> {
    if (!dicoogleClient) {
      throw new Error("Dicoogle client not initialized");
    }

    const settings: DicomQuerySettings =
      (await dicoogleClient.queryRetrieve.getDicomQuerySettings()) as DicomQuerySettings;

    return {
      acceptTimeout: settings.acceptTimeout || 0,
      connectionTimeout: settings.connectionTimeout || 0,
      idleTimeout: settings.idleTimeout || 0,
      maxAssociations: settings.maxAssociations || 0,
      maxPduReceive: settings.maxPduReceive || 0,
      maxPduSend: settings.maxPduSend || 0,
      responseTimeout: settings.responseTimeout || 0,
    };
  }

  async setQueryRetrieveSettings(
    settings: Partial<QuerySettings>,
  ): Promise<void> {
    if (!dicoogleClient) {
      throw new Error("Dicoogle client not initialized");
    }

    // Map our interface to DicomQuerySettings format
    const dicomSettings: DicomQuerySettings = {};

    if (settings.acceptTimeout !== undefined) {
      dicomSettings.acceptTimeout = settings.acceptTimeout;
    }
    if (settings.connectionTimeout !== undefined) {
      dicomSettings.connectionTimeout = settings.connectionTimeout;
    }
    if (settings.idleTimeout !== undefined) {
      dicomSettings.idleTimeout = settings.idleTimeout;
    }
    if (settings.maxAssociations !== undefined) {
      dicomSettings.maxAssociations = settings.maxAssociations;
    }
    if (settings.maxPduReceive !== undefined) {
      dicomSettings.maxPduReceive = settings.maxPduReceive;
    }
    if (settings.maxPduSend !== undefined) {
      dicomSettings.maxPduSend = settings.maxPduSend;
    }
    if (settings.responseTimeout !== undefined) {
      dicomSettings.responseTimeout = settings.responseTimeout;
    }

    await dicoogleClient.queryRetrieve.setDicomQuerySettings(dicomSettings);
  }

  async togglePluginState(
    type: string,
    name: string,
    enable: boolean,
  ): Promise<any> {
    if (!dicoogleClient) {
      throw new Error("Dicoogle client not initialized");
    }

    if (enable) {
      await dicoogleClient.enablePlugin(type as any, name);
    } else {
      await dicoogleClient.disablePlugin(type as any, name);
    }
  }
}

export const dicoogleService = new DicoogleService();
export default dicoogleService;
