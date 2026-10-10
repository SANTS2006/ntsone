// Some addresses carry a private token (a shared wish list link, a payment link). The token is the credential, so it
// must never be written to the server log, where more people can read it than should be able to open the page.

const PATTERNS: [RegExp, string][] = [
  [/(\/api\/public\/wish\/)[^/?#]+/g, "$1:token"],
  [/(\/wish\/)[0-9a-f]{32}\.[A-Za-z0-9_-]{20,}/g, "$1:token"],
  [/(\/payment\/)[^/?#]+/g, "$1:token"],
  [/(\/api\/public\/payments\/)[^/?#]+/g, "$1:token"],
];

export function maskSecretsInUrl(url: string): string {
  let out = url;
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  return out;
}
