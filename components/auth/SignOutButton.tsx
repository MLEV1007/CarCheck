'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className="rounded-md border border-linear-hairline bg-linear-surface-1 px-3 py-1.5 text-[14px] font-medium text-linear-ink transition-colors hover:bg-linear-surface-2"
    >
      Kijelentkezés
    </button>
  );
}
