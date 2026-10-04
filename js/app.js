/**
 * NutriScan Main Application Controller
 * Handles screen transitions, data bindings, meal calculations, and UI interactions
 */
import { state, subscribeState, notifyStateChange, getDailyTotals } from './state.js';
import { FOOD_DATABASE, getFoodById, searchFoods } from './foodDb.js';
import { setupAuthListener, loginWithEmail, registerWithEmail, loginWithGoogle, resetPassword, logoutUser } from './auth.js';
import { 
  syncUserProfile, 
  saveUserProfile, 
  subscribeMeals, 
  addMealItem, 
  updateMealQuantity, 
  deleteMealItem, 
  subscribeFavorites, 
  addFavorite, 
  removeFavorite, 
  subscribeChatHistory, 
  saveChatMessage, 
  clearChatHistory 
} from './firestoreData.js';
import { sendChatMessage } from './chatService.js';
import { testFirestoreConnection } from './firebase.js';

let unsubscribeMeals = null;
let unsubscribeFavs = null;
let unsubscribeChat = null;

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  // Test connection
  testFirestoreConnection();

  // Setup Auth state listener
  setupAuthListener(async (user) => {
    state.currentUser = user;
    if (user) {
      // Sync profile from Firestore
      const profile = await syncUserProfile(user.uid, {
        name: user.displayName || user.email.split('@')[0],
        email: user.email
      });
      if (profile) {
        state.userProfile = { ...state.userProfile, ...profile };
      }

      // Cleanup prior listeners
      if (unsubscribeMeals) unsubscribeMeals();
      if (unsubscribeFavs) unsubscribeFavs();
      if (unsubscribeChat) unsubscribeChat();

      // Subscribe to real-time collections
      unsubscribeMeals = subscribeMeals(user.uid, (meals) => {
        state.meals = meals;
        notifyStateChange();
      });

      unsubscribeFavs = subscribeFavorites(user.uid, (favs) => {
        state.favorites = favs;
        notifyStateChange();
      });

      unsubscribeChat = subscribeChatHistory(user.uid, (msgs) => {
        if (msgs && msgs.length > 0) {
          state.chatMessages = msgs;
          notifyStateChange();
        }
      });

      // If user is currently on an auth screen, transition to dashboard
      if (['login', 'register', 'forgot'].includes(state.currentScreen)) {
        navigateTo('dashboard');
      }
    } else {
      // User is logged out
      if (!['login', 'register', 'forgot'].includes(state.currentScreen)) {
        navigateTo('login');
      }
    }
    notifyStateChange();
  });

  // Subscribe state to render functions
  subscribeState(() => {
    renderUI();
  });

  // Bind static DOM events
  setupNavigationEvents();
  setupAuthFormEvents();
  setupSearchEvents();
  setupPortionScalerEvents();
  setupChatEvents();
  setupProfileEvents();
  setupModalEvents();

  // Initial render
  renderUI();
}

/**
 * Screen Navigation Controller
 */
export function navigateTo(screenId) {
  // Authentication guard
  const protectedScreens = ['dashboard', 'analyze', 'tracker', 'chat', 'favorites', 'compare', 'profile'];
  if (protectedScreens.includes(screenId) && !state.currentUser) {
    showToast('Please sign in to access your clinical nutrition records.');
    screenId = 'login';
  }

  state.currentScreen = screenId;

  // Toggle active screen visibility
  const allScreens = document.querySelectorAll('.app-screen');
  allScreens.forEach(sc => {
    if (sc.id === `screen-${screenId}`) {
      sc.classList.remove('hidden');
    } else {
      sc.classList.add('hidden');
    }
  });

  // Update navbar active state
  updateNavbarState(screenId);

  // Close mobile drawer if open
  closeMobileDrawer();

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });

  notifyStateChange();
}
window.navigateTo = navigateTo;

function updateNavbarState(screenId) {
  // Desktop header tabs
  document.querySelectorAll('[data-nav-screen]').forEach(el => {
    const target = el.getAttribute('data-nav-screen');
    if (target === screenId) {
      el.classList.add('bg-primary-container', 'text-on-primary', 'font-bold');
      el.classList.remove('text-on-surface-variant', 'hover:bg-surface-container-low');
    } else {
      el.classList.remove('bg-primary-container', 'text-on-primary', 'font-bold');
      el.classList.add('text-on-surface-variant', 'hover:bg-surface-container-low');
    }
  });

  // Mobile bottom navigation tabs
  document.querySelectorAll('[data-bottom-nav]').forEach(el => {
    const target = el.getAttribute('data-bottom-nav');
    if (target === screenId) {
      el.classList.add('text-primary');
      el.classList.remove('text-on-surface-variant');
    } else {
      el.classList.remove('text-primary');
      el.classList.add('text-on-surface-variant');
    }
  });
}

function closeMobileDrawer() {
  const drawer = document.getElementById('mobile-drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  if (drawer) drawer.classList.add('-translate-x-full');
  if (backdrop) backdrop.classList.add('opacity-0', 'pointer-events-none');
}
window.closeMobileDrawer = closeMobileDrawer;

/**
 * Event Listeners Setup
 */
function setupNavigationEvents() {
  document.querySelectorAll('[data-nav-target]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const target = el.getAttribute('data-nav-target');
      navigateTo(target);
    });
  });
}

