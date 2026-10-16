// PGlite databases close after each test. Release their WASM memory promptly
// for reproducible serial verification on 4 GB laptops.
import { afterEach } from "node:test";
afterEach(() => globalThis.gc?.());
