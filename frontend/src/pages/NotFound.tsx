import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40">
        <Compass className="h-7 w-7" />
      </span>
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="mt-2 max-w-sm text-slate-500 dark:text-slate-400">The page you are looking for does not exist or has been moved.</p>
      <Link to="/dashboard" className="btn-primary mt-6">Back to dashboard</Link>
    </div>
  );
}
