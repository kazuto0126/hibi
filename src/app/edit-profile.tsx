import { useRouter } from 'expo-router';

import { ProfileForm } from '@/components/profile-form';
import type { Profile } from '@/constants/profile-options';
import { useProfile } from '@/providers/profile-provider';

// 從「我的」分頁進來修改設定，存好或取消後回到上一頁。
export default function EditProfileScreen() {
  const router = useRouter();
  const { profile, saveProfile } = useProfile();

  async function handleSubmit(next: Profile) {
    await saveProfile(next);
    router.back();
  }

  return (
    <ProfileForm
      initialProfile={profile}
      submitLabel="儲存"
      onSubmit={handleSubmit}
      onCancel={() => router.back()}
    />
  );
}
