import { Loading } from "@/components/Loading";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { clearSavedDraft, DynamicForm, type UploadedFileInfo } from "./DynamicForm";
import { FormCoverHeader } from "./FormCoverHeader";
import { getPublicForm, getPublicProgram, submitRegistration, uploadPublicFile } from "./api";
import { usePageMeta } from "@/lib/seo";

/** The live registration form, or (as `order`) a business's live order page at /order/:slug. */
export function PublicRegistrationPage({ variant = "registration" }: { variant?: "registration" | "order" }) {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = React.useState(false);
  // One key per visit to the form: pressing Submit twice, or the browser retrying, cannot register twice.
  const submissionKey = React.useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-key`,
  );
  const [errors, setErrors] = React.useState<string[]>([]);

  const { data: program } = useQuery({
    queryKey: ["public-program", slug],
    queryFn: () => getPublicProgram(slug!),
    enabled: !!slug,
  });
  const isOrder = variant === "order";
  const business = program?.business ?? null;
  usePageMeta({
    title: isOrder ? (business ? `Order from ${business.name}` : "Place an order") : program ? `Register for ${program.name}` : "Register",
    description: isOrder
      ? business
        ? (business.description ?? `Place your order with ${business.name} online.`)
        : undefined
      : program
        ? (program.shortDescription ?? `Fill in the online registration form for ${program.name}.`)
        : undefined,
    index: !!program,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-form", slug],
    queryFn: () => getPublicForm(slug!),
    enabled: !!slug,
    retry: false,
  });

  if (isLoading) return <Loading label="Loading registration form" />;

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {error instanceof ApiError ? error.message : "This registration form is not available."}
        </CardContent>
      </Card>
    );
  }

  const draftKey = data ? `draft:${isOrder ? "order" : "program"}:${slug}:${data.form.id}` : undefined;

  const handleSubmit = async (responses: Record<string, unknown>, files: UploadedFileInfo[], consentAccepted: boolean, items?: { itemId: string; quantity: number }[]) => {
    setSubmitting(true);
    setErrors([]);
    try {
      const result = await submitRegistration(slug!, responses, files, consentAccepted, submissionKey.current, items);
      clearSavedDraft(draftKey);
      // Something to pay: on to Monime's payment page (or, if it could not be opened, to the payment page here, which can try again).
      if (result.payment) {
        const target = result.payment.redirectUrl;
        if (target && target.startsWith("https://")) window.location.assign(target);
        else navigate(`/payment/${result.payment.token}`);
        return;
      }
      navigate(isOrder ? `/order/${slug}/confirmation` : `/programs/${slug}/confirmation`, { state: result });
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.details)) {
        setErrors(err.details as string[]);
      } else {
        setErrors([err instanceof ApiError ? err.message : "Something went wrong. Please try again."]);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      {isOrder && business ? (
        <FormCoverHeader
          name={business.name}
          thumbnailUrl={business.logoUrl}
          description={[business.description, [business.phone, business.email, business.address].filter(Boolean).join(" · ")].filter(Boolean).join("\n\n")}
        />
      ) : (
        program && <FormCoverHeader name={program.name} thumbnailUrl={program.thumbnailUrl} description={program.description} />
      )}
      <CardHeader>
        <CardTitle>{data.form.title}</CardTitle>
        {data.form.description && <CardDescription>{data.form.description}</CardDescription>}
        {data.form.instructions && <p className="text-sm text-muted-foreground">{data.form.instructions}</p>}
      </CardHeader>
      <CardContent>
        <DynamicForm
          sections={data.sections}
          fields={data.fields}
          errors={errors}
          submitting={submitting}
          layoutMode={data.form.layoutMode}
          requireConsent={data.form.requireConsent}
          consentText={data.form.consentText}
          consentConditions={data.form.consentConditions}
          requireReviewConfirmation={data.form.reviewConfirmEnabled ?? true}
          reviewConfirmText={data.form.reviewConfirmText}
          reviewConfirmConditions={data.form.reviewConfirmConditions}
          onUploadFile={(file, fieldKey) => uploadPublicFile(slug!, fieldKey, file)}
          onSubmit={handleSubmit}
          orderItems={data.form.orderItems}
          payment={program?.payment}
          storageKey={draftKey}
          reviewBeforeSubmit={isOrder}
          onCancel={isOrder ? undefined : () => navigate(`/programs/${slug}`)}
          submitLabel={isOrder && !(program?.payment?.enabled) ? "Confirm and place order" : undefined}
        />
      </CardContent>
    </Card>
  );
}

export function PublicOrderPage() {
  return <PublicRegistrationPage variant="order" />;
}
