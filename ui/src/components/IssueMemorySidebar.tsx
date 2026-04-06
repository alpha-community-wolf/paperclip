import { useQuery } from "@tanstack/react-query";
import { Brain, ExternalLink } from "lucide-react";
import type { Issue } from "@paperclipai/shared";
import { memoriesApi } from "../api/memories";
import { agentsApi } from "../api/agents";
import { MemoryCard } from "./MemoryCard";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { Link } from "@/lib/router";
import { useMemo } from "react";

interface Props {
  issue: Issue;
}

export function IssueMemorySidebar({ issue }: Props) {
  const { selectedCompanyId } = useCompany();

  // Fetch project-scoped memories if the issue has a project
  const { data: projectMemories } = useQuery({
    queryKey: queryKeys.memories.forIssue(selectedCompanyId!, issue.projectId ?? "__none__", "project"),
    queryFn: () =>
      memoriesApi.list(selectedCompanyId!, {
        scope: "project",
        projectId: issue.projectId!,
        status: "active",
        limit: 5,
      }),
    enabled: !!selectedCompanyId && !!issue.projectId,
  });

  // Fetch company-scoped memories
  const { data: companyMemories } = useQuery({
    queryKey: queryKeys.memories.forIssue(selectedCompanyId!, "__company__", "company"),
    queryFn: () =>
      memoriesApi.list(selectedCompanyId!, {
        scope: "company",
        status: "active",
        limit: 3,
      }),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const agentMap = useMemo(() => {
    const map = new Map<string, { name: string }>();
    agents?.forEach((a) => map.set(a.id, { name: a.name }));
    return map;
  }, [agents]);

  const projectMems = projectMemories?.memories ?? [];
  const companyMems = companyMemories?.memories ?? [];
  const totalMems = projectMems.length + companyMems.length;

  if (totalMems === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <Brain className="h-3.5 w-3.5" />
          Related Knowledge
        </h3>
        <Link
          to="/knowledge"
          className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
        >
          Browse
          <ExternalLink className="h-2.5 w-2.5" />
        </Link>
      </div>

      <div className="space-y-2">
        {projectMems.map((m) => (
          <MemoryCard key={m.id} memory={m} agentMap={agentMap} compact />
        ))}
        {companyMems.map((m) => (
          <MemoryCard key={m.id} memory={m} agentMap={agentMap} compact />
        ))}
      </div>
    </div>
  );
}
