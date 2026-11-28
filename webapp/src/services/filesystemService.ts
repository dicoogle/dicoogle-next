import { getAppConfig, resolveApiBaseUrl } from "@/config/appConfig";

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
  private get apiBaseUrl(): string {
    return resolveApiBaseUrl();
  }

  private get configuredStartPath(): string | null {
    return this.resolveConfiguredStartPath();
  }

  private normalizeClientPath(value: string): string {
    return value.replace(/\\/g, "/");
  }

  private resolveConfiguredStartPath(): string | null {
    const envPath = getAppConfig().filesystemStartPath;
    if (!envPath || typeof envPath !== "string") {
      return null;
    }

    const trimmed = envPath.trim();
    if (!trimmed) {
      return null;
    }

    return this.normalizeClientPath(trimmed);
  }

  private buildFolderChain(currentPath: string): FolderChainItem[] {
    if (!currentPath) {
      return [];
    }

    const normalized = this.normalizeClientPath(currentPath);
    const chain: FolderChainItem[] = [];

    const windowsDriveMatch = normalized.match(/^([A-Za-z]:)(?:\/)?/);
    if (windowsDriveMatch) {
      const drive = windowsDriveMatch[1];
      chain.push({ id: `${drive}/`, name: drive, isDir: true, path: `${drive}/` });

      const rest = normalized.slice(windowsDriveMatch[0].length).split("/").filter(Boolean);
      let accumulated = `${drive}/`;
      for (const part of rest) {
        accumulated = `${accumulated}${part}/`;
        chain.push({
          id: accumulated,
          name: part,
          isDir: true,
          path: accumulated,
        });
      }

      return chain;
    }

    if (normalized.startsWith("/")) {
      chain.push({ id: "/", name: "/", isDir: true, path: "/" });
      const parts = normalized.split("/").filter(Boolean);
      let accumulated = "";
      for (const part of parts) {
        accumulated += `/${part}`;
        chain.push({
          id: accumulated,
          name: part,
          isDir: true,
          path: accumulated,
        });
      }
      return chain;
    }

    return [
      {
        id: normalized,
        name: normalized,
        isDir: true,
        path: normalized,
      },
    ];
  }

  private parsePathContentsXml(xmlText: string): {
    currentPath: string;
    directories: FileEntry[];
  } {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "application/xml");
    const parserError = doc.querySelector("parsererror");
    if (parserError) {
      throw new Error("Invalid XML response from indexer endpoint");
    }

    const contents = doc.querySelector("contents");
    if (!contents) {
      throw new Error("Unexpected indexer response format");
    }

    const currentPath = this.normalizeClientPath(contents.getAttribute("path") || "");

    const directories: FileEntry[] = Array.from(contents.querySelectorAll("directory")).map(
      (node) => {
        const rawPath = node.getAttribute("path") || "";
        const rawName = node.getAttribute("name") || rawPath;
        const path = this.normalizeClientPath(rawPath);
        return {
          id: path,
          name: rawName,
          isDir: true,
          path,
        };
      },
    );

    return { currentPath, directories };
  }

  private async fetchPathContents(path?: string): Promise<{
    currentPath: string;
    directories: FileEntry[];
  }> {
    const endpoint = new URL(`${this.apiBaseUrl}/indexer`);
    endpoint.searchParams.set("action", "pathcontents");
    if (path && path.trim()) {
      endpoint.searchParams.set("path", path);
    }

    const response = await fetch(endpoint.toString(), {
      headers: {
        Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(errorText || "Failed to fetch directory contents");
    }

    const xmlText = await response.text();
    return this.parsePathContentsXml(xmlText);
  }



  async getRoots(): Promise<string[]> {
    if (this.configuredStartPath) {
      return [this.configuredStartPath];
    }

    const data = await this.fetchPathContents("");
    return data.directories.map((entry) => entry.path);
  }

  async getDirectory(path: string): Promise<FilesystemResponse> {
    const data = await this.fetchPathContents(path);
    return {
      files: data.directories,
      folderChain: this.buildFolderChain(data.currentPath),
      currentPath: data.currentPath,
    };
  }
}

export const filesystemService = new FilesystemService();
