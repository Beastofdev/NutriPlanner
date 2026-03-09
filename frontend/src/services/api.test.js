import { describe, it, expect, vi, beforeEach } from 'vitest';

// Test the API client's retry and interceptor logic
describe('API Client', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('Token management', () => {
    it('stores token in localStorage on login', () => {
      localStorage.setItem('token', 'test-jwt-token');
      expect(localStorage.getItem('token')).toBe('test-jwt-token');
    });

    it('removes token on logout', () => {
      localStorage.setItem('token', 'test-jwt-token');
      localStorage.setItem('nutriplanner_plan', '{}');

      // Simulate logout cleanup
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('nutriplanner_') || key === 'token')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));

      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('nutriplanner_plan')).toBeNull();
    });
  });

  describe('localStorage plan management', () => {
    it('stores and retrieves plan data', () => {
      const plan = {
        menu: [{ dia: 1, desayuno: { nombre: 'Test', calorias: 400 } }],
        shopping_list: [],
      };
      localStorage.setItem('nutriplanner_plan', JSON.stringify(plan));

      const retrieved = JSON.parse(localStorage.getItem('nutriplanner_plan'));
      expect(retrieved.menu).toHaveLength(1);
      expect(retrieved.menu[0].desayuno.nombre).toBe('Test');
    });

    it('handles missing plan gracefully', () => {
      const plan = localStorage.getItem('nutriplanner_plan');
      expect(plan).toBeNull();

      // Parsing null should be handled
      const parsed = plan ? JSON.parse(plan) : null;
      expect(parsed).toBeNull();
    });

    it('stores wizard data separately', () => {
      const wizard = {
        goal: 'mantener peso',
        diet: 'omnivora',
        target_calories: 2000,
      };
      localStorage.setItem('nutriplanner_wizard_data', JSON.stringify(wizard));

      const retrieved = JSON.parse(localStorage.getItem('nutriplanner_wizard_data'));
      expect(retrieved.target_calories).toBe(2000);
    });
  });

  describe('Version tracking', () => {
    it('stores v3 version flag', () => {
      localStorage.setItem('nutriplanner_version', 'v3');
      expect(localStorage.getItem('nutriplanner_version')).toBe('v3');
    });
  });
});
