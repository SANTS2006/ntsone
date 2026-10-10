import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellRing, PauseCircle, PlayCircle, Store, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LinkButton } from "@/components/ui/link-button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ShareLinkCard } from "@/components/ShareLinkCard";
import { ApiError } from "@/lib/api";
import { ImagePickerField } from "../idcards/IdCardSettingsCard";
import { closeRegistration, reopenRegistration, updateProgram } from "../programs/api";
import { programKeys } from "../programs/hooks";
import { deleteBusiness, getOrderShareInfo, updateBusiness, uploadBusinessImage, type Business } from "./api";
import { businessKeys } from "./BusinessesListPage";
import { RegistrationNumberCard } from "../programs/RegistrationNumberCard";
import { useAuth } from "@/app/AuthContext";
import { MembersCard } from "../access/MembersCard";
import { StatusSettingsCard } from "./StatusSettingsCard";
import { useBusinessOutletContext } from "./BusinessLayout";

function useRefresh(business: Business) {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: businessKeys.all }),
      business.orderForm && queryClient.invalidateQueries({ queryKey: programKeys.detail(business.orderForm.id) }),
      queryClient.invalidateQueries({ queryKey: ["business-order-share", business.id] }),
    ]);
  };
}

function DetailsCard({ business, canEdit }: { business: Business; canEdit: boolean }) {
  const refresh = useRefresh(business);
  const [draft, setDraft] = React.useState(business);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  React.useEffect(() => setDraft(business), [business]);
  const field = (key: "name" | "email" | "phone" | "address" | "website" | "taxNumber" | "currency" | "brandColor") => ({
    id: `business-${key}`,
    value: draft[key] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [key]: e.target.value })),
  });

  const save = async () => {
    setSaving(true);
    try {
      await updateBusiness(business.id, {
        name: draft.name,
        description: draft.description,
        logoUrl: draft.logoUrl,
        email: draft.email || null,
        phone: draft.phone || null,
        address: draft.address || null,
        website: draft.website || null,
        taxNumber: draft.taxNumber || null,
        currency: draft.currency,
        brandColor: draft.brandColor,
      });
      await refresh();
      toast.success("Business details saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadBusinessImage(business.id, file);
      setDraft((d) => ({ ...d, logoUrl: url }));
      toast.success("Logo uploaded. Remember to save.");
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Store className="h-4 w-4 text-primary" aria-hidden="true" />
          Business details
        </CardTitle>
        <CardDescription>Used on the order page, invoices, receipts, and every email sent for this business.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="business-name">Name</Label>
            <Input {...field("name")} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="business-description">Description</Label>
            <Textarea
              id="business-description"
              rows={2}
              value={draft.description ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value || null }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="business-email">Email</Label>
            <Input type="email" {...field("email")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="business-phone">Phone</Label>
            <Input {...field("phone")} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="business-address">Address</Label>
            <Input {...field("address")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="business-website">Website</Label>
            <Input {...field("website")} placeholder="www.example.com" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="business-taxNumber">Tax number</Label>
            <Input {...field("taxNumber")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="business-currency">Currency</Label>
            <Input {...field("currency")} maxLength={3} className="uppercase" />
            <p className="text-xs text-muted-foreground">SLE shows amounts in Leones (Le).</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="business-brandColor">Brand colour</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Pick the brand colour"
                value={draft.brandColor}
                onChange={(e) => setDraft((d) => ({ ...d, brandColor: e.target.value }))}
                className="h-10 w-12 cursor-pointer rounded-md border border-border bg-transparent"
              />
              <Input {...field("brandColor")} className="font-mono" />
            </div>
          </div>
        </fieldset>
        {canEdit && (
          <ImagePickerField
            label="Logo"
            hint="Shown on the order page, invoices, receipts, and emails."
            value={draft.logoUrl ?? undefined}
            uploading={uploading}
            onUpload={(file) => void upload(file)}
            onRemove={() => setDraft((d) => ({ ...d, logoUrl: null }))}
          />
        )}
        {canEdit && (
          <Button onClick={save} loading={saving} className="self-start">
            Save details
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function OrderPageCard({ business, canEdit }: { business: Business; canEdit: boolean }) {
  const refresh = useRefresh(business);
  const [busy, setBusy] = React.useState(false);
  const form = business.orderForm;
  const { data: share } = useQuery({ queryKey: ["business-order-share", business.id], queryFn: () => getOrderShareInfo(business.id), enabled: !!form });
  if (!form) return null;
  const accepting = form.status === "published" && form.registrationEnabled;

  const toggle = async () => {
    setBusy(true);
    try {
      if (accepting) await closeRegistration(form.id);
      else await reopenRegistration(form.id);
      await refresh();
      toast.success(accepting ? "The order page is paused" : "The order page is taking orders");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order page</CardTitle>
          <CardDescription>
            {accepting
              ? "Customers can place orders with the link below."
              : "The order page isn't taking orders. Build the order form on the Order Form tab, publish it, then start taking orders."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <LinkButton to={`/admin/businesses/${business.id}/order-form`} variant="outline">
            Build the order form
          </LinkButton>
          {canEdit && (
            <Button onClick={toggle} loading={busy} variant={accepting ? "outline" : "default"}>
              {accepting ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
              {accepting ? "Pause orders" : "Start taking orders"}
            </Button>
          )}
        </CardContent>
      </Card>
      {share?.live && (
        <ShareLinkCard
          title="Share the order page"
          description="Customers open this link or scan the QR code to place an order."
          url={share.url}
          qrCodeDataUrl={share.qrCodeDataUrl}
          shareText={`Order from ${business.name}`}
          qrFileName={`${business.name}-order`}
        />
      )}
    </div>
  );
}

function NotificationsCard({ business, canEdit }: { business: Business; canEdit: boolean }) {
  const refresh = useRefresh(business);
  const form = business.orderForm;
  const toggles = [
    {
      id: "notify-team",
      label: "Email the team about new orders",
      hint: "The business's admins and viewers, and your account admins, get each new order with its details.",
      checked: !!form?.notifyOnRegistration,
      save: (checked: boolean) => form && updateProgram(form.id, { notifyOnRegistration: checked }),
    },
    {
      id: "notify-customer",
      label: "Email customers when their order status changes",
      hint: "Customers always get a confirmation when they order. This sends an update, with your name and logo, at each status change.",
      checked: business.notifyCustomerOnStatus,
      save: (checked: boolean) => updateBusiness(business.id, { notifyCustomerOnStatus: checked }),
    },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="h-4 w-4 text-primary" aria-hidden="true" />
          Email notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {toggles.map((t) => (
          <div key={t.id} className="flex items-start justify-between gap-3 rounded-lg border border-border/70 p-3">
            <div>
              <Label htmlFor={t.id} className="font-medium">
                {t.label}
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">{t.hint}</p>
            </div>
            <Switch
              id={t.id}
              checked={t.checked}
              disabled={!canEdit}
              onCheckedChange={async (checked) => {
                try {
                  await t.save(checked);
                  await refresh();
                } catch (err) {
                  toast.error(err instanceof ApiError ? err.message : "Failed to update");
                }
              }}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DeleteCard({ business }: { business: Business }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = React.useState(false);
  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-base text-destructive">Delete business</CardTitle>
        <CardDescription>Removes the business, its order page, orders, invoices, and receipts.</CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="destructive">
              <Trash2 className="h-4 w-4" />
              Delete business
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete {business.name}?</DialogTitle>
              <DialogDescription>The order page stops working and its invoices and receipts are no longer available.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="destructive"
                loading={deleting}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await deleteBusiness(business.id);
                    await queryClient.invalidateQueries({ queryKey: businessKeys.all });
                    toast.success("Business deleted");
                    navigate("/admin/businesses");
                  } catch (err) {
                    toast.error(err instanceof ApiError ? err.message : "Failed to delete");
                    setDeleting(false);
                  }
                }}
              >
                Delete business
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export function BusinessOverviewPage() {
  const { business, program } = useBusinessOutletContext();
  const { user } = useAuth();
  const canEdit = business.myRole === "admin";
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        <OrderPageCard business={business} canEdit={canEdit} />
        <NotificationsCard business={business} canEdit={canEdit} />
        {canEdit && program && <RegistrationNumberCard program={program} />}
        {canEdit && <StatusSettingsCard business={business} />}
        {canEdit && user && <MembersCard kind="businesses" id={business.id} currentUserId={user.id} />}
      </div>
      <div className="flex flex-col gap-6">
        <DetailsCard business={business} canEdit={canEdit} />
        {canEdit && <DeleteCard business={business} />}
      </div>
    </div>
  );
}
