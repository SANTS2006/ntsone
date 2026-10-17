// How long the private link in an invitation email works. After that the inviter can send a new one.

/** How many days an invited person has to accept their invitation. */
export const TEMPORARY_PASSWORD_DAYS = 7;

export const temporaryPasswordExpiry = (now = new Date()) => new Date(now.getTime() + TEMPORARY_PASSWORD_DAYS * 86_400_000);
