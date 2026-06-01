import { formatBudgetMonthKey, roundMoney } from './budgetMonthUtils.jsx';

export const CREDIT_CARD_PAYMENTS_GROUP_NAME = 'Credit Card Payments';

export function acceleratorStorageKey(userId) {
  return `intentflow.zeroInterest.${userId}`;
}

export function loadAcceleratorMonthsByCard(userId) {
  if (!userId) return {};
  try {
    const raw = localStorage.getItem(acceleratorStorageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveAcceleratorMonthsForCard(userId, cardId, months) {
  if (!userId || cardId == null) return;
  const next = {
    ...loadAcceleratorMonthsByCard(userId),
    [String(cardId)]: Math.max(1, Math.min(60, Number(months) || 12)),
  };
  localStorage.setItem(acceleratorStorageKey(userId), JSON.stringify(next));
}

export function getAcceleratorMonthsForCard(userId, cardId, savedMap = null) {
  const map = savedMap || loadAcceleratorMonthsByCard(userId);
  const value = map[String(cardId)];
  return value != null ? Number(value) : 12;
}

export function resolveCreditCardPaymentCategory(categories, card, paymentGroupId = null) {
  const accountId = String(card?.id ?? '').trim();
  const accountName = String(card?.name ?? '').trim();
  const pool = (categories || []).filter(
    (cat) =>
      cat.is_credit_card_payment_category === 1 ||
      cat.is_credit_card_payment_category === true,
  );
  const inGroup = paymentGroupId
    ? pool.filter((cat) => String(cat.group_id ?? cat.groupId) === String(paymentGroupId))
    : pool;

  if (accountId) {
    const byLinked = inGroup.find(
      (cat) => String(cat.linked_account_id ?? cat.linkedAccountId) === accountId,
    );
    if (byLinked) return byLinked;
  }

  const nameLower = accountName.toLowerCase();
  if (nameLower) {
    return (
      inGroup.find((cat) => {
        const name = String(cat.name || '').toLowerCase();
        return (
          name === nameLower ||
          name === `${nameLower} payment` ||
          (name.endsWith(' payment') && name.slice(0, -8) === nameLower)
        );
      }) || null
    );
  }
  return null;
}

export function findCreditCardPaymentsGroup(groups) {
  return (groups || []).find(
    (g) => String(g.name || '').toLowerCase() === CREDIT_CARD_PAYMENTS_GROUP_NAME.toLowerCase(),
  );
}

export function calculateAcceleratorPayment(card, targetMonths) {
  const balance = Math.abs(Number(card?.balance) || 0);
  const aprValue = card?.interest_rate ?? card?.apr ?? 18.99;
  const monthlyRate = aprValue / 100 / 12;
  const minPayment =
    card?.minimum_payment ||
    card?.minimumPayment ||
    Math.max(25, balance * 0.02);
  const months = Math.max(1, Number(targetMonths) || 12);

  if (balance <= 0) {
    return { targetPayment: 0, minPayment, balance, canAchieve: true };
  }

  let targetPayment = null;
  if (monthlyRate > 0) {
    targetPayment = (monthlyRate * balance) / (1 - Math.pow(1 + monthlyRate, -months));
    if (targetPayment < minPayment) targetPayment = minPayment;
  } else {
    targetPayment = balance / months;
    if (targetPayment < minPayment) targetPayment = minPayment;
  }

  return {
    targetPayment: roundMoney(targetPayment),
    minPayment: roundMoney(minPayment),
    balance,
    canAchieve: targetPayment >= minPayment,
  };
}

export function calculateMinPaymentFromInputs({
  balance,
  minPercent = 2,
  minFloor = 25,
  interestPortion = 0,
  fees = 0,
  explicitMin = null,
}) {
  const bal = Math.abs(Number(balance) || 0);
  const explicit = Number(explicitMin);
  if (Number.isFinite(explicit) && explicit > 0) {
    return roundMoney(explicit);
  }
  const pctAmount = bal * (Math.max(0, Number(minPercent) || 0) / 100);
  const interest = Math.max(0, Number(interestPortion) || 0);
  const feeAmount = Math.max(0, Number(fees) || 0);
  const floor = Math.max(0, Number(minFloor) || 0);
  return roundMoney(Math.max(floor, pctAmount + interest + feeAmount));
}

export function calculateStatementBalanceFromInputs({
  previousBalance = 0,
  newCharges = 0,
  paymentsAndCredits = 0,
  fees = 0,
  explicitStatement = null,
}) {
  const explicit = Number(explicitStatement);
  if (Number.isFinite(explicit) && explicit > 0) {
    return roundMoney(explicit);
  }
  const total =
    Math.abs(Number(previousBalance) || 0) +
    Math.max(0, Number(newCharges) || 0) +
    Math.max(0, Number(fees) || 0) -
    Math.max(0, Number(paymentsAndCredits) || 0);
  return roundMoney(Math.max(0, total));
}

export async function allocateCreditCardPaymentBudget({ userId, card, amount, monthDate = new Date() }) {
  const paymentAmount = roundMoney(amount);
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }
  if (!window.electronAPI?.getCurrentUser || !window.electronAPI?.getCategories) {
    throw new Error('Budget API is unavailable.');
  }

  const userResult = await window.electronAPI.getCurrentUser();
  const resolvedUserId = userId ?? userResult?.data?.id;
  if (!resolvedUserId) throw new Error('Please log in to allocate budget.');

  if (window.electronAPI.ensureCreditCardPaymentCategories) {
    await window.electronAPI.ensureCreditCardPaymentCategories(resolvedUserId);
  }

  const [groupsResult, categoriesResult] = await Promise.all([
    window.electronAPI.getCategoryGroups(resolvedUserId),
    window.electronAPI.getCategories(resolvedUserId),
  ]);

  if (!categoriesResult?.success) {
    throw new Error(categoriesResult?.error || 'Failed to load categories.');
  }

  const paymentGroup = findCreditCardPaymentsGroup(groupsResult?.data || []);
  const paymentCategory = resolveCreditCardPaymentCategory(
    categoriesResult.data,
    card,
    paymentGroup?.id,
  );

  if (!paymentCategory) {
    throw new Error(
      `No payment category found for "${card?.name || 'this card'}". Try refreshing credit cards.`,
    );
  }

  const monthKey = formatBudgetMonthKey(monthDate);
  const updateResult = await window.electronAPI.updateCategory(paymentCategory.id, {
    assigned: paymentAmount,
    budget_month: monthKey,
  });

  if (!updateResult?.success) {
    throw new Error(updateResult?.error || 'Failed to allocate budget.');
  }

  return {
    category: paymentCategory,
    group: paymentGroup,
    amount: paymentAmount,
    monthKey,
  };
}

export function navigateToCreditCardPaymentCategory(onNavigate, category, group) {
  if (typeof onNavigate === 'function') {
    onNavigate('propertyMap');
  }
  window.dispatchEvent(
    new CustomEvent('focus-budget-category', {
      detail: {
        categoryId: category?.id,
        groupId: group?.id ?? category?.group_id ?? category?.groupId,
        groupName: CREDIT_CARD_PAYMENTS_GROUP_NAME,
      },
    }),
  );
  window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));
}

export async function allocateAndNavigateToPaymentCategory({
  userId,
  card,
  amount,
  onNavigate,
  monthDate = new Date(),
}) {
  const result = await allocateCreditCardPaymentBudget({ userId, card, amount, monthDate });
  navigateToCreditCardPaymentCategory(onNavigate, result.category, result.group);
  return result;
}
