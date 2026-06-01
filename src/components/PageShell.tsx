import { Header } from "./Header";
import { BottomNav } from "./BottomNav";
import { InstallPrompt } from "./InstallPrompt";

interface PageShellProps {
  children: React.ReactNode;
  title?: string;
  hideNav?: boolean;
  hideHeader?: boolean;
  variant?: "default" | "agent";
}

export function PageShell({
  children,
  title,
  hideNav = false,
  hideHeader = false,
  variant = "default",
}: PageShellProps) {
  const isAgent = variant === "agent";

  return (
    <div className={`min-h-dvh ${isAgent ? "bg-slate-100" : "bg-surface-muted"}`}>
      {!hideHeader && <Header title={title} compact={isAgent} />}
      <main
        className={`mx-auto max-w-lg ${hideNav ? (isAgent ? "pb-4" : "pb-6") : "pb-20"}`}
      >
        {children}
      </main>
      <InstallPrompt hasBottomNav={!hideNav} />
      {!hideNav && <BottomNav />}
    </div>
  );
}
