import type { AccountTransaction } from '@/services/api/transactions';
import { formatMina, decodeMemo } from './formatters';

/**
 * Convert account transactions to CSV format
 * Includes BOM for Excel compatibility with UTF-8
 */
export function exportTransactionsToCSV(
  transactions: AccountTransaction[],
  publicKey: string,
): void {
  // CSV header
  const headers = [
    'hash',
    'type',
    'counterparty',
    'amount',
    'fee',
    'timestamp',
    'block_height',
    'memo',
    'status',
  ];

  // Convert transactions to CSV rows
  const rows = transactions.map(tx => {
    const amount = tx.amount ? formatMina(tx.amount) : '';
    const fee = formatMina(tx.fee);
    const memo = tx.memo ? decodeMemo(tx.memo) : '';
    const counterparty = tx.counterparty || '';

    // All confirmed transactions from the archive
    const status = 'confirmed';

    return [
      tx.hash,
      tx.type,
      counterparty,
      amount,
      fee,
      tx.dateTime,
      tx.blockHeight.toString(),
      memo,
      status,
    ];
  });

  // Build CSV content
  const csvContent = [
    headers.join(','),
    ...rows.map(row =>
      row.map(cell => escapeCsvCell(cell.toString())).join(','),
    ),
  ].join('\n');

  // Add BOM for Excel compatibility with UTF-8
  const BOM = '\uFEFF';
  const csvWithBOM = BOM + csvContent;

  // Create blob and download
  const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  // Generate filename with public key prefix and current date
  const dateStr = new Date().toISOString().split('T')[0];
  const publicKeyPrefix = publicKey.slice(0, 10);
  const filename = `transactions_${publicKeyPrefix}_${dateStr}.csv`;

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Escape special characters in CSV cells
 * Handles commas, quotes, and newlines
 */
function escapeCsvCell(cell: string): string {
  // If cell contains comma, quote, or newline, wrap in quotes and escape existing quotes
  if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}
