import { useState, type ReactNode, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  ChevronRight,
  ChevronDown,
  Info,
  Loader2,
  Send,
  ShieldCheck,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react';
import { useNetwork } from '@/hooks';
import {
  useBroadcast,
  type TransactionType,
  type VerifyResult,
} from '@/hooks/useBroadcast';
import { cn } from '@/lib/utils';

const TX_TYPES: { value: TransactionType; label: string }[] = [
  { value: 'payment', label: 'Payment' },
  { value: 'delegation', label: 'Delegation' },
  { value: 'zkapp', label: 'zkApp' },
];

const EXAMPLES: Record<TransactionType, string> = {
  payment: JSON.stringify(
    {
      input: {
        from: 'B62q...',
        to: 'B62q...',
        amount: '1000000000',
        fee: '10000000',
        nonce: '0',
      },
      signature: {
        field: '...',
        scalar: '...',
      },
    },
    null,
    2,
  ),
  delegation: JSON.stringify(
    {
      input: {
        from: 'B62q...',
        to: 'B62q...',
        fee: '10000000',
        nonce: '0',
      },
      signature: {
        field: '...',
        scalar: '...',
      },
    },
    null,
    2,
  ),
  zkapp: JSON.stringify(
    {
      input: {
        zkappCommand: {
          feePayer: { body: { publicKey: 'B62q...', fee: '10000000' } },
          accountUpdates: [],
          memo: 'E4Yd...',
        },
      },
    },
    null,
    2,
  ),
};

const VALIDATION_MESSAGES: Record<
  VerifyResult,
  { text: string; color: string; icon: typeof Check }
> = {
  valid: {
    text: 'Signature is valid',
    color: 'bg-green-500/10 text-green-700 dark:text-green-400',
    icon: Check,
  },
  invalid: {
    text: 'Signature verification failed \u2014 the signature does not match the transaction data',
    color: 'bg-destructive/10 text-destructive',
    icon: X,
  },
  unsupported: {
    text: 'Client-side verification requires field/scalar signature format. zkApp signatures can only be verified by broadcasting.',
    color: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
    icon: AlertTriangle,
  },
};

export function BroadcastPage(): ReactNode {
  const [txType, setTxType] = useState<TransactionType>('payment');
  const [json, setJson] = useState('');
  const [showExample, setShowExample] = useState(false);
  const [showSigningDocs, setShowSigningDocs] = useState(false);
  const { network } = useNetwork();
  const {
    broadcast,
    validate,
    result,
    validationResult,
    loading,
    error,
    reset,
  } = useBroadcast();

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    broadcast(txType, json);
  };

  const handleValidate = (): void => {
    validate(txType, json);
  };

  const handleReset = (): void => {
    reset();
    setJson('');
  };

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <nav aria-label="breadcrumb">
        <ol className="flex items-center gap-1 text-sm text-muted-foreground">
          <li>
            <Link to="/" className="hover:text-foreground">
              Home
            </Link>
          </li>
          <ChevronRight size={14} />
          <li className="font-medium text-foreground">Broadcast Transaction</li>
        </ol>
      </nav>

      <div>
        <h1 className="text-2xl font-bold">Broadcast Transaction</h1>
        <p className="text-sm text-muted-foreground">
          Broadcasting to {network.displayName}
        </p>
      </div>

      {/* Security notice */}
      <div className="flex items-start gap-2 rounded-md bg-blue-500/10 p-4 text-sm text-blue-700 dark:text-blue-300">
        <Info size={16} className="mt-0.5 shrink-0" />
        <span>
          This tool broadcasts pre-signed transactions. Your private keys never
          leave your device. Sign transactions offline using the Mina CLI or a
          compatible wallet.
        </span>
      </div>

      {/* Signing documentation */}
      <div className="rounded-lg border border-border bg-card">
        <button
          type="button"
          onClick={() => setShowSigningDocs(!showSigningDocs)}
          className="flex w-full items-center gap-2 px-6 py-4 text-left text-sm font-medium hover:bg-accent/50"
        >
          <ChevronDown
            size={14}
            className={cn(
              'transition-transform',
              !showSigningDocs && '-rotate-90',
            )}
          />
          How to sign a transaction
        </button>
        {showSigningDocs && (
          <div className="space-y-4 border-t border-border px-6 py-4 text-sm">
            <div>
              <h4 className="font-medium">
                1. Export your key from the daemon
              </h4>
              <pre className="mt-1 overflow-x-auto rounded-md bg-accent p-3 text-xs">
                {`mina accounts export \\
  --public-key B62q... \\
  --config-directory /root/.mina-config \\
  --privkey-path keys/my-wallet`}
              </pre>
            </div>
            <div>
              <h4 className="font-medium">2. Get the raw private key</h4>
              <pre className="mt-1 overflow-x-auto rounded-md bg-accent p-3 text-xs">
                {`mina advanced dump-keypair --privkey-path keys/my-wallet
# Outputs: Private key: EK...`}
              </pre>
            </div>
            <div>
              <h4 className="font-medium">3. Sign with mina-signer</h4>
              <pre className="mt-1 overflow-x-auto rounded-md bg-accent p-3 text-xs">
                {`npm install mina-signer`}
              </pre>
              <pre className="mt-1 overflow-x-auto rounded-md bg-accent p-3 text-xs">
                {`import Client from 'mina-signer';
// Use 'testnet' for devnet, 'mainnet' for mainnet
const client = new Client({ network: 'testnet' });

const signed = client.signPayment({
  from: 'B62q...',
  to: 'B62q...',
  amount: '1000000000',  // 1 MINA in nanomina
  fee: '10000000',       // 0.01 MINA
  nonce: '0',            // check your account nonce
}, 'EK...');             // your private key

// Copy this JSON into the broadcast page:
console.log(JSON.stringify({
  input: signed.data,
  signature: signed.signature,
}, null, 2));`}
              </pre>
              <p className="mt-2 text-muted-foreground">
                For delegation, use{' '}
                <code className="rounded bg-accent px-1 py-0.5 text-xs">
                  client.signStakeDelegation(...)
                </code>{' '}
                instead — same format but without{' '}
                <code className="rounded bg-accent px-1 py-0.5 text-xs">
                  amount
                </code>
                .
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Type selector tabs */}
      <div className="flex gap-2 border-b border-border">
        {TX_TYPES.map(t => (
          <button
            key={t.value}
            onClick={() => setTxType(t.value)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              txType === t.value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Main card */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-semibold">
            Send {TX_TYPES.find(t => t.value === txType)?.label}
          </h2>
        </div>

        <div className="space-y-4 p-6">
          {/* Example template */}
          <div>
            <button
              type="button"
              onClick={() => setShowExample(!showExample)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronDown
                size={14}
                className={cn(
                  'transition-transform',
                  !showExample && '-rotate-90',
                )}
              />
              Example JSON
            </button>
            {showExample && (
              <pre className="mt-2 overflow-x-auto rounded-md bg-accent p-3 text-xs">
                {EXAMPLES[txType]}
              </pre>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="tx-json"
                className="mb-1 block text-sm font-medium"
              >
                Signed Transaction JSON
              </label>
              <textarea
                id="tx-json"
                value={json}
                onChange={e => {
                  setJson(e.target.value);
                  if (validationResult) reset();
                }}
                rows={14}
                placeholder="Paste your signed transaction JSON here..."
                className={cn(
                  'w-full rounded-md border bg-background px-3 py-2 font-mono text-sm',
                  'placeholder:text-muted-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-ring',
                  error
                    ? 'border-destructive focus:ring-destructive'
                    : 'border-input',
                )}
                disabled={loading || !!result}
              />
            </div>

            {/* Error display */}
            {error && (
              <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Validation result display */}
            {validationResult && !error && (
              <ValidationMessage result={validationResult} />
            )}

            {/* Success display */}
            {result && (
              <div className="space-y-3 rounded-md bg-green-500/10 p-4">
                <p className="font-medium text-green-700 dark:text-green-400">
                  Transaction broadcast successfully!
                </p>
                <div className="text-sm">
                  <span className="text-muted-foreground">
                    Transaction hash:{' '}
                  </span>
                  <Link
                    to={`/transaction/${result.txHash}`}
                    className="break-all font-mono text-primary hover:underline"
                  >
                    {result.txHash}
                  </Link>
                </div>
                <p className="text-sm text-muted-foreground">
                  Your transaction is now in the mempool. Click the hash above
                  to track its status. It may take a few minutes to be included
                  in a block.
                </p>
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium hover:bg-accent/80"
                >
                  Broadcast Another
                </button>
              </div>
            )}

            {/* Action buttons */}
            {!result && (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleValidate}
                  disabled={loading || !json.trim()}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium',
                    'border border-input bg-background',
                    'hover:bg-accent hover:text-accent-foreground',
                    'disabled:pointer-events-none disabled:opacity-50',
                  )}
                >
                  <ShieldCheck size={16} />
                  Validate Signature
                </button>
                <button
                  type="submit"
                  disabled={loading || !json.trim()}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium',
                    'bg-primary text-primary-foreground',
                    'hover:bg-primary/90',
                    'disabled:pointer-events-none disabled:opacity-50',
                  )}
                >
                  {loading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                  {loading ? 'Broadcasting...' : 'Broadcast Transaction'}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

function ValidationMessage({ result }: { result: VerifyResult }): ReactNode {
  const msg = VALIDATION_MESSAGES[result];
  const Icon = msg.icon;
  return (
    <div
      className={cn('flex items-start gap-2 rounded-md p-4 text-sm', msg.color)}
    >
      <Icon size={16} className="mt-0.5 shrink-0" />
      <span>{msg.text}</span>
    </div>
  );
}
