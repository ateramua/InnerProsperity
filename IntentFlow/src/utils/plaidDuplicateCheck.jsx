/**
 * Prompt user when a manual account may duplicate an existing or Plaid-linked account.
 * @returns {Promise<boolean>} true if the user wants to proceed with create
 */
export async function confirmNoDuplicateAccount({ type, mask, name, institution }) {
  if (!window.electronAPI?.checkDuplicateAccount) return true;

  const res = await window.electronAPI.checkDuplicateAccount({
    type,
    mask: mask || null,
    name: name || null,
    institution: institution || null,
  });

  if (!res?.success || !res.duplicates?.length) return true;

  const lines = res.duplicates
    .map((d) => {
      const tag = d.source === 'plaid' ? 'bank-linked' : 'manual';
      const maskPart = d.external_mask ? ` •••• ${d.external_mask}` : '';
      return `• ${d.name}${maskPart} (${tag})`;
    })
    .join('\n');

  const useLinkedBanks = res.duplicates.some((d) => d.source === 'plaid');

  const message = useLinkedBanks
    ? `Similar account(s) already exist:\n\n${lines}\n\nConsider connecting or syncing via Linked Banks instead.\n\nCreate this account anyway?`
    : `Similar account(s) already exist:\n\n${lines}\n\nCreate this account anyway?`;

  return window.confirm(message);
}

export function maskFromAccountNumber(accountNumber) {
  if (!accountNumber) return null;
  const digits = String(accountNumber).replace(/\D/g, '');
  if (digits.length < 4) return null;
  return digits.slice(-4);
}
