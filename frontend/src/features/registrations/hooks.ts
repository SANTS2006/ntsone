import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as registrationsApi from "./api";
import type { RegistrationStatus } from "@/types/api";

export function useRegistrationsList(programId: string, params: registrationsApi.ListRegistrationsParams) {
  return useQuery({
    queryKey: ["registrations", programId, params],
    queryFn: () => registrationsApi.listRegistrations(programId, params),
    enabled: !!programId,
  });
}

export function useRegistration(programId: string, registrationId: string | undefined) {
  return useQuery({
    queryKey: ["registrations", programId, "detail", registrationId],
    queryFn: () => registrationsApi.getRegistration(programId, registrationId!),
    enabled: !!programId && !!registrationId,
  });
}

export function useProgramStats(programId: string | undefined) {
  return useQuery({
    queryKey: ["registrations", programId, "stats"],
    queryFn: () => registrationsApi.getProgramStats(programId!),
    enabled: !!programId,
  });
}

export function useUpdateRegistrationStatus(programId: string, registrationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { status: RegistrationStatus; note?: string }) =>
      registrationsApi.updateRegistrationStatus(programId, registrationId, input.status, input.note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registrations", programId] });
    },
  });
}
