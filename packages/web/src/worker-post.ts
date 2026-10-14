// The worker's own scope and its messages to the app, shared by the worker's modules.
/// <reference lib="webworker" />
import type { FromWorker } from './protocol';

export const ctx = self as unknown as DedicatedWorkerGlobalScope;
export const post = (m: FromWorker) => ctx.postMessage(m);

/**
 * Lets the messages queued meanwhile in, so their ids are known: a message to itself is
 * queued behind them (a timer can run ahead of them).
 */
const tick = new MessageChannel();
const ticks: (() => void)[] = [];
tick.port1.onmessage = () => ticks.shift()?.();
export const nextTask = () =>
  new Promise<void>((r) => {
    ticks.push(r);
    tick.port2.postMessage(0);
  });

/** How long work done in steps holds the worker before queued messages get their turn. */
const SLICE_MS = 8;

/**
 * Runs a generator made of small steps (the routing package's *InSteps functions) to its
 * end, SLICE_MS at a time, letting the messages queued meanwhile (a tap) in between.
 */
export async function inSlices<T>(steps: Generator<void, T>): Promise<T> {
  for (let start = performance.now(); ;) {
    const s = steps.next();
    if (s.done) return s.value;
    if (performance.now() - start < SLICE_MS) continue;
    await nextTask();
    start = performance.now();
  }
}
