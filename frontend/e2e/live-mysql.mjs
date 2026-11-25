// 由 backend/check_live.py 执行，使用实际 API，不模拟响应。
import { chromium, expect as playwrightExpect } from "@playwright/test";
import { jsPDF } from "jspdf";
import { execFileSync } from "node:child_process";

const base = process.env.OG_BASE_URL || "http://127.0.0.1:5173";
const expect = playwrightExpect.configure({ timeout: process.env.OG_BASE_URL ? 15000 : 5000 });
const browser = await chromium.launch({
  executablePath: process.env.OFFERGUARD_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const contexts = [];
const errors = [];
try {
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  async function register(page, email) {
    await page.goto(base + "/login?mode=register");
    await page.getByLabel("邮箱").fill(email);
    await page.getByLabel("密码", { exact: true }).fill(process.env.OG_TEST_PASSWORD);
    await page.getByLabel("确认密码").fill(process.env.OG_TEST_PASSWORD);
    await page.getByRole("button", { name: "注册并进入工作台", exact: true }).click();
    await expect(page.locator(".local-status")).toHaveText("账号工作区");
  }
  await register(page, process.env.OG_TEST_A);
  await page.getByRole("button", { name: "新建求职事项", exact: true }).first().click();
  await page.getByLabel("企业名称").fill("真实MySQL联调企业");
  await page.getByLabel("应聘岗位").fill("开发工程师");
  await page.getByRole("button", { name: "创建事项", exact: true }).click();
  await expect(page.getByRole("heading", { name: "真实MySQL联调企业", exact: true })).toBeVisible();
  const caseUrl = page.url();
  await page.getByRole("button", { name: "添加材料", exact: true }).first().click();
  await page.getByRole("combobox", { name: "材料分类" }).click();
  await page.getByRole("option", { name: "Offer", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "test-offer.txt", mimeType: "text/plain", buffer: Buffer.from("月薪20000元，地点杭州。"),
  });
  await page.getByRole("button", { name: "保存材料", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/reviews\//);
  await expect(page.locator(".text-document-content")).toContainText("月薪20000元");
  await page.getByRole("button", { name: "上传新版本", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "updated-offer.txt", mimeType: "text/plain", buffer: Buffer.from("月薪22000元，地点杭州。"),
  });
  await page.getByRole("button", { name: "保存新版本", exact: true }).click();
  const versionSelect = page.getByRole("combobox", { name: "选择文件版本" });
  await expect(versionSelect).toHaveText("第 2 版 · 当前");
  await versionSelect.click();
  await expect(page.getByRole("option")).toHaveCount(2);
  const snapshot = await (await context.request.get(base + "/api/workspace")).json();
  const v1 = snapshot.versions.find((v) => v.number === 1);
  const v2 = snapshot.versions.find((v) => v.number === 2);
  await expect(page.locator(".text-document-content")).toContainText("月薪22000元");
  await page.getByRole("option", { name: "第 1 版 · 历史" }).click();
  await expect(page.locator(".text-document-content")).toContainText("月薪20000元");
  await page.getByRole("button", { name: "待确认", exact: true }).click();
  await page.getByLabel("记录待确认问题").fill("确认试用期工资");
  await page.getByRole("button", { name: "保存待确认问题", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("问题已保存");
  await page.goto(caseUrl);
  await page.getByRole("button", { name: "待确认事项", exact: true }).click();
  await expect(page.getByText("确认试用期工资", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "HR 沟通", exact: true }).click();
  await page.getByLabel("向 HR 确认的问题").fill("工资是否固定？");
  await page.getByLabel("HR 的回复").fill("固定月薪22000元");
  await page.getByRole("button", { name: "保存记录", exact: true }).click();
  await expect(page.locator(".communication-list")).toContainText("固定月薪22000元");
  async function uploadOriginal(name, mimeType, buffer) {
    await page.goto(caseUrl);
    await page.getByRole("button", { name: "添加材料", exact: true }).first().click();
    await page.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer });
    await page.getByRole("button", { name: "保存材料", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/reviews\//);
    await page.getByRole("button", { name: "原件", exact: true }).click();
  }
  const pdf = new jsPDF();
  pdf.text("Cloud preview: monthly salary 22000 CNY.", 20, 20);
  await uploadOriginal("cloud-preview.pdf", "application/pdf", Buffer.from(pdf.output("arraybuffer")));
  await expect(page.locator(".pdf-page .pdf-text-layer")).toContainText("monthly salary 22000");
  await expect(page.locator(".pdf-loading")).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载原件", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("cloud-preview.pdf");
  const docx = execFileSync("python3", ["-c", `
import io, sys, zipfile
data = io.BytesIO()
with zipfile.ZipFile(data, "w", zipfile.ZIP_DEFLATED) as doc:
    doc.writestr("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    doc.writestr("_rels/.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    doc.writestr("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>云端 Word 原件：固定月薪22000元。</w:t></w:r></w:p></w:body></w:document>')
sys.stdout.buffer.write(data.getvalue())
`]);
  await uploadOriginal("cloud-preview.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", docx);
  await expect(page.locator(".word-preview")).toContainText("固定月薪22000元");
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  expect((await context.request.get(base + v1.fileUrl)).status()).toBe(401);
  await page.getByLabel("邮箱").fill(process.env.OG_TEST_A);
  await page.getByLabel("密码", { exact: true }).fill(process.env.OG_TEST_PASSWORD);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.locator(".local-status")).toHaveText("账号工作区");
  await page.goto(caseUrl);
  await expect(page.getByRole("heading", { name: "真实MySQL联调企业", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "真实MySQL联调企业", exact: true })).toBeVisible();
  const second = await browser.newContext();
  contexts.push(second);
  const other = await second.newPage();
  await register(other, process.env.OG_TEST_B);
  expect((await (await second.request.get(base + "/api/workspace")).json()).cases).toEqual([]);
  expect((await second.request.get(base + v1.fileUrl)).status()).toBe(404);
  const session = await (await second.request.get(base + "/api/auth/me")).json();
  const denied = await second.request.delete(base + "/api/cases/" + v1.caseId, {
    headers: { Origin: base, "X-CSRF-Token": session.csrf },
  });
  expect(denied.status()).toBe(404);
  await page.getByRole("button", { name: "删除这个事项", exact: true }).click();
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  expect((await context.request.get(base + v1.fileUrl)).status()).toBe(404);
  expect((await (await context.request.get(base + "/api/workspace")).json()).versions).toEqual([]);
  expect(errors).toEqual([]);
  console.log("PASS: actual MySQL registration, versions, PDF/Word previews, download, todos, HR records, relogin, isolation and deletion");
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
