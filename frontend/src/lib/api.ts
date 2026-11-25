import type { AppData } from "../types";

export interface Account {
  id: string;
  email: string;
}
export interface SessionInfo {
  user: Account;
  csrf: string;
}
let csrf = "";
export function setSession(session?: SessionInfo) {
  csrf = session?.csrf || "";
}

export async function api<T = void>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (options.method && options.method !== "GET")
    headers.set("X-CSRF-Token", csrf);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers,
      credentials: "same-origin",
    });
  } catch {
    throw new Error("后端暂时无法连接，请确认后端服务已启动。");
  }
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/")) {
      window.dispatchEvent(new Event("offerguard-session-expired"));
    }
    const body = await response.json().catch(() => ({}));
    throw new Error(
      typeof body.detail === "string"
        ? body.detail
        : response.status === 422
          ? "输入或文件格式不符合要求，请检查后重试。"
          : response.status === 503
            ? "MySQL 暂未配置，请完成后端数据库初始化。"
            : "请求失败，请稍后重试。",
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export async function fetchBlob(url: string): Promise<Blob> {
  if (!/^\/api\/(versions|assets)\/[a-f0-9-]+\/file$/.test(url))
    throw new Error("文件地址不合法。");
  const response = await fetch(url, { credentials: "same-origin" });
  if (response.status === 401)
    window.dispatchEvent(new Event("offerguard-session-expired"));
  if (!response.ok)
    throw new Error(
      response.status === 401 ? "请重新登录。" : "原文件暂时无法读取，请重试。",
    );
  return response.blob();
}

export async function readWorkspace(): Promise<AppData> {
  const data = await api<
    Omit<AppData, "assets"> & {
      assets: (AppData["assets"][number] & { fileUrl: string })[];
    }
  >("/workspace");
  const assets = await Promise.all(
    data.assets.map(async (asset) => ({
      ...asset,
      blob: await fetchBlob(asset.fileUrl),
    })),
  );
  return { ...data, records: data.records || [], annotations: data.annotations || [], assets };
}

export const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
