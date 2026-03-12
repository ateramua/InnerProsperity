import React, { useState } from 'react';

export default function CSVManager({ categories, accounts, onImport, onExport }) {
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState('');
  const [importFormat, setImportFormat] = useState('bank');
  const [mapping, setMapping] = useState({
    date: 'date',
    payee: 'payee',
    amount: 'amount',
    category: 'category',
    account: 'account'
  });
  const [previewData, setPreviewData] = useState([]);
  const [importStatus, setImportStatus] = useState('');

  // Sample CSV formats
  const formats = {
    bank: {
      name: 'Bank Export',
      sample: 'Date,Description,Amount,Balance\n01/15/2024,Whole Foods,-45.67,5432.10\n01/16/2024,Amazon,-89.99,5342.11',
      description: 'Standard bank CSV format'
    },
    mint: {
      name: 'Mint.com',
      sample: 'Date,Description,Original Description,Amount,Transaction Type,Category,Account Name\n01/15/2024,Whole Foods,Whole Foods,-45.67,debit,Groceries,Chase Checking',
      description: 'Mint.com export format'
    },
     {
      name: 'SoulFunds',
      sample: 'Date,Payee,Category,Memo,Outflow,Inflow\n01/15/2024,Whole Foods,Groceries,,45.67,\n01/16/2024,Paycheck,Ready to Assign,,,2000.00',
      description: 'SoulFunds export format'
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const content = e.target.result;
      setImportData(content);
      parseCSV(content);
    };
    
    reader.readAsText(file);
  };

  const parseCSV = (csvText) => {
    const lines = csvText.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];
    
    for (let i = 1; i < Math.min(lines.length, 6); i++) {
      if (lines[i].trim()) {
        const values = lines[i].split(',').map(v => v.trim());
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index];
        });
        data.push(row);
      }
    }
    
    setPreviewData(data);
  };

  const handleImport = async () => {
    setImportStatus('processing');
    
    try {
      // Parse all lines
      const lines = importData.split('\n').filter(l => l.trim());
      const headers = lines[0].split(',').map(h => h.trim());
      
      const transactions = [];
      let successCount = 0;
      let errorCount = 0;

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        const values = lines[i].split(',').map(v => v.trim());
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index];
        });

        // Convert based on mapping
        const transaction = {
          date: formatDate(row[mapping.date]),
          payee: row[mapping.payee] || 'Unknown',
          amount: parseAmount(row[mapping.amount]),
          categoryId: findCategory(row[mapping.category]),
          accountId: findAccount(row[mapping.account]),
          memo: `Imported from CSV`,
          cleared: true
        };

        // Validate
        if (transaction.date && !isNaN(transaction.amount) && transaction.accountId) {
          const result = await window.electronAPI.addTransaction(transaction);
          if (result.success) {
            successCount++;
          } else {
            errorCount++;
          }
        } else {
          errorCount++;
        }
      }

      setImportStatus(`✅ Import complete: ${successCount} added, ${errorCount} failed`);
      setTimeout(() => {
        setShowImportModal(false);
        setImportStatus('');
        setImportData('');
        setPreviewData([]);
      }, 3000);
      
    } catch (error) {
      console.error('Import error:', error);
      setImportStatus('❌ Import failed: ' + error.message);
    }
  };

  const formatDate = (dateStr) => {
    // Handle various date formats
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts[2].length === 4) {
        return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
      }
    }
    return dateStr;
  };

  const parseAmount = (amountStr) => {
    // Remove $ and commas, handle parentheses for negatives
    const clean = amountStr.replace(/[$,]/g, '');
    if (clean.startsWith('(') && clean.endsWith(')')) {
      return -parseFloat(clean.slice(1, -1));
    }
    return parseFloat(clean);
  };

  const findCategory = (categoryName) => {
    if (!categoryName) return null;
    const category = categories.find(c => 
      c.name.toLowerCase() === categoryName.toLowerCase()
    );
    return category?.id || null;
  };

  const findAccount = (accountName) => {
    if (!accountName) return 1; // Default account
    const account = accounts.find(a => 
      a.name.toLowerCase().includes(accountName.toLowerCase())
    );
    return account?.id || 1;
  };

  const handleExport = (type) => {
    let csvContent = '';
    
    if (type === 'bank') {
      csvContent = 'Date,Payee,Amount,Memo\n';
      onExport().forEach(t => {
        csvContent += `${t.date},${t.payee},${t.amount},${t.memo || ''}\n`;
      });
    } else if (type === 'SoulFunds') {
      csvContent = 'Date,Payee,Category,Memo,Outflow,Inflow\n';
      onExport().forEach(t => {
        if (t.amount < 0) {
          csvContent += `${t.date},${t.payee},${t.category_name},${t.memo || ''},${Math.abs(t.amount)},\n`;
        } else {
          csvContent += `${t.date},${t.payee},${t.category_name},${t.memo || ''},,${t.amount}\n`;
        }
      });
    }

    // Download file
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  return (
    <div style={{ padding: '20px', color: 'white' }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '20px' 
      }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span>📁</span> CSV Import/Export
        </h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setShowImportModal(true)}
            style={{
              background: '#3B82F6',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <span>📥</span> Import CSV
          </button>
          <select
            onChange={(e) => handleExport(e.target.value)}
            style={{
              background: '#10B981',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold'
            }}
          >
            <option value="">📤 Export as...</option>
            <option value="bank">Bank Format</option>
            <option value="SoulFunds">SoulFunds Format</option>
          </select>
        </div>
      </div>

      {/* Info Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '15px',
        marginBottom: '20px'
      }}>
        <div style={{
          background: '#1F2937',
          padding: '15px',
          borderRadius: '8px'
        }}>
          <div style={{ fontSize: '18px', marginBottom: '5px' }}>📥 Import</div>
          <div style={{ fontSize: '14px', color: '#9CA3AF' }}>
            Import transactions from your bank's CSV export. Supports multiple formats.
          </div>
        </div>
        <div style={{
          background: '#1F2937',
          padding: '15px',
          borderRadius: '8px'
        }}>
          <div style={{ fontSize: '18px', marginBottom: '5px' }}>📤 Export</div>
          <div style={{ fontSize: '14px', color: '#9CA3AF' }}>
            Export your transactions for backup or use in other apps like Excel.
          </div>
        </div>
        <div style={{
          background: '#1F2937',
          padding: '15px',
          borderRadius: '8px'
        }}>
          <div style={{ fontSize: '18px', marginBottom: '5px' }}>🔄 Sync</div>
          <div style={{ fontSize: '14px', color: '#9CA3AF' }}>
            Keep your data portable and backup regularly.
          </div>
        </div>
      </div>

      {/* Format Examples */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '15px'
      }}>
        {Object.entries(formats).map(([key, format]) => (
          <div key={key} style={{
            background: '#1F2937',
            padding: '15px',
            borderRadius: '8px'
          }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>{format.name}</h3>
            <p style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '10px' }}>
              {format.description}
            </p>
            <pre style={{
              background: '#111827',
              padding: '10px',
              borderRadius: '4px',
              fontSize: '11px',
              overflowX: 'auto',
              color: '#9CA3AF'
            }}>
              {format.sample}
            </pre>
          </div>
        ))}
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <div style={{
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
        }}>
          <div style={{
            background: '#1F2937',
            borderRadius: '12px',
            padding: '30px',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '80vh',
            overflowY: 'auto'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px' }}>📥 Import CSV</h3>

            {/* Format Selection */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: '#9CA3AF' }}>
                CSV Format
              </label>
              <select
                value={importFormat}
                onChange={(e) => setImportFormat(e.target.value)}
                style={{
                  width: '100%',
                  background: '#111827',
                  border: '1px solid #374151',
                  color: 'white',
                  padding: '10px',
                  borderRadius: '4px'
                }}
              >
                <option value="bank">Bank Export</option>
                <option value="mint">Mint.com</option>
                <option value="SoulFunds">SoulFunds</option>
              </select>
            </div>

            {/* File Upload */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: '#9CA3AF' }}>
                Choose CSV File
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                style={{
                  width: '100%',
                  background: '#111827',
                  border: '1px solid #374151',
                  color: 'white',
                  padding: '10px',
                  borderRadius: '4px'
                }}
              />
            </div>

            {/* Field Mapping */}
            {previewData.length > 0 && (
              <>
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ margin: '0 0 10px 0' }}>Preview (first 5 rows)</h4>
                  <div style={{
                    background: '#111827',
                    padding: '10px',
                    borderRadius: '4px',
                    overflowX: 'auto'
                  }}>
                    <table style={{ width: '100%', fontSize: '12px' }}>
                      <thead>
                        <tr>
                          {Object.keys(previewData[0]).map(key => (
                            <th key={key} style={{ padding: '5px', textAlign: 'left' }}>
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.map((row, i) => (
                          <tr key={i}>
                            {Object.values(row).map((val, j) => (
                              <td key={j} style={{ padding: '5px' }}>{val}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ margin: '0 0 10px 0' }}>Field Mapping</h4>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '5px', color: '#9CA3AF' }}>
                        Date Field
                      </label>
                      <select
                        value={mapping.date}
                        onChange={(e) => setMapping({...mapping, date: e.target.value})}
                        style={{
                          width: '100%',
                          background: '#111827',
                          border: '1px solid #374151',
                          color: 'white',
                          padding: '8px',
                          borderRadius: '4px'
                        }}
                      >
                        {Object.keys(previewData[0]).map(key => (
                          <option key={key} value={key}>{key}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '5px', color: '#9CA3AF' }}>
                        Payee Field
                      </label>
                      <select
                        value={mapping.payee}
                        onChange={(e) => setMapping({...mapping, payee: e.target.value})}
                        style={{
                          width: '100%',
                          background: '#111827',
                          border: '1px solid #374151',
                          color: 'white',
                          padding: '8px',
                          borderRadius: '4px'
                        }}
                      >
                        {Object.keys(previewData[0]).map(key => (
                          <option key={key} value={key}>{key}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '5px', color: '#9CA3AF' }}>
                        Amount Field
                      </label>
                      <select
                        value={mapping.amount}
                        onChange={(e) => setMapping({...mapping, amount: e.target.value})}
                        style={{
                          width: '100%',
                          background: '#111827',
                          border: '1px solid #374151',
                          color: 'white',
                          padding: '8px',
                          borderRadius: '4px'
                        }}
                      >
                        {Object.keys(previewData[0]).map(key => (
                          <option key={key} value={key}>{key}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Status */}
            {importStatus && (
              <div style={{
                marginBottom: '20px',
                padding: '10px',
                background: importStatus.includes('✅') ? '#10B98120' : '#EF444420',
                border: `1px solid ${importStatus.includes('✅') ? '#10B981' : '#EF4444'}`,
                borderRadius: '4px',
                color: importStatus.includes('✅') ? '#10B981' : '#EF4444'
              }}>
                {importStatus}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleImport}
                disabled={!importData}
                style={{
                  flex: 1,
                  background: importData ? '#10B981' : '#6B7280',
                  color: 'white',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '4px',
                  cursor: importData ? 'pointer' : 'not-allowed'
                }}
              >
                Import Transactions
              </button>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportData('');
                  setPreviewData([]);
                  setImportStatus('');
                }}
                style={{
                  flex: 1,
                  background: '#6B7280',
                  color: 'white',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
