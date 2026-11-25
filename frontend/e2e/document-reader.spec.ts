import { test, expect, type Locator } from "@playwright/test";
import JSZip from "jszip";

function samplePdf() {
  const stream = "BT /F1 22 Tf 40 730 Td (Probation pay is 6000.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let text = "%PDF-1.4\n";
  const offsets = objects.map((object, i) => {
    const offset = text.length;
    text += `${i + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = text.length;
  text += `xref\n0 6\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(text);
}

async function sampleWord() {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Probation pay is 6000.</w:t></w:r></w:p></w:body></w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

async function selectPay(text: Locator) {
  await text.evaluate((element) => {
    const node = element.firstChild!;
    const begin = node.textContent!.indexOf("6000");
    const range = document.createRange();
    range.setStart(node, begin);
    range.setEnd(node, begin + 4);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  });
}

test("PDF 和 Word 原件预览可选字、标记、批注，并进入专注阅读", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "继续使用本设备工作区" }).click();
  await page
    .getByRole("button", { name: "新建求职事项", exact: true })
    .first()
    .click();
  await page.getByLabel("企业名称").fill("文档预览测试");
  await page.getByLabel("应聘岗位").fill("测试岗位");
  await page.getByRole("button", { name: "创建事项", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/cases\/[^/]+$/);
  const caseUrl = page.url();
  for (const kind of ["pdf", "docx"] as const) {
    await page.goto(caseUrl);
    await page
      .getByRole("button", { name: "添加材料", exact: true })
      .first()
      .click();
    await page.locator('input[type="file"]').setInputFiles({
      name: `contract.${kind}`,
      mimeType:
        kind === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: kind === "pdf" ? samplePdf() : await sampleWord(),
    });
    await page.getByRole("button", { name: "保存材料", exact: true }).click();
    const text = page
      .locator(kind === "pdf" ? ".pdf-text-layer span" : ".word-preview strong")
      .filter({ hasText: "6000" });
    await expect(text).toContainText("6000");
    await page.getByRole("button", { name: "专注阅读", exact: true }).click();
    await expect(page.locator(".reader-focus")).toBeVisible();
    await expect(page.locator(".review-panel")).toBeHidden();
    await selectPay(text);
    await page
      .getByRole("button", {
        name: kind === "pdf" ? "标黄" : "标红",
        exact: true,
      })
      .click();
    await expect(page.getByText("管理颜色标记（1）")).toBeVisible();
    await expect(page.locator(".inline-annotation")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.locator(".reader-focus")).toHaveCount(0);
    await page.reload();
    await expect(text).toContainText("6000");
    if (kind === "pdf")
      await expect(page.locator(".pdf-marks .doc-mark-yellow")).toBeVisible();
    else
      expect(
        await page.evaluate(
          () => CSS.highlights.get("offerguard-word-red")?.size,
        ),
      ).toBe(1);
    await selectPay(text);
    await page.getByRole("button", { name: "写批注", exact: true }).click();
    await expect(page.getByRole("dialog").locator("blockquote")).toHaveText(
      "6000",
    );
    await page.getByLabel("批注内容").fill("请确认这一项");
    await page.getByRole("button", { name: "保存批注" }).click();
    await page.getByText("本页批注（1）").click();
    await expect(page.getByText("请确认这一项")).toBeVisible();
    await selectPay(text);
    await page.getByRole("button", { name: "问 AI", exact: true }).click();
    await expect(page.getByRole("dialog").locator("blockquote")).toHaveText(
      "6000",
    );
    expect(
      (await page.getByRole("dialog").boundingBox())!.width,
    ).toBeLessThanOrEqual(440);
    const desktop = page.viewportSize()!;
    await page.setViewportSize({ width: 360, height: 640 });
    const narrow = await page.getByRole("dialog").boundingBox();
    expect(narrow!.x).toBeGreaterThanOrEqual(8);
    expect(narrow!.x + narrow!.width).toBeLessThanOrEqual(352);
    await page.getByRole("button", { name: "关闭弹窗" }).click();
    await page.setViewportSize(desktop);
    await page.getByText("管理颜色标记（1）").click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "移除", exact: true }).click();
    await expect(page.getByText("管理颜色标记（1）")).toHaveCount(0);
    await expect(page.locator(".inline-annotation")).toContainText(
      "请确认这一项",
    );
  }
});
