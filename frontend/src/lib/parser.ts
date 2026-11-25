import type { DocumentPage } from "../types";

const ALLOWED = ["pdf", "docx", "txt", "md", "png", "jpg", "jpeg", "webp"];
export function validateFile(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (!ALLOWED.includes(ext))
    throw new Error("请选择 PDF、DOCX、TXT、Markdown 或图片文件。");
  if (!file.size) throw new Error("这个文件是空的，请重新选择。");
  if (file.size > 20 * 1024 * 1024) throw new Error("单个文件不能超过 20 MB。");
  return ext;
}
export async function parseFile(
  file: File,
): Promise<{ pages: DocumentPage[]; note: string }> {
  const ext = validateFile(file);
  if (["txt", "md"].includes(ext))
    return { pages: [{ number: 1, text: await file.text() }], note: "" };
  if (ext === "docx") {
    const mammoth = await import("mammoth/mammoth.browser");
    const result = await mammoth.extractRawText({
      arrayBuffer: await file.arrayBuffer(),
    });
    return {
      pages: [{ number: 1, text: result.value }],
      note: result.messages.length
        ? "部分格式无法转换，请对照原文件确认。"
        : "",
    };
  }
  if (ext === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).href;
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false,
    });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 150)
        throw new Error("目前支持不超过 150 页的 PDF，请拆分后上传。");
      const pages: DocumentPage[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items
          .map((item) =>
            "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
          )
          .join("");
        pages.push({ number: i, text });
      }
      return {
        pages,
        note: pages.some((p) => p.text.trim().length < 15)
          ? "部分页面缺少可读文字。扫描件需要 OCR，当前可查看原件。"
          : "文字顺序可能受版式影响，请对照原件确认。",
      };
    } finally {
      await task.destroy();
    }
  }
  return {
    pages: [],
    note: "图片原件已保存。文字识别尚未接入，请对照图片查看。",
  };
}
