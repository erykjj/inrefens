// main.ts

import { Notice, Plugin, MarkdownView } from 'obsidian';
import { createInrefensEditorPlugin, requestInrefensFullRescan } from './editor';
import { initEngine, isEngineReady, resetEngine, buildWolUrl } from './engine-wrapper';
import { processElement } from './post-processor';
import { InrefensSettingTab } from './settings';
import { DEFAULT_SETTINGS, InrefensSettings } from './types';

export default class InrefensPlugin extends Plugin {
    settings: InrefensSettings = DEFAULT_SETTINGS;

    private bootstrapPromise: Promise<void> = Promise.resolve();
    private unloaded = false;
    private settingTab: InrefensSettingTab | null = null;

    async loadSettings() {
        const saved = await this.loadData() as Partial<InrefensSettings> | null;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    private queueEngineInit(reset: boolean, notify: boolean): Promise<void> {
        this.bootstrapPromise = this.bootstrapPromise.then(async () => {
            if (this.unloaded) return;
            if (reset) resetEngine();
            try {
                await initEngine(this.app, this.settings.language);
            } catch (e) {
                console.error('in(REF)ens: engine initialization failed:', e);
                if (notify) new Notice('in(REF)ens: Failed to initialize engine.');
                return;
            }
            if (this.unloaded) {
                resetEngine();
                return;
            }
            if (!isEngineReady()) {
                console.warn('in(REF)ens: engine not ready after initialization');
                return;
            }
            this.settingTab?.refreshLanguages();
            this.refreshReadingViewLinks();
            this.reprocessReadingViews();
            this.refreshEditorDecorations();
        });
        return this.bootstrapPromise;
    }

    async reloadEngine(): Promise<void> {
        await this.queueEngineInit(true, false);
    }

    private refreshEditorDecorations(): void {
        requestInrefensFullRescan();
        this.app.workspace.iterateAllLeaves(leaf => {
            const view = leaf.view;
            if (!(view instanceof MarkdownView)) return;
            const editorView = (view.editor as unknown as { cm?: unknown }).cm;
            const cmView = editorView as { dispatch?: (spec: unknown) => void } | undefined;
            if (cmView?.dispatch) {
                cmView.dispatch({});
            }
        });
    }

    private refreshReadingViewLinks(): void {
        this.app.workspace.iterateAllLeaves(leaf => {
            const container = leaf.view.containerEl;
            if (!container) return;
            container.querySelectorAll('.inrefens-link[data-inrefens-query]').forEach(el => {
                const query = el.getAttribute('data-inrefens-query');
                if (!query) return;
                const url = buildWolUrl(query);
                if (url && el.instanceOf(HTMLAnchorElement)) {
                    el.href = url;
                }
            });
        });
    }

    private reprocessReadingViews(): void {
        this.app.workspace.iterateAllLeaves(leaf => {
            const container = leaf.view.containerEl;
            if (!container) return;
            const processed = Array.from(container.querySelectorAll('.inrefens-processed'));
            for (const el of processed) {
                el.classList.remove('inrefens-processed');
            }
            for (const el of processed) {
                if (el.instanceOf(HTMLElement)) {
                    processElement(el);
                }
            }
        });
    }

    applyLinkColor(): void {
        const color = this.settings.linkColor;
        const root = activeDocument.documentElement;
        if (color && color.trim() !== '') {
            root.style.setProperty('--inrefens-link-color', color.trim());
        } else {
            root.style.removeProperty('--inrefens-link-color');
        }
    }

    async onload() {
        await this.loadSettings();
        this.applyLinkColor();

        this.settingTab = new InrefensSettingTab(this.app, this);
        this.addSettingTab(this.settingTab);
        this.registerEditorExtension(createInrefensEditorPlugin());
        this.registerMarkdownPostProcessor(processElement);

        this.app.workspace.onLayoutReady(() => {
            void this.queueEngineInit(false, true);
        });
    }

    onunload() {
        this.unloaded = true;
        void this.bootstrapPromise.then(() => resetEngine());
    }
}