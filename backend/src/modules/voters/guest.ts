/**
 * Polls that don't ask for an account let anyone vote straight away. Each browser then gets an anonymous "guest" voter
 * account, so votes, limits and results work exactly as they do for signed-in voters. Its address can never receive mail.
 */
export const GUEST_EMAIL_DOMAIN = "guest.voters.invalid";

export const isGuestVoter = (voter: { email: string }) => voter.email.endsWith(`@${GUEST_EMAIL_DOMAIN}`);
