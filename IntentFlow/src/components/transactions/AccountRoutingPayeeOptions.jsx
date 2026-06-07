import React from 'react';

/**
 * Payee dropdown optgroups for account routing (payments + transfers).
 */
export default function AccountRoutingPayeeOptions({
  paymentPayees = [],
  transferPayees = [],
  serializeValue,
}) {
  if (!serializeValue) return null;

  return (
    <>
      {paymentPayees.length > 0 && (
        <optgroup label="💳 PAYMENTS">
          {paymentPayees.map((payee) => (
            <option key={payee.id} value={serializeValue(payee)}>
              {payee.name}
            </option>
          ))}
        </optgroup>
      )}
      {transferPayees.length > 0 && (
        <optgroup label="🔄 TRANSFERS">
          {transferPayees.map((payee) => (
            <option key={payee.id} value={serializeValue(payee)}>
              {payee.name}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
}
