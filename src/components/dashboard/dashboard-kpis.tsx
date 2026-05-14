"use client";

import { useState } from "react";
import { StatCard, type StatCardColor } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";

export interface KpiCardData {
  title: string;
  value: string;
  subtitle?: string;
  iconName: string;
  color: StatCardColor;
}

export interface KpiGroup {
  title: string;
  cards: KpiCardData[];
}

interface DashboardKpisProps {
  groups: KpiGroup[];
}

export function DashboardKpis({ groups }: DashboardKpisProps) {
  const [valuesVisible, setValuesVisible] = useState(true);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Indicadores
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setValuesVisible((v) => !v)}
          className="gap-2"
        >
          {valuesVisible ? (
            <>
              <EyeOff className="h-4 w-4" />
              Ocultar valores
            </>
          ) : (
            <>
              <Eye className="h-4 w-4" />
              Mostrar valores
            </>
          )}
        </Button>
      </div>

      <div className="space-y-6">
        {groups.map((group, idx) => (
          <section key={group.title} className="space-y-3">
            {idx > 0 && <hr className="border-t border-gray-200" />}
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
              {group.title}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.cards.map((card) => (
                <StatCard
                  key={card.title}
                  title={card.title}
                  value={card.value}
                  subtitle={card.subtitle}
                  iconName={card.iconName}
                  color={card.color}
                  hideValue={!valuesVisible}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
