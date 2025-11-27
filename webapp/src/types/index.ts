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
