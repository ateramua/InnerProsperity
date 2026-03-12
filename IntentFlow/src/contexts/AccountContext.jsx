import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';

const AccountContext = createContext();

const initialState = {
  accounts: {
    byId: {},
    allIds: []
  },
  transactions: {
    byId: {},
    byAccount: {}
  },
  categories: {
    byId: {},
    allIds: [],
    byGroup: {}
  },
  ui: {
    selectedAccountId: null,
    filters: {
      dateRange: 'thisMonth',
      categoryId: null,
      search: '',
      showCleared: null
    },
    reconciliation: {
      active: false,
      targetBalance: null,
      originalClearedBalance: null
    }
  }
};

function accountReducer(state, action) {
  switch (action.type) {
    case 'SET_ACCOUNTS': {
      const byId = {};
      const allIds = [];
      action.payload.forEach(account => {
        byId[account.id] = account;
        allIds.push(account.id);
      });
      return { ...state, accounts: { byId, allIds } };
    }

    case 'ADD_ACCOUNT': {
      const account = action.payload;
      return {
        ...state,
        accounts: {
          byId: { ...state.accounts.byId, [account.id]: account },
          allIds: [...state.accounts.allIds, account.id]
        }
      };
    }

    case 'UPDATE_ACCOUNT': {
      const account = action.payload;
      return {
        ...state,
        accounts: {
          ...state.accounts,
          byId: { ...state.accounts.byId, [account.id]: account }
        }
      };
    }

    case 'DELETE_ACCOUNT': {
      const { [action.payload]: removed, ...remainingById } = state.accounts.byId;
      return {
        ...state,
        accounts: {
          byId: remainingById,
          allIds: state.accounts.allIds.filter(id => id !== action.payload)
        }
      };
    }

    case 'SET_TRANSACTIONS': {
      const { accountId, transactions } = action.payload;
      const byId = { ...state.transactions.byId };
      transactions.forEach(tx => {
        byId[tx.id] = tx;
      });
      
      return {
        ...state,
        transactions: {
          ...state.transactions,
          byId,
          byAccount: {
            ...state.transactions.byAccount,
            [accountId]: transactions.map(t => t.id)
          }
        }
      };
    }

    case 'ADD_TRANSACTION': {
      const transaction = action.payload;
      const accountTransactions = state.transactions.byAccount[transaction.accountId] || [];
      
      // Handle transfer pair
      if (Array.isArray(transaction)) {
        const [tx1, tx2] = transaction;
        const newById = { 
          ...state.transactions.byId, 
          [tx1.id]: tx1,
          [tx2.id]: tx2 
        };
        
        return {
          ...state,
          transactions: {
            byId: newById,
            byAccount: {
              ...state.transactions.byAccount,
              [tx1.accountId]: [...(state.transactions.byAccount[tx1.accountId] || []), tx1.id],
              [tx2.accountId]: [...(state.transactions.byAccount[tx2.accountId] || []), tx2.id]
            }
          }
        };
      } else {
        return {
          ...state,
          transactions: {
            byId: { ...state.transactions.byId, [transaction.id]: transaction },
            byAccount: {
              ...state.transactions.byAccount,
              [transaction.accountId]: [...accountTransactions, transaction.id]
            }
          }
        };
      }
    }

    case 'UPDATE_TRANSACTION': {
      const transaction = action.payload;
      return {
        ...state,
        transactions: {
          ...state.transactions,
          byId: { ...state.transactions.byId, [transaction.id]: transaction }
        }
      };
    }

    case 'DELETE_TRANSACTION': {
      const { id, accountId } = action.payload;
      const { [id]: removed, ...remainingById } = state.transactions.byId;
      const accountTransactions = state.transactions.byAccount[accountId]?.filter(txId => txId !== id) || [];
      
      return {
        ...state,
        transactions: {
          byId: remainingById,
          byAccount: {
            ...state.transactions.byAccount,
            [accountId]: accountTransactions
          }
        }
      };
    }

    case 'SET_CATEGORIES': {
      const byId = {};
      const allIds = [];
      const byGroup = {};
      
      action.payload.forEach(category => {
        byId[category.id] = category;
        allIds.push(category.id);
        if (!byGroup[category.groupId]) {
          byGroup[category.groupId] = [];
        }
        byGroup[category.groupId].push(category.id);
      });
      
      return {
        ...state,
        categories: { byId, allIds, byGroup }
      };
    }

    case 'SELECT_ACCOUNT':
      return {
        ...state,
        ui: { ...state.ui, selectedAccountId: action.payload }
      };

    case 'SET_FILTERS':
      return {
        ...state,
        ui: { ...state.ui, filters: { ...state.ui.filters, ...action.payload } }
      };

    case 'START_RECONCILIATION':
      return {
        ...state,
        ui: {
          ...state.ui,
          reconciliation: {
            active: true,
            targetBalance: action.payload.targetBalance,
            originalClearedBalance: action.payload.currentCleared
          }
        }
      };

    case 'END_RECONCILIATION':
      return {
        ...state,
        ui: {
          ...state.ui,
          reconciliation: {
            active: false,
            targetBalance: null,
            originalClearedBalance: null
          }
        }
      };

    case 'CLEAR_FILTERS':
      return {
        ...state,
        ui: {
          ...state.ui,
          filters: {
            dateRange: 'thisMonth',
            categoryId: null,
            search: '',
            showCleared: null
          }
        }
      };

    default:
      return state;
  }
}

