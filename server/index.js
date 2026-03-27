import express from 'express';

const app = express();
app.use(express.json());

const API_URL = "https://api.painel.best";
const API_KEY = process.env.THEBEST_API_KEY || "";
const REST_KEY = process.env.THEBEST_REST_KEY || API_KEY;

const fetchBest = async (endpoint) => {
  const res = await fetch(`${API_URL}${endpoint}`, {
    headers: {
      "Api-Key": REST_KEY,
      "Content-Type": "application/json"
    }
  });
  if (!res.ok) throw new Error(`REST API status: ${res.status}`);
  return res.json();
};

app.post('/api/thebest', async (req, res) => {
  const { action, ...params } = req.body || {};
  console.log(`[API] action=${action || 'undefined'}`, JSON.stringify(params));

  try {
    // ── info: usa REST API ──────────────────────────────────────────────────────
    if (action === 'info') {
      const [userRes, salesInfo, trialsInfo] = await Promise.all([
        fetchBest('/user/').catch(() => ({})),
        fetchBest('/lines/?page=1&page_size=100&is_trial=false').catch(() => ({ last_page: 0, count: 0 })),
        fetchBest('/lines/?page=1&page_size=100&is_trial=true').catch(() => ({ last_page: 0, count: 0 })),
      ]);
      const credits  = userRes?.credits  ?? 0;
      const username = userRes?.username ?? null;
      const totalSalesPages  = salesInfo.last_page  || 0;
      const totalTrialsPages = trialsInfo.last_page || 0;
      console.log(`[API] info → username=${username} credits=${credits} salesPages=${totalSalesPages} trialsPages=${totalTrialsPages}`);
      return res.json({
        master: { id: userRes?.id || null, username, credits, active_lines_count: userRes?.active_lines_count || 0, trial_lines_count: userRes?.trial_lines_count || 0, expired_lines_count: userRes?.expired_lines_count || 0, lines_count: userRes?.lines_count || 0 },
        resellers: [],
        total_trials_all_time: trialsInfo.count || 0, total_trials_pages: totalTrialsPages,
        total_sales_all_time:  salesInfo.count  || 0, total_sales_pages:  totalSalesPages,
      });
    }

    // ── fetch_sales ────────────────────────────────────────────────────────────
    if (action === 'fetch_sales') {
      const pageFrom = params.page_from || 1;
      const pageTo   = Math.min(params.page_to || pageFrom + 39, pageFrom + 39);
      const promises = [];
      for (let p = pageFrom; p <= pageTo; p++) {
        promises.push(fetchBest(`/lines/?page=${p}&page_size=100&is_trial=false`).catch(() => ({ results: [] })));
      }
      const responses = await Promise.all(promises);
      const lines = [];
      for (const r of responses) {
        for (const l of (r.results || [])) {
          lines.push({ id: l.id, uid: l.user_id, uu: l.user_username, s: l.status, c: l.created_at, w: l.updated_at, e: l.exp_date, p: l.phone || '', u: l.username });
        }
      }
      return res.json({ page_from: pageFrom, page_to: pageTo, lines, count: lines.length });
    }

    // ── fetch_trials ───────────────────────────────────────────────────────────
    if (action === 'fetch_trials') {
      const pageFrom = params.page_from || 1;
      const pageTo   = Math.min(params.page_to || pageFrom + 39, pageFrom + 39);
      const promises = [];
      for (let p = pageFrom; p <= pageTo; p++) {
        promises.push(fetchBest(`/lines/?page=${p}&page_size=100&is_trial=true`).catch(() => ({ results: [] })));
      }
      const responses = await Promise.all(promises);
      const lines = [];
      for (const r of responses) {
        for (const l of (r.results || [])) {
          lines.push({ id: l.id, uid: l.user_id, uu: l.user_username, s: l.status, c: l.created_at, p: l.phone || '', u: l.username });
        }
      }
      return res.json({ page_from: pageFrom, page_to: pageTo, lines, count: lines.length });
    }

    // ── fetch_conversion_logs ──────────────────────────────────────────────────
    if (action === 'fetch_conversion_logs') {
      const page = params.page || 1;
      const r = await fetchBest(`/user/logs/?action=trial-conversion&page=${page}&page_size=100`).catch(() => ({ results: [], last_page: 1 }));
      return res.json({ page, last_page: r.last_page || 1, results: r.results || [] });
    }

    // ── fetch_extend_logs ──────────────────────────────────────────────────────
    if (action === 'fetch_extend_logs') {
      const page = params.page || 1;
      const r = await fetchBest(`/user/logs/?action=extend&page=${page}&page_size=100`).catch(() => ({ results: [], last_page: 1 }));
      return res.json({ page, last_page: r.last_page || 1, results: r.results || [] });
    }

    // ── count_renewals ─────────────────────────────────────────────────────────
    if (action === 'count_renewals') {
      const planDays  = params.plan_days || 29;
      const firstPage = await fetchBest('/lines/?page=1&page_size=100&is_trial=false');
      const totalPages = firstPage.last_page || 1;
      const allLines  = [...(firstPage.results || [])];
      const BATCH = 10;
      for (let from = 2; from <= totalPages; from += BATCH) {
        const to = Math.min(from + BATCH - 1, totalPages);
        const batch = [];
        for (let p = from; p <= to; p++) batch.push(fetchBest(`/lines/?page=${p}&page_size=100&is_trial=false`).catch(() => ({ results: [] })));
        for (const r of await Promise.all(batch)) if (r.results?.length) allLines.push(...r.results);
      }
      let totalRenewals = 0;
      const renewalsByOwner = {};
      const uniquePhones   = new Set();
      for (const l of allLines) {
        if (!l.exp_date || !l.created_at) continue;
        const phone = l.phone || l.username;
        if (phone) uniquePhones.add(phone);
        const numRen = Math.max(0, Math.floor(Math.round((l.exp_date - l.created_at) / 86400) / planDays) - 1);
        if (numRen > 0) {
          totalRenewals += numRen;
          const owner = l.user_username || 'unknown';
          renewalsByOwner[owner] = (renewalsByOwner[owner] || 0) + numRen;
        }
      }
      return res.json({
        plan_days: planDays, total_renewals: totalRenewals,
        total_sales: allLines.length, unique_clients: uniquePhones.size,
        renewals_by_owner: Object.entries(renewalsByOwner).sort((a, b) => b[1] - a[1]).map(([owner, count]) => ({ owner, count })),
      });
    }

    // ── logs ───────────────────────────────────────────────────────────────────
    if (action === 'logs') {
      const page     = params.page || 1;
      const pageSize = params.page_size || 100;
      const [logsRes, overviewRes] = await Promise.all([
        fetchBest(`/user/logs/?page=${page}&page_size=${pageSize}`).catch(e => ({ error: e.message })),
        fetchBest('/apps/overview/').catch(e => ({ error: e.message })),
      ]);
      return res.json({ logs: logsRes, overview: overviewRes });
    }

    // ── rank_report ────────────────────────────────────────────────────────────
    if (action === 'rank_report') {
      const dateStr  = params.date || new Date().toISOString().split('T')[0];
      const dayStart = Math.floor(new Date(dateStr + 'T00:00:00-03:00').getTime() / 1000);
      const dayEnd   = dayStart + 86400 - 1;

      const salesByOwner = {};
      let salesPage = 1, salesDone = false;
      while (!salesDone) {
        const logRes = await fetchBest(`/user/logs/?action=trial-conversion&page=${salesPage}&page_size=100`).catch(() => ({ results: [], last_page: 1 }));
        const rows = logRes.results || [];
        if (!rows.length) { salesDone = true; break; }
        let foundOlder = false;
        for (const log of rows) {
          const ts = log.created_at || log.date || 0;
          if (ts < dayStart) foundOlder = true;
          if (ts >= dayStart && ts <= dayEnd) { const o = log.user_username || 'Unknown'; salesByOwner[o] = (salesByOwner[o] || 0) + 1; }
        }
        if (foundOlder || salesPage >= (logRes.last_page || 1)) salesDone = true;
        salesPage++;
      }

      const testsByOwner = {};
      const trialsInfo   = await fetchBest('/lines/?page=1&page_size=100&is_trial=true').catch(() => ({ last_page: 1, results: [] }));
      const trialPages   = trialsInfo.last_page || 1;
      const BATCH = 20;
      for (let from = 1; from <= trialPages; from += BATCH) {
        const to = Math.min(from + BATCH - 1, trialPages);
        const batch = [];
        for (let p = from; p <= to; p++) batch.push(fetchBest(`/lines/?page=${p}&page_size=100&is_trial=true`).catch(() => ({ results: [] })));
        for (const r of await Promise.all(batch)) {
          for (const l of (r.results || [])) {
            if (l.created_at >= dayStart && l.created_at <= dayEnd) { const o = l.user_username || 'Unknown'; testsByOwner[o] = (testsByOwner[o] || 0) + 1; }
          }
        }
      }

      const renewsByOwner = {};
      const salesInfo  = await fetchBest('/lines/?page=1&page_size=100&is_trial=false').catch(() => ({ last_page: 1, results: [] }));
      const salesPages = salesInfo.last_page || 1;
      for (let from = 1; from <= salesPages; from += BATCH) {
        const to = Math.min(from + BATCH - 1, salesPages);
        const batch = [];
        for (let p = from; p <= to; p++) batch.push(fetchBest(`/lines/?page=${p}&page_size=100&is_trial=false`).catch(() => ({ results: [] })));
        for (const r of await Promise.all(batch)) {
          for (const l of (r.results || [])) {
            const upd = l.updated_at, cre = l.created_at;
            if (upd >= dayStart && upd <= dayEnd && cre && (upd - cre) > 2 * 86400) { const o = l.user_username || 'Unknown'; renewsByOwner[o] = (renewsByOwner[o] || 0) + 1; }
          }
        }
      }

      const allOwners = new Set([...Object.keys(salesByOwner), ...Object.keys(testsByOwner), ...Object.keys(renewsByOwner)]);
      const rankRows  = Array.from(allOwners).map(owner => {
        const tests = testsByOwner[owner] || 0, sales = salesByOwner[owner] || 0, renew = renewsByOwner[owner] || 0;
        return { owner, tests, sales, renewals: renew, conversion: tests > 0 ? Math.round((sales / tests) * 1000) / 10 : 0 };
      }).sort((a, b) => b.sales - a.sales);
      const totals = rankRows.reduce((acc, r) => ({ tests: acc.tests + r.tests, sales: acc.sales + r.sales, renewals: acc.renewals + r.renewals }), { tests: 0, sales: 0, renewals: 0 });
      return res.json({ date: dateStr, rows: rankRows, totals });
    }

    console.warn(`[API] Ação desconhecida: ${action}`);
    return res.status(400).json({ error: `Ação desconhecida: ${action}` });

  } catch (err) {
    console.error(`[API] ERRO action=${action}:`, err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => console.log(`[API] Servidor rodando na porta 3001 (THEBEST_API_KEY: ${API_KEY ? 'configurada' : 'NÃO configurada'})`));
