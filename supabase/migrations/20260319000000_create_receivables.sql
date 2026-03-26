-- Criação da tabela receivables para controle de custos a receber
CREATE TABLE IF NOT EXISTS public.receivables (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date date NOT NULL,
  reseller text NOT NULL,
  description text DEFAULT '',
  type text NOT NULL CHECK (type IN ('debit', 'credit')),
  amount numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.receivables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated"
  ON public.receivables
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