export function AccountProvider({ children }) {
  const [state, dispatch] = useReducer(accountReducer, initialState);

  // Selectors
  const selectors = {
    getAccounts: useCallback(() => {
      return state.accounts.allIds.map(id => state.accounts.byId[id]);
    }, [state.accounts]),

    getAccount: useCallback((id) => {
      return state.accounts.byId[id];
    }, [state.accounts]),

    getAccountBalance: useCallback((accountId) => {
      const transactionIds = state.transactions.byAccount[accountId] || [];
      return transactionIds.reduce((sum, id) => {
        return sum + (state.transactions.byId[id]?.amount || 0);
      }, 0);
    }, [state.transactions]),

    getClearedBalance: useCallback((accountId) => {
      const transactionIds = state.transactions.byAccount[accountId] || [];
      return transactionIds.reduce((sum, id) => {
        const tx = state.transactions.byId[id];
        return sum + (tx?.cleared ? tx.amount : 0);
      }, 0);
    }, [state.transactions]),

    getUnclearedBalance: useCallback((accountId) => {
      const transactionIds = state.transactions.byAccount[accountId] || [];
      return transactionIds.reduce((sum, id) => {
        const tx = state.transactions.byId[id];
        return sum + (tx?.cleared ? 0 : tx.amount);
      }, 0);
    }, [state.transactions]),

    getTransactionsForAccount: useCallback((accountId, customFilters = null) => {
      const filters = customFilters || state.ui.filters;
      const transactionIds = state.transactions.byAccount[accountId] || [];
      let transactions = transactionIds
        .map(id => state.transactions.byId[id])
        .filter(Boolean)
        .sort((a, b) => new Date(b.date) - new Date(a.date));

      // Apply filters
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        transactions = transactions.filter(tx => 
          tx.payee?.toLowerCase().includes(searchLower) ||
          tx.memo?.toLowerCase().includes(searchLower)
        );
      }

      if (filters.categoryId) {
        transactions = transactions.filter(tx => tx.categoryId === filters.categoryId);
      }

      if (filters.dateFrom) {
        transactions = transactions.filter(tx => tx.date >= filters.dateFrom);
      }

      if (filters.dateTo) {
        transactions = transactions.filter(tx => tx.date <= filters.dateTo);
      }

      if (filters.showCleared !== null) {
        transactions = transactions.filter(tx => tx.cleared === filters.showCleared);
      }

      // Calculate running balance
      let runningBalance = 0;
      return transactions.reverse().map(tx => {
        runningBalance += tx.amount;
        return { ...tx, runningBalance };
      }).reverse();
    }, [state.transactions, state.ui.filters]),

    getCategories: useCallback(() => {
      return state.categories.allIds.map(id => state.categories.byId[id]);
    }, [state.categories]),

    getCategoriesByGroup: useCallback((groupId) => {
      const categoryIds = state.categories.byGroup[groupId] || [];
      return categoryIds.map(id => state.categories.byId[id]);
    }, [state.categories])
  };

  return (
    <AccountContext.Provider value={{ state, dispatch, selectors }}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccounts() {
  const context = useContext(AccountContext);
  if (!context) {
    throw new Error('useAccounts must be used within an AccountProvider');
  }
  return context;
}