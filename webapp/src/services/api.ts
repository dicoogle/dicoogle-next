import type {
  DICOMAttributeResponse,
  LoginCredentials,
  LoginResponse,
  SearchQuery,
  SearchResponse,
} from "@/types";
import axios, { AxiosInstance } from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

// ============ Types for Management API ============

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

class ApiService {
  private api: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        "Content-Type": "application/json",
      },
      withCredentials: true, // Important for session cookies
    });

    this.api.interceptors.request.use(
      (config) => {
        if (this.token) {
          config.headers.Authorization = `${this.token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      },
    );

    this.api.interceptors.response.use(
      (response) => {
        return response;
      },
      (error) => {
        if (
          error.response?.status === 401 &&
          window.location.pathname !== "/login"
        ) {
          this.token = null;
          localStorage.removeItem("dicoogle_token");
          window.location.href = "/login";
        }
        return Promise.reject(error);
      },
    );

    // Restore token from localStorage
    const savedToken = localStorage.getItem("dicoogle_token");
    if (savedToken) {
      this.token = savedToken;
    }
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem("dicoogle_token", token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem("dicoogle_token");
  }

  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    try {
      const response = await this.api.post("/login", null, {
        params: {
          username: credentials.username,
          password: credentials.password,
        },
      });

      const data = response.data;
      const success = data.success !== false || response.status === 200;

      if (data.token) {
        this.setToken(data.token);
      }

      return {
        success: success,
        user: data.user,
        admin: data.admin,
        roles: data.roles,
        token: data.token,
      };
    } catch (error: any) {
      return {
        success: false,
      };
    }
  }

  async logout(): Promise<boolean> {
    try {
      if (!this.token) {
        return false;
      }
      const response = await this.api.get("/logout", {
        headers: {
          Accept: "application/json",
          Authorization: this.token,
        },
      });

      return response.status === 200;
    } catch (error: any) {
      if (error.response?.status === 401) {
        this.clearToken();
        return false;
      }
      return false;
    } finally {
      this.clearToken();
    }
  }

  async validateToken(): Promise<LoginResponse> {
    try {
      if (!this.token) {
        return {
          success: false,
        };
      }

      const response = await this.api.get("/login", {
        headers: {
          Accept: "application/json",
          Authorization: this.token,
        },
      });

      const data = response.data;
      const success = data.success !== false || response.status === 200;

      return {
        success: success,
        user: data.user,
        admin: data.admin,
        roles: data.roles,
      };
    } catch (error: any) {
      if (error.response?.status === 401) {
        this.clearToken();
        return { success: false };
      }
      return { success: false };
    }
  }

  async search(query: SearchQuery): Promise<SearchResponse> {
    const params: any = {
      query: query.query,
    };

    if (query.providers && query.providers.length > 0) {
      params.provider = query.providers.join(",");
    }

    if (query.field) {
      params.field = query.field;
    }

    const response = await this.api.get("/search", { params });
    return response.data;
  }

  // Get DICOM metadata
  async getDICOMMetadata(uid: string): Promise<DICOMAttributeResponse> {
    const response = await this.api.get("/dump", {
      params: { uid },
    });
    return response.data;
  }

  getDICOMFileUrl(uid: string): string {
    return `${API_BASE_URL}/legacy/file?uid=${uid}`;
  }

  getThumbnail(uid: string): string {
    return `${API_BASE_URL}/dic2png?thumbnail=true&SOPInstanceUID=${uid}`;
  }

  getImage(uid: string): string {
    return `${API_BASE_URL}/dic2png?thumbnail=false&SOPInstanceUID=${uid}`;
  }

  // ============ Management API Methods ============

  // Service Status
  async getStorageStatus(): Promise<ServiceStatus> {
    const response = await this.api.get("/management/dicom/storage");
    return response.data;
  }

  async setStorageStatus(status: Partial<ServiceRequest>): Promise<void> {
    await this.api.post("/management/dicom/storage", null, { params: status });
  }

  async getQueryStatus(): Promise<ServiceStatus> {
    const response = await this.api.get("/management/dicom/query");
    return response.data;
  }

  async setQueryStatus(status: Partial<ServiceRequest>): Promise<void> {
    await this.api.post("/management/dicom/query", null, {
      params: status,
    });
  }

  // Storage Servers (Move Destinations)
  async getStorageServers(): Promise<StorageServer[]> {
    const response = await this.api.get("/management/settings/storage/dicom");
    return response.data || [];
  }

  async addStorageServer(server: StorageServer): Promise<void> {
    const params: any = {
      aetitle: server.AETitle,
      ip: server.ipAddrs,
      port: server.port,
      type: "add",
    };

    if (server.description) {
      params.description = server.description;
    }

    if (server.public !== undefined) {
      params.public = server.public;
    }

    await this.api.post("/management/settings/storage/dicom", null, { params });
  }

  async removeStorageServer(server: StorageServer): Promise<void> {
    const params: any = {
      aetitle: server.AETitle,
      ip: server.ipAddrs,
      port: server.port,
      type: "remove",
    };

    await this.api.post("/management/settings/storage/dicom", null, { params });
  }

  // Plugins
  async getPlugins(): Promise<Plugin[]> {
    const response = await this.api.get("/plugins");
    return response.data.plugins || [];
  }

  // System
  async getVersion(): Promise<Version> {
    const response = await this.api.get("/ext/version");
    return response.data;
  }

  async getAETitle(): Promise<{ aetitle: string }> {
    const response = await this.api.get("/management/settings/dicom");
    return response.data;
  }

  async getQueryRetrieveSettings(): Promise<QuerySettings> {
    const response = await this.api.get("/management/settings/dicom/query");
    return response.data;
  }

  async togglePluginState(
    type: string,
    name: string,
    enable: boolean,
  ): Promise<any> {
    const action = enable ? "enable" : "disable";
    // Using put request as per standard REST practices for updates,
    // assuming the endpoint accepts PUT. If GET, change to this.api.get
    // Based on the prompt: /api/plugins/<type>/<name>/<disable/enable>
    const response = await this.api.post(`/plugins/${type}/${name}/${action}`);
    return response.data;
  }
}

export const apiService = new ApiService();
export default apiService;
