// settings.ts

import { App, PluginSettingTab, Setting } from 'obsidian';
import { getAvailableLanguagesCached, getEngineVersion } from './engine-wrapper';
import type InrefensPlugin from './main';

/// Preset color choices for the "Link color" dropdown.
/// The empty string means "use the theme's external link color".
const LINK_COLOR_OPTIONS: Array<{ value: string; label: string }> = [
    { value: '',            label: 'Theme default' },
    { value: '#4a6da7',     label: 'Blue' },
    { value: '#059669',     label: 'Green' },
    { value: '#7c3aed',     label: 'Purple' },
    { value: '#dc2626',     label: 'Red' },
    { value: '#eab308',     label: 'Yellow' },
    { value: 'custom',      label: 'Custom (hex)' },
];

export class InrefensSettingTab extends PluginSettingTab {
    plugin: InrefensPlugin;

    constructor(app: App, plugin: InrefensPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // ──────────────────────────────────────────
        // Header
        // ──────────────────────────────────────────
        const headerEl = containerEl.createDiv({ cls: 'inrefens-settings-header' });
        headerEl.createSpan({ text: 'in(REF)ens', cls: 'inrefens-settings-title' });
        const engineVersion = getEngineVersion();
        headerEl.createSpan({
            text: `v${this.plugin.manifest.version} – ${engineVersion}`,
            cls: 'inrefens-version-info',
        });

        // ──────────────────────────────────────────
        // Language
        // ──────────────────────────────────────────
        const languages = getAvailableLanguagesCached()
            .slice()
            .sort((a, b) => a.language_name.localeCompare(b.language_name));
        new Setting(containerEl)
            .setName('Language')
            .setDesc('Language for WOL links')
            .addDropdown(dropdown => {
                for (const lang of languages) {
                    dropdown.addOption(lang.language_code, `${lang.language_name} (${lang.language_code})`);
                }
                dropdown
                    .setValue(this.plugin.settings.language)
                    .onChange(async (value) => {
                        this.plugin.settings.language = value;
                        await this.plugin.saveSettings();
                        await this.plugin.reloadEngine();
                    });
            });

        // ──────────────────────────────────────────
        // Link color
        // ──────────────────────────────────────────
        const savedColor = this.plugin.settings.linkColor ?? '';
        const isPreset = LINK_COLOR_OPTIONS.some(o => o.value === savedColor);
        const dropdownValue = isPreset ? savedColor : 'custom';

        let customTextEl: HTMLInputElement | null = null;

        new Setting(containerEl)
            .setName('Link color')
            .setDesc('Color for citation links. "Theme default" uses the vault\u2019s external-link color. Changing this requires restarting Obsidian.')
            .addDropdown(dropdown => {
                for (const opt of LINK_COLOR_OPTIONS) {
                    dropdown.addOption(opt.value, opt.label);
                }
                dropdown
                    .setValue(dropdownValue)
                    .onChange(async (value) => {
                        if (value === 'custom') {
                            this.plugin.settings.linkColor = this.plugin.settings.linkColor || '';
                        } else {
                            this.plugin.settings.linkColor = value;
                        }
                        await this.plugin.saveSettings();
                        this.plugin.applyLinkColor();
                        if (customTextEl) {
                            if (value === 'custom') {
                                customTextEl.removeClass('inrefens-hidden');
                            } else {
                                customTextEl.addClass('inrefens-hidden');
                            }
                        }
                    });
            })
            .addText(text => {
                customTextEl = text.inputEl;
                text.inputEl.placeholder = '#4a6da7';
                text.setValue(isPreset ? '' : savedColor);
                text.setDisabled(!isPreset && dropdownValue !== 'custom');
                if (dropdownValue !== 'custom') {
                    text.inputEl.addClass('inrefens-hidden');
                }
                text.onChange(async (value) => {
                    this.plugin.settings.linkColor = value.trim();
                    await this.plugin.saveSettings();
                    this.plugin.applyLinkColor();
                });
            });

        // ──────────────────────────────────────────
        // Footer
        // ──────────────────────────────────────────
        const footerEl = containerEl.createDiv({ cls: 'inrefens-settings-footer' });
        const footerText = footerEl.createSpan();
        footerText.appendChild(activeDocument.createTextNode('My other Obsidian plugins: '));

        const conversumStrong = footerText.createEl('strong');
        const conversumLink = conversumStrong.createEl('a', {
            text: 'con[VER]sum',
            href: 'https://github.com/erykjj/conversum',
        });
        conversumLink.setAttribute('target', '_blank');
        conversumLink.setAttribute('rel', 'noopener noreferrer');

        footerText.appendChild(activeDocument.createTextNode(', '));

        const mutextumStrong = footerText.createEl('strong');
        const mutextumLink = mutextumStrong.createEl('a', {
            text: 'mu/TEX/tum',
            href: 'https://github.com/erykjj/mutextum',
        });
        mutextumLink.setAttribute('target', '_blank');
        mutextumLink.setAttribute('rel', 'noopener noreferrer');

        footerText.appendChild(activeDocument.createTextNode(', '));

        const travertureStrong = footerText.createEl('strong');
        const travertureLink = travertureStrong.createEl('a', {
            text: 'tra.VER:ture',
            href: 'https://github.com/erykjj/traverture',
        });
        travertureLink.setAttribute('target', '_blank');
        travertureLink.setAttribute('rel', 'noopener noreferrer');
    }
}