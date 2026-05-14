const express = require('express');
const router = express.Router();
const payeeService = require('../services/payeeService.cjs');

// GET /api/payees/for-transaction-form
router.get('/for-transaction-form', async (req, res) => {
  try {
    const { userId, currentAccountId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const payees = await payeeService.getPayeesForForm(userId, currentAccountId);
    
    res.json({
      success: true,
      data: payees
    });
  } catch (error) {
    console.error('Error fetching payees:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/payees (create or update from transaction)
router.post('/', async (req, res) => {
  try {
    const { name, userId } = req.body;
    
    if (!name || !userId) {
      return res.status(400).json({ error: 'name and userId are required' });
    }
    
    const payeeId = await payeeService.createOrUpdatePayee(name, userId);
    
    res.json({
      success: true,
      payeeId
    });
  } catch (error) {
    console.error('Error creating payee:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;