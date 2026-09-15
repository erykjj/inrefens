// engine-wrapper.ts

import { App } from 'obsidian';
// @ts-expect-error
import * as wasmModuleUntyped from './engine.js';
// @ts-expect-error
import wasmBinary from './engine_bg.wasm';
import { Citation, InrefensEngineInstance, InrefensEngineModule, LanguageInfo } from './types';

const wasmModule = wasmModuleUntyped as unknown as InrefensEngineModule;

let engineInitialized = false;
let engineInstance: InrefensEngineInstance | null = null;
let cachedLanguages: LanguageInfo[] | null = null;

// ──────────────────────────────────────────────
// Integrity check
// ──────────────────────────────────────────────

function fnv1a(text: string): number {
    const FNV_OFFSET = 2166136261;
    const FNV_PRIME = 16777619;
    let hash = FNV_OFFSET;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, FNV_PRIME) >>> 0;
    }
    return hash >>> 0;
}

function findOccurrence(text: string, marker: string): number {
    const first = text.indexOf(marker);
    if (first === -1) return -1;
    return text.indexOf(marker, first + 1);
}

async function checkHealth(app: App): Promise<number> {
    const adapter = app.vault.adapter;
    const configDir = app.vault.configDir;
    const mainJsPath = `${configDir}/plugins/inrefens/main.js`;
    const mainJsContent = await adapter.read(mainJsPath);
    const startMarker = '.PluginSettingTab {';
    const hashLength = 5000;
    const startPos = findOccurrence(mainJsContent, startMarker);
    if (startPos === -1) {
        throw new Error('in(REF)ens: integrity check FAILED!');
    }
    const integritySection = mainJsContent.substring(startPos, startPos + hashLength);
    const normalized = integritySection.replace(/\s+/g, '');
    return fnv1a(normalized);
}

// ──────────────────────────────────────────────
// Initialization
// ──────────────────────────────────────────────

export async function initEngine(app: App, language: string): Promise<void> {
    if (engineInitialized) return;

    const generatedHash = await checkHealth(app);
    await wasmModule.default({ module_or_path: wasmBinary });

    const instance = new wasmModule.InrefensEngine(language);
    if (!instance.verify_integrity(generatedHash)) {
        throw new Error('in(REF)ens: integrity check FAILED!');
    }

    engineInstance = instance;
    engineInitialized = true;
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