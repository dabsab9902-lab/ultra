import { PageShell } from "@/components/PageShell";
import { ProductDetailSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <PageShell variant="agent" title="Артикул">
      <ProductDetailSkeleton />
    </PageShell>
  );
}
