import { PageShell } from "@/components/PageShell";
import { ProductRowsSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <PageShell variant="agent" title="Избранное">
      <ProductRowsSkeleton count={6} />
    </PageShell>
  );
}
