import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeKV } from '../core/repo';

/** 手機上是 AsyncStorage；網頁上 AsyncStorage 會改用 localStorage。外面再包一層 SafeKV 防呆。 */
export const kv = new SafeKV({
  getItem: (k) => AsyncStorage.getItem(k),
  setItem: (k, v) => AsyncStorage.setItem(k, v),
  removeItem: (k) => AsyncStorage.removeItem(k),
});
