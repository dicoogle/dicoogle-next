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
  TransferSyntaxSettings,
  User,
  TaskOutcome,
  IndexerSettings,
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
    return fullUrl;
  }

  // If it's already a full URL, use it directly
  if (
    envUrl &&
    (envUrl.startsWith("http://") || envUrl.startsWith("https://"))
  ) {
    return envUrl;
  }

  // Default fallback
  return "http://localhost:8080";
};

const DICOOGLE_URL = getBaseUrl();
const TOKEN_STORAGE_KEY = "dicoogle_token";

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

// Type for paginated transfer syntax response
export interface PaginatedTransferSyntax {
  items: TransferSyntaxSettings[];
  total: number;
  page: number;
  pageSize: number;
}

class DicoogleService {
  constructor() {
    try {
      dicoogleClient = DicoogleClient(DICOOGLE_URL);
      const token = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (token) {
        dicoogleClient.setToken(token);
      }
    } catch (error) {
      console.error("[DicoogleService] Failed to initialize client:", error);
    }
  }

  /**
   * Login to Dicoogle using credentials
   * Stores the token in localStorage for session persistence
   */
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    try {
      if (!dicoogleClient) {
        throw new Error("Dicoogle client not initialized");
      }

      const result = await dicoogleClient.login(
        credentials.username,
        credentials.password,
      );

      if (result && result.token) {
        // Store the actual token in localStorage for persistence across reloads
        localStorage.setItem(TOKEN_STORAGE_KEY, result.token);

        return {
          success: true,
          user: result.user,
          admin: result.admin,
          roles: result.roles || [],
          token: result.token,
        };
      }

      return {
        success: false,
      };
    } catch (error: any) {
      console.error("[DicoogleService] Login failed:", error);
      return {
        success: false,
      };
    }
  }

  /**
   * Logout from Dicoogle
   * Clears the token from localStorage
   */
  async logout(): Promise<boolean> {
    try {
      if (!dicoogleClient) {
        return false;
      }

      await dicoogleClient.logout();

      // Clear token from localStorage
      localStorage.removeItem(TOKEN_STORAGE_KEY);

      return true;
    } catch (error: any) {
      console.error("[DicoogleService] Logout failed:", error);
      // Even if logout fails, clear local token
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      return false;
    }
  }

  /**
   * Check if user is authenticated
   * Uses the dicoogle-client-js library's built-in isAuthenticated() method
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      if (!dicoogleClient) {
        return false;
      }

      const hasToken = dicoogleClient.isAuthenticated();

      if (!hasToken) {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        return false;
      }

      const token = dicoogleClient.getToken();

      if (!token) {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        return false;
      }

      await dicoogleClient.restoreSession(token);
      if (!dicoogleClient.getUsername()) {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        return false;
      }

      return true;
    } catch (error: any) {
      console.error("[DicoogleService] Auth check failed:", error);
      return false;
    }
  }

  /**
   * Get current user information
   * If username/roles are not in the library's memory (e.g., after page reload),
   * uses restoreSession() to fetch them from the backend
   */
  async getUserInfo(): Promise<LoginResponse> {
    try {
      const token = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (!dicoogleClient || !token) {
        return { success: false };
      }

      let username, roles, isAdmin;

      try {
        const userInfo = await dicoogleClient.restoreSession(token);
        username = userInfo.user;
        roles = userInfo.roles;
        isAdmin = userInfo.admin;
      } catch (error) {
        console.error("[DicoogleService] Failed to restore session:", error);
        // Token is invalid, clear everything
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        return { success: false };
      }

      return {
        success: true,
        user: username,
        admin: isAdmin,
        roles: roles || [],
        token: token,
      };
    } catch (error: any) {
      console.error("[DicoogleService] Failed to get user info:", error);
      return { success: false };
    }
  }

  async search(query: SearchQuery): Promise<SearchResponse> {
    if (!dicoogleClient) {
      throw new Error("Dicoogle client not initialized");
    }

    const outcome = await dicoogleClient.search(query.query, {
      provider: query.providers?.[0] || "lucene",
      keyword: true,
    });

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

  // ============ Indexer Methods ============

  async index(uri: string | string[]): Promise<string> {
    if (!dicoogleClient) throw new Error("Dicoogle client not initialized");
    console.log("indexing");
    await dicoogleClient.index(uri);
    // Return the first URI as task identifier
    return Array.isArray(uri) ? uri[0] : uri;
  }

  async listTasks(): Promise<TaskOutcome> {
    if (!dicoogleClient) throw new Error("Dicoogle client not initialized");
    return await dicoogleClient.tasks.list();
  }

  async stopTask(taskUid: string): Promise<void> {
    if (!dicoogleClient) throw new Error("Dicoogle client not initialized");
    await dicoogleClient.tasks.stop(taskUid);
  }

  async closeTask(taskUid: string): Promise<void> {
    if (!dicoogleClient) throw new Error("Dicoogle client not initialized");
    await dicoogleClient.tasks.close(taskUid);
  }

  async getIndexerSettings(): Promise<IndexerSettings> {
    if (!dicoogleClient) throw new Error("Dicoogle client not initialized");
    return await dicoogleClient.getIndexerSettings();
  }

  async setIndexerSettings(settings: Record<string, any>): Promise<void> {
    if (!dicoogleClient) throw new Error("Dicoogle client not initialized");
    await dicoogleClient.setIndexerSettings(settings);
  }

  // ============ Management API Methods ============

  async getStorageStatus(): Promise<ServiceStatus> {
    if (!dicoogleClient) throw new Error("Dicoogle client not initialized");

    const status: DicoogleServiceStatus =
      (await dicoogleClient.storage.getStatus()) as DicoogleServiceStatus;
    return {
      isRunning: status.isRunning,
      port: status.port,
      hostname: status.hostname || "0.0.0.0",
      autostart: status.autostart,
    };
  }

  async setStorageStatus(status: Partial<ServiceRequest>): Promise<void> {
    if (!dicoogleClient) throw new Error("Dicoogle client not initialized");

    await dicoogleClient.storage.configure({
      running: status.running,
      autostart: status.autostart,
      port: status.port,
      hostname: status.hostname,
    });
  }

  async getQueryStatus(): Promise<ServiceStatus> {
    if (!dicoogleClient) throw new Error("Dicoogle client not initialized");

    const status: DicoogleServiceStatus =
      await dicoogleClient.queryRetrieve.getStatus();

    return {
      isRunning: status.isRunning,
      port: status.port,
      hostname: status.hostname || "0.0.0.0",
      autostart: status.autostart,
    };
  }

  async setQueryStatus(status: Partial<ServiceRequest>): Promise<void> {
    if (!dicoogleClient) throw new Error("Dicoogle client not initialized");

    await dicoogleClient.queryRetrieve.configure({
      running: status.running,
      autostart: status.autostart,
      port: status.port,
      hostname: status.hostname,
    });
  }

  async getStorageServers(): Promise<StorageServer[]> {
    if (!dicoogleClient) throw new Error("Dicoogle client not initialized");

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
    if (!dicoogleClient) throw new Error("Dicoogle client not initialized");

    await dicoogleClient.storage.addRemoteServer({
      aetitle: server.AETitle,
      ip: server.ipAddrs,
      port: server.port,
      description: server.description,
      public: server.public,
    });
  }

  async removeStorageServer(server: StorageServer): Promise<void> {
    if (!dicoogleClient) throw new Error("Dicoogle client not initialized");

    await dicoogleClient.storage.removeRemoteServer({
      aetitle: server.AETitle,
      ip: server.ipAddrs,
      port: server.port,
      description: server.description,
      public: server.public,
    });
  }

  async getPlugins(): Promise<Plugin[]> {
    if (!dicoogleClient) throw new Error("Dicoogle client not initialized");

    const response = await dicoogleClient.getPlugins();
    return response.plugins.map((plugin: PluginInfo) => ({
      name: plugin.name,
      type: plugin.type,
      enabled: plugin.enabled,
    }));
  }

  async getVersion(): Promise<Version> {
    if (!dicoogleClient) throw new Error("Dicoogle client not initialized");

    return await dicoogleClient.getVersion();
  }

  async getAETitle(): Promise<{ aetitle: string }> {
    if (!dicoogleClient) throw new Error("Dicoogle client not initialized");

    const aetitle = await dicoogleClient.getAETitle();
    return { aetitle };
  }

  async setAETitle(aetitle: string): Promise<void> {
    if (!dicoogleClient) throw new Error("Dicoogle client not initialized");
    await dicoogleClient.setAETitle(aetitle);
  }

  async getQueryRetrieveSettings(): Promise<QuerySettings> {
    if (!dicoogleClient) throw new Error("Dicoogle client not initialized");

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
    if (!dicoogleClient) throw new Error("Dicoogle client not initialized");

    const dicomSettings: DicomQuerySettings = {};
    if (settings.acceptTimeout !== undefined)
      dicomSettings.acceptTimeout = settings.acceptTimeout;
    if (settings.connectionTimeout !== undefined)
      dicomSettings.connectionTimeout = settings.connectionTimeout;
    if (settings.idleTimeout !== undefined)
      dicomSettings.idleTimeout = settings.idleTimeout;
    if (settings.maxAssociations !== undefined)
      dicomSettings.maxAssociations = settings.maxAssociations;
    if (settings.maxPduReceive !== undefined)
      dicomSettings.maxPduReceive = settings.maxPduReceive;
    if (settings.maxPduSend !== undefined)
      dicomSettings.maxPduSend = settings.maxPduSend;
    if (settings.responseTimeout !== undefined)
      dicomSettings.responseTimeout = settings.responseTimeout;

    await dicoogleClient.queryRetrieve.setDicomQuerySettings(dicomSettings);
  }

  async togglePluginState(
    type: string,
    name: string,
    enable: boolean,
  ): Promise<any> {
    if (!dicoogleClient) throw new Error("Dicoogle client not initialized");

    if (enable) {
      await dicoogleClient.enablePlugin(type as any, name);
    } else {
      await dicoogleClient.disablePlugin(type as any, name);
    }
  }

  async getServerLog(): Promise<string> {
    if (!dicoogleClient) throw new Error("Dicoogle client not initialized");
    return await dicoogleClient.getRawLog();
  }

  async getUsers(): Promise<User[]> {
    if (!dicoogleClient) throw new Error("Dicoogle client not initialized");
    const usersList = await dicoogleClient.users.list();
    return usersList.map((u: any) => ({
      username: u.username,
      roles: u.roles,
    }));
  }

  async createUser(
    username: string,
    password: string,
    admin: boolean = false,
  ): Promise<void> {
    if (!dicoogleClient) throw new Error("Dicoogle client not initialized");
    await dicoogleClient.users.add(username, password, admin);
  }

  async deleteUser(username: string): Promise<void> {
    if (!dicoogleClient) throw new Error("Dicoogle client not initialized");
    await dicoogleClient.users.remove(username);
  }

  /**
   * Update user by deleting and recreating with new credentials
   * This is a workaround since Dicoogle doesn't have a native update API
   */
  async updateUser(
    username: string,
    newPassword: string,
    admin: boolean = false,
  ): Promise<void> {
    if (!dicoogleClient) throw new Error("Dicoogle client not initialized");

    // Delete existing user
    await dicoogleClient.users.remove(username);

    // Recreate with new credentials
    await dicoogleClient.users.add(username, newPassword, admin);
  }

  async getTransferSyntaxes(): Promise<TransferSyntaxSettings[]> {
    if (!dicoogleClient) throw new Error("Dicoogle client not initialized");
    return await dicoogleClient.getTransferSyntaxSettings();
  }

  /**
   * Get transfer syntaxes with pagination and search support
   * @param searchTerm Optional search term to filter transfer syntaxes by sop_name or uid
   * @param page Page number (1-indexed)
   * @param pageSize Number of items per page
   */
  async getTransferSyntaxesPaginated(
    searchTerm: string = "",
    page: number = 1,
    pageSize: number = 10,
  ): Promise<PaginatedTransferSyntax> {
    if (!dicoogleClient) throw new Error("Dicoogle client not initialized");

    const allSyntaxes = await dicoogleClient.getTransferSyntaxSettings();

    // Filter by search term if provided
    let filtered = allSyntaxes;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = allSyntaxes.filter(
        (syntax) =>
          syntax.sop_name.toLowerCase().includes(term) ||
          syntax.uid.toLowerCase().includes(term),
      );
    }

    // Calculate pagination
    const total = filtered.length;
    const totalPages = Math.ceil(total / pageSize);
    const normalizedPage = Math.max(1, Math.min(page, totalPages || 1));
    const startIndex = (normalizedPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;

    const items = filtered.slice(startIndex, endIndex);

    return {
      items,
      total,
      page: normalizedPage,
      pageSize,
    };
  }

  async setTransferSyntaxOption(
    uid: string,
    option: string,
    value: boolean,
  ): Promise<void> {
    if (!dicoogleClient) throw new Error("Dicoogle client not initialized");
    await dicoogleClient.setTransferSyntaxOption(uid, option, value);
  }
}

export const dicoogleService = new DicoogleService();
export default dicoogleService;
