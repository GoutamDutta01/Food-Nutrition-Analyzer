/**
 * NutriScan Firestore Persistence Layer
 * Implements strict user isolation: users/{uid}/...
 */
import { 
  db, 
  doc, 
  collection, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  serverTimestamp,
  handleFirestoreError 
} from './firebase.js';

/**
 * Load or create initial user profile in Firestore
 */
export async function syncUserProfile(uid, initialData = {}) {
  const profileRef = doc(db, 'users', uid, 'profile', 'info');
  try {
    const snap = await getDoc(profileRef);
    if (snap.exists()) {
      return snap.data();
    } else {
      const defaultProfile = {
        name: initialData.name || 'Clinical Member',
        email: initialData.email || '',
        age: 30,
        gender: 'Not specified',
        height: 175,
        weight: 70,
        activityLevel: 'Moderately Active',
        goal: 'Maintain Weight & Vitality',
        calorieTarget: 2200,
        proteinTarget: 110,
        carbTarget: 280,
        fatTarget: 70,
        fiberTarget: 35,
        updatedAt: new Date().toISOString()
      };
      await setDoc(profileRef, defaultProfile);
      return defaultProfile;
    }
  } catch (error) {
    handleFirestoreError(error, 'get', `users/${uid}/profile/info`);
    return null;
  }
}

/**
 * Update user profile in Firestore
 */
export async function saveUserProfile(uid, profileData) {
  const profileRef = doc(db, 'users', uid, 'profile', 'info');
  try {
    const dataToSave = {
      ...profileData,
      updatedAt: new Date().toISOString()
    };
    await setDoc(profileRef, dataToSave, { merge: true });
    return true;
  } catch (error) {
    handleFirestoreError(error, 'update', `users/${uid}/profile/info`);
    throw error;
  }
}

/**
 * Real-time listener for user meals
 */
export function subscribeMeals(uid, onUpdate) {
  const mealsCol = collection(db, 'users', uid, 'meals');
  return onSnapshot(mealsCol, (snapshot) => {
    const meals = [];
    snapshot.forEach(docSnap => {
      meals.push({ id: docSnap.id, ...docSnap.data() });
    });
    onUpdate(meals);
  }, (error) => {
    handleFirestoreError(error, 'get', `users/${uid}/meals`);
  });
}

/**
 * Add a new meal item to Firestore
 */
export async function addMealItem(uid, mealData) {
  const mealsCol = collection(db, 'users', uid, 'meals');
  try {
    const docData = {
      ...mealData,
      userId: uid,
      createdAt: new Date().toISOString()
    };
    const docRef = await addDoc(mealsCol, docData);
    return { id: docRef.id, ...docData };
  } catch (error) {
    handleFirestoreError(error, 'create', `users/${uid}/meals`);
    throw error;
  }
}

/**
 * Update meal item quantity
 */
export async function updateMealQuantity(uid, mealId, newQuantity) {
  const mealRef = doc(db, 'users', uid, 'meals', mealId);
  try {
    if (newQuantity <= 0) {
      await deleteDoc(mealRef);
      return null;
    } else {
      await updateDoc(mealRef, { quantity: newQuantity });
      return newQuantity;
    }
  } catch (error) {
    handleFirestoreError(error, 'update', `users/${uid}/meals/${mealId}`);
    throw error;
  }
}

/**
 * Delete a meal item
 */
export async function deleteMealItem(uid, mealId) {
  const mealRef = doc(db, 'users', uid, 'meals', mealId);
  try {
    await deleteDoc(mealRef);
    return true;
  } catch (error) {
    handleFirestoreError(error, 'delete', `users/${uid}/meals/${mealId}`);
    throw error;
  }
}

/**
 * Real-time listener for favorites
 */
export function subscribeFavorites(uid, onUpdate) {
  const favsCol = collection(db, 'users', uid, 'favorites');
  return onSnapshot(favsCol, (snapshot) => {
    const favs = [];
    snapshot.forEach(docSnap => {
      favs.push({ foodId: docSnap.id, ...docSnap.data() });
    });
    onUpdate(favs);
  }, (error) => {
    handleFirestoreError(error, 'get', `users/${uid}/favorites`);
  });
}

/**
 * Add favorite
 */
export async function addFavorite(uid, foodItem) {
  const favRef = doc(db, 'users', uid, 'favorites', foodItem.id);
  try {
    const favData = {
      foodId: foodItem.id,
      name: foodItem.name,
      serving: foodItem.serving,
      calories: foodItem.calories,
      protein: foodItem.protein,
      carbs: foodItem.carbs,
      fat: foodItem.fat,
      userId: uid,
      createdAt: new Date().toISOString()
    };
    await setDoc(favRef, favData);
    return favData;
  } catch (error) {
    handleFirestoreError(error, 'create', `users/${uid}/favorites/${foodItem.id}`);
    throw error;
  }
}

/**
 * Remove favorite
 */
export async function removeFavorite(uid, foodId) {
  const favRef = doc(db, 'users', uid, 'favorites', foodId);
  try {
    await deleteDoc(favRef);
    return true;
  } catch (error) {
    handleFirestoreError(error, 'delete', `users/${uid}/favorites/${foodId}`);
    throw error;
  }
}

/**
 * Real-time listener for Chat History
 */
export function subscribeChatHistory(uid, onUpdate) {
  const chatCol = collection(db, 'users', uid, 'chatHistory', 'default', 'messages');
  return onSnapshot(chatCol, (snapshot) => {
    const msgs = [];
    snapshot.forEach(docSnap => {
      msgs.push({ id: docSnap.id, ...docSnap.data() });
    });
    // Sort chronologically by timestamp
    msgs.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    if (msgs.length > 0) {
      onUpdate(msgs);
    }
  }, (error) => {
    handleFirestoreError(error, 'get', `users/${uid}/chatHistory/default/messages`);
  });
}

/**
 * Save chat message to Firestore
 */
export async function saveChatMessage(uid, message) {
  const chatCol = collection(db, 'users', uid, 'chatHistory', 'default', 'messages');
  try {
    const msgData = {
      role: message.role,
      content: message.content,
      userId: uid,
      createdAt: new Date().toISOString(),
      timestamp: message.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    const docRef = await addDoc(chatCol, msgData);
    return { id: docRef.id, ...msgData };
  } catch (error) {
    handleFirestoreError(error, 'create', `users/${uid}/chatHistory/default/messages`);
    throw error;
  }
}

/**
 * Clear chat history
 */
export async function clearChatHistory(uid) {
  const chatCol = collection(db, 'users', uid, 'chatHistory', 'default', 'messages');
  try {
    const snap = await getDocs(chatCol);
    const deletes = [];
    snap.forEach(docSnap => {
      deletes.push(deleteDoc(docSnap.ref));
    });
    await Promise.all(deletes);
    return true;
  } catch (error) {
    handleFirestoreError(error, 'delete', `users/${uid}/chatHistory/default/messages`);
    throw error;
  }
}
