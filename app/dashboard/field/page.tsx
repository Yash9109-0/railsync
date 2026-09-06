'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export default function FieldPage() {
  const [approved, setApproved] = useState<any[]>([])
  const [inProgress, setInProgress] = useState<any[]>([])
  const [completed, setCompleted] = useState<any[]>([])
  const [logsMap, setLogsMap] = useState<Record<string, any>>({})
  const [selected, setSelected] = useState<any>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [beforeFile, setBeforeFile] = useState<File | null>(null)
  const [afterFile, setAfterFile] = useState<File | null>(null)
  const [actualEnd, setActualEnd] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')

  const fetchAll = async () => {
    const { data: reqData } = await supabase.from('block_requests').select('*').order('created_at', { ascending: false })
    const { data: logData } = await supabase.from('execution_logs').select('*')
    if (reqData) {
      setApproved(reqData.filter((r: any) => r.status === 'approved'))
      setInProgress(reqData.filter((r: any) => r.status === 'in_progress'))
      const exec = reqData.filter((r: any) => r.status === 'executed')
      const map: Record<string, any> = {}
      if (logData) {
        for (const log of logData) {
          if (log.status === 'completed') map[log.block_request_id] = log
        }
      }
      setLogsMap(map)
      setCompleted(exec)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const handleStart = async (req: any) => {
    setLoading(true)
    try {
      await supabase.from('execution_logs').insert({ block_request_id: req.id, actual_start: new Date().toISOString(), status: 'in_progress' })
      await supabase.from('block_requests').update({ status: 'in_progress' }).eq('id', req.id)
      toast.success('Work started')
      fetchAll()
    } catch (e: any) { toast.error(e.message) }
    setLoading(false)
  }

  const handleUseLocation = () => {
    navigator.geolocation.getCurrentPosition((pos) => {
      setLat(pos.coords.latitude.toString())
      setLng(pos.coords.longitude.toString())
      toast.success('Location captured')
    }, () => toast.error('Failed to get location'))
  }

  const uploadImage = async (file: File) => {
    const fileName = `${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('execution-images').upload(fileName, file)
    if (error) throw error
    const { data } = supabase.storage.from('execution-images').getPublicUrl(fileName)
    return data.publicUrl
  }

  const handleComplete = async () => {
    if (!selected) return
    setLoading(true)
    try {
      let beforeUrl = '', afterUrl = ''
      if (beforeFile) beforeUrl = await uploadImage(beforeFile)
      if (afterFile) afterUrl = await uploadImage(afterFile)
      const endTime = actualEnd? new Date(actualEnd).toISOString() : new Date().toISOString()
      const { data: logs } = await supabase.from('execution_logs').select('*').eq('block_request_id', selected.id).eq('status', 'in_progress').order('actual_start', { ascending: false }).limit(1)
      if (logs && logs[0]) {
        await supabase.from('execution_logs').update({ before_image_url: beforeUrl, after_image_url: afterUrl, actual_end: endTime, geo_lat: lat? parseFloat(lat) : null, geo_lng: lng? parseFloat(lng) : null, status: 'completed' }).eq('id', logs[0].id)
      }
      await supabase.from('block_requests').update({ status: 'executed' }).eq('id', selected.id)
      fetch('/api/update-stats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ segment_id: selected.segment_id, work_type: selected.work_type }) }).catch(err => console.error(err))
      toast.success('Work completed')
      setOpen(false)
      setSelected(null)
      setBeforeFile(null)
      setAfterFile(null)
      fetchAll()
    } catch (e: any) { toast.error(e.message) }
    setLoading(false)
  }

  return (
    <div className="p-6 bg-white min-h-screen space-y-8">
      <h1 className="text-2xl font-bold">Field Execution Dashboard</h1>
      <Card><CardHeader><CardTitle>Approved - Ready to Start</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><th className="text-left p-2">ID</th><th className="text-left p-2">Segment</th><th className="text-left p-2">Work</th><th className="text-left p-2">Duration</th><th className="text-left p-2">Action</th></tr></thead><tbody>{approved.map((r: any) => (<tr key={r.id} className="border-b"><td className="p-2">{r.id.slice(0,8)}</td><td className="p-2">{r.segment_id}</td><td className="p-2">{r.work_type}</td><td className="p-2">{r.requested_duration_mins} m</td><td className="p-2"><Button onClick={() => handleStart(r)} disabled={loading} className="bg-[#960DF2] min-h-[44px]">Start Work</Button></td></tr>))}</tbody></table>{approved.length === 0 && <p className="text-gray-500 p-4">No approved requests</p>}</div></CardContent></Card>
      <Card className="border-[#960DF2] border-2"><CardHeader><CardTitle>In Progress</CardTitle></CardHeader><CardContent><table className="w-full text-sm"><thead><tr className="border-b"><th className="text-left p-2">ID</th><th className="text-left p-2">Segment</th><th className="text-left p-2">Action</th></tr></thead><tbody>{inProgress.map((r: any) => (<tr key={r.id} className="border-b"><td className="p-2">{r.id.slice(0,8)}</td><td className="p-2">{r.segment_id}</td><td className="p-2"><Button onClick={() => { setSelected(r); setActualEnd(new Date().toISOString().slice(0,16)); setOpen(true)}} className="bg-green-600 min-h-[44px]">Complete Work</Button></td></tr>))}</tbody></table>{inProgress.length === 0 && <p className="text-gray-500 p-4">No work in progress</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Completed Work</CardTitle></CardHeader><CardContent><table className="w-full text-sm"><thead><tr className="border-b"><th className="text-left p-2">ID</th><th className="text-left p-2">Variance</th><th className="text-left p-2">Before</th><th className="text-left p-2">After</th></tr></thead><tbody>{completed.map((r: any) => { const log = logsMap[r.id]; let variance = 0; if (log?.actual_start && log?.actual_end) { const mins = (new Date(log.actual_end).getTime() - new Date(log.actual_start).getTime())/60000; variance = Math.round(mins - r.requested_duration_mins) } return (<tr key={r.id} className="border-b"><td className="p-2">{r.id.slice(0,8)}</td><td className="p-2"><span className={`px-2 py-1 rounded ${variance>0?'bg-red-100 text-red-700':'bg-green-100 text-green-700'}`}>{variance} mins</span></td><td className="p-2">{log?.before_image_url?<a href={log.before_image_url} target="_blank"><img src={log.before_image_url} className="w-12 h-12 object-cover rounded"/></a>:'-'}</td><td className="p-2">{log?.after_image_url?<a href={log.after_image_url} target="_blank"><img src={log.after_image_url} className="w-12 h-12 object-cover rounded"/></a>:'-'}</td></tr>)})}</tbody></table></CardContent></Card>
      <Dialog open={open} onOpenChange={setOpen}><DialogContent className="bg-white max-w-md"><DialogHeader><DialogTitle>Complete Work</DialogTitle></DialogHeader><div className="space-y-4"><div><label className="text-sm font-medium">Site Before Work</label><Input type="file" accept="image/*" onChange={e => setBeforeFile(e.target.files?.[0]||null)} className="min-h-[44px]"/></div><div><label className="text-sm font-medium">Site After Work</label><Input type="file" accept="image/*" onChange={e => setAfterFile(e.target.files?.[0]||null)} className="min-h-[44px]"/></div><div><label className="text-sm font-medium">Actual End Time</label><Input type="datetime-local" value={actualEnd} onChange={e => setActualEnd(e.target.value)} className="min-h-[44px]"/></div><div className="flex gap-2"><div className="flex-1"><label className="text-sm font-medium">Lat</label><Input value={lat} onChange={e => setLat(e.target.value)}/></div><div className="flex-1"><label className="text-sm font-medium">Lng</label><Input value={lng} onChange={e => setLng(e.target.value)}/></div></div><Button type="button" variant="outline" onClick={handleUseLocation} className="w-full min-h-[44px]">Use My Location</Button><Button onClick={handleComplete} disabled={loading} className="w-full bg-[#960DF2] min-h-[44px]">{loading?'Uploading...':'Submit Completion'}</Button></div></DialogContent></Dialog>
    </div>
  )
}
