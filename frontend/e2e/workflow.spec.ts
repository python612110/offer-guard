import { test, expect } from "@playwright/test";

test("入口守卫、自动进入审查、多材料核对、HR、决定与档案形成完整流程", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("link", { name: "先看薪资样例" }).click();
  await expect(page.locator("#salary-example")).toContainText("合成样例");
  await expect(page.locator("#salary-example")).toContainText("差额 4,000 元");
  await page.getByRole("button", { name: "2. 查看 HR 回复" }).click();
  await expect(page.locator(".salary-example-question")).toContainText("还要看新版");
  await page.getByRole("button", { name: "3. 复核新版合同" }).click();
  await expect(page.locator(".salary-example-grid mark")).toContainText("固定岗位补贴");
  await expect(page.locator("#privacy")).toContainText("第三方 AI 服务");
  await expect(page.locator("main")).not.toContainText(/skill|知识库|deepseek/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.goto("/#salary-example");
  await expect(page.locator("#salary-example h2")).toBeInViewport();
  await page.getByRole("link", { name: "开始核对自己的材料" }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByRole("button", { name: "继续使用本设备工作区" }).click();
  await expect(page).toHaveURL(/\/app\/consistency/);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "创建求职事项", exact: true }).click();
  await page.getByLabel("企业名称").fill("流程验收企业");
  await page.getByLabel("应聘岗位").fill("设计师");
  await page.getByRole("button", { name: "创建事项", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "流程验收企业", exact: true }),
  ).toBeVisible();
  const caseUrl = page.url();
  async function save(title: string, type: string, text: string) {
    await page.goto(caseUrl);
    await page
      .getByRole("button", { name: "添加材料", exact: true })
      .first()
      .click();
    await page.getByRole("button", { name: "粘贴文本", exact: true }).click();
    await page.getByRole("combobox", { name: "材料分类" }).click();
    await page.getByRole("option", { name: type, exact: true }).click();
    await page.getByPlaceholder("例如：岗位招聘信息").fill(title);
    await page
      .getByPlaceholder("粘贴完整原文，保留薪资、日期与适用条件。")
      .fill(text);
    await page.getByRole("button", { name: "保存材料", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/reviews\//);
  }
  await save(
    "岗位Offer",
    "Offer",
    "税前年薪120000元。\n工作地点杭州。\n试用期2个月。",
  );
  await save(
    "正式合同",
    "劳动合同",
    "税前固定月薪8000元。\n工作地点上海。\n试用期2个月。",
  );
  let contractUrl = page.url();
  await page.getByRole("link", { name: "下一步：核对多份材料" }).click();
  await expect(page.locator(".comparison-table")).toContainText(
    "税前年薪120000元",
  );
  await expect(page.locator(".comparison-table")).toContainText(
    "税前固定月薪8000元",
  );
  await page.getByRole("button", { name: "工作地点与岗位", exact: true }).click();
  await expect(page.locator(".comparison-table")).toContainText("工作地点上海");
  await page.getByRole("button", { name: "薪资待遇", exact: true }).click();
  await page.locator(".comparison-quote").filter({ hasText: "税前固定月薪8000元" }).click();
  await expect(page.locator(".evidence-highlight")).toHaveText("税前固定月薪8000元。");
  await page.goBack();
  await page.getByRole("link", { name: "带着这个问题去沟通" }).click();
  await expect(page.getByLabel("向 HR 确认的问题")).toHaveValue(/固定、浮动部分/);
  await page.goBack();
  const history = page
    .locator(".workflow-columns .panel")
    .filter({ has: page.getByRole("heading", { name: "核对历史" }) });
  const compareForm = page
    .locator(".workflow-columns .panel")
    .filter({ has: page.getByRole("heading", { name: "保存我的核对" }) });
  await expect(history).toHaveCSS("padding-left", /^(1[6-9]|2[0-6])px$/);
  expect((await history.boundingBox())!.height).toBeLessThan(
    (await compareForm.boundingBox())!.height,
  );
  const status = page.getByRole("combobox", { name: "人工核对状态" });
  await status.press("Enter");
  await expect(status).toHaveAttribute("aria-expanded", "true");
  await status.press("Escape");
  await expect(status).toHaveAttribute("aria-expanded", "false");
  await status.press("ArrowDown");
  await status.press("ArrowDown");
  await status.press("ArrowDown");
  await status.press("Enter");
  await expect(status).toHaveText("存在差异");
  await page
    .getByLabel("判断依据或仍需确认的问题")
    .fill("需确认固定工资与年度奖金的口径。");
  await page.getByRole("button", { name: "保存核对及版本快照" }).click();
  await expect(page.locator(".record-card")).toContainText("需确认固定工资");
  await page.reload();
  await expect(page.locator(".record-card")).toContainText("需确认固定工资");
  const comparisonUrl = page.url();
  await page.getByRole("button", { name: "追踪这条薪资问题" }).click();
  await expect(page.locator(".salary-followup-status")).toHaveText("待 HR 回复");
  await page.getByLabel("HR 回复原话").fill("另有固定补贴，合同改版时会注明。");
  await page.getByRole("button", { name: "保存 HR 回复" }).click();
  await expect(page.locator(".salary-followup-status")).toHaveText("HR 已回复，待补充新版");
  async function uploadRevision(text: string) {
    await page.goto(contractUrl);
    await page.getByRole("button", { name: "上传新版本", exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: "劳动合同修订版.txt", mimeType: "text/plain", buffer: Buffer.from(text),
    });
    await page.getByRole("button", { name: "保存新版本", exact: true }).click();
    await expect(page).not.toHaveURL(contractUrl);
    contractUrl = page.url();
    await page.goto(comparisonUrl);
  }
  await uploadRevision("税前固定月薪8000元，固定补贴2000元。");
  await expect(page.locator(".salary-followup-status")).toHaveText("有当前合同可复核");
  await page.getByText("复核当前合同", { exact: true }).click();
  await page.getByRole("combobox", { name: "人工复核结果" }).click();
  await page.getByRole("option", { name: "已写明", exact: true }).click();
  await page.getByLabel("复核依据").fill("新版已明确写入固定补贴。");
  await page.getByRole("button", { name: "保存人工复核" }).click();
  await expect(page.locator(".salary-followup-status")).toHaveText("当前合同已人工确认");
  await uploadRevision("税前固定月薪8000元，补贴按另行通知发放。");
  await expect(page.locator(".salary-followup-status")).toHaveText("合同版本已变更，待复核");
  await expect(page.getByRole("list", { name: "薪资复核时间线" })).toContainText("新版已明确写入固定补贴");
  await page
    .getByRole("link", { name: "下一步：向 HR 确认并保存回复" })
    .click();
  await page.getByLabel("向 HR 确认的问题").fill("剩余年薪是否为奖金？");
  await page.getByLabel("HR 的回复").fill("是，需达到年度考核标准。");
  await page.getByRole("button", { name: "保存记录", exact: true }).click();
  await expect(page.locator(".communication-list")).toContainText(
    "年度考核标准",
  );
  await page
    .getByRole("navigation", { name: "求职签约步骤" })
    .getByRole("link", { name: "我的决定" })
    .click();
  await expect(page.getByRole("heading", { name: "决定历史" })).toBeVisible();
  const company = page.getByRole("combobox", { name: "当前企业与岗位" });
  await company.click();
  const companyList = page.getByRole("listbox", { name: "当前企业与岗位" });
  await expect(companyList).toBeVisible();
  const triggerBox = (await company.boundingBox())!;
  const listBox = (await companyList.boundingBox())!;
  expect(listBox.y).toBeGreaterThanOrEqual(triggerBox.y + triggerBox.height);
  await page.getByRole("heading", { name: "决定历史" }).click();
  await expect(companyList).toBeHidden();
  await expect(page.getByLabel("决定理由与保留条件")).toHaveCSS(
    "font-size",
    "14px",
  );
  await page
    .getByLabel("决定理由与保留条件")
    .fill("继续沟通，请提供书面奖金条件。");
  await page.getByRole("button", { name: "保存我的决定", exact: true }).click();
  await expect(
    page.locator(".record-card").filter({ hasText: "书面奖金条件" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.locator(".record-card").filter({ hasText: "书面奖金条件" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "下一步：查看完整档案" }).click();
  await expect(page.locator(".archive-details")).toContainText(
    "最近决定：继续沟通",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出档案目录与记录" }).click();
  expect((await download).suggestedFilename()).toContain("求职档案目录");
  for (const path of [
    "/app",
    "/app/consistency",
    "/app/decision",
    "/app/archives",
  ]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    if (path === "/app/decision") {
      await company.click();
      await expect(companyList).toBeVisible();
      expect((await companyList.boundingBox())!.width).toBeLessThan(390);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  expect(errors).toEqual([]);
});
