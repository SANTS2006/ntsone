import { BannerImage } from "@/components/CoverImage";

export function FormCoverHeader({
  name,
  thumbnailUrl,
  description,
}: {
  name: string;
  thumbnailUrl?: string | null;
  description?: string | null;
}) {
  return (
    <div className="flex flex-col">
      {thumbnailUrl && (
        <div className="relative w-full overflow-hidden rounded-t-xl">
          <BannerImage src={thumbnailUrl} />
        </div>
      )}
      <div className="flex flex-col gap-2 border-b border-border/70 px-6 pb-5 pt-6">
        <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">{name}</h1>
        {description && <p className="whitespace-pre-line break-words text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}
