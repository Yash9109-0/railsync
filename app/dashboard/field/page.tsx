"use client";
import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function FieldPage() {
  const [approved, setApproved] = useState<any[]>([]);
  const [completed, setCompleted] = useState<any[]>([]);
  const [inProgress, setInProgress] = useState<any[]>([]);
  const [logsMap, setLogsMap] = useState<Record<string, any>>({});

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const res = await fetch("/api/field-jobs");
      const data = await res.json();
      setApproved(data.approved || []);
      setInProgress(data.inProgress || []);
      setCompleted(data.completed || []);
      setLogsMap(data.logsMap || {});
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="p-6 bg-white min-h-screen space-y-8">
      <h1 className="text-2xl font-bold">Field Execution Dashboard</h1>

      <Card>
        <CardHeader>
          <CardTitle>Approved - Ready to Start</CardTitle>
        </CardHeader>
        <CardContent>
          {approved.length === 0 ? <p>No jobs</p> : approved.map((r: any) => (
            <div key={r.id} className="border p-3 mb-2 rounded">
              <p>{r.id} - {r.block_section}</p>
              <Button onClick={() => {}}>Start Work</Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-[#960DF2] border-2">
        <CardHeader>
          <CardTitle>In Progress</CardTitle>
        </CardHeader>
        <CardContent>
          {inProgress.map((r: any) => (
            <div key={r.id} className="border p-3 mb-2 rounded">
              <p>{r.id} - {r.block_section}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Completed Work</CardTitle>
        </CardHeader>
        <CardContent>
          {completed.map((r: any) => {
            const log = logsMap[r.id];
            let variance = 0;
            let beforeImg = null;
            let afterImg = null;
            if (log) {
              const planned = Number(log.planned_ft || 0);
              const actual = Number(log.actual_ft || 0);
              variance = Math.abs(actual - planned);
              beforeImg = log.before_image;
              afterImg = log.after_image;
            }
            return (
              <div key={r.id} className="border p-3 mb-3 rounded space-y-2">
                <p className="font-semibold">{r.id} - {r.block_section}</p>
                {log && (
                  <>
                    <p>Planned: {log.planned_ft} ft | Actual: {log.actual_ft} ft</p>
                    <p className={variance > 50 ? "text-red-600" : "text-green-600"}>
                      Variance: {variance} ft
                    </p>
                    <div className="flex gap-4">
                      {beforeImg && <img src={beforeImg} alt="before" className="w-32 h-32 object-cover" />}
                      {afterImg && <img src={afterImg} alt="after" className="w-32 h-32 object-cover" />}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}