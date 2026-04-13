import { useTelegram } from "../providers/TelegramProvider";
import { IssueCreateFormBody } from "@/components/issue-create/IssueCreateFormBody";
import { miniAppIssueCreateClients } from "@/components/issue-create/clients";
import {
  EMPTY_ISSUE_CREATE_DEFAULTS,
  MINI_APP_ISSUE_DRAFT_KEY,
} from "@/components/issue-create/shared";

interface QuickCreateProps {
  companyId: string;
  onCreated: (issueId: string) => void;
}

export function QuickCreate({ companyId, onCreated }: QuickCreateProps) {
  const { user } = useTelegram();

  return (
    <div className="px-4 pt-2 pb-24 space-y-3">
      <h1 className="text-lg font-semibold">New issue</h1>
      <IssueCreateFormBody
        variant="mini-app"
        cacheScope="mini-app"
        companyId={companyId}
        active
        projectOrderUserId={user?.id ?? null}
        clients={miniAppIssueCreateClients}
        draftKey={MINI_APP_ISSUE_DRAFT_KEY}
        defaults={EMPTY_ISSUE_CREATE_DEFAULTS}
        expanded
        onSuccess={(issue) => {
          onCreated(issue.id);
        }}
      />
    </div>
  );
}
