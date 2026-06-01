import { CategoriesTreeLoader } from "@/components/CategoriesTreeLoader";
import { PageShell } from "@/components/PageShell";

export default function CategoriesPage() {
  return (
    <PageShell variant="agent" title="Каталог">
      <CategoriesTreeLoader />
    </PageShell>
  );
}
