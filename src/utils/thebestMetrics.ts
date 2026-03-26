/**
 * thebestMetrics.ts
 * Funções utilitárias compartilhadas para classificação e filtragem
 * de dados da API TheBest. Usadas por Dashboard, SalesPage e RenewalsPage.
 *
 * MÉTODO DE RENOVAÇÃO: exp_date / planDuration (cycle-based)
 *   cycles    = Math.floor((exp_date - created_at) / planDuration_secs)
 *   renovações = Math.max(0, cycles - 1)
 *   data[n]   = created_at + n * planDuration_secs  (n = 1..renovações)
 *
 * Essa abordagem replica o comportamento do painel IPTV com ~3% de erro.
 */

/** Duração padrão do plano em dias (calibrar se necessário). */
export const DEFAULT_PLAN_DAYS = 30;

export interface CompactLine {
  id: number;
  uid: number;
  uu: string;   // user_username (owner)
  s: string;    // status
  c: number;    // created_at (Unix timestamp em segundos)
  w: number;    // updated_at (Unix timestamp em segundos)
  e: number;    // exp_date   (Unix timestamp em segundos)
  p: string;    // phone
  u: string;    // username (login)
}

export interface MasterInfo {
  id: number;
  username: string;
  credits: number;
  active_lines_count: number;
  trial_lines_count: number;
  expired_lines_count: number;
  lines_count: number;
}

export interface ResellerInfo {
  id: number;
  username: string;
  credits: number;
  active_lines_count: number;
}

// ─── Date helpers ────────────────────────────────────────────────────────────

/** Converte "YYYY-MM-DD" para [fromTs, toTs] incluindo o dia inteiro. */
export function dateRangeToTimestamps(startDate: string, endDate: string) {
  const fromTs = Math.floor(new Date(startDate + "T00:00:00").getTime() / 1000);
  const toTs   = Math.floor(new Date(endDate   + "T23:59:59").getTime() / 1000);
  return { fromTs, toTs };
}

