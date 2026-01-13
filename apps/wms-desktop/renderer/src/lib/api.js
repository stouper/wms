// apps/wms-desktop/renderer/src/lib/api.js
import { safeReadLocal } from "./storage";

function normalizeUrl(url) {
  if (!url || typeof url !== "string") return null;
  const u = url.trim().replace(/\/+$/, "");
  if (!u.startsWith("http://") && !u.startsWith("https://")) return null;
  return u;
}

function readOverrideFromLocalStorage() {
  const saved = safeReadLocal("wms.apiBase");
  return normalizeUrl(saved);
}

function readFromInjectedConfig() {
  const cfg = globalThis.__APP_CONFIG__;
  if (!cfg || typeof cfg !== "object") return null;

  const mode = cfg.mode === "prod" ? "prod" : "dev";
  return normalizeUrl(cfg?.api?.[mode]);
}

export function getApiBase() {
  // 1) localStorage 강제 override
  const override = readOverrideFromLocalStorage();
  if (override) return override;

  // 2) config.json → main.cjs injected 값
  const fromCfg = readFromInjectedConfig();
  if (fromCfg) return fromCfg;

  // 3) 최후 fallback (Desktop 전용)
  return "http://localhost:3000";
}
