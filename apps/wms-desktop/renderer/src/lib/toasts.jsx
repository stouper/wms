import React, { useState } from "react";

export function useToasts() {
  const [toasts, setToasts] = useState([]);

  const push = (t) => {
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const toast = { id, kind: t.kind || "info", title: t.title || "", message: t.message || "" };
    setToasts((prev) => [toast, ...prev].slice(0, 5));
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 2400);
  };

  const ToastHost = () => (
    <div style={{ position: "fixed", top: 14, right: 14, zIndex: 9999, display: "grid", gap: 8 }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            minWidth: 280,
            maxWidth: 420,
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "#fff",
            padding: 10,
            boxShadow: "0 10px 20px rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ fontWeight: 900, color: toastColor(t.kind) }}>{t.title}</div>
            <div style={{ width: 10, height: 10, borderRadius: 99, background: toastColor(t.kind) }} />
          </div>
          {t.message && <div style={{ marginTop: 6, color: "#334155", fontSize: 13, lineHeight: 1.35 }}>{t.message}</div>}
        </div>
      ))}
    </div>
  );

  return { push, ToastHost };
}

function toastColor(kind) {
  if (kind === "success") return "#16a34a";
  if (kind === "error") return "#dc2626";
  if (kind === "warn") return "#b45309";
  return "#334155";
}
