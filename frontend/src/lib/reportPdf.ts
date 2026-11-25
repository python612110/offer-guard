import { downloadBlob } from "./storage";

export interface ReportSection {
  heading: string;
  body: string;
  risk?: string;
}

const green = "#195b46";
const red = "#a62830";
const muted = "#52695b";
type ReportFontWeight = "normal" | "bold";
let reportFont: Promise<FontFace> | undefined;

function loadReportFont() {
  return (reportFont ??= new FontFace(
    "OfferGuard FangSong",
    `url("${import.meta.env.BASE_URL}fandol/FandolFang-Regular.otf")`,
  )
    .load()
    .then((font) => {
      document.fonts.add(font);
      return font;
    })
    .catch((error) => {
      reportFont = undefined;
      throw error;
    }));
}

export async function downloadReportPdf(
  filename: string,
  metadata: string,
  sections: ReportSection[],
) {
  const [{ jsPDF }] = await Promise.all([import("jspdf"), loadReportFont()]);
  const pdf = new jsPDF({ format: "a4", compress: true });
  pdf.setProperties({ title: filename });
  const canvas = document.createElement("canvas");
  const width = 794,
    height = 1123,
    margin = 55;
  canvas.width = width * 2;
  canvas.height = height * 2;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法生成 PDF");
  const ctx = context;
  ctx.scale(2, 2);
  ctx.textBaseline = "top";
  let page = 1;
  let y = margin;
  function reset() {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    y = margin;
  }
  function flush() {
    ctx.fillStyle = "#d7e1da";
    ctx.fillRect(margin, height - 49, width - margin * 2, 1);
    ctx.fillStyle = muted;
    ctx.font = font(13);
    ctx.textAlign = "center";
    ctx.fillText(`第 ${page} 页`, width / 2, height - 39);
    pdf.addImage(canvas, "PNG", 0, 0, 210, 297, undefined, "FAST");
  }
  function font(size: number, weight: ReportFontWeight = "normal") {
    return `${weight} ${size}px "OfferGuard FangSong", FangSong, STFangsong, "Songti SC", serif`;
  }
  function ensureSpace(required: number) {
    if (y === margin || y + required <= height - margin) return;
    flush();
    pdf.addPage();
    page++;
    reset();
  }
  function wrap(text: string, size: number, weight: ReportFontWeight = "normal") {
    ctx.font = font(size, weight);
    const lines: string[] = [];
    for (const paragraph of text.split(/\r?\n/)) {
      let current = "";
      for (const char of paragraph) {
        if (
          current &&
          ctx.measureText(current + char).width > width - margin * 2
        ) {
          lines.push(current);
          current = "";
        }
        current += char;
      }
      lines.push(current);
    }
    return lines;
  }
  const lineHeight = (size: number) => Math.ceil(size * 1.55);
  function write(
    lines: string[],
    size: number,
    color = "#243a32",
    align: CanvasTextAlign = "left",
    weight: ReportFontWeight = "normal",
  ) {
    for (const value of lines) {
      ensureSpace(lineHeight(size));
      ctx.font = font(size, weight);
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.fillText(value, align === "center" ? width / 2 : margin, y);
      y += lineHeight(size);
    }
  }
  reset();
  write(["签约风险审查报告"], 32, green, "center", "bold");
  y += 6;
  write(wrap(metadata, 15), 15, muted, "center");
  y += 12;
  ctx.fillStyle = "#bad0c2";
  ctx.fillRect(margin, y, width - margin * 2, 1);
  y += 5;
  for (const [index, { heading, body, risk }] of sections.entries()) {
    const headings = wrap(heading, 20, "bold");
    const labels = risk ? wrap(risk, 16) : [];
    const lines = body ? wrap(body, 16) : [];
    const next = sections[index + 1];
    const nextStart =
      !body && !risk && next
        ? 16 +
          wrap(next.heading, 20, "bold").length * lineHeight(20) +
          (next.risk ? wrap(next.risk, 16).length : 0) * lineHeight(16) +
          Math.min(wrap(next.body, 16).length, 2) * lineHeight(16) +
          3
        : 0;
    ensureSpace(
      16 +
        headings.length * lineHeight(20) +
        (labels.length + Math.min(lines.length, 2)) * lineHeight(16) +
        3 +
        nextStart,
    );
    y += 16;
    write(headings, 20, green, "left", "bold");
    if (labels.length) write(labels, 16, red);
    if (lines.length) {
      y += 3;
      write(lines, 16);
    }
  }
  flush();
  downloadBlob(
    pdf.output("blob"),
    `${filename.replace(/[\\/:*?"<>|]/g, "_")}.pdf`,
  );
}
