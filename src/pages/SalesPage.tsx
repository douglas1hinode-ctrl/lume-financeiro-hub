import { useState, useEffect, useCallback, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts";
import { apiCall } from "@/lib/api";

function tsToLocalDate(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nowLocalDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

interface LogRow {
  date: string;
  ts: number;
  type: "sale" | "renewal" | "trial";
  owner: string;
  client: string;
}

interface DayData { date: string; sales: number; renewals: number; }

const typeLabel: Record<string, { label: string; color: string; bg: string }> = {
  sale:    { label: "Venda Nova", color: "text-emerald-400", bg: "bg-emerald-500/20" },
  renewal: { label: "Renovação",  color: "text-blue-400",   bg: "bg-blue-500/20"    },
  trial:   { label: "Teste",      color: "text-purple-400", bg: "bg-purple-500/20"  },
};

export default function SalesPage() {
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate,   setEndDate]   = useState(nowLocalDate);

  const [viewFilter,  setViewFilter]  = useState("all");
  const [typeFilter,  setTypeFilter]  = useState<"all" | "sale" | "renewal" | "trial">("all");
  const [sortDir,     setSortDir]     = useState<"asc" | "desc">("desc");
  const [search,      setSearch]      = useState("");
  const [page,        setPage]        = useState(1);
  const PAGE_SIZE = 100;

  const [allOwners, setAllOwners] = useState<string[]>([]);
  const [masterUsername, setMasterUsername] = useState("");

  const [allRows,    setAllRows]    = useState<LogRow[]>([]);
  const [chartData,  setChartData]  = useState<DayData[]>([]);
  const [totals,     setTotals]     = useState({ tests: 0, sales: 0, renewals: 0, loaded: false });

  const [loading,  setLoading]  = useState(true);
  const [progress, setProgress] = useState({ current: 0, total: 3, status: "" });

  const busy = useRef(false);

  const fetchData = useCallback(async (sd: string, ed: string) => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setAllRows([]);
    setChartData([]);
    setTotals({ tests: 0, sales: 0, renewals: 0, loaded: false });
    setProgress({ current: 0, total: 3, status: "Carregando info do painel..." });

    try {
      // Info para pegar resellers
      const info = await apiCall({ action: "info" });
      setMasterUsername(info.master?.username || "");
      setAllOwners((info.resellers || []).map((r: any) => r.username));

      const fromTs = Math.floor(new Date(sd + "T00:00:00").getTime() / 1000);
      const toTs   = Math.floor(new Date(ed + "T23:59:59").getTime() / 1000);

      const rows: LogRow[] = [];
      const salesByDay:    Record<string, number> = {};
      const renewalsByDay: Record<string, number> = {};
      const testsByDay:    Record<string, number> = {};

      // ─── Etapa 1: Vendas via fetch_conversion_logs ─────────────────────────
      setProgress({ current: 1, total: 3, status: "🟢 Buscando vendas (logs conversão)..." });
      for (let p = 1; p <= 500; p++) {
        const r = await apiCall({ action: "fetch_conversion_logs", page: p });
        const results = r.results || [];
        if (!results.length) break;
        let stop = false;
        for (const log of results) {
          const ts = log.created_at || 0;
          if (ts < fromTs) { stop = true; break; }
          if (ts <= toTs) {
            const d = tsToLocalDate(ts);
            salesByDay[d] = (salesByDay[d] || 0) + 1;
            rows.push({ date: d, ts, type: "sale", owner: log.user_username || "Unknown", client: log.username || "" });
          }
        }
        if (stop) break;
      }

      // ─── Etapa 2: Renovações via fetch_extend_logs ─────────────────────────
      setProgress({ current: 2, total: 3, status: "🟣 Buscando renovações (logs extend)..." });
      for (let p = 1; p <= 500; p++) {
        const r = await apiCall({ action: "fetch_extend_logs", page: p });
        const results = r.results || [];
        if (!results.length) break;
        let stop = false;
        for (const log of results) {
          const ts = log.created_at || 0;
          if (ts < fromTs) { stop = true; break; }
          if (ts <= toTs) {
            const d = tsToLocalDate(ts);
            renewalsByDay[d] = (renewalsByDay[d] || 0) + 1;
            rows.push({ date: d, ts, type: "renewal", owner: log.user_username || "Unknown", client: log.username || "" });
          }
        }
        if (stop) break;
      }

      // ─── Etapa 3: Testes via fetch_trials ──────────────────────────────────
      setProgress({ current: 3, total: 3, status: "🔵 Buscando testes (trial lines)..." });
      for (let p = 1; p <= 600; p++) {
        const r = await apiCall({ action: "fetch_trials", page_from: p, page_to: p });
        const lines = r.lines || [];
        if (!lines.length) break;
        let stop = false;
        for (const line of lines) {
          const ts = line.c || 0;
          if (ts < fromTs) { stop = true; }
          if (ts >= fromTs && ts <= toTs) {
            const d = tsToLocalDate(ts);
            testsByDay[d] = (testsByDay[d] || 0) + 1;
            rows.push({ date: d, ts, type: "trial", owner: line.uu || "Unknown", client: line.p || line.u || "" });
          }
        }
        if (stop) break;
      }

      // ─── Montar chartData ──────────────────────────────────────────────────
      const allDates = new Set([...Object.keys(salesByDay), ...Object.keys(renewalsByDay)]);
      const chart: DayData[] = Array.from(allDates).sort().map(d => ({
        date: d,
        sales:    salesByDay[d]    || 0,
        renewals: renewalsByDay[d] || 0,
      }));

      setChartData(chart);
      setAllRows(rows);
      setTotals({
        tests:    Object.values(testsByDay).reduce((a, b) => a + b, 0),
        sales:    Object.values(salesByDay).reduce((a, b) => a + b, 0),
        renewals: Object.values(renewalsByDay).reduce((a, b) => a + b, 0),
        loaded: true,
      });
      setProgress({ current: 3, total: 3, status: `✅ Concluído` });
    } catch (e) {
      console.error(e);
    }

    setLoading(false);
    busy.current = false;
  }, []);

  useEffect(() => { fetchData(startDate, endDate); }, []);

  // Aplicar filtros client-side (sem re-fetch)
  const applyViewFilter = (rows: LogRow[]) => {
    if (viewFilter === "master")         return rows.filter(r => r.owner === masterUsername || r.owner === `${masterUsername} (Master)`);
    if (viewFilter === "resellers")      return rows.filter(r => r.owner !== masterUsername && r.owner !== `${masterUsername} (Master)`);
    if (viewFilter !== "all")            return rows.filter(r => r.owner === viewFilter);
    return rows;
  };

  // Rows com apenas viewFilter — usadas para KPIs e gráfico
  const viewFilteredRows = applyViewFilter([...allRows]);

  // KPIs e chart refletem o filtro de visão
  const displayedTotals = {
    tests:    viewFilteredRows.filter(r => r.type === "trial").length,
    sales:    viewFilteredRows.filter(r => r.type === "sale").length,
    renewals: viewFilteredRows.filter(r => r.type === "renewal").length,
  };
  const displayedChartData = (() => {
    const sdMap: Record<string, number> = {};
    const rdMap: Record<string, number> = {};
    for (const r of viewFilteredRows) {
      if (r.type === "sale")    sdMap[r.date] = (sdMap[r.date] || 0) + 1;
      if (r.type === "renewal") rdMap[r.date] = (rdMap[r.date] || 0) + 1;
    }
    const dates = new Set([...Object.keys(sdMap), ...Object.keys(rdMap)]);
    return Array.from(dates).sort().map(d => ({ date: d, sales: sdMap[d] || 0, renewals: rdMap[d] || 0 }));
  })();

  // Tabela: viewFilter + typeFilter + search + sort
  const filtered = (() => {
    let rows = applyViewFilter([...allRows]);
    if (typeFilter !== "all") rows = rows.filter(r => r.type === typeFilter);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r => r.client.toLowerCase().includes(q) || r.owner.toLowerCase().includes(q));
    }
    rows.sort((a, b) => sortDir === "desc" ? b.ts - a.ts : a.ts - b.ts);
    return rows;
  })();

  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const conv    = (displayedTotals.tests + displayedTotals.sales) > 0 ? ((displayedTotals.sales / (displayedTotals.tests + displayedTotals.sales)) * 100).toFixed(1) : "0.0";
  const renRate = (displayedTotals.sales + displayedTotals.renewals) > 0 ? ((displayedTotals.renewals / (displayedTotals.sales + displayedTotals.renewals)) * 100).toFixed(1) : "0.0";


  if (loading) {
    const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
    return (
      <div className="p-10 flex flex-col items-center justify-center gap-6 min-h-[60vh]">
        <div className="text-2xl font-bold">📊 Carregando Vendas</div>
        <div className="w-96 h-4 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">{progress.status || "Iniciando..."}</p>
        {progress.total > 0 && <p className="text-xs text-muted-foreground">{pct}% completo</p>}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-8 animate-in fade-in zoom-in duration-500">
      {/* Header + Filters */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 border-b border-border/50 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Log de Vendas (TheBest API)</h1>
          <p className="text-muted-foreground text-sm mt-1">
            <span className="text-emerald-400 font-semibold">{totals.sales}</span> vendas ·{" "}
            <span className="text-blue-400 font-semibold">{totals.renewals}</span> renovações ·{" "}
            <span className="text-purple-400 font-semibold">{totals.tests}</span> testes — dados reais dos logs
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3 bg-card p-3 rounded-xl border border-border shadow-sm">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Visão</label>
            <select className="flex h-9 min-w-[180px] rounded-md border border-input bg-background px-3 py-1 text-sm"
              value={viewFilter} onChange={e => { setViewFilter(e.target.value); setPage(1); }}>
              <option value="all">🌳 Toda a Árvore</option>
              <option value="master">👑 Apenas Master</option>
              <option value="resellers">👥 Apenas Revendedores</option>
              <option disabled>──────</option>
              {allOwners.map(r => <option key={r} value={r}>👤 {r}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Tipo</label>
            <select className="flex h-9 min-w-[130px] rounded-md border border-input bg-background px-3 py-1 text-sm"
              value={typeFilter} onChange={e => { setTypeFilter(e.target.value as any); setPage(1); }}>
              <option value="all">Todos</option>
              <option value="sale">Vendas Novas</option>
              <option value="renewal">Renovações</option>
              <option value="trial">Testes</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">De</label>
            <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1); }}
              className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm text-white" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Até</label>
            <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1); }}
              className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm text-white" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Ordem</label>
            <select className="flex h-9 w-[100px] rounded-md border border-input bg-background px-3 py-1 text-sm"
              value={sortDir} onChange={e => setSortDir(e.target.value as "asc" | "desc")}>
              <option value="desc">Mais rec</option>
              <option value="asc">Mais antigo</option>
            </select>
          </div>
          <button onClick={() => fetchData(startDate, endDate)}
            className="h-9 px-4 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
            🔄 Recarregar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { title: "Testes (Período)",    value: displayedTotals.tests.toLocaleString(),    accent: "#8b5cf6" },
          { title: "Vendas Novas",        value: displayedTotals.sales.toLocaleString(),    accent: "#10b981" },
          { title: "Renovações",          value: displayedTotals.renewals.toLocaleString(), accent: "#3b82f6" },
          { title: "Conv. (Teste→Venda)", value: `${conv}%`,                                accent: "#22c55e" },
          { title: "Taxa Renovação",      value: `${renRate}%`,                             accent: "#0ea5e9" },
        ].map(k => (
          <div key={k.title} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs text-muted-foreground font-medium">{k.title}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: k.accent }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">
          Vendas Novas e Renovações por Dia (Período)
          <span className="text-xs text-emerald-400 ml-2">(logs reais)</span>
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={displayedChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
            <XAxis dataKey="date" stroke="#888" tick={{ fontSize: 11 }} />
            <YAxis stroke="#888" tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ backgroundColor: "#111", borderColor: "#333" }} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
            <Bar dataKey="sales"    name="Vendas Novas" stackId="a" fill="#10b981" />
            <Bar dataKey="renewals" name="Renovações"   stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold">Log Diário de Transações</h3>
          <div className="flex items-center gap-3">
            <input type="text" placeholder="Buscar cliente / revendedor..."
              value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="h-8 px-3 rounded-md border border-input bg-background text-sm w-64" />
            <span className="text-xs text-muted-foreground">{filtered.length} registros</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/30 bg-muted/20">
                <th className="text-left px-6 py-3 font-medium text-muted-foreground">Data</th>
                <th className="text-left px-6 py-3 font-medium text-muted-foreground">Tipo</th>
                <th className="text-left px-6 py-3 font-medium text-muted-foreground">Revendedor</th>
                <th className="text-left px-6 py-3 font-medium text-muted-foreground">Cliente</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((row, i) => {
                const tl = typeLabel[row.type];
                return (
                  <tr key={i} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-3 font-mono font-bold">{row.date}</td>
                    <td className="px-6 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${tl.bg} ${tl.color}`}>{tl.label}</span>
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">{row.owner}</td>
                    <td className="px-6 py-3 font-mono text-xs">{row.client}</td>
                  </tr>
                );
              })}
              {!paginated.length && (
                <tr><td colSpan={4} className="px-6 py-10 text-center text-muted-foreground">Nenhum resultado</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-border">
            <span className="text-xs text-muted-foreground">Pág {page}/{totalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="h-7 px-3 rounded border border-border text-xs disabled:opacity-40">← Anterior</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="h-7 px-3 rounded border border-border text-xs disabled:opacity-40">Próxima →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
