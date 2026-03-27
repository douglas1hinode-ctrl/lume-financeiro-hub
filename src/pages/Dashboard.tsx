import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  Cell
} from "recharts";
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import {
  computeMetrics,
  CompactLine,
  MasterInfo,
  ResellerInfo,
  DEFAULT_PLAN_DAYS,
} from "@/utils/thebestMetrics";

interface TrafficExpense { date: string; amount: number; user_id?: string; }
interface UserReseller { id: string; name: string; type: string; }

import { apiCall } from "@/lib/api";

export default function Dashboard() {
  const [masterInfo, setMasterInfo] = useState<MasterInfo | null>(null);
  const [resellersInfo, setResellersInfo] = useState<ResellerInfo[]>([]);
  const [salesLines, setSalesLines] = useState<CompactLine[]>([]);
  const [trialLines, setTrialLines] = useState<CompactLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, status: '' });
  const [viewFilter, setViewFilter] = useState("all");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [ticketMedio, setTicketMedio] = useState(33);
  const [planDays, setPlanDays] = useState(DEFAULT_PLAN_DAYS);
  // Métricas de hoje via logs reais (algoritmo rank_script.py)
  const [todayStats, setTodayStats] = useState<{ tests: number; sales: number; renewals: number; salesByOwner: Record<string,number>; renewalsByOwner: Record<string,number>; loaded: boolean }>(
    { tests: 0, sales: 0, renewals: 0, salesByOwner: {}, renewalsByOwner: {}, loaded: false }
  );
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [periodLogs, setPeriodLogs] = useState<{ date: string; type: 'sale'|'renewal'; owner: string; ts: number; cost: number }[]>([]);

  const { data: expenses } = useSupabaseQuery<TrafficExpense>(['traffic_expenses'], 'traffic_expenses');
  const { data: users } = useSupabaseQuery<UserReseller>(['users_resellers'], 'users_resellers');

  const loadBusy = useRef(false); // anti double-run (React StrictMode)

  const loadAllData = useCallback(async () => {
    if (loadBusy.current) return;
    loadBusy.current = true;
    setLoading(true);
    setSyncProgress({ current: 0, total: 0, status: 'Carregando informações do painel...' });

    try {
      const info = await apiCall({ action: 'info' });
      setMasterInfo(info.master);
      setResellersInfo(info.resellers || []);

      const totalSalesPages  = info.total_sales_pages  || 69;
      const totalTrialsPages = info.total_trials_pages || 263;
      const totalPages = totalSalesPages + totalTrialsPages;
      const CONCURRENCY = 5; // 5 workers simultâneos do browser, cada um busca 1 página

      setSyncProgress({ current: 0, total: totalPages, status: 'Baixando dados...' });
      const accSales:  CompactLine[] = [];
      const accTrials: CompactLine[] = [];
      let done = 0;

      // Busca páginas com concorrência limitada: 1 página por Edge Function call
      const fetchPages = async (action: string, total: number, acc: CompactLine[]) => {
        const queue = Array.from({ length: total }, (_, i) => i + 1);
        const worker = async () => {
          while (queue.length > 0) {
            const page = queue.shift();
            if (page === undefined) break;
            try {
              const r = await apiCall({ action, page_from: page, page_to: page });
              if (r.lines?.length > 0) r.lines.forEach((l: CompactLine) => acc.push(l));
            } catch { /* página falhou, continua */ }
            done++;
            setSyncProgress({
              current: done,
              total: totalPages,
              status: `${accSales.length} vendas / ${accTrials.length} testes...`
            });
          }
        };
        await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      };

      await fetchPages('fetch_sales',  totalSalesPages,  accSales);
      setSalesLines([...accSales]);

      await fetchPages('fetch_trials', totalTrialsPages, accTrials);
      setTrialLines([...accTrials]);

      setSyncProgress({
        current: totalPages, total: totalPages,
        status: `✅ ${accSales.length} vendas + ${accTrials.length} testes carregados!`
      });

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Erro ao carregar dados:', e);
      setSyncProgress({ current: 0, total: 0, status: `Erro: ${msg}` });
    } finally {
      loadBusy.current = false;
    }

    setLoading(false);
  }, []);


  // Busca dados de hoje via logs reais (idêntico ao rank_script.py)
  const fetchTodayStats = useCallback(async () => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const tsToDate = (ts: number) => {
      const d = new Date(ts * 1000);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    };
    let sales = 0, renewals = 0;
    const salesByOwner: Record<string, number> = {};
    const renewalsByOwner: Record<string, number> = {};

    // Vendas: /user/logs/?action=trial-conversion — por owner
    for (let page = 1; page <= 100; page++) {
      try {
        const r = await apiCall({ action: 'fetch_conversion_logs', page });
        if (!r.results?.length) break;
        let stop = false;
        for (const log of r.results) {
          if (tsToDate(log.created_at || 0) < today) stop = true;
          if (tsToDate(log.created_at || 0) === today) {
            sales++;
            const owner = log.user_username || 'Unknown';
            salesByOwner[owner] = (salesByOwner[owner] || 0) + 1;
          }
        }
        if (stop) break;
      } catch { break; }
    }
    // Renovações: /user/logs/?action=extend — por owner
    for (let page = 1; page <= 100; page++) {
      try {
        const r = await apiCall({ action: 'fetch_extend_logs', page });
        if (!r.results?.length) break;
        let stop = false;
        for (const log of r.results) {
          if (tsToDate(log.created_at || 0) < today) stop = true;
          if (tsToDate(log.created_at || 0) === today) {
            renewals++;
            const owner = log.user_username || 'Unknown';
            renewalsByOwner[owner] = (renewalsByOwner[owner] || 0) + 1;
          }
        }
        if (stop) break;
      } catch { break; }
    }
    setTodayStats(prev => ({ ...prev, sales, renewals, salesByOwner, renewalsByOwner, loaded: true }));
  }, []);


  // Recalcular testes de hoje quando trialLines carregar
  useEffect(() => {
    if (!trialLines.length) return;
    const _d = new Date();
    const today = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;
    const tsToDate = (ts: number) => {
      const d = new Date(ts * 1000);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    };
    const count = trialLines.filter(l => tsToDate(l.c) === today).length;
    setTodayStats(prev => ({ ...prev, tests: count }));
  }, [trialLines]);

  // Busca logs de vendas/renovações para o período via logs reais (mesma estrutura da SalesPage)
  const fetchPeriodLogs = useCallback(async (sd: string, ed: string) => {
    const fromTs = Math.floor(new Date(sd + "T00:00:00").getTime() / 1000);
    const toTs   = Math.floor(new Date(ed + "T23:59:59").getTime() / 1000);
    if ((toTs - fromTs) / 86400 > 180) return; // limita a 180 dias
    const toLocalDate = (ts: number) => {
      const d = new Date(ts * 1000);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    };
    const logs: { date: string; type: 'sale'|'renewal'; owner: string; ts: number; cost: number }[] = [];
    for (let p = 1; p <= 500; p++) {
      try {
        const r = await apiCall({ action: 'fetch_conversion_logs', page: p });
        if (!r.results?.length) break;
        let stop = false;
        for (const log of r.results) {
          const ts = log.created_at || 0;
          if (ts < fromTs) { stop = true; break; }
          if (ts <= toTs) logs.push({ date: toLocalDate(ts), type: 'sale', owner: log.user_username || 'Unknown', ts, cost: Math.abs(log.cost ?? 1) });
        }
        if (stop) break;
      } catch { break; }
    }
    for (let p = 1; p <= 500; p++) {
      try {
        const r = await apiCall({ action: 'fetch_extend_logs', page: p });
        if (!r.results?.length) break;
        let stop = false;
        for (const log of r.results) {
          const ts = log.created_at || 0;
          if (ts < fromTs) { stop = true; break; }
          if (ts <= toTs) logs.push({ date: toLocalDate(ts), type: 'renewal', owner: log.user_username || 'Unknown', ts, cost: Math.abs(log.cost ?? 1) });
        }
        if (stop) break;
      } catch { break; }
    }
    setPeriodLogs(logs);
  }, []);

  useEffect(() => {
    loadAllData().then(() => { fetchTodayStats(); fetchPeriodLogs(startDate, endDate); });
  }, []);

  // Refetch period logs quando datas mudam (só após carga inicial)
  useEffect(() => {
    if (loading) return;
    fetchPeriodLogs(startDate, endDate);
  }, [startDate, endDate]);


  // Compute metrics using shared utility — SEM todayStats na dep (evita re-render durante fetch)
  const data = useMemo(() => {
    if (!masterInfo || salesLines.length === 0) return null;
    const metrics = computeMetrics(salesLines, trialLines, masterInfo, resellersInfo, viewFilter, startDate, endDate, planDays);
    return {
      ...metrics,
      credits: masterInfo.credits ?? 0,
      gestor_revenue: (metrics.sales + metrics.renewals) * ticketMedio,
      total_sales_loaded: salesLines.length,
      total_trials_loaded: trialLines.length,
      renewal_conversion: metrics.renewal_rate,
      avg_client_time: 0,
      renewals_by_day: metrics.renewals_per_day,
    };
  }, [salesLines, trialLines, masterInfo, resellersInfo, viewFilter, startDate, endDate, ticketMedio, planDays]);

  // Override leve com dados reais de hoje — dependente de todayStats (rápido, sem computeMetrics)
  const derivedStats = useMemo(() => {
    if (!data) return null;
    const _d = new Date();
    const todayStr = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;
    const realSales    = todayStats.loaded ? todayStats.sales    : data.sales;
    const realRenewals = todayStats.loaded ? todayStats.renewals : data.renewals;
    const gestor_revenue = (realSales + realRenewals) * ticketMedio;
    const sales_per_day = todayStats.loaded
      ? [...data.sales_per_day.filter((p: any) => p.date !== todayStr), { date: todayStr, sales: todayStats.sales }].sort((a: any, b: any) => a.date.localeCompare(b.date))
      : data.sales_per_day;
    const renewals_by_day = todayStats.loaded
      ? [...data.renewals_by_day.filter((p: any) => p.date !== todayStr), { date: todayStr, renewals: todayStats.renewals }].sort((a: any, b: any) => a.date.localeCompare(b.date))
      : data.renewals_by_day;
    return { ...data, gestor_revenue, sales_per_day, renewals_by_day };
  }, [data, todayStats, ticketMedio]);

  // Métricas de período via logs reais — filtradas por viewFilter (sem re-fetch)
  const logMetrics = useMemo(() => {
    if (!periodLogs.length || !masterInfo) return null;
    const mu = masterInfo.username || '';
    const filt = periodLogs.filter(l => {
      if (viewFilter === 'master')    return l.owner === mu || l.owner === `${mu} (Master)`;
      if (viewFilter === 'resellers') return l.owner !== mu && l.owner !== `${mu} (Master)`;
      if (viewFilter !== 'all')       return l.owner === viewFilter;
      return true;
    });
    const sales    = filt.filter(l => l.type === 'sale').length;
    const renewals = filt.filter(l => l.type === 'renewal').length;
    const sdMap: Record<string, number> = {};
    const rdMap: Record<string, number> = {};
    for (const l of filt) {
      if (l.type === 'sale')    sdMap[l.date] = (sdMap[l.date] || 0) + 1;
      if (l.type === 'renewal') rdMap[l.date] = (rdMap[l.date] || 0) + 1;
    }
    const allDates = new Set([...Object.keys(sdMap), ...Object.keys(rdMap)]);
    const salesPerDay    = Array.from(allDates).sort().map(d => ({ date: d, sales: sdMap[d] || 0 }));
    const renewalsByDay  = Array.from(allDates).sort().map(d => ({ date: d, renewals: rdMap[d] || 0 }));
    const gestor_revenue = (sales + renewals) * ticketMedio;
    const tests          = data?.tests ?? 0;
    const conv           = (tests + sales) > 0 ? ((sales / (tests + sales)) * 100).toFixed(1) : '0.0';
    const renRate        = (sales + renewals) > 0 ? ((renewals / (sales + renewals)) * 100).toFixed(1) : '0.0';
    // Custo de créditos: master=R$5,75/créd, revendas=R$10,00/créd
    const creditCost = filt.reduce((acc, l) => {
      const isMaster = l.owner === mu || l.owner === `${mu} (Master)`;
      return acc + l.cost * (isMaster ? 5.75 : 10.00);
    }, 0);
    return { sales, renewals, salesPerDay, renewalsByDay, gestor_revenue, conv, renRate, creditCost };
  }, [periodLogs, viewFilter, masterInfo, ticketMedio, data]);

  const totalTraffic = useMemo(() => {
    const mu = masterInfo?.username || '';
    // Regra: o lançamento é feito no dia seguinte (D+1), então a data real = e.date - 1 dia
    const shiftDate = (d: string) => {
      const dt = new Date(d + 'T12:00:00');
      dt.setDate(dt.getDate() - 1);
      return dt.toISOString().split('T')[0];
    };
    return (expenses || []).filter(e => {
      const realDate = shiftDate(e.date);
      if (realDate < startDate || realDate > endDate) return false;
      if (viewFilter === 'master')    return !e.user_id || e.user_id === mu || e.user_id === 'master';
      if (viewFilter === 'resellers') return !!e.user_id && e.user_id !== mu && e.user_id !== 'master';
      if (viewFilter !== 'all')       return e.user_id === viewFilter;
      return true;
    }).reduce((acc, curr) => acc + Number(curr.amount), 0);
  }, [expenses, viewFilter, startDate, endDate, masterInfo]);



  // Sempre consistente com os KPIs exibidos (evita discrepância com derivedStats/todayStats)
  const displaySales       = logMetrics?.sales    ?? data?.sales    ?? 0;
  const displayRenewals    = logMetrics?.renewals  ?? data?.renewals ?? 0;
  const displayFaturamento = (displaySales + displayRenewals) * ticketMedio;
  const displayCreditCost  = logMetrics?.creditCost ?? 0;

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6', '#f43f5e', '#6366f1'];


  if (loading) {
    const pct = syncProgress.total > 0 ? Math.round((syncProgress.current / syncProgress.total) * 100) : 0;
    return (
      <div className="p-10 flex flex-col items-center justify-center gap-6 min-h-[60vh]">
        <div className="text-2xl font-bold">📊 Carregando Dashboard</div>
        <div className="w-96 h-4 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">{syncProgress.status || 'Iniciando...'}</p>
        {syncProgress.total > 0 && <p className="text-xs text-muted-foreground">{pct}% completo</p>}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-10 flex flex-col items-center justify-center gap-6 min-h-[60vh]">
        <div className="text-2xl font-bold">⚠️ Nenhum dado carregado</div>
        <p className="text-sm text-muted-foreground">A API não retornou dados. Verifique a conexão e tente novamente.</p>
        {debugInfo && <pre className="text-xs text-yellow-400 bg-black/50 p-3 rounded max-w-xl break-all whitespace-pre-wrap">{debugInfo}</pre>}
        <button onClick={loadAllData} className="h-9 px-5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">
          🔄 Recarregar
        </button>
      </div>
    );
  }



  return (
    <div className="p-4 md:p-8 space-y-8 animate-in fade-in zoom-in duration-500">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 border-b border-border/50 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard Central</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Visão financeira e de vendas combinada.
            <span className="text-emerald-500 ml-2">✅ {salesLines.length} vendas + {trialLines.length} testes carregados</span>
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3 bg-card p-3 rounded-xl border border-border mt-2 xl:mt-0 shadow-sm">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Filtro de Visão</label>
            <select className="flex h-9 w-full min-w-[200px] items-center rounded-md border border-input bg-background px-3 py-1 text-sm" value={viewFilter} onChange={e => setViewFilter(e.target.value)}>
              <option value="all">🌳 Toda a Árvore (Geral)</option>
              <option value="master">👑 Apenas Master</option>
              <option value="resellers">👥 Apenas Revendedores</option>
              <option disabled>──────────────</option>
              {data?.all_resellers?.map(r => <option key={r} value={r}>👤 {r}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">De (Vendas/Tráfego)</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-white" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Até</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-white" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-blue-400 tracking-wider">Ticket (R$)</label>
            <input type="number" value={ticketMedio} onChange={e => setTicketMedio(Number(e.target.value))} className="flex h-9 w-[80px] rounded-md border border-blue-500/30 bg-blue-500/5 px-3 py-1 text-sm text-white" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-purple-400 tracking-wider" title="Duração do plano para calcular renovações">Plano (dias)</label>
            <input type="number" min={1} max={90} value={planDays} onChange={e => setPlanDays(Math.max(1, Number(e.target.value)))} className="flex h-9 w-[80px] rounded-md border border-purple-500/30 bg-purple-500/5 px-3 py-1 text-sm text-white" />
          </div>
          <button onClick={() => { loadAllData().then(() => fetchPeriodLogs(startDate, endDate)); }} className="h-9 px-4 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">🔄 Recarregar</button>
        </div>
      </div>

      {/* ── Cards de HOJE (dados reais via logs) ── */}
      {todayStats.loaded && (
        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">📅 Hoje — Dados Reais (via logs do painel)</h2>
          <div className="grid grid-cols-3 gap-4">
            <DCard title="Testes Hoje" value={todayStats.tests.toLocaleString()} accent="#8b5cf6" />
            <DCard title="Vendas Hoje" value={todayStats.sales.toLocaleString()} accent="#10b981" />
            <DCard title="Renovações Hoje" value={todayStats.renewals.toLocaleString()} accent="#3b82f6" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <DCard title="Ativos Totais" value={data.active_clients.toLocaleString()} accent="#f59e0b" />
        <DCard title="Vendas Novas (Período)" value={(logMetrics?.sales ?? data?.sales ?? 0).toLocaleString()} accent="#10b981" />
        <DCard title="Testes (Período)" value={data.tests.toLocaleString()} accent="#8b5cf6" />
        <DCard title="Renovações (Período)" value={(logMetrics?.renewals ?? data?.renewals ?? 0).toLocaleString()} accent="#3b82f6" />
        <DCard title="Clientes Únicos" value={data.unique_clients.toLocaleString()} accent="#a855f7" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <DCard title="Conv. (Teste→Venda)" value={`${logMetrics?.conv ?? data.sales_conversion}%`} accent="#22c55e" />
        <DCard title="Taxa de Renovação" value={`${logMetrics?.renRate ?? data.renewal_conversion}%`} accent="#0ea5e9" />
        <DCard title="Faturamento (Período)" value={`R$ ${(displayFaturamento).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} accent="#14b8a6" className="bg-gradient-to-br from-emerald-950/50 to-background border-emerald-900/50" />
        <DCard title="Tráfego Pago" value={`R$ ${totalTraffic.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} accent="#ef4444" className="border-red-900/30 bg-red-950/20" />
        <DCard title="Créditos (R$)" value={`R$ ${displayCreditCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} accent="#f59e0b" className="border-yellow-900/30 bg-yellow-950/20" />
        <DCard title="Faturamento Líquido" value={`R$ ${(displayFaturamento - totalTraffic - displayCreditCost).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} accent="#22c55e" className="bg-gradient-to-br from-emerald-950/50 to-background border-emerald-900/50" />
      </div>



      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <ChartCard title="Evolução de Vendas Novas (Período)">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={logMetrics?.salesPerDay ?? (derivedStats ?? data).sales_per_day}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" stroke="#888" tick={{ fontSize: 12 }} />
              <YAxis stroke="#888" tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: '#111', borderColor: '#333' }} />
              <Line type="monotone" dataKey="sales" name="Vendas Novas" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 8 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Renovações por Dia (Período)">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={logMetrics?.renewalsByDay ?? (derivedStats ?? data).renewals_by_day}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
              <XAxis dataKey="date" stroke="#888" tick={{ fontSize: 12 }} />
              <YAxis stroke="#888" tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: '#111', borderColor: '#333' }} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="renewals" name="Renovações" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <ChartCard title={todayStats.loaded ? "Volume de Vendas por Revendedor (Hoje)" : "Volume de Vendas por Revendedor (Período)"}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={todayStats.loaded
                ? Object.entries(todayStats.salesByOwner)
                    .map(([name, sales]) => ({ name, sales }))
                    .sort((a, b) => b.sales - a.sales)
                : data.sales_by_reseller}
              layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={true} vertical={false} />
              <XAxis type="number" stroke="#888" />
              <YAxis dataKey="name" type="category" stroke="#888" tick={{ fontSize: 12 }} width={120} />
              <Tooltip contentStyle={{ backgroundColor: '#111', borderColor: '#333' }} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="sales" name="Vendas" radius={[0, 4, 4, 0]}>
                {(todayStats.loaded
                  ? Object.entries(todayStats.salesByOwner).map(([name, sales]) => ({ name, sales })).sort((a, b) => b.sales - a.sales)
                  : data.sales_by_reseller
                ).map((_: any, i: number) => <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Ranking e Créditos por Revendedor">
          <div className="overflow-x-auto h-[300px]">
            <table className="w-full text-sm text-left">
              <thead className="text-[10px] uppercase bg-black/40 text-muted-foreground sticky top-0 border-b border-border">
                <tr>
                  <th className="px-4 py-3">Revendedor</th>
                  <th className="px-4 py-3">Vendas</th>
                  <th className="px-4 py-3">Renovações</th>
                  <th className="px-4 py-3 text-right">Créditos</th>
                </tr>
              </thead>
              <tbody>
                {data.sales_by_reseller.map((r: any, i: number) => {
                  // Lookup de nome: tenta r.name, depois sem sufixo ' (Master)'
                  const nameKey = r.name as string;
                  const nameNoSuffix = nameKey.replace(/\s*\(Master\)\s*/i,'').trim();
                  const todaySales    = todayStats.loaded ? (todayStats.salesByOwner[nameKey]    ?? todayStats.salesByOwner[nameNoSuffix]    ?? 0) : null;
                  const todayRenewals = todayStats.loaded ? (todayStats.renewalsByOwner[nameKey] ?? todayStats.renewalsByOwner[nameNoSuffix] ?? 0) : null;
                  return (
                  <tr key={r.name} className="border-b border-border/50 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 font-medium flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }}>{i + 1}</div>
                      <span className="truncate max-w-[120px]" title={r.name}>{r.name}</span>
                    </td>
                    <td className="px-4 py-3 text-emerald-400 font-bold">{todaySales ?? r.sales}</td>
                    <td className="px-4 py-3 text-blue-400 font-bold">{todayRenewals ?? r.renewals}</td>
                    <td className="px-4 py-3 text-right font-mono">{r.credits?.toFixed(2) || '0.00'}</td>
                  </tr>
                  );
                })}
                {data.sales_by_reseller.length === 0 && (
                  <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Nenhuma venda no período.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}

function DCard({ title, value, accent, className }: { title: string; value: string | number; accent: string; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-all group ${className || ''}`}>
      <div className="absolute top-0 right-0 w-32 h-32 opacity-10 rounded-full blur-2xl -mr-10 -mt-10 transition-opacity group-hover:opacity-20" style={{ backgroundColor: accent }} />
      <div className="text-sm font-medium text-muted-foreground mb-2 relative z-10">{title}</div>
      <div className="text-3xl font-bold tracking-tight relative z-10">{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h3 className="text-lg font-semibold mb-6">{title}</h3>
      {children}
    </div>
  );
}