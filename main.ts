// main.ts

import { Plugin, MarkdownView } from 'obsidian';
import { createInrefensEditorPlugin, requestInrefensFullRescan } from './editor';
import { initEngine, isEngineReady, resetEngine, buildWolUrl } from './engine-wrapper';
import { processElement } from './post-processor';
import { InrefensSettingTab } from './settings';
import { DEFAULT_SETTINGS, InrefensSettings } from './types';

export default class InrefensPlugin extends Plugin {
    settings: InrefensSettings = DEFAULT_SETTINGS;

    async loadSettings() {
        const saved = await this.loadData() as Partial<InrefensSettings> | null;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async reloadEngine(): Promise<void> {
        resetEngine();
        try {
            await initEngine(this.app, this.settings.language);
        } catch (e) {
            console.error('in(REF)ens: engine re-initialization failed:', e);
            return;
        }
        this.refreshReadingViewLinks();
        this.refreshEditorDecorations();
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

        try {
            await initEngine(this.app, this.settings.language);
        } catch (e) {
            console.error('in(REF)ens: engine initialization failed:', e);
        }

        this.addSettingTab(new InrefensSettingTab(this.app, this));
        this.registerEditorExtension(createInrefensEditorPlugin());
        this.registerMarkdownPostProcessor(processElement);

        if (!isEngineReady()) {
            console.warn('in(REF)ens: engine not ready!');
        }
    }

    onunload() {
        resetEngine();
    }
}