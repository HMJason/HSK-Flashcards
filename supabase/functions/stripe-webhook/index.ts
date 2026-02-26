// ══════════════════════════════════════════════════════════════════════════════
// Supabase Edge Function: stripe-webhook
//
// Stripe calls this automatically after a successful payment.
// Writes the entitlement to the database — this is the ONLY place that grants access.
// The client can never grant its own access; only this webhook can.
//
// POST /functions/v1/stripe-webhook
// Headers: stripe-signature  (used to verify the payload is genuinely from Stripe)
//
// Environment variables:
//   STRIPE_SECRET_KEY          — your Stripe secret key
//   STRIPE_WEBHOOK_SECRET      — from Stripe Dashboard → Webhooks → signing secret
//   SUPABASE_SERVICE_ROLE_KEY  — from Supabase → Project Settings → API (service_role)
// ══════════════════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno';

// Maps product key → which level strings to add to user_entitlements.levels
// 'all' replaces everything; individual levels just append their number.
const LEVEL_GRANTS: Record<string, string[]> = {
  hsk4: ['4'],
  hsk5: ['5'],
  hsk6: ['6'],
  all:  ['all'],  // grants access to everything
};

serve(async (req: Request) => {
  const body      = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  // ── Verify the webhook came from Stripe (prevents spoofing) ──────────────────
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
    apiVersion: '2024-04-10',
  });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
    );
  } catch (err) {
    console.error('[webhook] signature verification failed:', err);
    return new Response('Webhook signature verification failed', { status: 400 });
  }

  // ── Only handle checkout.session.completed ───────────────────────────────────
  if (event.type !== 'checkout.session.completed') {
    return new Response('Event type ignored: ' + event.type, { status: 200 });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const { user_id, product_key } = session.metadata ?? {};

  if (!user_id || !product_key) {
    console.error('[webhook] missing metadata:', session.metadata);
    return new Response('Missing metadata', { status: 400 });
  }

  const levelsToGrant = LEVEL_GRANTS[product_key];
  if (!levelsToGrant) {
    console.error('[webhook] unknown product_key:', product_key);
    return new Response('Unknown product key', { status: 400 });
  }

  // ── Use service-role client (bypasses RLS — webhook acts as admin) ───────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // ── Write purchase audit record ───────────────────────────────────────────────
  await supabase.from('purchases').upsert({
    user_id,
    stripe_session_id:     session.id,
    stripe_payment_intent: typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null,
    product_key,
    amount_gbp: session.amount_total ?? 0,
    status:     'completed',
  }, { onConflict: 'stripe_session_id' });

  // ── Update entitlements ───────────────────────────────────────────────────────
  // If buying 'all', just set levels = '{all}'.
  // Otherwise, add the new level to whatever they already own.
  if (product_key === 'all') {
    await supabase.from('user_entitlements').upsert({
      user_id,
      levels:     ['all'],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } else {
    // Load existing entitlements and append
    const { data: existing } = await supabase
      .from('user_entitlements')
      .select('levels')
      .eq('user_id', user_id)
      .single();

    const current: string[] = existing?.levels ?? [];
    // If they already have 'all', nothing to do
    if (!current.includes('all')) {
      const merged = Array.from(new Set([...current, ...levelsToGrant]));
      await supabase.from('user_entitlements').upsert({
        user_id,
        levels:     merged,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    }
  }

  console.log(`[webhook] ✅ Granted ${product_key} to user ${user_id}`);
  return new Response('OK', { status: 200 });
});