function setupAuthFormEvents() {
  // Login Form
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail')?.value;
      const pwd = document.getElementById('loginPassword')?.value;
      const btn = document.getElementById('loginSubmitBtn');
      if (!email || !pwd) {
        showToast('Please enter both email and password.');
        return;
      }
      try {
        if (btn) { btn.disabled = true; btn.innerText = 'Authenticating...'; }
        await loginWithEmail(email, pwd);
        showToast('Welcome back to NutriScan!');
      } catch (err) {
        showToast(err.message || 'Authentication failed');
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = `<span>Log In</span><span class="material-symbols-outlined text-[18px]">arrow_forward</span>`; }
      }
    });
  }

  // Register Form
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('regName')?.value;
      const email = document.getElementById('regEmail')?.value;
      const pwd = document.getElementById('regPassword')?.value;
      const confirmPwd = document.getElementById('regConfirmPassword')?.value;
      const terms = document.getElementById('regTermsCheckbox')?.checked;
      const btn = document.getElementById('regSubmitBtn');

      if (!name || !email || !pwd) {
        showToast('Please fill out all registration fields.');
        return;
      }
      if (pwd !== confirmPwd) {
        showToast('Passwords do not match. Please verify.');
        return;
      }
      if (pwd.length < 6) {
        showToast('Password must be at least 6 characters long.');
        return;
      }
      if (!terms) {
        showToast('Please accept the Terms of Service to proceed.');
        return;
      }

      try {
        if (btn) { btn.disabled = true; btn.innerText = 'Creating Account...'; }
        const user = await registerWithEmail(name, email, pwd);
        await syncUserProfile(user.uid, { name, email });
        showToast('Account created successfully! Welcome to NutriScan.');
      } catch (err) {
        showToast(err.message || 'Registration failed');
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = `<span>Create Account</span><span class="material-symbols-outlined text-[18px]">arrow_forward</span>`; }
      }
    });
  }

  // Google Login Buttons
  document.querySelectorAll('.btn-google-login').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await loginWithGoogle();
        showToast('Google authentication successful!');
      } catch (err) {
        showToast(err.message || 'Google sign in failed');
      }
    });
  });

  // Guest Demo Login Button
  document.querySelectorAll('.btn-demo-login').forEach(btn => {
    btn.addEventListener('click', () => {
      state.currentUser = {
        uid: 'demo_user_clinical',
        email: 'aarav.patel@healthmail.com',
        displayName: 'Dr. Aarav Patel'
      };
      showToast('Logged in as Clinical Demo Member (Offline/Demo Mode)');
      navigateTo('dashboard');
    });
  });

  // Forgot Password Form
  const forgotForm = document.getElementById('forgotPasswordForm');
  if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('forgotEmail')?.value;
      const btn = document.getElementById('forgotSubmitBtn');
      if (!email) {
        showToast('Please enter your registered email address.');
        return;
      }
      try {
        if (btn) { btn.disabled = true; btn.innerText = 'Sending Link...'; }
        await resetPassword(email);
        document.getElementById('forgotFormBox')?.classList.add('hidden');
        document.getElementById('forgotSuccessBox')?.classList.remove('hidden');
        showToast('Password reset link sent! Check your inbox.');
      } catch (err) {
        showToast(err.message || 'Unable to send reset link.');
      } finally {
        if (btn) { btn.disabled = false; btn.innerText = 'Send Reset Link'; }
      }
    });
  }

  // Password visibility toggles
  document.querySelectorAll('[data-toggle-pwd]').forEach(btn => {
    btn.addEventListener('click', () => {
      const inputId = btn.getAttribute('data-toggle-pwd');
      const input = document.getElementById(inputId);
      const icon = btn.querySelector('.material-symbols-outlined');
      if (input) {
        if (input.type === 'password') {
          input.type = 'text';
          if (icon) icon.innerText = 'visibility_off';
        } else {
          input.type = 'password';
          if (icon) icon.innerText = 'visibility';
        }
      }
    });
  });
}

function setupSearchEvents() {
  const searchInput = document.getElementById('foodSearchInput');
  const suggestionsBox = document.getElementById('searchSuggestionsBox');

  if (searchInput && suggestionsBox) {
    searchInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (!val) {
        suggestionsBox.classList.add('hidden');
        return;
      }
      const matches = searchFoods(val);
      if (matches.length === 0) {
        suggestionsBox.innerHTML = `
          <div class="p-3 text-center text-on-surface-variant font-body-sm">
            No matching foods found in database.
          </div>
        `;
        suggestionsBox.classList.remove('hidden');
      } else {
        suggestionsBox.innerHTML = matches.slice(0, 5).map(f => `
          <div class="px-3 py-2.5 hover:bg-surface-container-low flex items-center justify-between cursor-pointer border-b border-surface-container last:border-0 transition-colors" data-select-food="${f.id}">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-[18px] text-primary">restaurant</span>
              <div>
                <p class="font-label-lg text-label-lg text-on-surface font-semibold">${f.name}</p>
                <p class="font-label-sm text-label-sm text-on-surface-variant">${f.serving} • ${f.calories} kcal</p>
              </div>
            </div>
            <span class="font-label-sm text-label-sm text-primary font-bold">P: ${f.protein}g</span>
          </div>
        `).join('');
        suggestionsBox.classList.remove('hidden');

        // Bind clicks to suggestions
        suggestionsBox.querySelectorAll('[data-select-food]').forEach(item => {
          item.addEventListener('click', () => {
            const fId = item.getAttribute('data-select-food');
            selectFoodForAnalysis(fId);
            suggestionsBox.classList.add('hidden');
            searchInput.value = '';
          });
        });
      }
    });

    // Close suggestions when clicking outside
    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
        suggestionsBox.classList.add('hidden');
      }
    });
  }
}

export function selectFoodForAnalysis(foodId) {
  const food = getFoodById(foodId);
  state.selectedFood = food;
  state.portionScale = 1.0;
  navigateTo('analyze');
}
window.selectFoodForAnalysis = selectFoodForAnalysis;

