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

export default function TermsOfService() {
  return (
    <AppShell
      title="Terms of Service"
      subtitle="Terms for using IntentFlow and optional Plaid bank connections."
      actions={
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/privacy" className="rounded-full border border-white/30 px-4 py-2 text-white">
            Privacy
          </Link>
          <Link href="/settings" className="rounded-full border border-white/30 px-4 py-2 text-white">
            Settings
          </Link>
        </div>
      }
    >
      <p className="text-sm text-slate-400">Last updated: {updatedAt}</p>

      <Section title="Use of IntentFlow">
        <p>
          IntentFlow is a budgeting and personal finance tool. You are responsible for reviewing imported
          data, confirming balances and transactions, and making your own financial decisions.
        </p>
      </Section>

      <Section title="Plaid Connections">
        <p>
          Plaid connections are optional. By connecting your account, you authorize IntentFlow to securely
          access your financial data via Plaid for account sync, transaction import, balance updates, and
          related budgeting features. You may disconnect a bank at any time in Linked Banks.
        </p>
      </Section>

      <Section title="No Financial Advice">
        <p>
          IntentFlow may organize budgets, forecasts, reports, and account activity, but it does not provide
          legal, tax, investment, or financial advice. Verify important information with your financial
          institution or advisor.
        </p>
      </Section>

      <Section title="Your Data Responsibilities">
        <p>
          Keep your device, backups, passwords, Plaid credentials, relay secrets, and exported data secure.
          If you deploy a webhook relay, protect it with HTTPS and a relay API key for polling endpoints.
        </p>
      </Section>

      <Section title="Data Deletion and Access Revocation">
        <ul className="list-disc space-y-2 pl-5">
          <li>Use Linked Banks to disconnect an institution and revoke Plaid access.</li>
          <li>Use account edit screens to unlink a single account from Plaid while keeping the account row.</li>
          <li>Use account delete actions to remove local account data from IntentFlow.</li>
          <li>Remove local database/user data files if you want to delete all local app data from a device.</li>
        </ul>
      </Section>

      <Section title="Changes">
        <p>
          These terms may be updated as IntentFlow evolves. Continue using the app only if you accept the
          current terms and privacy policy.
        </p>
      </Section>
    </AppShell>
  );
}
