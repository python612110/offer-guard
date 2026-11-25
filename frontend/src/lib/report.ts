import { downloadBlob } from "./storage";

export function publicReviewError(text: string) {
  return text.replace(
    /deepseek(?:-[a-z0-9]+(?:[.-][a-z0-9]+)*)?(?:\s*服务)?/gi,
    "审查服务",
  );
}
export function exportText(
  title: string,
  text: string,
  format: "txt" | "html" = "txt",
) {
  const safeName = title.replace(/[\\/:*?"<>|]/g, "_");
  const escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!,
    );
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>body{max-width:850px;margin:40px auto;padding:24px;font:16px/1.9 system-ui;color:#20352c}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}@media print{body{margin:0;padding:0}}</style><h1>${escape(title)}</h1><pre>${escape(text)}</pre></html>`;
  downloadBlob(
    new Blob([format === "html" ? html : text], {
      type:
        format === "html"
          ? "text/html;charset=utf-8"
          : "text/plain;charset=utf-8",
    }),
    `${safeName}.${format}`,
  );
}
