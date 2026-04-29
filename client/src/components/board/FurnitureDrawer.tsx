import { FurniturePlannerPanel } from "@/pages/TableRedesignPlanner";

interface FurnitureDrawerProps {
  projectId: number;
}

export function FurnitureDrawer({ projectId }: FurnitureDrawerProps) {
  // Embed the existing furniture planner. The component already handles its own
  // queries, mutations, and grid UI — we just give it a tighter container.
  return (
    <div className="flex flex-col h-full" data-testid="drawer-furniture">
      <div className="flex-1 overflow-y-auto p-3">
        <FurniturePlannerPanel projectId={projectId} />
      </div>
    </div>
  );
}
