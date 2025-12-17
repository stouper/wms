import React, { useLayoutEffect, useRef, useState } from "react";
import { Th, Td } from "./TableParts";

export function VirtualTable({ rows, columns, rowHeight = 36, height = "calc(100vh - 230px)" }) {
  const ref = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [measuredHeight, setMeasuredHeight] = useState(520);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries?.[0]?.contentRect?.height || 520;
      setMeasuredHeight(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const total = rows.length;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - 8);
  const endIndex = Math.min(total, startIndex + Math.ceil(measuredHeight / rowHeight) + 16);
  const items = rows.slice(startIndex, endIndex);

  const topPad = startIndex * rowHeight;
  const bottomPad = Math.max(0, (total - endIndex) * rowHeight);

  return (
    <div
      ref={ref}
      style={{ height, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead style={{ position: "sticky", top: 0, background: "#f8fafc", zIndex: 2 }}>
          <tr>
            {columns.map((c) => (
              <Th key={c.key}>{c.title}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {topPad > 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: 0, height: topPad }} />
            </tr>
          ) : null}

          {items.map((r, i) => (
            <tr key={startIndex + i} style={{ height: rowHeight }}>
              {columns.map((c) => {
                const v = c.render ? c.render(r) : r[c.dataIndex];
                const tdStyle = typeof c.tdStyle === "function" ? c.tdStyle(r) : c.tdStyle;
                return (
                  <Td key={c.key} style={tdStyle}>
                    {v}
                  </Td>
                );
              })}
            </tr>
          ))}

          {bottomPad > 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: 0, height: bottomPad }} />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
