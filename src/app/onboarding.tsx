import { ProfileForm } from '@/components/profile-form';
import { useProfile } from '@/providers/profile-provider';

// 第一次打開 App 時的設定畫面。存好之後，_layout.tsx 會自動切換到首頁。
export default function OnboardingScreen() {
  const { saveProfile } = useProfile();

  return <ProfileForm submitLabel="開始學習" onSubmit={saveProfile} />;
}
