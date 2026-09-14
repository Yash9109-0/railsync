"use client"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import HorizonPlanningCalendar from "@/components/HorizonPlanningCalendar"
import ScoredRequestsBoard from "@/components/ScoredRequestsBoard"

export default function AiPage() {
  return (
    <Tabs defaultValue="per-request" className="space-y-6">
      <TabsList>
        <TabsTrigger value="per-request">Per-Request AI</TabsTrigger>
        <TabsTrigger value="planning">Weekly/Monthly Planning</TabsTrigger>
      </TabsList>

      <TabsContent value="per-request" className="mt-0">
        <ScoredRequestsBoard />
      </TabsContent>

      <TabsContent value="planning" className="mt-0">
        <HorizonPlanningCalendar />
      </TabsContent>
    </Tabs>
  )
}
