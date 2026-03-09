import Sidebar from './Sidebar';

export default function AppLayout({ children }) {
    return (
        <div className="lg:flex min-h-screen bg-[var(--color-bg-page)]">
            <Sidebar />
            <main className="flex-1 lg:ml-[260px] min-h-screen animate-fade-in">
                {children}
            </main>
        </div>
    );
}
