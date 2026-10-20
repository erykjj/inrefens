// engine-wrapper.ts

// @ts-ignore
import * as wasmModuleUntyped from './engine.js';
import wasmBinary from './engine_bg.wasm';
import { App } from 'obsidian';
import { Citation, InrefensEngineInstance, InrefensEngineModule, LanguageInfo } from './types';

const WASM_START = '/*WASM-START*/';
const WASM_END = '/*WASM-END*/';
const H_START = 2166136261;
const H_END = 16777619;
const wasmModule = wasmModuleUntyped as unknown as InrefensEngineModule;

let engineInitialized = false;
let engineInstance: InrefensEngineInstance | null = null;
let cachedLanguages: LanguageInfo[] | null = null;
let engineId = 0;

// ──────────────────────────────────────────────
// Initialization
// ──────────────────────────────────────────────

function stripTrailingCommentsAndBlanks(text: string): string {
    let end = text.length;
    for (;;) {
        while (end > 0) {
            const c = text.charCodeAt(end - 1);
            if (c === 0x20 || c === 0x09 || c === 0x0A || c === 0x0D || c === 0x0C || c === 0x0B) {
                end--;
            } else {
                break;
            }
        }
        if (end >= 4 && text.charCodeAt(end - 1) === 0x2F /* / */ && text.charCodeAt(end - 2) === 0x2A /* * */) {
            const open = text.lastIndexOf('/*', end - 2);
            if (open !== -1 && !text.slice(open + 2, end - 2).includes('*/')) {
                end = open;
                continue;
            }
        }
        const lastNl = text.lastIndexOf('\n', end - 1);
        const lineStart = lastNl + 1;
        if (end - lineStart >= 2 && text.charCodeAt(lineStart) === 0x2F && text.charCodeAt(lineStart + 1) === 0x2F) {
            end = lineStart;
            continue;
        }
        break;
    }
    return text.slice(0, end);
}

export async function initEngine(app: App, language: string): Promise<void> {
    if (engineInitialized) return;

    const configDir = app.vault.configDir;
    let mainJsText = await app.vault.adapter.read(`${configDir}/plugins/inrefens/main.js`);
    mainJsText = stripTrailingCommentsAndBlanks(mainJsText);
    const wsIdx = mainJsText.indexOf(WASM_START);
    if (wsIdx === -1) throw new Error('engine: WASM-START marker not found');
    const weIdx = mainJsText.indexOf(WASM_END, wsIdx);
    if (weIdx === -1) throw new Error('engine: WASM-END marker not found');
    const stripped = mainJsText.slice(0, wsIdx) + mainJsText.slice(weIdx + WASM_END.length);
    const bytes = new TextEncoder().encode(stripped);
    let h = H_START;
    for (let i = 0; i < bytes.length; i++) {
        h ^= bytes[i];
        h = Math.imul(h, H_END) >>> 0;
    }
    engineId = h >>> 0;

    const payload = wasmBinary.slice(
        wasmBinary.indexOf(WASM_START) + WASM_START.length,
        wasmBinary.indexOf(WASM_END)
    );
    const wasmBin = Uint8Array.from(atob(payload), c => c.charCodeAt(0));
    await wasmModule.default({ module_or_path: wasmBin });

    const travertureEnabled = isPluginEnabled(app, 'traverture');
    engineInstance = new wasmModule.InrefensEngine(language, travertureEnabled, engineId);
    engineInitialized = true;
}

function isPluginEnabled(app: App, pluginId: string): boolean {
    const plugins = (app as unknown as {
        plugins?: { enabledPlugins?: Set<string> };
    }).plugins;
    return plugins?.enabledPlugins?.has(pluginId) ?? false;
}

export function isEngineReady(): boolean {
    return engineInitialized && engineInstance !== null;
}

export function resetEngine(): void {
    engineInstance = null;
    engineInitialized = false;
    cachedLanguages = null;
}

// ──────────────────────────────────────────────
// Engine access
// ──────────────────────────────────────────────

export function findCitations(text: string): Citation[] | null {
    if (!engineInstance) return null;
    try {
        const json = engineInstance.find_citations(text);
        return JSON.parse(json) as Citation[];
    } catch (e) {
        console.error('in(REF)ens: failed to parse citations:', e);
        return null;
    }
}

export function buildDelimitedUrl(text: string): string {
    if (!engineInstance) return '';
    try {
        return engineInstance.build_delimited_url(text);
    } catch {
        return '';
    }
}

export function getDelimitedQuery(text: string): string {
    if (!engineInstance) return '';
    try {
        return engineInstance.get_delimited_query(text);
    } catch {
        return '';
    }
}

export function buildWolUrl(query: string): string {
    if (!engineInstance) return '';
    try {
        return engineInstance.build_wol_url_for_query(query);
    } catch {
        return '';
    }
}

export function getEngineVersion(): string {
    if (!engineInitialized) return 'Engine not initialized';
    try {
        return wasmModule.InrefensEngine.get_version();
    } catch {
        return 'Unknown';
    }
}

function getAvailableLanguages(): LanguageInfo[] {
    if (!engineInitialized) return [];
    try {
        const json = wasmModule.InrefensEngine.get_available_languages();
        return JSON.parse(json) as LanguageInfo[];
    } catch {
        return [];
    }
}

export function getAvailableLanguagesCached(): LanguageInfo[] {
    if (!cachedLanguages) {
        cachedLanguages = getAvailableLanguages();
    }
    return cachedLanguages;
}