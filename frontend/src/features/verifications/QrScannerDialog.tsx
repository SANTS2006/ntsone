import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BadgeCheck, Barcode, CameraOff, Keyboard, ScanLine, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { verifyRegistration, type VerificationResult } from "../public-registration/api";
import { DOCUMENT_LABELS } from "./api";

export type ScanMode = "qr" | "barcode";

type ScanState =
  | { kind: "scanning" }
  | { kind: "checking" }
  | { kind: "result"; result: VerificationResult }
  | { kind: "error"; message: string };

type Decoder = (image: ImageData) => string | null;

/** Reads a verification link from a scanned code: /verify/<program>/<registration number>?doc=... */
function parseVerificationLink(text: string): { slug: string; registrationNumber: string; doc: string | null } | null {
  try {
    const url = new URL(text, window.location.origin);
    const match = url.pathname.match(/^\/verify\/([^/]+)\/([^/]+)\/?$/);
    if (!match) return null;
    return {
      slug: decodeURIComponent(match[1]!),
      registrationNumber: decodeURIComponent(match[2]!),
      doc: url.searchParams.get("doc"),
    };
  } catch {
    return null;
  }
}

/** Loads the decoder for the mode: jsQR for QR codes, ZXing for Code 128 barcodes. */
async function loadDecoder(mode: ScanMode): Promise<Decoder> {
  if (mode === "qr") {
    const { default: jsQR } = await import("jsqr");
    return (image) => jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" })?.data ?? null;
  }
  const zxing = await import("@zxing/library");
  const reader = new zxing.MultiFormatReader();
  const hints = new Map();
  hints.set(zxing.DecodeHintType.POSSIBLE_FORMATS, [zxing.BarcodeFormat.CODE_128]);
  hints.set(zxing.DecodeHintType.TRY_HARDER, true);
  reader.setHints(hints);
  return (image) => {
    // ZXing reads greyscale: convert the camera frame's colours to brightness.
    const luminance = new Uint8ClampedArray(image.width * image.height);
    for (let i = 0, p = 0; i < luminance.length; i++, p += 4) {
      luminance[i] = (image.data[p]! * 299 + image.data[p + 1]! * 587 + image.data[p + 2]! * 114) / 1000;
    }
    try {
      const source = new zxing.RGBLuminanceSource(luminance, image.width, image.height);
      return reader.decode(new zxing.BinaryBitmap(new zxing.HybridBinarizer(source))).getText();
    } catch {
      return null;
    } finally {
      reader.reset();
    }
  };
}

/**
 * Scans ID card and ticket QR codes or barcodes with the device camera and verifies them on
 * the spot. Checks go through the same verification as a phone's own camera app, so the
 * first scan of each document is logged in the Verifications table.
 */