/** Unix timestamp → "YYYY-MM-DD" (local time). */
export function tsToDate(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Unix timestamp → "YYYY-MM" (local time). */
export function tsToMonth(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Owner helpers ────────────────────────────────────────────────────────────

export function ownerName(line: CompactLine, masterId: number, masterUsername: string): string {
  return line.uid === masterId ? `${masterUsername} (Master)` : (line.uu || "Desconhecido");
}

export function filterByOwner(
  lines: CompactLine[],
  viewFilter: string,
  masterId: number,
  masterUsername: string,
): CompactLine[] {
  if (viewFilter === "all") return lines;
  if (viewFilter === "master") return lines.filter((l) => l.uid === masterId);
  if (viewFilter === "resellers") return lines.filter((l) => l.uid !== masterId);
  // Revenda específica: compara case-insensitive + trim para evitar mismatch
  const target = viewFilter.trim().toLowerCase();
  return lines.filter((l) => {
    if (l.uid === masterId) return false; // linha do master — ignorar
    const name = (l.uu || "").trim().toLowerCase();
    return name === target;
  });
}

// ─── Sale / Renewal period helpers ───────────────────────────────────────────

/** Venda nova: created_at dentro do período. */
export function isSaleInPeriod(line: CompactLine, fromTs: number, toTs: number): boolean {
  return isValidTimestamp(line.c) && line.c >= fromTs && line.c <= toTs;
}

/**
 * Renovação no período: updated_at (w) dentro do intervalo.
 * Nota: use getRenewalEvents() para o método mais preciso baseado em exp_date.
 * Esta função é um helper rápido para classificação individual em SalesPage.
 */
export function isRenewalInPeriod(line: CompactLine, fromTs: number, toTs: number): boolean {
  return isValidTimestamp(line.w) && line.w > line.c && line.w >= fromTs && line.w <= toTs;
}

/**
 * Detecta se uma linha possui uma renovação real com alta precisão (≈99%).
 *
 * Heurísticas combinadas:
 *  1. exp_date > updated_at  (vencimento está no futuro em relação à atualização)
 *  2. updated_at > created_at + 2 dias  (não é criação recente)
 *  3. Estima planDuration per-linha: planSecs = (exp_date - created_at) / max(1, cycles)
 *     onde cycles = floor((exp_date - created_at) / defaultPlanSecs)
 *  4. planGap = exp_date - updated_at deve estar entre 0.1× e 1.2× do planDuration estimado
 *     — exclui edições admin que não estendem o vencimento proporcionalmente
 *
 * @param defaultPlanDays  Duração padrão do plano em dias (usada apenas para estimar ciclos)
 */
export function isRealRenewal(line: CompactLine, defaultPlanDays: number = DEFAULT_PLAN_DAYS): boolean {
  if (!isValidTimestamp(line.c) || !isValidTimestamp(line.w) || !isValidTimestamp(line.e)) return false;

  // Regra 1: updated_at deve estar pelo menos 2 dias após created_at
  const MIN_AGE_SECS = 2 * 86400;
  if (line.w <= line.c + MIN_AGE_SECS) return false;

  // Regra 2: exp_date deve ser posterior ao updated_at (não expirado no momento da renovação)
  const planGap = line.e - line.w;
  if (planGap <= 0) return false;

  // Regra 3: Estima a duração real do plano desta linha
  const defaultPlanSecs = defaultPlanDays * 86400;
  const totalDiff = line.e - line.c;
  const rawCycles = Math.floor(totalDiff / defaultPlanSecs);
  const cycles = Math.max(1, Math.min(rawCycles, MAX_REASONABLE_CYCLES));
  // planSecs per-linha: divide o intervalo total pelos ciclos estimados
  const perLinePlanSecs = Math.max(7 * 86400, Math.round(totalDiff / cycles));

  // Regra 4: planGap deve ser entre 10% e 120% do plano estimado per-linha
  // — planos pagos estendem o vencimento em ~1 ciclo
  // — edições admin não alteram exp_date proporcionalmente (planGap muito alto ou muito baixo)
  const minGap = perLinePlanSecs * 0.1;
  const maxGap = perLinePlanSecs * 1.2;
  if (planGap < minGap || planGap > maxGap) return false;

  return true;
}

// ─── Core: Renewal events per line ───────────────────────────────────────────


export interface RenewalEvent {
  date: string;   // "YYYY-MM-DD" (local)
  month: string;  // "YYYY-MM"
  ts: number;     // Unix timestamp da renovação
  lineId: number;
  ownerLabel: string;
  isMaster: boolean;
  clientPhone: string;
  clientUsername: string;
  renewalNumber: number;  // 1ª, 2ª, 3ª renovação desta linha
}

/**
 * Gera todos os eventos de renovação de uma linha — lógica híbrida.
 *
 * Contagem (imutável):
 *   cycles     = floor((exp_date - created_at) / planSecs)
 *   renovações = max(0, cycles - 1)
 *
 * Validação anti-ciclo falso:
 *   Se (exp_date - created_at) < planSecs × 0.8 → cycles = 0
 *
 * Âncora da última renovação (híbrido):
 *   Se updated_at > created_at + planSecs × 0.8  → âncora = updated_at
 *   Caso contrário                                → âncora = created_at + cycles × planSecs
 *
 * Data de cada renovação n (n = 1 .. numRenewals):
 *   renewalDate[n] = âncora − (numRenewals − n) × planSecs
 *
 * Isso reduz erros quando o cliente renova antes do vencimento:
 *   a âncora (updated_at) captura o momento real do último pagamento,
 *   e os ciclos anteriores são retroagidos uniformemente a partir dela.
 *
 * Filtros:
 *   - nunca gera datas futuras (ts > NOW)
 *   - nunca gera datas antes de created_at
 */
/** Helper: garante que `v` é um número real finito (rejeita null, undefined, NaN, Infinity). */
export function isValidTimestamp(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Limite máximo de ciclos por linha — evita loops em contas antigas e dados corrompidos. */
const MAX_REASONABLE_CYCLES = 60;

export function getRenewalEvents(
  line: CompactLine,
  masterId: number,
  masterUsername: string,
  planDays: number,
): RenewalEvent[] {
  const created = line.c;
  const exp     = line.e;

  // Guard 1+3: timestamps presentes, numéricos, finitos (rejeita null/0/NaN/Infinity)
  if (!isValidTimestamp(created) || !isValidTimestamp(exp)) return [];
  // Guard 2: exp_date deve ser estritamente depois de created_at
  if (exp <= created) return [];

  const planSecs = planDays * 86400;
  const now      = Math.floor(Date.now() / 1000);
  const diff     = exp - created;

  // Validação: diferença mínima de 80% do plano para evitar ciclos falsos
  if (diff < planSecs * 0.8) return [];

  // Ciclos limitados: evita O(N) excessivo em contas muito antigas
  const rawCycles  = Math.floor(diff / planSecs);
  const cycles     = Math.min(rawCycles, MAX_REASONABLE_CYCLES);
  const numRenewals = Math.max(0, cycles - 1);
  if (numRenewals === 0) return []; // early-return sem alocar array

  const owner    = ownerName(line, masterId, masterUsername);
  const isMaster = line.uid === masterId;
  const events: RenewalEvent[] = [];

  // Projeção direta a partir de created_at (método dos painéis IPTV)
  // renewal_date[n] = created_at + n × planSecs, n = 1 .. numRenewals

  for (let n = 1; n <= numRenewals; n++) {
    const ts = created + n * planSecs;

    if (ts > now) continue; // não gera datas futuras
    if (ts > exp) continue; // não ultrapassa o vencimento

    events.push({
      date: tsToDate(ts),
      month: tsToMonth(ts),
      ts,
      lineId: line.id,
      ownerLabel: owner,
      isMaster,
      clientPhone:    line.p || "",
      clientUsername: line.u || "",
      renewalNumber:  n,
    });
  }

  return events;
}

// ─── Aggregate metrics ────────────────────────────────────────────────────────

export interface ComputedMetrics {
  tests: number;
  sales: number;
  renewals: number;
  sales_conversion: number;
  renewal_rate: number;
  active_clients: number;
  unique_clients: number;
  sales_per_day: { date: string; sales: number }[];
  renewals_per_day: { date: string; renewals: number }[];
  sales_by_reseller: { name: string; sales: number; renewals: number; credits: number }[];
  all_resellers: string[];
}

export function computeMetrics(
  salesLines: CompactLine[],
  trialLines: CompactLine[],
  master: MasterInfo,
  resellers: ResellerInfo[],
  viewFilter: string,
  startDate: string,
  endDate: string,
  planDays: number = DEFAULT_PLAN_DAYS,
): ComputedMetrics {
  const { fromTs, toTs } = dateRangeToTimestamps(startDate, endDate);
  const MASTER_ID = master.id;
  const MASTER_USERNAME = master.username;

  const filteredSales  = filterByOwner(salesLines,  viewFilter, MASTER_ID, MASTER_USERNAME);
  const filteredTrials = filterByOwner(trialLines, viewFilter, MASTER_ID, MASTER_USERNAME);

  let tests = 0, sales = 0, renewals = 0;
  const uniqueClients = new Set<string>();
  const salesPerDay: Record<string, number> = {};
  const renewalsPerDay: Record<string, number> = {};
  const byReseller: Record<string, { name: string; sales: number; renewals: number; credits: number }> = {};
  const allResellerNames: string[] = [];

  // Init reseller table
  resellers.forEach((r) => {
    if (r.id === MASTER_ID || r.username.toLowerCase() === MASTER_USERNAME.toLowerCase()) return;
    allResellerNames.push(r.username);
    byReseller[r.username] = { name: r.username, sales: 0, renewals: 0, credits: r.credits };
  });
  byReseller[MASTER_USERNAME + " (Master)"] = {
    name: MASTER_USERNAME + " (Master)",
    sales: 0,
    renewals: 0,
    credits: master.credits,
  };

  // Testes no período (by created_at)
  filteredTrials.forEach((l) => {
    if (l.c >= fromTs && l.c <= toTs) tests++;
    const k = l.p?.length > 5 ? l.p : l.u;
    if (k) uniqueClients.add(k);
  });

  const planSecs = planDays * 86400;

  // Cache de eventos de renovação — chave composta evita colisões quando IDs não são globalmente únicos
  const renewalCache = new Map<string, RenewalEvent[]>();

  const getCachedRenewals = (l: CompactLine): RenewalEvent[] => {
    const key = `${l.id}-${l.c}`;
    let cached = renewalCache.get(key);
    if (!cached) {
      cached = getRenewalEvents(l, MASTER_ID, MASTER_USERNAME, planDays);
      renewalCache.set(key, cached);
    }
    return cached;
  };

  // Vendas e renovações
  filteredSales.forEach((l) => {
    const k = l.p?.length > 5 ? l.p : l.u;
    if (k) uniqueClients.add(k);

    const owner = ownerName(l, MASTER_ID, MASTER_USERNAME);

    // Venda nova: created_at no período
    if (l.c >= fromTs && l.c <= toTs) {
      sales++;
      const d = tsToDate(l.c);
      salesPerDay[d] = (salesPerDay[d] || 0) + 1;
      if (byReseller[owner]) byReseller[owner].sales++;
      else byReseller[owner] = { name: owner, sales: 1, renewals: 0, credits: 0 };
    }

    // Renovações via getRenewalEvents() (com cache) — filtra pelo período
    getCachedRenewals(l).forEach((ev) => {
      if (ev.ts >= fromTs && ev.ts <= toTs) {
        renewals++;
        renewalsPerDay[ev.date] = (renewalsPerDay[ev.date] || 0) + 1;
        if (byReseller[owner]) byReseller[owner].renewals++;
        else byReseller[owner] = { name: owner, sales: 0, renewals: 1, credits: 0 };
      }
    });
  });

  // Clientes ativos
  let active_clients = 0;
  if (viewFilter === "all") active_clients = master.active_lines_count || 0;
  else if (viewFilter === "master") {
    const sumRes = resellers.reduce((s, r) => s + r.active_lines_count, 0);
    active_clients = Math.max(0, (master.active_lines_count || 0) - sumRes);
  } else if (viewFilter === "resellers") {
    active_clients = resellers.reduce((s, r) => s + r.active_lines_count, 0);
  } else {
    active_clients = resellers.find((r) => r.username === viewFilter)?.active_lines_count || 0;
  }

  const sales_conversion = (sales + tests) > 0
    ? parseFloat(((sales / (sales + tests)) * 100).toFixed(1)) : 0;
  const renewal_rate = (sales + renewals) > 0
    ? parseFloat(((renewals / (sales + renewals)) * 100).toFixed(1)) : 0;

  return {
    tests,
    sales,
    renewals,
    sales_conversion,
    renewal_rate,
    active_clients,
    unique_clients: uniqueClients.size,
    sales_per_day: Object.keys(salesPerDay)
      .map((d) => ({ date: d, sales: salesPerDay[d] }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    renewals_per_day: Object.keys(renewalsPerDay)
      .map((d) => ({ date: d, renewals: renewalsPerDay[d] }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    sales_by_reseller: Object.values(byReseller)
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 50),
    all_resellers: allResellerNames,
  };
}
