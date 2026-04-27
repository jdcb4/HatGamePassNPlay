import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'hat-game.state.v1';

export const loadSavedState = async <T>() => {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as T;
};

export const saveState = async (value: unknown) => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(value));
};

export const clearSavedState = async () => {
  await AsyncStorage.removeItem(STORAGE_KEY);
};

