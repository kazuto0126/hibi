import { createContext, useContext, useState, type PropsWithChildren } from 'react';

import type { Profile } from '@/constants/profile-options';

type ProfileContextValue = {
  /** 使用者的設定；還沒完成首次設定時是 null。 */
  profile: Profile | null;
  saveProfile: (profile: Profile) => Promise<void>;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

// 讓整個 App 都能讀到「目前的設定」。
// 2-1 先存在記憶體裡（重開 App 就會消失），2-2 會改成存到 Supabase。
export function ProfileProvider({ children }: PropsWithChildren) {
  const [profile, setProfile] = useState<Profile | null>(null);

  async function saveProfile(next: Profile) {
    setProfile(next);
  }

  return (
    <ProfileContext.Provider value={{ profile, saveProfile }}>{children}</ProfileContext.Provider>
  );
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile 必須在 ProfileProvider 裡面使用');
  }
  return context;
}
