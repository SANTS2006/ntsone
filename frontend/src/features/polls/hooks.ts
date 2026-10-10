import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as pollsApi from "./api";

export const pollKeys = {
  all: ["polls"] as const,
  list: (params: pollsApi.ListPollsParams) => ["polls", "list", params] as const,
  detail: (id: string) => ["polls", "detail", id] as const,
  ballot: (id: string) => ["polls", "ballot", id] as const,
  results: (id: string) => ["polls", "results", id] as const,
  voters: (id: string, params: object) => ["polls", "voters", id, params] as const,
  share: (id: string) => ["polls", "share", id] as const,
};

export function usePollsList(params: pollsApi.ListPollsParams) {
  return useQuery({ queryKey: pollKeys.list(params), queryFn: () => pollsApi.listPolls(params) });
}

export function usePoll(pollId: string | undefined) {
  return useQuery({ queryKey: pollKeys.detail(pollId ?? ""), queryFn: () => pollsApi.getPoll(pollId!), enabled: !!pollId });
}

export function useBallot(pollId: string) {
  return useQuery({ queryKey: pollKeys.ballot(pollId), queryFn: () => pollsApi.getBallot(pollId) });
}

/** Live results: refreshed every few seconds while the page is open. */
export function usePollResults(pollId: string, live = true) {
  return useQuery({
    queryKey: pollKeys.results(pollId),
    queryFn: () => pollsApi.getPollResults(pollId),
    refetchInterval: live ? 5000 : false,
  });
}

export function usePollShareInfo(pollId: string) {
  return useQuery({ queryKey: pollKeys.share(pollId), queryFn: () => pollsApi.getPollShareInfo(pollId) });
}

/** Refreshes everything cached about polls after a change. */
export function useInvalidatePolls() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: pollKeys.all });
}

export function useUpdatePoll(pollId: string) {
  const invalidate = useInvalidatePolls();
  return useMutation({
    mutationFn: (input: Parameters<typeof pollsApi.updatePoll>[1]) => pollsApi.updatePoll(pollId, input),
    onSuccess: invalidate,
  });
}
