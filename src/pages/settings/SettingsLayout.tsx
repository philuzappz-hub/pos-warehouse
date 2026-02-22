import { cn } from "@/lib/utils";
import { NavLink, Outlet } from "react-router-dom";

const tabs = [
  { name: "Company", href: "/settings/company" },
  { name: "Branches", href: "/settings/branches" },
  { name: "Staff & Roles", href: "/settings/staff" },
  { name: "System", href: "/settings/system" },
];

export default function SettingsLayout() {
  return (
    <div className="p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-white">Settings</h1>
        <p className="text-sm text-slate-400">Admin control panel</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <NavLink
            key={t.href}
            to={t.href}
            className={({ isActive }) =>
              cn(
                "px-3 py-2 rounded-lg text-sm font-medium border transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-slate-900/40 text-slate-300 border-slate-700 hover:bg-slate-800"
              )
            }
          >
            {t.name}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  );
}