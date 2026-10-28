export const NATIVE_FRAME_PREFETCH_RULE = "next-in-direction";

export const DEFAULT_NATIVE_FRAME_PREFETCH_LIMITS = Object.freeze({
  maxQueuedFrames: 1,
  maxInFlightFrames: 1,
});

export interface NativeFramePrefetchTarget {
  readonly direction: -1 | 1;
  readonly targetFrame: number;
}

export function calculateNativeFramePrefetchTarget(
  currentFrame: number,
  previousFrame: number | null,
  numberOfFrames: number,
  windowStart: number,
  windowEnd: number,
): NativeFramePrefetchTarget | null {
  if (
    previousFrame === null ||
    currentFrame === previousFrame ||
    !Number.isSafeInteger(currentFrame) ||
    !Number.isSafeInteger(previousFrame) ||
    !Number.isSafeInteger(numberOfFrames) ||
    currentFrame < 1 ||
    currentFrame > numberOfFrames
  ) {
    return null;
  }
  const direction: -1 | 1 = currentFrame > previousFrame ? 1 : -1;
  const rawTarget = currentFrame + direction;
  const targetFrame = Math.min(numberOfFrames, Math.max(1, rawTarget));
  if (
    targetFrame === currentFrame ||
    targetFrame < windowStart ||
    targetFrame > windowEnd
  ) {
    return null;
  }
  return Object.freeze({ direction, targetFrame });
}
