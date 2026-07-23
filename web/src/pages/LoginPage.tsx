import { FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../api/client';
import { extractReferenceCode } from '../lib/sanitize-api-error';
import { WorkHQField, WorkHQPasswordInput } from '../components/ui';
import { WorkHQErrorState } from '../components/workhq/states/WorkHQErrorState';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      navigate(params.get('redirect') || '/dashboard', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="card login-card" onSubmit={onSubmit}>
        <h1>WorkHQ Back Office</h1>
        <p className="muted">ล็อกอินด้วยชื่อผู้ใช้หรือชื่อแสดงที่ตั้งในหน้าผู้ใช้หลังบ้าน</p>
        <WorkHQField label="ชื่อผู้ใช้ / ชื่อแสดง">
          <input
            className="whq-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            placeholder="เช่น owner หรือ alynn"
            required
          />
        </WorkHQField>
        <WorkHQField label="รหัสผ่าน">
          <WorkHQPasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </WorkHQField>
        {error ? (
          <WorkHQErrorState
            title={error instanceof ApiError && error.status === 401 ? 'เข้าสู่ระบบไม่สำเร็จ' : 'โหลดข้อมูลไม่สำเร็จ'}
            message={
              error instanceof ApiError && error.status === 401
                ? 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง — ลองใช้ชื่อผู้ใช้ (owner) ไม่ใช่ชื่อแสดง หรือกดรีเซ็ตรหัสในหน้าผู้ใช้หลังบ้าน'
                : error instanceof Error
                  ? error.message
                  : 'ข้อมูลของคุณยังปลอดภัย กรุณาลองใหม่อีกครั้ง'
            }
            referenceCode={extractReferenceCode(error)}
          />
        ) : null}
        <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
