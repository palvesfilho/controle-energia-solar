import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  type LucideIcon,
  Users,
  Zap,
  DollarSign,
  Building2,
  UserCheck,
  TrendingDown,
  CalendarRange,
  Gauge,
  FileBarChart,
  Activity,
} from "lucide-react";

export type StatCardColor =
  | "green" | "teal" | "emerald" | "blue" | "red"
  | "amber" | "purple" | "orange" | "indigo" | "cyan";

export interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon?: LucideIcon;
  iconName?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  color: StatCardColor;
  hideValue?: boolean;
}

const colorMap: Record<StatCardColor, string> = {
  green: "bg-green-100 text-green-700",
  teal: "bg-teal-100 text-teal-700",
  emerald: "bg-emerald-100 text-emerald-700",
  blue: "bg-blue-100 text-blue-700",
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-700",
  purple: "bg-purple-100 text-purple-700",
  orange: "bg-orange-100 text-orange-700",
  indigo: "bg-indigo-100 text-indigo-700",
  cyan: "bg-cyan-100 text-cyan-700",
};

const iconNameMap: Record<string, LucideIcon> = {
  Users,
  Zap,
  DollarSign,
  Building2,
  UserCheck,
  TrendingDown,
  CalendarRange,
  Gauge,
  FileBarChart,
  Activity,
};

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  iconName,
  trend,
  trendValue,
  color,
  hideValue,
}: StatCardProps) {
  const Icon = icon ?? iconNameMap[iconName ?? ""] ?? Activity;
  const masked = "••••••";

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">
              {hideValue ? masked : value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">
                {hideValue ? masked : subtitle}
              </p>
            )}
            {trend && trendValue && (
              <p
                className={cn(
                  "text-xs font-medium",
                  trend === "up" && "text-emerald-600",
                  trend === "down" && "text-red-600",
                  trend === "neutral" && "text-muted-foreground"
                )}
              >
                {hideValue
                  ? masked
                  : `${trend === "up" ? "+" : trend === "down" ? "" : ""}${trendValue}`}
              </p>
            )}
          </div>
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg",
              colorMap[color]
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
