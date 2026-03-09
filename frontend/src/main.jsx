import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { initAnalytics } from './services/analytics'
import { getConsent } from './components/ConsentBanner'
import './index.css'
import App from './App.jsx'
import { ThemeProvider } from './context/ThemeContext'

// Only initialize tracking services if user consented to 'all' cookies
const consent = getConsent();

if (consent === 'all') {
  // Initialize Sentry error monitoring (only when DSN is configured + consent given)
  if (import.meta.env.VITE_SENTRY_DSN) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
      ],
      tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
    });
  }

  // Initialize PostHog analytics (only when key is configured + consent given)
  initAnalytics();
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
