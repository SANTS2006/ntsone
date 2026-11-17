import { queueEmail } from "../email/outbox.js";
import { registrationConfirmationEmail } from "../email/templates.js";
import * as formsService from "../forms/service.js";
import { notifyCustomer, notifyNewRegistration } from "../notifications/service.js";
import * as programsRepo from "../programs/repository.js";
import * as registrationsRepo from "./repository.js";

/**
 * Tells the person (and the team) that a registration or order was received.
 * For anything that has to be paid for, this is only called once the payment is confirmed, so nobody is told an order
 * was received while it is still unpaid or if the payer walked away from the payment page.
 * Never throws: the registration is already saved and a mail problem must not undo or block anything.
 */
export async function sendRegistrationConfirmations(registrationId: string): Promise<void> {
  try {
    const registration = await registrationsRepo.findRegistrationById(registrationId);
    if (!registration) return;
    const program = await programsRepo.findProgramById(registration.programId);
    if (!program) return;
    const published = await formsService.getPublishedFormWithContent(program.id);
    const fields = published?.fields ?? [];
    const fileRows = await registrationsRepo.getRegistrationFiles(registration.id);
    const files = fileRows.map((f) => ({ fieldKey: f.fieldKey, filename: f.originalFilename }));

    if (program.kind === "order_form") {
      // Customers get an order confirmation branded with the business instead.
      void notifyCustomer(program, registration, { isNew: true, fields, files });
    } else if (registration.applicantEmail) {
      // Queued rather than sent here: a slow or failing mail provider must neither slow anything down nor lose the confirmation.
      void queueEmail({
        to: registration.applicantEmail,
        toName: registration.applicantName ?? registration.applicantEmail,
        subject: `Registration confirmed - ${program.name}`,
        html: registrationConfirmationEmail({
          programName: program.name,
          registrationNumber: registration.registrationNumber,
          applicantName: registration.applicantName ?? "there",
        }),
      });
    }
    // Sent in the background so nobody is kept waiting on the team's emails.
    void notifyNewRegistration(program, registration, fields, files);
  } catch (err) {
    console.error(`Could not send the confirmation for registration ${registrationId}:`, err);
  }
}
