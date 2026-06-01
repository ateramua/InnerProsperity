// src/views/PropertyMapView.jsx
import React, { useState, useEffect, useRef } from 'react';
import SummaryView from './SummaryView';
import useRealtimeUpdates from '../hooks/useRealtimeUpdates';
import BudgetEngine from "../shared/budgetEngine.mjs";
import {
  deriveAvailableFromCategoryRow,
  roundMoney as roundMoneyEnvelope,
} from "../shared/categoryAvailableEngine.mjs";
import { computeFundUnderfundedPlan } from "../shared/underfundedEngine.mjs";
import Button from '../components/ui/Button';
import CategoryTargetModal from '../components/CategoryTargetModal';
import CategoryBudgetEditRow from '../components/CategoryBudgetEditRow';
import PM from '../constants/pmTheme.jsx';
import { getCategoryGoalTypeLabel, getCategoryGoalFrequencyLabel } from '../constants/categoryGoalTypes.jsx';
import {
  formatBudgetMonthKey,
  formatDateForInput,
  formatStoredTimestampLocalDate,
  roundMoney,
  monthKeyToLocalDate,
} from '../utils/budgetMonthUtils.jsx';
import {
  sameCategoryId,
  parseMoneyInput,
  formatMoneyInput,
  mapGoalTargetFromDb,
} from '../utils/categoryMoneyInput.jsx';
import { sumTotalBudgetCash } from '../utils/cashAccountUtils.jsx';

const EMPTY_MOVE_MONEY_FORM = {
  amount: '',
  fromCategoryId: '',
  toCategoryId: '',
  source: 'manual',
};
const READY_TO_ASSIGN_ID = '__ready_to_assign__';
const READY_TO_ASSIGN_LABEL = 'Ready to Assign';

