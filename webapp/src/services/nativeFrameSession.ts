import {
  invalidRequest,
  isAbortError,
  NativeFrameError,
  type NativeFrameContext,
  type NativeFrameLocator,
  type WrappedSingleFrame,
} from "./nativeFrameContract";
import {
  fetchInstanceMetadata,
  type InstanceMetadata,
  type InstanceMetadataOptions,
} from "./nativeFrameMetadata";
import { buildWrappedSingleFramePart10 } from "./nativeFramePart10";
import type { FramePresenter } from "./nativeFramePresenter";
import { fetchNativeFrame } from "./nativeFrameTransport";

type MetadataLoader = (
  locator: NativeFrameLocator,
  options: InstanceMetadataOptions,
) => Promise<InstanceMetadata>;

type FrameLoader = typeof fetchNativeFrame;
type WrapperBuilder = (
  locator: NativeFrameLocator,
  context: NativeFrameContext,
  pixels: Uint8Array,
) => WrappedSingleFrame;

export interface NativeFrameSessionOptions {
  baseUrl: string;
  token?: string | null;
  presenter: FramePresenter;
  fetchImpl?: typeof fetch;
  loadMetadata?: MetadataLoader;
  loadFrame?: FrameLoader;
  buildWrapped?: WrapperBuilder;
  now?: () => number;
}

export type FrameSelectionResult =
  | { status: "stale" }
  | {
      status: "presented";
      requestId: number;
      frameNumber: number;
      imageId: string;
      selectionToFrameResponseMs: number;
      selectionToFrameCommittedMs: number;
    };

export class NativeFrameSession {
  private readonly metadataLoader: MetadataLoader;
  private readonly frameLoader: FrameLoader;
  private readonly wrapperBuilder: WrapperBuilder;
  private readonly now: () => number;
  private context: NativeFrameContext | null = null;
  private metadataAbort: AbortController | null = null;
  private frameAbort: AbortController | null = null;
  private generation = 0;
  private closed = false;

  constructor(
    private readonly locator: NativeFrameLocator,
    private readonly options: NativeFrameSessionOptions,
  ) {
    this.metadataLoader = options.loadMetadata ?? fetchInstanceMetadata;
    this.frameLoader = options.loadFrame ?? fetchNativeFrame;
    this.wrapperBuilder = options.buildWrapped ?? buildWrappedSingleFramePart10;
    this.now = options.now ?? (() => performance.now());
  }

  async open(): Promise<NativeFrameContext> {
    this.assertOpen();
    if (this.context) {
      return this.context;
    }

    const controller = new AbortController();
    this.metadataAbort = controller;
    const metadata = await this.metadataLoader(this.locator, {
      baseUrl: this.options.baseUrl,
      token: this.options.token,
      fetchImpl: this.options.fetchImpl,
      signal: controller.signal,
    });

    if (this.closed || this.metadataAbort !== controller) {
      throw new NativeFrameError("invalid-request", "Native-frame session is closed");
    }

    this.metadataAbort = null;
    this.context = metadata.context;
    return metadata.context;
  }

  async selectFrame(frameNumber: number): Promise<FrameSelectionResult> {
    this.assertOpen();
    const context = this.context;
    if (!context) {
      throw invalidRequest("Native-frame metadata has not been loaded");
    }

    const requestId = ++this.generation;
    this.frameAbort?.abort();
    const controller = new AbortController();
    this.frameAbort = controller;
    this.options.presenter.begin(requestId);
    const start = this.now();

    try {
      const payload = await this.frameLoader(
        {
          locator: this.locator,
          context,
          frameNumber,
          signal: controller.signal,
        },
        {
          baseUrl: this.options.baseUrl,
          token: this.options.token,
          fetchImpl: this.options.fetchImpl,
        },
      );
      const responseTime = this.now();

      if (this.isStale(requestId)) {
        return { status: "stale" };
      }

      const wrapped = this.wrapperBuilder(this.locator, context, payload.bytes);
      if (this.isStale(requestId)) {
        return { status: "stale" };
      }

      const imageId = await this.options.presenter.present(requestId, wrapped);
      if (imageId === null || this.isStale(requestId)) {
        return { status: "stale" };
      }

      return {
        status: "presented",
        requestId,
        frameNumber,
        imageId,
        selectionToFrameResponseMs: responseTime - start,
        selectionToFrameCommittedMs: this.now() - start,
      };
    } catch (error) {
      if (this.isStale(requestId) || isAbortError(error)) {
        return { status: "stale" };
      }
      throw error;
    } finally {
      if (this.frameAbort === controller) {
        this.frameAbort = null;
      }
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.generation += 1;
    this.metadataAbort?.abort();
    this.metadataAbort = null;
    this.frameAbort?.abort();
    this.frameAbort = null;
    this.context = null;
    this.options.presenter.close();
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new NativeFrameError("invalid-request", "Native-frame session is closed");
    }
  }

  private isStale(requestId: number): boolean {
    return this.closed || requestId !== this.generation;
  }
}
