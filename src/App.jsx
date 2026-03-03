import { useEffect, useMemo, useState } from "react";
import "./App.css";

const fmt = (n) => {
  const x = Number(n);
  if (Number.isNaN(x)) return "-";
  return x.toFixed(2);
};

export default function App() {
  const API_URL = import.meta.env.VITE_PRICING_API_URL;

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Pagination states
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(API_URL, { method: "GET" });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const json = await res.json();

      // Support both formats:
      // 1) array: [{parking_id,...}]
      // 2) object: {meta:..., data:[...]}
      if (Array.isArray(json)) {
        setRows(json);
        setMeta({ source: "array", fetchedAt: new Date().toISOString() });
      } else {
        setRows(json.data || []);
        setMeta(json.meta || { source: "object", fetchedAt: new Date().toISOString() });
      }

      // reset pagination on refresh
      setPage(1);
    } catch (e) {
      setErr(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      String(r.parking_id ?? "").toLowerCase().includes(s)
    );
  }, [rows, q]);

  const top10 = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => Number(b.dynamic_price ?? 0) - Number(a.dynamic_price ?? 0));
    return copy.slice(0, 10);
  }, [rows]);

  // Pagination calculations
  const totalRows = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const endIdx = startIdx + pageSize;

  const pageRows = useMemo(() => {
    return filtered.slice(startIdx, endIdx);
  }, [filtered, startIdx, endIdx]);

  // Keep page valid when filter/pageSize changes
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  const from = totalRows === 0 ? 0 : startIdx + 1;
  const to = Math.min(endIdx, totalRows);

  return (
    <div className="page">
      <header className="header">
        <div>
          <h2 className="title">Dynamic Parking Prices</h2>
          <div className="sub">
            {meta?.generated_at_utc ? (
              <>Last generated (UTC): <span className="mono">{meta.generated_at_utc}</span></>
            ) : (
              <>Last fetched: <span className="mono">{meta?.fetchedAt ? new Date(meta.fetchedAt).toLocaleString() : "-"}</span></>
            )}
          </div>
        </div>

        <div className="actions">
          <button className="btn" onClick={load} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>

      <section className="grid">
        <div className="card">
          <div className="cardTitle">
            <span>Search</span>
            <span className="badge">Rows: {filtered.length} / {rows.length}</span>
          </div>

          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search by parking_id..."
            className="input"
          />

          <div className="kpis">
            <span className="badge">Page size: {pageSize}</span>
            <span className="badge">Pages: {totalPages}</span>
            <span className="badge">Showing: {from}-{to}</span>
          </div>

          {err && <div className="err">Error: {err}</div>}
        </div>

        <div className="card">
          <div className="cardTitle">
            <span>Top 10 Highest Dynamic Prices</span>
            <span className="badge">Sorted by price</span>
          </div>

          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {top10.map((r, idx) => (
              <li key={idx} style={{ marginBottom: 8 }}>
                <span style={{ fontWeight: 650 }} className="mono">{r.parking_id}</span>{" "}
                — <span className="mono">${fmt(r.dynamic_price)}</span>
                <span style={{ color: "var(--muted)" }}>
                  {" "} (demand: <span className="mono">{fmt(r.forecast_txn_count)}</span>)
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="tableWrap">
        <div className="tableHeader">
          <div className="tableTitle">Price Table</div>

          <div className="tableControls">
            <div className="pagerInfo">
              Showing <span className="mono">{from}</span>-<span className="mono">{to}</span> of{" "}
              <span className="mono">{totalRows}</span>
            </div>

            <select
              className="select"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
              <option value={200}>200 / page</option>
            </select>

            <div className="pager">
              <button className="btn" onClick={() => setPage(1)} disabled={safePage === 1 || totalRows === 0}>
                First
              </button>
              <button className="btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1 || totalRows === 0}>
                Prev
              </button>
              <span className="badge">
                Page <span className="mono">{safePage}</span> / <span className="mono">{totalPages}</span>
              </span>
              <button className="btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages || totalRows === 0}>
                Next
              </button>
              <button className="btn" onClick={() => setPage(totalPages)} disabled={safePage === totalPages || totalRows === 0}>
                Last
              </button>
            </div>
          </div>
        </div>

        <div className="tableScroll">
          <table>
            <thead>
              <tr>
                <th>parking_id</th>
                <th>ts_hour</th>
                <th>forecast_txn_count</th>
                <th>dynamic_price</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, i) => (
                <tr key={i}>
                  <td className="mono">{r.parking_id}</td>
                  <td className="mono">{String(r.ts_hour ?? "")}</td>
                  <td className="mono">{fmt(r.forecast_txn_count)}</td>
                  <td className="mono">${fmt(r.dynamic_price)}</td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: 14, color: "var(--muted)" }}>
                    No rows to display.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="footer">
        Data source: Azure Function API (serverless pricing engine).
      </footer>
    </div>
  );
}