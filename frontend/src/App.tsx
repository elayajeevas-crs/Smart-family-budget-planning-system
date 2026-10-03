import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/Layout';
import { useAuth } from '@/context/AuthContext';
import Analytics from '@/pages/Analytics';
import Budgets from '@/pages/Budgets';
import Dashboard from '@/pages/Dashboard';
import Expenses from '@/pages/Expenses';
import Family from '@/pages/Family';
import Income from '@/pages/Income';
import { Login, Register } from '@/pages/AuthPages';
import NotFound from '@/pages/NotFound';
import Notifications from '@/pages/Notifications';
import Payments from '@/pages/Payments';
import Profile from '@/pages/Profile';
import Recurring from '@/pages/Recurring';
import Reports from '@/pages/Reports';
import Savings from '@/pages/Savings';
import Settings from '@/pages/Settings';
import Transactions from '@/pages/Transactions';

function GuestOnly({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/dashboard" replace /> : children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/family" element={<Family />} />
        <Route path="/income" element={<Income />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/budgets" element={<Budgets />} />
        <Route path="/savings" element={<Savings />} />
        <Route path="/recurring" element={<Recurring />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
