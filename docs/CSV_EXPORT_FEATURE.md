# CSV Export Feature for Account Transaction History

## Overview

This feature adds the ability to export an account's transaction history as a CSV file with date range and transaction type filtering.

## Implementation Details

### Files Added/Modified

1. **`src/utils/csvExport.ts`** - Core CSV export utility
   - Converts transaction data to CSV format
   - Handles CSV escaping for special characters (commas, quotes, newlines)
   - Includes UTF-8 BOM for Excel compatibility
   - Generates downloadable CSV file with auto-generated filename

2. **`src/utils/transactionFilters.ts`** - Transaction filtering utilities
   - Date range presets: Last 7 days, 30 days, 90 days, All time
   - Transaction type filters: All, Sent, Received, zkApp
   - Filter functions for date range and type

3. **`src/components/accounts/TransactionExportButton.tsx`** - Export button component
   - Dropdown interface with filtering options
   - Shows count of transactions to be exported
   - Apply filters before exporting
   - Clean UI with proper accessibility

4. **`src/components/accounts/AccountTransactions.tsx`** - Modified to add export button
   - Export button appears only when transactions exist
   - Positioned in the transaction history header

5. **`e2e/fixtures/account-transactions.json`** - Test data fixture
   - Mock transaction data for testing

6. **`e2e/fixtures.ts`** & **`e2e/mock-api.ts`** - Updated test infrastructure
   - Added support for mocking account transactions API

### CSV Format

The exported CSV includes the following columns:

- **hash**: Transaction hash
- **type**: Transaction type (sent/received/zkapp)
- **counterparty**: The other party's public key
- **amount**: Transaction amount in MINA (formatted)
- **fee**: Transaction fee in MINA (formatted)
- **timestamp**: ISO 8601 timestamp
- **block_height**: Block height where transaction was confirmed
- **memo**: Decoded memo (if present)
- **status**: Transaction status (currently always "confirmed")

### CSV Example

```csv
hash,type,counterparty,amount,fee,timestamp,block_height,memo,status
5JuA8jyKPXgVcNnQxD9JKMVLR4GzTxNHr6FqE3mYBdWy7ScPvC9K,sent,B62qpge4uMq4Vv5Rvc8Gw9qSquUYd6xoW1pz7HQkMSHm6h1o7pvLPAN,100.5,0.01,2026-02-10T14:30:00.000Z,432150,,confirmed
5JuB9kzLQYhWdOoRyE8KLNMWS5HaTyOIs7GrF4nZf4nYCeXz8TdQwD9L,received,B62qoG5Yk4iVxpyczUrBNpwtx2xunPhxfG7yYA3xYBPJeRbABxvWC3K,50.0,0.01,2026-02-09T08:15:00.000Z,432148,,confirmed
```

### File Naming

CSV files are automatically named with the format:
```
transactions_{publicKeyPrefix}_{date}.csv
```

Example: `transactions_B62qiy32p8_2026-02-12.csv`

## Features

### Export Button
- Located in the Transaction History section header on account detail pages
- Only visible when transactions exist
- Opens a dropdown with filtering options

### Filtering Options

#### Date Range
- **All time**: Exports all transactions (default)
- **Last 7 days**: Exports transactions from the last 7 days
- **Last 30 days**: Exports transactions from the last 30 days
- **Last 90 days**: Exports transactions from the last 90 days

#### Transaction Type
- **All**: Exports all transaction types (default)
- **Sent**: Only sent transactions
- **Received**: Only received transactions
- **zkApp**: Only zkApp transactions

### Real-time Feedback
- Shows count of transactions that will be exported based on current filters
- Disable download button when no transactions match filters

## Usage

1. Navigate to an account page (e.g., `/account/B62q...`)
2. Scroll to the Transaction History section
3. Click the "Export CSV" button
4. Select desired date range and transaction type filters
5. Click "Download CSV" to generate and download the file

## Technical Notes

- CSV generation happens client-side (no server required)
- Uses native browser download via Blob API
- Properly escapes special characters in CSV cells
- UTF-8 BOM included for Excel compatibility
- Reuses existing `fetchAccountTransactions` API
- Integrates with existing date/amount formatters

## Browser Compatibility

Works on all modern browsers that support:
- Blob API
- URL.createObjectURL()
- Download attribute on anchor tags

## Future Enhancements

Possible future improvements:
- Custom date range picker (from/to)
- More export formats (JSON, Excel)
- Pagination for very large transaction histories
- Include pending transactions option
- Additional columns (nonce, failure reason, etc.)
