import { createServiceClient } from '../../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { setId } = req.query;
  const supabase = createServiceClient();

  try {
    const { data, error } = await supabase
      .from('cards')
      .select('rarity')
      .eq('set_id', setId)
      .not('rarity', 'is', null)
      .order('rarity');

    if (error) return res.status(500).json({ error: error.message });

    const rarities = [...new Set((data ?? []).map((r) => r.rarity))];
    res.json(rarities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
