import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ticketApi from "./api";

export function useTicketConfig(programId: string) {
  return useQuery({
    queryKey: ["ticket-config", programId],
    queryFn: () => ticketApi.getTicketConfig(programId),
    enabled: !!programId,
  });
}

export function useUpdateTicketConfig(programId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: ticketApi.TicketConfig) => ticketApi.updateTicketConfig(programId, config),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ticket-config", programId] }),
  });
}
