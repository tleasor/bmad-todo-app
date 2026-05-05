import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { SolidPlugin } from "bun-plugin-solid";

// happy-dom registers DOM globals that @solidjs/testing-library needs (document,
// window, HTMLElement, etc.), but it also overwrites Bun's native fetch primitives
// (Response, Request, Blob, Headers, FormData, fetch). Backend tests in apps/api
// depend on Bun's native Response/Blob — without this restore, `await res.text()`
// returns "[object Blob]" against Bun.file responses. Solid rendering does not use
// fetch primitives, so restoring them is safe for the frontend tests.
const PRESERVED_BUN_NATIVES = [
  "Response",
  "Request",
  "Blob",
  "Headers",
  "FormData",
  "fetch",
] as const;

if (!GlobalRegistrator.isRegistered) {
  const saved = new Map<string, PropertyDescriptor>();
  for (const key of PRESERVED_BUN_NATIVES) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    if (descriptor) saved.set(key, descriptor);
  }

  GlobalRegistrator.register();

  for (const [key, descriptor] of saved) {
    Object.defineProperty(globalThis, key, { ...descriptor, configurable: true });
  }
}

// Solid does not provide a runtime JSX runtime — it relies on babel-plugin-jsx-dom-expressions
// to compile JSX into reactive imperative DOM operations. Vite uses vite-plugin-solid for this
// at build time; for `bun test` we register bun-plugin-solid so .tsx files passing through Bun's
// loader get the same Solid babel transform.
//
// Tests must run with `--conditions=browser` so solid-js's package.json `exports` resolves to
// the client build (dist/solid.js, dist/web.js). Bun's default condition set is `node`-first,
// which matches solid-js's SSR exports first and breaks render() with "Client-only API called
// on the server side". The `test` script in the root package.json passes the flag.
Bun.plugin(SolidPlugin());
