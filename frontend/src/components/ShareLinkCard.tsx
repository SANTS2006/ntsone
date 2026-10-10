import { toast } from "sonner";
import { Copy, Download, ExternalLink, Facebook, Linkedin, Mail, MessageCircle, QrCode, Share2, Twitter } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ShareLinkProps {
  url: string;
  qrCodeDataUrl?: string | null;
  /** The message that goes with the link when shared, e.g. "Register for Youth Summit". */
  shareText: string;
  /** Saved QR code file name, without extension. */
  qrFileName: string;
}

/** Link, copy/share buttons, social links, and a downloadable QR code. */
export function ShareLinkPanel({ url, qrCodeDataUrl, shareText, qrFileName }: ShareLinkProps) {
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Couldn't copy the link automatically. Please copy it manually");
    }
  };

  const nativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: shareText, text: shareText, url });
      } catch {
        /* user cancelled the share sheet */
      }
    } else {
      await copyLink();
    }
  };

  const downloadQr = () => {
    if (!qrCodeDataUrl) return;
    const link = document.createElement("a");
    link.href = qrCodeDataUrl;
    link.download = `${qrFileName.replace(/\s+/g, "-").toLowerCase()}-qr.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const platforms = [
    { label: "WhatsApp", icon: MessageCircle, href: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}` },
    {
      label: "X / Twitter",
      icon: Twitter,
      href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shareText)}`,
    },
    { label: "Facebook", icon: Facebook, href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
    { label: "LinkedIn", icon: Linkedin, href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
    {
      label: "Email",
      icon: Mail,
      href: `mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(`${shareText}\n\n${url}`)}`,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex gap-2">
          <Input value={url} readOnly onFocus={(e) => e.target.select()} aria-label="Link" className="text-xs sm:text-sm" />
          <Button variant="outline" onClick={copyLink}>
            <Copy className="h-4 w-4" />
            Copy
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={nativeShare}>
            <Share2 className="h-4 w-4" />
            Share
          </Button>
          <Button variant="outline" size="icon" aria-label="Open the link in a new tab" title="Open" onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
            <ExternalLink className="h-4 w-4" />
          </Button>
          {platforms.map((platform) => (
            <Button
              key={platform.label}
              variant="outline"
              size="icon"
              title={`Share on ${platform.label}`}
              aria-label={`Share on ${platform.label}`}
              onClick={() => window.open(platform.href, "_blank", "noopener,noreferrer")}
            >
              <platform.icon className="h-4 w-4" />
            </Button>
          ))}
        </div>
      </div>

      {qrCodeDataUrl && (
        <div className="flex flex-col items-center gap-2">
          <div className="rounded-xl border border-border/70 bg-white p-2 shadow-sm">
            <img src={qrCodeDataUrl} alt={`QR code for ${shareText}`} className="h-32 w-32" />
          </div>
          <Button variant="ghost" size="sm" onClick={downloadQr}>
            <Download className="h-4 w-4" />
            <QrCode className="h-4 w-4" />
            Download QR
          </Button>
        </div>
      )}
    </div>
  );
}

export function ShareLinkCard({ title, description, ...props }: ShareLinkProps & { title: string; description: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Share2 className="h-4 w-4 text-primary" aria-hidden="true" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ShareLinkPanel {...props} />
      </CardContent>
    </Card>
  );
}
