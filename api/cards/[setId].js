import { createServiceClient } from '../lib/supabase.js';

function shapeCard(c) {
  return {
    id: c.id,
    name: c.name,
    number: c.number,
    rarity: c.rarity,
    subtypes: c.subtypes ?? [],
    variants: c.variants ?? null,
    images: { small: c.small_image, large: c.large_image },
    set: { id: c.set_id },
    pricing: (c.cm_trend || c.tcp_normal_market) ? {
      cardmarket: c.cm_trend != null ? {
        trend: c.cm_trend,
        avg30: c.cm_avg30,
        low: c.cm_low,
        trendHolo: c.cm_trend_holo,
        avg30Holo: c.cm_avg30_holo,
      } : null,
      tcgplayer: c.tcp_normal_market != null ? {
        normalMarket: c.tcp_normal_market,
        normalLow: c.tcp_normal_low,
        reverseMarket: c.tcp_reverse_market,
      } : null,
      updatedAt: c.price_updated_at,
    } : null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { setId } = req.query;
  const supabase = createServiceClient();

  // Handle /api/cards/lookup?ptcgoCode=SCR&number=121 (OCR scanner)
  if (setId === 'lookup') {
    const { ptcgoCode, number } = req.query;
    if (!ptcgoCode || !number) {
      return res.status(400).json({ error: 'ptcgoCode and number are required' });
    }
    const { data: sets, error: setError } = await supabase
      .from('sets')
      .select('id, name, ptcgo_code, symbol_image, logo_image')
      .ilike('ptcgo_code', ptcgoCode)
      .limit(1);
    if (setError) return res.status(500).json({ error: setError.message });
    if (!sets || sets.length === 0) {
      return res.status(404).json({ error: `No set found with code "${ptcgoCode}"` });
    }
    const set = sets[0];
    // Try number as-is (e.g. "002") then without leading zeros (e.g. "2")
    const stripped = String(parseInt(number, 10));
    const { data: cards, error: cardError } = await supabase
      .from('cards')
      .select('*')
      .eq('set_id', set.id)
      .in('number', [number, stripped])
      .limit(1);
    if (cardError) return res.status(500).json({ error: cardError.message });
    if (!cards || cards.length === 0) {
      return res.status(404).json({ error: `Card #${number} not found in set "${ptcgoCode}"` });
    }
    return res.json({
      set: {
        id: set.id,
        name: set.name,
        ptcgoCode: set.ptcgo_code,
        images: { symbol: set.symbol_image, logo: set.logo_image },
      },
      card: shapeCard(cards[0]),
    });
  }

  try {
    const { data: rows, error } = await supabase
      .from('cards')
      .select('*')
      .eq('set_id', setId)
      .eq('hidden', false)
      .order('number');

    if (error) return res.status(500).json({ error: error.message });
    if (!rows || rows.length === 0) {
      return res.status(503).json({ error: 'No cards found — run a sync first' });
    }

    // Sort numerically then alphabetically — guard against null number
    rows.sort((a, b) => {
      const an = a.number ?? '', bn = b.number ?? '';
      const ai = parseInt(an, 10), bi = parseInt(bn, 10);
      if (!isNaN(ai) && !isNaN(bi) && ai !== bi) return ai - bi;
      return an.localeCompare(bn);
    });

    res.json({ data: rows.map(shapeCard), totalCount: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