const PropertyMapView = () => {
  // ==================== STATE DECLARATIONS ====================
  const [categoryGroups, setCategoryGroups] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [showEditGroupModal, setShowEditGroupModal] = useState(false);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [showAddIncomeModal, setShowAddIncomeModal] = useState(false);
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false);
  const [showMoveMoneyModal, setShowMoveMoneyModal] = useState(false);
  const [selectedGroupForCategory, setSelectedGroupForCategory] = useState(null);
  const [editingGroup, setEditingGroup] = useState(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [editGroupName, setEditGroupName] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const selectedMonthRef = useRef(selectedMonth);
  useEffect(() => {
    selectedMonthRef.current = selectedMonth;
  }, [selectedMonth]);
  const [newCategoryData, setNewCategoryData] = useState({
    name: '',
    assigned: 0,
    groupId: null
  });

  const [budgetEngine] = useState(() => new BudgetEngine());
  const hasEverLoadedSuccessRef = useRef(false);
  /** Last known-good table snapshot — restored when a reload returns empty (e.g. DevTools focus churn). */
  const lastGoodSnapshotRef = useRef({
    categories: [],
    categoryGroups: [],
    userId: null,
    monthKey: null,
    at: 0
  });
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [selectedCategoryForTarget, setSelectedCategoryForTarget] = useState(null);


  const [incomeData, setIncomeData] = useState({
    amount: '',
    date: new Date().toISOString().split('T')[0],
    memo: ''
  });
  const [paymentData, setPaymentData] = useState({
    amount: '',
    categoryId: '',
    payee: '',
    date: new Date().toISOString().split('T')[0],
    memo: ''
  });

  const [editingCategory, setEditingCategory] = useState(null);
  const editingCategoryRef = useRef(null);
  /** Short-lived goal patches so background reloads cannot overwrite a just-saved target_amount. */
  const goalPatchByCategoryIdRef = useRef(new Map());
  const [isQuickAssigning, setIsQuickAssigning] = useState(false);
  const [isMonthBudgetLoading, setIsMonthBudgetLoading] = useState(false);
  const rtaRefreshTimerRef = useRef(null);

  const [moveMoneyData, setMoveMoneyData] = useState(EMPTY_MOVE_MONEY_FORM);
  const [moveMoneyError, setMoveMoneyError] = useState('');
  const [moveMoneySearchQuery, setMoveMoneySearchQuery] = useState('');
  const [pendingUndoMove, setPendingUndoMove] = useState(null);
  const [moveMoneyActivity, setMoveMoneyActivity] = useState([]);
  const [moveMoneyRecentlyUsedSourceIds, setMoveMoneyRecentlyUsedSourceIds] = useState([]);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [userId, setUserId] = useState(2);
  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const resolveBudgetUserId = (override) => {
    if (override != null && override !== '') return override;
    return userIdRef.current;
  };

  const [totalCashInAccounts, setTotalCashInAccounts] = useState(0);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [showArchivedModal, setShowArchivedModal] = useState(false);
  const [archivedCategories, setArchivedCategories] = useState([]);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [focusCategoryId, setFocusCategoryId] = useState(null);

  const waitForElectronAPI = async (requiredMethods = [], timeout = 5000) => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (window.electronAPI && requiredMethods.every(method => typeof window.electronAPI[method] === 'function')) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return false;
  };

  const ensureElectronAPI = async () => {
    return waitForElectronAPI([
      'getCurrentUser',
      'getAccountsSummary',
      'getCategories',
      'getCategoryGroups',
      'getArchivedCategories'
    ], 8000);
  };

  const [budgetSummary, setBudgetSummary] = useState({
    totalAvailable: 0,
    totalActivity: 0,
    totalAssigned: 0,
    unassigned: 0,
    totalCash: 0,
    futureAssigned: 0,
    futureBreakdown: [],
    monthAssigned: 0,
  });
  const [showFutureReservedPanel, setShowFutureReservedPanel] = useState(false);
  const [isUnassigningMonth, setIsUnassigningMonth] = useState(false);

  const [budgetData, setBudgetData] = useState({
    categories: []
  });

  // ==================== CREDIT CARD PAYMENT HELPER ====================
  
  // Move money from spending category to credit card payment category
  const resolveCreditCardPaymentCategory = (categories, paymentGroupId, accountRef) => {
    const ref = String(accountRef || '').trim();
    if (!ref) return null;
    const pool = (categories || []).filter(
      (cat) =>
        cat.is_credit_card_payment_category === 1 ||
        cat.is_credit_card_payment_category === true
    );
    const inGroup = paymentGroupId
      ? pool.filter((cat) => String(cat.group_id ?? cat.groupId) === String(paymentGroupId))
      : pool;

    const byLinked = inGroup.find(
      (cat) => String(cat.linked_account_id ?? cat.linkedAccountId) === ref
    );
    if (byLinked) return byLinked;

    const refLower = ref.toLowerCase();
    return (
      inGroup.find((cat) => {
        const name = String(cat.name || '').toLowerCase();
        return (
          name === refLower ||
          name === `${refLower} payment` ||
          (name.endsWith(' payment') && name.slice(0, -8) === refLower)
        );
      }) || null
    );
  };

  const moveMoneyForCreditCardTransaction = async (amount, spendingCategoryId, creditCardAccountRef, budgetMonthKeyOpt) => {
    try {
      console.log(`🔄 Moving $${amount} from category ${spendingCategoryId} to credit card payment category for ${creditCardAccountRef}`);
      
      const groupsResult = await window.electronAPI.getCategoryGroups(userId);
      if (!groupsResult?.success) {
        console.error('Failed to get category groups');
        return false;
      }
      
      const paymentGroup = groupsResult.data.find(g => 
        g.name === 'Credit Card Payments' || g.name.toLowerCase() === 'credit card payments'
      );
      
      if (!paymentGroup) {
        console.error('Credit Card Payments group not found');
        return false;
      }
      
      const categoriesResult = await window.electronAPI.getCategories(userId);
      if (!categoriesResult?.success) {
        console.error('Failed to get categories');
        return false;
      }
      
      const paymentCategory = resolveCreditCardPaymentCategory(
        categoriesResult.data,
        paymentGroup.id,
        creditCardAccountRef
      );
      
      if (!paymentCategory) {
        console.error(`Payment category for "${creditCardAccountRef}" not found`);
        return false;
      }
      
      const spendingCategory = categoriesResult.data.find(cat => cat.id === spendingCategoryId);
      if (!spendingCategory) {
        console.error(`Spending category ${spendingCategoryId} not found`);
        return false;
      }
      
      const newSpendingAssigned = (spendingCategory.assigned || 0) - amount;

      const ccMonth = budgetMonthKeyOpt || formatBudgetMonthKey(selectedMonthRef.current || selectedMonth);

      await window.electronAPI.updateCategory(
        spendingCategoryId,
        {
          assigned: newSpendingAssigned,
          budget_month: ccMonth
        }
      );

      const newPaymentAssigned = (paymentCategory.assigned || 0) + amount;

      await window.electronAPI.updateCategory(
        paymentCategory.id,
        {
          assigned: newPaymentAssigned,
          budget_month: ccMonth
        }
      );
      
      console.log(`✅ Successfully moved $${amount} from "${spendingCategory.name}" to "${paymentCategory.name}"`);
      
      await loadCategoriesFromDB(0, { monthDate: monthKeyToLocalDate(ccMonth) });
      calculateReadyToAssign();
      
      return true;
    } catch (error) {
      console.error('Error moving money for credit card transaction:', error);
      return false;
    }
  };

  useEffect(() => {
    window.moveMoneyForCreditCardTransaction = moveMoneyForCreditCardTransaction;
    return () => {
      delete window.moveMoneyForCreditCardTransaction;
    };
  }, [userId, budgetData.categories]);

  // ==================== DEBUGGING & EFFECTS ====================
  useEffect(() => {
    console.log('🔍 COMPONENT MOUNTED - checking electronAPI:', {
      hasGetCategories: !!window.electronAPI?.getCategories,
      hasGetCategoryGroups: !!window.electronAPI?.getCategoryGroups,
      userId: userId
    });
  }, []);

  useEffect(() => {
    console.log('📊 budgetData.categories UPDATED:', {
      count: budgetData.categories.length,
      categories: budgetData.categories.map(c => ({
        id: c.id,
        name: c.name,
        assigned: c.assigned,
        archived: c.archived
      }))
    });
  }, [budgetData.categories]);

  // ==================== HELPER FUNCTIONS ====================
  const isGroupCollapsed = (groupId) => collapsedGroups[groupId] !== false;

  const toggleGroupCollapse = (groupId) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupId]: prev[groupId] === false ? true : false,
    }));
  };

  const calculateTargetProgress = (category) =>
    budgetEngine.calculateTargetProgress(category);

  const calculateUnderfundedCategories = () => {
    if (!budgetData.categories || !Array.isArray(budgetData.categories)) {
      return [];
    }
    const active = budgetData.categories.filter((cat) => cat && !isCategoryArchived(cat));
    return budgetEngine.calculateUnderfundedCategories(active);
  };

  const getTotalUnderfunded = () => {
    if (!budgetData.categories || !Array.isArray(budgetData.categories)) {
      return 0;
    }
    const active = budgetData.categories.filter((cat) => cat && !isCategoryArchived(cat));
    return budgetEngine.getTotalUnderfunded(active);
  };

  const getActiveBudgetCategories = (overrideRows = null) => {
    const source =
      overrideRows ||
      lastGoodSnapshotRef.current.categories ||
      budgetData.categories ||
      [];
    return source.filter((cat) => cat && !isCategoryArchived(cat));
  };

  const getGlobalReadyToAssign = () => roundMoney(Number(budgetSummary.unassigned) || 0);

  const getReadyToAssignPool = () => getGlobalReadyToAssign();

  const refreshGlobalBudgetSummaryWithTimeout = async (timeoutMs = 12000) => {
    try {
      return await Promise.race([
        refreshGlobalBudgetSummary(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Ready to Assign refresh timed out')), timeoutMs);
        }),
      ]);
    } catch (e) {
      console.warn('refreshGlobalBudgetSummaryWithTimeout:', e?.message || e);
      return null;
    }
  };

  const alertNoReadyToAssignForQuickAssign = (pool) => {
    const monthLabel = (selectedMonthRef.current || selectedMonth).toLocaleString('default', {
      month: 'long',
      year: 'numeric',
    });
    const futureReserved = roundMoney(Number(budgetSummary.futureAssigned) || 0);
    if (futureReserved > 0.005) {
      alert(
        `Ready to Assign is ${formatCurrency(pool)}. ${formatCurrency(futureReserved)} is already assigned in other budget months (for example, a month before ${monthLabel}). To fund ${monthLabel}, unassign from those months using "Unassign Month" or add new income.`,
      );
      return;
    }
    alert('No funds available to assign from Ready to Assign.');
  };

  const formatMonthKeyLabel = (monthKey) => {
    const match = String(monthKey || '').match(/^(\d{4})-(\d{2})/);
    if (!match) return monthKey || '';
    const d = new Date(Number(match[1]), Number(match[2]) - 1, 1);
    return d.toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  const refreshGlobalBudgetSummary = async () => {
    if (!userId || !window.electronAPI?.getBudgetGlobalSummary) return null;
    try {
      const res = await window.electronAPI.getBudgetGlobalSummary(userId);
      if (res?.success && res.data) {
        const data = res.data;
        setBudgetSummary((prev) => ({
          ...prev,
          totalAvailable: data.readyToAssign,
          unassigned: data.readyToAssign,
          totalAssigned: data.totalAssigned,
          totalCash: data.totalCash,
          futureAssigned: data.futureAssigned,
          futureBreakdown: data.futureBreakdown || [],
        }));
        return data;
      }
    } catch (e) {
      console.warn('refreshGlobalBudgetSummary:', e);
    }
    return null;
  };

  const getMonthAssignedTotal = (overrideRows = null) => {
    const active = getActiveBudgetCategories(overrideRows);
    return roundMoney(active.reduce((sum, cat) => sum + (Number(cat.assigned) || 0), 0));
  };

  const updateMonthMetricsFromCategories = (categoriesOverride = null) => {
    const source = Array.isArray(categoriesOverride)
      ? categoriesOverride
      : budgetData.categories;
    const active = (source || []).filter((cat) => cat && !isCategoryArchived(cat));
    const totalActivity = active.reduce((sum, cat) => sum + (Number(cat.activity) || 0), 0);
    const monthAssigned = active.reduce((sum, cat) => sum + (Number(cat.assigned) || 0), 0);
    setBudgetSummary((prev) => ({
      ...prev,
      totalActivity,
      monthAssigned,
    }));
  };

  const getFundUnderfundedSummary = (overrideRows = null) => {
    const active = getActiveBudgetCategories(overrideRows);
    return computeFundUnderfundedPlan(active, { pool: Number.POSITIVE_INFINITY });
  };

  /** Amount Fund Underfunded would assign now (capped by Ready to Assign). */
  const getFundUnderfundedButtonAmount = (overrideRows = null) => {
    const pool = Math.max(0, getReadyToAssignPool());
    if (pool <= 0) return 0;
    const active = getActiveBudgetCategories(overrideRows);
    const plan = computeFundUnderfundedPlan(active, { pool });
    return roundMoney(plan.totalToAssign || 0);
  };

  const getFundUnderfundedButtonLabel = () => {
    if (isQuickAssigning) return 'Funding underfunded…';
    if (isMonthBudgetLoading) return 'Loading month…';
    const need = roundMoney(getFundUnderfundedSummary().totalFundingNeed || 0);
    const pool = Math.max(0, getReadyToAssignPool());
    const toFund = getFundUnderfundedButtonAmount();
    if (pool <= 0 && need > 0) {
      return `🎯 Fund Underfunded (need ${formatCurrency(need)}, RTA ${formatCurrency(pool)})`;
    }
    return `🎯 Fund Underfunded (${formatCurrency(toFund)})`;
  };

  const deriveReadyToAssignFromCash = () => {
    const cash = roundMoney(Number(totalCashInAccounts || budgetSummary.totalCash) || 0);
    const assigned = roundMoney(Number(budgetSummary.totalAssigned) || 0);
    return roundMoney(cash - assigned);
  };

  const resolveReadyToAssignPool = async () => {
    let pool = getReadyToAssignPool();
    if (pool <= 0) {
      pool = deriveReadyToAssignFromCash();
    }
    const refreshed = await refreshGlobalBudgetSummaryWithTimeout();
    if (refreshed != null && Number.isFinite(refreshed.readyToAssign)) {
      return roundMoney(refreshed.readyToAssign);
    }
    return pool;
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getTargetInfo = (category) => {
    return calculateTargetProgress(category);
  };

  const normalizeGroupId = (value) => String(value ?? '').trim();

  const isCategoryArchived = (categoryOrFlag) => {
    const a =
      categoryOrFlag !== null &&
      typeof categoryOrFlag === 'object' &&
      !Array.isArray(categoryOrFlag)
        ? categoryOrFlag.archived
        : categoryOrFlag;
    if (a === null || a === undefined || a === false) return false;
    if (a === 0 || a === '0' || a === 'false' || a === '') return false;
    return a === true || a === 1 || a === '1' || a === 'true';
  };

  const toMoneyNumber = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (value === null || value === undefined) return 0;
    const cleaned = String(value).replace(/[^0-9.-]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  };

  const mapDbCategoryToBudgetRow = (cat) => {
    const row = {
    id: cat.id,
    name: cat.name,
    assigned: toMoneyNumber(cat.assigned ?? cat.budgeted_amount),
    activity: toMoneyNumber(cat.activity),
    available: toMoneyNumber(cat.available),
    previous_available: toMoneyNumber(cat.previous_available),
    spending: toMoneyNumber(cat.spending),
    inflows: toMoneyNumber(cat.inflows),
    adjustments: toMoneyNumber(cat.adjustments),
    card_payments: toMoneyNumber(cat.card_payments),
    overspent: cat.overspent === true || cat.overspent === 1,
    overspending_type: cat.overspending_type || null,
    is_credit_card_payment_category: cat.is_credit_card_payment_category === 1,
    linked_account_id: cat.linked_account_id ?? null,
    groupId: cat.group_id ?? null,
    user_id: cat.user_id,
    priority: cat.priority || 2,
    target_amount: mapGoalTargetFromDb(cat.target_amount),
    target_type: cat.target_type || 'monthly',
    target_frequency: cat.target_frequency || 'monthly',
    target_date: cat.target_date,
    progress: 0,
    last_month_assigned: cat.last_month_assigned || 0,
    average_spending: cat.average_spending || 0,
    archived: isCategoryArchived(cat.archived),
    is_hidden: cat.is_hidden === 1 || cat.hidden === 1,
    original_group_id: cat.original_group_id || cat.group_id,
    is_loan_payment_category: cat.is_loan_payment_category === 1
  };
    const rowForUnderfunded = {
      ...row,
      forecasted_need: cat.forecasted_need ?? cat.forecastedNeed ?? row.forecasted_need,
    };
    const targetMeta = budgetEngine.calculateTargetProgress(rowForUnderfunded);
    const derived = deriveAvailableFromCategoryRow(row);
    const serverUnderfunded =
      cat.underfunded != null && cat.underfunded !== undefined
        ? toMoneyNumber(cat.underfunded)
        : null;
    const hasAuthoritativeEnvelope =
      cat._envelopeFromSnapshot === true ||
      (cat.previous_available !== undefined && cat.previous_available !== null) ||
      (cat.spending !== undefined && cat.spending !== null) ||
      (cat.budgeted_amount !== undefined && cat.budgeted_amount !== null);
    return {
      ...row,
      forecasted_need: rowForUnderfunded.forecasted_need,
      underfunded: serverUnderfunded ?? targetMeta.underfunded ?? targetMeta.needed ?? 0,
      goalType: cat.goalType ?? targetMeta.goalType,
      goalStatus: cat.goalStatus ?? targetMeta.status,
      goalProgress: cat.goalProgress ?? targetMeta.progress,
      available: hasAuthoritativeEnvelope
        ? roundMoneyEnvelope(toMoneyNumber(cat.available))
        : roundMoneyEnvelope(derived.available),
      activity: hasAuthoritativeEnvelope
        ? roundMoneyEnvelope(toMoneyNumber(cat.activity))
        : roundMoneyEnvelope(derived.activity ?? row.activity),
      _envelopeFromSnapshot: hasAuthoritativeEnvelope,
    };
  };

  const applyGoalPatchesToRows = (rows) => {
    const patches = goalPatchByCategoryIdRef.current;
    if (!patches?.size) return rows;
    const now = Date.now();
    return rows.map((row) => {
      const patch = patches.get(String(row.id));
      if (!patch || patch.expiresAt <= now) {
        if (patch) patches.delete(String(row.id));
        return row;
      }
      return {
        ...row,
        target_amount: patch.target_amount,
        target_type: patch.target_type,
        target_frequency: patch.target_frequency,
        target_date: patch.target_date
      };
    });
  };

  const registerGoalPatch = (categoryId, goalFields) => {
    goalPatchByCategoryIdRef.current.set(String(categoryId), {
      ...goalFields,
      expiresAt: Date.now() + 15000
    });
  };

  const withDerivedAvailable = (categories) =>
    categories.map((cat) => {
      if (!cat || isCategoryArchived(cat)) return cat;
      if (cat._envelopeFromSnapshot) return cat;
      const derived = deriveAvailableFromCategoryRow(cat);
      return {
        ...cat,
        available: roundMoneyEnvelope(derived.available),
        activity: roundMoneyEnvelope(derived.activity ?? cat.activity),
      };
    });

  const updateAllAvailable = async () => {
    console.log('🔄 Refreshing derived Available balances from budget engine...');
    const monthKey = formatBudgetMonthKey(selectedMonthRef.current || selectedMonth);
    if (window.electronAPI?.getBudgetMonthSnapshot) {
      await loadCategoriesFromDB(0, { monthDate: monthKeyToLocalDate(monthKey) });
    } else {
      setBudgetData((prev) => ({
        ...prev,
        categories: withDerivedAvailable(prev.categories || []),
      }));
    }
    calculateReadyToAssign();
    console.log('✅ Available balances refreshed');
  };

  const getPreviousMonthAvailable = async (categoryId, previousMonth) => {
    try {
      const result = await window.electronAPI.getCategoryHistory(categoryId, previousMonth);
      const payload = result?.data ?? result;
      return payload?.available || 0;
    } catch (error) {
      console.error('Error getting previous month available:', error);
      return 0;
    }
  };

  // ==================== READY TO ASSIGN (GLOBAL POOL) ====================
  const calculateReadyToAssign = (categoriesOverride = null) => {
    updateMonthMetricsFromCategories(categoriesOverride);
    void refreshGlobalBudgetSummary();
  };

  const updateAllProgress = () => {
    if (editingCategoryRef.current != null) return;
    setBudgetData(prev => ({
      ...prev,
      categories: prev.categories.map(cat => ({
        ...cat,
        progress: calculateTargetProgress(cat).progress || 0
      }))
    }));
  };
  
  useEffect(() => {
    if (budgetData.categories.length === 0) return;
    if (typeof window !== 'undefined' && window.electronAPI?.getBudgetMonthSnapshot) {
      return;
    }
    updateAllAvailable();
  }, [budgetData.categories.map(cat => `${cat.id}:${cat.assigned}:${cat.activity}`).join(',')]);

  // ==================== DATABASE OPERATIONS ====================
  const PROSPERITY_SNAPSHOT_KEY = 'intentflow.prosperityMap.v1';

  const cloneCategoryRows = (rows) => (rows || []).map((c) => ({ ...c }));

  const saveSnapshotToSession = (snap) => {
    if (!snap?.categories?.length) return;
    try {
      sessionStorage.setItem(
        PROSPERITY_SNAPSHOT_KEY,
        JSON.stringify({
          categories: snap.categories,
          categoryGroups: snap.categoryGroups || [],
          userId: snap.userId,
          monthKey: snap.monthKey,
          at: snap.at || Date.now()
        })
      );
    } catch (_) {
      /* sessionStorage may be unavailable */
    }
  };

  const loadSnapshotFromSession = (snapshotUserId, snapshotMonthKey) => {
    try {
      const raw = sessionStorage.getItem(PROSERITY_SNAPSHOT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.categories?.length) return null;
      if (snapshotUserId != null && parsed.userId != null && String(parsed.userId) !== String(snapshotUserId)) {
        return null;
      }
      if (snapshotMonthKey && parsed.monthKey && parsed.monthKey !== snapshotMonthKey) {
        return null;
      }
      return parsed;
    } catch (_) {
      return null;
    }
  };

  const hydrateSnapshotFromSession = (snapshotUserId, snapshotMonthKey) => {
    const parsed = loadSnapshotFromSession(snapshotUserId, snapshotMonthKey);
    if (!parsed) return false;
    lastGoodSnapshotRef.current = {
      categories: cloneCategoryRows(parsed.categories),
      categoryGroups: (parsed.categoryGroups || []).map((g) => ({ ...g })),
      userId: parsed.userId,
      monthKey: parsed.monthKey,
      at: parsed.at || Date.now()
    };
    hasEverLoadedSuccessRef.current = true;
    setBudgetData((prev) => ({ ...prev, categories: lastGoodSnapshotRef.current.categories }));
    setCategories(lastGoodSnapshotRef.current.categories);
    if (lastGoodSnapshotRef.current.categoryGroups.length > 0) {
      setCategoryGroups(lastGoodSnapshotRef.current.categoryGroups);
    }
    return true;
  };

  const commitBudgetSnapshot = (categories, groupsArg, snapshotUserId, snapshotMonthKey) => {
    const rows =
      Array.isArray(categories) && categories.length > 0
        ? categories
        : lastGoodSnapshotRef.current.categories;
    if (!rows?.length) return false;

    const groups =
      Array.isArray(groupsArg) && groupsArg.length > 0
        ? groupsArg
        : lastGoodSnapshotRef.current.categoryGroups || [];
    const uid = snapshotUserId ?? userId;
    const monthKey = snapshotMonthKey ?? formatBudgetMonthKey(selectedMonthRef.current || selectedMonth);
    lastGoodSnapshotRef.current = {
      categories: cloneCategoryRows(rows),
      categoryGroups: groups.map((g) => ({ ...g })),
      userId: uid,
      monthKey,
      at: Date.now()
    };
    hasEverLoadedSuccessRef.current = true;
    saveSnapshotToSession(lastGoodSnapshotRef.current);
    setBudgetData((prev) => ({ ...prev, categories: lastGoodSnapshotRef.current.categories }));
    setCategories(lastGoodSnapshotRef.current.categories);
    if (groups.length > 0) {
      setCategoryGroups(lastGoodSnapshotRef.current.categoryGroups);
    }
    return true;
  };

  /** Restore UI from last good snapshot when a reload would wipe visible rows. */
  const restoreFromLastGoodSnapshotIfNeeded = (opts = {}) => {
    const { groupsOnly = false } = opts;
    let snap = lastGoodSnapshotRef.current;
    const monthKey = formatBudgetMonthKey(selectedMonthRef.current || selectedMonth);

    if (!snap?.categories?.length) {
      const fromSession = loadSnapshotFromSession(resolveBudgetUserId(), monthKey);
      if (fromSession) {
        lastGoodSnapshotRef.current = {
          categories: cloneCategoryRows(fromSession.categories),
          categoryGroups: (fromSession.categoryGroups || []).map((g) => ({ ...g })),
          userId: fromSession.userId,
          monthKey: fromSession.monthKey,
          at: fromSession.at || Date.now()
        };
        snap = lastGoodSnapshotRef.current;
      }
    }
    if (!snap?.categories?.length) return false;

    const activeUserId = resolveBudgetUserId();
    if (snap.userId != null && activeUserId != null && String(snap.userId) !== String(activeUserId)) {
      return false;
    }
    if (snap.monthKey && monthKey && snap.monthKey !== monthKey) {
      return false;
    }

    if (groupsOnly) {
      if ((categoryGroups?.length || 0) > 0) return false;
      if (!snap.categoryGroups?.length) return false;
      setCategoryGroups(snap.categoryGroups.map((g) => ({ ...g })));
      return true;
    }

    const hasUiCategoryRows = (budgetData.categories?.length || 0) > 0;
    if (hasUiCategoryRows) {
      if ((categoryGroups?.length || 0) === 0 && snap.categoryGroups?.length) {
        setCategoryGroups(snap.categoryGroups.map((g) => ({ ...g })));
        return true;
      }
      return false;
    }

    setBudgetData((prev) => ({ ...prev, categories: cloneCategoryRows(snap.categories) }));
    setCategories(snap.categories);
    if (snap.categoryGroups?.length) {
      setCategoryGroups(snap.categoryGroups.map((g) => ({ ...g })));
    }
    hasEverLoadedSuccessRef.current = true;
    return true;
  };

  /** Drop archived rows if IPC ever returns them (active-budget table must stay non-archived only). */
  const activeCategoriesFromDb = (dbCategories) =>
    withDerivedAvailable(
      applyGoalPatchesToRows(dbCategories).filter((row) => !isCategoryArchived(row)),
    );

  const removeCategoryFromLocalBudget = (categoryId) => {
    const without = (rows) =>
      (rows || []).filter((row) => !sameCategoryId(row.id, categoryId));
    const nextCategories = without(lastGoodSnapshotRef.current.categories);
    const monthKey = formatBudgetMonthKey(selectedMonthRef.current || selectedMonth);
    lastGoodSnapshotRef.current = {
      ...lastGoodSnapshotRef.current,
      categories: cloneCategoryRows(nextCategories),
      userId,
      monthKey,
      at: Date.now(),
    };
    if (nextCategories.length > 0) {
      saveSnapshotToSession(lastGoodSnapshotRef.current);
    } else {
      try {
        sessionStorage.removeItem(PROSERITY_SNAPSHOT_KEY);
      } catch (_) {
        /* ignore */
      }
    }
    setBudgetData((prev) => ({ ...prev, categories: without(prev.categories) }));
    setCategories(without);
  };

  const hasKnownCategoryRows = () =>
    (lastGoodSnapshotRef.current.categories?.length || 0) > 0 ||
    (budgetData.categories?.length || 0) > 0;

  /** Never replace a populated table with an empty IPC response (unless allowEmpty). */
  const applyCategoriesFromDb = (dbCategories, monthKey, opts = {}) => {
    const ownerId = resolveBudgetUserId(opts.userId);
    const patchedCategories = activeCategoriesFromDb(dbCategories);
    const actualMonthChanged = Boolean(
      monthKey &&
        lastGoodSnapshotRef.current.monthKey &&
        lastGoodSnapshotRef.current.monthKey !== monthKey,
    );
    if (patchedCategories.length > 0) {
      const groups =
        (categoryGroups?.length || 0) > 0
          ? categoryGroups
          : lastGoodSnapshotRef.current.categoryGroups;
      commitBudgetSnapshot(patchedCategories, groups, ownerId, monthKey);
      return patchedCategories;
    }
    if (opts.allowEmpty) {
      lastGoodSnapshotRef.current = {
        categories: [],
        categoryGroups: lastGoodSnapshotRef.current.categoryGroups || [],
        userId: ownerId,
        monthKey,
        at: Date.now()
      };
      hasEverLoadedSuccessRef.current = true;
      setBudgetData((prev) => ({ ...prev, categories: [] }));
      setCategories([]);
      return [];
    }
    if (actualMonthChanged) {
      setBudgetData((prev) => ({ ...prev, categories: [] }));
      setCategories([]);
      lastGoodSnapshotRef.current = {
        ...lastGoodSnapshotRef.current,
        categories: [],
        monthKey,
        userId: ownerId,
        at: Date.now(),
      };
    }
    if (hasKnownCategoryRows() && !actualMonthChanged) {
      console.warn('⚠️ Transient empty categories response — kept current table data.');
      return lastGoodSnapshotRef.current.categories || budgetData.categories || null;
    }
    if (restoreFromLastGoodSnapshotIfNeeded()) {
      console.warn('⚠️ Transient empty categories response — restored last known snapshot.');
      return lastGoodSnapshotRef.current.categories || null;
    }
    return null;
  };

  const loadCategoryGroups = async (opts = {}) => {
    if (!window.electronAPI?.getCategoryGroups) {
      console.error('❌ electronAPI.getCategoryGroups is not available!');
      return;
    }

    const ownerId = resolveBudgetUserId(opts.userId);
    if (!ownerId) return;

    try {
      setLoading(true);
      const result = await window.electronAPI.getCategoryGroups(ownerId);
      if (result?.success && Array.isArray(result.data) && result.data.length > 0) {
        // Use ref first — budgetData React state can lag behind a just-finished load/archive.
        const cats =
          lastGoodSnapshotRef.current.categories?.length > 0
            ? lastGoodSnapshotRef.current.categories
            : budgetData.categories;
        setCategoryGroups(result.data);
        if (cats?.length) {
          commitBudgetSnapshot(cats, result.data, ownerId);
        } else {
          lastGoodSnapshotRef.current = {
            ...lastGoodSnapshotRef.current,
            categoryGroups: result.data.map((g) => ({ ...g })),
            userId: ownerId,
            at: Date.now()
          };
          if (lastGoodSnapshotRef.current.categories?.length) {
            saveSnapshotToSession(lastGoodSnapshotRef.current);
          }
        }
        return;
      }
      if (result?.success && Array.isArray(result.data) && result.data.length === 0) {
        if (hasEverLoadedSuccessRef.current) {
          restoreFromLastGoodSnapshotIfNeeded({ groupsOnly: true });
        }
        return;
      }
      if (!categoryGroups.length && !hasEverLoadedSuccessRef.current) {
        setCategoryGroups([]);
      }
    } catch (error) {
      console.error('Error loading category groups:', error);
      if (hasEverLoadedSuccessRef.current) {
        restoreFromLastGoodSnapshotIfNeeded();
      }
    } finally {
      setLoading(false);
    }
  };

  const loadCategoriesFromDB = async (retryCount = 0, opts = {}) => {
    if (!window.electronAPI?.getCategories) {
      console.error('❌ electronAPI.getCategories is not available!');
      return null;
    }
    const ownerId = resolveBudgetUserId(opts.userId);
    if (!ownerId) {
      console.warn('⚠️ No userId provided to loadCategoriesFromDB');
      return null;
    }
    if (editingCategoryRef.current != null && !opts.allowWhileEditing) {
      return null;
    }

    const monthDate = opts.monthDate ?? selectedMonthRef.current ?? selectedMonth;
    const monthKey = formatBudgetMonthKey(monthDate);

    const showLoading = opts.suppressLoading !== true;
    const mapSnapshotCategories = (rows) =>
      (rows || []).map((cat) =>
        mapDbCategoryToBudgetRow({ ...cat, _envelopeFromSnapshot: true }),
      );

    try {
      if (showLoading) {
        setLoading(true);
      }

      if (window.electronAPI.getBudgetMonthSnapshot) {
        const snap = await window.electronAPI.getBudgetMonthSnapshot(ownerId, monthKey);
        if (snap?.success && snap.data && Array.isArray(snap.data.categories)) {
          if (snap.data.categories.length > 0) {
            const dbCategories = mapSnapshotCategories(snap.data.categories);
            if (snap.data.underfundedTotal != null) {
              lastGoodSnapshotRef.current = {
                ...lastGoodSnapshotRef.current,
                underfundedTotal: Number(snap.data.underfundedTotal) || 0,
                underfundedBreakdown: snap.data.underfundedBreakdown || [],
              };
            }
            const loaded = applyCategoriesFromDb(dbCategories, monthKey, { ...opts, userId: ownerId });
            setTimeout(() => {
              loadCategoryGroups({ userId: ownerId });
            }, 100);
            return loaded;
          }
          console.warn('⚠️ getBudgetMonthSnapshot returned zero categories; trying getCategories');
        } else {
          console.warn('⚠️ getBudgetMonthSnapshot failed; falling back to getCategories', snap?.error);
        }
      }

      const result = await window.electronAPI.getCategories(ownerId, monthKey);

      if (result && result.success && Array.isArray(result.data) && result.data.length > 0) {
        const dbCategories = mapSnapshotCategories(result.data);
        const loaded = applyCategoriesFromDb(dbCategories, monthKey, { ...opts, userId: ownerId });
        setTimeout(() => {
          loadCategoryGroups({ userId: ownerId });
        }, 100);
        return loaded;
      }
    } catch (error) {
      console.error('❌ Error loading categories:', error);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }

    if (restoreFromLastGoodSnapshotIfNeeded()) {
      return lastGoodSnapshotRef.current.categories || null;
    }
    return null;
  };

  const loadArchivedCategories = async () => {
    if (!window.electronAPI?.getArchivedCategories) {
      console.error('❌ electronAPI.getArchivedCategories is not available!');
      setArchivedCategories([]);
      return;
    }

    try {
      const result = await window.electronAPI.getArchivedCategories(userId);
      if (result && result.success) {
        setArchivedCategories(result.data);
      } else {
        setArchivedCategories([]);
      }
    } catch (error) {
      console.error('Error loading archived categories:', error);
      setArchivedCategories([]);
    }
  };

  // ==================== CATEGORY & GROUP HANDLERS ====================
  const handleArchiveCategory = async (category) => {
    if (!confirm(`Archive "${category.name}"?\n\nArchived categories are removed from your budget but can be restored later. Transaction history is preserved.`)) {
      return;
    }
    try {
      const archiveGroupId = normalizeGroupId(category.groupId ?? category.group_id);
      const archiveGroup = archiveGroupId
        ? categoryGroups.find((g) => normalizeGroupId(g.id) === archiveGroupId)
        : null;
      const result = await window.electronAPI.archiveCategory(category.id, userId, {
        groupId: archiveGroupId || undefined,
        groupName: archiveGroup?.name || undefined,
      });
      if (result && result.success) {
        removeCategoryFromLocalBudget(category.id);
        await loadCategoriesFromDB(0, {
          monthDate: selectedMonthRef.current || selectedMonth,
        });
        await loadCategoryGroups();
        await loadArchivedCategories();
        alert(`✅ Category "${category.name}" has been archived.`);
      } else {
        alert('❌ Failed to archive category: ' + (result?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error archiving category:', error);
      alert('Error: ' + error.message);
    }
  };

  const handleRestoreCategory = async (category) => {
    if (!confirm(`Restore "${category.name}" to your budget?\n\nIt will be placed back in its original group.`)) {
      return;
    }
    try {
      const restoreGroupId = normalizeGroupId(
        category.original_group_id ?? category.group_id,
      );
      const result = await window.electronAPI.restoreCategory(category.id, userId, {
        groupId: restoreGroupId || undefined,
        groupName:
          category.original_group_name || category.group_name || undefined,
      });
      if (result && result.success) {
        await loadCategoriesFromDB(0, {
          monthDate: selectedMonthRef.current || selectedMonth,
        });
        await loadCategoryGroups();
        await loadArchivedCategories();
        alert(`✅ Category "${category.name}" has been restored.`);
      } else {
        alert('❌ Failed to restore category: ' + (result?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error restoring category:', error);
      alert('Error: ' + error.message);
    }
  };

  const handleEditCategory = (category) => {
    editingCategoryRef.current = category.id;
    setEditingCategory(category.id);
  };

  const buildEditPreviewCategory = (baseCategory, draft) => {
    const parsedAssigned = parseMoneyInput(draft.assignedInput);
    const parsedTarget = parseMoneyInput(draft.targetAmountInput);
    return {
      ...baseCategory,
      assigned: Number.isFinite(parsedAssigned) ? parsedAssigned : baseCategory.assigned,
      target_amount: Number.isFinite(parsedTarget) ? parsedTarget : baseCategory.target_amount,
      target_type: draft.targetType,
      target_date: draft.targetDate
    };
  };

  const getGoalTooltip = (category) => {
    const targetInfo = calculateTargetProgress(category);
    const hasGoal = targetInfo.status !== 'no-target';
    if (!hasGoal) return 'No Goal';
    const statusLabel = (targetInfo.needed || 0) > 0 ? 'Underfunded' : 'Fully Funded';
    return [
      `Status: ${statusLabel}`,
      `Target: ${formatCurrency(targetInfo.targetAmount || category.target_amount || 0)}`,
      `Available: ${formatCurrency(targetInfo.currentAmount || category.available || 0)}`,
      `Funding Needed: ${formatCurrency(targetInfo.needed || 0)}`,
    ].join(' · ');
  };

  const getGoalStatusLabel = (targetInfo) => {
    if (!targetInfo || targetInfo.status === 'no-target') return 'No Goal';
    return (targetInfo.needed || 0) > 0 ? 'Underfunded' : 'Fully Funded';
  };

  const getGroupProgressLabel = (groupCategories, groupTotals) => {
    const withGoals = groupCategories.filter(
      (cat) => calculateTargetProgress(cat).status !== 'no-target',
    );
    if (withGoals.length === 0) return '—';
    if ((groupTotals.underfunded || 0) <= 0) return '100% fully funded';
    return `${formatCurrency(groupTotals.underfunded)} underfunded`;
  };

  const getProgressColor = (status) => {
    if (status === 'no-target') return '#93C5FD';
    switch (status) {
      case 'funded':
      case 'completed':
        return '#4ADE80';
      case 'partial':
      case 'in-progress':
        return '#F59E0B';
      case 'unfunded':
      case 'not-started':
        return '#EF4444';
      default:
        return '#93C5FD';
    }
  };

  const handleSaveCategoryEdit = async (payload) => {
    const {
      categoryId,
      name,
      assigned: parsedAssigned,
      target_amount: parsedTargetAmount,
      target_type: targetType,
      target_frequency: targetFrequency,
      target_date: targetDate
    } = payload;

    try {
      const monthKey = formatBudgetMonthKey(selectedMonthRef.current || selectedMonth);
      const goalFields = {
        target_amount: parsedTargetAmount,
        target_type: targetType,
        target_frequency: targetFrequency || 'monthly',
        target_date: targetDate
      };
      const updates = {
        name,
        assigned: parsedAssigned,
        ...goalFields,
        budget_month: monthKey
      };

      const result = await window.electronAPI.updateCategory(categoryId, updates);

      if (!result.success) {
        alert('Failed to update category: ' + (result.error || 'Unknown error'));
        return;
      }

      registerGoalPatch(categoryId, goalFields);

      setEditingCategory(null);
      editingCategoryRef.current = null;

      const moneyChanged = Number.isFinite(parsedAssigned);
      if (moneyChanged) {
        const reloaded = await loadCategoriesFromDB(0, {
          monthDate: selectedMonthRef.current || selectedMonth,
        });
        calculateReadyToAssign(
          reloaded || lastGoodSnapshotRef.current.categories || budgetData.categories,
        );
      } else {
        const nextCategories = budgetData.categories.map((cat) => {
          if (!sameCategoryId(cat.id, categoryId)) return cat;
          const fromServer = result.data ? mapDbCategoryToBudgetRow(result.data) : null;
          return fromServer
            ? { ...cat, ...fromServer, name }
            : { ...cat, name, ...goalFields };
        });
        commitBudgetSnapshot(withDerivedAvailable(nextCategories), categoryGroups, userId, monthKey);
      }

      alert('✅ Category updated successfully!');
    } catch (error) {
      console.error('❌ Error saving category:', error);
      alert('Error: ' + error.message);
      setEditingCategory(null);
      editingCategoryRef.current = null;
    }
  };

  const handleCancelEdit = () => {
    setEditingCategory(null);
    editingCategoryRef.current = null;
  };

  const handleDeleteCategory = async (categoryId) => {
    if (!confirm('Are you sure you want to delete this category?')) return;
    try {
      const deleteResult = await window.electronAPI.deleteCategory(categoryId);
      if (deleteResult && deleteResult.success) {
        setBudgetData(prev => ({
          ...prev,
          categories: prev.categories.filter(cat => cat.id !== categoryId)
        }));
        alert('✅ Category deleted successfully');
      } else {
        await loadCategoriesFromDB();
        alert('❌ Failed to delete category: ' + (deleteResult?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('❌ Error in delete category:', error);
      alert('❌ Error deleting category: ' + error.message);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryData.name.trim()) {
      alert('Please enter a category name');
      return;
    }
    if (!newCategoryData.groupId) {
      alert('Please select a category group before creating a category');
      return;
    }
    try {
      setLoading(true);
      const groupExists = categoryGroups.some(g => g.id === newCategoryData.groupId);
      if (!groupExists) {
        alert('Selected group no longer exists. Please select another group.');
        setLoading(false);
        return;
      }
      const categoryData = {
        name: newCategoryData.name.trim(),
        assigned: 0,
        group_id: newCategoryData.groupId,
        user_id: userId,
        target_amount: newCategoryData.assigned || 0,
        target_type: 'monthly',
        target_date: null,
        priority: 2,
        archived: 0
      };
      const result = await window.electronAPI.createCategory(categoryData);
      if (result.success && result.data) {
        const initialAssigned = newCategoryData.assigned || 0;
        const monthKey = formatBudgetMonthKey(selectedMonthRef.current || selectedMonth);
        if (initialAssigned > 0) {
          const assignResult = await window.electronAPI.updateCategory(
            result.data.id,
            {
              assigned: initialAssigned,
              budget_month: monthKey
            }
          );
          if (!assignResult?.success) {
            alert('⚠️ Category created but initial assign failed: ' + (assignResult?.error || 'Unknown error'));
          }
        }
        const newCategory = {
          id: result.data.id,
          name: categoryData.name,
          assigned: initialAssigned,
          activity: 0,
          available: initialAssigned,
          groupId: newCategoryData.groupId,
          user_id: userId,
          priority: 2,
          target_amount: categoryData.target_amount || 0,
          target_type: 'monthly',
          target_date: null,
          progress: (initialAssigned || 0) > 0 ? 100 : 0,
          last_month_assigned: 0,
          average_spending: 0,
          archived: false
        };
        setBudgetData(prev => ({
          ...prev,
          categories: [...prev.categories, newCategory]
        }));
        setCategories(prev => [...prev, newCategory]);
        setShowAddCategoryModal(false);
        setNewCategoryData({ name: '', assigned: 0, groupId: null });
        setSelectedGroupForCategory(null);
        alert('✅ Category created successfully!');
        await loadCategoriesFromDB(0, { monthDate: selectedMonthRef.current || selectedMonth });
      } else {
        alert('❌ Failed to create category: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error creating category:', error);
      alert('Error creating category: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      alert('Please enter a group name');
      return;
    }
    try {
      setLoading(true);
      const groupsResult = await window.electronAPI.getCategoryGroups(userId);
      if (groupsResult.success && groupsResult.data) {
        const existingGroup = groupsResult.data.find(
          group => group.name.toLowerCase() === newGroupName.trim().toLowerCase()
        );
        if (existingGroup) {
          alert(`❌ A group named "${newGroupName}" already exists in the database! Please use a different name.`);
          setLoading(false);
          return;
        }
      }
      const result = await window.electronAPI.createCategoryGroup(
        userId,
        newGroupName.trim(),
        categoryGroups.length
      );
      if (result.success && result.data) {
        setCategoryGroups(prev => [...prev, result.data]);
        setShowAddGroupModal(false);
        setNewGroupName('');
        alert('✅ Group created successfully!');
        await loadCategoryGroups();
      } else {
        alert('❌ Failed to create group: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error creating category group:', error);
      alert('Error creating group: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateGroup = async () => {
    if (!editGroupName.trim() || !editingGroup) return;
    try {
      setLoading(true);
      const groupsResult = await window.electronAPI.getCategoryGroups(userId);
      if (groupsResult.success && groupsResult.data) {
        const existingGroup = groupsResult.data.find(
          group => group.id !== editingGroup.id &&
            group.name.toLowerCase() === editGroupName.trim().toLowerCase()
        );
        if (existingGroup) {
          alert(`❌ A group named "${editGroupName}" already exists! Please use a different name.`);
          setLoading(false);
          return;
        }
      }
      const updateResult = await window.electronAPI.updateCategoryGroup(
        editingGroup.id,
        userId,
        { name: editGroupName.trim() }
      );
      if (updateResult.success) {
        setCategoryGroups(prevGroups =>
          prevGroups.map(g =>
            g.id === editingGroup.id ? { ...g, name: editGroupName.trim() } : g
          )
        );
        setShowEditGroupModal(false);
        setEditingGroup(null);
        setEditGroupName('');
        alert('✅ Group updated successfully!');
        await loadCategoryGroups();
      } else {
        alert('❌ Failed to update group: ' + (updateResult.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error updating category group:', error);
      alert('Error updating group: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async (groupId) => {
    const gid = normalizeGroupId(groupId);
    const categoriesInGroup = budgetData.categories.filter(
      (cat) => normalizeGroupId(cat.groupId ?? cat.group_id) === gid && !isCategoryArchived(cat),
    );
    if (categoriesInGroup.length > 0) {
      alert(`Cannot delete this group because it contains ${categoriesInGroup.length} categories. Please move or delete all categories in this group first.`);
      return;
    }
    if (!confirm(`Are you sure you want to delete this group?`)) {
      return;
    }
    try {
      setLoading(true);
      const result = await window.electronAPI.deleteCategoryGroup(groupId, userId);
      if (result && result.success) {
        if (editingGroup && editingGroup.id === groupId) {
          setShowEditGroupModal(false);
          setEditingGroup(null);
          setEditGroupName('');
        }
        setCategoryGroups(prevGroups => prevGroups.filter(g => g.id !== groupId));
        alert('✅ Group deleted successfully');
      } else {
        alert('❌ Failed to delete group: ' + (result?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('❌ Error deleting category group:', error);
      alert('❌ Error deleting group: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCategory = (group) => {
    setSelectedGroupForCategory(group);
    setNewCategoryData({
      name: '',
      assigned: 0,
      groupId: group.id
    });
    setShowAddCategoryModal(true);
  };

  const handleEditGroup = (group) => {
    setEditingGroup(group);
    setEditGroupName(group.name);
    setShowEditGroupModal(true);
  };

  // ==================== QUICK ACTIONS ====================
  const handleAddIncome = async () => {
    const amount = parseFloat(incomeData.amount);

    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('Please log in to add income');
        return;
      }
      const accountsResult = await window.electronAPI.getAccountsSummary(userResult.data.id);
      const defaultAccount = accountsResult?.data?.find(a => a.type === 'checking' || a.type === 'savings');
      if (!defaultAccount) {
        alert('No account found to record income to');
        return;
      }
      const transactionData = {
        accountId: defaultAccount.id,
        date: incomeData.date,
        payee: incomeData.memo || 'Income',
        description: incomeData.memo || 'Income',
        amount: amount,
        categoryId: null,
        memo: incomeData.memo,
        cleared: 1
      };
      const result = await window.electronAPI.addTransaction(transactionData);
      if (result.success) {
        const userIdForAccounts = userResult.data.id;
        const accountsResult = await window.electronAPI.getAccountsSummary(userIdForAccounts);
        if (accountsResult?.success && accountsResult.data) {
          setTotalCashInAccounts(sumTotalBudgetCash(accountsResult.data));
        }
        setIncomeData({
          amount: '',
          date: new Date().toISOString().split('T')[0],
          memo: ''
        });
        setShowAddIncomeModal(false);
        await loadCategoriesFromDB(0, { monthDate: selectedMonthRef.current || selectedMonth });
        calculateReadyToAssign();
        alert(`✅ $${amount.toFixed(2)} added to Ready to Assign`);
      } else {
        alert('❌ Error recording income: ' + result.error);
      }
    } catch (error) {
      console.error('Error adding income:', error);
      alert('❌ Error adding income: ' + error.message);
    }
  };

  const handleUnassignMonth = async () => {
    if (!userId) return;
    if (!window.electronAPI?.unassignMonthBudget) {
      alert('Unassign is not available in this build.');
      return;
    }

    const monthKey = formatBudgetMonthKey(selectedMonthRef.current || selectedMonth);
    const monthLabel = selectedMonth.toLocaleString('default', {
      month: 'long',
      year: 'numeric',
    });

    await loadCategoriesFromDB(0, { monthDate: monthKeyToLocalDate(monthKey) });
    const monthAssignedTotal = getMonthAssignedTotal();

    if (monthAssignedTotal <= 0) {
      alert(`No assigned amounts to clear for ${monthLabel}.`);
      return;
    }

    if (
      !confirm(
        `Unassign all ${formatCurrency(monthAssignedTotal)} from ${monthLabel}?\n\n` +
          `This clears Assigned for every category in this month and returns the same amount to Ready to Assign.`,
      )
    ) {
      return;
    }

    setIsUnassigningMonth(true);
    try {
      const res = await window.electronAPI.unassignMonthBudget(userId, monthKey);
      if (!res?.success) {
        throw new Error(res?.error || 'Unassign failed');
      }

      const released = roundMoney(res.data?.totalReleased ?? monthAssignedTotal);
      const count = res.data?.categoriesUpdated ?? 0;

      const reloaded = await loadCategoriesFromDB(0, {
        monthDate: selectedMonthRef.current || selectedMonth,
      });
      calculateReadyToAssign(
        reloaded || lastGoodSnapshotRef.current.categories,
      );

      alert(
        `✅ Unassigned ${formatCurrency(released)} from ${monthLabel}` +
          (count > 0 ? ` (${count} categories).` : '.'),
      );
    } catch (err) {
      console.error('Unassign month error:', err);
      await loadCategoriesFromDB(0, {
        monthDate: selectedMonthRef.current || selectedMonth,
      });
      calculateReadyToAssign();
      alert(`❌ Error while unassigning: ${err.message}`);
    } finally {
      setIsUnassigningMonth(false);
    }
  };

  const handleQuickAssign = async (method) => {
    if (isQuickAssigning) {
      return;
    }
    if (isMonthBudgetLoading) {
      alert('This month is still loading. Please wait a moment and try again.');
      return;
    }

    setIsQuickAssigning(true);
    try {
    const monthKey = formatBudgetMonthKey(selectedMonthRef.current || selectedMonth);
    const freshRows = await loadCategoriesFromDB(0, {
      monthDate: monthKeyToLocalDate(monthKey),
      suppressLoading: true,
    });
    const activeCategories = getActiveBudgetCategories(freshRows);
    if (!activeCategories.length) {
      alert('No budget categories are loaded for this month. Try Refresh categories, then try again.');
      return;
    }

    const pool = await resolveReadyToAssignPool();

    if (pool <= 0) {
      alertNoReadyToAssignForQuickAssign(pool);
      return;
    }

    let allocations = [];
    let remainingFunds = pool;

    switch (method) {
      case 'smart': {
        // Smallest Goal Target (budget target) first; assign until Ready to Assign is exhausted.
        const candidates = activeCategories
          .map(cat => {
            const targetInfo = calculateTargetProgress(cat);
            let neededAmount = 0;
            if ((cat.available || 0) < 0) {
              neededAmount = Math.abs(cat.available || 0);
            } else if (targetInfo.needed > 0) {
              neededAmount = targetInfo.needed;
            }
            const budgetTarget = Number(cat.target_amount) || 0;
            return { ...cat, neededAmount, budgetTarget, targetInfo };
          })
          .filter(c => c.neededAmount > 0)
          .sort((a, b) => {
            if (a.budgetTarget !== b.budgetTarget) return a.budgetTarget - b.budgetTarget;
            return String(a.name || '').localeCompare(String(b.name || ''));
          });

        for (const cat of candidates) {
          if (remainingFunds <= 0) break;
          const amountToAssign = Math.min(cat.neededAmount, remainingFunds);
          if (amountToAssign > 0) {
            allocations.push({
              categoryId: cat.id,
              amount: amountToAssign,
              reason: `${cat.name}: ${formatCurrency(amountToAssign)} (target ${formatCurrency(cat.budgetTarget)})`
            });
            remainingFunds -= amountToAssign;
          }
        }
        break;
      }

      case 'underfunded': {
        const plan = computeFundUnderfundedPlan(activeCategories, { pool });
        allocations = plan.allocations;
        break;
      }

      case 'last-month':
        activeCategories.forEach(cat => {
          const lastMonthAmount = cat.last_month_assigned || cat.assigned || 0;
          const currentAssigned = cat.assigned || 0;
          const needed = Math.max(0, lastMonthAmount - currentAssigned);
          if (needed > 0 && remainingFunds >= needed) {
            allocations.push({ categoryId: cat.id, amount: needed, reason: `Match last month's ${formatCurrency(lastMonthAmount)}` });
            remainingFunds -= needed;
          }
        });
        break;

      case 'average':
        activeCategories.forEach(cat => {
          const avgSpend = cat.average_spending || cat.assigned || 0;
          const currentAssigned = cat.assigned || 0;
          const needed = Math.max(0, avgSpend - currentAssigned);
          if (needed > 0 && remainingFunds >= needed) {
            allocations.push({ categoryId: cat.id, amount: needed, reason: `Average spending: ${formatCurrency(avgSpend)}` });
            remainingFunds -= needed;
          }
        });
        break;
    }

    if (allocations.length > 0) {
      const totalAssign = allocations.reduce((sum, a) => sum + a.amount, 0);
      const previewMessage = allocations.map(a => `${a.reason}: ${formatCurrency(a.amount)}`).join('\n');
      const fundingSummary =
        method === 'underfunded'
          ? (() => {
              const summary = getFundUnderfundedSummary(activeCategories);
              const parts = [];
              if (summary.overspentTotal > 0) {
                parts.push(`${formatCurrency(summary.overspentTotal)} overspent`);
              }
              if (summary.goalUnderfundedTotal > 0) {
                parts.push(`${formatCurrency(summary.goalUnderfundedTotal)} goal gaps`);
              }
              return parts.length
                ? `\n\nFunding need: ${parts.join(' + ')} = ${formatCurrency(summary.totalFundingNeed)}`
                : '';
            })()
          : '';

      if (
        !confirm(
          `Assign ${formatCurrency(totalAssign)} from Ready to Assign (${formatCurrency(pool)}) to ${allocations.length} categories:${fundingSummary}\n\n${previewMessage}\n\nProceed?`,
        )
      ) {
        return;
      }

      const deltaByCategoryId = new Map();
      for (const allocation of allocations) {
        const categoryId = String(allocation.categoryId);
        deltaByCategoryId.set(
          categoryId,
          (deltaByCategoryId.get(categoryId) || 0) + allocation.amount
        );
      }

      try {
        const bulkAssignments = Array.from(deltaByCategoryId.entries()).map(
          ([categoryId, delta]) => ({
            categoryId,
            delta,
          }),
        );

        if (window.electronAPI?.bulkAssignMonthBudget) {
          const bulkRes = await window.electronAPI.bulkAssignMonthBudget(
            userId,
            monthKey,
            bulkAssignments,
            {
              mode: 'delta',
              totalCash: totalCashInAccounts,
              auditSource: method === 'underfunded' ? 'fund_underfunded' : 'quick_assign',
            },
          );
          if (!bulkRes?.success) {
            throw new Error(bulkRes?.error || 'Bulk assign failed');
          }
        } else {
          for (const { categoryId, delta } of bulkAssignments) {
            const categoryRow = activeCategories.find((c) => sameCategoryId(c.id, categoryId));
            const newAssigned = roundMoney((Number(categoryRow?.assigned) || 0) + delta);
            const res = await window.electronAPI.updateCategory(categoryId, {
              assigned: newAssigned,
              budget_month: monthKey,
            });
            if (!res?.success) {
              throw new Error(res?.error || `Failed to assign category ${categoryId}`);
            }
          }
        }

        await refreshGlobalBudgetSummary();
        const reloadedCategories = await loadCategoriesFromDB(0, {
          monthDate: monthKeyToLocalDate(monthKey),
          forceMonthReplace: true,
          suppressLoading: true,
        });
        await refreshGlobalBudgetSummary();
        calculateReadyToAssign(
          reloadedCategories || lastGoodSnapshotRef.current.categories,
        );
        alert(`✅ Assigned ${formatCurrency(totalAssign)} to ${deltaByCategoryId.size} categories`);
      } catch (err) {
        console.error('Quick assign error:', err);
        const reloadedCategories = await loadCategoriesFromDB(0, {
          monthDate: monthKeyToLocalDate(monthKey),
          forceMonthReplace: true,
          suppressLoading: true,
        });
        await refreshGlobalBudgetSummary();
        calculateReadyToAssign(
          reloadedCategories || lastGoodSnapshotRef.current.categories,
        );
        alert(`❌ Error while saving assignments: ${err.message}`);
      }
    } else {
      alert('No categories need funding based on current criteria for this month.');
    }
    } finally {
      setIsQuickAssigning(false);
    }
  };

  const handleRecordPayment = async () => {
    const amount = parseFloat(paymentData.amount);

    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    if (!paymentData.categoryId) {
      alert('Please select a category');
      return;
    }
    const selectedCategory = budgetData.categories.find(c => c.id === paymentData.categoryId);
    if (!selectedCategory) return;
    if (selectedCategory.available < amount) {
      if (!confirm(`Warning: This category only has ${formatCurrency(selectedCategory.available)} available. Overspending will make it negative. Continue?`)) {
        return;
      }
    }
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('Please log in to record payments');
        return;
      }
      const accountsResult = await window.electronAPI.getAccountsSummary(userResult.data.id);
      const defaultAccount = accountsResult?.data?.find(a => a.type === 'checking' || a.type === 'savings');
      if (!defaultAccount) {
        alert('No account found to record payment from');
        return;
      }
      const transactionData = {
        accountId: defaultAccount.id,
        date: paymentData.date,
        payee: paymentData.payee || 'Payment',
        description: paymentData.payee || 'Payment',
        amount: -amount,
        categoryId: paymentData.categoryId,
        memo: paymentData.memo,
        cleared: 1
      };
      const result = await window.electronAPI.addTransaction(transactionData);
      if (result.success) {
        setTotalCashInAccounts(prev => prev - amount);
        setPaymentData({
          amount: '',
          categoryId: '',
          payee: '',
          date: new Date().toISOString().split('T')[0],
          memo: ''
        });
        setShowRecordPaymentModal(false);
        await loadCategoriesFromDB(0, { monthDate: selectedMonthRef.current || selectedMonth });
        calculateReadyToAssign();
        alert(`✅ Payment of $${amount.toFixed(2)} recorded to ${selectedCategory.name}`);
      } else {
        alert('❌ Error recording payment: ' + result.error);
      }
    } catch (error) {
      console.error('Error recording payment:', error);
      alert('❌ Error recording payment: ' + error.message);
    }
  };

  const activeCategories = (budgetData.categories || []).filter((c) => !isCategoryArchived(c));
  const normalizedMoveMoneyQuery = moveMoneySearchQuery.trim().toLowerCase();
  const filteredMoveMoneyCategories = normalizedMoveMoneyQuery
    ? activeCategories.filter((cat) =>
        String(cat.name || '').toLowerCase().includes(normalizedMoveMoneyQuery),
      )
    : activeCategories;

  const getCategoryById = (categoryId) =>
    (budgetData.categories || []).find((c) => sameCategoryId(c.id, categoryId));

  const getMoveMoneyValidationError = (candidateForm) => {
    const amount = parseMoneyInput(candidateForm.amount);
    const toReadyToAssign = isReadyToAssignDestination(candidateForm.toCategoryId);
    if (!Number.isFinite(amount) || amount <= 0) return 'Amount must be greater than 0.';
    if (!candidateForm.fromCategoryId || !candidateForm.toCategoryId) {
      return 'Select both source and destination categories.';
    }
    if (sameCategoryId(candidateForm.fromCategoryId, candidateForm.toCategoryId)) {
      return 'Source and destination categories must be different.';
    }
    const fromCategory = getCategoryById(candidateForm.fromCategoryId);
    const toCategory = toReadyToAssign ? null : getCategoryById(candidateForm.toCategoryId);
    if (!fromCategory || (!toReadyToAssign && !toCategory)) return 'Selected categories are unavailable.';
    if (isCategoryArchived(fromCategory) || (toCategory && isCategoryArchived(toCategory))) {
      return 'Archived categories cannot be used for Move Money.';
    }
    if ((Number(fromCategory.available) || 0) < amount) {
      return 'Insufficient funds available in selected category.';
    }
    const fromReadyToAssign = String(candidateForm.fromCategoryId || '') === READY_TO_ASSIGN_ID;
    if (fromReadyToAssign && amount > getGlobalReadyToAssign() + 0.005) {
      return 'Insufficient Ready to Assign funds.';
    }
    return '';
  };

  const isReadyToAssignDestination = (toCategoryId) =>
    String(toCategoryId || '') === READY_TO_ASSIGN_ID;

  const getSuggestedMoveMoneySources = (toCategoryId) => {
    const toCategory = getCategoryById(toCategoryId);
    const toGroupId = normalizeGroupId(toCategory?.groupId ?? toCategory?.group_id);
    const scored = activeCategories
      .filter((cat) => (Number(cat.available) || 0) > 0 && !sameCategoryId(cat.id, toCategoryId))
      .map((cat) => {
        const available = Number(cat.available) || 0;
        const sameGroup =
          toGroupId && normalizeGroupId(cat.groupId ?? cat.group_id) === toGroupId ? 1 : 0;
        const recentBoost = moveMoneyRecentlyUsedSourceIds.includes(String(cat.id)) ? 1 : 0;
        const rankScore = available * 1000 + sameGroup * 100 + recentBoost * 10;
        return { cat, rankScore };
      })
      .sort((a, b) => b.rankScore - a.rankScore);
    return scored.slice(0, 5).map((entry) => entry.cat);
  };

  const openMoveMoneyModal = ({
    fromCategoryId = '',
    toCategoryId = '',
    amount = '',
    source = 'manual',
  } = {}) => {
    const suggestedAmount =
      amount ||
      (toCategoryId
        ? Math.abs(Math.min(0, Number(getCategoryById(toCategoryId)?.available) || 0))
        : '');
    const suggestions = getSuggestedMoveMoneySources(toCategoryId);
    const effectiveFromCategoryId = fromCategoryId || suggestions[0]?.id || '';
    setMoveMoneyData({
      amount: suggestedAmount ? formatMoneyInput(suggestedAmount) : '',
      fromCategoryId: effectiveFromCategoryId,
      toCategoryId,
      source,
    });
    setMoveMoneySearchQuery('');
    setMoveMoneyError('');
    setShowMoveMoneyModal(true);
  };

  const persistMoveMoneyToDatabase = async (fromCategoryId, toCategoryId, amount, monthKey) => {
    const toReadyToAssign = isReadyToAssignDestination(toCategoryId);
    const fromReadyToAssign = String(fromCategoryId || '') === READY_TO_ASSIGN_ID;
    if (window.electronAPI?.bulkAssignMonthBudget) {
      const deltas = [];
      if (!fromReadyToAssign) {
        deltas.push({ categoryId: fromCategoryId, delta: -amount });
      }
      if (!toReadyToAssign) {
        deltas.push({ categoryId: toCategoryId, delta: amount });
      }
      const bulkResult = await window.electronAPI.bulkAssignMonthBudget(
        userId,
        monthKey,
        deltas,
        {
          mode: 'delta',
          totalCash: totalCashInAccounts,
          auditSource: 'move_money',
        },
      );
      if (!bulkResult?.success) {
        throw new Error(bulkResult?.error || 'Move Money failed');
      }
      return;
    }
    if (!fromReadyToAssign) {
      const fromCategory = getCategoryById(fromCategoryId);
      const r1 = await window.electronAPI.updateCategory(fromCategoryId, {
        assigned: roundMoney((Number(fromCategory?.assigned) || 0) - amount),
        budget_month: monthKey,
      });
      if (!r1?.success) throw new Error(r1?.error || 'Failed to update source category');
    }
    if (!toReadyToAssign) {
      const toCategory = getCategoryById(toCategoryId);
      const r2 = await window.electronAPI.updateCategory(toCategoryId, {
        assigned: roundMoney((Number(toCategory?.assigned) || 0) + amount),
        budget_month: monthKey,
      });
      if (!r2?.success) throw new Error(r2?.error || 'Failed to update destination category');
    }
  };

  const applyMoveLocally = (rows, fromCategoryId, toCategoryId, amount) =>
    withDerivedAvailable(
      (rows || []).map((cat) => {
        if (String(fromCategoryId || '') !== READY_TO_ASSIGN_ID && sameCategoryId(cat.id, fromCategoryId)) {
          return {
            ...cat,
            assigned: roundMoney((Number(cat.assigned) || 0) - amount),
          };
        }
        if (!isReadyToAssignDestination(toCategoryId) && sameCategoryId(cat.id, toCategoryId)) {
          return {
            ...cat,
            assigned: roundMoney((Number(cat.assigned) || 0) + amount),
          };
        }
        return cat;
      }),
    );

  const runMoveMoney = async ({
    fromCategoryId,
    toCategoryId,
    amount,
    source = 'manual',
    recordEvent = true,
    closeModal = true,
  }) => {
    const monthKey = formatBudgetMonthKey(selectedMonthRef.current || selectedMonth);
    const previousRows = cloneCategoryRows(budgetData.categories || []);
    const nextRows = applyMoveLocally(previousRows, fromCategoryId, toCategoryId, amount);

    setBudgetData((prev) => ({ ...prev, categories: nextRows }));
    setCategories(nextRows);
    commitBudgetSnapshot(nextRows, categoryGroups, userId, monthKey);
    calculateReadyToAssign(nextRows);

    try {
      await persistMoveMoneyToDatabase(fromCategoryId, toCategoryId, amount, monthKey);
      const fromCategory = getCategoryById(fromCategoryId);
      const toCategory = getCategoryById(toCategoryId);
      const fromReadyToAssign = String(fromCategoryId || '') === READY_TO_ASSIGN_ID;
      const toReadyToAssign = isReadyToAssignDestination(toCategoryId);
      if (recordEvent) {
        const moveEvent = {
          id: `${Date.now()}-${fromCategoryId}-${toCategoryId}`,
          userId,
          timestamp: new Date().toISOString(),
          monthKey,
          amount,
          source,
          fromCategoryId,
          toCategoryId,
          fromCategoryName: fromReadyToAssign ? READY_TO_ASSIGN_LABEL : fromCategory?.name || 'Unknown',
          toCategoryName: toReadyToAssign ? READY_TO_ASSIGN_LABEL : toCategory?.name || 'Unknown',
        };
        setMoveMoneyActivity((prev) => [moveEvent, ...prev].slice(0, 250));
        setPendingUndoMove(moveEvent);
        if (!fromReadyToAssign) {
          setMoveMoneyRecentlyUsedSourceIds((prev) => [
            String(fromCategoryId),
            ...prev.filter((id) => id !== String(fromCategoryId)),
          ].slice(0, 10));
        }
      }
      if (closeModal) {
        setShowMoveMoneyModal(false);
        setMoveMoneyData(EMPTY_MOVE_MONEY_FORM);
      }
      setMoveMoneyError('');
      return true;
    } catch (error) {
      console.error('Move Money failed, rolling back:', error);
      setBudgetData((prev) => ({ ...prev, categories: previousRows }));
      setCategories(previousRows);
      commitBudgetSnapshot(previousRows, categoryGroups, userId, monthKey);
      calculateReadyToAssign(previousRows);
      setMoveMoneyError(error.message || 'Move Money failed');
      return false;
    }
  };

  const handleMoveMoneySubmit = async () => {
    const validationError = getMoveMoneyValidationError(moveMoneyData);
    if (validationError) {
      setMoveMoneyError(validationError);
      return;
    }
    const amount = parseMoneyInput(moveMoneyData.amount);
    await runMoveMoney({
      fromCategoryId: moveMoneyData.fromCategoryId,
      toCategoryId: moveMoneyData.toCategoryId,
      amount,
      source: moveMoneyData.source || 'manual',
      recordEvent: true,
      closeModal: true,
    });
  };

  const handleUndoMoveMoney = async () => {
    if (!pendingUndoMove) return;
    const undoFromCategoryId = isReadyToAssignDestination(pendingUndoMove.toCategoryId)
      ? READY_TO_ASSIGN_ID
      : pendingUndoMove.toCategoryId;
    const reverted = await runMoveMoney({
      fromCategoryId: undoFromCategoryId,
      toCategoryId: pendingUndoMove.fromCategoryId,
      amount: pendingUndoMove.amount,
      source: 'undo',
      recordEvent: false,
      closeModal: false,
    });
    if (reverted) {
      setMoveMoneyActivity((prev) => prev.filter((entry) => entry.id !== pendingUndoMove.id));
      setPendingUndoMove(null);
    }
  };
  
  const handleSetGoal = (category) => {
    setSelectedCategoryForTarget(category);
    setShowTargetModal(true);
  };

  const handleSaveGoal = async (goalData) => {
    if (!selectedCategoryForTarget) return;

    const categoryId = selectedCategoryForTarget.id;
    const goalFields = {
      target_amount: goalData.target_amount,
      target_type: goalData.target_type,
      target_frequency: goalData.target_frequency || 'monthly',
      target_date: goalData.target_date
    };

    try {
      const result = await window.electronAPI.updateCategory(categoryId, goalFields);

      if (result.success) {
        registerGoalPatch(categoryId, goalFields);

        const nextCategories = budgetData.categories.map((cat) => {
          if (!sameCategoryId(cat.id, categoryId)) return cat;
          const fromServer = result.data
            ? mapDbCategoryToBudgetRow(result.data)
            : null;
          return fromServer ? { ...cat, ...fromServer } : { ...cat, ...goalFields };
        });

        const monthKey = formatBudgetMonthKey(selectedMonthRef.current || selectedMonth);
        commitBudgetSnapshot(nextCategories, categoryGroups, userId, monthKey);

        setShowTargetModal(false);
        setSelectedCategoryForTarget(null);
        alert('✅ Goal saved successfully!');
      } else {
        alert('❌ Failed to save goal: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error saving goal:', error);
      alert('Error saving goal: ' + error.message);
    }
  };
  
  const handleAutoAssign = async (allocations) => {
    if (!Array.isArray(allocations) || allocations.length === 0) {
      alert('No allocations to apply');
      return;
    }

    const monthKey = formatBudgetMonthKey(selectedMonthRef.current || selectedMonth);
    const bulkAssignments = allocations
      .filter((a) => a?.categoryId != null && Number(a.amount) > 0)
      .map((a) => ({ categoryId: a.categoryId, delta: Number(a.amount) }));

    if (!bulkAssignments.length) {
      alert('No valid allocations to apply');
      return;
    }

    setBudgetData((prev) => ({
      ...prev,
      categories: withDerivedAvailable(
        prev.categories.map((cat) => {
          const allocation = bulkAssignments.find((a) => sameCategoryId(a.categoryId, cat.id));
          if (!allocation) return cat;
          return {
            ...cat,
            assigned: roundMoney((Number(cat.assigned) || 0) + allocation.delta),
          };
        }),
      ),
    }));

    try {
      if (window.electronAPI?.bulkAssignMonthBudget) {
        const bulkRes = await window.electronAPI.bulkAssignMonthBudget(
          userId,
          monthKey,
          bulkAssignments,
          { mode: 'delta', totalCash: totalCashInAccounts, auditSource: 'auto_assign' },
        );
        if (!bulkRes?.success) {
          throw new Error(bulkRes?.error || 'Auto assign failed');
        }
      } else {
        for (const { categoryId, delta } of bulkAssignments) {
          const categoryRow = budgetData.categories.find((c) => sameCategoryId(c.id, categoryId));
          const newAssigned = roundMoney((Number(categoryRow?.assigned) || 0) + delta);
          const res = await window.electronAPI.updateCategory(categoryId, {
            assigned: newAssigned,
            budget_month: monthKey,
          });
          if (!res?.success) {
            throw new Error(res?.error || `Failed to assign category ${categoryId}`);
          }
        }
      }

      const reloadedCategories = await loadCategoriesFromDB(0, {
        monthDate: selectedMonthRef.current || selectedMonth,
      });
      calculateReadyToAssign(
        reloadedCategories || lastGoodSnapshotRef.current.categories || budgetData.categories,
      );
      alert('✅ Auto-assign completed successfully!');
    } catch (err) {
      console.error('Auto assign error:', err);
      await loadCategoriesFromDB(0, { monthDate: selectedMonthRef.current || selectedMonth });
      calculateReadyToAssign();
      alert(`❌ Error while saving auto-assign: ${err.message}`);
    }
  };

  // ==================== UI HELPER FUNCTIONS ====================
  const visibleCategories = (budgetData.categories || []).filter((c) => c && !isCategoryArchived(c));

  const sumCategoryMoneyColumns = (categories) =>
    categories.reduce(
      (totals, cat) => ({
        assigned: roundMoney(totals.assigned + toMoneyNumber(cat.assigned)),
        activity: roundMoney(totals.activity + toMoneyNumber(cat.activity)),
        available: roundMoney(totals.available + toMoneyNumber(cat.available)),
        underfunded: roundMoney(
          totals.underfunded + (calculateTargetProgress(cat).needed || 0),
        ),
      }),
      { assigned: 0, activity: 0, available: 0, underfunded: 0 },
    );

  const sumDisplayedGroupTotals = (entries) =>
    entries.reduce(
      (totals, entry) => ({
        assigned: roundMoney(totals.assigned + entry.totals.assigned),
        activity: roundMoney(totals.activity + entry.totals.activity),
        available: roundMoney(totals.available + entry.totals.available),
      }),
      { assigned: 0, activity: 0, available: 0 },
    );

  const groupedCategorySummaries = categoryGroups.map((group) => {
    const gid = normalizeGroupId(group.id);
    const groupCategories = visibleCategories.filter((c) => {
      const catGid = c.groupId ?? c.group_id;
      return normalizeGroupId(catGid) === gid;
    });
    return {
      group,
      categories: groupCategories,
      totals: sumCategoryMoneyColumns(groupCategories),
    };
  });

  const categorizedIds = new Set();
  groupedCategorySummaries.forEach(({ categories }) => {
    categories.forEach((cat) => categorizedIds.add(cat.id));
  });
  const uncategorizedCategories = visibleCategories.filter((cat) => !categorizedIds.has(cat.id));
  if (uncategorizedCategories.length > 0) {
    groupedCategorySummaries.push({
      group: { id: 'uncategorized', name: 'Uncategorized' },
      categories: uncategorizedCategories,
      totals: sumCategoryMoneyColumns(uncategorizedCategories),
    });
  }

  // Grand total = sum of every "{Group} Total" row (groups with at least one category).
  const groupsWithCategoryTotals = groupedCategorySummaries.filter(
    (entry) => entry.categories.length > 0,
  );
  const tableTotals = sumDisplayedGroupTotals(groupsWithCategoryTotals);
  const overspentCategories = activeCategories.filter((cat) => (Number(cat.available) || 0) < 0);

  // ==================== EFFECTS FOR PROGRESS & CALCULATIONS ====================
  useEffect(() => {
    if (!initialLoadComplete) return;
    if (rtaRefreshTimerRef.current) {
      clearTimeout(rtaRefreshTimerRef.current);
    }
    rtaRefreshTimerRef.current = setTimeout(() => {
      calculateReadyToAssign();
    }, 400);
    return () => {
      if (rtaRefreshTimerRef.current) {
        clearTimeout(rtaRefreshTimerRef.current);
      }
    };
  }, [budgetData.categories, totalCashInAccounts, selectedMonth, initialLoadComplete]);

  const skipSelectedMonthReloadRef = useRef(true);
  useEffect(() => {
    if (!userId || !window.electronAPI?.getBudgetMonthSnapshot) return;
    if (skipSelectedMonthReloadRef.current) {
      skipSelectedMonthReloadRef.current = false;
      return;
    }
    setIsQuickAssigning(false);
    setIsMonthBudgetLoading(true);
    void loadCategoriesFromDB(0, {
      monthDate: selectedMonthRef.current || selectedMonth,
      forceMonthReplace: true,
      suppressLoading: true,
    }).finally(() => {
      setIsMonthBudgetLoading(false);
    });
  }, [selectedMonth, userId]);

  useEffect(() => {
    updateAllProgress();
  }, [budgetData.categories.map(cat => cat.available + cat.assigned + (cat.activity || 0)).join(',')]);

  // Persist last good table snapshot when leaving Prosperity Map (sidebar navigation unmounts this view).
  useEffect(() => {
    return () => {
      const snap = lastGoodSnapshotRef.current;
      if (snap?.categories?.length) {
        saveSnapshotToSession(snap);
      }
    };
  }, []);

  // ==================== INITIALIZATION & REALTIME ====================
  useEffect(() => {
    const initializeData = async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));

      if (!(await ensureElectronAPI())) {
        console.error('❌ Electron preload API did not become available in time.');
        setLoading(false);
        setInitialLoadComplete(true);
        return;
      }

      try {
        setLoading(true);
        setInitialLoadComplete(false);

        const userResult = await window.electronAPI.getCurrentUser();
        let ownerId = resolveBudgetUserId();
        if (userResult?.success && userResult?.data?.id != null) {
          ownerId = userResult.data.id;
          userIdRef.current = ownerId;
          if (String(ownerId) !== String(userId)) {
            setUserId(ownerId);
          }
        }
        if (!ownerId) return;

        const monthKey = formatBudgetMonthKey(selectedMonthRef.current || selectedMonth);
        hydrateSnapshotFromSession(ownerId, monthKey);

        await loadCategoryGroups({ userId: ownerId });
        await loadCategoriesFromDB(0, {
          userId: ownerId,
          monthDate: selectedMonthRef.current || selectedMonth,
        });
        await loadArchivedCategories();

        if (userResult?.success && userResult?.data) {
          const accountsResult = await window.electronAPI.getAccountsSummary(ownerId);
          if (accountsResult?.success) {
            setTotalCashInAccounts(sumTotalBudgetCash(accountsResult.data));
          }
        }
        await refreshGlobalBudgetSummary();
      } catch (error) {
        console.error('❌ Error during initialization:', error);
        restoreFromLastGoodSnapshotIfNeeded();
      } finally {
        setLoading(false);
        setInitialLoadComplete(true);
      }
    };

    initializeData();
  }, [userId]);

  // Do not reload on window focus / visibility — opening DevTools triggers those events
  // and can race IPC loads that briefly return empty, wiping the Prosperity Map table.

  const budgetRefreshEvents = [
    'prosperity:updated',
    'budget:assigned',
    'budget:bulkAssigned',
    'budget:unassigned',
    'budget:repaired',
    'budget:consolidated',
    'category:updated',
    'category:created',
    'transaction:added',
    'transaction:updated',
    'transaction:deleted',
  ];

  const { lastUpdate } = useRealtimeUpdates(budgetRefreshEvents, () => {
    void (async () => {
      if (editingCategoryRef.current != null) {
        return;
      }
      try {
        const monthKey = formatBudgetMonthKey(selectedMonthRef.current || selectedMonth);

        await loadCategoryGroups();
        const reloaded = await loadCategoriesFromDB(0, {
          monthDate: monthKeyToLocalDate(monthKey),
        });
        await loadArchivedCategories();
        const userResult = await window.electronAPI.getCurrentUser();
        if (userResult?.success && userResult?.data) {
          const accountsResult = await window.electronAPI.getAccountsSummary(userResult.data.id);
          if (accountsResult?.success && accountsResult.data) {
            setTotalCashInAccounts(sumTotalBudgetCash(accountsResult.data));
          }
        }
        await refreshGlobalBudgetSummary();
        calculateReadyToAssign(
          reloaded || lastGoodSnapshotRef.current.categories,
        );
      } catch (e) {
        console.warn('prosperity:updated refresh:', e);
      }
    })();
  });

  useEffect(() => {
    const handleRefresh = () => {
      if (editingCategoryRef.current != null) return;
      void (async () => {
        try {
          await loadCategoryGroups();
          const reloaded = await loadCategoriesFromDB();
          await loadArchivedCategories();
          const userResult = await window.electronAPI.getCurrentUser();
          if (userResult?.success && userResult?.data) {
            const accountsResult = await window.electronAPI.getAccountsSummary(userResult.data.id);
            if (accountsResult?.success && accountsResult.data) {
              setTotalCashInAccounts(sumTotalBudgetCash(accountsResult.data));
            }
          }
          calculateReadyToAssign(
            reloaded || lastGoodSnapshotRef.current.categories,
          );
        } catch (e) {
          console.warn('refresh-prosperity-map:', e);
        }
      })();
    };
    window.addEventListener('refresh-prosperity-map', handleRefresh);
    return () => {
      window.removeEventListener('refresh-prosperity-map', handleRefresh);
    };
  }, []);

  useEffect(() => {
    window.onAddIncomeClick = () => setShowAddIncomeModal(true);
    window.onRecordPaymentClick = () => setShowRecordPaymentModal(true);
    const openMoveMoneyFromPlanner = (event) => {
      const amount = Number(event?.detail?.amount) > 0 ? Number(event.detail.amount) : '';
      openMoveMoneyModal({
        amount,
        source: 'planner',
      });
    };
    window.addEventListener('open-move-money', openMoveMoneyFromPlanner);
    return () => {
      window.onAddIncomeClick = null;
      window.onRecordPaymentClick = null;
      window.removeEventListener('open-move-money', openMoveMoneyFromPlanner);
    };
  }, [budgetData.categories, moveMoneyRecentlyUsedSourceIds]);

  useEffect(() => {
    if (!userId) return;
    try {
      const raw = localStorage.getItem(`intentflow.moveMoneyActivity.${userId}`);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setMoveMoneyActivity(parsed);
      }
    } catch (_) {
      // ignore malformed cache
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    try {
      localStorage.setItem(
        `intentflow.moveMoneyActivity.${userId}`,
        JSON.stringify(moveMoneyActivity.slice(0, 250)),
      );
    } catch (_) {
      // localStorage may be unavailable
    }
  }, [moveMoneyActivity, userId]);

  useEffect(() => {
    const handleFocusBudgetCategory = (event) => {
      const { categoryId, groupId, groupName } = event?.detail || {};
      if (groupId != null) {
        setCollapsedGroups((prev) => ({ ...prev, [groupId]: false }));
      } else if (groupName) {
        const match = categoryGroups.find(
          (g) => String(g.name || '').toLowerCase() === String(groupName).toLowerCase(),
        );
        if (match?.id != null) {
          setCollapsedGroups((prev) => ({ ...prev, [match.id]: false }));
        }
      }
      if (categoryId != null) {
        const id = String(categoryId);
        setFocusCategoryId(id);
        window.setTimeout(() => {
          const row = document.querySelector(`[data-category-id="${id}"]`);
          row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 150);
        window.setTimeout(() => setFocusCategoryId(null), 5000);
      }
    };
    window.addEventListener('focus-budget-category', handleFocusBudgetCategory);
    return () => window.removeEventListener('focus-budget-category', handleFocusBudgetCategory);
  }, [categoryGroups]);

  useEffect(() => {
    const syncViewport = () => {
      if (typeof window === 'undefined') return;
      setIsMobileViewport(window.innerWidth < 768);
    };
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  // ==================== RENDER ====================
  return (
    <div
      className="grid min-h-full gap-6 grid-cols-1 bg-[#0047AB] xl:grid-cols-[minmax(0,1fr)_minmax(280px,24rem)] max-w-full items-start p-1 sm:p-2"
      data-testid="pm-property-map-root"
      data-pm-loading={loading ? 'true' : 'false'}
      aria-busy={loading}
    >
      <div className="space-y-6 min-w-0 overflow-hidden xl:min-w-0">
        {pendingUndoMove && (
          <div className="rounded-2xl border border-emerald-300/35 bg-emerald-900/35 px-4 py-3 text-sm text-emerald-100">
            Money moved successfully.{' '}
            <button
              type="button"
              className="font-semibold underline underline-offset-2"
              onClick={handleUndoMoveMoney}
            >
              Undo
            </button>
          </div>
        )}
        <section className="rounded-[2rem] border border-white/25 bg-[#0047AB] p-6 shadow-2xl shadow-[#0047AB]/35 min-w-0 overflow-hidden">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-[#F0F9FF]/65">ProsperityMap</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#F0F9FF]">Budget allocation</h1>
              <p className="mt-2 text-sm text-[#F0F9FF]/75">{selectedMonth.toLocaleString('default', { month: 'long', year: 'numeric' })} budget snapshot</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="pmSecondary" onClick={() => { loadArchivedCategories(); setShowArchivedModal(true); }}>
                Archived ({archivedCategories.length})
              </Button>
              <Button
                type="button"
                data-testid="pm-add-group-button"
                variant="pmSecondary"
                onClick={() => setShowAddGroupModal(true)}
              >
                + Add Group
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[1.45fr_0.85fr] overflow-hidden">
            <div className="rounded-[1.75rem] border border-white/25 bg-[#0047AB]/95 p-6 overflow-hidden">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-[#0047AB] to-[#001a40] text-2xl text-[#F0F9FF] shadow-lg shadow-[#0047AB]/30">
                  💰
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#F0F9FF]/65">Ready to Assign</p>
                  <p className={`mt-3 text-4xl font-semibold ${budgetSummary.unassigned < 0 ? 'text-rose-400' : 'text-[#F0F9FF]'}`}>
                    {budgetSummary.unassigned < 0 && <span className="mr-2" aria-hidden>⚠️</span>}
                    {formatCurrency(budgetSummary.unassigned)}
                  </p>
                  <p className={`mt-2 text-sm ${budgetSummary.unassigned < 0 ? 'text-rose-300' : 'text-[#F0F9FF]/75'}`}>
                    {budgetSummary.unassigned < 0
                      ? 'You have assigned more money than is available.'
                      : budgetSummary.unassigned === 0
                        ? 'Every dollar has a job! 🎯'
                        : 'Shared across all months — same pool everywhere you budget.'}
                  </p>
                  {(budgetSummary.futureAssigned || 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowFutureReservedPanel((open) => !open)}
                      className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-300/35 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-400/20"
                    >
                      Reserved in Future: {formatCurrency(budgetSummary.futureAssigned)}
                      <span className="text-[#F0F9FF]/60">{showFutureReservedPanel ? '▼' : '▶'}</span>
                    </button>
                  )}
                </div>
              </div>
              {showFutureReservedPanel && (budgetSummary.futureBreakdown || []).length > 0 && (
                <div className="mt-5 rounded-2xl border border-white/20 bg-[#0047AB]/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#F0F9FF]/65">
                    Future allocations
                  </p>
                  <div className="mt-3 max-h-48 overflow-y-auto">
                    <table className="w-full text-left text-sm text-[#F0F9FF]/90">
                      <thead>
                        <tr className="text-xs uppercase tracking-wide text-[#F0F9FF]/55">
                          <th className="pb-2 pr-3 font-medium">Month</th>
                          <th className="pb-2 pr-3 font-medium">Category</th>
                          <th className="pb-2 text-right font-medium">Assigned</th>
                        </tr>
                      </thead>
                      <tbody>
                        {budgetSummary.futureBreakdown.map((row, idx) => (
                          <tr key={`${row.monthKey}-${row.categoryId}-${idx}`} className="border-t border-white/10">
                            <td className="py-2 pr-3">{formatMonthKeyLabel(row.monthKey)}</td>
                            <td className="py-2 pr-3">{row.categoryName}</td>
                            <td className="py-2 text-right font-medium">{formatCurrency(row.assignedAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-3 border-t border-white/15 pt-3 text-sm font-semibold text-[#F0F9FF]">
                    Total Future Reserved: {formatCurrency(budgetSummary.futureAssigned)}
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-[1.75rem] border border-white/25 bg-[#0047AB]/95 p-6 overflow-hidden">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#F0F9FF]/95">Quick actions</p>
                  <p className="mt-2 text-sm text-[#F0F9FF]/75">Allocate funds faster with recommended workflows.</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3">
                <Button
                  variant="pmSecondary"
                  disabled={isQuickAssigning || isMonthBudgetLoading}
                  onClick={() => void handleQuickAssign('smart')}
                >
                  {isQuickAssigning ? 'Assigning…' : isMonthBudgetLoading ? 'Loading month…' : '🧠 Smart Assign'}
                </Button>
                <Button
                  variant="pmSecondary"
                  disabled={isQuickAssigning || isMonthBudgetLoading}
                  onClick={() => void handleQuickAssign('underfunded')}
                >
                  {getFundUnderfundedButtonLabel()}
                </Button>
                <Button
                  variant="pmSecondary"
                  disabled={isQuickAssigning || isMonthBudgetLoading}
                  onClick={() => void handleQuickAssign('last-month')}
                >
                  {isQuickAssigning ? 'Assigning…' : isMonthBudgetLoading ? 'Loading month…' : '📅 Last Month'}
                </Button>
                <Button
                  variant="pmSecondary"
                  disabled={isQuickAssigning || isMonthBudgetLoading}
                  onClick={() => void handleQuickAssign('average')}
                >
                  {isQuickAssigning ? 'Assigning…' : isMonthBudgetLoading ? 'Loading month…' : '📊 Average Spending'}
                </Button>
                <Button
                  variant="pmSecondary"
                  disabled={isUnassigningMonth || getMonthAssignedTotal() <= 0}
                  onClick={() => void handleUnassignMonth()}
                >
                  {isUnassigningMonth
                    ? 'Unassigning…'
                    : `↩ Unassign Month (${formatCurrency(getMonthAssignedTotal())})`}
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="inline-flex flex-wrap items-center gap-3 rounded-3xl border border-white/25 bg-[#0047AB] px-4 py-3 text-sm text-[#F0F9FF]/90">
              <button
                type="button"
                onClick={() => {
                  const newDate = new Date(selectedMonth);
                  newDate.setMonth(selectedMonth.getMonth() - 1);
                  setSelectedMonth(newDate);
                }}
                className="rounded-full border border-white/25 bg-[#0047AB] px-3 py-2 text-[#F0F9FF]/95 transition hover:brightness-110"
              >◀</button>
              <span className="font-medium text-[#F0F9FF]">{selectedMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
              <button
                type="button"
                onClick={() => {
                  const newDate = new Date(selectedMonth);
                  newDate.setMonth(selectedMonth.getMonth() + 1);
                  setSelectedMonth(newDate);
                }}
                className="rounded-full border border-white/25 bg-[#0047AB] px-3 py-2 text-[#F0F9FF]/95 transition hover:brightness-110"
              >▶</button>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button variant="pmSecondary" onClick={async () => { await loadCategoriesFromDB(); await loadCategoryGroups(); }}>
                🔄 Refresh categories
              </Button>
              <Button variant="pmSecondary" onClick={async () => {
                const userResult = await window.electronAPI.getCurrentUser();
                const accountsResult = await window.electronAPI.getAccountsSummary(userResult.data.id);
                const totalCash = sumTotalBudgetCash(accountsResult.data);
                const categories = await window.electronAPI.getCategories(2);
                const totalAssigned = categories.data.reduce((sum, cat) => sum + (cat.assigned || 0), 0);
                alert(`Total Cash: $${totalCash}
Total Assigned: $${totalAssigned}
Ready to Assign: $${totalCash - totalAssigned}`);
              }}>
                🔍 Quick totals
              </Button>
            </div>
          </div>

          {overspentCategories.length > 0 && (
            <div className="mt-6 rounded-2xl border border-rose-300/35 bg-rose-900/30 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-rose-100">
                  {overspentCategories.length} categories are overspent. Cover overspending to restore budget balance.
                </div>
                <Button
                  variant="pmDanger"
                  onClick={() =>
                    openMoveMoneyModal({
                      toCategoryId: overspentCategories[0]?.id,
                      source:
                        overspentCategories[0]?.overspending_type === 'credit'
                          ? 'overspending-banner-credit'
                          : 'overspending-banner-cash',
                    })
                  }
                >
                  {overspentCategories[0]?.overspending_type === 'credit'
                    ? 'Cover Credit Overspending'
                    : 'Cover Overspending'}
                </Button>
              </div>
            </div>
          )}

          <div className="mt-6 overflow-hidden rounded-[1.75rem] border border-white/25 bg-[#0047AB]">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/25 text-left text-sm text-[#F0F9FF]/95">
                <colgroup>
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '16%' }} />
                </colgroup>
                <thead className="bg-[#0047AB]/95">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-[#F0F9FF]/75">Category</th>
                    <th className="px-4 py-3 font-semibold text-[#F0F9FF]/75">Assigned</th>
                    <th className="px-4 py-3 font-semibold text-[#F0F9FF]/75">Activity</th>
                    <th className="px-4 py-3 font-semibold text-[#F0F9FF]/75">Available</th>
                    <th className="px-4 py-3 font-semibold text-[#F0F9FF]/75">Progress</th>
                    <th className="px-4 py-3 font-semibold text-[#F0F9FF]/75">Goal Target</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedCategorySummaries.map(({ group, categories: groupCategories, totals }, groupIndex) => {
                    const uniqueGroupKey = `group-${group.id}-${groupIndex}`;
                    const isUncategorizedGroup = normalizeGroupId(group.id) === 'uncategorized';

                    return (
                      <React.Fragment key={uniqueGroupKey}>
                        <tr
                          data-testid="pm-category-group-row"
                          style={{ backgroundColor: PM.categoryGroupRowBg }}
                        >
                          <td colSpan="6" className="px-4 py-4" style={{ color: PM.categoryGroupRowText }}>
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => toggleGroupCollapse(group.id)}
                                  className="shrink-0 rounded-full border px-3 py-2 transition hover:brightness-95"
                                  style={{
                                    borderColor: PM.categoryGroupRowBorder,
                                    backgroundColor: PM.categoryGroupRowBg,
                                    color: PM.categoryGroupRowText,
                                  }}
                                >
                                  {isGroupCollapsed(group.id) ? '▶' : '▼'}
                                </button>
                                <span className="min-w-0 text-base font-semibold" style={{ color: PM.categoryGroupRowText }}>
                                  {group.name}
                                </span>
                                <span
                                  className="shrink-0 rounded-full px-3 py-1 text-xs uppercase tracking-[0.2em]"
                                  style={{
                                    backgroundColor: 'rgba(12, 35, 64, 0.08)',
                                    color: PM.categoryGroupRowTextMuted,
                                  }}
                                >
                                  {groupCategories.length} categories
                                </span>
                              </div>
                              <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                                {!isUncategorizedGroup && (
                                  <>
                                    <Button variant="pmSecondary" onClick={() => handleAddCategory(group)}>+ Category</Button>
                                    <Button variant="pmSecondary" onClick={() => handleEditGroup(group)}>Edit</Button>
                                    <Button variant="pmDanger" onClick={() => handleDeleteGroup(group.id)}>Delete</Button>
                                  </>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>

                        {!isGroupCollapsed(group.id) &&
                          (groupCategories.length > 0 ? (
                              groupCategories.map((cat, catIndex) => {
                                const targetInfo = getTargetInfo(cat);
                                const hasTarget = targetInfo.status !== 'no-target';
                                const isEditing = sameCategoryId(editingCategory, cat.id);
                                const categoryKey = `cat-${cat.id}-${groupIndex}-${catIndex}`;

                                if (isEditing) {
                                  return (
                                    <CategoryBudgetEditRow
                                      key={`${categoryKey}-edit-${cat.id}`}
                                      category={cat}
                                      formatCurrency={formatCurrency}
                                      getTargetInfo={getTargetInfo}
                                      buildPreviewCategory={buildEditPreviewCategory}
                                      getProgressColor={getProgressColor}
                                      onSave={handleSaveCategoryEdit}
                                      onCancel={handleCancelEdit}
                                      onArchive={handleArchiveCategory}
                                      onDelete={handleDeleteCategory}
                                    />
                                  );
                                }

                                return (
                                  <tr
                                    key={categoryKey}
                                    data-category-id={cat.id}
                                    className={`border-t border-white/25 ${
                                      focusCategoryId && String(focusCategoryId) === String(cat.id)
                                        ? 'ring-2 ring-inset ring-amber-300/80 bg-amber-400/10'
                                        : ''
                                    }`}
                                    onContextMenu={(e) => {
                                      e.preventDefault();
                                      openMoveMoneyModal({
                                        toCategoryId: cat.id,
                                        source: 'row-context',
                                      });
                                    }}
                                  >
                                    <td className="px-4 py-4 align-top">
                                      <div className="flex max-w-md flex-col gap-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="text-sm font-semibold text-[#F0F9FF]">{cat.name}</span>
                                          {hasTarget && (
                                            <span
                                              className="rounded-full bg-[#0047AB] px-2 py-1 text-xs text-[#F0F9FF]/75"
                                              title={getGoalTooltip(cat)}
                                            >
                                              {getGoalStatusLabel(targetInfo)}
                                            </span>
                                          )}
                                        </div>
                                        <details className="group/actions relative w-fit">
                                          <summary className="cursor-pointer list-none rounded-full border border-white/30 bg-[#0047AB] px-3 py-1.5 text-xs font-medium text-[#F0F9FF]/95 outline-none ring-white/30 hover:brightness-110 focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
                                            Actions <span className="text-[#F0F9FF]/75">▾</span>
                                          </summary>
                                          <div className="absolute left-0 z-30 mt-1 min-w-[11rem] rounded-xl border border-white/25 bg-[#0047AB] py-1 shadow-2xl ring-1 ring-white/35">
                                            <button
                                              type="button"
                                              className="block w-full px-3 py-2 text-left text-sm text-[#F0F9FF]/95 hover:bg-[#0047AB]"
                                              onClick={(e) => {
                                                const root = e.currentTarget.closest('details');
                                                if (root) root.open = false;
                                                handleEditCategory(cat);
                                              }}
                                            >
                                              Edit
                                            </button>
                                            <button
                                              type="button"
                                              className="block w-full px-3 py-2 text-left text-sm text-[#F0F9FF]/95 hover:bg-[#0047AB]"
                                              onClick={(e) => {
                                                const root = e.currentTarget.closest('details');
                                                if (root) root.open = false;
                                                handleSetGoal(cat);
                                              }}
                                            >
                                              Goal
                                            </button>
                                            <button
                                              type="button"
                                              className="block w-full px-3 py-2 text-left text-sm text-[#F0F9FF]/95 hover:bg-[#0047AB]"
                                              onClick={(e) => {
                                                const root = e.currentTarget.closest('details');
                                                if (root) root.open = false;
                                                openMoveMoneyModal({
                                                  toCategoryId: cat.id,
                                                  source: 'category-action-menu',
                                                });
                                              }}
                                            >
                                              Move Money
                                            </button>
                                            <button
                                              type="button"
                                              className="block w-full px-3 py-2 text-left text-sm text-[#F0F9FF]/95 hover:bg-[#0047AB]"
                                              onClick={(e) => {
                                                const root = e.currentTarget.closest('details');
                                                if (root) root.open = false;
                                                openMoveMoneyModal({
                                                  fromCategoryId: cat.id,
                                                  toCategoryId: READY_TO_ASSIGN_ID,
                                                  source: 'reduce-assignment',
                                                });
                                              }}
                                            >
                                              Move to Ready to Assign
                                            </button>
                                            <button
                                              type="button"
                                              className="block w-full px-3 py-2 text-left text-sm text-[#F0F9FF]/95 hover:bg-[#0047AB]"
                                              onClick={(e) => {
                                                const root = e.currentTarget.closest('details');
                                                if (root) root.open = false;
                                                handleArchiveCategory(cat);
                                              }}
                                            >
                                              Archive
                                            </button>
                                            <button
                                              type="button"
                                              className="block w-full px-3 py-2 text-left text-sm text-rose-300 hover:bg-[#0047AB]"
                                              onClick={(e) => {
                                                const root = e.currentTarget.closest('details');
                                                if (root) root.open = false;
                                                handleDeleteCategory(cat.id);
                                              }}
                                            >
                                              Delete
                                            </button>
                                          </div>
                                        </details>
                                      </div>
                                    </td>
                                    <td className="px-4 py-4 align-top whitespace-nowrap">{formatCurrency(cat.assigned || 0)}</td>
                                    <td className="px-4 py-4 align-top whitespace-nowrap">{formatCurrency(cat.activity || 0)}</td>
                                    <td className="px-4 py-4 align-top">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          openMoveMoneyModal({
                                            toCategoryId: cat.id,
                                            source: (cat.available || 0) < 0 ? 'negative-available-click' : 'available-click',
                                          })
                                        }
                                        className={`${(cat.available || 0) < 0 ? 'text-rose-400' : (cat.available || 0) === 0 ? 'text-amber-300' : 'text-emerald-400'} font-semibold underline decoration-dotted underline-offset-4 hover:brightness-110`}
                                      >
                                        {formatCurrency(cat.available || 0)}
                                      </button>
                                      {(cat.available || 0) < 0 && (
                                        <div className="mt-1 text-xs text-rose-300">
                                          {cat.overspending_type === 'credit' ? 'Credit overspending' : 'Overspent'}
                                        </div>
                                      )}
                                      {(cat.available || 0) < 0 && (
                                        <button
                                          type="button"
                                          className="mt-2 rounded-full border border-rose-300/40 px-2 py-1 text-xs text-rose-200 hover:bg-rose-300/10"
                                          onClick={() =>
                                            openMoveMoneyModal({
                                              toCategoryId: cat.id,
                                              source:
                                                cat.overspending_type === 'credit'
                                                  ? 'cover-credit-overspending'
                                                  : 'cover-cash-overspending',
                                            })
                                          }
                                        >
                                          {cat.overspending_type === 'credit'
                                            ? 'Cover Credit Overspending'
                                            : 'Cover Overspending'}
                                        </button>
                                      )}
                                      {(cat.available || 0) === 0 && <div className="mt-1 text-xs text-amber-300">Fully allocated</div>}
                                    </td>
                                    <td className="px-4 py-4 align-top">
                                      {hasTarget ? (
                                        <div className="space-y-2">
                                          <div className="relative h-3 overflow-hidden rounded-full bg-[#0047AB]/70">
                                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, targetInfo.progress || 0)}%`, backgroundColor: getProgressColor(targetInfo.status) }} />
                                          </div>
                                          <div className="text-xs text-[#F0F9FF]/75">
                                            {Math.min(100, Math.round(targetInfo.progress || 0))}% · {getGoalStatusLabel(targetInfo)}
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="text-[#F0F9FF]/65">—</div>
                                      )}
                                    </td>
                                    <td className="px-4 py-4 align-top">
                                      {cat.target_amount != null && cat.target_amount !== undefined ? (
                                        <div className="space-y-1">
                                          <div className="font-semibold text-[#F0F9FF]">{formatCurrency(cat.target_amount)}</div>
                                          <div className="text-xs text-[#F0F9FF]/75">
                                            Available: {formatCurrency(cat.available || 0)}
                                          </div>
                                          <div className="text-xs text-[#F0F9FF]/75">
                                            Funding Needed: {formatCurrency(targetInfo.needed || 0)}
                                          </div>
                                          <div className="text-xs text-[#F0F9FF]/75">
                                            {cat.target_type === 'by_date' && cat.target_date
                                              ? `${getCategoryGoalTypeLabel(cat.target_type)} · ${formatDateForInput(cat.target_date)}`
                                              : getCategoryGoalTypeLabel(cat.target_type)}
                                            {' · '}
                                            {getCategoryGoalFrequencyLabel(cat.target_frequency)}
                                          </div>
                                        </div>
                                      ) : (
                                        <Button variant="pmSecondary" onClick={() => handleSetGoal(cat)}>+ Set Goal</Button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr className="border-t border-white/25">
                                <td colSpan="6" className="px-4 py-6 text-center text-sm text-[#F0F9FF]/75">No categories found in this group.</td>
                              </tr>
                            ))}

                        {groupCategories.length > 0 && (
                          <tr className="border-t border-white/25 bg-[#0047AB]/95">
                            <td className="px-4 py-4 text-sm font-semibold text-[#F0F9FF]">{group.name} Total</td>
                            <td className="px-4 py-4 font-semibold text-[#F0F9FF]">{formatCurrency(totals.assigned)}</td>
                            <td className="px-4 py-4 font-semibold text-[#F0F9FF]">{formatCurrency(totals.activity)}</td>
                            <td className="px-4 py-4 font-semibold text-[#F0F9FF]">{formatCurrency(totals.available)}</td>
                            <td className="px-4 py-4 text-sm text-[#F0F9FF]/75">
                              {getGroupProgressLabel(groupCategories, totals)}
                            </td>
                            <td className="px-4 py-4 text-[#F0F9FF]/75">—</td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}

                  <tr className="border-t border-white/25 bg-[#0047AB]">
                    <td className="px-4 py-4 font-semibold text-[#F0F9FF]">Total</td>
                    <td className="px-4 py-4 font-semibold text-[#F0F9FF]">{formatCurrency(tableTotals.assigned)}</td>
                    <td className="px-4 py-4 font-semibold text-[#F0F9FF]">{formatCurrency(tableTotals.activity)}</td>
                    <td className="px-4 py-4 font-semibold text-[#F0F9FF]">{formatCurrency(tableTotals.available)}</td>
                    <td className="px-4 py-4 text-[#F0F9FF]/75">—</td>
                    <td className="px-4 py-4 text-[#F0F9FF]/75">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      <aside className="space-y-6 min-w-0 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:self-start xl:min-w-[18rem]">
        <div className="rounded-[2rem] border border-white/25 bg-[#0047AB] p-6 shadow-2xl shadow-[#0047AB]/35 min-w-0">
          <SummaryView
            totalAvailable={budgetSummary.totalAvailable}
            totalActivity={budgetSummary.totalActivity}
            totalAssigned={budgetSummary.totalAssigned}
            unassigned={budgetSummary.unassigned}
            totalCash={budgetSummary.totalCash}
            futureAssigned={budgetSummary.futureAssigned}
            futureBreakdown={budgetSummary.futureBreakdown}
            month={selectedMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
            categories={budgetData.categories || []}
            onAutoAssign={handleAutoAssign}
            underfundedTotal={getTotalUnderfunded()}
          />
          <div className="mt-3 text-sm text-rose-400">Underfunded: {formatCurrency(getTotalUnderfunded())}</div>
        </div>

        <div className="rounded-[2rem] border border-white/25 bg-[#0047AB] p-6 shadow-2xl shadow-[#0047AB]/35">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-[#F0F9FF]">Move Money</h3>
              <p className="mt-1 text-xs text-[#F0F9FF]/70">
                Reallocate budgeted funds between categories without creating transactions.
              </p>
            </div>
            <Button
              variant="pmSecondary"
              onClick={() => openMoveMoneyModal({ source: 'sidebar-card' })}
            >
              Move
            </Button>
          </div>
          {moveMoneyError && (
            <div className="mt-3 rounded-xl border border-rose-300/35 bg-rose-900/25 px-3 py-2 text-xs text-rose-100">
              {moveMoneyError}
            </div>
          )}
          <div className="mt-4 space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-[#F0F9FF]/60">Suggested Sources</p>
            {getSuggestedMoveMoneySources(moveMoneyData.toCategoryId || '').slice(0, 3).map((cat) => (
              <button
                key={`suggestion-${cat.id}`}
                type="button"
                className="flex w-full items-center justify-between rounded-xl border border-white/20 px-3 py-2 text-left text-sm text-[#F0F9FF] hover:bg-white/5"
                onClick={() =>
                  setMoveMoneyData((prev) => ({
                    ...prev,
                    fromCategoryId: cat.id,
                  }))
                }
              >
                <span>{cat.name}</span>
                <span className="text-[#F0F9FF]/70">{formatCurrency(cat.available || 0)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/25 bg-[#0047AB] p-6 shadow-2xl shadow-[#0047AB]/35">
          <h3 className="text-base font-semibold text-[#F0F9FF]">Move Money Activity</h3>
          <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
            {moveMoneyActivity.length === 0 && (
              <p className="text-sm text-[#F0F9FF]/65">No move activity yet.</p>
            )}
            {moveMoneyActivity.slice(0, 20).map((entry) => (
              <div key={entry.id} className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-[#F0F9FF]/90">
                <div className="font-semibold">
                  Moved {formatCurrency(entry.amount)} from {entry.fromCategoryName} to {entry.toCategoryName}
                </div>
                <div className="mt-1 text-[#F0F9FF]/65">
                  {new Date(entry.timestamp).toLocaleString()} · user {entry.userId}
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {showArchivedModal && (
        <div style={styles.modalOverlay} onClick={() => setShowArchivedModal(false)}>
          <div style={{ ...styles.modalContent, maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Archived Categories</h3>
            <p style={{ color: PM.textMuted, marginBottom: '1rem' }}>Archived categories are hidden from your budget but can be restored at any time.</p>
            {archivedCategories.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: PM.textMuted }}>No archived categories</div>
            ) : (
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {archivedCategories.map(cat => (
                  <div key={cat.id} style={{ padding: '1rem', borderBottom: `1px solid ${PM.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 'bold', color: PM.text }}>{cat.name}</div>
                      <div style={{ fontSize: '12px', color: PM.textMuted }}>
                        Original group:{' '}
                        {cat.original_group_name ||
                          cat.group_name ||
                          categoryGroups.find(
                            (g) =>
                              normalizeGroupId(g.id) ===
                              normalizeGroupId(cat.original_group_id ?? cat.group_id),
                          )?.name ||
                          'Unknown'}{' '}
                        | Archived: {formatStoredTimestampLocalDate(cat.archived_at)}
                      </div>
                    </div>
                    <button onClick={() => handleRestoreCategory(cat)} style={styles.restoreButton}>Restore</button>
                  </div>
                ))}
              </div>
            )}
            <div style={styles.modalActions}>
              <button style={styles.cancelButton} onClick={() => setShowArchivedModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showAddIncomeModal && (
        <div style={styles.modalOverlay} onClick={() => setShowAddIncomeModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Add Income</h3>
            <div style={styles.formGroup}><label style={styles.label}>Amount</label><input type="number" style={styles.input} value={incomeData.amount} onChange={(e) => setIncomeData({ ...incomeData, amount: e.target.value })} placeholder="0.00" step="0.01" min="0" autoFocus /></div>
            <div style={styles.formGroup}><label style={styles.label}>Date</label><input type="date" style={styles.input} value={incomeData.date} onChange={(e) => setIncomeData({ ...incomeData, date: e.target.value })} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Memo (Optional)</label><input type="text" style={styles.input} value={incomeData.memo} onChange={(e) => setIncomeData({ ...incomeData, memo: e.target.value })} placeholder="e.g., Paycheck, Gift, etc." /></div>
            <div style={styles.modalActions}><button style={styles.saveButton} onClick={handleAddIncome}>Add Income</button><button style={styles.cancelButton} onClick={() => setShowAddIncomeModal(false)}>Cancel</button></div>
          </div>
        </div>
      )}

      {showRecordPaymentModal && (
        <div style={styles.modalOverlay} onClick={() => setShowRecordPaymentModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Record Payment</h3>
            <div style={styles.formGroup}><label style={styles.label}>Amount</label><input type="number" style={styles.input} value={paymentData.amount} onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })} placeholder="0.00" step="0.01" min="0" autoFocus /></div>
            <div style={styles.formGroup}><label style={styles.label}>Category</label><select style={styles.select} value={paymentData.categoryId} onChange={(e) => setPaymentData({ ...paymentData, categoryId: e.target.value })}><option value="">Select a category</option>{budgetData.categories.filter((c) => !isCategoryArchived(c)).map((cat) => (<option key={cat.id} value={cat.id}>{cat.name} ({formatCurrency(cat.available)})</option>))}</select></div>
            <div style={styles.formGroup}><label style={styles.label}>Payee</label><input type="text" style={styles.input} value={paymentData.payee} onChange={(e) => setPaymentData({ ...paymentData, payee: e.target.value })} placeholder="Store name, bill payee, etc." /></div>
            <div style={styles.formGroup}><label style={styles.label}>Date</label><input type="date" style={styles.input} value={paymentData.date} onChange={(e) => setPaymentData({ ...paymentData, date: e.target.value })} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Memo (Optional)</label><input type="text" style={styles.input} value={paymentData.memo} onChange={(e) => setPaymentData({ ...paymentData, memo: e.target.value })} placeholder="Additional details" /></div>
            <div style={styles.modalActions}><button style={styles.saveButton} onClick={handleRecordPayment}>Record Payment</button><button style={styles.cancelButton} onClick={() => setShowRecordPaymentModal(false)}>Cancel</button></div>
          </div>
        </div>
      )}

      {showMoveMoneyModal && (
        <div style={styles.modalOverlay} onClick={() => setShowMoveMoneyModal(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pm-move-money-title"
            style={{
              ...styles.moveMoneyModalContent,
              ...(isMobileViewport ? styles.moveMoneyModalContentMobile : {}),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="pm-move-money-title" style={styles.modalTitle}>Move Money Between Categories</h3>
            <div style={styles.formGroup}>
              <label style={styles.label}>Search Categories</label>
              <input
                type="text"
                style={styles.input}
                value={moveMoneySearchQuery}
                onChange={(e) => setMoveMoneySearchQuery(e.target.value)}
                placeholder="Search category name"
                aria-label="Search categories"
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Amount</label>
              <input
                type="text"
                style={styles.input}
                value={moveMoneyData.amount}
                onChange={(e) => {
                  setMoveMoneyData({ ...moveMoneyData, amount: e.target.value });
                  setMoveMoneyError('');
                }}
                placeholder="50.00"
                autoFocus
                aria-label="Move amount"
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>From Category</label>
              <select
                style={styles.select}
                value={moveMoneyData.fromCategoryId}
                onChange={(e) => {
                  setMoveMoneyData({ ...moveMoneyData, fromCategoryId: e.target.value });
                  setMoveMoneyError('');
                }}
                aria-label="Move from category"
              >
                <option value="">Select source category</option>
                {filteredMoveMoneyCategories
                  .filter((c) => (c.available || 0) > 0 && !sameCategoryId(c.id, moveMoneyData.toCategoryId))
                  .map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} ({formatCurrency(cat.available)} available)
                    </option>
                  ))}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>To Category</label>
              <select
                style={styles.select}
                value={moveMoneyData.toCategoryId}
                onChange={(e) => {
                  setMoveMoneyData({ ...moveMoneyData, toCategoryId: e.target.value });
                  setMoveMoneyError('');
                }}
                aria-label="Move to category"
              >
                <option value="">Select destination category</option>
                <option value={READY_TO_ASSIGN_ID}>
                  {READY_TO_ASSIGN_LABEL} ({formatCurrency(budgetSummary.unassigned || 0)})
                </option>
                {filteredMoveMoneyCategories
                  .filter((c) => !sameCategoryId(c.id, moveMoneyData.fromCategoryId))
                  .map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} ({formatCurrency(cat.available)})
                    </option>
                  ))}
              </select>
            </div>

            <div style={styles.previewCard}>
              <div style={styles.previewHeading}>Balance Preview</div>
              <div style={styles.previewGrid}>
                <div>Current</div>
                <div>
                  {(getCategoryById(moveMoneyData.fromCategoryId)?.name || 'Source')}: {formatCurrency(getCategoryById(moveMoneyData.fromCategoryId)?.available || 0)}
                </div>
                <div>
                  {isReadyToAssignDestination(moveMoneyData.toCategoryId)
                    ? `${READY_TO_ASSIGN_LABEL}: ${formatCurrency(budgetSummary.unassigned || 0)}`
                    : `${getCategoryById(moveMoneyData.toCategoryId)?.name || 'Destination'}: ${formatCurrency(getCategoryById(moveMoneyData.toCategoryId)?.available || 0)}`}
                </div>
              </div>
              <div style={styles.previewGrid}>
                <div>After Move</div>
                <div>
                  {(getCategoryById(moveMoneyData.fromCategoryId)?.name || 'Source')}:{' '}
                  {formatCurrency(
                    (Number(getCategoryById(moveMoneyData.fromCategoryId)?.available) || 0) -
                      (parseMoneyInput(moveMoneyData.amount) || 0),
                  )}
                </div>
                <div>
                  {isReadyToAssignDestination(moveMoneyData.toCategoryId)
                    ? `${READY_TO_ASSIGN_LABEL}: ${formatCurrency(
                        (Number(budgetSummary.unassigned) || 0) + (parseMoneyInput(moveMoneyData.amount) || 0),
                      )}`
                    : `${getCategoryById(moveMoneyData.toCategoryId)?.name || 'Destination'}: ${formatCurrency(
                        (Number(getCategoryById(moveMoneyData.toCategoryId)?.available) || 0) +
                          (parseMoneyInput(moveMoneyData.amount) || 0),
                      )}`}
                </div>
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Suggested Categories</label>
              <div className="flex flex-wrap gap-2">
                {isReadyToAssignDestination(moveMoneyData.toCategoryId)
                  ? []
                  : getSuggestedMoveMoneySources(moveMoneyData.toCategoryId).slice(0, 3).map((cat) => (
                  <button
                    key={`move-suggestion-${cat.id}`}
                    type="button"
                    className="rounded-full border border-white/25 px-3 py-1 text-xs text-[#F0F9FF]"
                    onClick={() =>
                      setMoveMoneyData((prev) => ({
                        ...prev,
                        fromCategoryId: cat.id,
                      }))
                    }
                  >
                    {cat.name} ({formatCurrency(cat.available)})
                  </button>
                ))}
              </div>
            </div>
            {moveMoneyError && <div style={styles.errorText}>{moveMoneyError}</div>}
            <div style={styles.modalActions}>
              <button
                style={styles.saveButton}
                onClick={handleMoveMoneySubmit}
                disabled={Boolean(getMoveMoneyValidationError(moveMoneyData))}
                aria-label="Confirm move money"
              >
                Move Money
              </button>
              <button
                style={styles.cancelButton}
                onClick={() => {
                  setShowMoveMoneyModal(false);
                  setMoveMoneyError('');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddGroupModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pm-add-group-modal-title"
          data-testid="pm-add-group-modal-overlay"
          style={styles.modalOverlay}
          onClick={() => setShowAddGroupModal(false)}
        >
          <div
            data-testid="pm-add-group-modal"
            style={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="pm-add-group-modal-title" style={styles.modalTitle}>Create New Category Group</h3>
            <div style={styles.formGroup}><label htmlFor="pm-new-group-name" style={styles.label}>Group Name</label><input id="pm-new-group-name" type="text" style={styles.input} value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="e.g., Housing, Transportation, Savings Goals" autoFocus /></div>
            <div style={styles.modalActions}><button type="button" data-testid="pm-add-group-submit" style={styles.saveButton} onClick={handleCreateGroup}>Create Group</button><button type="button" style={styles.cancelButton} onClick={() => { setShowAddGroupModal(false); setNewGroupName(''); }}>Cancel</button></div>
          </div>
        </div>
      )}

      {showEditGroupModal && editingGroup && (
        <div style={styles.modalOverlay} onClick={() => setShowEditGroupModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Edit Category Group</h3>
            <div style={styles.formGroup}><label htmlFor="pm-edit-group-name" style={styles.label}>Group Name</label><input id="pm-edit-group-name" type="text" style={styles.input} value={editGroupName} onChange={(e) => setEditGroupName(e.target.value)} autoFocus /></div>
            <div style={styles.modalActions}><button style={styles.saveButton} onClick={handleUpdateGroup}>Save Changes</button><button style={styles.cancelButton} onClick={() => { setShowEditGroupModal(false); setEditingGroup(null); setEditGroupName(''); }}>Cancel</button></div>
          </div>
        </div>
      )}

      {showAddCategoryModal && selectedGroupForCategory && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pm-add-category-modal-title"
          data-testid="pm-add-category-modal-overlay"
          style={styles.modalOverlay}
          onClick={() => setShowAddCategoryModal(false)}
        >
          <div
            data-testid="pm-add-category-modal"
            style={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="pm-add-category-modal-title" style={styles.modalTitle}>Add Category to {selectedGroupForCategory.name}</h3>
            <div style={styles.formGroup}><label htmlFor="pm-new-category-name" style={styles.label}>Category Name</label><input id="pm-new-category-name" type="text" style={styles.input} value={newCategoryData.name} onChange={(e) => setNewCategoryData({ ...newCategoryData, name: e.target.value })} placeholder="e.g., Groceries, Rent, Savings" autoFocus /></div>
            <div style={styles.formGroup}><label htmlFor="pm-new-category-assigned" style={styles.label}>Initial Assigned Amount (Optional)</label><input id="pm-new-category-assigned" type="number" style={styles.input} value={newCategoryData.assigned === 0 ? '' : newCategoryData.assigned} onChange={(e) => { const val = e.target.value === '' ? 0 : parseFloat(e.target.value); setNewCategoryData({ ...newCategoryData, assigned: isNaN(val) ? 0 : val }); }} placeholder="0.00" step="0.01" min="0" /></div>
            <div style={styles.modalActions}><button type="button" data-testid="pm-add-category-submit" style={styles.saveButton} onClick={handleCreateCategory}>Create Category</button><button type="button" style={styles.cancelButton} onClick={() => { setShowAddCategoryModal(false); setNewCategoryData({ name: '', assigned: 0, groupId: null }); setSelectedGroupForCategory(null); }}>Cancel</button></div>
          </div>
        </div>
      )}

      {showTargetModal && selectedCategoryForTarget && (
        <CategoryTargetModal
          isOpen={showTargetModal}
          onClose={() => {
            setShowTargetModal(false);
            setSelectedCategoryForTarget(null);
          }}
          category={selectedCategoryForTarget}
          onSave={handleSaveGoal}
          currentTargetAmount={selectedCategoryForTarget.target_amount ?? ''}
          currentTargetType={selectedCategoryForTarget.target_type || 'monthly'}
          currentTargetDate={selectedCategoryForTarget.target_date}
          currentTargetFrequency={selectedCategoryForTarget.target_frequency || 'monthly'}
        />
      )}
    </div>
  );
}
// ==================== STYLES (modals — PM theme, no black)
const styles = {
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: PM.overlay,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modalContent: {
    backgroundColor: PM.fg,
    borderRadius: '16px',
    padding: '24px',
    width: '90%',
    maxWidth: '500px',
    border: '1px solid ' + PM.border,
    boxShadow: PM.shadow,
    color: PM.text
  },
  moveMoneyModalContent: {
    backgroundColor: PM.fg,
    borderRadius: '16px',
    padding: '24px',
    width: '92%',
    maxWidth: '640px',
    maxHeight: '92vh',
    overflowY: 'auto',
    border: '1px solid ' + PM.border,
    boxShadow: PM.shadow,
    color: PM.text
  },
  moveMoneyModalContentMobile: {
    width: '100%',
    height: '100%',
    maxWidth: 'none',
    maxHeight: 'none',
    borderRadius: 0,
    paddingTop: '16px',
    paddingBottom: '24px',
  },
  modalTitle: {
    color: PM.text,
    fontSize: '20px',
    fontWeight: '600',
    marginBottom: '20px'
  },
  formGroup: { marginBottom: '16px' },
  label: {
    display: 'block',
    color: PM.textMuted,
    fontSize: '13px',
    marginBottom: '6px',
    fontWeight: '500'
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: PM.well,
    border: '1px solid ' + PM.border,
    borderRadius: '8px',
    color: PM.text,
    fontSize: '14px',
    boxSizing: 'border-box'
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: PM.well,
    border: '1px solid ' + PM.border,
    borderRadius: '8px',
    color: PM.text,
    fontSize: '14px',
    boxSizing: 'border-box'
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '24px'
  },
  saveButton: {
    backgroundColor: PM.bg,
    color: PM.text,
    border: '1px solid ' + PM.border,
    padding: '8px 20px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600'
  },
  cancelButton: {
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    color: PM.text,
    border: '1px solid ' + PM.border,
    padding: '8px 20px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600'
  },
  restoreButton: {
    padding: '6px 12px',
    backgroundColor: PM.bg,
    color: PM.text,
    border: '1px solid ' + PM.border,
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '600'
  },
  previewCard: {
    border: '1px solid ' + PM.border,
    backgroundColor: PM.well,
    borderRadius: '12px',
    padding: '12px',
    marginBottom: '12px',
  },
  previewHeading: {
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: PM.textMuted,
    marginBottom: '8px',
  },
  previewGrid: {
    display: 'grid',
    gap: '6px',
    marginBottom: '8px',
    fontSize: '13px',
  },
  errorText: {
    color: '#fecaca',
    fontSize: '12px',
    marginTop: '4px',
  },
};

export default PropertyMapView;