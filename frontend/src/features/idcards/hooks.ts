import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as idCardApi from "./api";

export function useIdCardConfig(programId: string) {
  return useQuery({
    queryKey: ["id-card-config", programId],
    queryFn: () => idCardApi.getIdCardConfig(programId),
    enabled: !!programId,
  });
}

export function useUpdateIdCardConfig(programId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: idCardApi.IdCardConfig) => idCardApi.updateIdCardConfig(programId, config),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["id-card-config", programId] }),
  });
}
