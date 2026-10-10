import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as programsApi from "./api";

export const programKeys = {
  all: ["programs"] as const,
  list: (params: programsApi.ListProgramsParams) => ["programs", "list", params] as const,
  detail: (id: string) => ["programs", "detail", id] as const,
};

export function useProgramsList(params: programsApi.ListProgramsParams) {
  return useQuery({
    queryKey: programKeys.list(params),
    queryFn: () => programsApi.listPrograms(params),
  });
}

export function useProgram(programId: string | undefined) {
  return useQuery({
    queryKey: programKeys.detail(programId ?? ""),
    queryFn: () => programsApi.getProgram(programId!),
    enabled: !!programId,
  });
}

function useInvalidatePrograms() {
  const queryClient = useQueryClient();
  return (programId?: string) => {
    queryClient.invalidateQueries({ queryKey: programKeys.all });
    if (programId) queryClient.invalidateQueries({ queryKey: programKeys.detail(programId) });
  };
}

export function useCreateProgram() {
  const invalidate = useInvalidatePrograms();
  return useMutation({
    mutationFn: programsApi.createProgram,
    onSuccess: () => invalidate(),
  });
}

export function useUpdateProgram(programId: string) {
  const invalidate = useInvalidatePrograms();
  return useMutation({
    mutationFn: (input: Parameters<typeof programsApi.updateProgram>[1]) => programsApi.updateProgram(programId, input),
    onSuccess: () => invalidate(programId),
  });
}

export function useDeleteProgram() {
  const invalidate = useInvalidatePrograms();
  return useMutation({
    mutationFn: programsApi.deleteProgram,
    onSuccess: () => invalidate(),
  });
}

export function useProgramAction(
  action: (programId: string) => ReturnType<typeof programsApi.publishProgram>,
) {
  const invalidate = useInvalidatePrograms();
  return useMutation({
    mutationFn: action,
    onSuccess: (_data, programId) => invalidate(programId),
  });
}

export function useDuplicateProgram() {
  const invalidate = useInvalidatePrograms();
  return useMutation({
    mutationFn: programsApi.duplicateProgram,
    onSuccess: () => invalidate(),
  });
}
