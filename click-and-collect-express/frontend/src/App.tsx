// Racine de l'application : routage global, connexion temps réel et mise en page.
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { Coffee } from 'lucide-react';
import Navbar from './components/Navbar';
import { SocketProvider } from './hooks/useSocket';
import KitchenPage from './pages/KitchenPage';
import MenuPage from './pages/MenuPage';
import TrackingPage from './pages/TrackingPage';

function NotFoundPage() {
  return (
    <div className="flex flex-col items-center gap-4 px-4 py-24 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-stone-100">
        <Coffee className="h-8 w-8 text-stone-400" />
      </span>
      <div>
        <h1 className="text-xl font-bold text-stone-900">Page introuvable</h1>
        <p className="mt-1 text-sm text-stone-500">
          Cette page n'existe pas. Retournez à la carte pour commander votre café.
        </p>
      </div>
      <Link
        to="/"
        className="flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-amber-700"
      >
        Retour à la carte
      </Link>
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-auto border-t border-stone-200 bg-white py-4">
      <p className="px-4 text-center text-xs text-stone-500">
        Click &amp; Collect Express — démonstrateur technique (microservices, RabbitMQ et Socket.io derrière une
        passerelle API).
      </p>
    </footer>
  );
}

export default function App() {
  return (
    <SocketProvider>
      <BrowserRouter>
        <div className="flex min-h-screen flex-col bg-stone-50 text-stone-900">
          <Navbar />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<MenuPage />} />
              <Route path="/kitchen" element={<KitchenPage />} />
              <Route path="/order/:id" element={<TrackingPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </BrowserRouter>
    </SocketProvider>
  );
}
