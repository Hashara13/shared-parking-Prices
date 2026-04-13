import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import {
  Brain,
  Activity,
  BarChart3,
  Search,
  RefreshCw,
  Table2,
  TrendingUp,
  DollarSign,
  Database,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Layers3,
  Cpu,
  Network,
  Orbit,
} from "lucide-react";
import "./App.css";

const MODELS = [
    {
    value: "transformer",
    short: "TRANSFORMER",
    long: "Transformer Forecast Model",
    icon: Sparkles,
    colorClass: "theme-transformer",
  },
  {
    value: "hgbr",
    short: "HGBR",
    long: "HGBR Forecast Model",
    icon: Brain,
    colorClass: "theme-prophet",
  },
  {
    value: "xgbr",
    short: "XGBR",
    long: "Extreme Gradient Boosting Regressor",
    icon: Activity,
    colorClass: "theme-xgbr",
  },
  {
    value: "rfr",
    short: "RFR",
    long: "Random Forest Regressor",
    icon: Network,
    colorClass: "theme-rfr",
  },
  {
    value: "lstm",
    short: "LSTM",
    long: "Long Short-Term Memory",
    icon: Layers3,
    colorClass: "theme-lstm",
  },
  {
    value: "cnn_lstm",
    short: "CNN-LSTM",
    long: "CNN + LSTM Hybrid Model",
    icon: Cpu,
    colorClass: "theme-cnnlstm",
  },
  {
    value: "lstm_gru",
    short: "LSTM-GRU",
    long: "LSTM + GRU Hybrid Model",
    icon: Orbit,
    colorClass: "theme-lstmgru",
  },

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
  return `${baseUrl}?model=${model}`;
};

