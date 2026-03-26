import { useState, useMemo } from 'react';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface UserReseller { id: string; name: string; type: string; }
interface Sale { id: string; date: string; client: string; user_id: string; sale_type: string; amount: number; status: string; }
interface Renewal { id: string; date: string; client: string; user_id: string; type: string; amount: number; status: string; }
interface TrafficExpense { id: string; date: string; platform: string; campaign: string; amount: number; }
interface Credit { id: string; date: string; user_id: string; quantity: number; total_cost: number; revenue: number; profit: number; status: string; }

type ReportType = 'vendas' | 'renovacoes' | 'creditos' | 'trafego';

export default function ReportsPage() {
  const { data: users } = useSupabaseQuery<UserReseller>(['users_resellers'], 'users_resellers');
  const { data: sales } = useSupabaseQuery<Sale>(['sales'], 'sales');
  const { data: renewals } = useSupabaseQuery<Renewal>(['renewals'], 'renewals');
  const { data: traffic } = useSupabaseQuery<TrafficExpense>(['traffic_expenses'], 'traffic_expenses');
  const { data: credits } = useSupabaseQuery<Credit>(['credits'], 'credits');

  const [reportType, setReportType] = useState<ReportType>('vendas');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [userId, setUserId] = useState('');
  const [userType, setUserType] = useState('');

  const getUserName = (id: string) => (users || []).find(u => u.id === id)?.name || '-';
  const getUserType = (id: string) => (users || []).find(u => u.id === id)?.type || '';

  const filteredData = useMemo(() => {
    const filterDate = (date: string) => {
      if (dateFrom && date < dateFrom) return false;
      if (dateTo && date > dateTo) return false;
      return true;
    };
    const filterUser = (uid: string) => {
      if (userId && uid !== userId) return false;
      if (userType && getUserType(uid) !== userType) return false;
      return true;
    };

    switch (reportType) {
      case 'vendas':
        return (sales || []).filter(s => filterDate(s.date) && filterUser(s.user_id));
      case 'renovacoes':
        return (renewals || []).filter(r => filterDate(r.date) && filterUser(r.user_id));
      case 'creditos':
        return (credits || []).filter(c => filterDate(c.date) && filterUser(c.user_id));
      case 'trafego':
        return (traffic || []).filter(t => filterDate(t.date));
      default:
        return [];
    }
  }, [reportType, dateFrom, dateTo, userId, userType, sales, renewals, credits, traffic, users]);

  const columns: Record<ReportType, { key: string; label: string }[]> = {
    vendas: [
      { key: 'date', label: 'Data' },
      { key: 'client', label: 'Cliente' },
      { key: 'user_id', label: 'Responsável' },
      { key: 'sale_type', label: 'Tipo' },
      { key: 'amount', label: 'Valor' },
      { key: 'status', label: 'Status' },
    ],
    renovacoes: [
      { key: 'date', label: 'Data' },
      { key: 'client', label: 'Cliente' },
      { key: 'user_id', label: 'Responsável' },
      { key: 'type', label: 'Tipo' },
      { key: 'amount', label: 'Valor' },
      { key: 'status', label: 'Status' },
    ],
    creditos: [
      { key: 'date', label: 'Data' },
      { key: 'user_id', label: 'Usuário' },
      { key: 'quantity', label: 'Qtd' },
      { key: 'total_cost', label: 'Custo Total' },
      { key: 'revenue', label: 'Faturamento' },
      { key: 'profit', label: 'Lucro' },
      { key: 'status', label: 'Status' },
    ],
    trafego: [
      { key: 'date', label: 'Data' },
      { key: 'platform', label: 'Plataforma' },
      { key: 'campaign', label: 'Campanha' },
      { key: 'amount', label: 'Valor' },
    ],
  };

  const formatCell = (key: string, value: any) => {
    if (key === 'date') return new Date(value).toLocaleDateString('pt-BR');
    if (key === 'user_id') return getUserName(value);
    if (['amount', 'total_cost', 'revenue', 'profit'].includes(key)) return `R$ ${Number(value).toFixed(2)}`;
    return String(value || '-');
  };

  const exportCSV = () => {
    const cols = columns[reportType];
    const header = cols.map(c => c.label).join(',');
    const rows = filteredData.map(row =>
      cols.map(c => formatCell(c.key, (row as any)[c.key])).join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_${reportType}.csv`;
    a.click();
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    const cols = columns[reportType];
    doc.setFontSize(16);
    doc.text(`Relatório - ${reportType.charAt(0).toUpperCase() + reportType.slice(1)}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28);

    autoTable(doc, {
      startY: 35,
      head: [cols.map(c => c.label)],
      body: filteredData.map(row => cols.map(c => formatCell(c.key, (row as any)[c.key]))),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [34, 139, 87] },
    });

    doc.save(`relatorio_${reportType}.pdf`);
  };

  const reportLabels: Record<ReportType, string> = {
    vendas: 'Vendas',
    renovacoes: 'Renovações',
    creditos: 'Créditos',
    trafego: 'Tráfego Pago',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Relatórios</h1>
        <p className="text-sm text-muted-foreground">Filtros avançados e exportação</p>
      </div>

      {/* Filters */}
      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Select value={reportType} onValueChange={v => setReportType(v as ReportType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(reportLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" placeholder="De" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            <Input type="date" placeholder="Até" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            {reportType !== 'trafego' && (
              <>
                <Select value={userId} onValueChange={setUserId}>
                  <SelectTrigger><SelectValue placeholder="Todos os usuários" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    {(users || []).map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={userType} onValueChange={setUserType}>
                  <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    <SelectItem value="principal">Principal</SelectItem>
                    <SelectItem value="revenda">Revenda</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Actions & Table */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={exportCSV}>
          <Download className="w-4 h-4" /> Exportar CSV
        </Button>
        <Button variant="outline" onClick={exportPDF}>
          <FileText className="w-4 h-4" /> Exportar PDF
        </Button>
      </div>

      <Card className="border-border/50">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {columns[reportType].map(c => <TableHead key={c.key}>{c.label}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns[reportType].length} className="text-center py-8 text-muted-foreground">
                    Nenhum registro encontrado
                  </TableCell>
                </TableRow>
              ) : filteredData.map((row: any) => (
                <TableRow key={row.id}>
                  {columns[reportType].map(c => (
                    <TableCell key={c.key} className={['amount', 'total_cost', 'revenue', 'profit'].includes(c.key) ? 'font-mono' : ''}>
                      {formatCell(c.key, row[c.key])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">{filteredData.length} registros encontrados</p>
    </div>
  );
}
