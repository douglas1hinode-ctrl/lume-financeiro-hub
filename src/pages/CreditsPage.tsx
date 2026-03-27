import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSupabaseQuery, useSupabaseInsert, useSupabaseDelete } from '@/hooks/useSupabaseQuery';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Search } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from 'recharts';
import { apiCall } from "@/lib/api";

interface Credit {
  id: string; date: string; user_id: string; quantity: number;
  unit_cost: number; total_cost: number; sale_price: number;
  revenue: number; profit: number; status: string; notes: string;
}
interface UserReseller { id: string; name: string; credit_cost: number; }

const KEYS = [['credits']];

interface LogRow { date: string; type: 'sale' | 'renewal'; owner: string; ts: number; cost: number; }

function KpiCard({ title, value, accent }: { title: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground font-medium">{title}</p>
      <p className="text-2xl font-bold mt-1" style={{ color: accent }}>{value}</p>
    </div>
  );
}

export default function CreditsPage() {
  // ── Supabase CRUD (mantido intacto) ──────────────────────────────
  const { data: credits, isLoading } = useSupabaseQuery<Credit>(['credits'], 'credits');
  const { data: users } = useSupabaseQuery<UserReseller>(['users_resellers'], 'users_resellers');
  const insert = useSupabaseInsert('credits', KEYS);
  const del = useSupabaseDelete('credits', KEYS);
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0], user_id: '',
    quantity: '0', unit_cost: '0', sale_price: '0', status: 'ativo', notes: ''
  });

  // ── API Logs — Consumo de Créditos ───────────────────────────────
  const today = new Date();
  const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const todayStr = today.toISOString().split('T')[0];

  const [viewFilter, setViewFilter] = useState('all');
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(todayStr);
  const [masterUsername, setMasterUsername] = useState('');
  const [apiResellers, setApiResellers] = useState<string[]>([]);
  const [allRows, setAllRows] = useState<LogRow[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [progress, setProgress] = useState({ status: '', pct: 0 });
  const busy = useRef(false);

  useEffect(() => {
    apiCall({ action: 'info' }).then(info => {
      setMasterUsername(info.master?.username || '');
      setApiResellers((info.resellers || []).map((r: any) => r.username));
    }).catch(() => {});
  }, []);

  const toLocalDate = (ts: number) => {
    const d = new Date(ts * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const fetchLogs = useCallback(async (sd: string, ed: string) => {
    if (busy.current) return;
    busy.current = true;
    setLogLoading(true);
    setProgress({ status: 'Buscando vendas...', pct: 10 });

    const fromTs = Math.floor(new Date(sd + "T00:00:00").getTime() / 1000);
    const toTs   = Math.floor(new Date(ed + "T23:59:59").getTime() / 1000);
    const rows: LogRow[] = [];

    // Vendas (conversões)
    for (let p = 1; p <= 500; p++) {
      try {
        const r = await apiCall({ action: 'fetch_conversion_logs', page: p });
        if (!r.results?.length) break;
        let stop = false;
        for (const log of r.results) {
          const ts = log.created_at || 0;
          if (ts < fromTs) { stop = true; break; }
          if (ts <= toTs) rows.push({ date: toLocalDate(ts), type: 'sale', owner: log.user_username || 'Unknown', ts, cost: Math.abs(log.cost ?? 1) });
        }
        if (stop) break;
      } catch { break; }
    }

    setProgress({ status: 'Buscando renovações...', pct: 55 });

    // Renovações
    for (let p = 1; p <= 500; p++) {
      try {
        const r = await apiCall({ action: 'fetch_extend_logs', page: p });
        if (!r.results?.length) break;
        let stop = false;
        for (const log of r.results) {
          const ts = log.created_at || 0;
          if (ts < fromTs) { stop = true; break; }
          if (ts <= toTs) rows.push({ date: toLocalDate(ts), type: 'renewal', owner: log.user_username || 'Unknown', ts, cost: Math.abs(log.cost ?? 1) });
        }
        if (stop) break;
      } catch { break; }
    }

    setAllRows(rows);
    setProgress({ status: '✅ Concluído', pct: 100 });
    setLogLoading(false);
    busy.current = false;
  }, []);

  useEffect(() => { fetchLogs(startDate, endDate); }, []);

  // Filtro de visão aplicado client-side
  const applyViewFilter = (rows: LogRow[]) => {
    if (viewFilter === 'master')    return rows.filter(r => r.owner === masterUsername || r.owner === `${masterUsername} (Master)`);
    if (viewFilter === 'resellers') return rows.filter(r => r.owner !== masterUsername && r.owner !== `${masterUsername} (Master)`);
    if (viewFilter !== 'all')       return rows.filter(r => r.owner === viewFilter);
    return rows;
  };

  const viewRows = applyViewFilter([...allRows]);

  // KPIs — custo real por transação
  const totalSales    = viewRows.filter(r => r.type === 'sale').reduce((a, r) => a + r.cost, 0);
  const totalRenewals = viewRows.filter(r => r.type === 'renewal').reduce((a, r) => a + r.cost, 0);
  const totalCredits  = totalSales + totalRenewals;

  // Gráfico: consumo por dia (vendas + renovações)
  const chartData = useMemo(() => {
    const sdMap: Record<string, number> = {};
    const rdMap: Record<string, number> = {};
    for (const r of viewRows) {
      if (r.type === 'sale')    sdMap[r.date] = (sdMap[r.date] || 0) + r.cost;
      if (r.type === 'renewal') rdMap[r.date] = (rdMap[r.date] || 0) + r.cost;
    }
    const dates = new Set([...Object.keys(sdMap), ...Object.keys(rdMap)]);
    return Array.from(dates).sort().map(d => ({ date: d, Vendas: sdMap[d] || 0, Renovações: rdMap[d] || 0 }));
  }, [allRows, viewFilter, masterUsername]);

  // Preços por crédito
  const [masterPrice, setMasterPrice] = useState(5.75);
  const [resellerPrice, setResellerPrice] = useState(10.00);

  // Gráfico de custo em R$ por dia
  const costChartData = useMemo(() => {
    const dayMap: Record<string, { date: string; Master: number; Revendedores: number }> = {};
    for (const r of viewRows) {
      if (!dayMap[r.date]) dayMap[r.date] = { date: r.date, Master: 0, Revendedores: 0 };
      const isMaster = r.owner === masterUsername || r.owner === '';
      const price = isMaster ? masterPrice : resellerPrice;
      if (isMaster) dayMap[r.date].Master      += r.cost * price;
      else          dayMap[r.date].Revendedores += r.cost * price;
    }
    return Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));
  }, [allRows, viewFilter, masterUsername, masterPrice, resellerPrice]);

  const totalCostMaster    = viewRows.filter(r => r.owner === masterUsername || r.owner === '').reduce((a, r) => a + r.cost * masterPrice, 0);
  const totalCostResellers = viewRows.filter(r => r.owner !== masterUsername && r.owner !== '').reduce((a, r) => a + r.cost * resellerPrice, 0);
  const totalCost          = totalCostMaster + totalCostResellers;

  // ── Supabase CRUD helpers (mantidos) ────────────────────────────
  const filtered = (credits || []).filter(c => {
    const userName = (users || []).find(u => u.id === c.user_id)?.name || '';
    return userName.toLowerCase().includes(search.toLowerCase());
  });

  const resetForm = () => {
    setForm({ date: new Date().toISOString().split('T')[0], user_id: '', quantity: '0', unit_cost: '0', sale_price: '0', status: 'ativo', notes: '' });
  };

  const handleUserChange = (userId: string) => {
    const user = (users || []).find(u => u.id === userId);
    setForm({ ...form, user_id: userId, unit_cost: user ? String(user.credit_cost) : '0' });
  };

  const handleSubmit = async () => {
    try {
      const payload = {
        date: form.date, user_id: form.user_id || null,
        quantity: parseInt(form.quantity) || 0,
        unit_cost: parseFloat(form.unit_cost) || 0,
        sale_price: parseFloat(form.sale_price) || 0,
        status: form.status, notes: form.notes,
      };
      await insert.mutateAsync(payload);
      toast({ title: 'Crédito cadastrado!' });
      setOpen(false); resetForm();
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
  };

  const getUserName = (id: string) => (users || []).find(u => u.id === id)?.name || '-';
  const qty = parseInt(form.quantity) || 0;
  const uc  = parseFloat(form.unit_cost) || 0;
  const sp  = parseFloat(form.sale_price) || 0;

  return (
    <div className="space-y-6 animate-in fade-in zoom-in duration-500">

      {/* ── SEÇÃO: Consumo de Créditos via API ── */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 border-b border-border/50 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Créditos</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Consumo de créditos por dia (vendas + renovações)
            {allRows.length > 0 && <span className="text-emerald-400 ml-2">✅ {allRows.length} logs carregados</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3 bg-card p-3 rounded-xl border border-border shadow-sm">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Visão</label>
            <select className="flex h-9 min-w-[180px] rounded-md border border-input bg-background px-3 py-1 text-sm"
              value={viewFilter} onChange={e => { setViewFilter(e.target.value); }}>
              <option value="all">🌳 Toda a Árvore</option>
              <option value="master">👑 Apenas Master</option>
              <option value="resellers">👥 Apenas Revendedores</option>
              <option disabled>──────</option>
              {masterUsername && <option value={masterUsername}>👑 {masterUsername} (Master)</option>}
              {apiResellers.map(r => <option key={r} value={r}>👤 {r}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">De</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm text-white" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Até</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm text-white" />
          </div>
          <button onClick={() => { busy.current = false; fetchLogs(startDate, endDate); }}
            className="h-9 px-4 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
            🔄 Recarregar
          </button>
        </div>
      </div>

      {logLoading && (
        <div className="flex flex-col items-center gap-3 py-4">
          <p className="text-sm text-muted-foreground">{progress.status}</p>
          <div className="w-96 h-3 bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full transition-all duration-500" style={{ width: `${progress.pct}%` }} />
          </div>
        </div>
      )}

      {/* KPIs de consumo */}
      {!logLoading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard title="Créditos em Vendas"    value={totalSales.toLocaleString()}    accent="#10b981" />
          <KpiCard title="Créditos em Renovações" value={totalRenewals.toLocaleString()} accent="#3b82f6" />
          <KpiCard title="Total de Créditos Gastos" value={totalCredits.toLocaleString()} accent="#f59e0b" />
        </div>
      )}

      {/* Gráfico de consumo por dia */}
      {!logLoading && chartData.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">
            Consumo de Créditos por Dia
            <span className="text-xs text-emerald-400 ml-2">(logs reais)</span>
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
              <XAxis dataKey="date" stroke="#888" tick={{ fontSize: 11 }} />
              <YAxis stroke="#888" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: '#111', borderColor: '#333' }} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Legend />
              <Bar dataKey="Vendas"    stackId="a" fill="#10b981" />
              <Bar dataKey="Renovações" stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Gráfico de Custo em R$ por dia */}
      {!logLoading && costChartData.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-lg font-semibold">
              Custo em R$ por Dia
              <span className="text-xs text-yellow-400 ml-2">(Master × R$ {masterPrice.toFixed(2)} &nbsp;|&nbsp; Revendas × R$ {resellerPrice.toFixed(2)})</span>
            </h3>
            <div className="flex items-center gap-3 text-sm">
              <label className="text-muted-foreground">Master R$/créd:</label>
              <input type="number" step="0.01" value={masterPrice}
                onChange={e => setMasterPrice(parseFloat(e.target.value) || 0)}
                className="w-20 h-8 rounded border border-input bg-background px-2 text-sm text-white" />
              <label className="text-muted-foreground">Revendas R$/créd:</label>
              <input type="number" step="0.01" value={resellerPrice}
                onChange={e => setResellerPrice(parseFloat(e.target.value) || 0)}
                className="w-20 h-8 rounded border border-input bg-background px-2 text-sm text-white" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <KpiCard title="Custo Master"      value={`R$ ${totalCostMaster.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}    accent="#f59e0b" />
            <KpiCard title="Custo Revendedores" value={`R$ ${totalCostResellers.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} accent="#ef4444" />
            <KpiCard title="Custo Total"        value={`R$ ${totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}          accent="#ec4899" />
          </div>

          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={costChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
              <XAxis dataKey="date" stroke="#888" tick={{ fontSize: 11 }} />
              <YAxis stroke="#888" tick={{ fontSize: 11 }} tickFormatter={v => `R$${v.toFixed(0)}`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#111', borderColor: '#333' }}
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                formatter={(v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
              />
              <Legend />
              <Bar dataKey="Master"       stackId="a" fill="#f59e0b" />
              <Bar dataKey="Revendedores" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── SEÇÃO: Gestão de Créditos Supabase (MANTIDA INTACTA) ── */}
      <div className="border-t border-border/50 pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">Gestão de Créditos</h2>
            <p className="text-sm text-muted-foreground">Compras e controle de créditos por usuário</p>
          </div>
          <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4" /> Novo Crédito</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo Crédito</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
                <Select value={form.user_id} onValueChange={handleUserChange}>
                  <SelectTrigger><SelectValue placeholder="Usuário" /></SelectTrigger>
                  <SelectContent>
                    {(users || []).map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} (custo: R$ {Number(u.credit_cost).toFixed(2)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="number" placeholder="Quantidade" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} />
                <Input type="number" step="0.01" placeholder="Custo unitário" value={form.unit_cost} onChange={e => setForm({ ...form, unit_cost: e.target.value })} />
                <Input type="number" step="0.01" placeholder="Preço de venda unitário" value={form.sale_price} onChange={e => setForm({ ...form, sale_price: e.target.value })} />
                <div className="p-3 rounded-lg bg-muted text-sm space-y-1">
                  <p>Custo total: <span className="font-mono font-medium">R$ {(qty * uc).toFixed(2)}</span></p>
                  <p>Faturamento: <span className="font-mono font-medium">R$ {(qty * sp).toFixed(2)}</span></p>
                  <p>Lucro: <span className="font-mono font-medium">R$ {(qty * (sp - uc)).toFixed(2)}</span></p>
                </div>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea placeholder="Observações" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                <Button onClick={handleSubmit} className="w-full" disabled={!form.user_id || qty <= 0}>
                  Cadastrar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="relative max-w-sm mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por usuário..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <Card className="border-border/50">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Qtd</TableHead>
                  <TableHead>Custo Unit.</TableHead>
                  <TableHead>Custo Total</TableHead>
                  <TableHead>Preço Venda</TableHead>
                  <TableHead>Faturamento</TableHead>
                  <TableHead>Lucro</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[60px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Nenhum crédito encontrado</TableCell></TableRow>
                ) : filtered.map(c => (
                  <TableRow key={c.id}>
                    <TableCell>{new Date(c.date).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell className="font-medium">{getUserName(c.user_id)}</TableCell>
                    <TableCell className="font-mono">{c.quantity}</TableCell>
                    <TableCell className="font-mono">R$ {Number(c.unit_cost).toFixed(2)}</TableCell>
                    <TableCell className="font-mono">R$ {Number(c.total_cost).toFixed(2)}</TableCell>
                    <TableCell className="font-mono">R$ {Number(c.sale_price).toFixed(2)}</TableCell>
                    <TableCell className="font-mono">R$ {Number(c.revenue).toFixed(2)}</TableCell>
                    <TableCell className={`font-mono ${Number(c.profit) >= 0 ? 'text-success' : 'text-destructive'}`}>
                      R$ {Number(c.profit).toFixed(2)}
                    </TableCell>
                    <TableCell><Badge variant={c.status === 'ativo' ? 'default' : c.status === 'cancelado' ? 'destructive' : 'secondary'}>{c.status}</Badge></TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => del.mutateAsync(c.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
