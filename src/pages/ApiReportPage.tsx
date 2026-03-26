import { useState } from "react";

const API_URL = "https://gfumzidvctckachfxdrt.supabase.co/functions/v1/thebest_api";
const API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmdW16aWR2Y3Rja2FjaGZ4ZHJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0OTExMjcsImV4cCI6MjA5MDA2NzEyN30.gQ9yFQPVeD1yVJB33XbKDX05dREa3bsi66clOiSrntE";

async function apiCall(body: object) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

interface ReportRow {
  owner: string;
  tests: number;
  sales: number;
  renewals: number;
  conversion: number;
}

function convColor(v: number) {
  if (v >= 50) return "text-emerald-400";
  if (v >= 20) return "text-yellow-400";
  return "text-red-400";
}

// Igual ao Python: datetime.fromtimestamp(ts).strftime("%Y-%m-%d")  (timezone local)
function tsToLocalDate(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ApiReportPage() {
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [totals, setTotals] = useState({ tests: 0, sales: 0, renewals: 0 });
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ step: "", pct: 0 });
  const [error, setError] = useState("");

  async function fetchReport() {
    setLoading(true);
    setError("");
    setRows([]);

    try {
      const tests:    Record<string, number> = {};
      const sales:    Record<string, number> = {};
      const renewals: Record<string, number> = {};

      // Início e fim do dia alvo em Unix (BRT = UTC-3)
      const dayStartTs = Math.floor(new Date(date + "T00:00:00-03:00").getTime() / 1000);
      const dayEndTs   = dayStartTs + 86399;

      // ─── ETAPA 1: Testes — batch de 20 páginas + early stop ──────────────
      setProgress({ step: "🔵 Buscando testes (batch)...", pct: 5 });
      {
        const BATCH = 20;
        let page = 1;
        let done = false;
        while (!done && page <= 500) {
          const r = await apiCall({ action: "fetch_trials", page_from: page, page_to: page + BATCH - 1 });
          const lines: any[] = r.lines || [];
          if (lines.length === 0) { done = true; break; }
          let foundOlder = false;
          for (const line of lines) {
            if (line.c < dayStartTs) { foundOlder = true; }          // linha anterior ao dia
            else if (line.c >= dayStartTs && line.c <= dayEndTs) {   // linha do dia alvo
              tests[line.uu || "Unknown"] = (tests[line.uu || "Unknown"] || 0) + 1;
            }
          }
          done = foundOlder; // se encontrou linha mais antiga → parar
          page += BATCH;
          setProgress({ step: `🔵 Testes pág ${page}...`, pct: Math.min(25, 5 + (page / BATCH) * 2) });
        }
      }

      // ─── ETAPA 2: Vendas via logs trial-conversion ────────────────────────
      setProgress({ step: "🟢 Buscando vendas...", pct: 30 });
      {
        let page = 1;
        while (page <= 200) {
          const r = await apiCall({ action: "fetch_conversion_logs", page });
          const rows_ = r.results || [];
          if (rows_.length === 0) break;
          let foundOld = false;
          for (const log of rows_) {
            const ts = log.created_at || 0;
            if (ts < dayStartTs) { foundOld = true; }
            if (ts >= dayStartTs && ts <= dayEndTs) {
              const user = log.user_username || "Unknown";
              sales[user] = (sales[user] || 0) + 1;
            }
          }
          if (foundOld) break;
          page++;
          setProgress({ step: `🟢 Vendas pág ${page}...`, pct: Math.min(55, 30 + page) });
        }
      }

      // ─── ETAPA 3: Renovações via logs extend ──────────────────────────────
      setProgress({ step: "🟣 Buscando renovações...", pct: 57 });
      {
        let page = 1;
        while (page <= 200) {
          const r = await apiCall({ action: "fetch_extend_logs", page });
          const rows_ = r.results || [];
          if (rows_.length === 0) break;
          let foundOld = false;
          for (const log of rows_) {
            const ts = log.created_at || 0;
            if (ts < dayStartTs) { foundOld = true; }
            if (ts >= dayStartTs && ts <= dayEndTs) {
              const user = log.user_username || "Unknown";
              renewals[user] = (renewals[user] || 0) + 1;
            }
          }
          if (foundOld) break;
          page++;
          setProgress({ step: `🟣 Renovações pág ${page}...`, pct: Math.min(95, 57 + page) });
        }
      }

      // ─── Montar tabela ────────────────────────────────────────────────────
      const allOwners = new Set([...Object.keys(tests), ...Object.keys(sales), ...Object.keys(renewals)]);
      const result: ReportRow[] = Array.from(allOwners).map((owner) => {
        const t = tests[owner]    || 0;
        const s = sales[owner]    || 0;
        const r = renewals[owner] || 0;
        return { owner, tests: t, sales: s, renewals: r, conversion: t > 0 ? Math.round((s / t) * 1000) / 10 : 0 };
      }).sort((a, b) => b.sales - a.sales);

      setRows(result);
      setTotals(result.reduce(
        (acc, r) => ({ tests: acc.tests + r.tests, sales: acc.sales + r.sales, renewals: acc.renewals + r.renewals }),
        { tests: 0, sales: 0, renewals: 0 }
      ));
      setProgress({ step: "✅ Concluído", pct: 100 });
    } catch (e: any) {
      setError(e.message || "Erro desconhecido");
    }
    setLoading(false);
  }


  return (
    <div className="p-4 md:p-8 space-y-6 animate-in fade-in zoom-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border/50 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">📊 Ranking de Revendedores</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Testes via created_at · Vendas via logs/<em>trial-conversion</em> · Renovações via logs/<em>extend</em>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm text-white"
          />
          <button
            onClick={fetchReport}
            disabled={loading}
            className="h-9 px-5 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center gap-2"
          >
            {loading ? <span className="animate-spin">⏳</span> : "🔄"} Gerar Relatório
          </button>
        </div>
      </div>

      {loading && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{progress.step}</p>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 transition-all duration-300 rounded-full" style={{ width: `${progress.pct}%` }} />
          </div>
          <p className="text-xs text-muted-foreground text-right">{Math.round(progress.pct)}%</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm">⚠️ {error}</div>
      )}

      {rows.length > 0 && (
        <div className="rounded-xl border border-border/50 overflow-hidden shadow-sm">
          <div className="px-4 py-3 bg-muted/30 border-b border-border/30 text-xs font-bold uppercase text-muted-foreground tracking-wider">
            Relatório de <span className="text-white">{date}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30 bg-muted/20">
                  <th className="text-left px-4 py-3 font-bold text-muted-foreground">Revendedor</th>
                  <th className="text-center px-4 py-3 font-bold text-blue-400">Testes</th>
                  <th className="text-center px-4 py-3 font-bold text-emerald-400">Vendas</th>
                  <th className="text-center px-4 py-3 font-bold text-purple-400">Renovações</th>
                  <th className="text-center px-4 py-3 font-bold text-yellow-400">Conv %</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.owner} className={`border-b border-border/20 hover:bg-muted/20 transition-colors ${i % 2 === 0 ? "" : "bg-muted/5"}`}>
                    <td className="px-4 py-3 font-medium"><span className="text-muted-foreground mr-2 text-xs">{i + 1}.</span>{row.owner}</td>
                    <td className="text-center px-4 py-3 text-blue-400 font-mono">{row.tests}</td>
                    <td className="text-center px-4 py-3 text-emerald-400 font-mono font-bold">{row.sales}</td>
                    <td className="text-center px-4 py-3 text-purple-400 font-mono">{row.renewals}</td>
                    <td className={`text-center px-4 py-3 font-mono font-bold ${convColor(row.conversion)}`}>{row.conversion.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/30 font-bold">
                  <td className="px-4 py-3 text-white">TOTAL</td>
                  <td className="text-center px-4 py-3 text-blue-400 font-mono">{totals.tests}</td>
                  <td className="text-center px-4 py-3 text-emerald-400 font-mono">{totals.sales}</td>
                  <td className="text-center px-4 py-3 text-purple-400 font-mono">{totals.renewals}</td>
                  <td className="text-center px-4 py-3 text-yellow-400 font-mono">
                    {totals.tests > 0 ? ((totals.sales / totals.tests) * 100).toFixed(1) : "0.0"}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {!rows.length && !loading && !error && (
        <div className="text-center py-16 text-muted-foreground">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-sm">Selecione uma data e clique em <strong>Gerar Relatório</strong></p>
        </div>
      )}
    </div>
  );
}
