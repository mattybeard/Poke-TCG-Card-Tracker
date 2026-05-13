import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/apiFetch.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function SetsPage() {
  const [sets, setSets] = useState([]);
  const [collectionSummary, setCollectionSummary] = useState({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  useEffect(() => {
    apiFetch('/api/sets')
      .then((r) => r.json())
      .then((setsData) => {
        if (setsData.error) { setError(setsData.error); setLoading(false); return; }
        setSets(setsData.data ?? []);
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });

    // Load collection summary separately — failure just means 0 counts shown
    apiFetch('/api/collection?mode=summary')
      .then((r) => r.json())
      .then((summary) => {
        if (!Array.isArray(summary)) return;
        const map = {};
        summary.forEach((s) => { map[s.set_id] = s.owned_cards; });
        setCollectionSummary(map);
      })
      .catch(() => {});
  }, []);

  const filtered = sets.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.series?.toLowerCase().includes(search.toLowerCase())
  );

  // Group by series for display
  const grouped = filtered.reduce((acc, set) => {
    const key = set.series || 'Other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(set);
    return acc;
  }, {});

  if (loading) return <div className="loading">Loading sets…</div>;
  if (error) {
    const needsSync = error.toLowerCase().includes('sync');
    return (
      <div className="empty-state" style={{ marginTop: 48 }}>
        <span className="emoji">🃏</span>
        <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
          {needsSync ? 'No card data found. The database needs to be populated before you can browse sets.' : `Error: ${error}`}
        </p>
        {needsSync && isAdmin && (
          <Link to="/sync">
            <button className="scan-action-btn primary" style={{ fontSize: '1rem', padding: '10px 24px' }}>
              🔄 Go to Sync page
            </button>
          </Link>
        )}
        {needsSync && !isAdmin && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Please ask an admin to run a sync.</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1>Browse Sets</h1>
      <div className="filter-bar">
        <input
          className="search-input"
          type="text"
          placeholder="Search sets or series…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{filtered.length} sets</span>
      </div>

      {Object.entries(grouped).map(([series, seriesSets]) => (
        <div key={series} style={{ marginBottom: 32 }}>
          <h2>{series}</h2>
          <div className="sets-grid">
            {seriesSets.map((set) => (
            <div key={set.id} className="set-card" onClick={() => navigate(`/sets/${set.id}`)}>
                {set.images?.logo ? (
                  <img src={set.images.logo} alt={set.name} />
                ) : set.images?.symbol ? (
                  <div className="set-symbol-fallback">
                    <img src={set.images.symbol} alt={set.name} className="set-symbol-img" />
                  </div>
                ) : (
                  <div className="set-logo-placeholder">
                    <span>{set.name}</span>
                  </div>
                )}
                <div className="set-name">{set.name}</div>
                <div className="set-meta">
                  {collectionSummary[set.id]
                    ? <span className="set-owned">{collectionSummary[set.id]}/{set.total}</span>
                    : <span>{set.total} cards</span>
                  } · {set.releaseDate?.slice(0, 4)}
                </div>
                {collectionSummary[set.id] > 0 && (
                  <div className="progress-bar set-progress">
                    <div
                      className="progress-fill"
                      style={{ width: `${Math.round((collectionSummary[set.id] / set.total) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="empty-state">
          <span className="emoji">🔍</span>
          No sets match your search.
        </div>
      )}
    </div>
  );
}
