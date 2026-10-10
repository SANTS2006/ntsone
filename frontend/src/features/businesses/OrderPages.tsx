import { FormBuilderPage } from "../form-builder/FormBuilderPage";
import { RegistrationDetailPage } from "../registrations/RegistrationDetailPage";
import { RegistrationsListPage } from "../registrations/RegistrationsListPage";
import { BusinessAnalyticsPage } from "./BusinessAnalyticsPage";
import { OrderFormGate } from "./BusinessLayout";

// The order form is a program underneath, so its builder, orders list, and order pages are the
// program pages, shown inside the business once its order form has loaded.

export function BusinessOrderFormPage() {
  return (
    <OrderFormGate>
      <FormBuilderPage />
    </OrderFormGate>
  );
}

export function BusinessOrdersPage() {
  return (
    <OrderFormGate>
      <RegistrationsListPage />
    </OrderFormGate>
  );
}

export function BusinessOrderDetailPage() {
  return (
    <OrderFormGate>
      <RegistrationDetailPage />
    </OrderFormGate>
  );
}

export function BusinessAnalyticsTab() {
  return (
    <OrderFormGate>
      <BusinessAnalyticsPage />
    </OrderFormGate>
  );
}