function setupPortionScalerEvents() {
  document.querySelectorAll('[data-scale]').forEach(btn => {
    btn.addEventListener('click', () => {
      const scale = parseFloat(btn.getAttribute('data-scale'));
      state.portionScale = scale;
      notifyStateChange();
    });
  });
}

function setupChatEvents() {
  const chatInput = document.getElementById('chatInput');
  const chatSendBtn = document.getElementById('chatSendBtn');

  if (chatSendBtn && chatInput) {
    const handleSend = async () => {
      const text = chatInput.value.trim();
      if (!text || state.isChatLoading) return;

      chatInput.value = '';
      await submitChatMessage(text);
    };

    chatSendBtn.addEventListener('click', handleSend);

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
  }

  // Suggestion buttons
  document.querySelectorAll('[data-chat-prompt]').forEach(btn => {
    btn.addEventListener('click', () => {
      const prompt = btn.getAttribute('data-chat-prompt');
      submitChatMessage(prompt);
    });
  });

  // Clear chat button
  const clearBtn = document.getElementById('clearChatBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      if (confirm('Clear chat conversation history?')) {
        if (state.currentUser?.uid) {
          await clearChatHistory(state.currentUser.uid);
        }
        state.chatMessages = [
          {
            role: 'assistant',
            content: 'Conversation cleared. How can I assist your nutrition tracking next?',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ];
        notifyStateChange();
      }
    });
  }
}