export default function App() {
  const API_URL = import.meta.env.VITE_PRICING_API_URL;

  const [selectedModel, setSelectedModel] = useState("transformer");
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);

  const [comparison, setComparison] = useState({});
  const [comparisonLoading, setComparisonLoading] = useState(false);

  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const activeModel = useMemo(
    () => MODELS.find((m) => m.value === selectedModel),
    [selectedModel]
  );

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

      setComparison(Object.fromEntries(results));
    } catch (e) {
      console.error("Comparison load failed:", e);
    } finally {
      setComparisonLoading(false);
    }
  };

  useEffect(() => {
    loadSelectedModel(selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    loadComparison();
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
  }, [page, totalPages]);

  const from = totalRows === 0 ? 0 : startIdx + 1;
  const to = Math.min(endIdx, totalRows);

  const comparisonCards = useMemo(() => {
    return MODELS.map((m) => {
      const modelMeta = comparison[m.value];
      const staticRev = Number(modelMeta?.total_rev_static ?? 0);
      const dynamicRev = Number(modelMeta?.total_rev_dynamic ?? 0);
      const uplift = dynamicRev - staticRev;
      const upliftPct =
        staticRev > 0 ? ((uplift / staticRev) * 100).toFixed(2) : "-";

      return {
        ...m,
        meta: modelMeta,
        uplift,
        upliftPct,
      };
    });
  }, [comparison]);

  const bestModel = useMemo(() => {
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

  const revenueChartData = useMemo(() => {
    return MODELS.map((m) => ({
      model: m.short,
      revenue: Number(comparison[m.value]?.total_rev_dynamic ?? 0),
      isBest: bestModel?.value === m.value,
    }));
  }, [comparison, bestModel]);

  const summaryStats = useMemo(() => {
    return {
      rows: fmtInt(meta?.rows ?? rows.length),
      minPrice: fmt(meta?.dynamic_price_min ?? 0),
      maxPrice: fmt(meta?.dynamic_price_max ?? 0),
      staticRev: fmt(meta?.total_rev_static ?? 0),
      dynamicRev: fmt(meta?.total_rev_dynamic ?? 0),
    };
  }, [meta, rows.length]);

  const moveModel = (direction) => {
    const currentIndex = MODELS.findIndex((m) => m.value === selectedModel);
    if (currentIndex === -1) return;

    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) nextIndex = 0;
    if (nextIndex > MODELS.length - 1) nextIndex = MODELS.length - 1;

    setSelectedModel(MODELS[nextIndex].value);
  };

  return (
    <div className={`page ${activeModel?.colorClass || ""}`}>
      <header className="header glass">
        <div className="headerLeft">
          <div className="eyebrow">
            <BarChart3 size={16} />
            <span>Dynamic Parking Pricing Dashboard</span>
          </div>

          <h1 className="title">Dynamic Shared Parking Prices</h1>

          {/* <p className="sub bigSub">
            Compare revenue and price behavior across all forecasting models.
          </p> */}

          <div className="headerMeta">
            <span className="badge strong">
              <Sparkles size={14} />
              {activeModel?.short}
            </span>

            <span className="badge">
              <Database size={14} />
              Rows: {summaryStats.rows}
            </span>

            <span className="badge">
              <DollarSign size={14} />
              Revenue: ${summaryStats.dynamicRev}
            </span>
          </div>

          <div className="sub">
            Active model: <span className="mono">{activeModel?.long}</span>
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

        <div className="headerRight">
          <div className="actionStack">
            <button
              className="btn btnGhost"
              onClick={() => moveModel(-1)}
              disabled={MODELS.findIndex((m) => m.value === selectedModel) === 0}
            >
              <ChevronLeft size={16} />
              Prev Model
            </button>

            <button
              className="btn btnPrimary"
              onClick={() => loadSelectedModel()}
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? "spin" : ""} />
              {loading ? "Refreshing..." : "Refresh Table"}
            </button>

            <button
              className="btn"
              onClick={loadComparison}
              disabled={comparisonLoading}
            >
              <TrendingUp
                size={16}
                className={comparisonLoading ? "spin" : ""}
              />
              {comparisonLoading ? "Refreshing..." : "Refresh Comparison"}
            </button>

            <button
              className="btn btnGhost"
              onClick={() => moveModel(1)}
              disabled={
                MODELS.findIndex((m) => m.value === selectedModel) ===
                MODELS.length - 1
              }
            >
              Next Model
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </header>

      <section className="modelStripWrap glass">
        <div className="sectionMiniTitle">Swipe or tap to switch models</div>
        <div className="modelStrip">
          {MODELS.map((model) => {
            const Icon = model.icon;
            const isActive = selectedModel === model.value;
            const isBest = bestModel?.value === model.value;

            return (
              <button
                key={model.value}
                className={`modelPill ${isActive ? "active" : ""}`}
                onClick={() => setSelectedModel(model.value)}
              >
                <div className="modelPillTop">
                  <span className="modelPillIcon">
                    <Icon size={16} />
                  </span>
                  {isBest && <span className="tinyBadge">Best</span>}
                </div>
                <div className="modelPillShort">{model.short}</div>
                <div className="modelPillLong">{model.long}</div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="statsGrid">
        <div className="statCard glass">
          <div className="statIcon">
            <Database size={18} />
          </div>
          <div>
            <div className="statLabel">Rows</div>
            <div className="statValue">{summaryStats.rows}</div>
          </div>
        </div>

        <div className="statCard glass">
          <div className="statIcon">
            <DollarSign size={18} />
          </div>
          <div>
            <div className="statLabel">Dynamic Revenue</div>
            <div className="statValue">${summaryStats.dynamicRev}</div>
          </div>
        </div>

        <div className="statCard glass">
          <div className="statIcon">
            <BarChart3 size={18} />
          </div>
          <div>
            <div className="statLabel">Static Revenue</div>
            <div className="statValue">${summaryStats.staticRev}</div>
          </div>
        </div>

        <div className="statCard glass">
          <div className="statIcon">
            <TrendingUp size={18} />
          </div>
          <div>
            <div className="statLabel">Price Range</div>
            <div className="statValue">
              ${summaryStats.minPrice} - ${summaryStats.maxPrice}
            </div>
          </div>
        </div>
      </section>

      <section className="gridTwo">
        <div className="card glass">
          <div className="cardTitle">
            <span className="titleWithIcon">
              <Search size={16} />
              Search & Filter
            </span>
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
            <span className="badge strong">{activeModel?.short}</span>
            <span className="badge">Page size: {pageSize}</span>
            <span className="badge">Pages: {totalPages}</span>
            <span className="badge">
              Showing: {from}-{to}
            </span>
          </div>

          {err && <div className="err">Error: {err}</div>}

          <div className="miniChartWrap">
            <div className="cardTitle">
              <span className="titleWithIcon">
                <TrendingUp size={16} />
                Dynamic Revenue Comparison
              </span>
            </div>

            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={revenueChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="model" stroke="rgba(255,255,255,0.65)" />
                <YAxis stroke="rgba(255,255,255,0.65)" />
                <Tooltip
                  contentStyle={{
                    background: "#111216",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "14px",
                    color: "#fff",
                  }}
                />
                <Bar dataKey="revenue" radius={[10, 10, 0, 0]}>
                  {revenueChartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.isBest ? "#39d98a" : "#7c8cff"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card glass">
          <div className="cardTitle">
            <span className="titleWithIcon">
              <Sparkles size={16} />
              Top 10 Highest Dynamic Prices
            </span>
            <span className="badge strong">{activeModel?.short}</span>
          </div>

          <div className="topList">
            {top10.map((r, idx) => (
              <div
                key={`${r.parking_id}-${r.ts_hour}-${idx}`}
                className="topItem"
              >
                <div className="topIndex">{idx + 1}</div>
                <div className="topMain">
                  <div className="topName mono">{r.parking_id}</div>
                  <div className="topSub mono">{String(r.ts_hour ?? "")}</div>
                </div>
                <div className="topRight">
                  <div className="topPrice">${fmt(r.dynamic_price)}</div>
                  <div className="topDemand mono">
                    demand: {fmt(r.forecast_txn_count)}
                  </div>
                </div>
              </div>
            ))}

            {top10.length === 0 && (
              <div className="emptyState">No rows available.</div>
            )}
          </div>
        </div>
      </section>

      <section className="compareSection">
        <div className="sectionTitleRow">
          <div className="sectionTitle">
            <span className="titleWithIcon">
              <Table2 size={18} />
              Model Comparison
            </span>
          </div>

          {bestModel && (
            <span className="badge badgeSuccess">
              Best by dynamic revenue: {bestModel.short}
            </span>
          )}
        </div>

        <div className="compareGrid">
          {comparisonCards.map((card) => {
            const modelMeta = card.meta;
            const Icon = card.icon;
            const isBest = bestModel?.value === card.value;
            const isActive = selectedModel === card.value;

            return (
              <div
                key={card.value}
                className={`compareCard glass ${isActive ? "activeCard" : ""}`}
              >
                <div className="compareHead">
                  <div className="compareHeadLeft">
                    <span className="compareIcon">
                      <Icon size={18} />
                    </span>
                    <div>
                      <div className="compareShort">{card.short}</div>
                      <div className="compareLong">{card.long}</div>
                    </div>
                  </div>

                  <div className="compareHeadRight">
                    {isBest && <span className="badge badgeSuccess">Best</span>}
                    {isActive && <span className="badge strong">Active</span>}
                  </div>
                </div>

                {modelMeta ? (
                  <>
                    <div className="metricGrid">
                      <div className="metricBox">
                        <div className="metricLabel">Rows</div>
                        <div className="metricValue">{fmtInt(modelMeta.rows)}</div>
                      </div>

                      <div className="metricBox">
                        <div className="metricLabel">Price Range</div>
                        <div className="metricValue">
                          ${fmt(modelMeta.dynamic_price_min)} - $
                          {fmt(modelMeta.dynamic_price_max)}
                        </div>
                      </div>

                      <div className="metricBox">
                        <div className="metricLabel">Static Revenue</div>
                        <div className="metricValue">
                          ${fmt(modelMeta.total_rev_static)}
                        </div>
                      </div>

                      <div className="metricBox">
                        <div className="metricLabel">Dynamic Revenue</div>
                        <div className="metricValue">
                          ${fmt(modelMeta.total_rev_dynamic)}
                        </div>
                      </div>

                      <div className="metricBox full">
                        <div className="metricLabel">Revenue Uplift</div>
                        <div className="metricValue">
                          ${fmt(card.uplift)}{" "}
                          <span className="metricSub">({card.upliftPct}%)</span>
                        </div>
                      </div>
                    </div>

                    <div className="compareActions">
                      <button
                        className="btn btnPrimary"
                        onClick={() => setSelectedModel(card.value)}
                      >
                        View {card.short}
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

      <section className="tableWrap glass">
        <div className="tableHeader">
          <div className="tableTitle">
            <span className="titleWithIcon">
              <Table2 size={16} />
              Price Table - {activeModel?.short}
            </span>
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
                  <td colSpan={4} className="emptyTableCell">
                    No rows to display.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="footer">
        Azure Function API • Responsive dashboard for web and mobile
      </footer>
    </div>
  );
}