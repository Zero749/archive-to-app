import { forwardRef } from "react";

const groups = [
  ["Opacity", "Gaussian Blur", "Motion Blur", "Perspective Blur", "Sharpen", "Noise", "Liquify", "Clone"],
  ["Hue, Saturation, Brightness", "Color Balance", "Curves", "Recolor"],
];

export const AdjustmentsMenu = forwardRef<HTMLDivElement, { anchorX: number }>(function AdjustmentsMenu({ anchorX }, ref) {
  const menuLeft = 50;
  return (
    <div
      ref={ref}
      style={{ left: menuLeft }}
      className="liquid-glass-menu fixed top-[50px] z-20 w-fit rounded-[10px] px-[8px] pb-[10px] pt-[14px] text-menu-text shadow-2xl"
    >
      <span
        aria-hidden
        style={{ left: anchorX - menuLeft - 9 }}
        className="liquid-glass-menu absolute top-[-9px] h-[9px] w-[18px] [clip-path:polygon(50%_0,100%_100%,0_100%)]"
      />
      <h2 className="px-[10px] text-[19px] font-semibold">Adjustments</h2>
      <div className="mt-[10px] flex flex-col gap-[14px]">
        {groups.map((g, gi) => (
          <div key={gi} className="flex flex-col rounded-[6px] bg-menu-group">
            {g.map((l) => (
              <button
                key={l}
                type="button"
                className="border-b border-menu-divider px-[10px] py-[8px] text-left text-[12px] last:border-b-0 active:text-menu-active"
              >
                {l}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
});
