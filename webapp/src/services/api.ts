import type {
  DICOMAttributeResponse,
  LoginCredentials,
  LoginResponse,
  SearchQuery,
  SearchResponse,
} from "@/types";
import axios, { AxiosInstance } from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

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
        // console.log(
        //   "[API] Request:",
        //   config.method?.toUpperCase(),
        //   config.url,
        //   "params:",
        //   config.params,
        // );
        if (this.token) {
          config.headers.Authorization = `${this.token}`;
        }
        return config;
      },
      (error) => {
        // console.error("[API] Request error:", error);
        return Promise.reject(error);
      },
    );

    this.api.interceptors.response.use(
      (response) => {
        // console.log(
        //   "[API] Response:",
        //   response.status,
        //   response.config.url,
        //   response.data,
        // );
        return response;
      },
      (error) => {
        // console.error(
        //   "[API] Response error:",
        //   error.response?.status,
        //   error.response?.data || error.message,
        // );
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
      // console.log(
      //   "[API] Attempting login with username:",
      //   credentials.username,
      // );

      const response = await this.api.post("/login", null, {
        params: {
          username: credentials.username,
          password: credentials.password,
        },
      });

      // console.log("[API] Login successful:", response.data);

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
      // console.error(
      //   "[API] Login failed:",
      //   error.response?.data || error.message,
      // );
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

      // For other errors, assume invalid to be safe
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

      // console.log("[API] Validating token...");

      // Call GET /login with Authorization header
      const response = await this.api.get("/login", {
        headers: {
          Accept: "application/json",
          Authorization: this.token,
        },
      });

      // console.log(
      //   "[API] Token validation response:",
      //   response.status,
      //   response.data,
      // );

      const data = response.data;

      const success = data.success !== false || response.status === 200;

      // If we get 200, token is valid
      return {
        success: success,
        user: data.user,
        admin: data.admin,
        roles: data.roles,
      };
    } catch (error: any) {
      // console.error(
      //   "[API] Token validation failed:",
      //   error.response?.status,
      //   error.message,
      // );

      // If 401, token is invalid
      if (error.response?.status === 401) {
        this.clearToken();
        return { success: false };
      }

      // For other errors, assume invalid to be safe
      return { success: false };
    }
  }

  async search(query: SearchQuery): Promise<SearchResponse> {
    const params: any = {
      query: query.query,
    };

    // Optional: provider plugins
    if (query.providers && query.providers.length > 0) {
      params.provider = query.providers.join(",");
    }

    // Optional: field parameter (defaults to 'none' if not specified)
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

  // Get DICOM file URL
  getDICOMFileUrl(uid: string): string {
    return `${API_BASE_URL}/legacy/file?uid=${uid}`;
  }

  // Get image thumbnail
  getThumbnail(uid: string): string {
    return `${API_BASE_URL}/dic2png?thumbnail=true&SOPInstanceUID=${uid}`;
  }

  getImage(uid: string): string {
    return `${API_BASE_URL}/dic2png?thumbnail=false&SOPInstanceUID=${uid}`;
  }

  // Get Weasis viewer URL
}

export const apiService = new ApiService();
export default apiService;
