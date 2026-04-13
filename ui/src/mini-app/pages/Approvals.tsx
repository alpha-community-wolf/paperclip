import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X, CheckCircle } from "lucide-react";
import { miniAppApi } from "../api/client";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
        <div className="text-center py-12 text-muted-foreground">
          <CheckCircle className="size-8 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm">No pending approvals</p>
        </div>
      )}

      <div className="space-y-2">
        {approvals.map((approval) => (
          <Card key={approval.id} className="py-3 gap-0">
            <CardContent className="px-3 py-0 space-y-2">
              <div>
                <h3 className="text-sm font-medium">{approval.title}</h3>
                {approval.requestingAgent && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Requested by {approval.requestingAgent.name}
                  </p>
                )}
                {approval.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {approval.description}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="default"
                  size="sm"
                  className="flex-1"
                  onClick={() => handleResolve(approval.id, "approved")}
                  disabled={resolveMutation.isPending}
                >
                  <Check className="size-4" />
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1"
                  onClick={() => handleResolve(approval.id, "rejected")}
                  disabled={resolveMutation.isPending}
                >
                  <X className="size-4" />
                  Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
