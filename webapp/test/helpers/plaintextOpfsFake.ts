import type {
  NativeFramePlaintextOpfsDirectoryHandle,
  NativeFramePlaintextOpfsFileHandle,
  NativeFramePlaintextOpfsLock,
  NativeFramePlaintextOpfsLockManager,
  NativeFramePlaintextOpfsWritable,
} from "../../src/services/nativeFramePlaintextOpfs";

export function notFound(name: string): Error {
  const error = new Error(`not found: ${name}`);
  error.name = "NotFoundError";
  return error;
}

export function quotaError(): Error {
  const error = new Error("quota exceeded");
  error.name = "QuotaExceededError";
  return error;
}

export class FakeFileData {
  constructor(readonly data: Uint8Array) {}
  get size(): number {
    return this.data.byteLength;
  }
  slice(start = 0, end = this.size): { arrayBuffer(): Promise<ArrayBuffer> } {
    const copy = this.data.slice(start, end);
    return {
      async arrayBuffer() {
        return copy.buffer as ArrayBuffer;
      },
    };
  }
  async text(): Promise<string> {
    return new TextDecoder().decode(this.data);
  }
}

export class FakeWritable implements NativeFramePlaintextOpfsWritable {
  private chunks: Uint8Array[] = [];
  private closed = false;
  constructor(private readonly handle: FakeFileHandle) {}
  async write(data: Uint8Array): Promise<void> {
    if (this.closed) throw new Error("writable closed");
    const root = this.handle.dir.root;
    if (root.failNextWrite) {
      root.failNextWrite = false;
      throw new Error("synthetic write failure");
    }
    const next =
      this.chunks.reduce((total, chunk) => total + chunk.byteLength, 0) +
      data.byteLength;
    if (root.quotaBytes !== null && root.totalBytes() + next > root.quotaBytes) {
      throw quotaError();
    }
    this.chunks.push(data.slice());
  }
  async close(): Promise<void> {
    if (this.closed) return;
    const total = this.chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const data = new Uint8Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    this.handle.data = data;
    if (this.handle.dir.root.writeGate) {
      await this.handle.dir.root.writeGate;
    }
    if (this.handle.dir.root.writeDelayMs > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.handle.dir.root.writeDelayMs),
      );
    }
    this.closed = true;
  }
  async abort(): Promise<void> {
    this.chunks = [];
    this.closed = true;
  }
}

export class FakeFileHandle implements NativeFramePlaintextOpfsFileHandle {
  readonly kind = "file" as const;
  constructor(
    public name: string,
    readonly dir: FakeDirectory,
    public data = new Uint8Array(),
  ) {}
  async getFile(): Promise<FakeFileData> {
    return new FakeFileData(this.data.slice());
  }
  async createWritable(): Promise<FakeWritable> {
    return new FakeWritable(this);
  }
  async move(name: string): Promise<void> {
    if (this.dir.root.failNextMove) {
      this.dir.root.failNextMove = false;
      throw new Error("synthetic move failure");
    }
    this.dir.moveFile(this.name, name);
    this.name = name;
  }
}

export class FakeDirectory implements NativeFramePlaintextOpfsDirectoryHandle {
  readonly kind = "directory" as const;
  readonly children = new Map<string, FakeDirectory | FakeFileHandle>();
  readonly failRemove = new Set<string>();
  readonly root: FakeDirectory;
  quotaBytes: number | null = null;
  writeDelayMs = 0;
  writeGate: Promise<void> | null = null;
  deleteGate: Promise<void> | null = null;
  failNextWrite = false;
  failNextMove = false;

  constructor(readonly name: string, root?: FakeDirectory) {
    this.root = root ?? this;
  }

  async getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FakeDirectory> {
    const existing = this.children.get(name);
    if (existing) {
      if (!(existing instanceof FakeDirectory)) throw notFound(name);
      return existing;
    }
    if (!options?.create) throw notFound(name);
    const child = new FakeDirectory(name, this.root);
    this.children.set(name, child);
    return child;
  }

  async getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FakeFileHandle> {
    const existing = this.children.get(name);
    if (existing) {
      if (existing instanceof FakeDirectory) throw notFound(name);
      return existing;
    }
    if (!options?.create) throw notFound(name);
    const child = new FakeFileHandle(name, this);
    this.children.set(name, child);
    return child;
  }

  async removeEntry(
    name: string,
    options?: { recursive?: boolean },
  ): Promise<void> {
    if (this.root.deleteGate) await this.root.deleteGate;
    if (this.failRemove.has(name)) {
      throw new Error(`synthetic delete failure: ${name}`);
    }
    const existing = this.children.get(name);
    if (!existing) throw notFound(name);
    if (existing instanceof FakeDirectory && !options?.recursive) {
      throw new Error("directory is not empty");
    }
    this.children.delete(name);
  }

  async *entries(): AsyncIterableIterator<
    [string, FakeDirectory | FakeFileHandle]
  > {
    for (const entry of this.children.entries()) yield entry;
  }

  moveFile(from: string, to: string): void {
    const file = this.children.get(from);
    if (!(file instanceof FakeFileHandle)) throw notFound(from);
    this.children.delete(from);
    this.children.set(to, new FakeFileHandle(to, this, file.data));
  }

  totalBytes(): number {
    let total = 0;
    for (const child of this.children.values()) {
      total += child instanceof FakeDirectory ? child.totalBytes() : child.data.byteLength;
    }
    return total;
  }

  file(name: string): FakeFileHandle | null {
    const child = this.children.get(name);
    return child instanceof FakeFileHandle ? child : null;
  }

  directory(name: string): FakeDirectory | null {
    const child = this.children.get(name);
    return child instanceof FakeDirectory ? child : null;
  }
}

export class FakeLocks implements NativeFramePlaintextOpfsLockManager {
  readonly supported = true;
  readonly held = new Set<string>();
  async acquire(name: string): Promise<NativeFramePlaintextOpfsLock | null> {
    if (this.held.has(name)) return null;
    this.held.add(name);
    return { release: () => this.held.delete(name) };
  }
  forceReleaseAll(): void {
    this.held.clear();
  }
}

export function createFakeRoot(): FakeDirectory {
  return new FakeDirectory("root");
}
