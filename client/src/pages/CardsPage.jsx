import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import CardModal from '../components/CardModal.jsx';
import { getAvailableFinishes, FINISH_LABELS } from '../utils/finishes.js';
import { apiFetch } from '../lib/apiFetch.js';

const OWNERSHIP_FILTERS = ['all', 'owned', 'not owned', 'wishlist'];

function loadSavedFilters(setId) {
  try {
    return JSON.parse(localStorage.getItem(`filters:${setId}`) ?? '{}');
  } catch { return {}; }
}

function isMasterComplete(card, collection) {
  const finishes = getAvailableFinishes(card.variants);
  const ownedFinishes = new Set((collection[card.id] ?? []).filter((e) => !e.wishlist).map((e) => e.finish));
  return finishes.every((f) => ownedFinishes.has(f));
}

function getRarityColor(rarity) {
  if (!rarity) return null;
  const r = rarity.toLowerCase();
  if (r.includes('special illustration')) return 'rarity-sir';
  if (r.includes('hyper') || r.includes('rainbow')) return 'rarity-hyper';
  if (r.includes('illustration rare')) return 'rarity-ir';
  if (r.includes('ultra') || r.includes('secret') || r.includes('ace spec')) return 'rarity-ultra';
  if (r.includes('double rare') || r.includes('rare holo')) return 'rarity-holo';
  if (r.includes('rare')) return 'rarity-rare';
  return null;
}

