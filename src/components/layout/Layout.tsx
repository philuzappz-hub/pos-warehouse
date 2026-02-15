import { ReactNode } from "react";
import MobileNav from "./MobileNav";
import Sidebar from "./Sidebar";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="h-screen bg-slate-950 overflow-hidden">
      <MobileNav />

      <div className="flex h-full">
        <div className="hidden lg:block h-full">
          <Sidebar />
        </div>

        {/* ✅ MAIN SCROLL CONTAINER */}
        <main className="flex-1 pt-14 lg:pt-0 h-full overflow-y-auto">
          <div className="p-4 lg:p-6 min-h-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
