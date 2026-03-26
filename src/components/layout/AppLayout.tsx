import { Outlet } from 'react-router-dom';
import AppSidebar from './AppSidebar';

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-[68px] md:ml-[240px] transition-all duration-300">
        <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
