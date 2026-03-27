const API_URL = '/api/thebest';

export async function apiCall(body: unknown): Promise<unknown> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "sem detalhes");
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}
