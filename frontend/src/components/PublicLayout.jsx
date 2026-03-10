import { Outlet } from 'react-router-dom';
import PublicHeader from './PublicHeader';

export default function PublicLayout() {
    return (
        <div className="min-h-screen bg-[var(--color-bg-page)]" style={{ fontFamily: 'var(--font-body)' }}>
            <PublicHeader />
            <Outlet />
        </div>
    );
}
