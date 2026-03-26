import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const API_KEY = 'vkutkHDffmDmroO3_IM7WZEW8tEytCxlRqrG-vze2Xs'
    
    // Configura chamadas HTTP nativas com fetch
    const fetchApi = async (action: string, extraBody: Record<string, string> = {}) => {
      const response = await fetch("https://painel.best/api.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json"
        },
        body: new URLSearchParams({
          key: API_KEY,
          action: action,
          ...extraBody
        })
      });
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch(e) {
        console.error(`Erro ao parsear resposta da action ${action}:`, text.substring(0, 200));
        return { error: true, data: text.substring(0, 200) };
      }
    };

    console.log(`Buscando dados no TheBest...`);

    // 1. Créditos do painel principal
    const balanceRes = await fetchApi('balance');
    const myCredits = balanceRes?.credits || balanceRes?.balance || 0;

    // 2. Lista de revendas
    const resellersRes = await fetchApi('resellers');
    const resellersList = Array.isArray(resellersRes) ? resellersRes : resellersRes?.data || [];

    // Estrutura de relatório
    const report: any[] = [];
    
    // Adicionar Meu Painel (Owner)
    report.push({
      id: 'me',
      name: 'Meu Painel',
      type: 'principal',
      credits: myCredits,
      tests: 0,
      sales: 0,
      renewals: 0,
      conversion: 0
    });

    // Add resellers
    for (const r of resellersList) {
      report.push({
        id: r.id || r.username,
        name: r.username || 'Revenda',
        type: 'revenda',
        credits: r.credits || 0,
        tests: 0,
        sales: 0,
        renewals: 0,
        conversion: 0
      });
    }

    // Função para buscar e contabilizar logs
    const countLogs = async (owner_username: string | null, targetStat: any) => {
      const extraBody: any = {};
      if (owner_username) extraBody.owner_username = owner_username;
      
      const logsRes = await fetchApi('user/logs', extraBody);
      const logs = Array.isArray(logsRes) ? logsRes : logsRes?.data || [];
      
      logs.forEach((log: any) => {
        const action = String(log.action || '').toLowerCase();
        // Ações comuns dependendo da API
        if (action.includes('trial')) {
          if (action.includes('conversion')) targetStat.sales++;
          else targetStat.tests++;
        } else if (action === 'new' || action === 'create') {
          targetStat.sales++;
        } else if (action === 'extend' || action === 'renew') {
          targetStat.renewals++;
        }
      });
      if (targetStat.tests > 0) {
        targetStat.conversion = (targetStat.sales / targetStat.tests) * 100;
      }
    };

    // Obter logs para o painel principal
    await countLogs(null, report[0]);

    // Obter logs para as 5 principais revendas para evitar timeout na edge function (opcional)
    // Para simplificar e evitar timeout de 10 segundos do Deno/Supabase, limitamos as requests max:
    const topResellers = report.slice(1, 11);
    for (const res of topResellers) {
      await countLogs(res.name, res);
    }

    return new Response(JSON.stringify({
      success: true,
      data: report
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
