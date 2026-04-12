import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { miniAppApi } from "../api/client";
import { LoadingSpinner } from "../components/LoadingSpinner";

interface ApprovalsProps {
  companyId: string;
}

interface Approval {
  id: string;
  title: string;
  description: string | null;
  status: string;
  requestingAgent: { name: string } | null;
  createdAt: string;
}

export function Approvals({ companyId }: ApprovalsProps) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["mini-app", "approvals", companyId],
    queryFn: () =>
      miniAppApi.get<{ approvals: Approval[] }>(
        `/companies/${companyId}/approvals?status=pending`,
      ),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ approvalId, status }: { approvalId: string; status: "approved" | "rejected" }) =>
      miniAppApi.patch(`/approvals/${approvalId}`, { status }),
    onSuccess: () => {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
      queryClient.invalidateQueries({ queryKey: ["mini-app", "approvals"] });
    },
  });

  function handleResolve(approvalId: string, status: "approved" | "rejected") {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.showConfirm(`${status === "approved" ? "Approve" : "Reject"} this request?`, (confirmed) => {
        if (confirmed) {
          resolveMutation.mutate({ approvalId, status });
        }
      });
    } else {
      resolveMutation.mutate({ approvalId, status });
    }
  }

  if (isLoading) return <LoadingSpinner />;

  const approvals = data?.approvals ?? [];

  return (
    <div className="p-4 space-y-3">
      <h1 className="text-lg font-semibold">Approvals</h1>

      {approvals.length === 0 && (
        <div className="text-center py-12 text-[var(--tg-theme-hint-color)]">
          <div className="text-3xl mb-2">✓</div>
          <p className="text-sm">No pending approvals</p>
        </div>
      )}

      <div className="space-y-2">
        {approvals.map((approval) => (
          <div
            key={approval.id}
            className="bg-[var(--tg-theme-secondary-bg-color)] rounded-lg p-3 space-y-2"
          >
            <div>
              <h3 className="text-sm font-medium">{approval.title}</h3>
              {approval.requestingAgent && (
                <p className="text-xs text-[var(--tg-theme-hint-color)] mt-0.5">
                  Requested by {approval.requestingAgent.name}
                </p>
              )}
              {approval.description && (
                <p className="text-xs text-[var(--tg-theme-hint-color)] mt-1 line-clamp-2">
                  {approval.description}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleResolve(approval.id, "approved")}
                disabled={resolveMutation.isPending}
                className="flex-1 bg-green-600/80 text-white rounded-lg py-2 text-sm font-medium active:opacity-70 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={() => handleResolve(approval.id, "rejected")}
                disabled={resolveMutation.isPending}
                className="flex-1 bg-red-600/80 text-white rounded-lg py-2 text-sm font-medium active:opacity-70 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
