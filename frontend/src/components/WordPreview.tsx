import { useEffect, useRef, useState } from "react";
import type { Annotation } from "../types";
import { compactText, markRange, matchAnchor } from "../lib/documentSelection";

const tags = new Set(
  "p h1 h2 h3 h4 h5 h6 table thead tbody tr th td ul ol li strong b em i u s sup sub br blockquote".split(
    " ",
  ),
);
const blocks = "p,h1,h2,h3,h4,h5,h6,li,td,th";

function safeWordHtml(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  const output = document.createElement("div");
  function copy(node: Node, target: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      target.appendChild(document.createTextNode(node.textContent || ""));
      return;
    }
    if (!(node instanceof Element)) return;
    const name = node.localName;
    if (["script", "style", "iframe", "object"].includes(name)) return;
    if (tags.has(name)) {
      const element = document.createElement(name);
      target.appendChild(element);
      target = element;
    }
    node.childNodes.forEach((child) => copy(child, target));
  }
  template.content.childNodes.forEach((node) => copy(node, output));
  return output.innerHTML;
}

export default function WordPreview({
  blob,
  source,
  notes,
}: {
  blob: Blob;
  source: string;
  notes: Annotation[];
}) {
  const [html, setHtml] = useState("");
  const [error, setError] = useState(false);
  const reader = useRef<HTMLElement>(null);
  useEffect(() => {
    let live = true;
    Promise.all([import("mammoth/mammoth.browser"), blob.arrayBuffer()])
      .then(([mammoth, arrayBuffer]) => mammoth.convertToHtml({ arrayBuffer }))
      .then(({ value }) => {
        if (live) setHtml(safeWordHtml(value));
      })
      .catch(() => {
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, [blob]);
  useEffect(() => {
    const nodes = Array.from(
      reader.current?.querySelectorAll<HTMLElement>(blocks) || [],
    ).filter(
      (node) =>
        !node.querySelector(blocks) && compactText(node.textContent || ""),
    );
    const paragraphs = source.split(/\n+/).filter((p) => p.trim());
    let cursor = 0;
    for (const node of nodes) {
      const text = compactText(node.textContent || "");
      if (text === compactText(paragraphs[cursor] || ""))
        node.dataset.wordParagraph = String(cursor++);
      else {
        const match = matchAnchor(source, 1, text, text);
        if (match) {
          node.dataset.wordParagraph = String(match.paragraph);
          cursor = match.paragraph + 1;
        }
      }
    }
    if (!globalThis.Highlight || !CSS.highlights) return;
    for (const color of ["yellow", "red"] as const) {
      const ranges = notes
        .filter(({ anchor }) => (anchor.color || "yellow") === color)
        .flatMap(({ anchor }) => {
          const node = nodes.find(
            (item) => item.dataset.wordParagraph === String(anchor.paragraph),
          );
          const range = node && markRange(node, anchor.quote);
          return range ? [range] : [];
        });
      CSS.highlights.set(`offerguard-word-${color}`, new Highlight(...ranges));
    }
    return () => {
      CSS.highlights.delete("offerguard-word-yellow");
      CSS.highlights.delete("offerguard-word-red");
    };
  }, [html, notes, source]);
  if (error) return <p>无法预览 Word 排版，请切换到「文字」或下载原件。</p>;
  if (!html) return <p role="status">正在加载 Word 预览…</p>;
  return (
    <article
      className="word-preview"
      ref={reader}
      data-word-surface
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
