import { useState, useMemo, useEffect } from 'react';
import { useSupabaseQuery, useSupabaseInsert, useSupabaseUpdate, useSupabaseDelete } from '@/hooks/useSupabaseQuery';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from "recharts";

interface TrafficExpense {
  id: string; date: string; platform: string; campaign: string;
  amount: number; notes: string; user_id?: string;
}

interface UserReseller { id: string; name: string; type: string; }

const KEYS = [['traffic_expenses']];

const API_URL = "https://gfumzidvctckachfxdrt.supabase.co/functions/v1/thebest_api";
const API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmdW16aWR2Y3Rja2FjaGZ4ZHJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0OTExMjcsImV4cCI6MjA5MDA2NzEyN30.gQ9yFQPVeD1yVJB33XbKDX05dREa3bsi66clOiSrntE";
async function apiCall(body: object) {
  const r = await fetch(API_URL, { method: "POST", headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return r.json();
}

export default function TrafficPage() {
  const { data: expenses, isLoading } = useSupabaseQuery<TrafficExpense>(['traffic_expenses'], 'traffic_expenses');
  const { data: users } = useSupabaseQuery<UserReseller>(['users_resellers'], 'users_resellers');
  
  const insert = useSupabaseInsert('traffic_expenses', KEYS);
  const update = useSupabaseUpdate('traffic_expenses', KEYS);
  const del = useSupabaseDelete('traffic_expenses', KEYS);
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TrafficExpense | null>(null);
  const [search, setSearch] = useState('');
  const [viewFilter, setViewFilter] = useState("all");
  const [startDate, setStartDate] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  // Revendedores do TheBest API
  const [masterUsername, setMasterUsername] = useState('Master');
  const [apiResellers, setApiResellers] = useState<string[]>([]);

  useEffect(() => {
    apiCall({ action: 'info' }).then(info => {
      setMasterUsername(info.master?.username || 'Master');
      setApiResellers((info.resellers || []).map((r: any) => r.username));
    }).catch(() => {});
  }, []);
  
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0], platform: '', campaign: '', amount: '0', notes: '', user_id: ''
  });

  // Helper to map UI filter to user_id/type logic
  const filteredData = useMemo(() => {
    let base = (expenses || []).filter(e =>
      e.platform.toLowerCase().includes(search.toLowerCase()) ||
      e.campaign?.toLowerCase().includes(search.toLowerCase())
    );

    base = base.filter(e => e.date >= startDate && e.date <= endDate);

    // Filtro por revendedor (user_id armazena username ou 'master')
    if (viewFilter === 'master') {
      base = base.filter(e => !e.user_id || e.user_id === masterUsername || e.user_id === 'master');
    } else if (viewFilter === 'resellers') {
      base = base.filter(e => e.user_id && e.user_id !== masterUsername && e.user_id !== 'master');
    } else if (viewFilter !== 'all') {
      base = base.filter(e => e.user_id === viewFilter);
    }

    return base.sort((a,b) => b.date.localeCompare(a.date));
  }, [expenses, search, viewFilter, startDate, endDate, masterUsername]);

  // Chart Data Preparation (Daily)
  const chartData = useMemo(() => {
    const dailyMap: Record<string, number> = {};
    filteredData.forEach(e => {
      dailyMap[e.date] = (dailyMap[e.date] || 0) + Number(e.amount);
    });
    return Object.keys(dailyMap)
      .sort((a, b) => a.localeCompare(b)) // ascending for chart
      .map(date => ({
        date: new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        amount: dailyMap[date]
      }));
  }, [filteredData]);

  // Gráfico comparativo Master vs Revendedores (visível quando filtro = 'all')
  const compChartData = useMemo(() => {
    const allBase = (expenses || []).filter(e => e.date >= startDate && e.date <= endDate);
    const dateMap: Record<string, { date: string; Master: number; Revendedores: number }> = {};
    allBase.forEach(e => {
      const d = e.date;
      if (!dateMap[d]) dateMap[d] = { date: d, Master: 0, Revendedores: 0 };
      // user_id vazio / 'master' / igual ao masterUsername → Master; qualquer outro → Revendedor
      const isMaster = !e.user_id || e.user_id === 'master' || e.user_id === masterUsername;
      if (isMaster) dateMap[d].Master      += Number(e.amount);
      else          dateMap[d].Revendedores += Number(e.amount);
    });
    return Object.values(dateMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({ ...d, date: new Date(d.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) }));
  }, [expenses, startDate, endDate, masterUsername]);


  const resetForm = () => {
    setForm({ date: new Date().toISOString().split('T')[0], platform: '', campaign: '', amount: '0', notes: '', user_id: '' });
    setEditing(null);
  };

  const getUserName = (uid?: string) => {
    if (!uid) return 'Master';
    if (uid === masterUsername || uid === 'master') return `👑 ${masterUsername} (Master)`;
    return uid; // username direto
  };

  const openEdit = (e: TrafficExpense) => {
    setEditing(e);
    setForm({ date: e.date, platform: e.platform, campaign: e.campaign || '', amount: String(e.amount), notes: e.notes || '', user_id: e.user_id || '' });
    setOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const payload = { ...form, amount: parseFloat(form.amount) || 0, user_id: form.user_id || null };
      if (editing) {
        await update.mutateAsync({ id: editing.id, ...payload });
        toast({ title: 'Gasto atualizado!' });
      } else {
        await insert.mutateAsync(payload);
        toast({ title: 'Gasto cadastrado!' });
      }
      setOpen(false);
      resetForm();
    } catch (e: any) {
      toast({ title: 'Erro', description: 'Você precisa adicionar a coluna user_id na tabela traffic_expenses no banco de dados. ' + e.message, variant: 'destructive' });
    }
  };



  const totalGasto = filteredData.reduce((acc, curr) => acc + Number(curr.amount), 0);

  // compChartData: use apiResellers to detect master vs reseller
  const getUserLabel = (uid?: string) => {
    if (!uid || uid === masterUsername || uid === 'master') return 'master';
    return 'reseller';
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in duration-500">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 border-b border-border/50 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tráfego Pago</h1>
          <p className="text-muted-foreground text-sm mt-1">Gastos por área e usuários no período</p>
        </div>
        
        <div className="flex flex-wrap items-end gap-3 bg-card p-3 rounded-xl border border-border mt-2 xl:mt-0 shadow-sm">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Filtro de Visão</label>
            <select 
              className="flex h-9 w-full min-w-[200px] items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background disabled:opacity-50"
              value={viewFilter}
              onChange={(e) => setViewFilter(e.target.value)}
            >
              <option value="all">🌳 Toda a Árvore (Geral)</option>
              <option value="master">👑 Apenas Master</option>
              <option value="resellers">👥 Apenas Revendedores</option>
              <option disabled>──────────────</option>
              <option value={masterUsername}>👑 {masterUsername} (Master)</option>
              {apiResellers.map(r => (
                <option key={r} value={r}>👤 {r}</option>
              ))}
            </select>
          </div>
          
          <div className="space-y-1">
             <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">De (Período)</label>
             <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-white" />
          </div>

          <div className="space-y-1">
             <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Até</label>
             <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-white" />
          </div>

          <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="h-9 ml-2"><Plus className="w-4 h-4 mr-2" /> Novo Gasto</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? 'Editar Gasto' : 'Novo Gasto'}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
                <Select value={form.user_id} onValueChange={v => setForm({ ...form, user_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Responsável" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={masterUsername}>👑 {masterUsername} (Master)</SelectItem>
                    {apiResellers.map(r => <SelectItem key={r} value={r}>👤 {r}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input placeholder="Plataforma (ex: Google Ads)" value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })} />
                <Input placeholder="Campanha" value={form.campaign} onChange={e => setForm({ ...form, campaign: e.target.value })} />
                <Input type="number" step="0.01" placeholder="Valor" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
                <Textarea placeholder="Observações" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                <Button onClick={handleSubmit} className="w-full" disabled={!form.platform}>
                  {editing ? 'Salvar' : 'Cadastrar'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* KPI Total */}
        <Card className="rounded-xl border border-red-900/30 bg-red-950/20 p-6 shadow-sm flex flex-col justify-center">
            <h3 className="text-lg font-semibold text-muted-foreground mb-2">Total Gasto (Filtro Atual)</h3>
            <p className="text-4xl font-bold tracking-tight text-white mb-2">R$ {totalGasto.toFixed(2)}</p>
            <p className="text-sm text-emerald-400">Referente a {filteredData.length} registros no período</p>
        </Card>

        {/* Chart */}
        <Card className="lg:col-span-2 rounded-xl border border-border bg-card shadow-sm p-6">
          <h3 className="text-lg font-semibold mb-6">Gastos Diários (Período)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
              <XAxis dataKey="date" stroke="#888" tick={{fontSize: 12}} />
              <YAxis stroke="#888" tick={{fontSize: 12}} />
              <Tooltip contentStyle={{ backgroundColor: '#111', borderColor: '#333' }} cursor={{fill: 'rgba(255,255,255,0.05)'}} />
              <Bar dataKey="amount" name="Gasto R$" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Gráfico comparativo Master vs Revendedores */}
      {viewFilter === 'all' && compChartData.length > 0 && (
        <Card className="rounded-xl border border-border bg-card shadow-sm p-6">
          <h3 className="text-lg font-semibold mb-4">Gastos por Segmento: Master vs Revendedores</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={compChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
              <XAxis dataKey="date" stroke="#888" tick={{ fontSize: 11 }} />
              <YAxis stroke="#888" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: '#111', borderColor: '#333' }} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Legend />
              <Bar dataKey="Master" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Revendedores" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar plataforma ou campanha..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <Card className="border-border/50">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Plataforma</TableHead>
                <TableHead>Campanha</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead className="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filteredData.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum gasto encontrado no filtro selecionado</TableCell></TableRow>
              ) : filteredData.map(e => (
                <TableRow key={e.id}>
                  <TableCell>{new Date(e.date).toLocaleDateString('pt-BR')}</TableCell>
                  <TableCell className="text-muted-foreground">{getUserName(e.user_id)}</TableCell>
                  <TableCell className="font-medium">{e.platform}</TableCell>
                  <TableCell>{e.campaign || '-'}</TableCell>
                  <TableCell className="font-mono text-red-400">R$ {Number(e.amount).toFixed(2)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => del.mutateAsync(e.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
