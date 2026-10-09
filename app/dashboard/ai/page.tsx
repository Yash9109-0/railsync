"use client"

import { useState } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { TabTransition } from "@/components/ui/tab-transition"
import HorizonPlanningCalendar from "@/components/HorizonPlanningCalendar"
import ScoredRequestsBoard from "@/components/ScoredRequestsBoard"

export default function AiPage() {
  const [activeTab, setActiveTab] = useState("per-request")

  return (
    <div className="w-full">
      <Tabs
        defaultValue="per-request"
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList>
          <TabsTrigger
            value="per-request"
            className="transition-all duration-200"
          >
            Per-Request AI
          </TabsTrigger>
          <TabsTrigger
            value="planning"
            data-tour="planning-tab"
            className="transition-all duration-200"
          >
            Weekly/Monthly Planning
          </TabsTrigger>
        </TabsList>

        <TabTransition activeKey={activeTab}>
          <div>
            {activeTab === "per-request" && (
              <TabsContent value="per-request" className="mt-0">
                <ScoredRequestsBoard />
              </TabsContent>
            )}

            {activeTab === "planning" && (
              <TabsContent
                value="planning"
                className="mt-0"
                data-tour="planning-tab-content"
              >
                <HorizonPlanningCalendar />
              </TabsContent>
            )}
          </div>
        </TabTransition>
      </Tabs>
    </div>
  )
}
