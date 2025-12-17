import React from "react";

export function Th({ children }) {
  return (
    <th style={{ padding: 10, textAlign: "left", borderBottom: "1px solid #e5e7eb", fontSize: 12, color: "#64748b" }}>
      {children}
    </th>
  );
}

export function Td({ children, style }) {
  return (
    <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9", fontSize: 13, ...style }}>
      {children}
    </td>
  );
}
