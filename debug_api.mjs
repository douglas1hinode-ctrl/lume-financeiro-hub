const URL = 'https://xomtkhmzywultserohhc.supabase.co/functions/v1/thebest_api';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhvbXRraG16eXd1bHRzZXJvaGhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMDM5NjEsImV4cCI6MjA4ODY3OTk2MX0.U4a0HkI4yA8AYxpiKBgoud2ER6iNCtq1E52ZJk_7pms';
const call = (body) => fetch(URL, {method:'POST', headers:{Authorization:'Bearer '+KEY,'Content-Type':'application/json'}, body: JSON.stringify(body)}).then(r=>r.json());

const t0 = Date.now();
const s40 = await call({action:'fetch_sales', page_from:1, page_to:40});
console.log(`fetch_sales 1-40: lines=${s40.lines?.length} time=${Date.now()-t0}ms`);

const t1 = Date.now();
const t8 = await call({action:'fetch_trials', page_from:1, page_to:40});
console.log(`fetch_trials 1-40: lines=${t8.lines?.length} time=${Date.now()-t1}ms`);
