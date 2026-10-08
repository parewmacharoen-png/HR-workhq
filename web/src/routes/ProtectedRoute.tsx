import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from '../components/LoadingState';

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState label="กำลังเชื่อมต่อระบบ… (ถ้าระบบเพิ่งอัปเดต อาจใช้เวลาสักครู่)" />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function PublicRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState label="Loading…" />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
