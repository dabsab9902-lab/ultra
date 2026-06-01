import { PageShell } from "@/components/PageShell";
import { CatalogSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <PageShell variant="agent" hideHeader>
      <CatalogSkeleton />
    </PageShell>
  );
}