async function submitChatMessage(text) {
  const userMsg = {
    role: 'user',
    content: text,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  state.chatMessages.push(userMsg);
  state.isChatLoading = true;
  notifyStateChange();

  // Scroll chat to bottom
  scrollChatToBottom();

  // Save user message to Firestore if logged in
  if (state.currentUser?.uid) {
    try {
      await saveChatMessage(state.currentUser.uid, userMsg);
    } catch (e) {
      console.warn('Failed to persist user message', e);
    }
  }

  try {
    const replyText = await sendChatMessage(text, {
      userProfile: state.userProfile,
      dailyNutrition: {
        ...getDailyTotals(),
        calorieTarget: state.userProfile.calorieTarget,
        proteinTarget: state.userProfile.proteinTarget
      },
      recentMeals: state.meals,
      selectedFood: state.selectedFood
    });

    const aiMsg = {
      role: 'assistant',
      content: replyText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    state.chatMessages.push(aiMsg);

    // Save AI message to Firestore
    if (state.currentUser?.uid) {
      try {
        await saveChatMessage(state.currentUser.uid, aiMsg);
      } catch (e) {
        console.warn('Failed to persist AI message', e);
      }
    }
  } catch (err) {
    state.chatMessages.push({
      role: 'assistant',
      content: err.message || "NutriScan AI is temporarily unavailable. Please try again.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  } finally {
    state.isChatLoading = false;
    notifyStateChange();
    scrollChatToBottom();
  }
}

function scrollChatToBottom() {
  setTimeout(() => {
    const box = document.getElementById('chatMessagesContainer');
    if (box) box.scrollTop = box.scrollHeight;
  }, 50);
}

function setupProfileEvents() {
  const profileForm = document.getElementById('profileForm');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const updatedProfile = {
        name: document.getElementById('profName')?.value || state.userProfile.name,
        email: document.getElementById('profEmail')?.value || state.userProfile.email,
        age: parseInt(document.getElementById('profAge')?.value || state.userProfile.age),
        gender: document.getElementById('profGender')?.value || state.userProfile.gender,
        height: parseInt(document.getElementById('profHeight')?.value || state.userProfile.height),
        weight: parseFloat(document.getElementById('profWeight')?.value || state.userProfile.weight),
        activityLevel: document.getElementById('profActivity')?.value || state.userProfile.activityLevel,
        goal: document.getElementById('profGoal')?.value || state.userProfile.goal,
        calorieTarget: parseInt(document.getElementById('profCalories')?.value || state.userProfile.calorieTarget),
        proteinTarget: parseInt(document.getElementById('profProtein')?.value || state.userProfile.proteinTarget),
        carbTarget: parseInt(document.getElementById('profCarbs')?.value || state.userProfile.carbTarget),
        fatTarget: parseInt(document.getElementById('profFat')?.value || state.userProfile.fatTarget),
        fiberTarget: parseInt(document.getElementById('profFiber')?.value || state.userProfile.fiberTarget)
      };

      state.userProfile = updatedProfile;

      if (state.currentUser?.uid) {
        try {
          await saveUserProfile(state.currentUser.uid, updatedProfile);
          showToast('Profile and nutritional targets saved to Firestore!');
        } catch (err) {
          showToast('Failed to save to database. Updated locally.');
        }
      } else {
        showToast('Profile updated locally (Demo Mode).');
      }

      notifyStateChange();
    });
  }

  // Calculate targets button
  const calcBtn = document.getElementById('btnCalculateTargets');
  if (calcBtn) {
    calcBtn.addEventListener('click', () => {
      const age = parseInt(document.getElementById('profAge')?.value) || 30;
      const weight = parseFloat(document.getElementById('profWeight')?.value) || 70;
      const height = parseInt(document.getElementById('profHeight')?.value) || 175;
      const gender = document.getElementById('profGender')?.value || 'Male';
      const goal = document.getElementById('profGoal')?.value || 'Maintain Weight & Vitality';

      // Mifflin-St Jeor BMR Formula
      let bmr = (10 * weight) + (6.25 * height) - (5 * age);
      bmr = (gender === 'Female') ? bmr - 161 : bmr + 5;

      // Activity factor ~ 1.5
      let maintenance = Math.round(bmr * 1.5);
      if (goal.includes('Lose')) maintenance -= 400;
      if (goal.includes('Gain')) maintenance += 400;

      const cals = Math.max(1400, maintenance);
      const protein = Math.round(weight * 1.6);
      const fat = Math.round((cals * 0.25) / 9);
      const carbs = Math.round((cals - (protein * 4) - (fat * 9)) / 4);
      const fiber = Math.round(cals / 70);

      document.getElementById('profCalories').value = cals;
      document.getElementById('profProtein').value = protein;
      document.getElementById('profCarbs').value = carbs;
      document.getElementById('profFat').value = fat;
      document.getElementById('profFiber').value = fiber;

      showToast(`Estimated targets calculated: ${cals} kcal / ${protein}g protein`);
    });
  }

  // Sign out button
  document.querySelectorAll('.btn-logout').forEach(btn => {
    btn.addEventListener('click', async () => {
      await logoutUser();
      state.currentUser = null;
      showToast('Logged out successfully.');
      navigateTo('login');
    });
  });
}

function setupModalEvents() {
  // Add Food Modal Form
  const saveFoodBtn = document.getElementById('modalSaveFoodBtn');
  if (saveFoodBtn) {
    saveFoodBtn.addEventListener('click', async () => {
      const mealType = document.getElementById('modalMealSlot')?.value || 'lunch';
      const name = document.getElementById('modalFoodName')?.value || 'Custom Food';
      const serving = document.getElementById('modalServingSize')?.value || '1 serving';
      const calories = parseInt(document.getElementById('modalCalories')?.value) || 250;
      const protein = parseInt(document.getElementById('modalProtein')?.value) || 15;
      const carbs = parseInt(document.getElementById('modalCarbs')?.value) || 25;
      const fat = parseInt(document.getElementById('modalFats')?.value) || 8;

      const newMeal = {
        foodId: 'custom_' + Date.now(),
        name,
        mealType,
        serving,
        quantity: 1,
        calories,
        protein,
        carbs,
        fat,
        fiber: 2,
        sodium: 200,
        date: new Date().toISOString().split('T')[0]
      };

      if (state.currentUser?.uid) {
        try {
          await addMealItem(state.currentUser.uid, newMeal);
          showToast(`Logged ${name} (${calories} kcal) to ${mealType.toUpperCase()}!`);
        } catch (e) {
          state.meals.push({ id: 'm_local_' + Date.now(), ...newMeal });
          notifyStateChange();
          showToast(`Saved ${name} locally.`);
        }
      } else {
        state.meals.push({ id: 'm_local_' + Date.now(), ...newMeal });
        notifyStateChange();
        showToast(`Saved ${name} to ${mealType.toUpperCase()}!`);
      }

      closeModal();
    });
  }
}

/**
 * Global UI Renderer
 */
function renderUI() {
  const totals = getDailyTotals();
  const profile = state.userProfile;

  // 1. Render User Diagnostics & Top Ribbon
  const userEmailEls = document.querySelectorAll('.dyn-user-email');
  userEmailEls.forEach(el => {
    el.innerText = state.currentUser?.email || profile.email;
  });

  const userNameEls = document.querySelectorAll('.dyn-user-name');
  userNameEls.forEach(el => {
    el.innerText = state.currentUser?.displayName || profile.name;
  });

  // 2. Render Daily Telemetry Metrics
  renderDailyTelemetry(totals, profile);

  // 3. Render Meal Ledger Lists
  renderMealLedger();

  // 4. Render Analyze Screen
  renderAnalyzeScreen();

  // 5. Render Favorites Screen
  renderFavoritesScreen();

  // 6. Render Comparison Screen
  renderComparisonScreen();

  // 7. Render Chat History
  renderChatMessages();

  // 8. Hydration Tracker
  renderHydration();
}

function renderDailyTelemetry(totals, profile) {
  const calGoal = profile.calorieTarget || 2200;
  const calConsumed = totals.calories;
  const calRemaining = Math.max(0, calGoal - calConsumed);
  const calPercent = Math.min(100, Math.round((calConsumed / calGoal) * 100));

  // Circular gauge elements
  const consumedEls = document.querySelectorAll('.dyn-cal-consumed');
  consumedEls.forEach(el => el.innerText = calConsumed.toLocaleString());

  const goalEls = document.querySelectorAll('.dyn-cal-goal');
  goalEls.forEach(el => el.innerText = calGoal.toLocaleString());

  const remainingEls = document.querySelectorAll('.dyn-cal-remaining');
  remainingEls.forEach(el => el.innerText = calRemaining.toLocaleString());

  const calPctEls = document.querySelectorAll('.dyn-cal-pct');
  calPctEls.forEach(el => el.innerText = `${calPercent}%`);

  // Update SVG circular ring
  const circleTrack = document.getElementById('svgCalorieProgress');
  if (circleTrack) {
    const circumference = 314.16; // 2 * pi * 50
    const offset = circumference - (calPercent / 100) * circumference;
    circleTrack.style.strokeDashoffset = Math.max(0, offset);
  }

  // Protein
  const proteinGoal = profile.proteinTarget || 110;
  const proteinPct = Math.min(100, Math.round((totals.protein / proteinGoal) * 100));
  updateMacroBlock('protein', totals.protein, proteinGoal, proteinPct, 'g');

  // Carbs
  const carbGoal = profile.carbTarget || 280;
  const carbPct = Math.min(100, Math.round((totals.carbs / carbGoal) * 100));
  updateMacroBlock('carbs', totals.carbs, carbGoal, carbPct, 'g');

  // Fats
  const fatGoal = profile.fatTarget || 70;
  const fatPct = Math.min(100, Math.round((totals.fat / fatGoal) * 100));
  updateMacroBlock('fats', totals.fat, fatGoal, fatPct, 'g');
}

function updateMacroBlock(name, val, goal, pct, unit) {
  document.querySelectorAll(`.dyn-${name}-val`).forEach(el => el.innerText = `${val}${unit}`);
  document.querySelectorAll(`.dyn-${name}-goal`).forEach(el => el.innerText = `/ ${goal}${unit}`);
  document.querySelectorAll(`.dyn-${name}-bar`).forEach(el => el.style.width = `${pct}%`);
  document.querySelectorAll(`.dyn-${name}-pct`).forEach(el => el.innerText = `${pct}%`);
}

function renderMealLedger() {
  const mealTypes = ['breakfast', 'lunch', 'snacks', 'dinner'];

  mealTypes.forEach(type => {
    const container = document.getElementById(`ledger-list-${type}`);
    const summaryCal = document.getElementById(`ledger-cal-${type}`);
    const items = state.meals.filter(m => m.mealType === type);

    const typeCalories = items.reduce((sum, item) => sum + Math.round((item.calories || 0) * (item.quantity || 1)), 0);
    if (summaryCal) {
      summaryCal.innerText = `${typeCalories} kcal`;
    }

    if (container) {
      if (items.length === 0) {
        container.innerHTML = `
          <div class="p-3 text-center text-on-surface-variant font-body-sm bg-surface-container-low rounded-xl">
            No items logged yet for ${type}.
          </div>
        `;
      } else {
        container.innerHTML = items.map(item => `
          <div class="bg-surface-container-low p-2.5 rounded-xl flex items-center justify-between gap-2">
            <div class="min-w-0 flex-1">
              <p class="font-label-lg text-label-lg text-on-surface font-semibold truncate">${item.name}</p>
              <p class="font-label-sm text-label-sm text-on-surface-variant">
                P: ${Math.round((item.protein||0)*(item.quantity||1))}g • 
                F: ${Math.round((item.fat||0)*(item.quantity||1))}g • 
                C: ${Math.round((item.carbs||0)*(item.quantity||1))}g
                ${item.quantity > 1 ? ` (${item.quantity}x)` : ''}
              </p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="font-label-lg text-label-lg font-bold text-on-surface">
                ${Math.round((item.calories||0)*(item.quantity||1))} kcal
              </span>
              <div class="flex items-center bg-surface-container rounded-lg p-0.5">
                <button class="w-6 h-6 flex items-center justify-center text-on-surface-variant hover:text-error" onclick="handleMealQuantity('${item.id}', ${(item.quantity||1) - 1})">
                  <span class="material-symbols-outlined text-[14px]">remove</span>
                </button>
                <span class="font-label-sm px-1.5 font-bold">${item.quantity || 1}</span>
                <button class="w-6 h-6 flex items-center justify-center text-on-surface-variant hover:text-primary" onclick="handleMealQuantity('${item.id}', ${(item.quantity||1) + 1})">
                  <span class="material-symbols-outlined text-[14px]">add</span>
                </button>
              </div>
              <button class="w-7 h-7 flex items-center justify-center text-on-surface-variant hover:text-error rounded-lg" onclick="handleDeleteMeal('${item.id}')">
                <span class="material-symbols-outlined text-[16px]">delete</span>
              </button>
            </div>
          </div>
        `).join('');
      }
    }
  });
}

window.handleMealQuantity = async function(mealId, newQty) {
  if (state.currentUser?.uid) {
    await updateMealQuantity(state.currentUser.uid, mealId, newQty);
  } else {
    if (newQty <= 0) {
      state.meals = state.meals.filter(m => m.id !== mealId);
    } else {
      const target = state.meals.find(m => m.id === mealId);
      if (target) target.quantity = newQty;
    }
    notifyStateChange();
  }
};

window.handleDeleteMeal = async function(mealId) {
  if (state.currentUser?.uid) {
    await deleteMealItem(state.currentUser.uid, mealId);
    showToast('Meal item removed.');
  } else {
    state.meals = state.meals.filter(m => m.id !== mealId);
    notifyStateChange();
    showToast('Meal item removed.');
  }
};

function renderAnalyzeScreen() {
  const f = state.selectedFood || FOOD_DATABASE[0];
  const s = state.portionScale || 1.0;

  // Scaled values
  const scaledCal = Math.round(f.calories * s);
  const scaledProt = Math.round(f.protein * s * 10) / 10;
  const scaledCarbs = Math.round(f.carbs * s * 10) / 10;
  const scaledFat = Math.round(f.fat * s * 10) / 10;
  const scaledFiber = Math.round((f.fiber || 0) * s * 10) / 10;
  const scaledSugar = Math.round((f.sugar || 0) * s * 10) / 10;
  const scaledSodium = Math.round((f.sodium || 0) * s);

  // Caloric percentages for macro bar
  const totalMacroCal = (scaledProt * 4) + (scaledCarbs * 4) + (scaledFat * 9) || 1;
  const pctProt = Math.round(((scaledProt * 4) / totalMacroCal) * 100);
  const pctCarbs = Math.round(((scaledCarbs * 4) / totalMacroCal) * 100);
  const pctFat = 100 - pctProt - pctCarbs;

  // Update DOM elements on Analyze screen
  const titleEl = document.getElementById('analyzeFoodTitle');
  if (titleEl) titleEl.innerText = f.name;

  const descEl = document.getElementById('analyzeFoodDesc');
  if (descEl) descEl.innerText = f.description || '';

  const imgEl = document.getElementById('analyzeFoodImg');
  if (imgEl) imgEl.src = f.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80';

  const calEl = document.getElementById('analyzeFoodCalories');
  if (calEl) calEl.innerText = scaledCal;

  const protEl = document.getElementById('analyzeFoodProtein');
  if (protEl) protEl.innerText = `${scaledProt} g`;

  const carbsEl = document.getElementById('analyzeFoodCarbs');
  if (carbsEl) carbsEl.innerText = `${scaledCarbs} g`;

  const fatEl = document.getElementById('analyzeFoodFat');
  if (fatEl) fatEl.innerText = `${scaledFat} g`;

  const fiberEl = document.getElementById('analyzeFoodFiber');
  if (fiberEl) fiberEl.innerText = `${scaledFiber} g`;

  const sugarEl = document.getElementById('analyzeFoodSugar');
  if (sugarEl) sugarEl.innerText = `${scaledSugar} g`;

  const sodiumEl = document.getElementById('analyzeFoodSodium');
  if (sodiumEl) sodiumEl.innerText = `${scaledSodium} mg`;

  const scoreEl = document.getElementById('analyzeFoodNutriScore');
  if (scoreEl) scoreEl.innerText = f.nutriScore || 80;

  const gradeEl = document.getElementById('analyzeFoodNutriGrade');
  if (gradeEl) gradeEl.innerText = f.nutriGrade || 'Good Choice';

  // Macro distribution bar
  const barProt = document.getElementById('analyzeBarProtein');
  if (barProt) barProt.style.width = `${pctProt}%`;
  const barCarbs = document.getElementById('analyzeBarCarbs');
  if (barCarbs) barCarbs.style.width = `${pctCarbs}%`;
  const barFat = document.getElementById('analyzeBarFat');
  if (barFat) barFat.style.width = `${pctFat}%`;

  // Favorite status
  const isFav = state.favorites.some(fav => fav.foodId === f.id);
  const favBtn = document.getElementById('btnToggleFavorite');
  if (favBtn) {
    favBtn.innerHTML = isFav 
      ? `<span class="material-symbols-outlined text-[20px] text-error fill-1">favorite</span><span>Saved to Favorites</span>`
      : `<span class="material-symbols-outlined text-[20px]">favorite_border</span><span>Save to Favorites</span>`;
  }

  // Active portion scale pill
  document.querySelectorAll('[data-scale]').forEach(btn => {
    const val = parseFloat(btn.getAttribute('data-scale'));
    if (val === s) {
      btn.classList.add('bg-primary', 'text-on-primary');
      btn.classList.remove('bg-surface-container', 'text-on-surface');
    } else {
      btn.classList.remove('bg-primary', 'text-on-primary');
      btn.classList.add('bg-surface-container', 'text-on-surface');
    }
  });

  // Render bottom comparative snack alternative
  renderComparativeSnack(f, scaledCal, scaledProt);
}

function renderComparativeSnack(currentFood, curCal, curProt) {
  const alt = state.comparisonTarget || FOOD_DATABASE[1]; // Crisp Apple
  const altNameEl = document.getElementById('compAltName');
  if (altNameEl) altNameEl.innerText = alt.name;

  const altImg = document.getElementById('compAltImg');
  if (altImg) altImg.src = alt.image;

  const altCalEl = document.getElementById('compAltCal');
  if (altCalEl) altCalEl.innerText = `${alt.calories} kcal`;

  const diffCal = curCal - alt.calories;
  const summaryEl = document.getElementById('compSummaryText');
  if (summaryEl) {
    if (diffCal > 0) {
      summaryEl.innerHTML = `The <strong>${alt.name}</strong> provides identical dietary fiber (${alt.fiber}g vs ${currentFood.fiber || 0}g) with <strong>${diffCal} fewer calories</strong> and zero saturated fat. However, the ${currentFood.name} supplies <strong>${curProt}g</strong> bioavailable protein.`;
    } else {
      summaryEl.innerHTML = `Both dishes offer distinct nutrient profiles: ${currentFood.name} delivers ${curProt}g protein, while ${alt.name} delivers refreshing hydration and polyphenols.`;
    }
  }
}

function renderFavoritesScreen() {
  const container = document.getElementById('favoritesGrid');
  if (!container) return;

  if (state.favorites.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-12 text-center flex flex-col items-center justify-center gap-3">
        <div class="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center text-primary">
          <span class="material-symbols-outlined text-[28px]">favorite_border</span>
        </div>
        <p class="font-headline-sm text-headline-sm text-on-surface font-bold">No Favorites Yet</p>
        <p class="font-body-md text-on-surface-variant max-w-sm">Tap the heart icon on any analyzed dish to save it here for fast one-tap logging.</p>
        <button class="h-11 px-5 bg-primary text-on-primary rounded-xl font-label-lg font-bold shadow-sm" onclick="navigateTo('dashboard')">
          Explore Food Database
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = state.favorites.map(fav => {
    const dbItem = getFoodById(fav.foodId) || fav;
    return `
      <div class="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/30 overflow-hidden flex flex-col justify-between">
        <div class="relative h-36 w-full">
          <img src="${dbItem.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80'}" class="w-full h-full object-cover"/>
          <button class="absolute top-2.5 right-2.5 w-9 h-9 rounded-full bg-surface-container-lowest/80 backdrop-blur-md flex items-center justify-center text-error shadow-sm" onclick="handleRemoveFavorite('${fav.foodId}')">
            <span class="material-symbols-outlined text-[20px]">favorite</span>
          </button>
        </div>
        <div class="p-3.5 flex flex-col gap-2">
          <div>
            <h4 class="font-title-md text-title-md text-on-surface font-bold truncate">${fav.name}</h4>
            <p class="font-label-sm text-label-sm text-on-surface-variant">${fav.serving || '1 standard serving'}</p>
          </div>
          <div class="grid grid-cols-3 gap-1 bg-surface-container-low p-2 rounded-xl text-center">
            <div>
              <span class="font-label-sm text-on-surface-variant block">Energy</span>
              <span class="font-label-lg text-on-surface font-bold">${fav.calories}</span>
            </div>
            <div>
              <span class="font-label-sm text-on-surface-variant block">Protein</span>
              <span class="font-label-lg text-primary font-bold">${fav.protein}g</span>
            </div>
            <div>
              <span class="font-label-sm text-on-surface-variant block">Carbs</span>
              <span class="font-label-lg text-secondary font-bold">${fav.carbs || 0}g</span>
            </div>
          </div>
          <div class="flex items-center gap-2 pt-1">
            <button class="flex-1 h-9 bg-surface-container text-primary font-label-sm text-label-sm font-bold rounded-lg" onclick="selectFoodForAnalysis('${fav.foodId}')">
              Analyze
            </button>
            <button class="flex-1 h-9 bg-primary text-on-primary font-label-sm text-label-sm font-bold rounded-lg shadow-sm" onclick="quickAddFavoriteToMeal('${fav.foodId}')">
              + Add to Meal
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.handleRemoveFavorite = async function(foodId) {
  if (state.currentUser?.uid) {
    await removeFavorite(state.currentUser.uid, foodId);
  } else {
    state.favorites = state.favorites.filter(f => f.foodId !== foodId);
    notifyStateChange();
  }
  showToast('Removed from favorites.');
};

window.quickAddFavoriteToMeal = function(foodId) {
  const food = getFoodById(foodId);
  openModal(food.name, 'lunch');
  document.getElementById('modalCalories').value = food.calories;
  document.getElementById('modalProtein').value = food.protein;
  document.getElementById('modalCarbs').value = food.carbs;
  document.getElementById('modalFats').value = food.fat;
};

function renderComparisonScreen() {
  const selectA = document.getElementById('compareSelectA');
  const selectB = document.getElementById('compareSelectB');

  if (selectA && selectA.children.length <= 1) {
    selectA.innerHTML = FOOD_DATABASE.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
    selectA.value = state.selectedFood.id || FOOD_DATABASE[0].id;
  }
  if (selectB && selectB.children.length <= 1) {
    selectB.innerHTML = FOOD_DATABASE.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
    selectB.value = state.comparisonTarget.id || FOOD_DATABASE[1].id;
  }

  const foodA = getFoodById(selectA?.value || FOOD_DATABASE[0].id);
  const foodB = getFoodById(selectB?.value || FOOD_DATABASE[1].id);

  // Populate comparison table rows
  renderCompareRow('compRowCalories', 'Energy (kcal)', `${foodA.calories} kcal`, `${foodB.calories} kcal`, foodA.calories > foodB.calories ? 'A' : 'B');
  renderCompareRow('compRowProtein', 'Bio-Protein (g)', `${foodA.protein}g`, `${foodB.protein}g`, foodA.protein > foodB.protein ? 'A' : 'B');
  renderCompareRow('compRowCarbs', 'Carbohydrates (g)', `${foodA.carbs}g`, `${foodB.carbs}g`, foodA.carbs < foodB.carbs ? 'A' : 'B');
  renderCompareRow('compRowFats', 'Total Lipids (g)', `${foodA.fat}g`, `${foodB.fat}g`, foodA.fat < foodB.fat ? 'A' : 'B');
  renderCompareRow('compRowFiber', 'Dietary Fiber (g)', `${foodA.fiber || 0}g`, `${foodB.fiber || 0}g`, (foodA.fiber||0) > (foodB.fiber||0) ? 'A' : 'B');
  renderCompareRow('compRowSodium', 'Sodium (mg)', `${foodA.sodium || 0}mg`, `${foodB.sodium || 0}mg`, (foodA.sodium||0) < (foodB.sodium||0) ? 'A' : 'B');
  renderCompareRow('compRowNutriScore', 'NutriScore (100)', `${foodA.nutriScore || 75}`, `${foodB.nutriScore || 75}`, (foodA.nutriScore||0) > (foodB.nutriScore||0) ? 'A' : 'B');
}

function renderCompareRow(elId, label, valA, valB, winner) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = `
    <div class="py-2.5 px-3 flex items-center justify-between border-b border-surface-container text-body-sm">
      <span class="font-bold text-on-surface w-1/3 truncate">${label}</span>
      <span class="font-semibold text-center w-1/3 ${winner === 'A' ? 'text-primary font-bold' : 'text-on-surface'}">${valA}</span>
      <span class="font-semibold text-center w-1/3 ${winner === 'B' ? 'text-primary font-bold' : 'text-on-surface'}">${valB}</span>
    </div>
  `;
}

function renderChatMessages() {
  const container = document.getElementById('chatMessagesContainer');
  if (!container) return;

  const html = state.chatMessages.map(msg => {
    const isUser = msg.role === 'user';
    return `
      <div class="flex flex-col ${isUser ? 'items-end' : 'items-start'} mb-3">
        <div class="flex items-end gap-2 max-w-[85%] ${isUser ? 'flex-row-reverse' : 'flex-row'}">
          ${!isUser ? `
            <div class="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary shrink-0 shadow-sm">
              <span class="material-symbols-outlined text-[18px]">neurology</span>
            </div>
          ` : ''}
          <div class="px-4 py-2.5 rounded-2xl ${isUser ? 'bg-primary text-on-primary rounded-br-xs' : 'bg-surface-container-lowest text-on-surface border border-outline-variant/30 rounded-bl-xs shadow-sm'}">
            <p class="font-body-md text-body-md whitespace-pre-wrap leading-relaxed">${msg.content}</p>
          </div>
        </div>
        <span class="font-label-sm text-[10px] text-on-surface-variant mt-1 ${isUser ? 'mr-1' : 'ml-10'}">${msg.timestamp || ''}</span>
      </div>
    `;
  }).join('');

  // Append thinking bubble if loading
  const loadingHtml = state.isChatLoading ? `
    <div class="flex items-center gap-2 mb-3">
      <div class="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary shrink-0 animate-pulse">
        <span class="material-symbols-outlined text-[18px]">neurology</span>
      </div>
      <div class="px-4 py-2.5 rounded-2xl bg-surface-container-lowest text-primary font-label-md border border-outline-variant/30 shadow-sm flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-primary animate-ping"></span>
        <span>NutriScan AI is thinking...</span>
      </div>
    </div>
  ` : '';

  container.innerHTML = html + loadingHtml;
}

function renderHydration() {
  const cur = state.hydration;
  const max = state.maxHydration;
  const pct = Math.min(100, Math.round((cur / max) * 100));

  const valEl = document.getElementById('hydrationVal');
  if (valEl) valEl.innerText = `${cur.toLocaleString()} ml`;

  const barEl = document.getElementById('hydrationBar');
  if (barEl) barEl.style.width = `${pct}%`;
}

window.addHydration = function(amount) {
  state.hydration = Math.min(state.maxHydration, state.hydration + amount);
  renderHydration();
  showToast(`Hydration logged +${amount}ml (${state.hydration}/${state.maxHydration} ml)`);
};

/**
 * Add to Lunch Tracker / Meal Slot from Analyze Screen
 */
window.addAnalyzedToMeal = async function() {
  const f = state.selectedFood;
  const s = state.portionScale;
  const slotSelect = document.getElementById('analyzeMealSlotSelect');
  const mealType = slotSelect ? slotSelect.value : 'lunch';

  const newMeal = {
    foodId: f.id,
    name: f.name + (s !== 1.0 ? ` (${s}x)` : ''),
    mealType,
    serving: f.serving,
    quantity: 1,
    calories: Math.round(f.calories * s),
    protein: Math.round(f.protein * s),
    carbs: Math.round(f.carbs * s),
    fat: Math.round(f.fat * s),
    fiber: Math.round((f.fiber || 0) * s),
    sodium: Math.round((f.sodium || 0) * s),
    date: new Date().toISOString().split('T')[0]
  };

  if (state.currentUser?.uid) {
    try {
      await addMealItem(state.currentUser.uid, newMeal);
      showToast(`Added ${f.name} to ${mealType.toUpperCase()}!`);
    } catch (e) {
      state.meals.push({ id: 'm_local_' + Date.now(), ...newMeal });
      notifyStateChange();
      showToast(`Added ${f.name} to ${mealType.toUpperCase()}!`);
    }
  } else {
    state.meals.push({ id: 'm_local_' + Date.now(), ...newMeal });
    notifyStateChange();
    showToast(`Added ${f.name} to ${mealType.toUpperCase()}!`);
  }

  navigateTo('dashboard');
};

/**
 * Toggle Favorite from Analyze Screen
 */
window.toggleCurrentFavorite = async function() {
  const f = state.selectedFood;
  const isFav = state.favorites.some(fav => fav.foodId === f.id);

  if (isFav) {
    await window.handleRemoveFavorite(f.id);
  } else {
    if (state.currentUser?.uid) {
      await addFavorite(state.currentUser.uid, f);
    } else {
      state.favorites.push({
        foodId: f.id,
        name: f.name,
        serving: f.serving,
        calories: f.calories,
        protein: f.protein,
        carbs: f.carbs,
        fat: f.fat
      });
      notifyStateChange();
    }
    showToast(`Saved ${f.name} to Favorites!`);
  }
};

/**
 * Quick Logging helper
 */
window.quickLogFeaturedBowl = function() {
  const food = FOOD_DATABASE[0]; // Chicken Biryani
  selectFoodForAnalysis(food.id);
};

/**
 * Modal helpers
 */
window.openModal = function(initialName = '', mealSlot = 'breakfast') {
  const modal = document.getElementById('addFoodModal');
  const title = document.getElementById('modalMealTitle');
  const nameInput = document.getElementById('modalFoodName');
  const slotSelect = document.getElementById('modalMealSlot');

  if (title) title.innerText = `Add Food to ${mealSlot.toUpperCase()}`;
  if (nameInput) nameInput.value = initialName;
  if (slotSelect) slotSelect.value = mealSlot;

  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
};

window.closeModal = function() {
  const modal = document.getElementById('addFoodModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
};

/**
 * Global Toast System
 */
let toastTimer = null;
export function showToast(message) {
  const toast = document.getElementById('toastNotification');
  const msgEl = document.getElementById('toastMessage');
  if (!toast || !msgEl) return;

  msgEl.innerText = message;
  toast.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-4');
  toast.classList.add('opacity-100', 'translate-y-0');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    hideToast();
  }, 3500);
}
window.showToast = showToast;

export function hideToast() {
  const toast = document.getElementById('toastNotification');
  if (toast) {
    toast.classList.add('opacity-0', 'pointer-events-none', 'translate-y-4');
    toast.classList.remove('opacity-100', 'translate-y-0');
  }
}
window.hideToast = hideToast;
