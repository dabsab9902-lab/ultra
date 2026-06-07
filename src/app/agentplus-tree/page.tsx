import { AgentPlusTreeBrowser } from "@/components/AgentPlusTreeBrowser";
import { PageShell } from "@/components/PageShell";

export default function AgentPlusTreePage() {
  return (
    <PageShell variant="agent" title="Дерево 1С">
      <AgentPlusTreeBrowser />
    </PageShell>
  );
}
