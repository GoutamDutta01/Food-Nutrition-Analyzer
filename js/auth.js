/**
 * NutriScan Firebase Authentication Controller
 */
import { 
  auth, 
  googleProvider,
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  sendPasswordResetEmail, 
  signOut, 
  onAuthStateChanged,
  updateProfile
} from './firebase.js';

export function setupAuthListener(onUserChanged) {
  return onAuthStateChanged(auth, (user) => {
    onUserChanged(user);
  });
}

export async function loginWithEmail(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    return cred.user;
  } catch (error) {
    let msg = error.message;
    if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
      msg = 'Invalid email or password combination.';
    } else if (error.code === 'auth/wrong-password') {
      msg = 'Incorrect password.';
    } else if (error.code === 'auth/too-many-requests') {
      msg = 'Too many attempts. Please try again later.';
    }
    throw new Error(msg);
  }
}

export async function registerWithEmail(name, email, password) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    if (name && cred.user) {
      await updateProfile(cred.user, { displayName: name.trim() });
    }
    return cred.user;
  } catch (error) {
    let msg = error.message;
    if (error.code === 'auth/email-already-in-use') {
      msg = 'This email is already registered. Please sign in instead.';
    } else if (error.code === 'auth/weak-password') {
      msg = 'Password is too weak. Please use at least 6 characters.';
    }
    throw new Error(msg);
  }
}

export async function loginWithGoogle() {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    return cred.user;
  } catch (error) {
    throw new Error(error.message || 'Google sign-in was cancelled or failed.');
  }
}

export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email.trim());
    return true;
  } catch (error) {
    throw new Error(error.message || 'Failed to send password reset link.');
  }
}

export async function logoutUser() {
  try {
    await signOut(auth);
    return true;
  } catch (error) {
    throw new Error(error.message || 'Failed to log out.');
  }
}
