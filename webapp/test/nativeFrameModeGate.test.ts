import assert from "node:assert/strict";
import { test } from "node:test";
import { createNativeFrameModeGate } from "../src/features/search/components/NativeFrameModeGate";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("rapid mode clicks enter one operation while the gate is busy", async () => {
  const gate = createNativeFrameModeGate();
  const pending = deferred();
  let calls = 0;
  const first = gate.run(async () => {
    calls += 1;
    await pending.promise;
  });
  const second = gate.run(async () => {
    calls += 1;
  });
  const third = gate.run(async () => {
    calls += 1;
  });
  assert.equal(gate.isBusy(), true);
  assert.equal(await second, false);
  assert.equal(await third, false);
  pending.resolve();
  assert.equal(await first, true);
  assert.equal(calls, 1);
  assert.equal(gate.isBusy(), false);
  assert.equal(await gate.run(async () => undefined), true);
});
