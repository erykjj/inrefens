// editor.ts

import { ViewPlugin, EditorView, Decoration, DecorationSet, ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { findCitations } from './engine-wrapper';

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

            allDecos.push({
                from: docFrom,
                to: docTo,
                deco: Decoration.mark({
                    class: 'inrefens-link',
                    attributes: { 'data-inrefens-url': citation.wol_url },
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

            constructor(view: EditorView) {
                this.decorations = buildDecorations(view);
            }

            update(update: ViewUpdate) {
                if (update.docChanged || update.viewportChanged) {
                    this.decorations = buildDecorations(update.view);
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
                    const url = linkEl.getAttribute('data-inrefens-url');
                    if (!url) return;
                    e.preventDefault();
                    e.stopPropagation();
                    window.open(url, '_blank');
                },
            },
        }
    );
}