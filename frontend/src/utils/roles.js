export function isStaffRole(role) {
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

export function isSuperAdminRole(role) {
  return role === 'SUPER_ADMIN';
}
