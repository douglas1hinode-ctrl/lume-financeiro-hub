import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

const API_URL = "https://api.painel.best"
const API_KEY = "vkutkHDffmDmroO3_IM7WZEW8tEytCxlRqrG-vze2Xs"

serve(async (req: Request) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE"
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers })
  }

  try {
    const fetchBest = async (endpoint: string) => {
      const res = await fetch(`${API_URL}${endpoint}`, {
        headers: { "Api-Key": API_KEY, "Content-Type": "application/json" }
      })
      if (!res.ok) throw new Error(`API status: ${res.status}`)
      return await res.json()
    }

    const reqData = await req.json().catch(() => ({}));
    const action = reqData.action || 'report';

    // =============================================
    // ACTION: info — Metadados rápidos do master e resellers + contagens exatas da API
    // =============================================
    if (action === 'info') {
      const [userRes, resellersRes, trialsPage, salesPage] = await Promise.all([
        fetchBest('/user/'),
        fetchBest('/resellers/?page_size=100'),
        fetchBest('/lines/?page=1&page_size=1&is_trial=true'),   // Só pra pegar .count
        fetchBest('/lines/?page=1&page_size=1&is_trial=false'),  // Só pra pegar .count
      ]);

      const resellers = resellersRes.results || [];
      
      // Pegar detalhes exatos de cada revendedor
      const detailsPromises = resellers.map((r: any) => fetchBest(`/resellers/${r.id}`).catch(() => null));
      const details = await Promise.all(detailsPromises);
      
      const enrichedResellers = resellers.map((r: any) => {
        const d = details.find((det: any) => det && det.id === r.id);
        return {
          id: r.id,              // ID da entidade reseller
          user_id: d?.user_id || r.user_id || r.user || null,  // ID do USUÁRIO (= line.user_id)
          username: r.username,
          credits: r.credits,
          active_lines_count: d?.active_lines_count || 0,
          trial_lines_count: d?.trial_lines_count || 0,
        };
      });

      return new Response(JSON.stringify({
        master: {
          id: userRes.id,
          username: userRes.username,
          credits: userRes.credits,
          active_lines_count: userRes.active_lines_count,
          trial_lines_count: userRes.trial_lines_count,
          expired_lines_count: userRes.expired_lines_count,
          lines_count: userRes.lines_count,
        },
        resellers: enrichedResellers,
        // Contagens EXATAS da API
        total_trials_all_time: trialsPage.count || 0,
        total_trials_pages: trialsPage.last_page || 0,
        total_sales_all_time: salesPage.count || 0,
        total_sales_pages: salesPage.last_page || 0,
      }), { headers });
    }

    // =============================================
    // ACTION: fetch_sales — Busca um bloco de linhas NÃO-TRIAL (vendas reais)
    // Usa o filtro is_trial=false para reduzir de 332 para 69 páginas!
    // =============================================
    if (action === 'fetch_sales') {
      const pageFrom = reqData.page_from || 1;
      const pageTo = Math.min(reqData.page_to || pageFrom + 39, pageFrom + 39);
      
      const promises = [];
      for (let p = pageFrom; p <= pageTo; p++) {
        promises.push(
          fetchBest(`/lines/?page=${p}&page_size=100&is_trial=false`).catch(() => ({ results: [] }))
        );
      }
      
      const responses = await Promise.all(promises);
      const allResults: any[] = [];
      
      for (const res of responses) {
        if (res?.results?.length > 0) {
          for (const line of res.results) {
            allResults.push({
              id: line.id,
              uid: line.user_id,
              uu: line.user_username,
              s: line.status,
              c: line.created_at,
              w: line.updated_at,   // updated_at — essencial pra detectar renovações in-place
              e: line.exp_date,
              p: line.phone || '',
              u: line.username,
            });
          }
        }
      }
      
      return new Response(JSON.stringify({
        page_from: pageFrom,
        page_to: pageTo,
        lines: allResults,
        count: allResults.length,
      }), { headers });
    }

    // =============================================
    // ACTION: fetch_trials — Busca um bloco de linhas TRIAL (testes)
    // =============================================
    if (action === 'fetch_trials') {
      const pageFrom = reqData.page_from || 1;
      const pageTo = Math.min(reqData.page_to || pageFrom + 39, pageFrom + 39);
      
      const promises = [];
      for (let p = pageFrom; p <= pageTo; p++) {
        promises.push(
          fetchBest(`/lines/?page=${p}&page_size=100&is_trial=true`).catch(() => ({ results: [] }))
        );
      }
      
      const responses = await Promise.all(promises);
      const allResults: any[] = [];
      
      for (const res of responses) {
        if (res?.results?.length > 0) {
          for (const line of res.results) {
            allResults.push({
              id: line.id,
              uid: line.user_id,
              uu: line.user_username,
              s: line.status,
              c: line.created_at,
              p: line.phone || '',
              u: line.username,
            });
          }
        }
      }
      
      return new Response(JSON.stringify({
        page_from: pageFrom,
        page_to: pageTo,
        lines: allResults,
        count: allResults.length,
      }), { headers });
    }
    // =============================================
    // ACTION: fetch_conversion_logs — Uma página de logs trial-conversion
    // =============================================
    if (action === 'fetch_conversion_logs') {
      const page = reqData.page || 1;
      const res = await fetchBest(`/user/logs/?action=trial-conversion&page=${page}&page_size=100`).catch(() => ({ results: [], last_page: 1 }));
      return new Response(JSON.stringify({
        page,
        last_page: res.last_page || 1,
        results: res.results || [],
      }), { headers });
    }

    // =============================================
    // ACTION: fetch_extend_logs — Uma página de logs de renovação (extend)
    // =============================================
    if (action === 'fetch_extend_logs') {
      const page = reqData.page || 1;
      const res = await fetchBest(`/user/logs/?action=extend&page=${page}&page_size=100`).catch(() => ({ results: [], last_page: 1 }));
      return new Response(JSON.stringify({
        page,
        last_page: res.last_page || 1,
        results: res.results || [],
      }), { headers });
    }

    // =============================================
    // ACTION: count_renewals — Busca TODAS as vendas e computa renovações server-side
    // Retorna número exato de renovações, sem necessidade de calcular no frontend
    // =============================================
    if (action === 'count_renewals') {
      const planDays = reqData.plan_days || 29; // padrão 29 dias
      const PLAN_SEC = planDays * 86400;

      // Step 1: get total pages
      const firstPage = await fetchBest('/lines/?page=1&page_size=100&is_trial=false');
      const totalPages = firstPage.last_page || 69;

      // Step 2: fetch all pages (sequential batches of 10 to avoid timeouts)
      const allLines: any[] = [...(firstPage.results || [])];
      const BATCH = 10;
      for (let from = 2; from <= totalPages; from += BATCH) {
        const to = Math.min(from + BATCH - 1, totalPages);
        const batch = [];
        for (let p = from; p <= to; p++) {
          batch.push(fetchBest(`/lines/?page=${p}&page_size=100&is_trial=false`).catch(() => ({ results: [] })));
        }
        const results = await Promise.all(batch);
        for (const r of results) {
          if (r?.results?.length) allLines.push(...r.results);
        }
      }

      // Step 3: count renewals per line using cycle math
      let totalRenewals = 0;
      const renewalsByOwner: Record<string, number> = {};
      const uniquePhones = new Set<string>();

      for (const line of allLines) {
        if (!line.exp_date || !line.created_at) continue;
        const phone = line.phone || line.username;
        if (phone) uniquePhones.add(phone);

        const totalDays = Math.round((line.exp_date - line.created_at) / 86400);
        const numRen = Math.max(0, Math.floor(totalDays / planDays) - 1);
        if (numRen > 0) {
          totalRenewals += numRen;
          const owner = line.user_username || 'unknown';
          renewalsByOwner[owner] = (renewalsByOwner[owner] || 0) + numRen;
        }
      }

      return new Response(JSON.stringify({
        plan_days: planDays,
        total_renewals: totalRenewals,
        total_sales: allLines.length,
        unique_clients: uniquePhones.size,
        renewals_by_owner: Object.entries(renewalsByOwner)
          .sort((a, b) => b[1] - a[1])
          .map(([owner, count]) => ({ owner, count })),
      }), { headers });
    }

    // =============================================
    // ACTION: logs — Busca logs de atividade e overview
    // =============================================
    if (action === 'logs') {
      const page = reqData.page || 1;
      const pageSize = reqData.page_size || 100;
      const [logsRes, overviewRes] = await Promise.all([
        fetchBest(`/user/logs/?page=${page}&page_size=${pageSize}`).catch((e: any) => ({ error: e.message })),
        fetchBest('/apps/overview/').catch((e: any) => ({ error: e.message })),
      ]);
      return new Response(JSON.stringify({ logs: logsRes, overview: overviewRes }), { headers });
    }

    // =============================================
    // ACTION: rank_report — Relatório exato por revendedor
    // Vendas: /user/logs/?action=trial-conversion (eventos reais)
    // Testes: /lines/?is_trial=true onde created_at no período
    // Renovações: /lines/?is_trial=false onde updated_at no período e updated_at > created_at + 2 dias
    // =============================================
    if (action === 'rank_report') {
      const dateStr: string = reqData.date || new Date().toISOString().split('T')[0];
      // Calcular início e fim do dia em Unix (UTC-3 = BRT)
      const BRT_OFFSET = 3 * 3600;
      const dayStart = Math.floor(new Date(dateStr + 'T00:00:00-03:00').getTime() / 1000);
      const dayEnd   = dayStart + 86400 - 1;

      // --- 1. Vendas reais via logs de conversão ---
      const salesByOwner: Record<string, number> = {};
      let salesPage = 1;
      let salesDone = false;
      while (!salesDone) {
        const logRes = await fetchBest(`/user/logs/?action=trial-conversion&page=${salesPage}&page_size=100`).catch(() => ({ results: [], last_page: 1 }));
        const rows = logRes.results || [];
        if (rows.length === 0) { salesDone = true; break; }
        let foundOlder = false;
        for (const log of rows) {
          const ts = log.created_at || log.date || 0;
          if (ts < dayStart) { foundOlder = true; }
          if (ts >= dayStart && ts <= dayEnd) {
            const owner = log.user_username || log.reseller || 'Unknown';
            salesByOwner[owner] = (salesByOwner[owner] || 0) + 1;
          }
        }
        if (foundOlder || salesPage >= (logRes.last_page || 1)) salesDone = true;
        salesPage++;
      }

      // --- 2. Testes via /lines/?is_trial=true criados no dia ---
      const testsByOwner: Record<string, number> = {};
      const trialsInfo = await fetchBest('/lines/?page=1&page_size=100&is_trial=true').catch(() => ({ last_page: 1, results: [] }));
      const trialPages = trialsInfo.last_page || 1;
      const BATCH = 20;
      for (let from = 1; from <= trialPages; from += BATCH) {
        const to = Math.min(from + BATCH - 1, trialPages);
        const batch = [];
        for (let p = from; p <= to; p++) {
          batch.push(fetchBest(`/lines/?page=${p}&page_size=100&is_trial=true`).catch(() => ({ results: [] })));
        }
        const results = await Promise.all(batch);
        for (const r of results) {
          for (const line of (r.results || [])) {
            if (line.created_at >= dayStart && line.created_at <= dayEnd) {
              const owner = line.user_username || 'Unknown';
              testsByOwner[owner] = (testsByOwner[owner] || 0) + 1;
            }
          }
        }
      }

      // --- 3. Renovações via /lines/?is_trial=false onde updated_at no dia ---
      const renewsByOwner: Record<string, number> = {};
      const salesInfo = await fetchBest('/lines/?page=1&page_size=100&is_trial=false').catch(() => ({ last_page: 1, results: [] }));
      const salesPages = salesInfo.last_page || 1;
      for (let from = 1; from <= salesPages; from += BATCH) {
        const to = Math.min(from + BATCH - 1, salesPages);
        const batch = [];
        for (let p = from; p <= to; p++) {
          batch.push(fetchBest(`/lines/?page=${p}&page_size=100&is_trial=false`).catch(() => ({ results: [] })));
        }
        const results = await Promise.all(batch);
        for (const r of results) {
          for (const line of (r.results || [])) {
            const upd = line.updated_at;
            const cre = line.created_at;
            // Renovação = updated_at no dia E atualizado antes do dia de hoje (delta > 2 dias)
            if (upd >= dayStart && upd <= dayEnd && cre && (upd - cre) > 2 * 86400) {
              const owner = line.user_username || 'Unknown';
              renewsByOwner[owner] = (renewsByOwner[owner] || 0) + 1;
            }
          }
        }
      }

      // --- Montar tabela final ---
      const allOwners = new Set([...Object.keys(salesByOwner), ...Object.keys(testsByOwner), ...Object.keys(renewsByOwner)]);
      const rows = Array.from(allOwners).map((owner) => {
        const tests = testsByOwner[owner] || 0;
        const sales = salesByOwner[owner] || 0;
        const renew = renewsByOwner[owner] || 0;
        const conv  = tests > 0 ? Math.round((sales / tests) * 1000) / 10 : 0;
        return { owner, tests, sales, renewals: renew, conversion: conv };
      }).sort((a, b) => b.sales - a.sales);

      const totals = rows.reduce((acc, r) => ({
        tests: acc.tests + r.tests,
        sales: acc.sales + r.sales,
        renewals: acc.renewals + r.renewals,
      }), { tests: 0, sales: 0, renewals: 0 });

      return new Response(JSON.stringify({ date: dateStr, rows, totals }), { headers });
    }

    // Fallback
    return new Response(JSON.stringify({ error: 'Ação desconhecida: ' + action }), { headers, status: 400 });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { headers, status: 500 })
  }
})