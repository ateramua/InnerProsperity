// src/components/TransactionManager.jsx
import React, { useState } from 'react';

const TransactionManager = ({ transactions, categories, accounts, onAddTransaction, onUpdateTransaction, onDeleteTransaction, onToggleCleared, accountId }) => {
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});

    const handleEdit = (transaction) => {
        setEditingId(transaction.id);
        setEditForm({
            date: transaction.date,
            payee: transaction.payee,
            categoryId: transaction.category_id,
            amount: Math.abs(transaction.amount),
            type: transaction.amount < 0 ? 'outflow' : 'inflow',
            memo: transaction.memo || '',
            cleared: transaction.is_cleared === 1
        });
    };

    const handleSaveEdit = async () => {
        const amount = editForm.type === 'outflow' ? -Math.abs(editForm.amount) : Math.abs(editForm.amount);
        await onUpdateTransaction(editingId, {
            date: editForm.date,
            payee: editForm.payee,
            categoryId: editForm.categoryId,
            amount: amount,
            memo: editForm.memo,
            is_cleared: editForm.cleared ? 1 : 0
        });
        setEditingId(null);
    };

    const handleDelete = async (id) => {
        if (confirm('Are you sure you want to delete this transaction?')) {
            await onDeleteTransaction(id);
        }
    };

    const handleToggleCleared = async (id, currentStatus) => {
        await onToggleCleared(id, currentStatus ? 0 : 1);
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(Math.abs(amount));
    };

    return (
        <div style={styles.container}>
            <h2 style={styles.title}>Transactions</h2>

            {/* Transactions Table */}
            <div style={styles.tableContainer}>
                <table style={styles.table}>
                    <thead style={styles.tableHead}>
                        <tr>
                            <th style={styles.tableHeader}>Date</th>
                            <th style={styles.tableHeader}>Payee</th>
                            <th style={styles.tableHeader}>Category</th>
                            <th style={styles.tableHeader}>Memo</th>
                            <th style={styles.tableHeader}>Outflow</th>
                            <th style={styles.tableHeader}>Inflow</th>
                            <th style={styles.tableHeader}>Cleared</th>
                            <th style={styles.tableHeader}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions.map(transaction => (
                            <tr key={transaction.id} style={styles.tableRow}>
                                <td style={styles.tableCell}>{transaction.date}</td>
                                <td style={styles.tableCell}>{transaction.payee || transaction.description}</td>
                                <td style={styles.tableCell}>
                                    {categories.find(c => c.id === transaction.category_id)?.name || 'Uncategorized'}
                                </td>
                                <td style={styles.tableCell}>{transaction.memo || '-'}</td>
                                <td style={{ ...styles.tableCell, ...styles.outflow }}>
                                    {transaction.amount < 0 ? formatCurrency(transaction.amount) : ''}
                                </td>
                                <td style={{ ...styles.tableCell, ...styles.inflow }}>
                                    {transaction.amount > 0 ? formatCurrency(transaction.amount) : ''}
                                </td>
                                <td style={styles.tableCell}>
                                    <input
                                        type="checkbox"
                                        checked={transaction.is_cleared === 1}
                                        onChange={() => handleToggleCleared(transaction.id, transaction.is_cleared)}
                                        style={styles.checkbox}
                                    />
                                </td>
                                <td style={styles.tableCell}>
                                    <button
                                        onClick={() => handleEdit(transaction)}
                                        style={styles.actionButton}
                                    >
                                        ✏️
                                    </button>
                                    <button
                                        onClick={() => handleDelete(transaction.id)}
                                        style={{ ...styles.actionButton, marginLeft: '0.5rem' }}
                                    >
                                        🗑️
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Edit Modal */}
            {editingId && (
                <div style={styles.modal}>
                    <div style={styles.modalContent}>
                        <h3 style={styles.modalTitle}>Edit Transaction</h3>

                        <div style={styles.formGroup}>
                            <label style={styles.label}>Date</label>
                            <input
                                type="date"
                                value={editForm.date}
                                onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                                style={styles.input}
                            />
                        </div>

                        <div style={styles.formGroup}>
                            <label style={styles.label}>Payee</label>
                            <input
                                type="text"
                                value={editForm.payee}
                                onChange={(e) => setEditForm({ ...editForm, payee: e.target.value })}
                                style={styles.input}
                            />
                        </div>

                        <div style={styles.formGroup}>
                            <label style={styles.label}>Category</label>
                            <select
                                value={editForm.categoryId || ''}
                                onChange={(e) => setEditForm({ ...editForm, categoryId: e.target.value })}
                                style={styles.select}
                            >
                                <option value="">Select Category</option>
                                {categories.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                ))}
                            </select>
                        </div>

                        <div style={styles.formGroup}>
                            <label style={styles.label}>Amount</label>
                            <input
                                type="number"
                                value={editForm.amount}
                                onChange={(e) => setEditForm({ ...editForm, amount: parseFloat(e.target.value) || 0 })}
                                style={styles.input}
                                step="0.01"
                            />
                        </div>

                        <div style={styles.formGroup}>
                            <label style={styles.label}>Type</label>
                            <select
                                value={editForm.type}
                                onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                                style={styles.select}
                            >
                                <option value="outflow">Outflow (Expense)</option>
                                <option value="inflow">Inflow (Income)</option>
                            </select>
                        </div>

                        <div style={styles.formGroup}>
                            <label style={styles.label}>Memo</label>
                            <input
                                type="text"
                                value={editForm.memo}
                                onChange={(e) => setEditForm({ ...editForm, memo: e.target.value })}
                                style={styles.input}
                            />
                        </div>

                        <div style={styles.formGroup}>
                            <label style={styles.checkboxLabel}>
                                <input
                                    type="checkbox"
                                    checked={editForm.cleared}
                                    onChange={(e) => setEditForm({ ...editForm, cleared: e.target.checked })}
                                />
                                Cleared
                            </label>
                        </div>

                        <div style={styles.modalActions}>
                            <button onClick={handleSaveEdit} style={styles.saveButton}>
                                Save Changes
                            </button>
                            <button onClick={() => setEditingId(null)} style={styles.cancelButton}>
                                Cancel
                            </button>
                            {/* Remove */}
                            <button onClick={() => {
                                console.log('➕ Add button clicked');
                                // Your existing onClick code
                            }}>
                                Add Transaction
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const styles = {
    container: {
        width: '100%'
    },
    title: {
        fontSize: '1.5rem',
        fontWeight: 'bold',
        marginBottom: '1.5rem',
        color: 'white'
    },
    tableContainer: {
        background: '#000000',
        borderRadius: '0.75rem',
        overflow: 'hidden',
        border: '1px solid #000000'
    },
    table: {
        width: '100%',
        borderCollapse: 'collapse'
    },
    tableHead: {
        background: '#000000'
    },
    tableHeader: {
        padding: '1rem',
        textAlign: 'left',
        color: '#9CA3AF',
        fontWeight: '500',
        fontSize: '0.875rem',
        borderBottom: '2px solid #000000'
    },
    tableRow: {
        borderBottom: '1px solid #000000'
    },
    tableCell: {
        padding: '0.75rem 1rem',
        color: '#F3F4F6',
        fontSize: '0.95rem'
    },
    outflow: {
        color: '#F87171'
    },
    inflow: {
        color: '#4ADE80'
    },
    checkbox: {
        width: '18px',
        height: '18px',
        cursor: 'pointer'
    },
    actionButton: {
        background: 'none',
        border: 'none',
        fontSize: '1.1rem',
        cursor: 'pointer',
        padding: '0.25rem'
    },
    modal: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
    },
    modalContent: {
        background: '#000000',
        padding: '2rem',
        borderRadius: '1rem',
        width: '90%',
        maxWidth: '500px',
        maxHeight: '80vh',
        overflowY: 'auto'
    },
    modalTitle: {
        fontSize: '1.25rem',
        fontWeight: 'bold',
        marginBottom: '1.5rem',
        color: 'white'
    },
    formGroup: {
        marginBottom: '1rem'
    },
    label: {
        display: 'block',
        marginBottom: '0.5rem',
        color: '#9CA3AF',
        fontSize: '0.875rem'
    },
    input: {
        width: '100%',
        padding: '0.75rem',
        background: '#000000',
        border: '1px solid #000000',
        borderRadius: '0.5rem',
        color: 'white',
        fontSize: '1rem'
    },
    select: {
        width: '100%',
        padding: '0.75rem',
        background: '#000000',
        border: '1px solid #000000',
        borderRadius: '0.5rem',
        color: 'white',
        fontSize: '1rem'
    },
    checkboxLabel: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        color: 'white',
        cursor: 'pointer'
    },
    modalActions: {
        display: 'flex',
        gap: '1rem',
        marginTop: '2rem'
    },
    saveButton: {
        flex: 1,
        padding: '0.75rem',
        background: '#3B82F6',
        color: 'white',
        border: 'none',
        borderRadius: '0.5rem',
        fontSize: '1rem',
        fontWeight: '500',
        cursor: 'pointer'
    },
    cancelButton: {
        flex: 1,
        padding: '0.75rem',
        background: '#4B5563',
        color: 'white',
        border: 'none',
        borderRadius: '0.5rem',
        fontSize: '1rem',
        fontWeight: '500',
        cursor: 'pointer'
    }
};

export default TransactionManager;