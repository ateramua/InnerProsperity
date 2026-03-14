// src/types/debtTypes.js

export const DebtTypes = {
    CREDIT_CARD: 'credit-card',
    LOAN: 'loan',
    MORTGAGE: 'mortgage',
    LINE_OF_CREDIT: 'line-of-credit'
};

export const RepaymentStrategies = {
    AVALANCHE: 'avalanche', // Highest interest first
    SNOWBALL: 'snowball',   // Smallest balance first
    HYBRID: 'hybrid'         // Consider both
};

export const RiskLevels = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical'
};

// Common interface for all debt types
export const createDebtFromLoan = (loan) => ({
    id: loan.id,
    name: loan.name,
    type: DebtTypes.LOAN,
    balance: Math.abs(loan.balance),
    originalBalance: Math.abs(loan.balance),
    interestRate: loan.interestRate,
    minimumPayment: loan.monthlyPayment,
    remainingPayments: loan.remainingPayments,
    totalPayments: loan.term,
    lender: loan.lender,
    dueDate: loan.dueDate,
    nextPaymentDate: loan.nextPaymentDate,
    isAutoPay: loan.isAutoPay || false,
    collateral: loan.collateral,
    riskLevel: calculateRiskLevel(loan)
});

export const createDebtFromCreditCard = (card) => ({
    id: card.id,
    name: card.name,
    type: DebtTypes.CREDIT_CARD,
    balance: Math.abs(card.balance),
    creditLimit: card.limit,
    interestRate: card.apr,
    minimumPayment: card.minimumPayment || Math.max(25, Math.abs(card.balance) * 0.02),
    dueDate: card.dueDate,
    institution: card.institution,
    rewards: card.rewards,
    utilization: (Math.abs(card.balance) / card.limit) * 100,
    riskLevel: calculateCardRiskLevel(card)
});

function calculateRiskLevel(loan) {
    const dti = loan.monthlyPayment / (loan.monthlyIncome || 5000); // Would need income data
    const rate = loan.interestRate;
    
    if (rate > 10 || dti > 0.4) return RiskLevels.CRITICAL;
    if (rate > 7 || dti > 0.3) return RiskLevels.HIGH;
    if (rate > 5 || dti > 0.2) return RiskLevels.MEDIUM;
    return RiskLevels.LOW;
}

function calculateCardRiskLevel(card) {
    if (card.utilization > 80) return RiskLevels.CRITICAL;
    if (card.utilization > 60) return RiskLevels.HIGH;
    if (card.utilization > 30) return RiskLevels.MEDIUM;
    return RiskLevels.LOW;
}