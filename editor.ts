// editor.ts

import { ViewPlugin, EditorView, Decoration, DecorationSet, ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { findCitations, buildWolUrl } from './engine-wrapper';

interface DecoEntry {
    from: number;
    to: number;
    deco: Decoration;
}

function buildDecorations(view: EditorView): DecorationSet {
    const allDecos: DecoEntry[] = [];

    for (const { from, to } of view.visibleRanges) {
        const text = view.state.doc.sliceString(from, to);
        const citations = findCitations(text);
        if (!citations || citations.length === 0) continue;

        for (const citation of citations) {
            const docFrom = from + citation.start;
            const docTo = from + citation.end;
            const query = citation.parts?.query || '';

            allDecos.push({
                from: docFrom,
                to: docTo,
                deco: Decoration.mark({
                    class: 'inrefens-link',
                    attributes: { 'data-inrefens-query': query },
                }),
            });
        }
    }

    allDecos.sort((a, b) => (a.from === b.from ? a.to - b.to : a.from - b.from));
    const builder = new RangeSetBuilder<Decoration>();
    for (const d of allDecos) {
        builder.add(d.from, d.to, d.deco);
    }
    return builder.finish();
}

export function createInrefensEditorPlugin() {
    return ViewPlugin.fromClass(
        class {
            decorations: DecorationSet;
            private debounceTimer: number | null = null;
            private viewportTimer: number | null = null;

            constructor(view: EditorView) {
                this.decorations = buildDecorations(view);
            }

            update(update: ViewUpdate) {
                if (update.viewportChanged) {
                    if (this.viewportTimer !== null) {
                        window.clearTimeout(this.viewportTimer);
                    }
                    const view = update.view;
                    this.viewportTimer = window.setTimeout(() => {
                        this.viewportTimer = null;
                        this.decorations = buildDecorations(view);
                    }, 75);
                    return;
                }
                if (update.docChanged || update.selectionSet) {
                    if (this.debounceTimer !== null) {
                        window.clearTimeout(this.debounceTimer);
                    }
                    const view = update.view;
                    this.debounceTimer = window.setTimeout(() => {
                        this.debounceTimer = null;
                        this.decorations = buildDecorations(view);
                    }, 150);
                }
            }

            destroy() {
                if (this.debounceTimer !== null) {
                    window.clearTimeout(this.debounceTimer);
                    this.debounceTimer = null;
                }
                if (this.viewportTimer !== null) {
                    window.clearTimeout(this.viewportTimer);
                    this.viewportTimer = null;
                }
            }
        },
        {
            decorations: (v: { decorations: DecorationSet }) => v.decorations,
            eventHandlers: {
                mousedown: (e: MouseEvent, _view: EditorView) => {
                    if (e.button !== 0) return;
                    const target = e.target as HTMLElement;
                    const linkEl = target.closest('.inrefens-link');
                    if (!linkEl) return;
                    const query = linkEl.getAttribute('data-inrefens-query');
                    if (!query) return;
                    const url = buildWolUrl(query);
                    if (!url) return;
                    e.preventDefault();
                    e.stopPropagation();
                    window.open(url, '_blank');
                },
            },
        }
    );
}