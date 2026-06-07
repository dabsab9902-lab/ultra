import { OfflineClientDetailsClient } from "./OfflineClientDetailsClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminOfflineClientDetailsPage({
  params,
}: PageProps) {
  const { id } = await params;
  return <OfflineClientDetailsClient id={id} />;
}
