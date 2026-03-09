/**
 * brand.js — Centralized brand configuration for NutriPlanner.
 *
 * All brand strings, URLs, and localStorage keys flow through this file.
 * To white-label for a new client, only this file needs to change.
 */

export const BRAND = {
  name: import.meta.env.VITE_APP_NAME || 'NutriPlanner',
  tagline: 'Tu planificador nutricional inteligente',
  initials: 'NP',
  version: '1.0',
  supportEmail: 'soporte@nutriplanner.es',
  siteUrl: 'nutriplanner.vercel.app',
};

/** localStorage key prefix — prevents collision with other apps */
export const LS_PREFIX = 'nutriplanner_';

/** Build a prefixed localStorage key */
export const lsKey = (key) => `${LS_PREFIX}${key}`;
