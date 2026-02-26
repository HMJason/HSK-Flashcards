// ══════════════════════════════════════════════════════════════════════════════
// Supabase Edge Function: create-checkout
//
// Called by the client when a user clicks "Buy now" on a locked level.
// Creates a Stripe Checkout session and returns the redirect URL.
//
// POST /functions/v1/create-checkout
// Body: { productKey: 'hsk4' | 'hsk5' | 'hsk6' | 'all' }
// Auth: Bearer <supabase_jwt>  (user must be signed in)
//
// Environment variables (set in Supabase dashboard → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY   — your Stripe secret key (sk_live_... or sk_test_...)
//   SITE_URL            — e.g. https://hmjason.github.io/HSK-Flashcards
// ══════════════════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno';

// ─── Product catalogue ────────────────────────────────────────────────────────
const PRODUCTS: Record<string, { name: string; amount: number; description: string }> = {
  hsk4: {
    name:        'HSK 4 — Intermediate',
    amount:      200,   // pence
    description: '600 words · Discuss a wide range of topics with native speakers',
  },
  hsk5: {
    name:        'HSK 5 — Upper-Intermediate',
    amount:      200,
    description: '1,300 words · Read newspapers, watch films, express opinions naturally',
  },
  hsk6: {
    name:        'HSK 6 — Advanced',
    amount:      200,
    description: '2,500 words · Near-native fluency in written and spoken Chinese',
  },
  all: {
    name:        'All HSK Levels — Full Access',
    amount:      500,
    description: '5,000 words across HSK 1–6 · Complete Mandarin vocabulary mastery',
  },
};

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // ── Auth: verify the user is signed in ────────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorised' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Parse request ─────────────────────────────────────────────────────────
    const { productKey } = await req.json() as { productKey: string };
    const product = PRODUCTS[productKey];
    if (!product) {
      return new Response(JSON.stringify({ error: 'Unknown product: ' + productKey }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Check they don't already own it ──────────────────────────────────────
    const { data: ent } = await supabase
      .from('user_entitlements')
      .select('levels')
      .eq('user_id', user.id)
      .single();
    const owned: string[] = ent?.levels ?? [];
    if (owned.includes('all') || owned.includes(productKey.replace('hsk', ''))) {
      return new Response(JSON.stringify({ error: 'already_owned' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Create Stripe Checkout session ────────────────────────────────────────
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-04-10',
    });
    const siteUrl = Deno.env.get('SITE_URL') ?? 'https://hmjason.github.io/HSK-Flashcards';

    const session = await stripe.checkout.sessions.create({
      mode:                'payment',
      currency:            'gbp',
      customer_email:      user.email,
      payment_method_types: ['card'],
      line_items: [{
        quantity: 1,
        price_data: {
          currency:     'gbp',
          unit_amount:  product.amount,
          product_data: {
            name:        product.name,
            description: product.description,
            images:      [],
          },
        },
      }],
      // Pass user info so the webhook can write the entitlement
      metadata: {
        user_id:     user.id,
        product_key: productKey,
      },
      success_url: `${siteUrl}/index.html?payment=success&product=${productKey}`,
      cancel_url:  `${siteUrl}/index.html?payment=cancelled`,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[create-checkout] error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
