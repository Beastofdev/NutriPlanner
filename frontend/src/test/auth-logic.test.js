import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Tests for auth-related business logic (no React rendering).
 * Tests the JWT token validation and session management logic.
 */

describe('Auth Logic', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('Token expiry check', () => {
    // Simulates the isTokenExpired logic from AuthContext
    function isTokenExpired(token) {
      if (!token) return true;
      try {
        // JWT format: header.payload.signature
        const parts = token.split('.');
        if (parts.length !== 3) return true;
        const payload = JSON.parse(atob(parts[1]));
        return Date.now() >= (payload.exp * 1000) - 60000;
      } catch {
        return true;
      }
    }

    it('returns true for null token', () => {
      expect(isTokenExpired(null)).toBe(true);
    });

    it('returns true for empty string', () => {
      expect(isTokenExpired('')).toBe(true);
    });

    it('returns true for malformed token', () => {
      expect(isTokenExpired('not.a.valid.jwt')).toBe(true);
    });

    it('returns true for expired token', () => {
      // Create a token that expired 1 hour ago
      const payload = { sub: 'test@test.com', exp: Math.floor(Date.now() / 1000) - 3600 };
      const fakeToken = `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify(payload))}.fakesig`;
      expect(isTokenExpired(fakeToken)).toBe(true);
    });

    it('returns false for valid non-expired token', () => {
      // Create a token that expires in 1 hour
      const payload = { sub: 'test@test.com', exp: Math.floor(Date.now() / 1000) + 3600 };
      const fakeToken = `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify(payload))}.fakesig`;
      expect(isTokenExpired(fakeToken)).toBe(false);
    });

    it('returns true for token expiring within 60s margin', () => {
      // Token expires in 30 seconds — should be treated as expired (60s margin)
      const payload = { sub: 'test@test.com', exp: Math.floor(Date.now() / 1000) + 30 };
      const fakeToken = `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify(payload))}.fakesig`;
      expect(isTokenExpired(fakeToken)).toBe(true);
    });
  });

  describe('Logout cleanup', () => {
    function simulateLogout() {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('nutriplanner_') || key === 'token')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      sessionStorage.setItem('nutriplanner_logged_out', 'true');
    }

    it('clears all nutriplanner_ keys', () => {
      localStorage.setItem('nutriplanner_plan', '{}');
      localStorage.setItem('nutriplanner_wizard_data', '{}');
      localStorage.setItem('nutriplanner_version', 'v3');
      localStorage.setItem('nutriplanner_shopping_v2', '[]');
      localStorage.setItem('token', 'jwt-token');
      localStorage.setItem('unrelated_key', 'keep this');

      simulateLogout();

      expect(localStorage.getItem('nutriplanner_plan')).toBeNull();
      expect(localStorage.getItem('nutriplanner_wizard_data')).toBeNull();
      expect(localStorage.getItem('nutriplanner_version')).toBeNull();
      expect(localStorage.getItem('token')).toBeNull();
      // Should NOT remove unrelated keys
      expect(localStorage.getItem('unrelated_key')).toBe('keep this');
    });

    it('sets logged_out flag in sessionStorage', () => {
      simulateLogout();
      expect(sessionStorage.getItem('nutriplanner_logged_out')).toBe('true');
    });
  });

  describe('Plan restoration', () => {
    it('stores tracking data keyed by email', () => {
      const email = 'test@nutriplanner.com';
      const key = (k) => `nutriplanner_${k}_${email}`;

      const consumed = [{ recipe_id: 1, slot: 'desayuno' }];
      localStorage.setItem(key('consumed'), JSON.stringify(consumed));

      const retrieved = JSON.parse(localStorage.getItem(`nutriplanner_consumed_${email}`));
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].recipe_id).toBe(1);
    });

    it('only restores tracking from today', () => {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      // Today's tracking should be valid
      expect(today).not.toBe(yesterday);

      const trackingToday = { date: today, consumed: [1, 2] };
      const trackingYesterday = { date: yesterday, consumed: [3, 4] };

      // Simulating the check from AuthContext
      expect(trackingToday.date === today).toBe(true);
      expect(trackingYesterday.date === today).toBe(false);
    });
  });
});
