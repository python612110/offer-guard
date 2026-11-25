import { test, expect } from "@playwright/test";
import type { AppData } from "../src/types";

test("账号 API 契约：登录、保存材料、重登恢复与本设备隔离", async ({
  page,
}) => {
  // 浏览器状态流测试，响应采用已由 MySQL 集成测试验证的契约；不是真实数据库联调。
  const state: AppData = {
    records: [],
    cases: [],
    materials: [],
    versions: [],
    todos: [],
    communications: [],
    events: [],
    assets: [],
    profile: { name: "", school: "", role: "" },
  };
  const csrf = "test-csrf-token";
  const session = {
    user: { id: crypto.randomUUID(), email: "student@example.test" },
    csrf,
  };
  const errors: string[] = [];
  let loggedIn = false;
  let protectedWrites = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/**", async (route) => {
    if (new URL(route.request().url()).hostname !== "127.0.0.1") return route.continue();
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(4);
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
    if (!loggedIn) return respond({ detail: "请登录后继续。" }, 401);
    if (request.method() !== "GET") {
      expect(request.headers()["x-csrf-token"]).toBe(csrf);
      protectedWrites++;
    }
    if (path === "/auth/me") return respond(session);
    if (path === "/auth/logout") {
      loggedIn = false;
      return route.fulfill({ status: 204 });
    }
    if (path === "/workspace") return respond(state);
    if (path === "/cases") {
      const item = {
        ...request.postDataJSON(),
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
      state.cases.unshift(item);
      return respond(item, 201);
    }
    if (/^\/cases\/[^/]+\/materials$/.test(path)) {
      const caseId = path.split("/")[2];
      const materialId = crypto.randomUUID();
      const id = crypto.randomUUID();
      state.materials.unshift({
        id: materialId,
        caseId,
        title: "测试Offer.txt",
        type: "Offer",
        currentVersionId: id,
        createdAt: new Date().toISOString(),
      });
      const version = {
        id,
        caseId,
        materialId,
        number: 1,
        filename: "测试Offer.txt",
        mime: "text/plain",
        size: 20,
        fileUrl: `/api/versions/${id}/file`,
        pages: [{ number: 1, text: "月薪 20000 元，工作地点杭州。" }],
        parseState: "readable" as const,
        parseNote: "",
        createdAt: new Date().toISOString(),
      };
      state.versions.unshift(version);
      return respond(version, 201);
    }
    if (/^\/versions\/[^/]+\/file$/.test(path)) {
      return route.fulfill({
        contentType: "text/plain",
        body: "月薪 20000 元，工作地点杭州。",
      });
    }
    if (/^\/versions\/[^/]+\/reviews$/.test(path)) return respond([]);
    if (/^\/cases\/[^/]+\/communications$/.test(path)) {
      const item = {
        ...request.postDataJSON(),
        id: crypto.randomUUID(),
        caseId: path.split("/")[2],
        createdAt: new Date().toISOString(),
      };
      state.communications.unshift(item);
      return respond(item, 201);
    }
    throw new Error(`未定义的测试请求：${request.method()} ${path}`);
  });
  await page.goto("/app");
  await page.getByRole("button", { name: "继续使用本设备工作区" }).click();
  await page
    .getByRole("button", { name: "新建求职事项", exact: true })
    .first()
    .click();
  await page.getByLabel("企业名称").fill("本设备旧事项");
  await page.getByLabel("应聘岗位").fill("本地岗位");
  await page.getByRole("button", { name: "创建事项", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "本设备旧事项" }),
  ).toBeVisible();

  async function login() {
    await page.goto("/login");
    await page.getByLabel("邮箱").fill(session.user.email);
    await page
      .getByLabel("密码", { exact: true })
      .fill("correct horse battery staple");
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page.locator(".local-status")).toHaveText("账号工作区");
  }
  await login();
  await expect(page.getByText("本设备旧事项", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "新建求职事项", exact: true })
    .first()
    .click();
  await page.getByLabel("企业名称").fill("账号测试企业");
  await page.getByLabel("应聘岗位").fill("前端工程师");
  await page.getByRole("button", { name: "创建事项", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "账号测试企业" }),
  ).toBeVisible();
  const caseUrl = page.url();
  await page
    .getByRole("button", { name: "添加材料", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "粘贴文本", exact: true }).click();
  await page.getByRole("combobox", { name: "材料分类" }).click();
  await page.getByRole("option", { name: "Offer", exact: true }).click();
  await page.getByPlaceholder("例如：岗位招聘信息").fill("测试Offer");
  await page
    .getByPlaceholder("粘贴完整原文，保留薪资、日期与适用条件。")
    .fill("月薪 20000 元，工作地点杭州。");
  await page.getByRole("button", { name: "保存材料", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/reviews\//);
  await expect(page.locator(".text-document-content")).toContainText(
    "月薪 20000 元",
  );
  await page.reload();
  await expect(page.locator(".text-document-content")).toContainText(
    "月薪 20000 元",
  );
  await page.goto(caseUrl);
  await page.getByRole("button", { name: "HR 沟通", exact: true }).click();
  await page.getByLabel("向 HR 确认的问题").fill("工资是否固定？");
  await page.getByLabel("HR 的回复").fill("固定月薪20000元");
  await page.getByRole("button", { name: "保存记录", exact: true }).click();
  await expect(page.locator(".communication-list")).toContainText(
    "固定月薪20000元",
  );
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await login();
  await page.goto(caseUrl);
  await expect(
    page.getByRole("heading", { name: "账号测试企业" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await page.getByRole("button", { name: "继续使用本设备工作区" }).click();
  await expect(page.locator(".local-status")).toHaveText("本设备工作区");
  await expect(page.getByText("本设备旧事项", { exact: true })).toBeVisible();
  await expect(page.getByText("账号测试企业", { exact: true })).toHaveCount(0);
  expect(protectedWrites).toBeGreaterThanOrEqual(5);
  expect(errors).toEqual([]);
});
