import { Link } from "@/lib/router";
import { Menu, Maximize2, Minimize2, PanelLeft, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useSidebar } from "../context/SidebarContext";
import { useAgentsSidebar } from "../context/AgentsSidebarContext";
import { useContentWidth, ZOOM_LEVELS } from "./Layout";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Fragment } from "react";

function ZoomControl() {
  const { zoom, cycleZoom } = useContentWidth();

  return (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground/50 hover:text-foreground shrink-0 tabular-nums w-auto px-1.5"
          onClick={cycleZoom}
          aria-label={`Zoom: ${zoom}%`}
        >
          <span className="text-[10px] font-medium" style={{ fontFamily: "var(--font-family-mono)" }}>
            {zoom}%
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        <p>Zoom ({ZOOM_LEVELS.join(" / ")}%)</p>
      </TooltipContent>
    </Tooltip>
  );
}

function ContentWidthToggle() {
  const { contentWidth, toggleContentWidth } = useContentWidth();
  const isFocused = contentWidth === "focused";

  return (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground/50 hover:text-foreground shrink-0"
          onClick={toggleContentWidth}
          aria-label={isFocused ? "Expand to full width" : "Focus content"}
        >
          {isFocused ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        <p>{isFocused ? "Full width" : "Focused width"}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function ViewControls() {
  const { agentsSidebarOpen, toggleAgentsSidebar } = useAgentsSidebar();

  return (
    <div className="flex items-center gap-0.5 ml-auto shrink-0">
      <Tooltip delayDuration={400}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground/50 hover:text-foreground shrink-0"
            onClick={toggleAgentsSidebar}
            aria-label={agentsSidebarOpen ? "Hide agents sidebar" : "Show agents sidebar"}
          >
            {agentsSidebarOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={4}>
          <p>{agentsSidebarOpen ? "Hide agents panel" : "Show agents panel"} (Cmd/Ctrl+Shift+A)</p>
        </TooltipContent>
      </Tooltip>
      <ZoomControl />
      <ContentWidthToggle />
    </div>
  );
}

export function BreadcrumbBar() {
  const { breadcrumbs } = useBreadcrumbs();
  const { sidebarOpen, toggleSidebar, isMobile } = useSidebar();

  if (breadcrumbs.length === 0) return null;

  const menuButton = isMobile ? (
    <Button
      variant="ghost"
      size="icon-sm"
      className="mr-2 shrink-0"
      onClick={toggleSidebar}
      aria-label="Open sidebar"
    >
      <Menu className="h-5 w-5" />
    </Button>
  ) : !sidebarOpen ? (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="mr-2 shrink-0 text-muted-foreground"
          onClick={toggleSidebar}
          aria-label="Expand sidebar"
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        <p>Expand sidebar</p>
      </TooltipContent>
    </Tooltip>
  ) : null;

  if (breadcrumbs.length === 1) {
    return (
      <div className="border-b border-border px-4 md:px-6 h-12 shrink-0 flex items-center min-w-0 overflow-hidden">
        {menuButton}
        <h1
          className="text-sm font-semibold uppercase tracking-wider truncate"
          style={{ fontFamily: "var(--font-family-display)" }}
        >
          {breadcrumbs[0].label}
        </h1>
        {!isMobile && <ViewControls />}
      </div>
    );
  }

  return (
    <div className="border-b border-border px-4 md:px-6 h-12 shrink-0 flex items-center min-w-0 overflow-hidden">
      {menuButton}
      <Breadcrumb className="min-w-0 overflow-hidden">
        <BreadcrumbList className="flex-nowrap">
          {breadcrumbs.map((crumb, i) => {
            const isLast = i === breadcrumbs.length - 1;
            return (
              <Fragment key={i}>
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem className={isLast ? "min-w-0" : "shrink-0"}>
                  {isLast || !crumb.href ? (
                    <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link to={crumb.href}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      {!isMobile && <ViewControls />}
    </div>
  );
}
