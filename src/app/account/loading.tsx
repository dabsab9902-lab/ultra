import { PageShell } from "@/components/PageShell";
import { AccountSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <PageShell variant="agent" title="Кабинет">
      <AccountSkeleton />
    </PageShell>
  );
}
