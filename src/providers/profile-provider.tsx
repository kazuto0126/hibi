import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';

import type { Profile } from '@/constants/profile-options';
import { supabase } from '@/lib/supabase';

type ProfileState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; userId: string; profile: Profile | null };

type ProfileContextValue = {
  /** loading：正在登入和讀取設定；error：連不上伺服器；ready：讀好了。 */
  status: ProfileState['status'];
  /** 使用者的設定；還沒完成首次設定時是 null。 */
  profile: Profile | null;
  saveProfile: (profile: Profile) => Promise<void>;
  /** 讀取失敗時重新試一次。 */
  retry: () => Promise<void>;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

// 讓整個 App 都能讀到「目前的設定」。
// 打開 App 時先登入（第一次會自動建立匿名帳號），再從 Supabase 的 profiles 表讀出設定。
export function ProfileProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<ProfileState>({ status: 'loading' });

  const load = useCallback(async () => {
    try {
      const userId = await signIn();
      const profile = await fetchProfile(userId);
      setState({ status: 'ready', userId, profile });
    } catch (error) {
      console.warn('讀取設定失敗', error);
      setState({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveProfile(next: Profile) {
    if (state.status !== 'ready') {
      throw new Error('還沒登入，不能儲存設定');
    }
    const { error } = await supabase.from('profiles').upsert({ id: state.userId, ...next });
    if (error) throw error;
    setState({ status: 'ready', userId: state.userId, profile: next });
  }

  return (
    <ProfileContext.Provider
      value={{
        status: state.status,
        profile: state.status === 'ready' ? state.profile : null,
        saveProfile,
        retry: load,
      }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile 必須在 ProfileProvider 裡面使用');
  }
  return context;
}

// 手機裡已經有登入紀錄就沿用；沒有的話建立一個匿名帳號。回傳使用者 ID。
async function signIn(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  // 讀取登入紀錄出錯（例如沒網路）時直接放棄，不要另外建新帳號，免得原本的資料找不到。
  if (error) throw error;
  if (data.session) return data.session.user.id;

  const result = await supabase.auth.signInAnonymously();
  if (result.error) throw result.error;
  if (!result.data.user) throw new Error('匿名登入沒有回傳使用者');
  return result.data.user.id;
}

// 讀出這個使用者的設定；還沒做過首次設定的話回傳 null。
async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('level, goals, interests')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}
