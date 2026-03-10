import { lazy, Suspense, Component } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/Toast';
import AppLayout from './components/AppLayout';
import PublicLayout from './components/PublicLayout';
import InstallBanner from './components/InstallBanner';
import ConsentBanner from './components/ConsentBanner';
import { initAnalytics } from './services/analytics';
import { initNotifications } from './utils/notifications';

// Auto-start local notification scheduler if previously enabled
initNotifications();

// Error Boundary — catches runtime errors and shows a fallback UI
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
    Sentry.captureException(error, { extra: { componentStack: errorInfo?.componentStack } });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen bg-[var(--color-bg-page)] flex items-center justify-center font-sans">
          <div className="flex flex-col items-center gap-4 text-center px-6">
            <div className="text-4xl">⚠️</div>
            <h2 className="text-xl font-bold text-[var(--color-text-primary)]">Algo salió mal</h2>
            <p className="text-[var(--color-text-secondary)] max-w-md">
              Ha ocurrido un error inesperado. Recarga la página para continuar.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 px-6 py-2 bg-[var(--color-primary)] text-white font-semibold rounded-lg hover:bg-[var(--color-primary-dark)] transition-colors"
            >
              Recargar página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Lazy-loaded pages (code splitting)
// Public pages (no auth required)
const Landing = lazy(() => import('./pages/Landing'));
const Comparar = lazy(() => import('./pages/Comparar'));
const Planificar = lazy(() => import('./pages/Planificar'));
const MiMenu = lazy(() => import('./pages/MiMenu'));
const RecipePublic = lazy(() => import('./pages/RecipePublic'));

// Auth pages
const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));

// App pages (behind sidebar layout)
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Home = lazy(() => import('./pages/Home'));
const Menu = lazy(() => import('./pages/Menu'));
const Perfil = lazy(() => import('./pages/Perfil'));
const Ajustes = lazy(() => import('./pages/Ajustes'));
const Alergias = lazy(() => import('./pages/Alergias'));
const Metricas = lazy(() => import('./pages/Metricas'));
const Recipe = lazy(() => import('./pages/Recipe'));
const Recetas = lazy(() => import('./pages/Recetas'));
const Inventario = lazy(() => import('./pages/Inventario'));
const MisFavoritas = lazy(() => import('./pages/MisFavoritas'));
const Familia = lazy(() => import('./pages/Familia'));
const MiCompra = lazy(() => import('./pages/MiCompra'));
const Privacidad = lazy(() => import('./pages/legal/Privacidad'));

const PageLoader = () => (
  <div className="h-screen bg-[var(--color-bg-page)] flex items-center justify-center font-sans">
    <div className="flex flex-col items-center gap-4">
      <div className="w-12 h-12 border-4 border-[var(--color-primary)]/30 border-t-[var(--color-primary)] rounded-full animate-spin"></div>
    </div>
  </div>
);

// Componente de Ruta Protegida
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen bg-[var(--color-bg-page)] flex items-center justify-center text-[var(--color-primary)] font-bold">Cargando NutriPlanner...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

// Componente de Ruta Pública
const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return null;

  if (isAuthenticated) {
    return <Navigate to="/app" replace />;
  }

  return children;
};

// Componente Ruta Híbrida (Invitados + Usuarios)
const GuestAllowedRoute = ({ children }) => {
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    return <PageLoader />;
  }

  if (!isAuthenticated && sessionStorage.getItem('nutriplanner_logged_out')) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

function App() {
  return (
    <ErrorBoundary>
    <Router>
      <ToastProvider>
        <AuthProvider>
          <InstallBanner />
          <ConsentBanner onConsent={(level) => {
            if (level === 'all') {
              initAnalytics();
              // Sentry was initialized at module level in main.jsx on next page load
            }
          }} />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* ======= PUBLIC ROUTES (PublicLayout: header + no sidebar) ======= */}
              <Route element={<PublicLayout />}>
                <Route path="/" element={<Landing />} />
                <Route path="/comparar" element={<Comparar />} />
                <Route path="/planificar" element={<Planificar />} />
                <Route path="/mi-menu" element={<MiMenu />} />
                <Route path="/recetas" element={<Recetas />} />
                <Route path="/recetas/:slug" element={<RecipePublic />} />
              </Route>

              {/* ======= AUTH ROUTES ======= */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* ======= APP ROUTES (AppLayout: sidebar on desktop) ======= */}
              <Route path="/app" element={
                <GuestAllowedRoute>
                  <Dashboard />
                </GuestAllowedRoute>
              } />

              <Route path="/app/home" element={
                <GuestAllowedRoute>
                  <AppLayout><Home /></AppLayout>
                </GuestAllowedRoute>
              } />

              <Route path="/app/menu" element={
                <GuestAllowedRoute>
                  <AppLayout><Menu /></AppLayout>
                </GuestAllowedRoute>
              } />

              <Route path="/app/recetas" element={
                <GuestAllowedRoute>
                  <AppLayout><Recetas /></AppLayout>
                </GuestAllowedRoute>
              } />

              <Route path="/app/receta" element={
                <GuestAllowedRoute>
                  <AppLayout><Recipe /></AppLayout>
                </GuestAllowedRoute>
              } />

              <Route path="/app/lista" element={<Navigate to="/app/mi-compra" replace />} />
              <Route path="/app/comparador" element={<Navigate to="/app/mi-compra" replace />} />

              <Route path="/app/perfil" element={
                <ProtectedRoute>
                  <AppLayout><Perfil /></AppLayout>
                </ProtectedRoute>
              } />

              <Route path="/app/ajustes" element={
                <GuestAllowedRoute>
                  <AppLayout><Ajustes /></AppLayout>
                </GuestAllowedRoute>
              } />

              <Route path="/app/perfil/metricas" element={
                <ProtectedRoute>
                  <AppLayout><Metricas /></AppLayout>
                </ProtectedRoute>
              } />

              <Route path="/app/perfil/alergias" element={
                <ProtectedRoute>
                  <AppLayout><Alergias /></AppLayout>
                </ProtectedRoute>
              } />

              <Route path="/app/despensa" element={
                <GuestAllowedRoute>
                  <AppLayout><Inventario /></AppLayout>
                </GuestAllowedRoute>
              } />
              <Route path="/app/inventario" element={<Navigate to="/app/despensa" replace />} />

              <Route path="/app/favoritas" element={
                <ProtectedRoute>
                  <AppLayout><MisFavoritas /></AppLayout>
                </ProtectedRoute>
              } />

              <Route path="/app/familia" element={
                <ProtectedRoute>
                  <AppLayout><Familia /></AppLayout>
                </ProtectedRoute>
              } />

              <Route path="/app/mi-compra" element={
                <GuestAllowedRoute>
                  <AppLayout><MiCompra /></AppLayout>
                </GuestAllowedRoute>
              } />

              {/* Legal */}
              <Route path="/privacidad" element={<Privacidad />} />

              {/* Catch-all */}
              <Route path="/app/*" element={<Navigate to="/app/home" replace />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </ToastProvider>
    </Router>
    </ErrorBoundary>
  );
}

export default App;
