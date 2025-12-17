export function safeReadLocal(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeWriteLocal(key, val) {
  try {
    localStorage.setItem(key, val);
  } catch {
    /* ignore */
  }
}

export function safeReadJson(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    if (!v) return fallback;
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function safeWriteJson(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* ignore */
  }
}
