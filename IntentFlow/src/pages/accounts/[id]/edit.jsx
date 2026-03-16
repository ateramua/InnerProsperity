// src/pages/accounts/[id]/edit.jsx
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function EditAccountPage() {
    const router = useRouter();
    const { id } = router.query;
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [account, setAccount] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        type: 'checking',
        account_type_category: 'budget',
        institution: '',
        account_number: '',
        routing_number: '',
        credit_limit: '',
        interest_rate: '',
        due_date: '',
        minimum_payment: ''
    });

    // Add style for spinner animation
    useEffect(() => {
        // Only run on client side
        if (typeof document !== 'undefined') {
            const style = document.createElement('style');
            style.textContent = `
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
            
            return () => {
                document.head.removeChild(style);
            };
        }
    }, []);

    useEffect(() => {
        if (id) {
            loadAccount();
        }
    }, [id]);

    const loadAccount = async () => {
        setLoading(true);
        try {
            const result = await window.electronAPI.getAccountById(id, 2);
            if (result.success) {
                setAccount(result.data);
                // Populate form with existing data
                setFormData({
                    name: result.data.name || '',
                    type: result.data.type || 'checking',
                    account_type_category: result.data.account_type_category || 'budget',
                    institution: result.data.institution || '',
                    account_number: result.data.account_number || '',
                    routing_number: result.data.routing_number || '',
                    credit_limit: result.data.credit_limit || '',
                    interest_rate: result.data.interest_rate || '',
                    due_date: result.data.due_date || '',
                    minimum_payment: result.data.minimum_payment || ''
                });
            }
        } catch (error) {
            console.error('Error loading account:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));

        // Auto-set category based on type
        if (name === 'type') {
            const category = ['credit', 'mortgage', 'loan'].includes(value) ? 'budget' :
                            ['investment'].includes(value) ? 'tracking' : 'budget';
            setFormData(prev => ({
                ...prev,
                account_type_category: category
            }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const updates = {
                name: formData.name,
                type: formData.type,
                account_type_category: formData.account_type_category,
                institution: formData.institution,
                account_number: formData.account_number || null,
                routing_number: formData.routing_number || null,
                credit_limit: formData.credit_limit ? parseFloat(formData.credit_limit) : null,
                interest_rate: formData.interest_rate ? parseFloat(formData.interest_rate) : null,
                due_date: formData.due_date || null,
                minimum_payment: formData.minimum_payment ? parseFloat(formData.minimum_payment) : null
            };

            const result = await window.electronAPI.updateAccount(id, 2, updates);
            if (result.success) {
                alert('✅ Account updated successfully!');
                router.push(`/accounts/${id}`);
            } else {
                alert('❌ Error updating account: ' + result.error);
            }
        } catch (error) {
            console.error('Error updating account:', error);
            alert('❌ Error updating account: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div style={styles.loadingContainer}>
                <div style={styles.loadingSpinner}></div>
                <p>Loading account...</p>
            </div>
        );
    }

    if (!account) {
        return (
            <div style={styles.errorContainer}>
                <h2>Account Not Found</h2>
                <Link href="/accounts" style={styles.backLink}>Back to Accounts</Link>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <Link href={`/accounts/${id}`} style={styles.backButton}>
                    ← Back to Account
                </Link>
                <h1 style={styles.title}>Edit {account.name}</h1>
            </div>

            <form onSubmit={handleSubmit} style={styles.form}>
                <div style={styles.formSection}>
                    <h2 style={styles.sectionTitle}>Basic Information</h2>
                    
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Account Name *</label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            required
                            style={styles.input}
                            placeholder="e.g., Main Checking"
                        />
                    </div>

                    <div style={styles.formGroup}>
                        <label style={styles.label}>Account Type</label>
                        <select
                            name="type"
                            value={formData.type}
                            onChange={handleChange}
                            style={styles.select}
                        >
                            <option value="checking">Checking</option>
                            <option value="savings">Savings</option>
                            <option value="credit">Credit Card</option>
                            <option value="cash">Cash</option>
                            <option value="investment">Investment</option>
                            <option value="mortgage">Mortgage</option>
                            <option value="loan">Loan</option>
                            <option value="asset">Asset</option>
                        </select>
                    </div>

                    <div style={styles.formGroup}>
                        <label style={styles.label}>Institution</label>
                        <input
                            type="text"
                            name="institution"
                            value={formData.institution}
                            onChange={handleChange}
                            style={styles.input}
                            placeholder="e.g., Chase Bank"
                        />
                    </div>
                </div>

                <div style={styles.formSection}>
                    <h2 style={styles.sectionTitle}>Bank Details</h2>
                    
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Account Number</label>
                        <input
                            type="text"
                            name="account_number"
                            value={formData.account_number}
                            onChange={handleChange}
                            style={styles.input}
                            placeholder="Last 4 digits or full number"
                        />
                    </div>

                    <div style={styles.formGroup}>
                        <label style={styles.label}>Routing Number</label>
                        <input
                            type="text"
                            name="routing_number"
                            value={formData.routing_number}
                            onChange={handleChange}
                            style={styles.input}
                            placeholder="9-digit routing number"
                        />
                    </div>
                </div>

                {/* Credit Card Specific Fields */}
                {(formData.type === 'credit' || formData.type === 'loan' || formData.type === 'mortgage') && (
                    <div style={styles.formSection}>
                        <h2 style={styles.sectionTitle}>Credit/Loan Details</h2>
                        
                        <div style={styles.formGroup}>
                            <label style={styles.label}>Credit Limit / Loan Amount</label>
                            <input
                                type="number"
                                name="credit_limit"
                                value={formData.credit_limit}
                                onChange={handleChange}
                                style={styles.input}
                                placeholder="0.00"
                                step="0.01"
                            />
                        </div>

                        <div style={styles.formGroup}>
                            <label style={styles.label}>Interest Rate (%)</label>
                            <input
                                type="number"
                                name="interest_rate"
                                value={formData.interest_rate}
                                onChange={handleChange}
                                style={styles.input}
                                placeholder="0.00"
                                step="0.01"
                            />
                        </div>

                        <div style={styles.formGroup}>
                            <label style={styles.label}>Due Date</label>
                            <input
                                type="date"
                                name="due_date"
                                value={formData.due_date}
                                onChange={handleChange}
                                style={styles.input}
                            />
                        </div>

                        <div style={styles.formGroup}>
                            <label style={styles.label}>Minimum Payment</label>
                            <input
                                type="number"
                                name="minimum_payment"
                                value={formData.minimum_payment}
                                onChange={handleChange}
                                style={styles.input}
                                placeholder="0.00"
                                step="0.01"
                            />
                        </div>
                    </div>
                )}

                <div style={styles.actions}>
                    <button 
                        type="submit" 
                        style={styles.saveButton}
                        disabled={saving}
                    >
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                    <Link href={`/accounts/${id}`} style={styles.cancelButton}>
                        Cancel
                    </Link>
                </div>
            </form>
        </div>
    );
}

const styles = {
    container: {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #111827 0%, #1F2937 100%)',
        color: 'white',
        padding: '2rem'
    },
    header: {
        maxWidth: '800px',
        margin: '0 auto 2rem',
        display: 'flex',
        alignItems: 'center',
        gap: '2rem'
    },
    backButton: {
        color: '#9CA3AF',
        textDecoration: 'none',
        fontSize: '1rem',
        padding: '0.5rem 1rem',
        background: '#1F2937',
        borderRadius: '0.5rem',
        border: '1px solid #374151'
    },
    title: {
        fontSize: '2rem',
        fontWeight: 'bold',
        margin: 0
    },
    form: {
        maxWidth: '800px',
        margin: '0 auto',
        background: '#1F2937',
        padding: '2rem',
        borderRadius: '1rem',
        border: '1px solid #374151'
    },
    formSection: {
        marginBottom: '2rem',
        paddingBottom: '2rem',
        borderBottom: '1px solid #374151'
    },
    sectionTitle: {
        fontSize: '1.25rem',
        fontWeight: '600',
        marginBottom: '1.5rem',
        color: 'white'
    },
    formGroup: {
        marginBottom: '1.5rem'
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
        background: '#111827',
        border: '1px solid #374151',
        borderRadius: '0.5rem',
        color: 'white',
        fontSize: '1rem'
    },
    select: {
        width: '100%',
        padding: '0.75rem',
        background: '#111827',
        border: '1px solid #374151',
        borderRadius: '0.5rem',
        color: 'white',
        fontSize: '1rem'
    },
    actions: {
        display: 'flex',
        gap: '1rem',
        marginTop: '2rem'
    },
    saveButton: {
        flex: 1,
        padding: '1rem',
        background: '#3B82F6',
        color: 'white',
        border: 'none',
        borderRadius: '0.5rem',
        fontSize: '1rem',
        fontWeight: '600',
        cursor: 'pointer',
        ':disabled': {
            opacity: 0.5,
            cursor: 'not-allowed'
        }
    },
    cancelButton: {
        flex: 1,
        padding: '1rem',
        background: '#4B5563',
        color: 'white',
        border: 'none',
        borderRadius: '0.5rem',
        fontSize: '1rem',
        fontWeight: '600',
        cursor: 'pointer',
        textAlign: 'center',
        textDecoration: 'none'
    },
    loadingContainer: {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #111827 0%, #1F2937 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white'
    },
    loadingSpinner: {
        width: '48px',
        height: '48px',
        border: '4px solid #3B82F6',
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        marginBottom: '1rem'
    },
    errorContainer: {
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#F87171'
    },
    backLink: {
        marginTop: '1rem',
        color: '#3B82F6',
        textDecoration: 'none'
    }
};