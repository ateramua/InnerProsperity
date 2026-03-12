// test-transaction.js
const TransactionService = require('./src/services/transactions/transactionService.cjs');

async function test() {
    console.log('🧪 Testing Transaction Service...');
    const service = new TransactionService();
    
    try {
        // Test getting transactions for an account
        const transactions = await service.getAccountTransactions('test4', 2);
        console.log('📊 Transactions for account test4:', transactions);
        
        console.log('✅ Test completed!');
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

test();