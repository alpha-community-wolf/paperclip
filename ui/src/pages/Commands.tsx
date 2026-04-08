import { useEffect } from "react";
import { SidebarCommands } from "../components/SidebarCommands";
import { useBreadcrumbs } from "../context/BreadcrumbContext";

export function Commands() {
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Commands" }]);
  }, [setBreadcrumbs]);

  return <SidebarCommands />;
}
