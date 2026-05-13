import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/apiFetch.js';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function timeAgo(isoStr) {
  if (!isoStr) return null;
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 2)   return 'just now';
  if (mins < 60)  return `${mins} minutes ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

function SyncStatus({ lastSync, lastSyncType, lastPriceSync, lastPriceSyncType }) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 'var(--radius)',
      padding: '14px 18px', marginBottom: 24,
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px',
    }}>
      <div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 3 }}>Last card sync</div>
        <div style={{ fontWeight: 600 }}>
          {lastSync ? timeAgo(lastSync) : <span style={{ color: 'var(--text-muted)' }}>Never</span>}
        </div>
        {lastSync && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {new Date(lastSync).toLocaleString()} · {lastSyncType}
          </div>
        )}
      </div>
      <div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 3 }}>Last price sync</div>
        <div style={{ fontWeight: 600 }}>
          {lastPriceSync ? timeAgo(lastPriceSync) : <span style={{ color: 'var(--text-muted)' }}>Never</span>}
        </div>
        {lastPriceSync && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {new Date(lastPriceSync).toLocaleString()} · {lastPriceSyncType}
          </div>
        )}
      </div>
    </div>
  );
}

function ScheduleConfig({ initial, onSave }) {
  const [scheduleType, setScheduleType] = useState(initial.scheduleType ?? 'monthly');
  const [scheduleDay,  setScheduleDay]  = useState(initial.scheduleDay  ?? 1);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    await apiFetch('/api/sync?phase=schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduleType, scheduleDay }),
    });
    setSaving(false);
    setSaved(true);
    onSave({ scheduleType, scheduleDay });
  };

  const nextRunLabel = () => {
    if (scheduleType === 'manual_only') return 'No automatic sync';
    if (scheduleType === 'weekly')  return `Every ${DAY_NAMES[scheduleDay]} at 3:00 AM UTC`;
    if (scheduleType === 'monthly') return `Every month on day ${scheduleDay} at 3:00 AM UTC`;
    return '';
  };

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '16px 18px', marginBottom: 24 }}>
      <h2 style={{ fontSize: '1rem', marginBottom: 14 }}>📅 Automatic Sync Schedule</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {['manual_only', 'weekly', 'monthly'].map((t) => (
          <button
            key={t}
            onClick={() => { setScheduleType(t); setSaved(false); }}
            style={{
              padding: '6px 14px', borderRadius: 6, border: '2px solid',
              borderColor: scheduleType === t ? 'var(--accent)' : 'var(--surface2)',
              background: scheduleType === t ? 'var(--accent)' : 'transparent',
              color: scheduleType === t ? '#fff' : 'var(--text)',
              cursor: 'pointer', fontWeight: 500,
            }}
          >
            {t === 'manual_only' ? 'Manual only' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {scheduleType === 'weekly' && (
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Day of week</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DAY_NAMES.map((name, i) => (
              <button
                key={i}
                onClick={() => { setScheduleDay(i); setSaved(false); }}
                style={{
                  padding: '4px 10px', borderRadius: 6, border: '2px solid',
                  borderColor: scheduleDay === i ? 'var(--accent)' : 'var(--surface2)',
                  background: scheduleDay === i ? 'var(--accent)' : 'transparent',
                  color: scheduleDay === i ? '#fff' : 'var(--text)',
                  cursor: 'pointer', fontSize: '0.82rem',
                }}
              >
                {name.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
      )}

      {scheduleType === 'monthly' && (
        <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Day of month</label>
          <input
            type="number" min={1} max={28} value={scheduleDay}
            onChange={(e) => { setScheduleDay(Number(e.target.value)); setSaved(false); }}
            style={{ width: 60, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--surface2)', background: 'var(--bg)', color: 'var(--text)' }}
          />
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>(1–28)</span>
        </div>
      )}

      {scheduleType !== 'manual_only' && (
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 14 }}>
          🕒 {nextRunLabel()}
        </div>
      )}

      <button className="btn btn-primary" onClick={save} disabled={saving} style={{ padding: '6px 18px' }}>
        {saving ? 'Saving…' : saved ? '✅ Saved' : 'Save Schedule'}
      </button>
    </div>
  );
}

export default function SyncPage() {
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [hasPriceMore, setHasPriceMore] = useState(false);
  const [hasRefillMore, setHasRefillMore] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    apiFetch('/api/sync').then(async (r) => {
      if (r.ok) setStatus(await r.json());
    }).catch(() => {});
  }, []);

  const runPhase = async (phase) => {
    setRunning(true);
    setDone(false);
    setHasMore(false);
    if (phase === 'auto') setLog(['Starting sync…']);
    else if (phase === 'prices') setLog((prev) => [...prev, '--- Starting price sync ---']);
    else setLog((prev) => [...prev, `--- Continuing (${phase}) ---`]);

    try {
      const res = await apiFetch(`/api/sync?phase=${phase}`, { method: 'POST' });
      const text = await res.text();
      const lines = text.split('\n').filter(Boolean);
      setLog((prev) => [...prev, ...lines]);

      const hasRemaining = lines.some((l) => l.includes('remaining'));
      if (phase === 'prices') {
        setHasPriceMore(hasRemaining);
        if (!hasRemaining) apiFetch('/api/sync').then(async (r) => { if (r.ok) setStatus(await r.json()); });
      } else if (phase === 'refill') {
        setHasRefillMore(hasRemaining);
      } else {
        setHasMore(hasRemaining);
        if (!hasRemaining) apiFetch('/api/sync').then(async (r) => { if (r.ok) setStatus(await r.json()); });
      }
      setDone(!hasRemaining && phase !== 'prices' && phase !== 'refill');
    } catch (err) {
      setLog((prev) => [...prev, `Error: ${err.message}`]);
    }

    setRunning(false);
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <h1>🔄 Data Sync</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
        Syncing downloads all Pokémon TCG sets and cards into the shared database.
        Cards are synced in batches — click <strong>Continue</strong> after each batch until complete.
      </p>

      {status && (
        <SyncStatus
          lastSync={status.lastSync}
          lastSyncType={status.lastSyncType}
          lastPriceSync={status.lastPriceSync}
          lastPriceSyncType={status.lastPriceSyncType}
        />
      )}

      {status && (
        <ScheduleConfig
          initial={{ scheduleType: status.scheduleType, scheduleDay: status.scheduleDay }}
          onSave={(cfg) => setStatus((s) => ({ ...s, ...cfg }))}
        />
      )}

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => runPhase('auto')} disabled={running}>
          {running ? '⏳ Syncing…' : '🔄 Start Sync'}
        </button>
        {hasMore && !running && (
          <button className="btn btn-primary" onClick={() => runPhase('cards')} disabled={running}>
            ▶ Continue Next Batch
          </button>
        )}
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--surface2)', margin: '20px 0' }} />

      <h2 style={{ fontSize: '1rem', marginBottom: 8 }}>🖼️ Refill Missing Images</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: 14 }}>
        Re-fetches cards that were saved as stubs without image data. Run this if card images are missing.
        Runs in batches — click Continue until complete.
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <button className="btn btn-secondary" onClick={() => runPhase('refill')} disabled={running}>
          {running ? '⏳ Syncing…' : '🖼️ Refill Images'}
        </button>
        {hasRefillMore && !running && (
          <button className="btn btn-secondary" onClick={() => runPhase('refill')} disabled={running}>
            ▶ Continue Refill Batch
          </button>
        )}
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--surface2)', margin: '20px 0' }} />

      <h2 style={{ fontSize: '1rem', marginBottom: 8 }}>💰 Price Sync</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: 14 }}>
        Fetches Cardmarket and TCGPlayer market prices for every card.
        Runs in batches — click Continue until complete.
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" onClick={() => runPhase('prices')} disabled={running}>
          {running ? '⏳ Syncing…' : '💰 Sync Prices'}
        </button>
        {hasPriceMore && !running && (
          <button className="btn btn-secondary" onClick={() => runPhase('prices')} disabled={running}>
            ▶ Continue Price Batch
          </button>
        )}
      </div>

      {log.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: 20, marginTop: 20 }}>
          {done && (
            <div style={{ marginBottom: 12, fontWeight: 600, color: '#4caf50' }}>
              ✅ Sync complete
            </div>
          )}
          {hasMore && !running && (
            <div style={{ marginBottom: 12, fontWeight: 600, color: 'var(--yellow)' }}>
              ⏳ More cards to sync — click <strong>Continue Next Batch</strong>
            </div>
          )}
          {hasPriceMore && !running && (
            <div style={{ marginBottom: 12, fontWeight: 600, color: 'var(--yellow)' }}>
              ⏳ More prices to sync — click <strong>Continue Price Batch</strong>
            </div>
          )}
          <div style={{
            background: 'var(--bg)', borderRadius: 8, padding: '10px 14px',
            fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--text-muted)',
            maxHeight: 300, overflowY: 'auto'
          }}>
            {log.map((line, i) => <div key={i}>{line}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}

