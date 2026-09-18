// editor.ts

import { ViewPlugin, EditorView, Decoration, DecorationSet, ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { findCitations, buildWolUrl } from './engine-wrapper';

const SMALL_CHANGE_MAX_CHARS = 64;
const SMALL_CHANGE_MAX_LINES = 5;
const LINE_MARGIN = 1;
const DEBOUNCE_MS = 150;
const VIEWPORT_DEBOUNCE_MS = 75;
const MAX_RESCAN_BYTES = 4096;

let fullRescanRequested = false;

export function requestInrefensFullRescan(): void {
    fullRescanRequested = true;
}

interface DecoEntry {
    from: number;
    to: number;
    deco: Decoration;
}

function decorationsForRange(
    view: EditorView,
    from: number,
    to: number,
    out: DecoEntry[],
): void {
    if (to <= from) return;
    const text = view.state.doc.sliceString(from, to);
    if (!text) return;

    const citations = findCitations(text);
    if (!citations || citations.length === 0) return;

    for (const citation of citations) {
        const docFrom = from + citation.start;
        const docTo = from + citation.end;
        if (docTo <= docFrom) continue;
        const query = citation.parts?.query || '';
        out.push({
            from: docFrom,
            to: docTo,
            deco: Decoration.mark({
                class: 'inrefens-link',
                attributes: { 'data-inrefens-query': query },
            }),
        });
    }
}

function buildDecorationSet(entries: DecoEntry[]): DecorationSet {
    entries.sort((a, b) => (a.from === b.from ? a.to - b.to : a.from - b.from));
    const builder = new RangeSetBuilder<Decoration>();
    for (const d of entries) {
        builder.add(d.from, d.to, d.deco);
    }
    return builder.finish();
}

function buildDecorationsForVisibleRanges(view: EditorView): DecorationSet {
    const allDecos: DecoEntry[] = [];
    for (const { from, to } of view.visibleRanges) {
        decorationsForRange(view, from, to, allDecos);
    }
    return buildDecorationSet(allDecos);
}

interface RescanTarget {
    from: number;
    to: number;
    full: boolean;
}


function computeRescanTarget(update: ViewUpdate): RescanTarget | null {
    const { changes, startState, state } = update;

    if (changes.empty) {
        return null;
    }

    let totalChanged = 0;
    let minLine = Number.POSITIVE_INFINITY;
    let maxLine = Number.NEGATIVE_INFINITY;

    changes.iterChanges((fromA, toA, _fromB, _toB) => {
        totalChanged += (toA - fromA) + (_toB - _fromB);
        const startLine = startState.doc.lineAt(fromA).number;
        const endLine = startState.doc.lineAt(Math.min(toA, startState.doc.length)).number;
        if (startLine < minLine) minLine = startLine;
        if (endLine > maxLine) maxLine = endLine;
    });

    if (!Number.isFinite(minLine) || !Number.isFinite(maxLine)) {
        return { from: 0, to: 0, full: true };
    }

    const expandedMinLine = Math.max(1, minLine - LINE_MARGIN);
    const expandedMaxLine = Math.min(state.doc.lines, maxLine + LINE_MARGIN);
    const lineSpan = expandedMaxLine - expandedMinLine + 1;

    const isSmall = totalChanged <= SMALL_CHANGE_MAX_CHARS && lineSpan <= SMALL_CHANGE_MAX_LINES;

    if (!isSmall) {
        return { from: 0, to: 0, full: true };
    }

    const fromPos = state.doc.line(expandedMinLine).from;
    const toPos = state.doc.line(expandedMaxLine).to;

    if (toPos - fromPos > MAX_RESCAN_BYTES) {
        return { from: 0, to: 0, full: true };
    }

    return { from: fromPos, to: toPos, full: false };
}

function visibleBounds(view: EditorView): { from: number; to: number } | null {
    const ranges = view.visibleRanges;
    if (ranges.length === 0) return null;
    return { from: ranges[0].from, to: ranges[ranges.length - 1].to };
}

export function createInrefensEditorPlugin() {
    return ViewPlugin.fromClass(
        class {
            decorations: DecorationSet;
            private debounceTimer: number | null = null;
            private viewportTimer: number | null = null;
            private pendingTarget: RescanTarget | null = null;

            constructor(view: EditorView) {
                this.decorations = buildDecorationsForVisibleRanges(view);
            }

            private scheduleRescan(view: EditorView, target: RescanTarget | null, delay: number) {
                this.pendingTarget = target;

                if (this.debounceTimer !== null) {
                    window.clearTimeout(this.debounceTimer);
                }
                this.debounceTimer = window.setTimeout(() => {
                    this.debounceTimer = null;
                    const t = this.pendingTarget;
                    this.pendingTarget = null;
                    this.applyRescan(view, t);
                }, delay);
            }

            private applyRescan(view: EditorView, target: RescanTarget | null) {
                if (!target || target.full) {
                    this.decorations = buildDecorationsForVisibleRanges(view);
                    return;
                }

                if (target.to <= target.from) return;

                const newEntries: DecoEntry[] = [];
                decorationsForRange(view, target.from, target.to, newEntries);

                const rescanFrom = target.from;
                const rescanTo = target.to;

                this.decorations = this.decorations.update({
                    filter: (from, to) => {
                        return !(from < rescanTo && to > rescanFrom);
                    },
                    add: newEntries.map(e => ({ from: e.from, to: e.to, value: e.deco })),
                    sort: true,
                });
            }

            update(update: ViewUpdate) {
                if (fullRescanRequested) {
                    fullRescanRequested = false;
                    this.pendingTarget = { from: 0, to: 0, full: true };
                    this.scheduleRescan(update.view, this.pendingTarget, 0);
                    return;
                }

                if (update.docChanged) {
                    this.decorations = this.decorations.map(update.changes);
                    const target = computeRescanTarget(update);
                    this.scheduleRescan(update.view, target, DEBOUNCE_MS);
                    return;
                }

                if (update.viewportChanged) {
                    if (this.debounceTimer !== null) {
                        window.clearTimeout(this.debounceTimer);
                        this.debounceTimer = null;
                        this.pendingTarget = null;
                    }

                    const bounds = visibleBounds(update.view);
                    if (!bounds) return;

                    if (this.viewportTimer !== null) {
                        window.clearTimeout(this.viewportTimer);
                    }
                    const view = update.view;
                    this.viewportTimer = window.setTimeout(() => {
                        this.viewportTimer = null;
                        const decos = this.decorations;
                        let coveredFrom = Number.POSITIVE_INFINITY;
                        let coveredTo = Number.NEGATIVE_INFINITY;
                        const iter = decos.iter();
                        while (iter.value) {
                            if (iter.from < coveredFrom) coveredFrom = iter.from;
                            if (iter.to > coveredTo) coveredTo = iter.to;
                            iter.next();
                        }
                        const fullyCovered =
                            Number.isFinite(coveredFrom) &&
                            Number.isFinite(coveredTo) &&
                            bounds.from >= coveredFrom &&
                            bounds.to <= coveredTo &&
                            false;

                        if (!fullyCovered) {
                            this.decorations = buildDecorationsForVisibleRanges(view);
                            view.dispatch({});
                        }
                    }, VIEWPORT_DEBOUNCE_MS);
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