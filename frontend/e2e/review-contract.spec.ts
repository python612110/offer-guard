import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("审查契约：主动授权、失败重试、版本隔离、证据定位与保存待确认", async ({
  page,
}) => {
  // 使用明确合成的模型/API响应；真实模型与 MySQL 验证见 backend/check_reviews.py。
  const caseId = crypto.randomUUID(),
    materialId = crypto.randomUUID();
  const v1 = crypto.randomUUID(),
    v2 = crypto.randomUUID();
  const date = new Date().toISOString(),
    digest = "a".repeat(64);
  const session = {
    user: { id: crypto.randomUUID(), email: "review@example.test" },
    csrf: "review-csrf",
  };
  const state = {
    cases: [
      {
        id: caseId,
        company: "合成企业",
        role: "测试岗位",
        city: "",
        deadline: "",
        stage: "已获 Offer",
        createdAt: date,
      },
    ],
    materials: [
      {
        id: materialId,
        caseId,
        title: "合成合同.txt",
        type: "劳动合同",
        currentVersionId: v2,
        createdAt: date,
      },
    ],
    versions: [v1, v2].map((id, i) => ({
      id,
      caseId,
      materialId,
      number: i + 1,
      filename: "合成合同.txt",
      mime: "text/plain",
      size: 100,
      pages: [
        {
          number: 1,
          text: i ? "员工自愿放弃社保。\n合同期限为一年。" : "旧版合成文字。",
        },
      ],
      parseState: "readable",
      parseNote: "",
      createdAt: date,
      fileUrl: `/api/versions/${id}/file`,
    })),
    todos: [] as {
      id: string;
      caseId: string;
      title: string;
      done: boolean;
      createdAt: string;
    }[],
    events: [],
    communications: [],
    assets: [],
    profile: { name: "", school: "", role: "" },
  };
  const report = {
    findings: [
      {
        risk_id: "f1",
        risk_level: "高",
        title: "出现自愿放弃社保表述",
        triggered_rule: "R03-01",
        explanation: "合成风险线索。",
        suggestion: "请 HR 说明参保主体和起缴时间。",
        status: "待核实",
        evidence: [{ original_text: "员工自愿放弃社保", page: 1 }],
        knowledge_evidence: [
          {
            rule_id: "R03-01",
            legal_reference: "社会保险法 §4、§60",
            text: "合成规则摘要",
            source: "合成测试依据",
          },
        ],
      },
    ],
    review_notes: ["仅覆盖薪资、试用期、社保，其他风险未检查。"],
  };
  let submitted = 0,
    excerptCalls = 0,
    polls = 0,
    loggedIn = false;
  const messages: unknown[] = [];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const run = () => ({
    id: "run1",
    state: polls < 2 ? "running" : submitted === 1 ? "failed" : "completed",
    attempts: submitted,
    model: "deepseek-flash",
    createdAt: date,
    error: submitted === 1 ? "DeepSeek 服务超时" : "",
    report: submitted > 1 && polls >= 2 ? report : null,
  });
  await page.route("**/api/**", async (route) => {
    if (new URL(route.request().url()).hostname !== "127.0.0.1")
      return route.continue();
    const request = route.request(),
      path = new URL(request.url()).pathname.slice(4);
    const respond = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (path === "/auth/login") {
      loggedIn = true;
      return respond(session);
    }
    if (!loggedIn) return respond({ detail: "请登录" }, 401);
    if (path === "/auth/me") return respond(session);
    if (path === "/workspace") return respond(state);
    if (path === "/reviews/run1/question-preview")
      return respond({
        digest,
        question: request.postDataJSON().question,
        notice: "合成追问授权",
        notes: [],
        findings: [],
      });
    if (path === "/reviews/run1/questions") {
      if (request.method() === "POST") {
        expect(request.postDataJSON().authorized).toBe(true);
        messages.push({
          id: "q1",
          state: "completed",
          question: request.postDataJSON().question,
          answer: "可以向 HR 确认参保主体及起缴时间。",
          citations: ["f1"],
          error: "",
        });
      }
      return respond(request.method() === "POST" ? messages[0] : messages);
    }
    if (/\/file$/.test(path))
      return route.fulfill({
        contentType: "text/plain",
        body: path.includes(v1)
          ? "旧版合成文字。"
          : "员工自愿放弃社保。\n合同期限为一年。",
      });
    if (/\/excerpt-(?:preview|answer)$/.test(path)) {
      const body = request.postDataJSON();
      expect(body.anchor).toEqual({
        page: 1,
        paragraph: 0,
        quote: "员工自愿放弃社保。",
      });
      if (path.endsWith("-preview"))
        return respond({
          digest,
          question: body.question,
          text: body.anchor.quote,
          context: [{ page: 1, paragraph: 2, text: "合同期限为一年。" }],
          history: body.history,
        });
      expect(body.authorized).toBe(true);
      expect(body.digest).toBe(digest);
      excerptCalls++;
      expect(body.scope).toBe(excerptCalls === 1 ? "nearby" : "document");
      expect(body.history).toHaveLength(excerptCalls - 1);
      return respond({ answer: "这段文字称员工自愿放弃参保，请向 HR 核实。" });
    }
    if (/\/review-preview$/.test(path))
      return respond({
        digest,
        provider: "DeepSeek",
        model: "deepseek-flash",
        clauses: [{ id: "p1-c1", page: 1, text: "员工自愿放弃社保。" }],
        privacy: "合成脱敏预览，请检查实际文本。",
        limits: "合成上限说明。",
        notes: [],
      });
    if (/\/reviews$/.test(path)) {
      if (request.method() === "POST") {
        expect(request.headers()["x-csrf-token"]).toBe(session.csrf);
        const body = request.postDataJSON();
        expect(body.authorized).toBe(true);
        expect(body.digest).toBe(digest);
        if (submitted) expect(body.retry).toBe(true);
        submitted++;
        polls = 0;
        return respond(run(), 202);
      }
      if (path.includes(v1) || !submitted) return respond([]);
      polls++;
      return respond([run()]);
    }
    if (/\/todos$/.test(path)) {
      state.todos.push({
        id: crypto.randomUUID(),
        caseId,
        title: request.postDataJSON().title,
        done: false,
        createdAt: date,
      });
      return respond(state.todos.at(-1), 201);
    }
    throw new Error(`未知合成请求：${path}`);
  });
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(session.user.email);
  await page
    .getByLabel("密码", { exact: true })
    .fill("synthetic-password-2026");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.locator(".local-status")).toHaveText("账号工作区");
  await page.goto(`/app/reviews/${v2}`);
  await expect(
    page.getByRole("button", { name: "预览并开始 AI 审查" }),
  ).toBeEnabled();
  expect(submitted).toBe(0);
  await page.getByRole("button", { name: "操作第 1 段" }).click();
  await page.getByRole("button", { name: "问 AI", exact: true }).click();
  await page.getByLabel("你的问题").fill("这段话是什么意思？");
  await page.getByRole("button", { name: "预览发送内容" }).click();
  const send = page.getByRole("button", { name: "授权并提问" });
  await expect(send).toBeDisabled();
  await expect(page.getByRole("dialog")).toContainText("合同期限为一年。");
  expect(excerptCalls).toBe(0);
  await page.getByLabel("我已核对内容并同意发送").check();
  await send.click();
  await expect(page.getByRole("dialog")).toContainText("请向 HR 核实");
  await page.getByRole("button", { name: "继续追问" }).click();
  await page.getByRole("radio", { name: "当前版本全文" }).check();
  await page.getByLabel("你的问题").fill("那合同期限呢？");
  await page.getByRole("button", { name: "预览发送内容" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "本次发送的前序问答（1 轮）",
  );
  await expect(page.getByRole("dialog")).toContainText("这段话是什么意思？");
  await expect(send).toBeDisabled();
  await page.getByLabel("我已核对内容并同意发送").check();
  await send.click();
  await expect(page.getByRole("heading", { name: "AI 回答" })).toBeVisible();
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  expect(excerptCalls).toBe(2);
  expect(submitted).toBe(0);
  async function authorize(button: string) {
    await page.getByRole("button", { name: button }).click();
    await expect(page.getByLabel("即将发送的脱敏文本")).toContainText(
      "员工自愿放弃社保",
    );
    await expect(page.getByRole("dialog")).not.toContainText(/deepseek/i);
    const start = page.getByRole("button", {
      name: "授权并开始审查",
      exact: true,
    });
    await expect(start).toBeDisabled();
    await page.getByRole("checkbox").check();
    await start.click();
  }
  await authorize("预览并开始 AI 审查");
  await expect(page.getByRole("alert")).toContainText("审查服务超时");
  await authorize("预览并授权重试");
  await expect(page.locator(".risk-card")).toContainText(
    "出现自愿放弃社保表述",
  );
  await expect(page.locator(".review-panel")).not.toContainText(/deepseek/i);
  await expect(page.locator(".review-composer")).toHaveCount(0);
  await expect(page.locator(".review-panel-content")).toHaveCSS(
    "overflow-y",
    "auto",
  );
  await page.locator(".risk-evidence").click();
  await expect(page.locator(".evidence-highlight")).toContainText(
    "员工自愿放弃社保",
  );
  await page.getByRole("button", { name: "保存为待确认问题" }).click();
  await expect(page.getByRole("status")).toContainText("已保存到待确认");
  expect(state.todos).toHaveLength(1);
  await page.getByRole("button", { name: "根据这段原文记录问题" }).click();
  await page.getByLabel("记录待确认问题").fill("是否会依法办理社保？");
  await page
    .getByRole("button", { name: "保存待确认问题", exact: true })
    .click();
  await expect(page.locator(".review-pending-list")).toContainText(
    "是否会依法办理社保？",
  );
  expect(state.todos.at(-1)?.title).toContain("关于所选条款：员工自愿放弃社保");
  await page.getByRole("button", { name: "风险审查", exact: true }).click();
  await expect(page.locator(".review-composer")).toHaveCount(0);
  await page.screenshot({
    path: "/tmp/offerguard-validation/review-connected-v2.png",
    fullPage: true,
  });
  const versionSelect = page.getByRole("combobox", { name: "选择文件版本" });
  await versionSelect.click();
  await page.getByRole("option", { name: "第 1 版 · 历史" }).click();
  await expect(page.locator(".risk-card")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "预览并开始 AI 审查" }),
  ).toBeEnabled();
  await versionSelect.click();
  await page.getByRole("option", { name: "第 2 版 · 当前" }).click();
  await expect(page.locator(".risk-card")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".risk-card")).toHaveCount(1);
  await page
    .getByLabel("向 AI 追问", { exact: true })
    .fill("我可以怎么问 HR？");
  await page.getByRole("button", { name: "预览追问内容" }).click();
  await expect(
    page.getByRole("button", { name: "授权并发送追问" }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "授权并发送追问" }).click();
  await expect(page.locator(".chat-answer")).toContainText("起缴时间");
  await expect(
    page.getByRole("button", { name: /下载 (TXT|HTML) 报告/ }),
  ).toHaveCount(0);
  const drawn: { text: string; align: string; color: string; font: string }[] =
    [];
  await page.exposeFunction(
    "observeReportText",
    (row: (typeof drawn)[number]) => {
      drawn.push(row);
    },
  );
  await page.evaluate(() => {
    const observe = (
      window as unknown as { observeReportText: (row: object) => void }
    ).observeReportText;
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (
      text,
      x,
      y,
      maxWidth,
    ) {
      observe({
        text,
        align: this.textAlign,
        color: this.fillStyle,
        font: this.font,
      });
      original.call(this, text, x, y, maxWidth);
    };
  });
  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载 PDF 报告" }).click();
  const pdf = await pdfDownload;
  expect(pdf.suggestedFilename()).toMatch(/风险报告.*\.pdf$/);
  const pdfContent = await readFile((await pdf.path())!, "latin1");
  expect(pdfContent).toMatch(/^%PDF-/);
  expect(pdfContent).toContain("/Subtype /Image");
  const boldFangSong = /^(?:bold|700) .*OfferGuard FangSong/;
  expect(drawn).toContainEqual(
    expect.objectContaining({
      text: "签约风险审查报告",
      align: "center",
      color: "#195b46",
      font: expect.stringMatching(boldFangSong),
    }),
  );
  for (const text of ["审查范围", "风险明细", /出现自愿放弃社保表述/]) {
    expect(drawn).toContainEqual(
      expect.objectContaining({
        text: typeof text === "string" ? text : expect.stringMatching(text),
        align: "left",
        color: "#195b46",
        font: expect.stringMatching(boldFangSong),
      }),
    );
  }
  expect(drawn).toContainEqual(
    expect.objectContaining({
      text: expect.stringContaining("风险等级：高"),
      color: "#a62830",
      font: expect.stringMatching(/^(?:normal |400 )?16px .*OfferGuard FangSong/),
    }),
  );
  expect(drawn).toContainEqual(
    expect.objectContaining({
      text: expect.stringContaining("原文"),
      color: "#243a32",
      font: expect.stringMatching(/^(?:normal |400 )?16px .*OfferGuard FangSong/),
    }),
  );
  expect(drawn.map(({ text }) => text).join("\n")).not.toMatch(
    /R03-01|合成规则摘要|合成测试依据/,
  );
  expect(
    await page.evaluate(() =>
      [...document.fonts].some(
        ({ family, status }) =>
          family.includes("OfferGuard FangSong") && status === "loaded",
      ),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "展开报告阅读" }).click();
  await expect(page.locator(".document-panel")).toBeHidden();
  await expect(page.locator(".review-panel")).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".risk-card")).toBeVisible();
  await expect(page.locator(".sidebar")).toBeHidden();
  await page.pdf({ path: "/tmp/offerguard-validation/report-export.pdf" });
  await page.emulateMedia({ media: "screen" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect(submitted).toBe(2);
  expect(errors).toEqual([]);
});

test("长报告自动分页并保留末尾内容", async ({ page }) => {
  await page.goto("/");
  const download = page.waitForEvent("download");
  const includesLastLine = await page.evaluate(async () => {
    const modulePath = "/src/lib/reportPdf.ts";
    const { downloadReportPdf } = await import(/* @vite-ignore */ modulePath);
    let drawn = false;
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (
      text,
      x,
      y,
      maxWidth,
    ) {
      if (text === "第 100 条模拟原文。") drawn = true;
      original.call(this, text, x, y, maxWidth);
    };
    try {
      await downloadReportPdf("分页测试", "模拟材料", [
        {
          heading: "风险明细",
          risk: "风险等级：高",
          body: Array.from(
            { length: 100 },
            (_, i) => `第 ${i + 1} 条模拟原文。`,
          ).join("\n"),
        },
      ]);
      return drawn;
    } finally {
      CanvasRenderingContext2D.prototype.fillText = original;
    }
  });
  expect(includesLastLine).toBe(true);
  const pdf = await readFile((await (await download).path())!, "latin1");
  expect(Array.from(pdf.matchAll(/\/Type \/Page\b/g)).length).toBeGreaterThan(
    1,
  );
});
