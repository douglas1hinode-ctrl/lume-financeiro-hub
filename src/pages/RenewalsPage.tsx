import { useEffect, useState, useMemo, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell
} from "recharts";
import {
  CompactLine,
  MasterInfo,
  RenewalEvent,
  getRenewalEvents,
  filterByOwner,
  dateRangeToTimestamps,
  DEFAULT_PLAN_DAYS,
  isValidTimestamp,
  isRealRenewal,
  tsToDate,
  tsToMonth,
  ownerName,
} from "@/utils/thebestMetrics";

import { apiCall } from "@/lib/api";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

export default function RenewalsPage() {
  const [salesLines, setSalesLines] = useState<CompactLine[]>([]);
  const [masterInfo, setMasterInfo] = useState<MasterInfo | null>(null);
  // user_id = ID do usuário (aparece em line.uid), id = ID da entidade reseller
  const [resellersInfo, setResellersInfo] = useState<{id: number; user_id: number | null; username: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState({ current: 0, total: 0, msg: "" });

  // Filters
  const [viewFilter, setViewFilter] = useState("all");
  const [startDate, setStartDate] = useState("2023-01-01");
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [ticketMedio, setTicketMedio] = useState(35);
  const [planDays, setPlanDays] = useState(DEFAULT_PLAN_DAYS);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"date" | "owner" | "renewal_number">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  // Método de cálculo: "updated" = data real (updated_at), "cycles" = matemático (exp_date/planDays)
  const [calcMethod, setCalcMethod] = useState<"updated" | "cycles">("cycles");
  const PAGE_SIZE = 100;

  const loadAll = useCallback(async () => {
    setLoading(true);
    setProgress({ current: 0, total: 0, msg: "Carregando informações do painel..." });
    try {
      const info = await apiCall({ action: "info" });
      setMasterInfo(info.master);
      setResellersInfo((info.resellers || []).map((r: any) => ({
        id: r.id,
        user_id: r.user_id ?? null,  // user_id real que aparece em line.uid
        username: r.username,
      })));

      const totalPages = info.total_sales_pages || 69;
      const CHUNK = 40;
      const chunks = Math.ceil(totalPages / CHUNK);
      setProgress({ current: 0, total: chunks, msg: `Baixando ${info.total_sales_all_time} linhas...` });

      const acc: CompactLine[] = [];
      for (let i = 0; i < chunks; i++) {
        try {
          const r = await apiCall({ action: "fetch_sales", page_from: i * CHUNK + 1, page_to: Math.min((i + 1) * CHUNK, totalPages) });
          if (r.lines?.length) acc.push(...r.lines);
        } catch { /* skip */ }
        setProgress({ current: i + 1, total: chunks, msg: `${acc.length} linhas carregadas...` });
      }
      setSalesLines(acc);
    } catch (e) {
      console.error(e);
      setProgress({ current: 0, total: 0, msg: "Erro ao carregar." });
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, []);

  // Mapa username→uid derivado das próprias linhas carregadas
  // Isso resolve o mismatch entre reseller.id (/resellers/) e line.uid (/lines/)
  const usernameToUid = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of salesLines) {
      if (l.uu && l.uid) map.set(l.uu.toLowerCase().trim(), l.uid);
    }
    return map;
  }, [salesLines]);

  // Filtrar linhas por owner
  const filteredLines = useMemo(() => {
    if (!masterInfo) return [];
    if (viewFilter === "all") return salesLines;
    if (viewFilter === "master") return salesLines.filter((l) => l.uid === masterInfo.id);
    if (viewFilter === "resellers") return salesLines.filter((l) => l.uid !== masterInfo.id);
    // Revenda específica: busca uid real no mapa derivado das linhas
    const targetUid = usernameToUid.get(viewFilter.toLowerCase().trim());
    if (targetUid === undefined) return salesLines.filter((l) => (l.uu || "").toLowerCase().trim() === viewFilter.toLowerCase().trim());
    return salesLines.filter((l) => l.uid === targetUid);
  }, [salesLines, viewFilter, masterInfo, usernameToUid]);

  // Gerar todos os eventos de renovação
  const allRenewals = useMemo<RenewalEvent[]>(() => {
    if (!masterInfo) return [];

    // Método 1: updated_at + isRealRenewal() — data real com heurísticas anti-admin-edit
    if (calcMethod === "updated") {
      return filteredLines
        .filter((l) => isRealRenewal(l, planDays))
        .map((l) => ({
          date: tsToDate(l.w),
          month: tsToMonth(l.w),
          ts: l.w,
          lineId: l.id,
          ownerLabel: ownerName(l, masterInfo.id, masterInfo.username),
          isMaster: l.uid === masterInfo.id,
          clientPhone: l.p || "",
          clientUsername: l.u || "",
          renewalNumber: 1,
        }));
    }

    // Método 2: ciclos — histórico acumulado baseado em exp_date/planDays
    const events: RenewalEvent[] = [];
    filteredLines.forEach((line) => {
      events.push(...getRenewalEvents(line, masterInfo.id, masterInfo.username, planDays));
    });
    return events;
  }, [filteredLines, masterInfo, planDays, calcMethod]);

  // Filtrar por datas + search
  const { fromTs, toTs } = useMemo(() => dateRangeToTimestamps(startDate, endDate), [startDate, endDate]);

  const filtered = useMemo(() => {
    return allRenewals.filter((r) => {
      if (r.ts < fromTs || r.ts > toTs) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!r.clientPhone.includes(q) && !r.clientUsername.toLowerCase().includes(q) && !r.ownerLabel.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [allRenewals, fromTs, toTs, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === "date") cmp = a.date.localeCompare(b.date);
      else if (sortField === "owner") cmp = a.ownerLabel.localeCompare(b.ownerLabel);
      else if (sortField === "renewal_number") cmp = a.renewalNumber - b.renewalNumber;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir]);

  const paginated = useMemo(() => sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [sorted, page]);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);

  const byMonth = useMemo(() => {
    const map: Record<string, { month: string; count: number; revenue: number }> = {};
    filtered.forEach((r) => {
      if (!map[r.month]) map[r.month] = { month: r.month, count: 0, revenue: 0 };
      map[r.month].count++;
      map[r.month].revenue += ticketMedio;
    });
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
  }, [filtered, ticketMedio]);

  const totalRevenue = filtered.length * ticketMedio;
  const avgPerMonth = byMonth.length > 0 ? Math.round(filtered.length / byMonth.length) : 0;

  const toggleSort = (field: "date" | "owner" | "renewal_number") => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("desc"); }
  };

  if (loading) {
    const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
    return (
      <div className="p-10 flex flex-col items-center justify-center gap-6 min-h-[60vh]">
        <div className="text-2xl font-bold">🔄 Carregando Renovações</div>
        <div className="w-96 h-4 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">{progress.msg || "Iniciando..."}</p>
        {progress.total > 0 && <p className="text-xs text-muted-foreground">{pct}% completo</p>}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-8 animate-in fade-in zoom-in duration-500">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 border-b border-border/50 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Histórico de Renovações</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Método: <code className="text-xs bg-muted px-1 py-0.5 rounded">cycles = ⌊(exp_date − created_at) / plano⌋</code>
            {" · "}
            <span className="text-emerald-400 font-bold">{allRenewals.length.toLocaleString()}</span> renovações históricas
            {" · "}
            <span className="text-blue-400">{filtered.length.toLocaleString()} no filtro</span>
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3 bg-card p-3 rounded-xl border border-border shadow-sm">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Visão</label>
            <select className="flex h-9 min-w-[180px] rounded-md border border-input bg-background px-3 py-1 text-sm" value={viewFilter} onChange={(e) => { setViewFilter(e.target.value); setPage(1); }}>
              <option value="all">🌳 Toda a Árvore</option>
              <option value="master">👑 Apenas Master</option>
              <option value="resellers">👥 Apenas Revendedores</option>
              <option disabled>──────</option>
              {resellersInfo.map((r) => <option key={r.id} value={r.username}>👤 {r.username}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">De</label>
            <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm text-white" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Até</label>
            <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm text-white" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-blue-400 tracking-wider">Ticket (R$)</label>
            <input type="number" value={ticketMedio} onChange={(e) => setTicketMedio(Number(e.target.value))} className="flex h-9 w-[70px] rounded-md border border-blue-500/30 bg-blue-500/5 px-3 py-1 text-sm text-white" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-emerald-400 tracking-wider" title="updated_at = data real da última renovação | ciclos = histórico matemático">Método</label>
            <select value={calcMethod} onChange={(e) => { setCalcMethod(e.target.value as "updated" | "cycles"); setPage(1); }} className="flex h-9 min-w-[160px] rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-1 text-sm text-white">
              <option value="updated">📅 updated_at (datas reais)</option>
              <option value="cycles">🔄 Ciclos / exp_date</option>
            </select>
          </div>
          {calcMethod === "cycles" && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-purple-400 tracking-wider">Plano (dias)</label>
              <input type="number" min={1} max={90} value={planDays} onChange={(e) => { setPlanDays(Math.max(1, Number(e.target.value))); setPage(1); }} className="flex h-9 w-[70px] rounded-md border border-purple-500/30 bg-purple-500/5 px-3 py-1 text-sm text-white" />
            </div>
          )}
          <button onClick={loadAll} className="h-9 px-4 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">🔄 Recarregar</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Renovações no Período" value={filtered.length.toLocaleString()} accent="#10b981" />
        <KpiCard title="Ticket Médio" value={`R$ ${ticketMedio.toFixed(2)}`} accent="#3b82f6" />
        <KpiCard title="Faturamento Renovações" value={`R$ ${totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} accent="#14b8a6" />
        <KpiCard title="Média/Mês" value={avgPerMonth.toLocaleString()} accent="#a855f7" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">Renovações por Mês</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={byMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
              <XAxis dataKey="month" stroke="#888" tick={{ fontSize: 11 }} />
              <YAxis stroke="#888" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: "#111", borderColor: "#333" }} cursor={{ fill: "rgba(255,255,255,0.05)" }} formatter={(v: any) => [v, "Renovações"]} />
              <Bar dataKey="count" name="Renovações" radius={[4, 4, 0, 0]}>
                {byMonth.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">Faturamento por Mês</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={byMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
              <XAxis dataKey="month" stroke="#888" tick={{ fontSize: 11 }} />
              <YAxis stroke="#888" tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ backgroundColor: "#111", borderColor: "#333" }} formatter={(v: any) => [`R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, "Faturamento"]} />
              <Bar dataKey="revenue" name="Faturamento" fill="#14b8a6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold">Histórico Completo de Renovações</h3>
          <div className="flex items-center gap-3">
            <input type="text" placeholder="Buscar cliente / revendedor..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="h-8 px-3 rounded-md border border-input bg-background text-sm w-64" />
            <span className="text-xs text-muted-foreground">{sorted.length.toLocaleString()} registros</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-[10px] uppercase bg-black/40 text-muted-foreground border-b border-border sticky top-0">
              <tr>
                <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort("date")}>
                  Data {sortField === "date" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                </th>
                <th className="px-4 py-3">Mês</th>
                <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort("owner")}>
                  Revendedor {sortField === "owner" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                </th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => toggleSort("renewal_number")}>
                  Nº {sortField === "renewal_number" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                </th>
                <th className="px-4 py-3 text-right text-emerald-400">Ticket</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((r) => (
                <tr key={`${r.lineId}-${r.renewalNumber}`} className="border-b border-border/30 hover:bg-white/5 transition-colors">
                  <td className="px-4 py-2.5 font-medium tabular-nums">{r.date}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.month}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full ${r.isMaster ? "bg-blue-500/20 text-blue-400" : "bg-amber-500/20 text-amber-400"}`}>
                      {r.isMaster ? "👑" : "👤"} {r.ownerLabel}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">
                    {r.clientPhone || r.clientUsername || `#${r.lineId}`}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full">{r.renewalNumber}ª</span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-emerald-400 font-bold">R$ {ticketMedio.toFixed(2)}</td>
                </tr>
              ))}
              {paginated.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Nenhuma renovação no período.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border">
            <span className="text-xs text-muted-foreground">Página {page} de {totalPages} · {sorted.length.toLocaleString()} renovações</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(1)} className="h-8 px-3 rounded-md border border-input bg-background text-sm disabled:opacity-40">«</button>
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="h-8 px-3 rounded-md border border-input bg-background text-sm disabled:opacity-40">‹</button>
              <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} className="h-8 px-3 rounded-md border border-input bg-background text-sm disabled:opacity-40">›</button>
              <button disabled={page === totalPages} onClick={() => setPage(totalPages)} className="h-8 px-3 rounded-md border border-input bg-background text-sm disabled:opacity-40">»</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ title, value, accent }: { title: string; value: string; accent: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-all group">
      <div className="absolute top-0 right-0 w-32 h-32 opacity-10 rounded-full blur-2xl -mr-10 -mt-10 group-hover:opacity-20 transition-opacity" style={{ backgroundColor: accent }} />
      <div className="text-sm font-medium text-muted-foreground mb-2 relative z-10">{title}</div>
      <div className="text-2xl font-bold tracking-tight relative z-10">{value}</div>
    </div>
  );
}
