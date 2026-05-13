import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useCurrency, CURRENCIES } from '../context/CurrencyContext.jsx';

export default function NavBar() {
  const { user, signOut, isAdmin } = useAuth();
  const { currency, setCurrency } = useCurrency();

  return (
    <nav className="navbar">
      <NavLink to="/" className="navbar-brand">🎴 PokéTracker</NavLink>
      <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>Browse Sets</NavLink>
      <NavLink to="/collection" className={({ isActive }) => isActive ? 'active' : ''}>My Collection</NavLink>
      <NavLink to="/wishlist" className={({ isActive }) => isActive ? 'active' : ''}>Wishlist</NavLink>
      <NavLink to="/scan" className={({ isActive }) => isActive ? 'active' : ''}>📷 Scan</NavLink>
      {isAdmin && (
        <NavLink to="/sync" className={({ isActive }) => isActive ? 'active' : ''} style={{ fontSize: '0.85rem' }}>🔄 Sync</NavLink>
      )}
      {isAdmin && (
        <NavLink to="/admin" className={({ isActive }) => isActive ? 'active' : ''} style={{ fontSize: '0.85rem' }}>⚙️ Admin</NavLink>
      )}
      <select
        className="currency-select"
        value={currency}
        onChange={(e) => setCurrency(e.target.value)}
        title="Display currency"
      >
        {CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>{c.label}</option>
        ))}
      </select>
      {user && (
        <div className="navbar-user">
          <span className="navbar-email">{user.email}</span>
          <button className="navbar-signout" onClick={signOut}>Sign out</button>
        </div>
      )}
    </nav>
  );
}

