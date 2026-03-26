import { useState, useMemo, useEffect } from 'react';
import { useSupabaseQuery, useSupabaseInsert, useSupabaseDelete } from '@/hooks/useSupabaseQuery';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Receivable {
  id: string;
  date: string;
  reseller: string;
  description: string;
  type: 'debit' | 'credit';
  amount: number;
  created_at: string;
}

const KEYS = [['receivables']];
const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });

function KpiCard({ title, value, icon: Icon, accent }: { title: string; value: string; icon: any; accent: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex items-center gap-4">
      <div className="rounded-lg p-2" style={{ backgroundColor: accent + '22' }}>
        <Icon className="w-5 h-5" style={{ color: accent }} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-medium">{title}</p>
        <p className="text-xl font-bold" style={{ color: accent }}>{value}</p>
      </div>
    </div>
  );
}

export default function ReceivablesPage() {
  const { data: records, isLoading } = useSupabaseQuery<Receivable>(['receivables'], 'receivables');
  const insert = useSupabaseInsert('receivables', KEYS);
  const del    = useSupabaseDelete('receivables', KEYS);
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [filterReseller, setFilterReseller] = useState('all');
  const [apiResellers, setApiResellers] = useState<string[]>([]);

  // Carrega revendedores da TheBest API
  useEffect(() => {
    const API_URL = 'https://gfumzidvctckachfxdrt.supabase.co/functions/v1/thebest_api';
    const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmdW16aWR2Y3Rja2FjaGZ4ZHJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0OTExMjcsImV4cCI6MjA5MDA2NzEyN30.gQ9yFQPVeD1yVJB33XbKDX05dREa3bsi66clOiSrntE';
    fetch(API_URL, { method: 'POST', headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'info' }) })
      .then(r => r.json())
      .then(info => setApiResellers((info.resellers || []).map((r: any) => r.username)))
      .catch(() => {});
  }, []);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [filterCategory, setFilterCategory] = useState('all');
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    reseller: '',
    category: 'Créditos',
    type: 'debit' as 'debit' | 'credit',
    amount: '',
  });

  // Lista de revendedores: union da API + registros existentes
  const resellers = useMemo(() => {
    const fromRecords = (records || []).map(r => r.reseller).filter(Boolean);
    const all = new Set([...apiResellers, ...fromRecords]);
    return Array.from(all).sort();
  }, [records, apiResellers]);

  // Saldo geral por revendedor (sem filtro de data, para painel de saldos)
  const balanceMap = useMemo(() => {
    const map: Record<string, { debit: number; credit: number; balance: number }> = {};
    for (const r of records || []) {
      if (!map[r.reseller]) map[r.reseller] = { debit: 0, credit: 0, balance: 0 };
      if (r.type === 'debit')  { map[r.reseller].debit  += Number(r.amount); map[r.reseller].balance -= Number(r.amount); }
      if (r.type === 'credit') { map[r.reseller].credit += Number(r.amount); map[r.reseller].balance += Number(r.amount); }
    }
    return map;
  }, [records]);

  // Filtro de tabela (revendedor + data)
  const filtered = useMemo(() => {
    let base = records || [];
    if (filterReseller !== 'all') base = base.filter(r => r.reseller === filterReseller);
    if (filterCategory !== 'all') base = base.filter(r => r.description === filterCategory);
    base = base.filter(r => r.date >= startDate && r.date <= endDate);
    return [...base].sort((a, b) => b.date.localeCompare(a.date));
  }, [records, filterReseller, filterCategory, startDate, endDate]);

  // Gráfico diário: débitos (vermelho) e créditos (verde) no período
  const chartData = useMemo(() => {
    const dayMap: Record<string, { date: string; Débitos: number; Pagamentos: number }> = {};
    for (const r of filtered) {
      if (!dayMap[r.date]) dayMap[r.date] = { date: r.date, Débitos: 0, Pagamentos: 0 };
      if (r.type === 'debit')  dayMap[r.date].Débitos    += Number(r.amount);
      if (r.type === 'credit') dayMap[r.date].Pagamentos += Number(r.amount);
    }
    return Object.values(dayMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({
        ...d,
        date: new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      }));
  }, [filtered]);

  // KPIs totais (respeitando filtro)
  const totalDebit   = filtered.filter(r => r.type === 'debit').reduce((a, r) => a + Number(r.amount), 0);
  const totalCredit  = filtered.filter(r => r.type === 'credit').reduce((a, r) => a + Number(r.amount), 0);
  const totalBalance = totalCredit - totalDebit;

  // KPIs por categoria (débitos apenas, no período/filtro)
  const allDebits = (records || []).filter(r => r.type === 'debit' && r.date >= startDate && r.date <= endDate
    && (filterReseller === 'all' || r.reseller === filterReseller));
  const debitCreditos = allDebits.filter(r => r.description === 'Créditos').reduce((a, r) => a + Number(r.amount), 0);
  const debitAds      = allDebits.filter(r => r.description === 'Ads').reduce((a, r) => a + Number(r.amount), 0);

  const resetForm = () => setForm({ date: new Date().toISOString().split('T')[0], reseller: '', category: 'Créditos', type: 'debit', amount: '' });

  const handleSubmit = async () => {
    if (!form.reseller || !form.amount) return;
    try {
      await insert.mutateAsync({
        date: form.date,
        reseller: form.reseller.trim(),
        description: form.category,
        type: form.type,
        amount: parseFloat(form.amount) || 0,
      });
      toast({ title: form.type === 'debit' ? 'Débito lançado!' : 'Pagamento registrado!' });
      setOpen(false);
      resetForm();
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in duration-500">

      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 border-b border-border/50 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Custos a Receber</h1>
          <p className="text-muted-foreground text-sm mt-1">Controle de débitos e pagamentos por revendedor</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Filtro de revendedor */}
          <select
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm min-w-[180px]"
            value={filterReseller}
            onChange={e => setFilterReseller(e.target.value)}
          >
            <option value="all">👥 Todos os revendedores</option>
            {resellers.map(r => <option key={r} value={r}>👤 {r}</option>)}
          </select>
          {/* Filtro de categoria */}
          <select
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
          >
            <option value="all">🏷️ Todas as categorias</option>
            <option value="Créditos">💳 Créditos</option>
            <option value="Ads">📣 Ads</option>
            <option value="Outro">📌 Outro</option>
          </select>
          {/* Datas */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>De</span>
            <Input type="date" className="h-9 w-36 text-sm" value={startDate} onChange={e => setStartDate(e.target.value)} />
            <span>Até</span>
            <Input type="date" className="h-9 w-36 text-sm" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-1" /> Novo Lançamento</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo Lançamento</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Data</label>
                    <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Tipo</label>
                    <Select value={form.type} onValueChange={(v: 'debit'|'credit') => setForm({ ...form, type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="debit">🔴 Débito (a receber)</SelectItem>
                        <SelectItem value="credit">🟢 Pagamento recebido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Revendedor</label>
                  <Input
                    placeholder="Nome ou username"
                    value={form.reseller}
                    onChange={e => setForm({ ...form, reseller: e.target.value })}
                    list="resellers-list"
                  />
                  <datalist id="resellers-list">
                    {resellers.map(r => <option key={r} value={r} />)}
                  </datalist>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Valor (R$)</label>
                  <Input type="number" step="0.01" placeholder="0,00" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Categoria</label>
                  <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Créditos">💳 Créditos</SelectItem>
                      <SelectItem value="Ads">📣 Ads</SelectItem>
                      <SelectItem value="Outro">📌 Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleSubmit} disabled={!form.reseller || !form.amount} className="w-full">
                  {form.type === 'debit' ? '➕ Lançar Débito' : '✅ Registrar Pagamento'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard title="Total a Receber (Débitos)"   value={`R$ ${fmt(totalDebit)}`}              icon={TrendingDown} accent="#ef4444" />
        <KpiCard title="Total Recebido (Pagamentos)" value={`R$ ${fmt(totalCredit)}`}             icon={TrendingUp}   accent="#10b981" />
        <KpiCard title="Saldo Pendente"              value={`R$ ${fmt(Math.abs(totalBalance))}`}  icon={Wallet} accent={totalBalance >= 0 ? '#10b981' : '#ef4444'} />
      </div>

      {/* KPIs por categoria */}
      {filterCategory === 'all' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard title="💳 A Receber — Créditos" value={`R$ ${fmt(debitCreditos)}`} icon={TrendingDown} accent="#8b5cf6" />
          <KpiCard title="📣 A Receber — Ads"      value={`R$ ${fmt(debitAds)}`}      icon={TrendingDown} accent="#f59e0b" />
          <KpiCard title="📊 Total Combinado"      value={`R$ ${fmt(debitCreditos + debitAds)}`} icon={Wallet} accent="#3b82f6" />
        </div>
      )}

      {/* Gráfico diário */}
      {chartData.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-base font-semibold mb-4">Lançamentos Diários (Período)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" tick={{ fill: '#888', fontSize: 11 }} />
              <YAxis tick={{ fill: '#888', fontSize: 11 }} width={60}
                tickFormatter={v => `R$${v >= 1000 ? (v/1000).toFixed(1)+'k' : v}`} />
              <Tooltip
                formatter={(v: any, name: string) => [`R$ ${fmt(Number(v))}`, name]}
                contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: 8 }}
              />
              <Bar dataKey="Débitos"    fill="#ef4444" radius={[4,4,0,0]} />
              <Bar dataKey="Pagamentos" fill="#10b981" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Saldo por revendedor */}
      {filterReseller === 'all' && resellers.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-base font-semibold mb-4">Saldo por Revendedor (Acumulado)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(balanceMap).sort((a,b) => a[1].balance - b[1].balance).map(([name, b]) => (
              <div key={name} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
                <div>
                  <p className="text-sm font-medium">👤 {name}</p>
                  <p className="text-xs text-muted-foreground">Débito: R$ {fmt(b.debit)} | Pago: R$ {fmt(b.credit)}</p>
                </div>
                <p className={`text-sm font-bold ${b.balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {b.balance >= 0 ? '+' : ''}R$ {fmt(b.balance)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabela */}
      <Card className="border-border/50">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Revendedor</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead className="w-[60px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum lançamento encontrado</TableCell></TableRow>
              ) : filtered.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.date + 'T12:00:00').toLocaleDateString('pt-BR')}</TableCell>
                  <TableCell className="font-medium">👤 {r.reseller}</TableCell>
                  <TableCell>
                    <Badge variant={r.type === 'debit' ? 'destructive' : 'default'}>
                      {r.type === 'debit' ? '🔴 A receber' : '🟢 Recebido'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      r.description === 'Créditos' ? 'bg-purple-500/20 text-purple-300' :
                      r.description === 'Ads' ? 'bg-amber-500/20 text-amber-300' :
                      'bg-muted text-muted-foreground'
                    }`}>{r.description || '-'}</span>
                  </TableCell>
                  <TableCell className={`font-mono font-semibold ${r.type === 'debit' ? 'text-red-400' : 'text-emerald-400'}`}>
                    {r.type === 'debit' ? '-' : '+'}R$ {fmt(Number(r.amount))}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => del.mutateAsync(r.id)}>
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
  );
}
