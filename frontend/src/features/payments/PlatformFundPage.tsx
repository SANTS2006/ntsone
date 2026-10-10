import { FundsPage } from "./FundsPage";
import { platformFund } from "./api";

/** The platform's own money: the fee kept from every payment, and withdrawing it. For the super admin. */
export function PlatformFundPage() {
  return <FundsPage fund={platformFund} />;
}
