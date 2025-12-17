import React from "react";

export default function EmptyPage({ title, subtitle = "준비중 (우선 메뉴만 남김)" }) {
  return (
    <div>
      <h1 style={{ margin: 0 }}>{title}</h1>
      <p style={{ color: "#64748b" }}>{subtitle}</p>
    </div>
  );
}
