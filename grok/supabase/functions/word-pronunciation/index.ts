// Deploy this folder as the Supabase Edge Function `word-pronunciation`.
// Keep the gateway JWT verification enabled; the handler also verifies the
// signed-in learner via Supabase Auth before reading/writing owned records.
import { createHandler } from './core.mjs';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };
const handler = createHandler({ env: (name: string) => Deno.env.get(name) });

Deno.serve((request: Request) => {
  const pending = handler(request);
  // Complete the immutable result write even if a phone disconnects after
  // upstream assessment. Audio lives only for this bounded request.
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(pending.then(() => undefined));
  return pending;
});
