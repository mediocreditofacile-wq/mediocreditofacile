export const prerender = false;

export async function POST({ request }: { request: Request }) {
  const data = await request.formData();
  const nome = (data.get('nome') as string | null)?.trim() ?? '';
  const honeypot = (data.get('website') as string | null) ?? '';

  if (honeypot || !nome) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const zapierUrl = import.meta.env.ZAPIER_WEBHOOK_URL as string;
  try {
    await fetch(zapierUrl, { method: 'POST', body: data });
  } catch (_) {}

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
