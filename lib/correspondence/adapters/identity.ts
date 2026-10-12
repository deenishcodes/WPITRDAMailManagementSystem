import { getChatGPTUser } from '@/app/chatgpt-auth';

export type PlatformIdentity = {
  externalId: string;
  email: string;
  displayName: string;
  phone: string | null;
};

// --- Thunder SSO integration point ---
// The PRD calls for sign-in via SSO through Thunder, the organization's platform IDP. This app
// is hosted on the OpenAI Sites platform, which already performs an SSO handshake (Sign In With
// ChatGPT) before any request reaches this Worker, injecting the result as
// `oai-authenticated-user-*` headers (see app/chatgpt-auth.ts). Until a real Thunder integration
// is wired up, this function stands in for it: it returns the exact same
// {externalId, email, displayName, phone} shape a Thunder adapter would, sourced from the
// platform's existing SSO. Swapping to real Thunder later means rewriting the body of this one
// function (e.g. verifying a Thunder session/JWT and reading its profile attributes, including
// the phone number used for SMS notifications) — nothing else under lib/correspondence talks to
// SSO directly.
export async function getPlatformIdentity(): Promise<PlatformIdentity | null> {
  const user = await getChatGPTUser();
  if (!user) return null;
  return {
    externalId: user.userId,
    email: user.email,
    displayName: user.fullName ?? user.displayName,
    // Thunder profile attributes include a phone number used for the SMS notification leg; the
    // platform's SSO headers don't carry one, so local/dev identities never get SMS delivery
    // until Thunder supplies it (which matches the PRD: "a user with no phone number on file
    // simply does not receive the SMS leg").
    phone: null,
  };
}
