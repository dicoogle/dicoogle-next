export interface FileEntry {
  id: string;
  name: string;
  isDir: boolean;
  path: string;
}

export interface FolderChainItem {
  id: string;
  name: string;
  isDir: boolean;
  path: string;
}

export interface FilesystemResponse {
  files: FileEntry[];
  folderChain: FolderChainItem[];
  currentPath: string;
}

export interface FilesystemRootsResponse {
  roots: string[];
}

class FilesystemService {
  private baseUrl = import.meta.env.VITE_FILESYSTEM_API_BASE_URL || 'http://localhost:3333/api/filesystem';



  async getRoots(): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/roots`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to fetch roots' }));
      throw new Error(errorData.error || 'Failed to fetch filesystem roots');
    }

    const data: FilesystemRootsResponse = await response.json();
    return data.roots;
  }

  async getDirectory(path: string): Promise<FilesystemResponse> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to fetch directory' }));
      throw new Error(errorData.error || `Failed to fetch directory: ${path}`);
    }

    return response.json();
  }
}

export const filesystemService = new FilesystemService();
