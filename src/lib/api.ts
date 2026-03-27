const API_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/thebest_api`;
const API_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export async function apiCall(body: unknown): Promise<unknown> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "sem detalhes");
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}
