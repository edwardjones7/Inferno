export const GUEST_COOKIE = "inferno_guest";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isGuestId = (v: string | undefined): v is string => !!v && UUID.test(v);
