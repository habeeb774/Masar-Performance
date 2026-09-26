import { describe, expect, it } from "vitest";
import { buildAuthorizeUrl, classifyTokenError, cleanEnv, isOAuthResult, OAUTH_CALLBACK_PATH, OAUTH_RESULT_MESSAGES, resolveOAuthConfig } from "@/lib/notion/oauth";

describe("resolveOAuthConfig", () => {
  it("is disabled until both client id and secret are set", () => {
    expect(resolveOAuthConfig({ APP_URL: "https://x.app" })).toBeNull();
    expect(resolveOAuthConfig({ NOTION_OAUTH_CLIENT_ID: "id", APP_URL: "https://x.app" })).toBeNull();
    expect(resolveOAuthConfig({ NOTION_OAUTH_CLIENT_SECRET: "s", APP_URL: "https://x.app" })).toBeNull();
  });
  it("derives the redirect URI from APP_URL (trailing slash safe)", () => {
    const c = resolveOAuthConfig({ NOTION_OAUTH_CLIENT_ID: " id ", NOTION_OAUTH_CLIENT_SECRET: "s", APP_URL: "https://masar.app/" });
    expect(c).toEqual({ clientId: "id", clientSecret: "s", redirectUri: `https://masar.app${OAUTH_CALLBACK_PATH}` });
  });
  it("prefers an explicit redirect URI", () => {
    const c = resolveOAuthConfig({
      NOTION_OAUTH_CLIENT_ID: "id",
      NOTION_OAUTH_CLIENT_SECRET: "s",
      NOTION_OAUTH_REDIRECT_URI: "https://custom.example/cb",
      APP_URL: "https://masar.app",
    });
    expect(c?.redirectUri).toBe("https://custom.example/cb");
  });
  it("needs some redirect URI", () => {
    expect(resolveOAuthConfig({ NOTION_OAUTH_CLIENT_ID: "id", NOTION_OAUTH_CLIENT_SECRET: "s" })).toBeNull();
  });
});

describe("buildAuthorizeUrl", () => {
  it("builds Notion's consent URL with an encoded redirect and state", () => {
    const url = new URL(buildAuthorizeUrl({ clientId: "abc-123", redirectUri: "https://masar.app/api/notion/oauth/callback" }, "st@te"));
    expect(url.origin + url.pathname).toBe("https://api.notion.com/v1/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("abc-123");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("owner")).toBe("user");
    expect(url.searchParams.get("redirect_uri")).toBe("https://masar.app/api/notion/oauth/callback");
    expect(url.searchParams.get("state")).toBe("st@te");
  });
});

describe("resolveOAuthConfig — env hygiene", () => {
  it("accepts the NOTION_CLIENT_* aliases", () => {
    const c = resolveOAuthConfig({ NOTION_CLIENT_ID: "id", NOTION_CLIENT_SECRET: "s", NOTION_REDIRECT_URI: "https://m.app/cb" });
    expect(c).toEqual({ clientId: "id", clientSecret: "s", redirectUri: "https://m.app/cb" });
  });
  it("strips wrapping quotes and whitespace pasted into dashboards", () => {
    const c = resolveOAuthConfig({ NOTION_OAUTH_CLIENT_ID: ' "id" ', NOTION_OAUTH_CLIENT_SECRET: "'secret_x'", APP_URL: '"https://m.app/"' });
    expect(c).toEqual({ clientId: "id", clientSecret: "secret_x", redirectUri: `https://m.app${OAUTH_CALLBACK_PATH}` });
  });
  it("treats empty quoted values as unset", () => {
    expect(cleanEnv('""')).toBeUndefined();
    expect(resolveOAuthConfig({ NOTION_OAUTH_CLIENT_ID: '""', NOTION_OAUTH_CLIENT_SECRET: "s", APP_URL: "https://m.app" })).toBeNull();
  });
});

describe("classifyTokenError", () => {
  it("maps Notion's token endpoint failures", () => {
    expect(classifyTokenError(401, "invalid_client")).toBe("credentials");
    expect(classifyTokenError(401, undefined)).toBe("credentials");
    expect(classifyTokenError(400, "invalid_grant")).toBe("grant");
    expect(classifyTokenError(undefined, undefined)).toBe("network");
    expect(classifyTokenError(500, undefined)).toBe("unknown");
  });
});

describe("OAuth result messages", () => {
  it("never expose technical terms to users", () => {
    for (const r of Object.values(OAUTH_RESULT_MESSAGES)) expect(r.message).not.toMatch(/token|secret|401|client|oauth|redirect/i);
    expect(isOAuthResult("credentials")).toBe(true);
    expect(isOAuthResult("nope")).toBe(false);
  });
});
