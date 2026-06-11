import AsyncStorage from '@react-native-async-storage/async-storage';

// PR-E: first-launch onboarding flag — once set, the post-login goal-setup
// routing never fires again.
const KEY = 'onboarding_done';

export async function isOnboardingDone(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === '1';
  } catch {
    // If storage is unreadable, treat onboarding as done (never block login).
    return true;
  }
}

export async function setOnboardingDone(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, '1');
  } catch {}
}
