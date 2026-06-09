#!/usr/bin/env node
/**
 * Fail CI if migrated success flows still call window.alert() instead of showIntentFlowDialog.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'src');

const CHECKS = [
  {
    file: 'components/TransactionImportModal.jsx',
    forbidden: [/alert\s*\(\s*[`'"]\s*Import complete/i],
    required: [/showIntentFlowDialog/],
  },
  {
    file: 'views/AccountDetailView.jsx',
    forbidden: [/alert\s*\(\s*[`'"]\s*✅ Transaction added successfully/i],
    required: [/showIntentFlowDialog/],
  },
  {
    file: 'pages/accounts/[id].jsx',
    forbidden: [/alert\s*\(\s*[`'"]\s*✅ Transaction added successfully/i],
    required: [/showIntentFlowDialog/],
  },
  {
    file: 'views/PropertyMapView.jsx',
    forbidden: [/alert\s*\(\s*[`'"]\s*✅ Group created successfully/i],
    required: [/showIntentFlowDialog/],
  },
];

let failed = false;

for (const check of CHECKS) {
  const abs = path.join(ROOT, check.file);
  const text = fs.readFileSync(abs, 'utf8');

  for (const pattern of check.forbidden) {
    if (pattern.test(text)) {
      console.error(`verify-testable-dialogs: ${check.file} still matches ${pattern}`);
      failed = true;
    }
  }

  for (const pattern of check.required) {
    if (!pattern.test(text)) {
      console.error(`verify-testable-dialogs: ${check.file} missing ${pattern}`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log('verify-testable-dialogs: OK');
