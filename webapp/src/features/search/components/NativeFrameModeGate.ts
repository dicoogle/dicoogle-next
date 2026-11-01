export interface NativeFrameModeGate {
  isBusy(): boolean;
  run(operation: () => Promise<void>): Promise<boolean>;
}

export function createNativeFrameModeGate(): NativeFrameModeGate {
  let busy = false;
  return {
    isBusy: () => busy,
    async run(operation) {
      if (busy) {
        return false;
      }
      busy = true;
      try {
        await operation();
        return true;
      } finally {
        busy = false;
      }
    },
  };
}
