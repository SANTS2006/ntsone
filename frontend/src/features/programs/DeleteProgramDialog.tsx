import * as React from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function DeleteProgramDialog({
  programName,
  registrationCount,
  onConfirm,
}: {
  programName: string;
  registrationCount: number;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const confirm = async () => {
    setDeleting(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" />
        Delete program
      </Button>
      <Dialog open={open} onOpenChange={(next) => !deleting && setOpen(next)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <DialogTitle>Delete this program?</DialogTitle>
            <DialogDescription>
              <span className="font-semibold text-foreground">{programName}</span> will be removed along with its
              registration form
              {registrationCount > 0 && (
                <>
                  {" "}
                  and <span className="font-semibold text-foreground">{registrationCount}</span> registration
                  {registrationCount === 1 ? "" : "s"}
                </>
              )}
              . Its public registration link will stop working. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirm} loading={deleting}>
              <Trash2 className="h-4 w-4" />
              {deleting ? "Deleting..." : "Delete program"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
