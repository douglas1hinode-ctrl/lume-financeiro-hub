
-- Tipos enum
CREATE TYPE public.user_type AS ENUM ('principal', 'revenda');
CREATE TYPE public.user_status AS ENUM ('ativo', 'inativo');
CREATE TYPE public.sale_type AS ENUM ('nova', 'upgrade', 'outros');
CREATE TYPE public.sale_status AS ENUM ('concluida', 'pendente', 'cancelada');
CREATE TYPE public.payment_method AS ENUM ('pix', 'cartao', 'boleto', 'transferencia', 'outros');
CREATE TYPE public.renewal_type AS ENUM ('mensal', 'trimestral', 'semestral', 'anual');
CREATE TYPE public.renewal_status AS ENUM ('ativa', 'pendente', 'vencida', 'cancelada');
CREATE TYPE public.credit_status AS ENUM ('ativo', 'pendente', 'cancelado');

-- Profiles (para auth)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Trigger para criar profile automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Usuários/Revendas
CREATE TABLE public.users_resellers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  type user_type NOT NULL DEFAULT 'principal',
  credit_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  status user_status NOT NULL DEFAULT 'ativo',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.users_resellers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage users_resellers" ON public.users_resellers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Vendas
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  client TEXT NOT NULL,
  user_id UUID REFERENCES public.users_resellers(id) ON DELETE SET NULL,
  sale_type sale_type NOT NULL DEFAULT 'nova',
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method payment_method NOT NULL DEFAULT 'pix',
  status sale_status NOT NULL DEFAULT 'concluida',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage sales" ON public.sales FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Renovações
CREATE TABLE public.renewals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  client TEXT NOT NULL,
  user_id UUID REFERENCES public.users_resellers(id) ON DELETE SET NULL,
  type renewal_type NOT NULL DEFAULT 'mensal',
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  due_date DATE,
  status renewal_status NOT NULL DEFAULT 'ativa',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.renewals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage renewals" ON public.renewals FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Gastos com tráfego pago
CREATE TABLE public.traffic_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  platform TEXT NOT NULL,
  campaign TEXT,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.traffic_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage traffic_expenses" ON public.traffic_expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Créditos
CREATE TABLE public.credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  user_id UUID REFERENCES public.users_resellers(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_cost NUMERIC(10,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  sale_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  revenue NUMERIC(10,2) GENERATED ALWAYS AS (quantity * sale_price) STORED,
  profit NUMERIC(10,2) GENERATED ALWAYS AS (quantity * (sale_price - unit_cost)) STORED,
  status credit_status NOT NULL DEFAULT 'ativo',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage credits" ON public.credits FOR ALL TO authenticated USING (true) WITH CHECK (true);
