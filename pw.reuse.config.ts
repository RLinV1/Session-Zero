import base from "./playwright.config";
export default { ...base, webServer: (base.webServer as { reuseExistingServer: boolean }[]).map((s) => ({ ...s, reuseExistingServer: true })) };
