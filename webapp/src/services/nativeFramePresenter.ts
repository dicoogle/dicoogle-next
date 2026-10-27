import * as cornerstone from "@cornerstonejs/core";
import { Enums as cornerstoneEnums } from "@cornerstonejs/core";
import type { WrappedSingleFrame } from "./nativeFrameContract";

export interface FramePresenter {
  begin(requestId: number): void;
  present(requestId: number, wrapped: WrappedSingleFrame): Promise<string | null>;
  close(): void;
  registrationCount(): number;
}

interface FrameSlot {
  requestId: number;
  element: HTMLDivElement;
  viewportId: string;
  imageId: string;
  objectUrl: string;
}

const ENGINE_ID = "dicoogleNativeFrameEngine";
let viewportSequence = 0;

export class CornerstoneFramePresenter implements FramePresenter {
  private engine: cornerstone.RenderingEngine | null = null;
  private current: FrameSlot | null = null;
  private pending: FrameSlot | null = null;
  private latestRequestId = 0;
  private closed = false;

  constructor(private readonly host: HTMLElement) {}

  begin(requestId: number): void {
    if (this.closed) {
      return;
    }
    this.latestRequestId = requestId;
    this.disposePending();
  }

  async present(
    requestId: number,
    wrapped: WrappedSingleFrame,
  ): Promise<string | null> {
    if (this.closed || requestId !== this.latestRequestId) {
      return null;
    }

    this.disposePending();
    const objectUrl = URL.createObjectURL(wrapped.blob);
    const imageId = `wadouri:${objectUrl}`;
    const viewportId = `native-frame-${++viewportSequence}`;
    const element = document.createElement("div");
    element.dataset.nativeFrameViewport = viewportId;
    element.style.position = "absolute";
    element.style.inset = "0";
    element.style.visibility = "hidden";
    element.style.pointerEvents = "none";
    this.host.appendChild(element);

    const slot: FrameSlot = {
      requestId,
      element,
      viewportId,
      imageId,
      objectUrl,
    };
    this.pending = slot;

    try {
      const engine = this.ensureEngine();
      engine.enableElement({
        viewportId,
        type: cornerstoneEnums.ViewportType.STACK,
        element,
        defaultOptions: {
          background: [0, 0, 0],
        },
      });
      const viewport = engine.getViewport(viewportId) as cornerstone.StackViewport;
      await viewport.setStack([imageId], 0);

      if (this.closed || requestId !== this.latestRequestId || this.pending !== slot) {
        this.disposeSlot(slot);
        return null;
      }

      viewport.render();

      if (this.closed || requestId !== this.latestRequestId || this.pending !== slot) {
        this.disposeSlot(slot);
        return null;
      }

      this.commit(slot);
      return imageId;
    } catch (error) {
      this.disposeSlot(slot);
      if (this.closed || requestId !== this.latestRequestId) {
        return null;
      }
      throw error;
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.latestRequestId += 1;
    this.disposePending();
    if (this.current) {
      this.disposeSlot(this.current);
      this.current = null;
    }
    if (this.engine) {
      try {
        this.engine.destroy();
      } catch {
        this.engine = null;
      }
      this.engine = null;
    }
  }

  registrationCount(): number {
    return (this.current ? 1 : 0) + (this.pending ? 1 : 0);
  }

  private ensureEngine(): cornerstone.RenderingEngine {
    if (!this.engine) {
      this.engine = new cornerstone.RenderingEngine(ENGINE_ID);
    }
    return this.engine;
  }

  private commit(slot: FrameSlot): void {
    slot.element.style.visibility = "visible";
    slot.element.style.pointerEvents = "auto";
    const previous = this.current;
    this.current = slot;
    this.pending = null;
    if (previous) {
      this.disposeSlot(previous);
    }
  }

  private disposePending(): void {
    if (this.pending) {
      const pending = this.pending;
      this.pending = null;
      this.disposeSlot(pending);
    }
  }

  private disposeSlot(slot: FrameSlot): void {
    if (this.pending === slot) {
      this.pending = null;
    }
    if (this.current === slot) {
      this.current = null;
    }
    try {
      cornerstone.imageLoader.cancelLoadImage(slot.imageId);
    } catch (error) {
      console.debug(error);
    }
    try {
      cornerstone.cache.removeImageLoadObject(slot.imageId);
    } catch (error) {
      console.debug(error);
    }
    if (this.engine) {
      try {
        this.engine.disableElement(slot.viewportId);
      } catch (error) {
        console.debug(error);
      }
    }
    slot.element.remove();
    try {
      URL.revokeObjectURL(slot.objectUrl);
    } catch (error) {
      console.debug(error);
    }
  }
}
