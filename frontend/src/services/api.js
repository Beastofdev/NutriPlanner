import axios from 'axios';

// Usamos 127.0.0.1 explícitamente para evitar problemas de DNS en Windows
export const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8004";

// Resolve backend-relative image URLs to full URLs (needed when frontend/backend are on different domains)
export const resolveImageUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${API_URL.replace(/\/$/, '')}${url}`;
};

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000 // 60 segundos para generación de menú
});

// --- INTERCEPTORS (Token de seguridad) ---
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => Promise.reject(error));

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;

    // Auto-retry on network errors or 5xx (max 2 retries, not on auth endpoints)
    if (
      !config._retryCount &&
      !config.url?.includes('/auth/') &&
      (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED' || error.response?.status >= 500)
    ) {
      config._retryCount = (config._retryCount || 0) + 1;
      if (config._retryCount <= 2) {
        await new Promise(r => setTimeout(r, 1000 * config._retryCount));
        return apiClient(config);
      }
    }

    if (error.response?.status === 401 && !window.location.pathname.includes('/login') && !config._skipAuthRedirect) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const api = {
  // --- AUTH ---
  login: async (email, password) => {
    const response = await apiClient.post('/auth/token', { email, password });
    return response.data;
  },

  register: async (userData) => {
    const payload = {
      email: userData.email,
      password: userData.password,
      full_name: userData.fullName || userData.full_name
    };
    const response = await apiClient.post('/auth/register', payload);
    return response.data;
  },

  getProfile: async () => {
    const response = await apiClient.get('/users/me');
    return response.data;
  },

  updateProfile: async (data) => {
    const response = await apiClient.put('/users/me', data);
    return response.data;
  },

  // --- PLANIFICADOR Y MENÚ ---

  // Obtener plan activo desde DB (restauración tras re-login)
  getActivePlan: async () => {
    const response = await apiClient.get('/api/active-plan');
    return response.data;
  },

  saveTracking: async (trackingData) => {
    const response = await apiClient.put('/api/tracking', trackingData);
    return response.data;
  },

  // Persistir tracking diario en tabla daily_tracking (histórico)
  saveDailyTracking: async (data) => {
    const response = await apiClient.put('/api/daily-tracking', data);
    return response.data;
  },

  // Adoptar plan de guest tras registro (migrar localStorage → DB)
  adoptPlan: async (planData, wizardData) => {
    const response = await apiClient.put('/api/adopt-plan', {
      plan_data: planData,
      wizard_data: wizardData,
    });
    return response.data;
  },

  // Generar Menú V3 - Con recetas verificadas
  // Devuelve: { menu, shopping_list, comparison, estimated_cost, sistema }
  generatePlanV3: async (wizardData) => {
    const response = await apiClient.post('/api/generate-plan-v3', wizardData);
    return response.data;
  },

  // Regenerar un solo plato (determinista, sin Gemini)
  regenerateDish: async (currentDish, calories, dietType = null, allergens = [], hatedFoods = [], mealType = null, excludedRecipeIds = []) => {
    const payload = {
      current_dish: currentDish,
      calories: calories
    };

    if (dietType) payload.diet_type = dietType;
    if (allergens && allergens.length > 0) payload.allergens = allergens;
    if (hatedFoods && hatedFoods.length > 0) payload.hated_foods = hatedFoods;
    if (mealType) payload.meal_type = mealType;
    if (excludedRecipeIds && excludedRecipeIds.length > 0) payload.excluded_recipe_ids = excludedRecipeIds;

    const response = await apiClient.post('/api/regenerate-dish', payload);
    return response.data;
  },

  // Obtener detalles completos de una receta (pasos, ingredientes detallados)
  // [FIX] Ahora acepta ingredientes originales para mantener coherencia menú-receta
  getRecipeDetails: async (dishName, originalIngredients = null, porciones = 1.0) => {
    const payload = { dish_name: dishName, porciones };
    if (originalIngredients && originalIngredients.length > 0) {
      payload.original_ingredients = originalIngredients;
    }
    const response = await apiClient.post('/api/recipe-details', payload);
    return response.data;
  },

  // Search recipes by available ingredients
  searchRecipesByIngredients: async (ingredients, limit = 20) => {
    const response = await apiClient.post('/api/recipes/by-ingredients', { ingredients, limit });
    return response.data;
  },

  // --- LISTA DE LA COMPRA E INVENTARIO ---

  // Obtener la lista
  getShoppingList: async () => {
    const response = await apiClient.get('/api/shopping-list');
    return response.data;
  },

  // Marcar/Desmarcar item
  toggleItem: async (itemId) => {
    const response = await apiClient.patch(`/api/shopping-list/${itemId}/toggle`);
    return response.data;
  },

  // --- COMPARADOR DE PRECIOS ---
  comparePrices: async (ingredientsList) => {
    const response = await apiClient.post('/api/compare', ingredientsList);
    return response.data;
  },

  // --- AGREGADOR DE LISTA SEMANAL ---
  aggregateShoppingList: async (menu) => {
    const response = await apiClient.post('/api/aggregate-shopping-list', {
      menu: menu,
      prioritize_offers: true
    });
    return response.data;
  },

  // [LOBOTOMIZED VERSION] Pure aggregation without comparator (< 200ms)
  aggregateIngredientsOnly: async (menu) => {
    const response = await apiClient.post('/api/aggregate-ingredients-only', {
      menu: menu
    });
    return response.data;
  },

  // [V2] Recalcular lista de compra despues de regenerar platos
  recalculateShoppingV2: async (menu, productsMap) => {
    const response = await apiClient.post('/api/recalculate-shopping-v2', {
      menu: menu,
      products_map: productsMap
    });
    return response.data;
  },

  // [V3] Recalcular lista de compra tras regenerar platos (híbrido recipe_id + ingredientes_v2)
  recalculateShoppingV3: async (menu) => {
    const response = await apiClient.post('/api/recalculate-shopping-v3', {
      menu: menu,
    });
    return response.data;
  },

  // --- INVENTARIO ---
  getInventory: async ({ skipAuthRedirect = false } = {}) => {
    const response = await apiClient.get('/api/inventory/', { _skipAuthRedirect: skipAuthRedirect });
    return response.data;
  },

  addInventoryItem: async (item) => {
    const response = await apiClient.post('/api/inventory/', item);
    return response.data;
  },

  updateInventoryItem: async (id, data) => {
    const response = await apiClient.patch(`/api/inventory/${id}`, data);
    return response.data;
  },

  deleteInventoryItem: async (id) => {
    const response = await apiClient.delete(`/api/inventory/${id}`);
    return response.data;
  },

  getCommonIngredients: async () => {
    const response = await apiClient.get('/api/inventory/common-ingredients');
    return response.data;
  },

  decrementInventoryItems: async (items) => {
    const response = await apiClient.post('/api/inventory/decrement', { items });
    return response.data;
  },

  bulkUploadInventory: async (items) => {
    const response = await apiClient.post('/api/inventory/upload', { items });
    return response.data;
  },

  getPantryEssentials: async (diet = 'omnivoro') => {
    const response = await apiClient.get(`/api/inventory/pantry-essentials?diet=${diet}`);
    return response.data;
  },

  // --- RECIPE CATALOG ---
  getRecipes: async (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.meal_type) searchParams.set('meal_type', params.meal_type);
    if (params.diet) searchParams.set('diet', params.diet);
    if (params.search) searchParams.set('search', params.search);
    const qs = searchParams.toString();
    const response = await apiClient.get(`/api/recipes${qs ? '?' + qs : ''}`);
    return response.data;
  },

  // --- RECIPE RATINGS ---
  getRecipeRatings: async () => {
    const response = await apiClient.get('/api/recipe-ratings');
    return response.data;
  },

  rateRecipe: async (recipeId, rating) => {
    const response = await apiClient.post('/api/recipe-rating', {
      recipe_id: recipeId,
      rating,
    });
    return response.data;
  },

  deleteRecipeRating: async (recipeId) => {
    const response = await apiClient.delete(`/api/recipe-rating/${recipeId}`);
    return response.data;
  },

  getRecipeRecommendations: async () => {
    const response = await apiClient.get('/api/recipe-recommendations');
    return response.data;
  },

  // --- PLAN HISTORY ---
  getPlanHistory: async () => {
    const response = await apiClient.get('/api/plan-history');
    return response.data;
  },

  restorePlan: async (planId) => {
    const response = await apiClient.post(`/api/restore-plan/${planId}`);
    return response.data;
  },

  deletePlanHistory: async (planId) => {
    const response = await apiClient.delete(`/api/plan-history/${planId}`);
    return response.data;
  },

  // --- STREAK ---
  getUserStreak: async () => {
    const response = await apiClient.get('/api/user-streak');
    return response.data;
  },

  // --- SUPERMARKETS ---
  getSupermarkets: async () => {
    const response = await apiClient.get('/api/supermarkets');
    return response.data;
  },

  // --- SHOPPING STATS ---
  getShoppingStats: async () => {
    const response = await apiClient.get('/api/shopping-stats');
    return response.data;
  },

  saveShoppingHistory: async (totalCost, totalSaved, supermarket) => {
    const response = await apiClient.post('/api/shopping-history', {
      total_cost: totalCost,
      total_saved: totalSaved,
      supermarket,
    });
    return response.data;
  },

  // --- FAMILY MEMBERS ---
  getFamilyMembers: async () => {
    const response = await apiClient.get('/api/family-members');
    return response.data;
  },

  addFamilyMember: async (member) => {
    const response = await apiClient.post('/api/family-members', member);
    return response.data;
  },

  updateFamilyMember: async (id, member) => {
    const response = await apiClient.put(`/api/family-members/${id}`, member);
    return response.data;
  },

  deleteFamilyMember: async (id) => {
    const response = await apiClient.delete(`/api/family-members/${id}`);
    return response.data;
  },

  getFamilySummary: async () => {
    const response = await apiClient.get('/api/family-summary');
    return response.data;
  },

  // --- PRODUCT COMPARATOR ---
  searchProducts: async (params) => {
    const response = await apiClient.get('/api/products/search', { params });
    return response.data;
  },

  getProductCategories: async () => {
    const response = await apiClient.get('/api/products/categories');
    return response.data;
  },

  compareProduct: async (q, limit = 20) => {
    const response = await apiClient.get('/api/products/compare', { params: { q, limit } });
    return response.data;
  },

  getProductRankings: async (type = 'cheapest_basket', limit = 20) => {
    const response = await apiClient.get('/api/products/rankings', { params: { type, limit } });
    return response.data;
  },
};