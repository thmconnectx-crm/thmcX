type LogoProps = {
  variant?: "horizontal" | "compact" | "sidebar" | "login";
  size?: "sm" | "md" | "lg";
  className?: string;
};

const logoSizeMap = {
  sm: "max-h-8",
  md: "max-h-10",
  lg: "max-h-14"
};

const iconSizeMap = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12"
};

export function Logo({ variant = "horizontal", size, className = "" }: LogoProps) {
  const resolvedSize = size ?? (variant === "login" ? "lg" : "md");

  if (variant === "compact") {
    return (
      <img
        alt="ThM ConnectX"
        className={`${iconSizeMap[resolvedSize]} object-contain ${className}`}
        src="/brand/connectx-icon.png"
      />
    );
  }

  const sidebarClasses = variant === "sidebar" ? "max-w-[190px]" : "";

  return (
    <img
      alt="ThM ConnectX"
      className={`${logoSizeMap[resolvedSize]} h-auto w-auto object-contain ${sidebarClasses} ${className}`}
      src="/brand/connectx-logo-horizontal.png"
    />
  );
}
