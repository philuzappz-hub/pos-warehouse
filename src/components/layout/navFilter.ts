import type { AppRole, NavItem } from "./navConfig";

type FilterArgs = {
  roles?: AppRole[] | null;
  isAttendanceManager?: boolean | null;
  isReturnsHandler?: boolean | null;
};

export function filterNavigation(navigation: NavItem[], args: FilterArgs) {
  const roles = Array.isArray(args.roles) ? args.roles : [];
  const isAttendanceManager = Boolean(args.isAttendanceManager);
  const isReturnsHandler = Boolean(args.isReturnsHandler);

  return navigation.filter((item) => {
    // ✅ Permission flags override role checks when enabled on the item
    if (item.allowAttendanceManager && isAttendanceManager) return true;
    if (item.allowReturnsHandler && isReturnsHandler) return true;

    // ✅ Role-based access
    const itemRoles = Array.isArray(item.roles) ? item.roles : [];
    return itemRoles.some((role) => roles.includes(role));
  });
}