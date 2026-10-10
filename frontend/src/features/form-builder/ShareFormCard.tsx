import { useQuery } from "@tanstack/react-query";
import { ShareLinkCard } from "@/components/ShareLinkCard";
import { getFormShareInfo } from "./api";

export function ShareFormCard({ programId, programName }: { programId: string; programName: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["form-share", programId],
    queryFn: () => getFormShareInfo(programId),
  });

  if (isLoading || !data?.published) return null;

  return (
    <ShareLinkCard
      title="Share this registration form"
      description="Anyone with this link can register while the program stays open. Share it directly or let people scan the QR code."
      url={data.publicUrl}
      qrCodeDataUrl={data.qrCodeDataUrl}
      shareText={`Register for ${programName}`}
      qrFileName={`${programName}-registration`}
    />
  );
}
