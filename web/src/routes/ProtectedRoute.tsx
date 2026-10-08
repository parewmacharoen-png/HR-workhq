import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from '../components/LoadingState';
import { WorkHQButton } from '../components/ui';

export function ProtectedRoute() {
  const { user, loading, serverUnavailable, refresh } = useAuth();
  if (loading) return <LoadingState label="Loading session…" />;
  if (!user && serverUnavailable) {
    // Still signed in — the server is asleep or restarting, so don't send them to the login page.
    return (
      <div className="whq-state-panel" role="alert">
        <p>ยังเชื่อมต่อเซิร์ฟเวอร์ไม่ได้ (อาจกำลังอัปเดตระบบ) คุณยังอยู่ในระบบ ไม่ต้องล็อกอินใหม่</p>
        <WorkHQButton onClick={() => void refresh()}>ลองใหม่</WorkHQButton>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function PublicRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState label="Loading…" />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
