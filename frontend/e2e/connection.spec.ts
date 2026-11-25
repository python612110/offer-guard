import { test, expect } from "@playwright/test";

test("数据库尚未配置时明确提示，不进入账号工作区", async ({ page }) => {
  // 仅固定服务未就绪的响应，确保测试不依赖用户的 MySQL 密码。
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        detail: "数据库暂未就绪，请检查 MySQL 配置及数据库迁移。",
      }),
    }),
  );
  await page.goto("/login");
  await page.getByLabel("邮箱").fill("test@example.test");
  await page
    .getByLabel("密码", { exact: true })
    .fill("correct horse battery staple");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("数据库暂未就绪");
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole("button", { name: "继续使用本设备工作区" }).click();
  await expect(page.locator(".local-status")).toHaveText("本设备工作区");
});

test("注册表单校验与返回本设备模式保留已有材料", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/app");
  await page.getByRole("button", { name: "继续使用本设备工作区" }).click();
  await page
    .getByRole("button", { name: "新建求职事项", exact: true })
    .first()
    .click();
  await page.getByLabel("企业名称").fill("本设备保留测试");
  await page.getByLabel("应聘岗位").fill("开发工程师");
  await page.getByRole("button", { name: "创建事项", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "本设备保留测试" }),
  ).toBeVisible();
  const caseUrl = page.url();
  await page.goto("/login?mode=register");
  await page.getByLabel("邮箱").fill("test@example.test");
  await page
    .getByLabel("密码", { exact: true })
    .fill("correct horse battery staple");
  await page.getByLabel("确认密码").fill("incorrect confirmation");
  await page.getByRole("button", { name: "注册并进入工作台" }).click();
  await expect(page.getByRole("alert")).toContainText("两次密码不一致");
  await page.getByRole("button", { name: "继续使用本设备工作区" }).click();
  await page.goto(caseUrl);
  await expect(
    page.getByRole("heading", { name: "本设备保留测试" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "本设备保留测试" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("手机登录页没有横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login?mode=register");
  await expect(
    page.getByRole("heading", { name: "创建你的求职账号" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "继续使用本设备工作区" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});
