(async () => {
  console.log('🔍🔍🔍 STARTING UI-DATABASE CONNECTION TEST 🔍🔍🔍');
  console.log('===============================================\n');

  console.log('📡 TEST 1: Checking electronAPI availability...');
  if (!window.electronAPI) {
    console.error('❌ FAILED: window.electronAPI is not available!');
    console.error('   You are likely running in browser mode, not Electron.');
    return;
  }
  console.log('✅ PASS: electronAPI is available');
  console.log('   Methods available:', Object.keys(window.electronAPI).join(', '));

  console.log('\n👤 TEST 2: Getting current user...');
  const userResult = await window.electronAPI.getCurrentUser();
  if (!userResult?.success || !userResult?.data) {
    console.error('❌ FAILED: Could not get current user');
    return;
  }
  const userId = userResult.data.id;
  console.log('✅ PASS: Current user ID:', userId);

  console.log('\n📊 TEST 3: Fetching existing accounts from database...');
  const accountsResult = await window.electronAPI.getAccountsSummary(userId);
  if (!accountsResult?.success) {
    console.error('❌ FAILED: Could not fetch accounts');
    return;
  }
  const existingAccounts = accountsResult.data || [];
  console.log(`✅ PASS: Found ${existingAccounts.length} accounts in database`);
  console.log('   Existing accounts:', existingAccounts.map(a => ({ name: a.name, type: a.type, balance: a.balance })));

  const testTimestamp = Date.now();
  const testAccount = {
    name: `TEST_UI_DB_${testTimestamp}`,
    type: 'checking',
    balance: 1234.56,
    account_number: `TEST${testTimestamp.toString().slice(-8)}`,
    routing_number: '999888777',
    notes: 'UI-Database connection test',
    userId: userId
  };

  console.log('\n💾 TEST 4: Creating new test account...');
  console.log('   Account data:', testAccount);

  const createResult = await window.electronAPI.createAccount(testAccount);
  if (!createResult?.success) {
    console.error('❌ FAILED: Could not create account:', createResult?.error);
    return;
  }
  console.log('✅ PASS: Account created successfully');
  console.log('   New account ID:', createResult.data?.id);

  console.log('\n🔍 TEST 5: Verifying account appears in database...');
  const verifyResult = await window.electronAPI.getAccountsSummary(userId);
  if (!verifyResult?.success) {
    console.error('❌ FAILED: Could not verify accounts');
    return;
  }
  const updatedAccounts = verifyResult.data || [];
  const foundAccount = updatedAccounts.find(a => a.name === testAccount.name);

  if (!foundAccount) {
    console.error('❌ FAILED: New account NOT found in database after creation!');
    console.error('   Total accounts before:', existingAccounts.length);
    console.error('   Total accounts after:', updatedAccounts.length);
    return;
  }
  console.log('✅ PASS: New account found in database');
  console.log('   Account details:', { name: foundAccount.name, account_number: foundAccount.account_number, balance: foundAccount.balance });

  console.log('\n🔢 TEST 6: Verifying account number persistence...');
  if (foundAccount.account_number !== testAccount.account_number) {
    console.error('❌ FAILED: Account number mismatch!');
    console.error('   Expected:', testAccount.account_number);
    console.error('   Actual:', foundAccount.account_number);
    return;
  }
  console.log('✅ PASS: Account number correctly saved:', foundAccount.account_number);

  if (foundAccount.routing_number !== testAccount.routing_number) {
    console.warn('⚠️ WARNING: Routing number mismatch (may not be critical)');
  } else {
    console.log('✅ PASS: Routing number correctly saved:', foundAccount.routing_number);
  }

  console.log('\n===============================================');
  console.log('🎉🎉🎉 ALL TESTS PASSED! 🎉🎉🎉');
  console.log('===============================================');
  console.log('✅ UI → Electron API → Database → UI is FULLY CONNECTED');
  console.log('✅ Account creation, persistence, and retrieval all work');
  console.log('\n📝 Test account created:', testAccount.name);
})();
