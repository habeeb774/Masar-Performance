// Lets maintenance scripts import server services: "server-only" resolves to an empty module
// (as in the integration tests). Loaded with: node --import ./scripts/support/server-only-shim.mjs
import { registerHooks } from "node:module";

const EMPTY = new URL("./empty.cjs", import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: EMPTY, format: "commonjs", shortCircuit: true };
    return next(specifier, context);
  },
});
