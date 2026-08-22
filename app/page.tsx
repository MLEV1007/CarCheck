import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// Ideiglenes gyökér route, amíg nincs kész landing/árazás oldal (Stripe stílusban,
// következő lépés), egyszerűen a megfelelő helyre irányítjuk a látogatót.
export default async function RootPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  redirect(data?.claims ? '/dashboard' : '/login');
}
