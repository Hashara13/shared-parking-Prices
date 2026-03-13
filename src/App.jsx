import { useEffect, useMemo, useState } from "react";
import "./App.css";

const MODELS = [
  { label: "HFBR", value: "hfbr" },
  { label: "XGBR", value: "xgbr" },
  { label: "RFR", value: "rfr" },
];

const fmt = (n) => {
  const x = Number(n);
  if (Number.isNaN(x)) return "-";
  return x.toFixed(2);
};

const fmtInt = (n) => {
  const x = Number(n);
  if (Number.isNaN(x)) return "-";
  return x.toLocaleString();
};

const buildModelUrl = (baseUrl, model) => {
  if (!baseUrl) return "";

  if (model === "hfbr") {
    return baseUrl;
  }

  return `${baseUrl}?model=${model}`;
};

export default function App() {
  const API_URL = import.meta.env.VITE_PRICING_API_URL;

  const [selectedModel, setSelectedModel] = useState("hfbr");

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);

  const [comparison, setComparison] = useState({});
  const [comparisonLoading, setComparisonLoading] = useState(false);

  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const fetchModelData = async (model) => {
    const res = await fetch(buildModelUrl(API_URL, model), { method: "GET" });
    if (!res.ok) throw new Error(`API error (${model}): ${res.status}`);
    const json = await res.json();

    if (Array.isArray(json)) {
      return {
        data: json,
        meta: {
          source: "array",
          fetchedAt: new Date().toISOString(),
          model,
        },
      };
    }

    return {
      data: json.data || [],
      meta: {
        ...(json.meta || {}),
        fetchedAt: new Date().toISOString(),
        model,
      },
    };
  };

  const loadSelectedModel = async (model = selectedModel) => {
    setLoading(true);
    setErr("");
    try {
      const result = await fetchModelData(model);
      setRows(result.data);
      setMeta(result.meta);
      setPage(1);
    } catch (e) {
      setErr(e.message || "Failed to load");
      setRows([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  };

  const loadComparison = async () => {
    setComparisonLoading(true);
    try {
      const results = await Promise.all(
        MODELS.map(async (m) => {
          const result = await fetchModelData(m.value);
          return [m.value, result.meta];
        })
      );

      const mapped = Object.fromEntries(results);
      setComparison(mapped);
    } catch (e) {
      console.error("Comparison load failed:", e);
    } finally {
      setComparisonLoading(false);
    }
  };

  useEffect(() => {
    loadSelectedModel(selectedModel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModel]);

  useEffect(() => {
    loadComparison();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      const parking = String(r.parking_id ?? "").toLowerCase();
      const ts = String(r.ts_hour ?? "").toLowerCase();
      return parking.includes(s) || ts.includes(s);
    });
  }, [rows, q]);

  const top10 = useMemo(() => {
    const copy = [...filtered];
    copy.sort(
      (a, b) => Number(b.dynamic_price ?? 0) - Number(a.dynamic_price ?? 0)
    );
    return copy.slice(0, 10);
  }, [filtered]);

  const totalRows = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const endIdx = startIdx + pageSize;

  const pageRows = useMemo(() => {
    return filtered.slice(startIdx, endIdx);
  }, [filtered, startIdx, endIdx]);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  const from = totalRows === 0 ? 0 : startIdx + 1;
  const to = Math.min(endIdx, totalRows);

  const comparisonCards = useMemo(() => {
    return MODELS.map((m) => {
      const meta = comparison[m.value];
      const staticRev = Number(meta?.total_rev_static ?? 0);
      const dynamicRev = Number(meta?.total_rev_dynamic ?? 0);
      const uplift = dynamicRev - staticRev;
      const upliftPct =
        staticRev > 0 ? ((uplift / staticRev) * 100).toFixed(2) : "-";

      return {
        ...m,
        meta,
        uplift,
        upliftPct,
      };
    });
  }, [comparison]);

  const bestModel = useMemo(() => {
    if (!comparisonCards.length) return null;

    const valid = comparisonCards.filter(
      (c) => c.meta && Number.isFinite(Number(c.meta.total_rev_dynamic))
    );
    if (!valid.length) return null;

    return valid.reduce((best, curr) =>
      Number(curr.meta.total_rev_dynamic) > Number(best.meta.total_rev_dynamic)
        ? curr
        : best
    );
  }, [comparisonCards]);

  return (
    <div className="page">
      <header className="header">
        <div>
          <h2 className="title">Dynamic Shared Parking Prices</h2>
          <div className="sub">
            Active model: <span className="mono">{selectedModel.toUpperCase()}</span>
          </div>
          <div className="sub">
            {meta?.generated_at_utc ? (
              <>
                Last generated (UTC):{" "}
                <span className="mono">{meta.generated_at_utc}</span>
              </>
            ) : (
              <>
                Last fetched:{" "}
                <span className="mono">
                  {meta?.fetchedAt
                    ? new Date(meta.fetchedAt).toLocaleString()
                    : "-"}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="actions">
          <select
            className="select"
            value={selectedModel}
            onChange={(e) => {
              setSelectedModel(e.target.value);
              setQ("");
              setPage(1);
            }}
          >
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>

          <button className="btn" onClick={() => loadSelectedModel()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh Table"}
          </button>

          <button className="btn" onClick={loadComparison} disabled={comparisonLoading}>
            {comparisonLoading ? "Refreshing..." : "Refresh Comparison"}
          </button>
        </div>
      </header>

      <section className="grid">
        <div className="card">
          <div className="cardTitle">
            <span>Search & Filter</span>
            <span className="badge">
              Rows: {filtered.length} / {rows.length}
            </span>
          </div>

          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search by parking_id or timestamp..."
            className="input"
          />

          <div className="kpis">
            <span className="badge">
              Model: {selectedModel.toUpperCase()}
            </span>
            <span className="badge">Page size: {pageSize}</span>
            <span className="badge">Pages: {totalPages}</span>
            <span className="badge">Showing: {from}-{to}</span>
          </div>

          {err && <div className="err">Error: {err}</div>}
        </div>

        <div className="card">
          <div className="cardTitle">
            <span>Top 10 Highest Dynamic Prices</span>
            <span className="badge">{selectedModel.toUpperCase()}</span>
          </div>

          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {top10.map((r, idx) => (
              <li key={`${r.parking_id}-${r.ts_hour}-${idx}`} style={{ marginBottom: 8 }}>
                <span style={{ fontWeight: 650 }} className="mono">
                  {r.parking_id}
                </span>{" "}
                — <span className="mono">${fmt(r.dynamic_price)}</span>
                <span style={{ color: "var(--muted)" }}>
                  {" "}(
                  demand: <span className="mono">{fmt(r.forecast_txn_count)}</span>
                  )
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="compareSection">
        <div className="sectionTitleRow">
          <div className="sectionTitle">Model Comparison</div>
          {bestModel && (
            <span className="badge badgeSuccess">
              Best by dynamic revenue: {bestModel.label}
            </span>
          )}
        </div>

        <div className="compareGrid">
          {comparisonCards.map((card) => {
            const meta = card.meta;
            const isBest = bestModel?.value === card.value;

            return (
              <div
                key={card.value}
                className={`card compareCard ${selectedModel === card.value ? "activeCard" : ""}`}
              >
                <div className="cardTitle">
                  <span>{card.label}</span>
                  {isBest && <span className="badge badgeSuccess">Best</span>}
                </div>

                {meta ? (
                  <>
                    <div className="metricGrid">
                      <div className="metricBox">
                        <div className="metricLabel">Rows</div>
                        <div className="metricValue">{fmtInt(meta.rows)}</div>
                      </div>

                      <div className="metricBox">
                        <div className="metricLabel">Price Range</div>
                        <div className="metricValue">
                          ${fmt(meta.dynamic_price_min)} - ${fmt(meta.dynamic_price_max)}
                        </div>
                      </div>

                      <div className="metricBox">
                        <div className="metricLabel">Static Revenue</div>
                        <div className="metricValue">${fmt(meta.total_rev_static)}</div>
                      </div>

                      <div className="metricBox">
                        <div className="metricLabel">Dynamic Revenue</div>
                        <div className="metricValue">${fmt(meta.total_rev_dynamic)}</div>
                      </div>

                      <div className="metricBox full">
                        <div className="metricLabel">Revenue Uplift</div>
                        <div className="metricValue">
                          ${fmt(card.uplift)}{" "}
                          <span className="metricSub">
                            ({card.upliftPct}%)
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <button
                        className="btn"
                        onClick={() => setSelectedModel(card.value)}
                      >
                        View {card.label} Table
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="sub">Comparison data unavailable.</div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="tableWrap">
        <div className="tableHeader">
          <div className="tableTitle">
            Price Table — {selectedModel.toUpperCase()}
          </div>

          <div className="tableControls">
            <div className="pagerInfo">
              Showing <span className="mono">{from}</span>-
              <span className="mono">{to}</span> of{" "}
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
              <button
                className="btn"
                onClick={() => setPage(1)}
                disabled={safePage === 1 || totalRows === 0}
              >
                First
              </button>
              <button
                className="btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1 || totalRows === 0}
              >
                Prev
              </button>
              <span className="badge">
                Page <span className="mono">{safePage}</span> /{" "}
                <span className="mono">{totalPages}</span>
              </span>
              <button
                className="btn"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages || totalRows === 0}
              >
                Next
              </button>
              <button
                className="btn"
                onClick={() => setPage(totalPages)}
                disabled={safePage === totalPages || totalRows === 0}
              >
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
                <tr key={`${r.parking_id}-${r.ts_hour}-${i}`}>
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
        Azure Function API
      </footer>
    </div>
  );
}