export default function CardsPage() {
  const { setId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Initialise filters from localStorage (per set)
  const saved = loadSavedFilters(setId);

  const [cards, setCards] = useState([]);
  const [setInfo, setSetInfo] = useState(null);
  const [collection, setCollection] = useState({}); // card_id -> [entries]
  const [rarities, setRarities] = useState([]);
  const [ownershipFilter, setOwnershipFilter] = useState(saved.ownershipFilter ?? 'all');
  const [rarityFilter, setRarityFilter] = useState(saved.rarityFilter ?? 'all');
  const [masterOnly, setMasterOnly] = useState(saved.masterOnly ?? false);
  const [search, setSearch] = useState('');
  const [unstacked, setUnstacked] = useState(saved.unstacked ?? false);
  const [gridCols, setGridCols] = useState(() => {
    try {
      const saved = localStorage.getItem('ui:gridCols');
      if (saved) return parseInt(saved, 10);
      return window.innerWidth < 640 ? 3 : 7;
    } catch { return 7; }
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedCard, setSelectedCard] = useState(null);
  const [quickAdding, setQuickAdding] = useState(new Set());

  // Persist filter state to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(`filters:${setId}`, JSON.stringify({ ownershipFilter, rarityFilter, masterOnly, unstacked }));
    } catch {}
  }, [setId, ownershipFilter, rarityFilter, masterOnly, unstacked]);

  // Persist grid column preference globally
  useEffect(() => {
    try { localStorage.setItem('ui:gridCols', String(gridCols)); } catch {}
  }, [gridCols]);

  const loadCollection = useCallback(() => {
    return apiFetch(`/api/collection?set_id=${setId}`)
      .then((r) => r.json())
      .then((rows) => {
        if (!Array.isArray(rows)) return;
        const map = {};
        rows.forEach((e) => {
          if (!map[e.card_id]) map[e.card_id] = [];
          map[e.card_id].push(e);
        });
        setCollection(map);
      })
      .catch(() => {});
  }, [setId]);

  useEffect(() => {
    // Load cards + sets info — collection is loaded separately so it can't block cards
    // Use allSettled so a rarities or sets failure never blocks the cards grid
    Promise.allSettled([
      apiFetch(`/api/cards/${setId}`).then((r) => r.json()),
      apiFetch(`/api/cards/rarities/${setId}`).then((r) => r.json()),
      apiFetch('/api/sets').then((r) => r.json()),
    ]).then(([cardsResult, raritiesResult, setsResult]) => {
      if (cardsResult.status === 'rejected' || cardsResult.value?.error) {
        setLoadError(cardsResult.value?.error ?? cardsResult.reason?.message ?? 'Failed to load cards');
        setLoading(false);
        return;
      }
      setCards(cardsResult.value.data ?? []);
      if (raritiesResult.status === 'fulfilled' && Array.isArray(raritiesResult.value)) {
        setRarities(raritiesResult.value);
      }
      if (setsResult.status === 'fulfilled' && setsResult.value?.data) {
        const found = setsResult.value.data.find((s) => s.id === setId);
        setSetInfo(found);
      }
      setLoading(false);
    });

    loadCollection();
  }, [setId, loadCollection]);

  // Auto-open a card when navigated here from the scanner
  useEffect(() => {
    const scanCardId = location.state?.scanCardId;
    if (!scanCardId || loading || cards.length === 0) return;
    const found = cards.find((c) => c.id === scanCardId);
    if (found) {
      const defaultFinish = getAvailableFinishes(found.variants)[0];
      setSelectedCard({ card: found, initialFinish: defaultFinish });
      // Clear state so refreshing doesn't re-open
      window.history.replaceState({}, '');
    }
  }, [location.state, cards, loading]);

  // In unstacked mode: expand to per-finish variants first, then filter at finish level.
  // In stacked mode: filter at card level, then represent as (card, null).
  const displayItems = (() => {
    if (unstacked) {
      return cards
        .flatMap((card) =>
          getAvailableFinishes(card.variants).map((finish) => ({ card, finish }))
        )
        .filter(({ card, finish }) => {
          const entries = collection[card.id] ?? [];
          const isFinishOwned = entries.some((e) => !e.wishlist && e.finish === finish);
          const isFinishWishlisted = entries.some((e) => e.wishlist && e.finish === finish);
          if (ownershipFilter === 'owned' && !isFinishOwned) return false;
          if (ownershipFilter === 'not owned' && isFinishOwned) return false;
          if (ownershipFilter === 'wishlist' && !isFinishWishlisted) return false;
          if (rarityFilter !== 'all' && card.rarity !== rarityFilter) return false;
          if (search && !card.name.toLowerCase().includes(search.toLowerCase())) return false;
          return true;
        });
    }

    return cards
      .filter((card) => {
        const entries = collection[card.id] ?? [];
        const ownedEntries = entries.filter((e) => !e.wishlist);
        const wishlistEntries = entries.filter((e) => e.wishlist);
        const isOwned = masterOnly ? isMasterComplete(card, collection) : ownedEntries.length > 0;
        if (ownershipFilter === 'owned' && !isOwned) return false;
        if (ownershipFilter === 'not owned' && isOwned) return false;
        if (ownershipFilter === 'wishlist' && wishlistEntries.length === 0) return false;
        if (rarityFilter !== 'all' && card.rarity !== rarityFilter) return false;
        if (search && !card.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .map((card) => ({ card, finish: null }));
  })();

  // Master set stats (all finish variants per card)
  const totalMasterSlots = cards.reduce((sum, c) => sum + getAvailableFinishes(c.variants).length, 0);
  const ownedMasterSlots = cards.reduce((sum, c) => {
    const finishes = getAvailableFinishes(c.variants);
    const ownedFinishes = new Set((collection[c.id] ?? []).filter((e) => !e.wishlist).map((e) => e.finish));
    return sum + finishes.filter((f) => ownedFinishes.has(f)).length;
  }, 0);

  const buildPayload= (card, extra = {}) => ({
    card_id: card.id,
    set_id: card.set.id,
    card_name: card.name,
    set_name: setInfo?.name ?? card.set.id,
    card_number: card.number,
    card_image: card.images?.small,
    rarity: card.rarity,
    ...extra,
  });

  const quickAdd = async (e, card, finish) => {
    e.stopPropagation();
    const key = `${card.id}:${finish}`;
    setQuickAdding((s) => new Set(s).add(key));
    await apiFetch('/api/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(card, { quantity: 1, condition: 'mint', finish, wishlist: false })),
    });
    await loadCollection();
    setQuickAdding((s) => { const n = new Set(s); n.delete(key); return n; });
  };

  const adjustQty = async (e, entry, delta) => {
    e.stopPropagation();
    const newQty = entry.quantity + delta;
    if (newQty <= 0) {
      await apiFetch(`/api/collection/${entry.id}`, { method: 'DELETE' });
    } else {
      await apiFetch(`/api/collection/${entry.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: newQty, condition: entry.condition, wishlist: entry.wishlist, notes: entry.notes }),
      });
    }
    await loadCollection();
  };

  const handleSave = async (payload) => {
    await apiFetch('/api/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await loadCollection();
  };

  const handleDelete = async (id) => {
    await apiFetch(`/api/collection/${id}`, { method: 'DELETE' });
    await loadCollection();
  };

  if (loading) return <div className="loading">Loading cards…</div>;
  if (loadError) return (
    <div style={{ padding: 32 }}>
      <button className="back-btn" onClick={() => navigate('/')}>← Back to Sets</button>
      <div className="loading" style={{ color: '#ef9a9a', marginTop: 16 }}>Error loading cards: {loadError}</div>
    </div>
  );

  const ownedCount = cards.filter((c) => (collection[c.id] ?? []).some((e) => !e.wishlist)).length;

  return (
    <div>
      <button className="back-btn" onClick={() => navigate('/')}>← Back to Sets</button>

      <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {setInfo?.images?.symbol && <img src={setInfo.images.symbol} alt="" style={{ height: 28 }} />}
        {setInfo?.name ?? setId}
      </h1>

      <div className="stats-bar">
        <div className="stat-chip">
          <div className="stat-chip-row">
            <span className="stat-label">Set</span>
            <strong>{ownedCount}</strong><span> / {cards.length}</span>
            <span className="stat-pct">{Math.round((ownedCount / cards.length) * 100) || 0}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${Math.round((ownedCount / cards.length) * 100) || 0}%` }} />
          </div>
        </div>
        <div className={`stat-chip${ownedMasterSlots === totalMasterSlots && totalMasterSlots > 0 ? ' stat-chip-master' : ''}`}>
          <div className="stat-chip-row">
            <span className="stat-label">Master</span>
            <strong>{ownedMasterSlots}</strong><span> / {totalMasterSlots}</span>
            <span className="stat-pct">{Math.round((ownedMasterSlots / totalMasterSlots) * 100) || 0}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill progress-fill-master" style={{ width: `${Math.round((ownedMasterSlots / totalMasterSlots) * 100) || 0}%` }} />
          </div>
        </div>
      </div>

      <div className="filter-bar">
        <input
          className="search-input"
          type="text"
          placeholder="Search cards…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {OWNERSHIP_FILTERS.map((f) => (
          <button key={f} className={`filter-btn${ownershipFilter === f ? ' active' : ''}`} onClick={() => setOwnershipFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button
          className={`filter-btn filter-btn-master${masterOnly ? ' active' : ''}`}
          onClick={() => setMasterOnly((v) => !v)}
          title="Master Set mode: changes Owned/Not Owned to use master set completion (all finish variants)"
        >
          ★ Master Set
        </button>
        <button
          className={`filter-btn variant-toggle${unstacked ? ' active' : ''}`}
          onClick={() => setUnstacked((v) => !v)}
          title="Show each Normal / Reverse Holo / Holo as a separate card"
        >
          {unstacked ? '⊞ Stacked' : '⊟ Unstacked'}
        </button>
        <div className="col-picker" title="Columns per row">
          <span className="col-picker-label">⊞</span>
          {[1,2,3,4,5,6,7].map((n) => (
            <button
              key={n}
              className={`col-btn${gridCols === n ? ' active' : ''}`}
              onClick={() => setGridCols(n)}
            >{n}</button>
          ))}
        </div>
      </div>

      {rarities.length > 0 && (
        <div className="filter-bar" style={{ marginTop: -12 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', alignSelf: 'center' }}>Rarity:</span>
          <button className={`filter-btn${rarityFilter === 'all' ? ' active' : ''}`} onClick={() => setRarityFilter('all')}>All</button>
          {rarities.map((r) => (
            <button key={r} className={`filter-btn rarity-filter-btn ${getRarityColor(r) ?? ''}${rarityFilter === r ? ' active' : ''}`} onClick={() => setRarityFilter(r)}>
              {r}
            </button>
          ))}
        </div>
      )}

      <div className="cards-grid" style={{ '--grid-cols': gridCols }}>
        {displayItems.map(({ card, finish }) => {
          const entries = collection[card.id] ?? [];
          const allOwnedEntries = entries.filter((e) => !e.wishlist);

          // In unstacked mode, scope owned/qty to this specific finish
          const ownedEntries = finish
            ? allOwnedEntries.filter((e) => e.finish === finish)
            : allOwnedEntries;

          const isOwned = ownedEntries.length > 0;
          const isWishlist = entries.some((e) => e.wishlist) && allOwnedEntries.length === 0;
          const qty = ownedEntries.reduce((s, e) => s + e.quantity, 0);
          const rarityClass = getRarityColor(card.rarity);
          const tileKey = finish ? `${card.id}:${finish}` : card.id;
          const defaultFinish = finish ?? getAvailableFinishes(card.variants)[0];

          return (
            <div
              key={tileKey}
              className={`card-item${isOwned ? ' owned' : ''}${isWishlist ? ' wishlist' : ''}`}
              onClick={() => setSelectedCard({ card, initialFinish: defaultFinish })}
            >
              {card.images?.small ? (
                <img src={card.images.small} alt={card.name} loading="lazy" />
              ) : (
                <div className="card-no-image">No image</div>
              )}

              {/* Rarity badge */}
              {card.rarity && rarityClass && (
                <span className={`rarity-badge ${rarityClass}`}>{card.rarity}</span>
              )}

              {/* Finish label in unstacked mode */}
              {finish && (
                <span className={`finish-label finish-label-${finish.replace(' ', '-')}`}>
                  {FINISH_LABELS[finish]}
                </span>
              )}

              {/* Wishlist star */}
              {isWishlist && <span className="card-badge wishlist">★</span>}

              {/* Owned: always-visible qty badge + hover qty controls */}
              {isOwned ? (
                <>
                  <span className="qty-badge">×{qty}</span>
                  <div className="qty-controls" onClick={(e) => e.stopPropagation()}>
                    <button className="qty-btn" onClick={(e) => adjustQty(e, ownedEntries[0], -1)}>−</button>
                    <span className="qty-value">×{qty}</span>
                    <button className="qty-btn" onClick={(e) => adjustQty(e, ownedEntries[0], +1)}>+</button>
                  </div>
                </>
              ) : (
                <button
                  className="quick-add-btn"
                  title={`Quick add ${FINISH_LABELS[defaultFinish]} (mint)`}
                  onClick={(e) => quickAdd(e, card, defaultFinish)}
                  disabled={quickAdding.has(tileKey)}
                >
                  {quickAdding.has(tileKey) ? '…' : '+'}
                </button>
              )}

              <div className="card-item-info">
                <div className="card-item-name">{card.name}</div>
                <div className="card-item-number">
                  #{card.number}
                  {card.subtypes?.length > 0 && <span className="card-subtype"> · {card.subtypes.join(', ')}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {displayItems.length === 0 && (
        <div className="empty-state">
          <span className="emoji">🃏</span>
          No cards match this filter.
        </div>
      )}

      {selectedCard && (
        <CardModal
          card={selectedCard.card}
          collectionEntries={collection[selectedCard.card.id] ?? []}
          setName={setInfo?.name ?? setId}
          initialFinish={selectedCard.initialFinish}
          onClose={() => setSelectedCard(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

