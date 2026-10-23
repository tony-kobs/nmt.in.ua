import type { SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "name"> & {
  sprite: string;
  name: string;
  size?: number;
};

export function Icon({ sprite, name, size = 24, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <use href={`/icons/${sprite}.svg#icon-${name}`} />
    </svg>
  );
}
