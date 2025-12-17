import React from "react";

export function Chip({ active, onClick, children, kind }) {
  return (
    <button type="button" onClick={onClick} style={chipStyle(active, kind)}>
      {children}
    </button>
  );
}

function chipStyle(active, kind) {
  const base = {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    background: "#fff",
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
    lineHeight: 1,
    userSelect: "none",
  };
  if (!active) return base;

  if (kind === "danger") return { ...base, border: "1px solid #fecaca", background: "#fef2f2", color: "#dc2626" };
  if (kind === "warn") return { ...base, border: "1px solid #fed7aa", background: "#fff7ed", color: "#b45309" };
  return { ...base, border: "1px solid #c7d2fe", background: "#eef2ff" };
}
