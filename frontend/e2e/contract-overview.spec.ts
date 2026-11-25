import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";

test("上传后直接打开合同概览，原文可追溯且按版本隔离", async ({ page }) => {
  const aiRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/.*(?:review-preview|\/reviews|\/questions)/.test(request.url()))
      aiRequests.push(request.url());
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "继续使用本设备工作区" }).click();
  await page
    .getByRole("button", { name: "新建求职事项", exact: true })
    .first()
    .click();
  await page.getByLabel("企业名称").fill("不应作为合同主体的事项名称");
  await page.getByLabel("应聘岗位").fill("不应作为合同岗位的事项名称");
  await page.getByRole("button", { name: "创建事项", exact: true }).click();
  await page
    .getByRole("button", { name: "添加材料", exact: true })
    .first()
    .click();
  await page
    .locator('input[type="file"]')
    .setInputFiles(
      fileURLToPath(
        new URL("../../模拟劳动合同_审查测试.txt", import.meta.url),
      ),
    );
  await page.getByRole("button", { name: "保存材料", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/reviews\/[^?]+\?tab=overview$/);
  const overview = page.getByRole("region", { name: "合同概览" });
  const highlights = overview.locator(".overview-highlights");
  await expect(highlights).toContainText("星禾示例科技有限公司");
  await expect(highlights).toContainText("初级软件开发工程师");
  await expect(highlights).toContainText("人民币10000元");
  await expect(highlights).toContainText("试用期为六个月");
  await expect(highlights).not.toContainText("不应作为");
  const wage = page
    .locator("[data-text-paragraph]")
    .filter({ hasText: "转正后月薪人民币10000元" });
  await wage.evaluate((element) => {
    const node = element.firstChild!;
    const start = node.textContent!.indexOf("人民币10000元");
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + "人民币10000元".length);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  });
  await page.getByRole("button", { name: "写批注", exact: true }).click();
  await expect(page.getByRole("dialog").locator("blockquote")).toHaveText(
    "人民币10000元",
  );
  await page.getByLabel("批注内容").fill("请确认税前还是税后。");
  await page.getByRole("button", { name: "保存批注" }).click();
  await expect(page.locator(".inline-annotation")).toContainText(
    "请确认税前还是税后。",
  );
  const wageClause = wage.locator("../..");
  await wageClause.getByRole("button", { name: "标黄", exact: true }).click();
  await expect(wageClause.locator(".inline-annotation")).toHaveCount(1);
  await expect(wageClause.getByText("管理颜色标记（1）")).toHaveCount(0);
  await wageClause.getByRole("button", { name: /操作第/ }).click();
  await wageClause.getByText("管理颜色标记（1）").click();
  page.once("dialog", (dialog) => dialog.accept());
  await wageClause.getByRole("button", { name: "移除", exact: true }).click();
  await expect(wageClause.getByText("管理颜色标记（1）")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".inline-annotation")).toContainText(
    "请确认税前还是税后。",
  );
  await overview.getByText("社保与公积金", { exact: true }).click();
  const insurance = overview.locator("details[open]");
  await expect(insurance).toContainText("员工自愿放弃社保");
  await expect(insurance).toContainText("住房公积金");
  await expect(insurance).toContainText("未提取到");
  await insurance
    .getByRole("button", { name: /员工自愿放弃社保/ })
    .first()
    .click();
  await expect(page.locator(".evidence-highlight")).toContainText(
    "员工自愿放弃社保",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(overview).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);

  await page.getByRole("button", { name: "上传新版本" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "新版本.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "劳动合同\n甲方：示例公司\n乙方：测试员工\n乙方税前月薪12000元。\n试用期为两个月。",
    ),
  });
  await page.getByRole("button", { name: "保存新版本", exact: true }).click();
  await expect(highlights).toContainText("月薪12000元");
  await expect(highlights).not.toContainText("10000元");
  await expect(page.locator(".inline-annotation")).toHaveCount(0);
  await page.getByRole("combobox", { name: "选择文件版本" }).click();
  await page.getByRole("option", { name: "第 1 版 · 历史" }).click();
  await expect(page.locator(".inline-annotation")).toContainText(
    "请确认税前还是税后。",
  );
  expect(aiRequests).toEqual([]);
});