export function QrScannerDialog({
  open,
  onOpenChange,
  programId,
  programSlug,
  mode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programId: string;
  programSlug: string;
  mode: ScanMode;
}) {
  const queryClient = useQueryClient();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [state, setState] = React.useState<ScanState>({ kind: "scanning" });
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const [manual, setManual] = React.useState("");
  const [round, setRound] = React.useState(0);
  // A barcode carries only the registration number, so say which document is being scanned.
  const [barcodeDoc, setBarcodeDoc] = React.useState<"ticket" | "id-card">("ticket");

  const check = React.useCallback(
    async (slug: string, registrationNumber: string, doc: string | null) => {
      setState({ kind: "checking" });
      try {
        const result = await verifyRegistration(slug, registrationNumber, doc);
        setState({ kind: "result", result });
        void queryClient.invalidateQueries({ queryKey: ["verifications", programId] });
      } catch {
        setState({ kind: "error", message: "Registration not found. This code doesn't match any registration." });
      }
    },
    [programId, queryClient],
  );

  const handleCode = React.useCallback(
    (text: string) => {
      if (mode === "barcode") {
        void check(programSlug, text.trim(), barcodeDoc);
        return;
      }
      const link = parseVerificationLink(text);
      if (link) void check(link.slug, link.registrationNumber, link.doc);
      else setState({ kind: "error", message: "This QR code isn't from an ID card or ticket on this platform." });
    },
    [mode, programSlug, barcodeDoc, check],
  );

  // Camera and decoding run only while the dialog is open and waiting for a code.
  React.useEffect(() => {
    if (!open || state.kind !== "scanning") return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer = 0;

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
        const [decode, media] = await Promise.all([
          loadDecoder(mode),
          navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
            audio: false,
          }),
        ]);
        stream = media;
        if (stopped) return;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = media;
        await video.play();
        setCameraError(null);

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const tick = () => {
          if (stopped) return;
          if (ctx && video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
            // Barcodes need more width to resolve their thin bars than QR codes do.
            const maxWidth = mode === "barcode" ? 960 : 640;
            const scale = Math.min(1, maxWidth / video.videoWidth);
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const text = decode(ctx.getImageData(0, 0, canvas.width, canvas.height));
            if (text) {
              handleCode(text);
              return;
            }
          }
          timer = window.setTimeout(tick, mode === "barcode" ? 120 : 60);
        };
        tick();
      } catch (err) {
        const denied = err instanceof DOMException && err.name === "NotAllowedError";
        setCameraError(
          denied
            ? "Camera access was blocked. Allow the camera for this site in your browser settings, or enter the number below."
            : "No camera is available on this device. Enter the registration number below instead.",
        );
      }
    })();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [open, state.kind, round, mode, handleCode]);

  const scanAgain = () => {
    setManual("");
    setState({ kind: "scanning" });
    setRound((r) => r + 1);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) scanAgain();
    onOpenChange(next);
  };

  const Icon = mode === "barcode" ? Barcode : ScanLine;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            {mode === "barcode" ? "Scan a barcode" : "Scan a QR code"}
          </DialogTitle>
          <DialogDescription>
            {mode === "barcode"
              ? "Hold the barcode on an ID card or ticket flat and level inside the frame."
              : "Point the camera at the QR code on an ID card or ticket."}
          </DialogDescription>
        </DialogHeader>

        {(state.kind === "scanning" || state.kind === "checking") && (
          <div className="flex flex-col gap-3">
            {mode === "barcode" && (
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">Scanning barcodes on</span>
                <div className="flex rounded-lg border border-border p-0.5">
                  {(
                    [
                      ["ticket", "Tickets"],
                      ["id-card", "ID cards"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setBarcodeDoc(value)}
                      className={cn(
                        "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                        barcodeDoc === value ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div
              className={cn(
                "relative w-full overflow-hidden rounded-xl bg-black",
                mode === "barcode" ? "aspect-[4/3]" : "aspect-square",
              )}
            >
              {cameraError ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-white/80">
                  <CameraOff className="h-8 w-8" />
                  {cameraError}
                </div>
              ) : (
                <>
                  <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
                  <div
                    className={cn(
                      "pointer-events-none absolute rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]",
                      mode === "barcode" ? "inset-x-[8%] inset-y-[32%]" : "inset-[18%]",
                    )}
                  />
                </>
              )}
              {state.kind === "checking" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-medium text-white">
                  Verifying...
                </div>
              )}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (manual.trim()) void check(programSlug, manual.trim(), mode === "barcode" ? barcodeDoc : null);
              }}
            >
              <div className="relative flex-1">
                <Keyboard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Or enter a registration number"
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                />
              </div>
              <Button type="submit" variant="outline" disabled={!manual.trim()} loading={state.kind === "checking"}>
                Verify
              </Button>
            </form>
          </div>
        )}

        {state.kind === "result" && <ScanResult result={state.result} />}

        {state.kind === "error" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-destructive text-white">
              <ShieldX className="h-7 w-7" />
            </span>
            <p className="text-sm text-muted-foreground">{state.message}</p>
          </div>
        )}

        {(state.kind === "result" || state.kind === "error") && (
          <Button onClick={scanAgain} className="w-full">
            <Icon className="h-4 w-4" />
            Scan next
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ScanResult({ result }: { result: VerificationResult }) {
  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      <span
        className={`flex h-14 w-14 items-center justify-center rounded-full text-white ${
          result.valid ? "bg-gradient-success" : "bg-gradient-destructive"
        }`}
      >
        {result.valid ? <BadgeCheck className="h-7 w-7" /> : <AlertTriangle className="h-7 w-7" />}
      </span>
      <div>
        <p className="text-lg font-semibold">{result.valid ? "Valid" : "Not valid"}</p>
        <p className="text-sm text-muted-foreground">{DOCUMENT_LABELS[result.documentType]}</p>
      </div>
      <dl className="grid w-full grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl border border-border/70 p-4 text-left text-sm">
        <dt className="text-muted-foreground">Participant</dt>
        <dd className="font-medium">{result.applicantName ?? "—"}</dd>
        <dt className="text-muted-foreground">Registration #</dt>
        <dd className="font-medium">{result.registrationNumber}</dd>
        <dt className="text-muted-foreground">Program</dt>
        <dd className="font-medium">{result.programName}</dd>
        <dt className="text-muted-foreground">Status</dt>
        <dd className="font-medium capitalize">{result.status.replace("_", " ")}</dd>
        {result.details.map((detail) => (
          <React.Fragment key={detail.label}>
            <dt className="text-muted-foreground">{detail.label}</dt>
            <dd className="font-medium">{detail.value}</dd>
          </React.Fragment>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        {result.alreadyVerified
          ? `Already checked in on ${new Date(result.firstVerifiedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}. This scan isn't logged again.`
          : "First check-in: logged in the Verifications table."}
      </p>
    </div>
  );
}
