import Link from 'next/link';
import AppShell from '../components/Layout/AppShell';

const updatedAt = 'May 16, 2026';

function Section({ title, children }) {
  return (
    <section className="rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/30">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="mt-4 space-y-3 text-sm leading-6 text-slate-300">{children}</div>
    </section>
  );
}

export default function PrivacyPolicy() {
  return (
    <AppShell
      title="Privacy Policy"
      subtitle="How IntentFlow handles financial data, Plaid connections, retention, and deletion."
      actions={
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/terms" className="rounded-full border border-white/30 px-4 py-2 text-white">
            Terms
          </Link>
          <Link href="/settings" className="rounded-full border border-white/30 px-4 py-2 text-white">
            Settings
          </Link>
        </div>
      }
    >
      <p className="text-sm text-slate-400">Last updated: {updatedAt}</p>

      <Section title="Summary">
        <p>
          IntentFlow is a personal finance app. It stores your budgeting data locally in the app database
          and uses Plaid only when you choose to connect a bank. IntentFlow does not sell your financial
          data.
        </p>
      </Section>

      <Section title="Financial Data Accessed Through Plaid">
        <p>
          By connecting your account, you authorize IntentFlow to securely access your financial data via
          Plaid. Depending on the accounts you select in Plaid Link, IntentFlow may access:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Account names, account type/subtype, institution name, and account mask.</li>
          <li>Current and available balances.</li>
          <li>Transactions, merchant/payee details, dates, amounts, pending status, and Plaid category data.</li>
          <li>Credit card or loan details when available through Plaid Liabilities.</li>
          <li>Connection status signals, such as login required or consent expiration.</li>
        </ul>
      </Section>

      <Section title="How Data Is Used">
        <p>
          IntentFlow uses linked financial data to populate accounts, sync balances, import transactions,
          categorize spending, show connection health, and support budgeting and reporting features. It is
          not used for advertising or sold to third parties.
        </p>
      </Section>

      <Section title="Storage and Security">
        <p>
          Bank access tokens are handled by the Electron main process and encrypted before local storage.
          Account and transaction data is stored in the local IntentFlow database on your device. If you
          configure a webhook relay, the relay stores webhook sync flags and metadata so the desktop app can
          poll for updates; it should be deployed with HTTPS and a protected `/pending` endpoint.
        </p>
      </Section>

      <Section title="Retention and Deletion">
        <p>
          IntentFlow keeps local account, transaction, category, and Plaid connection data until you delete
          it or disconnect the related bank connection.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            To revoke Plaid access, open <strong>Linked Banks</strong>, choose the institution, and use
            <strong> Disconnect</strong>. IntentFlow calls Plaid item removal for that connection.
          </li>
          <li>
            To keep an account but stop syncing it from Plaid, use the account edit modal and choose
            <strong> Unlink from Plaid</strong>.
          </li>
          <li>
            To delete local account data, open <strong>Accounts</strong> and use the account delete action.
          </li>
          <li>
            To remove local app data entirely, delete the IntentFlow database/user data files from your
            device after exporting any backups you want to keep.
          </li>
        </ul>
      </Section>

      <Section title="Your Choices">
        <p>
          You can use IntentFlow with manual accounts only. Plaid is optional. You can disable automatic
          sync, disconnect bank access, delete imported transactions during disconnect, and delete local
          accounts from the app.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          For privacy or deletion requests, use your project support channel or the contact address you
          publish with IntentFlow releases.
        </p>
      </Section>
    </AppShell>
  );
}
