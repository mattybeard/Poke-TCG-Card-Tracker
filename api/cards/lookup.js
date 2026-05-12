import { createSupabaseClient } from '../lib/supabase.js';

// GET /api/cards/lookup?ptcgoCode=SCR&number=121
// Used by the OCR scanner to find a card by set code + card number.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { ptcgoCode, number } = req.query;
  if (!ptcgoCode || !number) {
    return res.status(400).json({ error: 'ptcgoCode and number are required' });
  }

  const supabase = createSupabaseClient();

  // Find the set by ptcgo_code (case-insensitive via ilike)
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

  const { data: cards, error: cardError } = await supabase
    .from('cards')
    .select('*')
    .eq('set_id', set.id)
    .eq('number', number)
    .limit(1);

  if (cardError) return res.status(500).json({ error: cardError.message });
  if (!cards || cards.length === 0) {
    return res.status(404).json({ error: `Card #${number} not found in set "${ptcgoCode}"` });
  }

  const c = cards[0];
  res.json({
    set: {
      id: set.id,
      name: set.name,
      ptcgoCode: set.ptcgo_code,
      images: { symbol: set.symbol_image, logo: set.logo_image },
    },
    card: {
      id: c.id,
      name: c.name,
      number: c.number,
      rarity: c.rarity,
      subtypes: c.subtypes ?? [],
      variants: c.variants ?? null,
      images: { small: c.small_image, large: c.large_image },
      set: { id: c.set_id },
    },
  });
}
