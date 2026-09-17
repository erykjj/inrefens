// post-processor.ts

import { findCitations, buildDelimitedUrl, getDelimitedQuery } from './engine-wrapper';
import { Citation } from './types';

export function processElement(el: HTMLElement): void {
    if (el.querySelector('.callout, svg')) return;
    if (el.classList.contains('inrefens-processed')) return;
    el.classList.add('inrefens-processed');

    handleDelimitedElements(el);

    const walker = activeDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            if (parent.tagName === 'A') return NodeFilter.FILTER_REJECT;
            if (parent.tagName === 'CODE') return NodeFilter.FILTER_REJECT;
            if (parent.tagName === 'PRE') return NodeFilter.FILTER_REJECT;
            if (parent.closest('.inrefens-link')) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        },
    });

    const textNodes: Text[] = [];
    let node = walker.nextNode();
    while (node) {
        textNodes.push(node as Text);
        node = walker.nextNode();
    }

    for (const textNode of textNodes) {
        const text = textNode.nodeValue || '';
        if (!text) continue;

        const citations = findCitations(text);
        if (!citations || citations.length === 0) continue;

        replaceTextNode(textNode, text, citations);
    }
}

function handleDelimitedElements(el: HTMLElement): void {
    const candidates: HTMLElement[] = [];

    el.querySelectorAll('strong > em, em > strong').forEach((node) => {
        const parent = (node as HTMLElement).parentElement;
        if (!parent) return;
        if (parent.closest('.inrefens-link')) return;
        candidates.push(parent);
    });

    for (const em of candidates) {
        const text = em.textContent || '';
        if (!text) continue;
        const url = buildDelimitedUrl(text);
        if (!url) continue;
        const query = getDelimitedQuery(text);

        const anchor = createEl('a');
        anchor.className = 'inrefens-link';
        anchor.href = url;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.setAttribute('data-inrefens-query', query);

        while (em.firstChild) {
            anchor.appendChild(em.firstChild);
        }
        em.replaceWith(anchor);
    }
}

function replaceTextNode(textNode: Text, text: string, citations: Citation[]): void {
    const sortedAscending = [...citations].sort((a, b) => a.start - b.start);
    const fragment = createFragment();
    let pos = 0;

    for (const citation of sortedAscending) {
        if (citation.start > pos) {
            fragment.appendChild(activeDocument.createTextNode(text.substring(pos, citation.start)));
        }
        const anchor = createEl('a');
        anchor.className = 'inrefens-link';
        anchor.href = citation.wol_url;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.textContent = citation.text;
        const query = citation.parts?.query;
        if (query) {
            anchor.setAttribute('data-inrefens-query', query);
        }
        fragment.appendChild(anchor);
        pos = citation.end;
    }

    if (pos < text.length) {
        fragment.appendChild(activeDocument.createTextNode(text.substring(pos)));
    }

    textNode.parentNode?.replaceChild(fragment, textNode);
}