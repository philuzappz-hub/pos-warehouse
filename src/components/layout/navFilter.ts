import type { AppRole, NavItem } from "./navConfig";

export function filterNavigation(
  navigation: NavItem[],
  args: {
    roles: AppRole[];
    isAttendanceManager: boolean;
    isReturnsHandler: boolean;
  }
) {
  const { roles, isAttendanceManager, isReturnsHandler } = args;

  return navigation.filter((item) => {
    if (item.allowAttendanceManager && isAttendanceManager) return true;
    if (item.allowReturnsHandler && isReturnsHandler) return true;
    return item.roles.some((role) => roles.includes(role));
  });
}