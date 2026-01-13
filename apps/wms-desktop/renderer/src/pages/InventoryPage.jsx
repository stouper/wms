// renderer/src/pages/InventoryPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useToasts } from "../lib/toasts.jsx";
import { inputStyle, primaryBtn } from "../ui/styles";

// ✅ 정석: Page는 workflow만 호출
import { inventoryFlow } from "../workflows/inventory/inventory.workflow";
import { importsFlow } from "../workflows/imports/imports.workflow";

export default function InventoryPage() {
  const { push, ToastHost } = useToasts();

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);

  // ✅ 상단 검색(전체 검색)
  const [q, setQ] = useState("");

  // ✅ HQ 업로드 상태
  const [hqFile, setHqFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  // ✅ 빠른 필터(토글)
  const [onlyExceptions, setOnlyExceptions] = useState(false); // RET-01 + UNASSIGNED만
  const [hideZero, setHideZero] = useState(false); // onHand 0 숨김

  // ✅ 정렬
  const [sortKey, setSortKey] = useState("LOC"); // LOC | SKU | QTY
  const [sortDir, setSortDir] = useState("ASC"); // ASC | DESC

  // ✅ Location 자연정렬(핵심)
  function parseLocKey(code) {
    const s = String(code || "").trim();
    // 예: A-1002, A-1, B-12
    const m = s.match(/^([A-Za-z]+)[-_ ]?(\d+)$/);
    if (!m) {
      // RET-01, UNASSIGNED 같은 특수코드
      return {
        kind: 1, // 숫자형 로케이션 뒤로
        prefix: s.toUpperCase(),
        num: Number.POSITIVE_INFINITY,
        raw: s.toUpperCase(),
      };
    }
    return {
      kind: 0,
      prefix: m[1].toUpperCase(),
      num: Number(m[2]),
      raw: s.toUpperCase(),
    };
  }

  function compareLocation(aCode, bCode) {
    const a = parseLocKey(aCode);
    const b = parseLocKey(bCode);

    // 0(정상 A-숫자) 먼저, 1(특수) 뒤로
    if (a.kind !== b.kind) return a.kind - b.kind;

    // prefix(A,B,...) 비교
    const p = a.prefix.localeCompare(b.prefix);
    if (p !== 0) return p;

    // 숫자 비교
    if (a.num !== b.num) return a.num - b.num;

    // 마지막 raw
    return a.raw.localeCompare(b.raw);
  }

  async function load() {
    setLoading(true);
    try {
      const list = await inventoryFlow.loadSummary({ limit: 50000 });
      setRows(list);
    } catch (e) {
      push({ kind: "error", title: "재고 로드 실패", message: e?.message || String(e) });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function uploadHqInventory() {
    if (!hqFile) {
      push({ kind: "error", title: "파일 없음", message: "업로드할 HQ 재고 엑셀을 선택해줘." });
      return;
    }

    setUploading(true);
    try {
      await importsFlow.uploadHqInventory({ file: hqFile });

      push({ kind: "success", title: "업로드 완료", message: "HQ 재고 업로드 완료. 새로고침할게." });

      setHqFile(null);
      await load();
    } catch (e) {
      push({ kind: "error", title: "업로드 실패", message: e?.message || String(e) });
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    let out = rows;

    // 0) 예외 위치만
    if (onlyExceptions) {
      out = out.filter((r) => {
        const lc = String(r.locationCode || "").toUpperCase();
        return lc === "RET-01" || lc === "UNASSIGNED";
      });
    }

    // 1) 0 숨김
    if (hideZero) {
      out = out.filter((r) => Number(r.onHand ?? 0) !== 0);
    }

    // 2) 전체 검색
    const s = (q || "").trim().toLowerCase();
    if (s) {
      out = out.filter((r) => {
        const hay = [r.locationCode, r.skuCode, r.makerCode, r.skuName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(s);
      });
    }

    // 3) 정렬
    const dir = sortDir === "DESC" ? -1 : 1;

    out = [...out].sort((a, b) => {
      if (sortKey === "QTY") {
        const av = Number(a.onHand ?? 0);
        const bv = Number(b.onHand ?? 0);
        return (av - bv) * dir; // ✅ 숫자 정렬
      }
      if (sortKey === "SKU") {
        return String(a.skuCode || "").localeCompare(String(b.skuCode || "")) * dir;
      }
      // ✅ LOC: 자연정렬
      const c = compareLocation(a.locationCode, b.locationCode);
      if (c !== 0) return c * dir;

      // tie-breaker
      return String(a.skuCode || "").localeCompare(String(b.skuCode || "")) * dir;
    });

    return out;
  }, [rows, onlyExceptions, hideZero, q, sortKey, sortDir]);

  // ✅ 현재 화면(필터/검색 적용된 filtered) OnHand 합계
  const sumOnHand = useMemo(() => {
    return filtered.reduce((acc, r) => acc + Number(r.onHand ?? 0), 0);
  }, [filtered]);

  const pillBtn = (active) => ({
    padding: "7px 10px",
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    background: active ? "#0ea5e9" : "#fff",
    color: active ? "#fff" : "#0f172a",
    fontWeight: 800,
    cursor: "pointer",
    userSelect: "none",
  });

  function resetFilters() {
    setQ("");
    setOnlyExceptions(false);
    setHideZero(false);
    setSortKey("LOC");
    setSortDir("ASC");
  }

  // ✅ 헤더 클릭 정렬
  function toggleSort(key) {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((d) => (d === "ASC" ? "DESC" : "ASC"));
        return prevKey;
      }
      setSortDir("ASC");
      return key;
    });
  }

  function sortIcon(key) {
    if (sortKey !== key) return <span style={{ color: "#cbd5e1" }}>↕</span>;
    return sortDir === "ASC" ? <span>▲</span> : <span>▼</span>;
  }

  const thBase = {
    padding: "10px 12px",
    fontWeight: 800,
    fontSize: 12,
    color: "#64748b",
    userSelect: "none",
    whiteSpace: "nowrap",
  };

  const thClickable = {
    cursor: "pointer",
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <ToastHost />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 900 }}>창고 재고</div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="전체 검색 (Location / SKU / MakerCode / 상품명)"
            style={{ ...inputStyle, minWidth: 340 }}
          />

          <button type="button" style={primaryBtn} onClick={load} disabled={loading}>
            새로고침
          </button>
        </div>
      </div>

      {/* Controls */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 12,
          background: "#fff",
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            style={pillBtn(onlyExceptions)}
            onClick={() => setOnlyExceptions((v) => !v)}
            title="RET-01 / UNASSIGNED만 보기"
          >
            RET/UNASSIGNED
          </button>

          <button type="button" style={pillBtn(hideZero)} onClick={() => setHideZero((v) => !v)} title="OnHand=0 숨김">
            0 숨김
          </button>

          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
            style={{ ...inputStyle, padding: "8px 10px", minWidth: 160 }}
            title="정렬 기준"
          >
            <option value="LOC">정렬: Location</option>
            <option value="SKU">정렬: SKU</option>
            <option value="QTY">정렬: OnHand</option>
          </select>

          <select
            value={sortDir}
            onChange={(e) => setSortDir(e.target.value)}
            style={{ ...inputStyle, padding: "8px 10px", minWidth: 120 }}
            title="정렬 방향"
          >
            <option value="ASC">오름차순</option>
            <option value="DESC">내림차순</option>
          </select>

          <button
            type="button"
            style={{ ...primaryBtn, background: "#fff", color: "#0f172a", border: "1px solid #e5e7eb" }}
            onClick={resetFilters}
          >
            필터 초기화
          </button>
        </div>

        <div style={{ fontSize: 12, color: "#64748b" }}>
          rows: <b>{filtered.length.toLocaleString()}</b>
        </div>
      </div>

      {/* HQ 업로드 */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 12,
          background: "#fff",
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontWeight: 800 }}>HQ 재고 업로드</div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>엑셀 선택 → 업로드 → 자동 새로고침 (POST /imports/hq-inventory)</div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setHqFile(e.target.files?.[0] || null)}
            disabled={uploading}
            style={{ ...inputStyle, padding: 8 }}
          />

          <button type="button" style={primaryBtn} onClick={uploadHqInventory} disabled={uploading || !hqFile}>
            {uploading ? "업로드중..." : "업로드"}
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "auto", background: "#fff" }}>
        <table
          style={{
            width: "fit-content",
            borderCollapse: "collapse",
            tableLayout: "fixed",
            minWidth: 0,
          }}
        >
          <thead style={{ background: "#f8fafc" }}>
            <tr>
              <th
                style={{ ...thBase, ...thClickable, textAlign: "left", width: 120 }}
                onClick={() => toggleSort("LOC")}
                title="정렬: Location (자연정렬)"
              >
                <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <span>Location</span>
                  {sortIcon("LOC")}
                </span>
              </th>

              <th
                style={{ ...thBase, ...thClickable, textAlign: "left", width: 210 }}
                onClick={() => toggleSort("SKU")}
                title="정렬: SKU"
              >
                <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <span>SKU</span>
                  {sortIcon("SKU")}
                </span>
              </th>

              <th style={{ ...thBase, textAlign: "left", width: 160 }}>MakerCode</th>

              <th style={{ ...thBase, textAlign: "left", width: 380 }}>상품명</th>

              <th
                style={{ ...thBase, ...thClickable, textAlign: "right", width: 160 }}
                onClick={() => toggleSort("QTY")}
                title="정렬: OnHand"
              >
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, alignItems: "baseline" }}>
                  <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                    <span>OnHand</span>
                    {sortIcon("QTY")}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 900, color: "#0f172a" }}>
                    Σ {sumOnHand.toLocaleString()}
                  </span>
                </div>
              </th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((r) => (
              <tr key={`${r.skuId ?? ""}-${r.locationId ?? ""}-${r.skuCode ?? ""}`} style={{ borderTop: "1px solid #e5e7eb" }}>
                <td style={{ padding: "10px 12px", width: 120, fontFamily: "Consolas, monospace", whiteSpace: "nowrap" }}>
                  {r.locationCode || "-"}
                </td>
                <td style={{ padding: "10px 12px", width: 210, fontFamily: "Consolas, monospace", whiteSpace: "nowrap" }}>
                  {r.skuCode || "-"}
                </td>
                <td style={{ padding: "10px 12px", width: 160, fontFamily: "Consolas, monospace", whiteSpace: "nowrap" }}>
                  {r.makerCode || "-"}
                </td>
                <td
                  style={{
                    padding: "10px 12px",
                    width: 380,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={r.skuName || ""}
                >
                  {r.skuName || "-"}
                </td>
                <td style={{ padding: "10px 12px", width: 160, textAlign: "right", fontWeight: 900 }}>
                  {Number(r.onHand ?? 0)}
                </td>
              </tr>
            ))}

            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 14, textAlign: "center", color: "#94a3b8" }}>
                  재고 데이터가 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
