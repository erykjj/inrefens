// settings.ts

import { App, PluginSettingTab, SettingDefinitionItem } from 'obsidian';
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

    async setControlValue(key: string, value: unknown): Promise<void> {
        const s = this.plugin.settings as unknown as Record<string, unknown>;

        switch (key) {
            case 'language': {
                s.language = value;
                await this.plugin.saveSettings();
                await this.plugin.reloadEngine();
                break;
            }
        }
    }

    getSettingDefinitions(): SettingDefinitionItem[] {
        const languages = getAvailableLanguagesCached()
            .slice()
            .sort((a, b) => a.language_name.localeCompare(b.language_name));

        const langOptions: Record<string, string> = {};
        for (const lang of languages) {
            langOptions[lang.language_code] = `${lang.language_name} (${lang.language_code})`;
        }

        return [
            // ─── Header section ───
            {
                type: 'group',
                heading: '',
                items: [
                    {
                        name: '',
                        render: (setting) => {
                            setting.settingEl.empty();
                            setting.settingEl.addClass('inrefens-settings-header');
                            const headerEl = setting.settingEl.createDiv();
                            headerEl.createSpan({
                                text: 'in(REF)ens  ',
                                cls: 'inrefens-settings-title',
                            });
                            headerEl.createSpan({
                                text: `v${this.plugin.manifest.version} \u2013 ${getEngineVersion()}`,
                                cls: 'inrefens-version-info',
                            });
                        },
                    },
                ],
            },

            // ─── Options section ───
            {
                type: 'group',
                heading: '',
                items: [
                    {
                        name: 'Language',
                        desc: 'Language for WOL links',
                        control: {
                            type: 'dropdown',
                            key: 'language',
                            options: langOptions,
                        },
                    },
                    {
                        name: 'Link color',
                        desc: 'Color for citation links. "Theme default" uses the vault\u2019s external-link color. Changing this requires restarting Obsidian.',
                        render: (setting) => {
                            const savedColor = this.plugin.settings.linkColor ?? '';
                            const isPreset = LINK_COLOR_OPTIONS.some(o => o.value === savedColor);
                            const dropdownValue = isPreset ? savedColor : 'custom';

                            let customTextEl: HTMLInputElement | null = null;

                            setting
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
                        },
                    },
                ],
            },

            // ─── Footer section ───
            {
                type: 'group',
                heading: '',
                items: [
                    {
                        name: '',
                        render: (setting) => {
                            setting.settingEl.empty();
                            setting.settingEl.addClass('inrefens-settings-footer-row');
                            const footerEl = setting.settingEl.createDiv({ cls: 'inrefens-settings-footer' });
                            footerEl.appendChild(
                                document.createTextNode('My other Obsidian plugins: ')
                            );

                            const entries: Array<[string, string]> = [
                                ['con[VER]sum', 'https://github.com/erykjj/conversum'],
                                ['mu/TEX/tum', 'https://github.com/erykjj/mutextum'],
                                ['tra.VER:ture', 'https://github.com/erykjj/traverture'],
                            ];

                            entries.forEach(([text, href], i) => {
                                const strong = footerEl.createEl('strong');
                                const link = strong.createEl('a', { text, href });
                                link.setAttribute('target', '_blank');
                                link.setAttribute('rel', 'noopener noreferrer');
                                if (i < entries.length - 1) {
                                    footerEl.appendChild(document.createTextNode(', '));
                                }
                            });
                        },
                    },
                ],
            },
        ];
    }
}