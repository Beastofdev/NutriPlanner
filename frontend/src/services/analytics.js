/**
 * PostHog analytics wrapper.
 * Only active when VITE_POSTHOG_KEY is configured.
 * All calls are no-ops without the env var — safe to import anywhere.
 */
import posthog from 'posthog-js';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://eu.i.posthog.com';

let initialized = false;

export function initAnalytics() {
    if (!POSTHOG_KEY || initialized) return;
    posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        autocapture: false,
        capture_pageview: true,
        capture_pageleave: true,
        persistence: 'localStorage',
    });
    initialized = true;
}

export function identify(userId, traits = {}) {
    if (!initialized) return;
    posthog.identify(String(userId), traits);
}

export function track(event, properties = {}) {
    if (!initialized) return;
    posthog.capture(event, properties);
}

export function resetAnalytics() {
    if (!initialized) return;
    posthog.reset();
}
