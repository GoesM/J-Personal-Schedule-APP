// isomorphic-git's ESM build references the Node-style Buffer global.
// Supply the browser implementation without enabling Node in the renderer.
import { Buffer } from "buffer";
globalThis.Buffer ??= Buffer;
export { Buffer };
