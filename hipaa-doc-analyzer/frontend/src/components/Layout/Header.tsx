import { signOut } from 'aws-amplify/auth';

export function Header() {
  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-800">Clinical Document Analyzer</h1>
        <button
          type="button"
          onClick={() => signOut()}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
