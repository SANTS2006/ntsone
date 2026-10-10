import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as platformApi from "./api";

export const platformKeys = {
  all: ["platform-tenants"] as const,
  list: (params: platformApi.ListTenantsParams) => ["platform-tenants", "list", params] as const,
  detail: (tenantId: string) => ["platform-tenants", "detail", tenantId] as const,
  users: (tenantId: string, range: object = {}) => ["platform-tenants", tenantId, "users", range] as const,
  programs: (tenantId: string, range: object = {}) => ["platform-tenants", tenantId, "programs", range] as const,
};

export function useTenantsList(params: platformApi.ListTenantsParams) {
  return useQuery({
    queryKey: platformKeys.list(params),
    queryFn: () => platformApi.listTenants(params),
  });
}

export function useTenant(tenantId: string | undefined) {
  return useQuery({
    queryKey: platformKeys.detail(tenantId ?? ""),
    queryFn: () => platformApi.getTenant(tenantId!),
    enabled: !!tenantId,
  });
}

export function useTenantUsers(tenantId: string | undefined, range: { dateFrom?: string; dateTo?: string } = {}) {
  return useQuery({
    queryKey: platformKeys.users(tenantId ?? "", range),
    queryFn: () => platformApi.listTenantUsers(tenantId!, range),
    enabled: !!tenantId,
  });
}

export function useUpdateUserStatus(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: "active" | "suspended" }) =>
      platformApi.updateUserStatus(userId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platform-tenants", tenantId, "users"] }),
  });
}

export function useTenantPrograms(tenantId: string | undefined, range: { dateFrom?: string; dateTo?: string } = {}) {
  return useQuery({
    queryKey: platformKeys.programs(tenantId ?? "", range),
    queryFn: () => platformApi.listTenantPrograms(tenantId!, range),
    enabled: !!tenantId,
  });
}
