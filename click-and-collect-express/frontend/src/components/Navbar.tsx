// Barre de navigation globale avec indicateur de connexion temps réel.
import { NavLink } from 'react-router-dom';
import { Coffee, Wifi, WifiOff } from 'lucide-react';
import { useSocket } from '../hooks/useSocket';

const navLinkClass = ({ isActive }: { isActive: boolean }): string =>
  `flex items-center rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-amber-100 text-amber-900' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
  }`;

export default function Navbar() {
  const { connected } = useSocket();

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-2 px-4">
        <NavLink to="/" className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-600 text-white">
            <Coffee className="h-5 w-5" />
          </span>
          <span className="truncate text-sm font-bold text-stone-900 sm:text-base">
            Click &amp; Collect Express
          </span>
        </NavLink>

        <nav className="flex shrink-0 items-center gap-1 sm:gap-2" aria-label="Navigation principale">
          <NavLink to="/" end className={navLinkClass}>
            Carte
          </NavLink>
          <NavLink to="/kitchen" className={navLinkClass}>
            Cuisine
          </NavLink>
        </nav>

        <div
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
            connected
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-stone-200 bg-stone-100 text-stone-500'
          }`}
          title={connected ? 'Connexion temps réel active' : 'Connexion temps réel indisponible'}
        >
          {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          <span className={`h-2 w-2 rounded-full ${connected ? 'animate-pulse bg-green-500' : 'bg-stone-400'}`} />
          <span className="hidden sm:inline">{connected ? 'En direct' : 'Hors ligne'}</span>
        </div>
      </div>
    </header>
  );
}
