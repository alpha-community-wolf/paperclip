import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Skill, AgentSkillAssignment } from "@paperclipai/shared";
import { skillsApi } from "../api/skills";
import { queryKeys } from "../lib/queryKeys";
import { Lock, ToggleLeft, ToggleRight } from "lucide-react";

function TierBadge({ tier, optional }: { tier: string; optional?: boolean }) {
  const cls =
    tier === "built_in"
      ? optional
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
        : "bg-muted text-muted-foreground"
      : tier === "company"
        ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
        : "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300";
  const label =
    tier === "built_in"
      ? optional ? "Optional" : "Built-in"
      : tier === "company" ? "Company" : "Agent";
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

function ToggleSkillRow({
  skill,
  isAssigned,
  toggling,
  onToggle,
  badgeOptional,
}: {
  skill: Skill;
  isAssigned: boolean;
  toggling: boolean;
  onToggle: (skillId: string, assigned: boolean) => void;
  badgeOptional?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 text-xs">
      <button
        type="button"
        disabled={toggling}
        onClick={() => onToggle(skill.id, isAssigned)}
        className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        {isAssigned ? (
          <ToggleRight className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        ) : (
          <ToggleLeft className="h-4 w-4" />
        )}
      </button>
      <span className="font-medium">{skill.name}</span>
      {skill.description && (
        <span className="text-muted-foreground truncate">{skill.description}</span>
      )}
      <TierBadge tier={skill.tier} optional={badgeOptional} />
    </div>
  );
}

interface AgentSkillsSectionProps {
  agentId: string;
  companyId: string;
}

export function AgentSkillsSection({ agentId, companyId }: AgentSkillsSectionProps) {
  const queryClient = useQueryClient();

  const { data: companySkills } = useQuery({
    queryKey: queryKeys.skills.list(companyId),
    queryFn: () => skillsApi.list(companyId),
    enabled: !!companyId,
  });

  const { data: agentResolvedSkills } = useQuery({
    queryKey: queryKeys.skills.forAgent(agentId),
    queryFn: () => skillsApi.listForAgent(agentId, companyId),
    enabled: !!agentId && !!companyId,
  });

  const { data: assignments } = useQuery({
    queryKey: queryKeys.skills.assignmentsForAgent(agentId),
    queryFn: () => skillsApi.listAssignmentsForAgent(agentId, companyId),
    enabled: !!agentId,
  });

  const assignedSkillIds = useMemo(
    () => new Set((assignments ?? []).map((a: AgentSkillAssignment) => a.skillId)),
    [assignments],
  );

  const invalidateSkillQueries = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.skills.assignmentsForAgent(agentId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.skills.forAgent(agentId) });
  };

  const assignMutation = useMutation({
    mutationFn: ({ skillId }: { skillId: string }) => skillsApi.assignToAgent(agentId, skillId, companyId),
    onSuccess: invalidateSkillQueries,
  });

  const unassignMutation = useMutation({
    mutationFn: ({ skillId }: { skillId: string }) => skillsApi.unassignFromAgent(agentId, skillId, companyId),
    onSuccess: invalidateSkillQueries,
  });

  const toggling = assignMutation.isPending || unassignMutation.isPending;

  const handleToggle = (skillId: string, currentlyAssigned: boolean) => {
    if (currentlyAssigned) {
      unassignMutation.mutate({ skillId });
    } else {
      assignMutation.mutate({ skillId });
    }
  };

  const allCompany = companySkills ?? [];
  const coreBuiltIn = allCompany.filter((s: Skill) => s.tier === "built_in" && s.defaultEnabled);
  const optionalBuiltIn = allCompany.filter((s: Skill) => s.tier === "built_in" && !s.defaultEnabled);
  const companyTierSkills = allCompany.filter((s: Skill) => s.tier === "company");
  const toggleableSkills = [...optionalBuiltIn, ...companyTierSkills];

  const allResolved = agentResolvedSkills ?? [];
  const agentTierSkills = allResolved.filter((s: Skill) => s.tier === "agent");

  if (!companySkills && !agentResolvedSkills) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Skills</h3>

      {coreBuiltIn.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground font-medium mb-1">Core (always active)</div>
          {coreBuiltIn.map((skill: Skill) => (
            <div key={skill.id} className="flex items-center gap-2 py-1 px-2 rounded bg-muted/50 text-xs">
              <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="font-medium">{skill.name}</span>
              {skill.description && (
                <span className="text-muted-foreground truncate">{skill.description}</span>
              )}
              <TierBadge tier={skill.tier} />
            </div>
          ))}
        </div>
      )}

      {toggleableSkills.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground font-medium mb-1">Available skills</div>
          {toggleableSkills.map((skill: Skill) => (
            <ToggleSkillRow
              key={skill.id}
              skill={skill}
              isAssigned={assignedSkillIds.has(skill.id)}
              toggling={toggling}
              onToggle={handleToggle}
              badgeOptional={skill.tier === "built_in"}
            />
          ))}
        </div>
      )}

      {agentTierSkills.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground font-medium mb-1">Agent-specific skills</div>
          {agentTierSkills.map((skill: Skill) => (
            <div key={skill.id} className="flex items-center gap-2 py-1 px-2 rounded bg-muted/50 text-xs">
              <span className="font-medium">{skill.name}</span>
              {skill.description && (
                <span className="text-muted-foreground truncate">{skill.description}</span>
              )}
              <TierBadge tier={skill.tier} />
            </div>
          ))}
        </div>
      )}

      {coreBuiltIn.length === 0 && toggleableSkills.length === 0 && agentTierSkills.length === 0 && (
        <p className="text-xs text-muted-foreground">No skills configured for this company.</p>
      )}
    </div>
  );
}
