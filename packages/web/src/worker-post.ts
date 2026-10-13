// The worker's own scope and its messages to the app, shared by the worker's modules.
/// <reference lib="webworker" />
import type { FromWorker } from './protocol';

export const ctx = self as unknown as DedicatedWorkerGlobalScope;
export const post = (m: FromWorker) => ctx.postMessage(m);
