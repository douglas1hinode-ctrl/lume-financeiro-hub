import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignUp) {
        await signUp(email, password, fullName);
        toast({ title: 'Conta criada!', description: 'Verifique seu email para confirmar.' });
      } else {
        await signIn(email, password);
      }
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border/50 shadow-2xl">
        <CardHeader className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-2">
            <span className="text-primary-foreground font-bold text-2xl">F</span>
          </div>
          <CardTitle className="text-2xl font-bold">FinDash</CardTitle>
          <CardDescription>
            {isSignUp ? 'Crie sua conta administrativa' : 'Acesse o painel de gestão'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <Input
                placeholder="Nome completo"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            )}
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSignUp ? 'Criar conta' : 'Entrar'}
            </Button>
          </form>
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="mt-4 text-sm text-muted-foreground hover:text-foreground w-full text-center transition-colors"
          >
            {isSignUp ? 'Já tem conta? Entrar' : 'Não tem conta? Criar'}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
