/** Plaid API error codes we handle explicitly in sync/link flows. */
const PLAID_ERROR_CODES = {
  ITEM_LOGIN_REQUIRED: 'ITEM_LOGIN_REQUIRED',
  INVALID_ACCESS_TOKEN: 'INVALID_ACCESS_TOKEN',
  PRODUCTS_NOT_SUPPORTED: 'PRODUCTS_NOT_SUPPORTED',
};

const PLAID_ITEM_STATUS = {
  ACTIVE: 'active',
  LOGIN_REQUIRED: 'login_required',
};

module.exports = {
  PLAID_ERROR_CODES,
  PLAID_ITEM_STATUS,
};
