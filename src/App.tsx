import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/layout/AppLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import UsersPage from "@/pages/UsersPage";
import SalesPage from "@/pages/SalesPage";
import RenewalsPage from "@/pages/RenewalsPage";
import TrafficPage from "@/pages/TrafficPage";
import CreditsPage from "@/pages/CreditsPage";
import ReportsPage from "@/pages/ReportsPage";
import ApiReportPage from "@/pages/ApiReportPage";
import ReceivablesPage from "@/pages/ReceivablesPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/usuarios" element={<UsersPage />} />
        <Route path="/vendas" element={<SalesPage />} />
        <Route path="/renovacoes" element={<RenewalsPage />} />
        <Route path="/trafego" element={<TrafficPage />} />
        <Route path="/creditos" element={<CreditsPage />} />
        <Route path="/relatorios" element={<ReportsPage />} />
        <Route path="/api-report" element={<ApiReportPage />} />
        <Route path="/recebimentos" element={<ReceivablesPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
