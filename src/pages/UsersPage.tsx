import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2 } from 'lucide-react';

interface ApiReseller {
  id: number;
  username: string;
  email: string;
  credits: number;
  is_active: boolean;
  created_at: number;
}

export default function UsersPage() {
  const [resellers, setResellers] = useState<ApiReseller[]>([]);
  const [stats, setStats] = useState({ active: 0, expired: 0, trials: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  const API_URL = "https://gfumzidvctckachfxdrt.supabase.co/functions/v1/thebest_api";
  const API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmdW16aWR2Y3Rja2FjaGZ4ZHJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0OTExMjcsImV4cCI6MjA5MDA2NzEyN30.gQ9yFQPVeD1yVJB33XbKDX05dREa3bsi66clOiSrntE";

  async function loadData() {
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action: "users" })
      });
      const data = await res.json();
      setResellers(data.resellers || []);
      setStats({
        active: data.total_active || 0,
        expired: data.total_expired || 0,
        trials: data.total_trials || 0,
      });
    } catch (e) {
      console.error(e);
    }
    setIsLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  const filtered = resellers.filter(r => 
    r.username.toLowerCase().includes(search.toLowerCase()) || 
    (r.email && r.email.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6 p-8 animate-in fade-in zoom-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Revendedores & Usuários</h1>
          <p className="text-sm text-muted-foreground mt-1">Visão geral dos revendedores da TheBest API</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground mb-1">Clientes Ativos</div>
          <div className="text-3xl font-bold text-emerald-500">{stats.active}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground mb-1">Clientes Expirados</div>
          <div className="text-3xl font-bold text-rose-500">{stats.expired}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground mb-1">Testes (Trials)</div>
          <div className="text-3xl font-bold text-amber-500">{stats.trials}</div>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input 
          placeholder="Buscar revendedor..." 
          className="pl-9 bg-card border-border/50" 
          value={search} 
          onChange={e => setSearch(e.target.value)} 
        />
      </div>

      <Card className="border-border/50 bg-card overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-black/20">
              <TableRow>
                <TableHead>Revendedor</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Créditos Balance</TableHead>
                <TableHead>Membro Desde</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Carregando dados da TheBest API...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    Nenhum revendedor encontrado.
                  </TableCell>
                </TableRow>
              ) : filtered.map(r => (
                <TableRow key={r.id} className="hover:bg-white/5 transition-colors">
                  <TableCell className="font-medium text-primary">{r.username}</TableCell>
                  <TableCell className="text-muted-foreground">{r.email || '-'}</TableCell>
                  <TableCell className="font-mono">{r.credits?.toFixed(2) || '0.00'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(r.created_at * 1000).toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.is_active ? 'default' : 'destructive'} 
                           className={r.is_active ? "bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30" : ""}>
                      {r.is_active ? 'Ativo' : 'Bloqueado'}
                    </Badge>
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
