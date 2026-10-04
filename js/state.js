/**
 * NutriScan Reactive State Manager
 */
import { FOOD_DATABASE } from './foodDb.js';

export const state = {
  currentUser: null,
  currentScreen: 'login', // 'login' | 'register' | 'forgot' | 'dashboard' | 'analyze' | 'tracker' | 'chat' | 'favorites' | 'compare' | 'profile'
  selectedFood: FOOD_DATABASE[0], // Hyderabadi Chicken Biryani default
  portionScale: 1.0,
  comparisonTarget: FOOD_DATABASE[1], // Crisp Orchard Red Apple
  hydration: 1750,
  maxHydration: 2500,
  
  userProfile: {
    name: 'Dr. Aarav Patel',
    email: 'aarav.patel@healthmail.com',
    age: 32,
    gender: 'Male',
    height: 178,
    weight: 74,
    activityLevel: 'Moderately Active',
    goal: 'Maintain Weight & Vitality',
    calorieTarget: 2200,
    proteinTarget: 110,
    carbTarget: 280,
    fatTarget: 70,
    fiberTarget: 35
  },

  // Today's logged meals (stored in Firestore)
  meals: [
    {
      id: "m_init_1",
      foodId: "boiled_egg",
      name: "2 Organic Farm Boiled Eggs",
      mealType: "breakfast",
      serving: "2 eggs (100g)",
      quantity: 1,
      calories: 140,
      protein: 12,
      carbs: 1,
      fat: 10,
      fiber: 0,
      sodium: 142,
      date: new Date().toISOString().split('T')[0]
    },
    {
      id: "m_init_2",
      foodId: "wheat_roti",
      name: "Multigrain Toast with Hass Avocado",
      mealType: "breakfast",
      serving: "2 slices (120g)",
      quantity: 1,
      calories: 270,
      protein: 6,
      carbs: 25,
      fat: 14,
      fiber: 6,
      sodium: 220,
      date: new Date().toISOString().split('T')[0]
    },
    {
      id: "m_init_3",
      foodId: "chicken_biryani",
      name: "Mediterranean Quinoa Chicken Harvest Bowl",
      mealType: "lunch",
      serving: "1 bowl (350g)",
      quantity: 1,
      calories: 520,
      protein: 34,
      carbs: 48,
      fat: 16,
      fiber: 7.5,
      sodium: 580,
      date: new Date().toISOString().split('T')[0]
    },
    {
      id: "m_init_4",
      foodId: "probiotic_curd",
      name: "Low-Fat Greek Yogurt Dip",
      mealType: "lunch",
      serving: "100g serving",
      quantity: 1,
      calories: 100,
      protein: 10,
      carbs: 6,
      fat: 2,
      fiber: 0,
      sodium: 45,
      date: new Date().toISOString().split('T')[0]
    },
    {
      id: "m_init_5",
      foodId: "crisp_apple",
      name: "Crisp Honeycrisp Orchard Apple",
      mealType: "snacks",
      serving: "1 medium apple (182g)",
      quantity: 1,
      calories: 95,
      protein: 0.5,
      carbs: 25,
      fat: 0.3,
      fiber: 4.4,
      sodium: 2,
      date: new Date().toISOString().split('T')[0]
    },
    {
      id: "m_init_6",
      foodId: "raw_almonds",
      name: "Dry Roasted California Almonds (15g)",
      mealType: "snacks",
      serving: "15g portion",
      quantity: 1,
      calories: 85,
      protein: 3.5,
      carbs: 3,
      fat: 7,
      fiber: 1.8,
      sodium: 1,
      date: new Date().toISOString().split('T')[0]
    }
  ],

  // Saved favorites (foodId -> item)
  favorites: [
    {
      foodId: "chicken_biryani",
      name: "Hyderabadi Chicken Biryani",
      serving: "1 standard serving (350g)",
      calories: 520,
      protein: 28,
      carbs: 62,
      fat: 18,
      fiber: 4.2
    },
    {
      foodId: "crisp_apple",
      name: "Crisp Orchard Red Apple",
      serving: "1 medium apple (182g)",
      calories: 95,
      protein: 0.5,
      carbs: 25,
      fat: 0.3,
      fiber: 4.4
    },
    {
      foodId: "paneer_tikka",
      name: "Fresh Paneer (Cottage Cheese)",
      serving: "100g portion",
      calories: 265,
      protein: 18,
      carbs: 3.5,
      fat: 20,
      fiber: 0
    }
  ],

  // AI Chat transcripts
  chatMessages: [
    {
      role: 'assistant',
      content: 'Hello! I am NutriScan AI, your personal clinical nutrition companion. How can I help optimize your meals and macros today?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ],

  isChatLoading: false
};

const listeners = new Set();

export function subscribeState(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function notifyStateChange() {
  listeners.forEach(cb => {
    try { cb(state); } catch (e) { console.error('State subscriber error', e); }
  });
}

// Compute daily nutrition aggregates from meals
export function getDailyTotals() {
  const totals = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    sodium: 0
  };

  state.meals.forEach(m => {
    const qty = m.quantity || 1;
    totals.calories += Math.round((m.calories || 0) * qty);
    totals.protein += Math.round((m.protein || 0) * qty);
    totals.carbs += Math.round((m.carbs || 0) * qty);
    totals.fat += Math.round((m.fat || 0) * qty);
    totals.fiber += Math.round(((m.fiber || 0) * qty) * 10) / 10;
    totals.sodium += Math.round((m.sodium || 0) * qty);
  });

  return totals;
}
