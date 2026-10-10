import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as usersApi from "./api";
import type { ProgramRole, UserRole, UserStatus } from "@/types/api";

export function useUsersList(params: { page?: number; pageSize?: number; search?: string; dateFrom?: string; dateTo?: string }) {
  return useQuery({ queryKey: ["users", params], queryFn: () => usersApi.listUsers(params) });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: usersApi.createUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: Partial<{ name: string; role: UserRole; status: UserStatus }> }) =>
      usersApi.updateUser(userId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useMemberships(userId: string | null) {
  return useQuery({
    queryKey: ["users", userId, "memberships"],
    queryFn: () => usersApi.listMemberships(userId!),
    enabled: !!userId,
  });
}

export function useAddMembership(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ programId, roleOnProgram }: { programId: string; roleOnProgram: ProgramRole }) =>
      usersApi.addMembership(userId, programId, roleOnProgram),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users", userId, "memberships"] }),
  });
}

export function useRemoveMembership(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (programId: string) => usersApi.removeMembership(userId, programId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users", userId, "memberships"] }),
  });
}

export function useRemoveTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => usersApi.removeTeamMember(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}
