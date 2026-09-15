# in(REF)ens Security and Privacy

## Network Use

This plugin does not make any network requests of its own. When you click a citation link, it opens a page on [*wol.jw.org*](https://wol.jw.org) in your browser — exactly as if you had pasted the link yourself. The plugin only constructs the URL; it does not fetch or read anything from the network.

**No telemetry, tracking, or third-party services** are used. **No HTML web-scraping** is involved.

---

## Privacy

**No data is collected, stored, or transmitted.** The plugin reads only the text of your notes, in memory, to detect citations. The plugin never reads or writes the system clipboard.

---

## WASM Module

This plugin includes a WebAssembly (WASM) parsing engine binary compiled from Rust. The WASM module is **embedded** in the plugin file and is not loaded from any external source.

The WASM module:
- Does not make any network requests
- Does not access the file system
- Does not read or modify DOM directly

---

## TypeScript Warnings

The plugin source contains some TypeScript strictness warnings inherent to JavaScript interop (e.g., `JSON.parse` returning `any`, WASM module type casting). **These warnings are cosmetic and do not affect functionality or security**.