import express from 'express';
import db from '../db.js';

const router = express.Router();

function shapeCard(c) {
  return {
    id: c.id,
    name: c.name,
    number: c.number,
    rarity: c.rarity,
    subtypes: c.subtypes ? JSON.parse(c.subtypes) : [],
    variants: c.variants ? JSON.parse(c.variants) : null,
    images: { small: c.small_image, large: c.large_image },
    set: { id: c.set_id },
  };
}

// GET /api/cards/lookup?ptcgoCode=SCR&number=121
// Finds a card by set ptcgo_code (e.g. "SCR") and card number (e.g. "121")
router.get('/lookup', (req, res) => {
  const { ptcgoCode, number } = req.query;
  if (!ptcgoCode || !number) {
    return res.status(400).json({ error: 'ptcgoCode and number are required' });
  }
  const set = db.prepare(`SELECT * FROM sets WHERE ptcgo_code = ? COLLATE NOCASE`).get(ptcgoCode);
  if (!set) return res.status(404).json({ error: `No set found with code "${ptcgoCode}"` });

  // Try the number as-is first (e.g. "002"), then without leading zeros (e.g. "2")
  const stripped = String(parseInt(number, 10));
  const card = db.prepare(`SELECT * FROM cards WHERE set_id = ? AND (number = ? OR number = ?)`).get(set.id, number, stripped);
  if (!card) return res.status(404).json({ error: `Card #${number} not found in set "${ptcgoCode}"` });

  res.json({
    set: {
      id: set.id,
      name: set.name,
      ptcgoCode: set.ptcgo_code,
      images: { symbol: set.symbol_image, logo: set.logo_image },
    },
    card: shapeCard(card),
  });
});

router.get('/set/:setId', (req, res) => {
  const { setId } = req.params;
  const rows = db.prepare(`SELECT * FROM cards WHERE set_id = ? ORDER BY CAST(number AS INTEGER), number`).all(setId);
  if (rows.length === 0) {
    return res.status(503).json({ error: 'No cards found — run a sync first via POST /api/sync/start' });
  }
  res.json({ data: rows.map(shapeCard), totalCount: rows.length });
});

// GET /api/cards/rarities/:setId — distinct rarities in a set for the filter bar
router.get('/rarities/:setId', (req, res) => {
  const rows = db.prepare(
    `SELECT DISTINCT rarity FROM cards WHERE set_id = ? AND rarity IS NOT NULL ORDER BY rarity`
  ).all(req.params.setId);
  res.json(rows.map((r) => r.rarity));
});

router.get('/:cardId', (req, res) => {
  const c = db.prepare(`SELECT * FROM cards WHERE id = ?`).get(req.params.cardId);
  if (!c) return res.status(404).json({ error: 'Card not found' });
  res.json({ data: shapeCard(c) });
});

export default router;
