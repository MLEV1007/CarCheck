'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
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
      aria-label="Kijelentkezés"
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-linear-hairline bg-linear-surface-1 px-2.5 text-[13px] font-medium text-linear-ink transition-colors hover:bg-linear-surface-2 sm:px-3"
    >
      <LogOut className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Kijelentkezés</span>
    </button>
  );
}
