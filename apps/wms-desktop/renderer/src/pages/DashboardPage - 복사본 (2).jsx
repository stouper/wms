// apps/wms-desktop/renderer/src/pages/DashboardPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useToasts } from "../lib/toasts.jsx";
import { ymdKST } from "../lib/dates";
import { getApiBase } from "../workflows/_common/api";
import { primaryBtn, inputStyle } from "../ui/styles";
import { holidays as fetchHolidays } from "@kyungseopk1m/holidays-kr";

// ✅ 정답지 파서(출고/반품 공용)
import { parseJobFileToRows } from "../workflows/_common/excel/parseStoreOutbound";

/**
 * Dashboard
 * - 스케줄 달력(로컬 저장) + 🇰🇷 공휴일 표시(패키지)
 * - ✅ EPMS Export: 우측(오늘 일정) 아래로 이동
 * - ✅ 작지 생성: EPMS Export처럼 "가로 컨트롤 바" + 아래 요약/미리보기
 *
 * 분기 규칙(파서 기준):
 * - row.jobKind === "출고" → 출고 작지
 * - row.jobKind === "반품" → 입고(반품입고) 작지
 */
export default function DashboardPage() {
  const { push, ToastHost } = useToasts();

  // ---------------------------
  // EPMS Export (range -> list -> select -> download)
  // ---------------------------
  const [fromYmd, setFromYmd] = useState(() => ymdKST(new Date()));
  const [toYmd, setToYmd] = useState(() => ymdKST(new Date()));

  const [loadingList, setLoadingList] = useState(false);
  const [jobs, setJobs] = useState([]); // done 전체를 받아서 기간 필터링
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [activeJobId, setActiveJobId] = useState(null);

  const activeJob = useMemo(() => {
    return (jobs || []).find((j) => j?.id === activeJobId) || null;
  }, [jobs, activeJobId]);

  const selectedJobs = useMemo(() => {
    const ids = selectedIds;
    return (jobs || []).filter((j) => ids.has(j?.id));
  }, [jobs, selectedIds]);

  const selectedCount = selectedJobs.length;

  function toTs(v) {
    if (!v) return 0;
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    if (v instanceof Date) {
      const t = v.getTime();
      return Number.isFinite(t) ? t : 0;
    }
    if (typeof v === "string") {
      const s = v.trim();
      if (!s) return 0;
      if (/^\d+$/.test(s)) {
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
      }
      const t = Date.parse(s);
      return Number.isFinite(t) ? t : 0;
    }
    return 0;
  }

  function getDoneTs(j) {
    return (
      toTs(j?.doneAt || j?.done_at) ||
      toTs(j?.completedAt || j?.completed_at) ||
      toTs(j?.updatedAt || j?.updated_at) ||
      toTs(j?.createdAt || j?.created_at) ||
      0
    );
  }

  async function fetchJobsForRange() {
    const apiBase = getApiBase();
    const from = (fromYmd || "").trim();
    const to = (toYmd || "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      push({ kind: "error", title: "날짜 형식", message: "From/To 모두 YYYY-MM-DD로 선택해줘" });
      return;
    }

    const fromTs = new Date(from + "T00:00:00+09:00").getTime();
    const toTs = new Date(to + "T23:59:59.999+09:00").getTime();

    if (!Number.isFinite(fromTs) || !Number.isFinite(toTs)) {
      push({ kind: "error", title: "날짜", message: "From/To 날짜가 유효하지 않아" });
      return;
    }
    if (fromTs > toTs) {
      push({ kind: "warn", title: "기간", message: "From이 To보다 클 수는 없어" });
      return;
    }

    try {
      setLoadingList(true);
      setActiveJobId(null);
      setSelectedIds(new Set());
      setJobs([]);

      const url = `${apiBase}/jobs?status=done`;
      const data = await tryJsonFetch(url);

      const all = Array.isArray(data) ? data : data?.rows || data?.jobs || data?.data || [];

      const filtered = (all || [])
        .filter((j) => {
          const st = String(j?.status || "").toLowerCase().trim();
          if (st && st !== "done") return false;

          const t = getDoneTs(j);
          if (!t) return false;

          const ymd = ymdKST(new Date(t));
          return ymd >= from && ymd <= to;
        })
        .map((j) => {
          const t = getDoneTs(j);
          const ymd = t ? ymdKST(new Date(t)) : "";
          return { ...j, _exportDate: ymd };
        });

      if (filtered.length === 0) {
        push({ kind: "warn", title: "조회 결과 없음", message: `${from} ~ ${to} 완료된 작지가 없어` });
        return;
      }

      const uniq = new Map();
      for (const j of filtered) {
        if (!j?.id) continue;
        if (!uniq.has(j.id)) uniq.set(j.id, j);
      }

      const sorted = [...uniq.values()].sort((a, b) => {
        const ad = String(a?._exportDate || "").localeCompare(String(b?._exportDate || ""));
        if (ad !== 0) return ad;

        const as = String(a?.storeCode || a?.store_code || "").localeCompare(String(b?.storeCode || b?.store_code || ""));
        if (as !== 0) return as;

        const at = getDoneTs(a);
        const bt = getDoneTs(b);
        if (at !== bt) return bt - at;

        return String(a?.id || "").localeCompare(String(b?.id || ""));
      });

      setJobs(sorted);
      push({ kind: "success", title: "조회 완료", message: `${from} ~ ${to} 작업 ${sorted.length}건` });
    } catch (e) {
      push({ kind: "error", title: "조회 실패", message: e?.message || String(e) });
    } finally {
      setLoadingList(false);
    }
  }

  function toggleSelectJob(jobId) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }

  function selectAll() {
    const next = new Set();
    for (const j of jobs || []) {
      if (j?.id) next.add(j.id);
    }
    setSelectedIds(next);
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function downloadSelected() {
    if (selectedJobs.length === 0) {
      push({ kind: "warn", title: "다운로드", message: "선택된 작업이 없어" });
      return;
    }

    try {
      const from = (fromYmd || "").trim();
      const to = (toYmd || "").trim();

      const csvText = buildEpmsOutCsvWithHeader({
        jobs: selectedJobs,
        workDateYmd: from,
      });

      const filename = `EPMS_OUT_${from.replaceAll("-", "")}_${to.replaceAll("-", "")}_SEL${selectedJobs.length}.csv`;
      downloadTextFile(filename, csvText, "text/csv;charset=utf-8");

      push({
        kind: "success",
        title: "다운로드 완료",
        message: `선택 ${selectedJobs.length}건 다운로드`,
      });
    } catch (e) {
      push({ kind: "error", title: "다운로드 실패", message: e?.message || String(e) });
    }
  }

  // ---------------------------
  // ✅ 작지 생성 (정답지 파서 기반)
  // ---------------------------
  const [jobFileName, setJobFileName] = useState("");
  const [parsedInfo, setParsedInfo] = useState(null); // { ok, jobKind, mixedKinds, sheetName, rows, sample, ... }
  const [loadingCreate, setLoadingCreate] = useState(false);

  const jobRows = useMemo(() => (parsedInfo?.rows || []).filter(Boolean), [parsedInfo]);
  const jobSample = useMemo(() => (parsedInfo?.sample || []).filter(Boolean), [parsedInfo]);

  const jobGroups = useMemo(() => {
    const map = new Map();
    for (const r of jobRows) {
      const kind = String(r?.jobKind || "").trim(); // "출고" | "반품" | ""
      const storeCode = String(r?.storeCode || "").trim();
      const skuCode = String(r?.skuCode || "").trim();
      const qty = Number(r?.qty ?? 0);

      if (!storeCode || !skuCode || !Number.isFinite(qty) || qty <= 0) continue;
      if (kind !== "출고" && kind !== "반품") continue;

      const key = `${kind}__${storeCode}`;
      if (!map.has(key)) map.set(key, { kind, storeCode, lines: 0, qtySum: 0 });
      const g = map.get(key);
      g.lines += 1;
      g.qtySum += qty;
    }
    return [...map.values()].sort((a, b) => {
      const t = String(a.kind).localeCompare(String(b.kind));
      if (t !== 0) return t;
      return String(a.storeCode).localeCompare(String(b.storeCode));
    });
  }, [jobRows]);

  async function pickJobFile(file) {
    if (!file) return;
    try {
      setJobFileName(file.name || "");
      setParsedInfo(null);

      const buf = await file.arrayBuffer();
      const parsed = parseJobFileToRows(buf, file.name);

      // parsed = { ok, sheetName, jobKind, mixedKinds, rows, sample, ... }
      setParsedInfo(parsed || null);

      const rowsLen = (parsed?.rows || []).length;
      const kindText = parsed?.mixedKinds ? "출고+반품(혼합)" : parsed?.jobKind || "미확정";
      push({
        kind: "success",
        title: "엑셀 로드",
        message: `파일 ${file.name} · rows ${rowsLen} · kind ${kindText}`,
      });
    } catch (e) {
      setJobFileName("");
      setParsedInfo(null);
      push({ kind: "error", title: "엑셀 로드 실패", message: e?.message || String(e) });
    }
  }

  function toPlanGroupsFromParsedRows(rows) {
    // group key: storeCode + jobKind
    const map = new Map();

    for (const r of rows || []) {
      const jobKind = String(r?.jobKind || "").trim(); // "출고"|"반품"
      const storeCode = String(r?.storeCode || "").trim();
      const skuCode = String(r?.skuCode || "").trim();
      const qty = Number(r?.qty ?? 0);

      if (!storeCode || !skuCode || !Number.isFinite(qty) || qty <= 0) continue;
      if (jobKind !== "출고" && jobKind !== "반품") continue;

      const makerCode = String(r?.makerCode || r?.maker || "").trim();
      const name = String(r?.name || r?.itemName || r?.productName || "").trim();

      const key = `${jobKind}__${storeCode}`;
      if (!map.has(key)) map.set(key, { jobKind, storeCode, items: [] });
      map.get(key).items.push({ skuCode, qty, makerCode, name });
    }

    return [...map.values()];
  }

  function jobKindToApiKind(jobKind) {
    if (jobKind === "출고") return "outbound";
    if (jobKind === "반품") return "inbound";
    return null;
  }

  async function createJobsFromParsed() {
    const apiBase = getApiBase();

    if (!jobRows.length) {
      push({ kind: "warn", title: "작지 생성", message: "먼저 엑셀을 선택해줘" });
      return;
    }

    if (!jobGroups.length) {
      push({
        kind: "error",
        title: "작지 생성 불가",
        message: "출고/반품 구분 또는 storeCode/sku/qty 파싱이 안 됐어. 엑셀 헤더를 확인해줘.",
      });
      return;
    }

    const outCount = jobGroups.filter((g) => g.kind === "출고").length;
    const inCount = jobGroups.filter((g) => g.kind === "반품").length;

    const ok = confirm(`작지 ${jobGroups.length}개 생성할까?\n(출고=${outCount}, 반품=${inCount})`);
    if (!ok) return;

    try {
      setLoadingCreate(true);

      const plans = toPlanGroupsFromParsedRows(jobRows);
      if (!plans.length) throw new Error("생성할 아이템이 없어 (storeCode/sku/qty 파싱 실패)");

      let createdCount = 0;

      for (const plan of plans) {
        const apiKind = jobKindToApiKind(plan.jobKind);
        if (!apiKind) continue;

        const title = apiKind === "outbound" ? "[OUT] 매장 출고" : "[IN] 반품 입고";

        // 1) Job 생성
        const jobResp = await tryJsonFetchWithBody(`${apiBase}/jobs`, "POST", {
          storeCode: plan.storeCode,
          title,
          memo: `excel=${jobFileName}; kind=${apiKind}`,
        });

        const jobId = jobResp?.id || jobResp?.job?.id;
        if (!jobId) throw new Error("Job 생성 응답에서 jobId를 못 찾았어");

        // 2) items 추가
        await tryJsonFetchWithBody(`${apiBase}/jobs/${jobId}/items`, "POST", {
          items: plan.items,
        });

        createdCount += 1;
      }

      push({ kind: "success", title: "작지 생성 완료", message: `${createdCount}개 생성됨` });

      setJobFileName("");
      setParsedInfo(null);
    } catch (e) {
      push({ kind: "error", title: "작지 생성 실패", message: e?.message || String(e) });
    } finally {
      setLoadingCreate(false);
    }
  }

  // ---------------------------
  // Schedule Calendar (local) + 🇰🇷 Holidays
  // ---------------------------
  const SCHEDULE_KEY = "wms.dashboard.schedule.v1";

  const [monthAnchor, setMonthAnchor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [selectedYmd, setSelectedYmd] = useState(() => ymdKST(new Date()));
  const [eventsMap, setEventsMap] = useState(() => safeReadJson(SCHEDULE_KEY, {}));
  const [newTitle, setNewTitle] = useState("");
  const [newTime, setNewTime] = useState(""); // optional: HH:MM

  const monthInfo = useMemo(() => buildMonthGrid(monthAnchor), [monthAnchor]);
  const selectedEvents = useMemo(() => {
    const list = eventsMap?.[selectedYmd] || [];
    return Array.isArray(list) ? list : [];
  }, [eventsMap, selectedYmd]);

  function persist(next) {
    setEventsMap(next);
    safeWriteJson(SCHEDULE_KEY, next);
  }

  function addEvent() {
    const title = (newTitle || "").trim();
    if (!title) {
      push({ kind: "warn", title: "일정", message: "일정 제목을 입력해줘" });
      return;
    }

    const ev = {
      id: `ev_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      title,
      time: (newTime || "").trim(),
      createdAt: Date.now(),
    };

    const next = { ...(eventsMap || {}) };
    const prevList = Array.isArray(next[selectedYmd]) ? next[selectedYmd] : [];
    next[selectedYmd] = [ev, ...prevList];

    persist(next);
    setNewTitle("");
    setNewTime("");
    push({ kind: "success", title: "일정 추가", message: `${selectedYmd}에 추가됨` });
  }

  function deleteEvent(id) {
    const ok = confirm("이 일정 삭제할까?");
    if (!ok) return;

    const next = { ...(eventsMap || {}) };
    const prevList = Array.isArray(next[selectedYmd]) ? next[selectedYmd] : [];
    const filtered = prevList.filter((x) => x?.id !== id);
    if (filtered.length === 0) delete next[selectedYmd];
    else next[selectedYmd] = filtered;

    persist(next);
  }

  function countEvents(ymd) {
    const list = eventsMap?.[ymd];
    return Array.isArray(list) ? list.length : 0;
  }

  function gotoToday() {
    const today = ymdKST(new Date());
    setSelectedYmd(today);
    const now = new Date();
    setMonthAnchor(new Date(now.getFullYear(), now.getMonth(), 1));
  }

  function moveMonth(delta) {
    const d = new Date(monthAnchor);
    d.setMonth(d.getMonth() + delta);
    d.setDate(1);
    setMonthAnchor(d);
  }

  const HOLI_CACHE_PREFIX = "wms.krHolidays.";
  const [holidayMap, setHolidayMap] = useState(() => ({}));

  async function loadHolidaysForYear(year) {
    const cacheKey = `${HOLI_CACHE_PREFIX}${year}`;
    const cached = safeReadJson(cacheKey, null);
    if (cached && typeof cached === "object") return cached;

    const res = await fetchHolidays(String(year));
    const data = res?.data || [];

    const map = {};
    for (const h of data) {
      const ymd = yyyymmddToYmd(h?.date);
      const name = String(h?.name || "").trim();
      if (ymd && name) map[ymd] = name;
    }

    safeWriteJson(cacheKey, map);
    return map;
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const year = monthAnchor.getFullYear();
        const map = await loadHolidaysForYear(year);
        if (alive) setHolidayMap(map || {});
      } catch (e) {
        console.warn("holiday load failed:", e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [monthAnchor]);

  return (
    <div style={{ display: "grid", gap: 14, fontSize: 14 }}>
      <ToastHost />
      <h1 style={{ margin: 0, fontSize: 18 }}>데쉬보드</h1>

      {/* 스케줄 달력 */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>스케줄 달력</h3>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" style={{ ...primaryBtn, padding: "10px 12px" }} onClick={() => moveMonth(-1)}>
              ◀︎ 이전달
            </button>
            <div style={{ fontWeight: 900 }}>{monthInfo.label}</div>
            <button type="button" style={{ ...primaryBtn, padding: "10px 12px" }} onClick={() => moveMonth(1)}>
              다음달 ▶︎
            </button>
            <button type="button" style={{ ...primaryBtn, padding: "10px 12px" }} onClick={gotoToday}>
              오늘
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12 }}>
          {/* calendar grid */}
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                background: "#f8fafc",
                borderBottom: "1px solid #e5e7eb",
                fontSize: 13,
                fontWeight: 900,
              }}
            >
              {["일", "월", "화", "수", "목", "금", "토"].map((d, idx) => (
                <div
                  key={d}
                  style={{
                    padding: 10,
                    textAlign: "center",
                    color: idx === 0 ? "#ef4444" : idx === 6 ? "#3b82f6" : "#64748b",
                    fontWeight: 900,
                  }}
                >
                  {d}
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
              {monthInfo.days.map((cell) => {
                const isSelected = cell.ymd === selectedYmd;
                const evCount = cell.inMonth ? countEvents(cell.ymd) : 0;
                const isToday = cell.ymd === ymdKST(new Date());

                const dow = new Date(cell.ymd + "T00:00:00").getDay();
                const holidayName = cell.inMonth ? (holidayMap[cell.ymd] || "") : "";
                const isHoliday = !!holidayName;
                const dayColor = dow === 0 ? "#ef4444" : dow === 6 ? "#3b82f6" : "#111827";

                return (
                  <div
                    key={cell.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => cell.inMonth && setSelectedYmd(cell.ymd)}
                    onKeyDown={(e) => e.key === "Enter" && cell.inMonth && setSelectedYmd(cell.ymd)}
                    style={{
                      minHeight: 80,
                      borderRight: "1px solid #e5e7eb",
                      borderBottom: "1px solid #e5e7eb",
                      padding: 8,
                      cursor: cell.inMonth ? "pointer" : "default",
                      background: isSelected ? "#eef2ff" : isHoliday ? "#fff7ed" : "#fff",
                      opacity: cell.inMonth ? 1 : 0.4,
                      outline: "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontWeight: 900, fontSize: 13, color: dayColor }}>
                        {cell.day}
                        {isToday ? (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: 12,
                              padding: "2px 6px",
                              borderRadius: 999,
                              background: "#dcfce7",
                              color: "#166534",
                            }}
                          >
                            오늘
                          </span>
                        ) : null}
                      </div>

                      {evCount > 0 ? (
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 900,
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: "#fef3c7",
                            color: "#92400e",
                            whiteSpace: "nowrap",
                          }}
                          title={`${evCount}개 일정`}
                        >
                          {evCount}
                        </div>
                      ) : null}
                    </div>

                    {cell.inMonth && holidayName ? (
                      <div style={{ marginTop: 6, fontSize: 12, fontWeight: 900, color: "#c2410c" }}>
                        {holidayName}
                      </div>
                    ) : null}

                    {cell.inMonth && evCount > 0 ? (
                      <div style={{ marginTop: 6, fontSize: 12, color: "#64748b", lineHeight: 1.3 }}>
                        {(eventsMap?.[cell.ymd] || []).slice(0, 2).map((ev) => (
                          <div key={ev.id} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            • {ev.time ? `${ev.time} ` : ""}
                            {ev.title}
                          </div>
                        ))}
                        {(eventsMap?.[cell.ymd] || []).length > 2 ? <div>…</div> : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* side panel: 일정 + (아래) EPMS Export */}
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, display: "grid", gap: 12 }}>
            {/* 일정 */}
            <div>
              <div style={{ fontWeight: 900 }}>선택 날짜</div>
              <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input type="date" value={selectedYmd} onChange={(e) => setSelectedYmd(e.target.value)} style={{ ...inputStyle, width: 170 }} />
                <div style={{ fontSize: 12, color: "#94a3b8" }}>{selectedYmd}</div>
              </div>

              <div style={{ marginTop: 10, borderTop: "1px solid #e5e7eb", paddingTop: 10 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>일정 추가</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    placeholder="시간(옵션) HH:MM"
                    style={{ ...inputStyle, width: 150, fontFamily: "Consolas, monospace" }}
                  />
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="일정 제목"
                    style={{ ...inputStyle, minWidth: 220 }}
                    onKeyDown={(e) => e.key === "Enter" && addEvent()}
                  />
                  <button type="button" style={{ ...primaryBtn, padding: "10px 12px" }} onClick={addEvent}>
                    추가
                  </button>
                </div>

                <div style={{ marginTop: 12, fontWeight: 900 }}>오늘 일정</div>
                <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                  {selectedEvents.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>이 날짜엔 일정이 없어</div>
                  ) : (
                    selectedEvents.map((ev) => (
                      <div
                        key={ev.id}
                        style={{
                          border: "1px solid #e5e7eb",
                          borderRadius: 12,
                          padding: 10,
                          display: "grid",
                          gridTemplateColumns: "1fr auto",
                          gap: 10,
                          alignItems: "center",
                        }}
                      >
                        <div style={{ display: "grid", gap: 2 }}>
                          <div style={{ fontWeight: 900, fontSize: 14 }}>
                            {ev.time ? <span style={{ fontFamily: "Consolas, monospace" }}>{ev.time} </span> : null}
                            {ev.title}
                          </div>
                          <div style={{ fontSize: 12, color: "#94a3b8" }}>id: {ev.id}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteEvent(ev.id)}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: "1px solid #fecaca",
                            background: "#fff",
                            cursor: "pointer",
                            fontSize: 13,
                            color: "#ef4444",
                            fontWeight: 900,
                            whiteSpace: "nowrap",
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ marginTop: 10, fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
                  - 저장 위치: <b>localStorage</b> ({SCHEDULE_KEY})
                </div>
              </div>
            </div>

            {/* ✅ EPMS Export: "오늘 일정" 아래 */}
            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 900, fontSize: 15 }}>EPMS Export</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>선택 {selectedCount}건</div>
              </div>

              {/* 컨트롤 바(가로) */}
              <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input type="date" value={fromYmd} onChange={(e) => setFromYmd(e.target.value)} style={{ ...inputStyle, width: 150 }} />
                <span style={{ fontSize: 12, color: "#94a3b8" }}>~</span>
                <input type="date" value={toYmd} onChange={(e) => setToYmd(e.target.value)} style={{ ...inputStyle, width: 150 }} />

                <button
                  type="button"
                  style={{ ...primaryBtn, padding: "10px 12px" }}
                  onClick={() => {
                    const t = ymdKST(new Date());
                    setFromYmd(t);
                    setToYmd(t);
                  }}
                >
                  오늘
                </button>

                <button type="button" style={{ ...primaryBtn, padding: "10px 12px" }} onClick={fetchJobsForRange} disabled={loadingList}>
                  {loadingList ? "조회중..." : "조회"}
                </button>

                <button
                  type="button"
                  style={{ ...primaryBtn, padding: "10px 12px", opacity: selectedCount === 0 ? 0.5 : 1 }}
                  onClick={downloadSelected}
                  disabled={selectedCount === 0}
                  title={selectedCount === 0 ? "작업을 선택해줘" : "선택한 작업만 다운로드"}
                >
                  선택 다운로드
                </button>

                <button type="button" style={{ ...primaryBtn, padding: "10px 12px" }} onClick={selectAll} disabled={jobs.length === 0}>
                  전체선택
                </button>
                <button type="button" style={{ ...primaryBtn, padding: "10px 12px" }} onClick={clearSelection} disabled={selectedIds.size === 0}>
                  선택해제
                </button>
              </div>

              {/* 목록 + 상세 */}
              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ padding: 10, borderBottom: "1px solid #e5e7eb", background: "#f8fafc", fontWeight: 900 }}>
                    작업 목록 {jobs.length ? `(${jobs.length})` : ""}
                  </div>

                  {jobs.length === 0 ? (
                    <div style={{ padding: 12, fontSize: 12, color: "#94a3b8" }}>조회 버튼으로 불러와줘</div>
                  ) : (
                    <div style={{ maxHeight: 220, overflow: "auto" }}>
                      {(jobs || []).map((j) => {
                        const id = j?.id;
                        const storeCode = String(j?.storeCode || j?.store_code || "-");
                        const items = j?.items || j?.jobItems || j?.job_items || [];
                        const pickedSum = sumPicked(items);
                        const plannedSum = sumPlanned(items);
                        const checked = selectedIds.has(id);
                        const isActive = activeJobId === id;
                        const exportDate = String(j?._exportDate || "");

                        return (
                          <div
                            key={id}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "auto 1fr",
                              gap: 10,
                              padding: 10,
                              borderBottom: "1px solid #e5e7eb",
                              cursor: "pointer",
                              background: isActive ? "#eef2ff" : "#fff",
                              alignItems: "center",
                            }}
                            onClick={() => setActiveJobId(id)}
                            title="클릭하면 상세"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleSelectJob(id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div style={{ display: "grid", gap: 2 }}>
                              <div style={{ fontWeight: 900, fontSize: 14 }}>
                                {storeCode}{" "}
                                <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 700 }}>({shortId(id)})</span>
                              </div>
                              <div style={{ fontSize: 12, color: "#64748b" }}>
                                {exportDate ? `${exportDate} · ` : ""}picked {pickedSum} / planned {plannedSum}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ padding: 10, borderBottom: "1px solid #e5e7eb", background: "#f8fafc", fontWeight: 900 }}>
                    상세
                  </div>

                  {!activeJob ? (
                    <div style={{ padding: 12, fontSize: 12, color: "#94a3b8" }}>목록에서 작업 클릭</div>
                  ) : (
                    <div style={{ padding: 12 }}>
                      <div style={{ fontWeight: 900, marginBottom: 6, fontSize: 14 }}>
                        {String(activeJob?.storeCode || activeJob?.store_code || "-")} ({shortId(activeJob?.id)})
                      </div>

                      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                        items: {(activeJob?.items || []).length} · picked {sumPicked(activeJob?.items || [])} / planned{" "}
                        {sumPlanned(activeJob?.items || [])}
                      </div>

                      <div style={{ maxHeight: 200, overflow: "auto", display: "grid", gap: 8 }}>
                        {(activeJob?.items || []).length === 0 ? (
                          <div style={{ fontSize: 12, color: "#94a3b8" }}>아이템이 없어</div>
                        ) : (
                          (activeJob?.items || []).slice(0, 20).map((it, idx) => {
                            const maker =
                              it?.makerCodeSnapshot ||
                              it?.makerCode ||
                              it?.maker_code ||
                              it?.sku?.makerCode ||
                              it?.sku?.maker_code ||
                              "-";

                            const name = it?.nameSnapshot || it?.name || it?.sku?.name || "-";

                            const qtyP = Number(it?.qtyPicked ?? it?.qty_picked ?? 0);
                            const qtyPl = Number(it?.qtyPlanned ?? it?.qty_planned ?? it?.qty ?? 0);

                            return (
                              <div
                                key={it?.id || `${idx}`}
                                style={{
                                  border: "1px solid #e5e7eb",
                                  borderRadius: 12,
                                  padding: 10,
                                  display: "grid",
                                  gap: 4,
                                }}
                              >
                                <div style={{ fontWeight: 900, fontSize: 14 }}>
                                  {maker} · {name}
                                </div>
                                <div style={{ fontSize: 12, color: "#64748b" }}>
                                  picked {qtyP} / planned {qtyPl}
                                </div>
                              </div>
                            );
                          })
                        )}
                        {(activeJob?.items || []).length > 20 ? (
                          <div style={{ fontSize: 12, color: "#94a3b8" }}>… 외 {(activeJob?.items || []).length - 20}개</div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* EPMS Export 끝 */}
          </div>
        </div>
      </div>

      {/* ✅ 작지 생성: EPMS Export처럼 "가로로 쭉" */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
        {/* 상단 컨트롤 바(가로) */}
        <div style={{ padding: 10, borderBottom: "1px solid #e5e7eb", background: "#f8fafc" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>작지 생성</h3>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <label
                style={{
                  ...primaryBtn,
                  padding: "10px 12px",
                  cursor: "pointer",
                  userSelect: "none",
                }}
                title="엑셀 파일 선택"
              >
                파일 선택
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) pickJobFile(f);
                    e.target.value = "";
                  }}
                />
              </label>

              <button
                type="button"
                style={{
                  ...primaryBtn,
                  padding: "10px 12px",
                  opacity: jobGroups.length ? 1 : 0.5,
                }}
                disabled={!jobGroups.length || loadingCreate}
                onClick={createJobsFromParsed}
                title={jobGroups.length ? "엑셀 기준으로 작지 생성" : "먼저 엑셀을 로드해줘"}
              >
                {loadingCreate ? "생성중..." : `작지 생성 (${jobGroups.length || 0})`}
              </button>
            </div>
          </div>

          <div style={{ marginTop: 6, fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
            - 분기: <b>헤더 기반</b>(출고/반품) → row.jobKind로 판별
            <br />
            - 파일: <b>{jobFileName || "선택 안됨"}</b>{" "}
            {parsedInfo?.mixedKinds ? <span style={{ color: "#c2410c", fontWeight: 900 }}> (출고+반품 혼합)</span> : null}
          </div>
        </div>

        {/* 아래: 그룹요약 + 미리보기 */}
        <div style={{ padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {/* 그룹 요약 */}
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>그룹 요약</div>
            {jobGroups.length === 0 ? (
              <div style={{ fontSize: 12, color: "#94a3b8" }}>엑셀을 선택하면 출고/반품 기준으로 그룹이 잡혀</div>
            ) : (
              <div style={{ display: "grid", gap: 6, maxHeight: 320, overflow: "auto" }}>
                {jobGroups.map((g, idx) => (
                  <div
                    key={`${g.kind}_${g.storeCode}_${idx}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "90px 1fr auto",
                      gap: 10,
                      alignItems: "center",
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                      padding: 8,
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>{g.kind === "출고" ? "출고" : "반품"}</div>
                    <div style={{ color: "#64748b" }}>
                      매장코드: <b>{g.storeCode}</b> · 라인 <b>{g.lines}</b>
                    </div>
                    <div style={{ fontWeight: 900, whiteSpace: "nowrap" }}>수량합 {g.qtySum}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 미리보기 */}
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>미리보기(상위 {jobSample.length || 0}행)</div>
            {jobSample.length === 0 ? (
              <div style={{ fontSize: 12, color: "#94a3b8" }}>엑셀을 선택하면 여기서 미리보기 돼</div>
            ) : (
              <div style={{ overflow: "auto", maxHeight: 340 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e5e7eb" }}>kind</th>
                      <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e5e7eb" }}>store</th>
                      <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e5e7eb" }}>sku</th>
                      <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #e5e7eb" }}>qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobSample.map((r, i) => (
                      <tr key={i}>
                        <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9", fontWeight: 900 }}>
                          {String(r?.jobKind || "")}
                        </td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9" }}>{String(r?.storeCode || "")}</td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9", fontFamily: "Consolas, monospace" }}>
                          {String(r?.skuCode || "")}
                        </td>
                        <td style={{ padding: 8, borderBottom: "1px solid #f1f5f9", textAlign: "right" }}>
                          {Number(r?.qty ?? 0) || 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: 10, fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>
              ※ 이제 열 번호(D/Q) 고정 안 씀. 헤더 기반 파싱이라 엑셀 포맷 바뀌어도 덜 깨짐.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/*
 * ✅ 헤더 포함 EPMS_OUT CSV 생성
 * - qtyPicked(실제 출고)만 사용 (0이면 제외)
 * - 기간 조회 시: 각 job의 _exportDate를 출고일자(B)로 사용 (fallback: workDateYmd)
 */
function buildEpmsOutCsvWithHeader({ jobs, workDateYmd }) {
  const fallbackDateStr = String(workDateYmd || "").replaceAll("-", "");

  const header = [
    "출고구분(1:출고,2:반품)", // A
    "출고일자(YYYYMMDD)", // B
    "창고코드(고정:00)", // C
    "매장코드", // D
    "행사코드(고정:00)", // E
    "MAKER코드", // F
    "수량(qtyPicked)", // G
    "전표비고", // H
    "출고의뢰전표번호", // I
    "가격", // J
  ];

  const rows = [header];

  function jobToEpmsType(job) {
    const title = String(job?.title || "").toLowerCase(); // [out] / [in] 포함
    const memo = String(job?.memo || "").toLowerCase(); // excel=...; kind=inbound/outbound

    // ✅ 1순위: memo의 kind
    if (memo.includes("kind=inbound")) return 2;
    if (memo.includes("kind=outbound")) return 1;

    // ✅ 2순위: title prefix([IN]) / 키워드
    if (title.includes("[in]") || title.includes("반품") || title.includes("입고")) return 2;

    return 1;
  }

  for (const job of jobs || []) {
    const storeCode = String(job?.storeCode || job?.store_code || "").trim();
    const items = job?.items || job?.jobItems || job?.job_items || [];

    const jobDateStr = job?._exportDate ? String(job._exportDate).replaceAll("-", "") : fallbackDateStr;

    const epmsType = jobToEpmsType(job);

    for (const it of items) {
      const maker = String(
        it?.makerCodeSnapshot ||
          it?.makerCode ||
          it?.maker_code ||
          it?.sku?.makerCode ||
          it?.sku?.maker_code ||
          ""
      ).trim();

      const qtyPicked = Number(it?.qtyPicked ?? it?.qty_picked ?? 0);
      if (!storeCode || !maker || !Number.isFinite(qtyPicked) || qtyPicked <= 0) continue;

      rows.push([
        String(epmsType), // A
        jobDateStr, // B
        "00", // C
        storeCode, // D
        "00", // E
        maker, // F
        String(qtyPicked), // G
        "", // H
        "", // I
        "", // J
      ]);
    }
  }

  const csv = rows
    .map((cols) =>
      cols
        .map((v) => {
          const s = String(v ?? "");
          if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        })
        .join(",")
    )
    .join("\n");

  return "\uFEFF" + csv;
}

async function tryJsonFetch(url) {
  const r = await fetch(url);
  const t = await r.text().catch(() => "");
  let data = null;
  try {
    data = t ? JSON.parse(t) : null;
  } catch {
    data = t;
  }
  if (!r.ok) {
    const msg = data?.message || data?.error || (typeof data === "string" ? data : r.statusText);
    throw new Error(`[${r.status}] ${msg}`);
  }
  return data;
}

async function tryJsonFetchWithBody(url, method, body) {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const t = await r.text().catch(() => "");
  let data = null;
  try {
    data = t ? JSON.parse(t) : null;
  } catch {
    data = t;
  }
  if (!r.ok) {
    const msg = data?.message || data?.error || (typeof data === "string" ? data : r.statusText);
    throw new Error(`[${r.status}] ${msg}`);
  }
  return data;
}

function downloadTextFile(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

function sumPicked(items) {
  let s = 0;
  for (const it of items || []) s += Number(it?.qtyPicked ?? it?.qty_picked ?? 0) || 0;
  return s;
}
function sumPlanned(items) {
  let s = 0;
  for (const it of items || []) s += Number(it?.qtyPlanned ?? it?.qty_planned ?? it?.qty ?? 0) || 0;
  return s;
}

function shortId(id) {
  const s = String(id || "");
  return s.length <= 8 ? s : s.slice(0, 8);
}

/** ---------------- calendar helpers ---------------- */
function buildMonthGrid(anchor) {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();

  const first = new Date(y, m, 1);
  const startDow = first.getDay();
  const startDate = new Date(y, m, 1 - startDow);

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const inMonth = d.getMonth() === m;
    const ymd = ymdLocal(d);
    cells.push({
      key: `${ymd}_${i}`,
      ymd,
      day: d.getDate(),
      inMonth,
    });
  }

  return { label: `${y}-${String(m + 1).padStart(2, "0")}`, days: cells };
}

function ymdLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function yyyymmddToYmd(n) {
  const s = String(n || "");
  if (!/^\d{8}$/.test(s)) return "";
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function safeReadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function safeWriteJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value ?? null));
  } catch {
    // ignore
  }
}
