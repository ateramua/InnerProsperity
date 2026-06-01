import React, { useEffect, useMemo, useState } from 'react';
import {
  calculateMinPaymentFromInputs,
  calculateStatementBalanceFromInputs,
} from '../utils/creditCardSmartPayUtils.jsx';

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);

export default function CreditCardSmartPayModal({
  isOpen,
  type,
  card,
  defaults = {},
  onClose,
  onConfirm,
}) {
  const [balance, setBalance] = useState('');
  const [minPercent, setMinPercent] = useState('2');
  const [minFloor, setMinFloor] = useState('25');
  const [interestPortion, setInterestPortion] = useState('');
  const [fees, setFees] = useState('');
  const [explicitMin, setExplicitMin] = useState('');
  const [previousBalance, setPreviousBalance] = useState('');
  const [newCharges, setNewCharges] = useState('');
  const [paymentsAndCredits, setPaymentsAndCredits] = useState('');
  const [explicitStatement, setExplicitStatement] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setBalance(String(defaults.balance ?? ''));
    setMinPercent(String(defaults.minPercent ?? 2));
    setMinFloor(String(defaults.minFloor ?? 25));
    setInterestPortion(String(defaults.interestPortion ?? ''));
    setFees(String(defaults.fees ?? ''));
    setExplicitMin(String(defaults.explicitMin ?? ''));
    setPreviousBalance(String(defaults.previousBalance ?? defaults.balance ?? ''));
    setNewCharges(String(defaults.newCharges ?? ''));
    setPaymentsAndCredits(String(defaults.paymentsAndCredits ?? ''));
    setExplicitStatement(String(defaults.explicitStatement ?? defaults.statementBalance ?? ''));
  }, [isOpen, defaults, type]);

  const calculatedAmount = useMemo(() => {
    if (type === 'min') {
      return calculateMinPaymentFromInputs({
        balance: Number(balance),
        minPercent: Number(minPercent),
        minFloor: Number(minFloor),
        interestPortion: interestPortion === '' ? 0 : Number(interestPortion),
        fees: fees === '' ? 0 : Number(fees),
        explicitMin: explicitMin === '' ? null : Number(explicitMin),
      });
    }
    if (type === 'statement') {
      return calculateStatementBalanceFromInputs({
        previousBalance: previousBalance === '' ? 0 : Number(previousBalance),
        newCharges: newCharges === '' ? 0 : Number(newCharges),
        paymentsAndCredits: paymentsAndCredits === '' ? 0 : Number(paymentsAndCredits),
        fees: fees === '' ? 0 : Number(fees),
        explicitStatement: explicitStatement === '' ? null : Number(explicitStatement),
      });
    }
    return 0;
  }, [
    type,
    balance,
    minPercent,
    minFloor,
    interestPortion,
    fees,
    explicitMin,
    previousBalance,
    newCharges,
    paymentsAndCredits,
    explicitStatement,
  ]);

  if (!isOpen || !card) return null;

  const title =
    type === 'min'
      ? `Smart Min — ${card.name}`
      : `Smart Statement — ${card.name}`;

  const handleConfirm = () => {
    if (!Number.isFinite(calculatedAmount) || calculatedAmount <= 0) {
      setError('Calculated amount must be greater than zero.');
      return;
    }
    onConfirm(calculatedAmount);
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/55 p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/20 bg-[#001a40] p-6 text-[#F0F9FF] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-[#F0F9FF]/75">
          {type === 'min'
            ? 'Enter the values used by your issuer to calculate the minimum monthly payment.'
            : 'Enter statement details to calculate the full statement balance for this billing cycle.'}
        </p>

        <div className="mt-4 space-y-3">
          {type === 'min' ? (
            <>
              <Field label="Current balance" value={balance} onChange={setBalance} />
              <Field label="Minimum payment from statement (optional override)" value={explicitMin} onChange={setExplicitMin} />
              <Field label="Minimum payment % of balance" value={minPercent} onChange={setMinPercent} />
              <Field label="Minimum payment floor ($)" value={minFloor} onChange={setMinFloor} />
              <Field label="Interest portion ($)" value={interestPortion} onChange={setInterestPortion} />
              <Field label="Fees ($)" value={fees} onChange={setFees} />
            </>
          ) : (
            <>
              <Field label="Statement balance (optional direct entry)" value={explicitStatement} onChange={setExplicitStatement} />
              <Field label="Previous statement balance" value={previousBalance} onChange={setPreviousBalance} />
              <Field label="New charges this cycle" value={newCharges} onChange={setNewCharges} />
              <Field label="Payments and credits this cycle" value={paymentsAndCredits} onChange={setPaymentsAndCredits} />
              <Field label="Fees ($)" value={fees} onChange={setFees} />
            </>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm">
          Calculated amount: <strong>{formatCurrency(calculatedAmount)}</strong>
        </div>

        {error && <div className="mt-3 text-sm text-rose-300">{error}</div>}

        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="rounded-lg bg-[#0047AB] px-4 py-2 text-sm font-semibold" onClick={handleConfirm}>
            Allocate in Budget
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-[#F0F9FF]/75">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/20 bg-[#0047AB] px-3 py-2 text-[#F0F9FF] outline-none"
      />
    </label>
  );
}
