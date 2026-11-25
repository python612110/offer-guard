import type { TextAnchor } from "../types";

export const compactText = (value: string) => value.replace(/\s/g, "");

export function exactSlice(raw: string, selected: string) {
  const target = compactText(selected);
  if (!target) return undefined;
  const indexed = Array.from(raw.matchAll(/\S/g));
  const begin = indexed
    .map((item) => item[0])
    .join("")
    .indexOf(target);
  if (begin < 0) return undefined;
  const start = indexed[begin].index!;
  const end = indexed[begin + target.length - 1].index! + 1;
  return { start, end, quote: raw.slice(start, end) };
}

export function matchAnchor(
  source: string,
  page: number,
  selected: string,
  block?: string,
): TextAnchor | undefined {
  const paragraphs = source.split(/\n+/).filter((p) => p.trim());
  const hits = paragraphs.flatMap((text, paragraph) => {
    const match = exactSlice(text, selected);
    return match ? [{ page, paragraph, quote: match.quote }] : [];
  });
  if (hits.length === 1) return hits[0];
  if (block) {
    const exact = hits.filter(
      ({ paragraph }) =>
        compactText(paragraphs[paragraph]) === compactText(block),
    );
    if (exact.length === 1) return exact[0];
  }
}

export function markRange(element: Element, quote: string) {
  const span = exactSlice(element.textContent || "", quote);
  if (!span) return;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let position = 0,
    started = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent!.length;
    if (!started && span.start < position + length) {
      range.setStart(node, span.start - position);
      started = true;
    }
    if (started && span.end <= position + length) {
      range.setEnd(node, span.end - position);
      return range;
    }
    position += length;
  }
}
