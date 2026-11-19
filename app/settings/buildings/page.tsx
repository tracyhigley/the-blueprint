import { getBuildings } from "@/lib/categories";
import { saveBuildingConfig } from "@/lib/plan-actions";
import { BoxesEditor } from "@/components/boxes-editor";
import { BuildingStrategiesEditor } from "@/components/building-strategies-editor";
import { SettingsSubnav } from "@/components/settings-subnav";

export default async function BuildingsSettingsPage() {
  const initial = await getBuildings();

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-8 md:px-10">
      <div className="eyebrow">— Settings · buildings —</div>
      <h1 className="serif-h mt-2 text-[36px] leading-tight md:text-[40px]">
        The campus on your Master Project Plans.
      </h1>

      <div className="mt-3">
        <SettingsSubnav />
      </div>

      <p className="text-ink-dim mt-6">
        Buildings are the big, ongoing areas of your life — each one holds
        building projects on the Master Project Plans, and tags what you file
        from Field Notes, Maint Tasks, and Calendar.
      </p>
      <p className="text-ink-dim mt-1 text-[13px]">
        The <strong>label</strong> is the building&apos;s name. The{" "}
        <strong>meta</strong> is an optional one-liner shown under it (what this
        building is about). The <strong>key</strong> auto-derives from the label
        as you type.
      </p>

      <BoxesEditor
        initial={initial}
        onSave={saveBuildingConfig}
        singular="BUILDING"
        plural="BUILDINGS"
        labelPlaceholder="Name (e.g. The Library)"
        metaPlaceholder="What it's about (optional)"
      />

      <h2 className="serif-h mt-12 text-[22px]">Strategies (optional)</h2>
      <p className="text-ink-dim mt-1 text-[13px]">
        Give a building strategies and its Idea projects sort into those groups,
        collapsed until you open one. Leave a building empty and it looks the
        way it always has. Save the buildings above first if you just added one.
      </p>
      <div className="mt-4 space-y-3">
        {initial.map((b) => (
          <BuildingStrategiesEditor
            key={b.key}
            buildingKey={b.key}
            buildingLabel={b.label}
            initial={b.strategies ?? []}
          />
        ))}
      </div>
    </div>
  );
}
